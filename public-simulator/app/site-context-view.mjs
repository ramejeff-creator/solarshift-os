const node = (tag, text = '', className = '') => { const n = document.createElement(tag); n.textContent = text; if (className) n.className = className; return n; };
function source(host, observation) {
  const p = node('p', '', 'parcelSource');
  try {
    const url = new URL(observation.url);
    if (url.protocol === 'https:' && !url.username && !url.password) {
      const a = node('a', observation.name || 'Source'); a.href = url.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; p.append(a);
    }
  } catch { /* unavailable source metadata */ }
  const date = Date.parse(observation.retrievedAt);
  p.append(document.createTextNode(Number.isNaN(date) ? ' · date de consultation non renseignée' : ` · consultée le ${new Date(date).toLocaleString('fr-FR')}`));
  if (observation.dataDate) p.append(document.createTextNode(` · données du ${String(observation.dataDate).slice(0, 10)}`));
  host.append(p);
}
export function networkSummary(networks, kind) {
  const rows = (networks?.datasets || []).filter(d => d.kind === kind);
  if (rows.length !== (kind === 'POSTE' ? 1 : 2)) return 'À compléter';
  const complete = rows.every(d => d.state === 'AVAILABLE');
  const known = rows.filter(d => d.state === 'AVAILABLE' && d.nearestM != null).sort((a, b) => a.nearestM - b.nearestM);
  if (!known.length) return rows.every(d => d.state === 'OUTSIDE_COVERAGE') ? 'Hors couverture de ces données' : complete ? 'Aucun ouvrage renvoyé à moins de 500 m' : 'Données incomplètes';
  const n = known[0];
  return `${n.nearestM < 10 ? 'À moins d’environ 10 m' : `À environ ${(Math.round(n.nearestM / 10) * 10).toLocaleString('fr-FR')} m`}${kind === 'POSTE' ? '' : ` · ${n.installation.toLowerCase()}`}${complete ? '' : ' · recherche incomplète'}`;
}
export function appendSiteContext(host, context) {
  if (document.head && !document.getElementById('ozenoParcelQualificationStyle')) {
    const css = document.createElement('link'); css.id = 'ozenoParcelQualificationStyle'; css.rel = 'stylesheet'; css.href = './parcel-qualification.css'; document.head.append(css);
  }
  const block = node('section', '', 'parcelSiteContext'); block.append(node('h3', 'Risques et réseau'));
  if (!context) { block.append(node('p', 'Rapport Géorisques et réseaux non encore consultés.', 'parcelMuted')); host.append(block); return; }
  if (context.state === 'UNAVAILABLE') { block.append(node('p', context.error, 'parcelWarning')); host.append(block); return; }
  const risks = context.risks, items = risks.items || [];
  const pointItems = items.filter(item => item.scope === 'POINT'), otherItems = items.filter(item => item.scope !== 'POINT');
  const grid = node('dl', '', 'parcelContextGrid');
  for (const [title, value] of [
    ['Géorisques', risks.state !== 'AVAILABLE' ? 'Source à compléter' : `${pointItems.length} thème(s) signalé(s) au point · ${otherItems.length} à préciser localement`],
    ['Réseau BT', networkSummary(context.networks, 'BT')], ['Réseau HTA', networkSummary(context.networks, 'HTA')], ['Poste HTA/BT', networkSummary(context.networks, 'POSTE')]
  ]) { const cell = node('div'); cell.append(node('dt', title), node('dd', value)); grid.append(cell); }
  block.append(grid, node('p', 'Risques : au point d’analyse et à la commune. Réseaux : proximité de la parcelle, sans capacité ni coût de raccordement déduits.', 'parcelMuted'));
  const detail = node('details'); detail.append(node('summary', 'Détail des risques, des réseaux et des sources'));
  detail.append(node('h4', 'Géorisques · point d’analyse'));
  if (risks.state !== 'AVAILABLE') detail.append(node('p', risks.error || 'Source indisponible.', 'parcelWarning'));
  else {
    detail.append(node('p', `Point interrogé : ${context.analysisPoint.latitude}, ${context.analysisPoint.longitude}. Le rapport ne constitue pas une intersection des aléas avec toute la parcelle.`, 'parcelMuted'));
    if (!items.length) detail.append(node('p', 'Aucun signal dans les thèmes renvoyés et retenus pour le projet. Les PPR et le règlement restent à vérifier.', 'parcelMuted'));
    for (const item of items) {
      detail.append(node('p', `${item.label} — ${item.scope === 'POINT' ? `au point : ${item.pointStatus}` : item.scope === 'COMMUNE' ? `à la commune : ${item.communeStatus} ; exposition au point non renseignée` : 'exposition locale à préciser'}.`));
    }
  }
  source(detail, risks);
  detail.append(node('h4', 'Enedis · recherche à moins de 500 m de la parcelle'));
  for (const row of context.networks.datasets) {
    const value = row.state === 'OUTSIDE_COVERAGE' ? 'Hors couverture de ce jeu' : row.state !== 'AVAILABLE' ? 'Source indisponible ou résultats incomplets' : row.count === 0 ? 'Aucun ouvrage renvoyé dans le périmètre' : `${row.count} ouvrage(s) ou tronçon(s) · distance minimale indicative : ${row.nearestM} m`;
    detail.append(node('p', `${row.name} : ${value}.`)); source(detail, row);
  }
  detail.append(node('p', context.networks.limitation, 'parcelMuted'));
  detail.append(node('p', 'Les tronçons ne sont pas des points de raccordement proposés. Pré-étude gestionnaire et procédures DT-DICT restent nécessaires selon le projet.', 'parcelMuted'));
  block.append(detail); host.append(block);
}
