(function () {
  'use strict';

  const stages = [
    ['project', '1', 'Projet & adresse', /Projets|Carte et mesure de toiture/i],
    ['roof', '2', 'Toiture', /Carte et mesure de toiture/i],
    ['solar', '3', 'Performance solaire', /Fiche terrain et performance/i],
    ['risk', '4', 'Risques & preuves', /Registre de risque/i],
    ['finance', '5', 'Finance & décision', /Simulation économique SPV|Votre estimation solaire/i]
  ];

  function sectionFor(pattern) {
    return [...document.querySelectorAll('section.card')].find((node) => pattern.test(node.textContent || ''));
  }

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .auditJourney{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;overflow:auto;margin:0 0 20px;padding:4px 0 9px;scrollbar-width:thin}
      .auditJourney button{min-width:145px;border:1px solid #cfe0d5;background:#fff;color:#315c4b;border-radius:9px;padding:10px 12px;text-align:left;cursor:pointer;font:inherit}
      .auditJourney button:hover,.auditJourney button:focus-visible{border-color:#1c875b;outline:3px solid #1c875b33}
      .auditJourney button.current{background:#0a3f2d;color:#fff;border-color:#0a3f2d}
      .auditProgress{flex:0 0 100%;font-size:13px;color:#587469;margin:0 0 4px}.auditJourney strong{display:block;font-size:12px;opacity:.8}.auditJourney span{font-weight:700;font-size:14px}
      .stageAnchor{scroll-margin-top:16px}.auditProgress{font-size:13px;color:#587469;margin:0 0 14px}
      header{z-index:1200}.auditJourney{z-index:1100}.map{position:relative;z-index:0}.map .leaflet-top,.map .leaflet-bottom,.map .leaflet-control{z-index:400!important}
      @media(max-width:700px){.auditJourney button{min-width:132px}}
    `;
    document.head.appendChild(style);
  }

  function boot() {
    if (document.querySelector('.auditJourney')) {
      addStyles();
      return;
    }
    const main = document.querySelector('main') || document.querySelector('.layout');
    if (!main) return;
    addStyles();
    const nav = document.createElement('nav');
    nav.className = 'auditJourney';
    nav.setAttribute('aria-label', 'Parcours de qualification');
    const progress = document.createElement('p');
    progress.className = 'auditProgress';
    progress.textContent = 'Parcours commercial · complétez les étapes dans l’ordre conseillé, puis validez la décision.';
    nav.appendChild(progress);
    stages.forEach(([id, number, label, pattern]) => {
      const section = sectionFor(pattern);
      if (!section) return;
      section.id = `audit-${id}`;
      section.classList.add('stageAnchor');
      const button = document.createElement('button');
      button.type = 'button';
      button.innerHTML = `<strong>Étape ${number}</strong><span>${label}</span>`;
      button.addEventListener('click', () => section.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      nav.appendChild(button);
    });
    main.insertBefore(nav, main.firstChild);

    const buttons = [...nav.querySelectorAll('button')];
    const update = () => {
      const y = window.scrollY + 150;
      let active = 0;
      stages.forEach(([id], index) => {
        const node = document.getElementById(`audit-${id}`);
        if (node && node.offsetTop <= y) active = index;
      });
      buttons.forEach((button, index) => button.classList.toggle('current', index === active));
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
