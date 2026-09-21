(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const coordinates = { Muret: [43.49001, 1.34247], Lyon: [45.764, 4.835], Lille: [50.63, 3.057] };
  let performanceRequest = null;

  async function ensurePerformanceValue() {
    const output = $('dashPerformance');
    if (!output || /\d[\d\s]*\s*kWh\/kWc\/an/i.test(output.textContent)) return;
    const address = $('dashAddress')?.textContent || '';
    const point = Object.entries(coordinates).find(([city]) => address.includes(city))?.[1] || coordinates.Muret;
    if (performanceRequest) return performanceRequest;
    performanceRequest = (async () => { try {
      const response = await fetch(`https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=${point[0]}&lon=${point[1]}&peakpower=1&loss=14&angle=15&aspect=0&outputformat=json`);
      if (!response.ok) return;
      const payload = await response.json();
      const value = payload.outputs?.totals?.fixed?.E_y;
      if (!Number.isFinite(value)) return;
      output.textContent = `${Math.round(value).toLocaleString('fr-FR')} kWh/kWc/an`;
      const note = output.nextElementSibling;
      if (note) note.textContent = 'Référence PVGIS provisoire · orientation Sud et pente 15° tant que la toiture n’est pas qualifiée.';
    } catch { /* The existing PVGIS status remains visible. */ }
    finally { performanceRequest = null; } })();
    return performanceRequest;
  }

  function installProfileTooltip() {
    const bars = document.querySelector('.decisionBottom .bars');
    if (!bars || document.getElementById('dashboardProfileTooltip')) return;
    bars.style.position = 'relative';
    const tooltip = document.createElement('div');
    tooltip.id = 'dashboardProfileTooltip';
    tooltip.className = 'dashboardProfileTooltip';
    bars.appendChild(tooltip);
    [...bars.querySelectorAll('i')].forEach((bar, index) => {
      bar.tabIndex = 0;
      const show = () => {
        const label = bar.title || `Mois ${index + 1} · valeur en cours de calcul`;
        tooltip.textContent = label.replace(/^Mois\s+(\d+)/, (_, month) => ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'][Number(month) - 1]);
        tooltip.style.display = 'block';
        tooltip.style.left = `${bar.offsetLeft + bar.offsetWidth / 2}px`;
        tooltip.style.top = `${Math.max(0, bar.offsetTop - 8)}px`;
      };
      const hide = () => { tooltip.style.display = 'none'; };
      bar.addEventListener('mouseenter', show);
      bar.addEventListener('mouseleave', hide);
      bar.addEventListener('focus', show);
      bar.addEventListener('blur', hide);
    });
  }

  function clarifyDecision() {
    const box = $('decisionStatus');
    if (!box || box.dataset.clarified === box.textContent) return;
    const title = box.querySelector('strong');
    const reason = box.querySelector('span');
    if (!title || !reason) return;
    const originalTitle = title.textContent.trim();
    const originalReason = reason.textContent.trim();
    const readableTitle = originalTitle === 'À compléter' ? 'Données insuffisantes' : originalTitle;
    box.innerHTML = `<small>Statut de qualification</small><strong>${readableTitle}</strong><span><b>Prochaine action :</b> ${originalReason}</span>`;
    box.dataset.clarified = box.textContent;
  }

  function boot() {
    const style = document.createElement('style');
    style.textContent = '.dashboardProfileTooltip{position:absolute;z-index:20;display:none;transform:translate(-50%,-100%);white-space:nowrap;background:#fff;color:#073d2a;border-radius:6px;padding:6px 8px;font-size:12px;box-shadow:0 3px 12px #0005}.decisionStatus>small{font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.75}.decisionStatus span b{display:inline;font-size:inherit;color:inherit;margin:0}';
    document.head.appendChild(style);
    installProfileTooltip();
    ensurePerformanceValue();
    const performance = $('dashPerformance');
    if (performance) new MutationObserver(() => {
      if (!/\d[\d\s]*\s*kWh\/kWc\/an/i.test(performance.textContent)) setTimeout(ensurePerformanceValue, 80);
    }).observe(performance, { childList: true, characterData: true, subtree: true });
    clarifyDecision();
    const decision = $('decisionStatus');
    if (decision) new MutationObserver(() => queueMicrotask(clarifyDecision)).observe(decision, { childList: true, subtree: true });
    $('orientation')?.addEventListener('change', () => setTimeout(ensurePerformanceValue, 250));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
