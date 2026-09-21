(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const validated = new Map();

  function factors() {
    return [...($('riskFactor')?.options || [])].map((option) => ({ id: option.value, label: option.textContent.replace(/^✓\s*/, '') }));
  }

  function renderCoverage() {
    const host = $('riskCoverage');
    if (!host) return;
    const all = factors();
    host.innerHTML = `<div class="riskCoverageHead"><b>Points vérifiés</b><span>${validated.size}/${all.length}</span></div><div class="riskMarkers">${all.map((factor) => `<span class="${validated.has(factor.id) ? 'checked' : ''}"><i>${validated.has(factor.id) ? '✓' : '○'}</i>${factor.label}</span>`).join('')}</div>`;
    [...$('riskFactor').options].forEach((option) => {
      const label = option.textContent.replace(/^✓\s*/, '');
      option.textContent = `${validated.has(option.value) ? '✓ ' : ''}${label}`;
    });
    const marker = $('riskFactorMarker');
    if (marker) {
      const checked = validated.has($('riskFactor').value);
      marker.className = `riskFactorMarker ${checked ? 'checked' : ''}`;
      marker.textContent = checked ? '✓ Validé' : '○ À vérifier';
    }
  }

  function updateDecisionFromCoverage() {
    const box = $('decisionStatus');
    if (!box) return;
    const surface = Number($('surface')?.value || 0);
    const orientation = $('orientation')?.value;
    const tri = Number(($('irr')?.textContent || '').replace(',', '.').replace(/[^0-9.-]/g, ''));
    const scores = [...validated.values()];
    const highest = scores.length ? Math.max(...scores) : 0;
    const total = factors().length;
    let state = 'pending', title = 'Données insuffisantes', reason = 'Mesurez la toiture, renseignez l’orientation et vérifiez les risques.';
    if (highest >= 100) {
      state = 'nogo'; title = 'NO-GO provisoire'; reason = 'Un risque bloquant a été documenté. Il doit être traité avant une nouvelle décision.';
    } else if (!surface || !orientation) {
      reason = !surface ? 'Surface exploitable à mesurer ou confirmer.' : 'Orientation de la toiture à renseigner.';
    } else if (validated.size < total) {
      state = validated.size ? 'conditional' : 'pending';
      title = validated.size ? 'Qualification en cours' : 'Données insuffisantes';
      reason = `${validated.size}/${total} points vérifiés. Il reste ${total - validated.size} point${total - validated.size > 1 ? 's' : ''} à contrôler.`;
    } else if (!Number.isNaN(tri) && tri < 7) {
      title = 'À analyser'; reason = 'Tous les points sont vérifiés, mais le TRI investisseur reste inférieur au seuil de travail de 7 %.';
    } else if (highest >= 75) {
      state = 'conditional'; title = 'GO conditionnel'; reason = `Les ${total} points sont vérifiés, avec au moins un risque important à traiter avant décision définitive.`;
    } else {
      state = 'conditional'; title = 'GO proposé'; reason = `Les ${total} points de risque sont vérifiés. Le dossier peut passer à la validation finale.`;
    }
    box.className = `decisionStatus ${state}`;
    box.innerHTML = `<small>Statut de qualification</small><strong>${title}</strong><span><b>Prochaine action :</b> ${reason}</span>`;
  }

  function boot() {
    const risk = $('audit-risk');
    const button = $('addRisk');
    if (!risk || !button) return;
    const obsolete = [...risk.querySelectorAll('p.fine')].find((node) => /Obligatoire pour une saisie manuelle/i.test(node.textContent));
    obsolete?.remove();
    const coverage = document.createElement('div');
    coverage.id = 'riskCoverage';
    coverage.className = 'riskCoverage';
    button.insertAdjacentElement('beforebegin', coverage);
    const factorLabel = $('riskFactor').closest('label');
    const marker = document.createElement('span');
    marker.id = 'riskFactorMarker';
    marker.className = 'riskFactorMarker';
    marker.textContent = '○ À vérifier';
    factorLabel?.insertBefore(marker, $('riskFactor'));
    const style = document.createElement('style');
    style.textContent = '.riskFactorMarker{float:right;margin:0 0 4px 8px;padding:3px 8px;border-radius:99px;background:#fff2c9;color:#6b5000;font-size:12px;font-weight:800}.riskFactorMarker.checked{background:#dff0e5;color:#08734c}.riskCoverage{clear:both;margin:14px 0;padding:12px;border:1px solid #cfe0d5;border-radius:9px;background:#f7faf8}.riskCoverageHead{display:flex;justify-content:space-between;gap:10px;margin-bottom:9px}.riskCoverageHead span{font-weight:800;color:#08734c}.riskMarkers{display:flex;flex-wrap:wrap;gap:7px}.riskMarkers span{display:flex;align-items:center;gap:5px;padding:5px 8px;border-radius:99px;background:#fff;border:1px solid #d5e4d8;font-size:12px;color:#587469}.riskMarkers span.checked{background:#dff0e5;border-color:#54a378;color:#073d2a}.riskMarkers i{font-style:normal;font-weight:900}.decisionStatus span{display:block!important;background:transparent!important;color:inherit!important;border-left:3px solid currentColor!important;padding:7px 8px!important}.decisionStatus strong,.decisionStatus small{color:inherit!important}';
    document.head.appendChild(style);
    renderCoverage();
    $('riskFactor').addEventListener('change', renderCoverage);
    window.updateDecision = updateDecisionFromCoverage;
    button.addEventListener('click', () => {
      validated.set($('riskFactor').value, Number($('riskObservation').value || 0));
      $('dashRiskCount').textContent = `${validated.size}/${factors().length} points vérifiés`;
      renderCoverage();
      updateDecisionFromCoverage();
    });
    updateDecisionFromCoverage();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
}());
