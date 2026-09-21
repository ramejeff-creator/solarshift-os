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

  function boot() {
    if (document.querySelector('.productionStudy')) return;
    const anchor = section();
    if (!anchor) return;
    addStyles();
    const card = document.createElement('section');
    card.className = 'card productionStudy';
    card.id = 'audit-production';
    card.innerHTML = `<div class="sectionTitle"><h2>Étude de production</h2><span class="pill">Traçable</span></div><p class="hint">Cette synthèse reprend les données de production disponibles sans remplacer une étude validée.</p><div class="productionStudyGrid"><div class="metric"><small>Rendement moyen</small><b id="studyYield">À calculer</b><small>PVGIS · adresse du projet</small></div><div class="metric"><small>Qualité de donnée</small><b>Q0–Q4</b><small>Niveau affiché après calcul</small></div><div class="metric"><small>P50</small><b>À importer</b><small>Étude externe validée</small></div><div class="metric"><small>P90</small><b>À importer</b><small>Étude externe validée</small></div></div><h3>Profil mensuel</h3><div class="monthlyProfile" aria-label="Profil mensuel de production">${barsMarkup()}</div><p class="fine">Survolez une barre pour afficher la valeur mensuelle. Le profil est recalibré avec l’orientation, la pente, l’ombrage et les coordonnées.</p><div class="status"><b>Ombrage :</b> simulation détaillée à documenter ou à connecter à une étude 3D externe.</div>`;
    anchor.insertAdjacentElement('afterend', card);
    update();
    ['orientation', 'tilt', 'shade'].forEach((id) => document.getElementById(id)?.addEventListener('change', () => setTimeout(update, 100)));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());

['roof-surfaces.js', 'finance-controls.js'].forEach((file) => {
  const script = document.createElement('script');
  script.src = `./${file}`;
  document.head.appendChild(script);
});
