(function () {
  'use strict';

  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

  function section() {
    return document.getElementById('audit-solar') || [...document.querySelectorAll('section.card')].find((node) => /Fiche terrain et performance/i.test(node.textContent || ''));
  }

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .productionStudy{margin-top:18px}.productionStudyGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12px 0 18px}.productionStudy .metric{border:1px solid #cfe0d5;border-radius:9px;padding:12px;background:#f5faf7}.productionStudy .metric b{display:block;color:#0a3f2d;font-size:19px;margin:4px 0}.productionStudy .metric small{color:#587469}.monthlyProfile{display:grid;grid-template-columns:repeat(12,1fr);align-items:end;gap:7px;height:150px;padding:10px 4px;border-bottom:1px solid #cfe0d5}.monthlyProfile i{display:block;min-height:4px;border-radius:5px 5px 0 0;background:linear-gradient(#f2bb35,#d99116);position:relative}.monthlyProfile span{display:block;text-align:center;color:#587469;font-size:11px;margin-top:5px}.productionStudy .status{margin-top:12px}.productionStudy .fine{margin-top:12px}@media(max-width:760px){.productionStudyGrid{grid-template-columns:repeat(2,1fr)}.monthlyProfile{gap:3px}}
    `;
    document.head.appendChild(style);
  }

  function barsMarkup() {
    return months.map((month, index) => `<div><i data-month="${index}" style="height:12%" title="${month} : profil en attente"></i><span>${month}</span></div>`).join('');
  }

  function update() {
    const source = document.getElementById('dashPerformance');
    const output = document.getElementById('studyYield');
    if (source && output) output.textContent = source.textContent.includes('PVGIS') ? source.textContent.split('·')[0].trim() : 'À calculer';
    const original = [...document.querySelectorAll('.bars i')];
    document.querySelectorAll('.monthlyProfile i').forEach((bar, index) => {
      const height = original[index]?.style.height || '12%';
      bar.style.height = height;
      bar.title = original[index]?.title || `${months[index]} : profil à calculer`;
    });
  }

  function enhanceCommercialPreAnalysis(card) {
    const badge = card.querySelector('.pill');
    const hint = card.querySelector('.hint');
    if (badge) badge.textContent = 'Avant-analyse';
    if (hint) hint.textContent = 'Estimation commerciale PVGIS calculable immédiatement, sans étude P50/P90.';

    card.querySelectorAll('.metric').forEach((metric) => {
      const label = metric.querySelector('b, small')?.textContent?.trim();
      const value = metric.querySelector('span, b:nth-child(2)');
      const note = metric.querySelector('small:last-child');
      if (label === 'Rendement moyen') metric.querySelector('b').textContent = 'Rendement moyen estimé';
      if (label === 'P50 statistique' || label === 'P50' || label === 'P90') {
        if (value) value.textContent = 'Non requis à ce stade';
        if (note) note.textContent = 'Requis pour validation technique';
      }
    });

    const unit = document.getElementById('productionUnit');
    if (unit) unit.textContent = 'Production mensuelle théorique PVGIS. Les P50/P90 proviendront d’une étude externe validée.';
    const status = document.getElementById('studyStatus');
    if (status) status.innerHTML = '<b>Portée :</b> estimation commerciale indicative, utilisable sans bloquer l’avant-analyse.';

    const points = document.getElementById('profilePoints');
    const tooltip = document.getElementById('curveTooltip');
    if (!points || !tooltip) return;
    const labelEstimatedPoint = (point) => {
      if (point.dataset.commercialTooltip === 'ready') return;
      point.dataset.commercialTooltip = 'ready';
      point.addEventListener('mouseenter', () => {
        tooltip.textContent = `${point.dataset.month} · Estimation PVGIS ${point.dataset.p50} kWh`
          + (point.dataset.p90 ? ` · P90 validé ${point.dataset.p90} kWh` : '');
      });
    };
    points.querySelectorAll('circle').forEach(labelEstimatedPoint);
    new MutationObserver(() => points.querySelectorAll('circle').forEach(labelEstimatedPoint))
      .observe(points, { childList: true });
  }

  function boot() {
    const existing = document.querySelector('.productionStudy');
    if (existing) {
      enhanceCommercialPreAnalysis(existing);
      return;
    }
    const anchor = section();
    if (!anchor) return;
    addStyles();
    const card = document.createElement('section');
    card.className = 'card productionStudy';
    card.id = 'audit-production';
    card.innerHTML = `<div class="sectionTitle"><h2>Étude de production</h2><span class="pill">Traçable</span></div><p class="hint">Cette avant-analyse commerciale utilise une estimation PVGIS. Elle reste calculable sans étude P50/P90.</p><div class="productionStudyGrid"><div class="metric"><small>Rendement moyen estimé</small><b id="studyYield">À calculer</b><small>PVGIS · adresse du projet</small></div><div class="metric"><small>Qualité de donnée</small><b>Q0–Q4</b><small>Niveau affiché après calcul</small></div><div class="metric"><small>P50</small><b>Non requis à ce stade</b><small>Requis pour validation technique</small></div><div class="metric"><small>P90</small><b>Non requis à ce stade</b><small>Requis pour validation technique</small></div></div><h3>Profil mensuel estimé</h3><div class="monthlyProfile" aria-label="Profil mensuel estimé de production">${barsMarkup()}</div><p class="fine">Survolez une barre pour afficher la valeur mensuelle. Le profil est recalibré avec l’orientation, la pente, l’ombrage et les coordonnées.</p><div class="status"><b>Portée :</b> estimation commerciale indicative. Une étude externe P50/P90 sera nécessaire avant validation technique.</div>`;
    anchor.insertAdjacentElement('afterend', card);
    enhanceCommercialPreAnalysis(card);
    update();
    ['orientation', 'tilt', 'shade'].forEach((id) => document.getElementById(id)?.addEventListener('change', () => setTimeout(update, 100)));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());

['roof-surfaces.js', 'finance-controls.js', 'summary-ux.js', 'risk-ux.js'].forEach((file) => {
  const script = document.createElement('script');
  script.src = `./${file}`;
  document.head.appendChild(script);
});
