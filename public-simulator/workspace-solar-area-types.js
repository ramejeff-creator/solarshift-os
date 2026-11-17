(function () {
  'use strict';

  const labels = new Map([
    ['AGRIVOLTAIC', 'Agrivoltaïsme'],
    ['BUILDING_FACADE', 'Façade de bâtiment'],
    ['FLOATING', 'Installation flottante']
  ]);

  function enhance() {
    const hint = document.querySelector('#solarAreaEditor>.inlineHint');
    if (hint) hint.textContent = 'Ajoutez une zone par toiture, ombrière, installation au sol, agrivoltaïsme, façade ou surface flottante. Les champs laissés vides restent UNKNOWN ; cette étape ne calcule pas la production.';
    document.querySelectorAll('#solarAreaRows [data-solar-field="name"]').forEach((input) => { input.placeholder = 'ex. Zone photovoltaïque principale'; });
    document.querySelectorAll('#solarAreaRows select[data-solar-field="areaKind"]').forEach((select) => {
      const current = select.value;
      labels.forEach((label, value) => {
        if (![...select.options].some((option) => option.value === value)) select.add(new Option(label, value));
      });
      select.value = current;
    });
    document.querySelectorAll('#solarAreaSummary .solarAreaCard p').forEach((line) => {
      if (!line.querySelector('b')?.textContent.startsWith('Type')) return;
      const valueNode = [...line.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
      if (!valueNode) return;
      const value = valueNode.textContent.trim();
      if (labels.has(value)) valueNode.textContent = ` ${labels.get(value)}`;
    });
  }

  function boot() {
    enhance();
    const root = document.getElementById('solarAreaRows');
    const summary = document.getElementById('solarAreaSummary');
    if (!root && !summary) return;
    const observer = new MutationObserver(enhance);
    [root, summary].filter(Boolean).forEach((node) => observer.observe(node, { childList: true, subtree: true }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
