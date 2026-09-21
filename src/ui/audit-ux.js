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

  function installRoofMode() {
    const roof = document.getElementById('audit-roof');
    const tilt = document.getElementById('tilt');
    const total = document.getElementById('roofTotal');
    if (!roof || !tilt || !total) return;
    const surfaceLabel = total.closest('label');
    total.removeAttribute('placeholder');
    total.placeholder = '';
    let note = roof.querySelector('.roofModeNote');
    if (!note) {
      note = document.createElement('p');
      note.className = 'hint roofModeNote';
      roof.querySelector('.form')?.insertAdjacentElement('beforebegin', note);
    }
    const refresh = () => {
      const flat = tilt.value === 'Toit plat';
      if (surfaceLabel?.firstChild) {
        surfaceLabel.firstChild.nodeValue = 'Surface toiture (renseigner ou tracer sur la carte) ';
      }
      note.textContent = flat
        ? 'Toit plat : tracez la surface de toiture. L’orientation et la pente concerneront les supports photovoltaïques.'
        : 'Toiture inclinée : tracez un pan à la fois. Chaque pan devra ensuite avoir sa propre orientation, pente et production.';
      note.dataset.mode = flat ? 'flat' : 'pitched';
    };
    tilt.addEventListener('change', refresh);
    refresh();
  }

  function installRiskDraft() {
    const source = document.getElementById('riskSource');
    const factor = document.getElementById('riskFactor');
    if (!source || !factor) return;
    const label = source.closest('label');
    const marker = label?.querySelector('b');
    if (marker) marker.remove();
    if (label?.firstChild) label.firstChild.nodeValue = 'Observation ou référence ';
    source.placeholder = 'Observation facultative : ajoutez une précision ou une référence si disponible';
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
      .mobileProjectChoice{display:none}
      @media(max-width:700px){
        header{position:static!important}
        .auditJourney{position:sticky!important;top:0!important;z-index:1100!important;display:flex!important;flex-wrap:nowrap!important;gap:6px!important;margin-bottom:12px!important;padding:7px 0 8px!important;overflow-x:auto!important;overscroll-behavior-x:contain;scroll-snap-type:x proximity;background:#edf3ef;box-shadow:0 5px 10px #062f3c12}
        .auditProgress{display:none!important}
        .auditJourney a,.auditJourney button{min-width:116px!important;padding:8px 9px!important;scroll-snap-align:start}
        .auditJourney strong{font-size:10px!important}.auditJourney span{font-size:12px!important;line-height:1.2}
        .projects button[data-p]:not(.active){display:none}
        .projects>.hint,.projects>.fine{display:none}
        .mobileProjectChoice{display:block;margin:10px 0 4px}
        .newProject{display:none}
      }
    `;
    document.head.appendChild(style);
  }

  function installMobileProjectChoice() {
    const projects = document.querySelector('.projects');
    if (!projects || projects.querySelector('.mobileProjectChoice')) return;
    const buttons = [...projects.querySelectorAll('button[data-p]')];
    if (buttons.length < 2) return;
    const label = document.createElement('label');
    label.className = 'mobileProjectChoice';
    label.innerHTML = `<span>Changer de projet</span><select aria-label="Changer de projet">${buttons.map((button) => `<option value="${button.dataset.p}"${button.classList.contains('active') ? ' selected' : ''}>${button.querySelector('b')?.textContent || button.textContent}</option>`).join('')}</select>`;
    label.querySelector('select').addEventListener('change', (event) => buttons.find((button) => button.dataset.p === event.target.value)?.click());
    projects.querySelector('.newProject')?.insertAdjacentElement('beforebegin', label);
    buttons.forEach((button) => button.addEventListener('click', () => { label.querySelector('select').value = button.dataset.p; }));
  }

  function boot() {
    if (document.querySelector('.auditJourney')) {
      addStyles();
      installRoofMode();
      installRiskDraft();
      installMobileProjectChoice();
      return;
    }
    const main = document.querySelector('main') || document.querySelector('.layout');
    if (!main) return;
    addStyles();
    installRoofMode();
    installRiskDraft();
    installMobileProjectChoice();
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
