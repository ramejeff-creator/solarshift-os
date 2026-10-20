import { buildReportPdf, downloadReportPdf } from './report-pdf.mjs';
import { qualificationChecks, safeSourceUrl } from './parcel-qualification.mjs';
import { networkSummary } from './site-context-view.mjs';

const fmt = n => n == null ? 'non renseigné' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const date = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : 'date de consultation non renseignée';
function sourceLine(source, fallbackUrl) {
  return `${source.name || 'Source'} - consultation : ${date(source.retrievedAt)}${source.dataDate ? ` ; données : ${String(source.dataDate).slice(0, 10)}` : ''}. ${safeSourceUrl(fallbackUrl || source.url) || ''}`;
}
function groupedSources(observations, label, url) {
  if (!observations.length) return `${label} : non consulté.`;
  const dates = [...new Set(observations.map(o => date(o.retrievedAt)))];
  return `${label} - ${observations.length} couches consultées ; consultation : ${dates.join(' ; ')}. ${url}`;
}
export function buildQualificationReport(snapshot, { name = 'Site à qualifier', address = '', generatedAt = new Date().toISOString() } = {}) {
  if (!snapshot?.parcel?.id || !snapshot.point || snapshot.status !== 'PROVISIONAL') throw new TypeError('Une qualification parcellaire est nécessaire avant l’export.');
  const p = snapshot.parcel, context = snapshot.siteContext, horizon = snapshot.horizon;
  const observations = snapshot.observations || [];
  const zones = observations.find(o => o.name === 'Zonage d’urbanisme');
  const summary = ['planning', 'servitudes', 'nature'].map(group => {
    const rows = observations.filter(o => o.group === group), found = rows.filter(o => o.state === 'AVAILABLE').flatMap(o => o.items || []);
    const label = { planning: 'Urbanisme', servitudes: 'Servitudes', nature: 'Environnement (Natura 2000 et ZNIEFF)' }[group];
    if (!rows.length) return `${label} : non consulté.`;
    const missing = rows.filter(o => o.state !== 'AVAILABLE').map(o => o.name);
    return `${label} : ${found.length ? [...new Set(found.map(item => item.description || item.label))].join(' ; ') : 'aucun objet renvoyé par les couches disponibles'}${missing.length ? `. À compléter : ${missing.join(', ')}` : ''}.`;
  });
  const contextPoint = context?.analysisPoint || snapshot.cadastre?.lookupPoint || snapshot.point;
  const risks = context?.risks;
  const riskText = risks?.state === 'AVAILABLE'
    ? [
      `Rapport au point ${contextPoint.latitude}, ${contextPoint.longitude} ; ne couvre pas toute l’emprise par intersection.`,
      `Au point : ${risks.items.filter(i => i.scope === 'POINT').map(i => `${i.label} (${i.pointStatus})`).join(' ; ') || 'aucun signal dans les thèmes renvoyés et retenus'}.`,
      `À préciser localement : ${risks.items.filter(i => i.scope !== 'POINT').map(i => `${i.label} (${i.scope === 'COMMUNE' ? 'signal communal, exposition au point non renseignée' : 'portée non résolue'})`).join(' ; ') || 'aucun signal supplémentaire renvoyé'}.`
    ].join('\n') : 'Rapport Géorisques non disponible. Les aléas et plans de prévention restent à vérifier.';
  const networks = context?.networks;
  const networkText = networks ? ['BT : ' + networkSummary(networks, 'BT'), 'HTA : ' + networkSummary(networks, 'HTA'), 'Poste HTA/BT : ' + networkSummary(networks, 'POSTE'), 'Recherche dans les jeux Enedis à moins de 500 m de la parcelle. Distances indicatives à vol d’oiseau, pas des longueurs de raccordement. Capacité, solution et coût à confirmer auprès du gestionnaire.'].join('\n') : 'Réseaux non récupérés. Raccordement à instruire auprès du gestionnaire.';
  const horizonText = horizon?.state === 'AVAILABLE'
    ? `Point : ${horizon.queryPoint.latitude}, ${horizon.queryPoint.longitude}. Horizon plein sud : ${fmt(horizon.southHorizonDeg)}° ; relief maximal : ${fmt(horizon.maxHorizonDeg)}°. Altitude du modèle : ${fmt(horizon.elevationM)} m.\nRelief seul, hors arbres et bâtiments proches. Ce profil n’ajoute aucune perte au calcul de production ; le relief est déjà pris en compte par défaut dans PVGIS. L’ombrage local reste à étudier.`
    : 'Masque du relief PVGIS non disponible. Aucun horizon nul ou faible ombrage n’est supposé.';
  const unknown = observations.filter(o => o.state !== 'AVAILABLE').map(o => o.name);
  if (snapshot.buildings?.state !== 'AVAILABLE') unknown.push('Identité des bâtiments BDNB');
  if (risks?.state !== 'AVAILABLE') unknown.push('Rapport Géorisques');
  if (!networks || networks.state !== 'AVAILABLE') unknown.push('Couverture complète des réseaux Enedis');
  if (horizon?.state !== 'AVAILABLE') unknown.push('Masque du relief PVGIS');
  const documents = [...new Set(observations.flatMap(o => (o.items || []).map(i => safeSourceUrl(i.documentUrl))).filter(Boolean))];
  const sources = [sourceLine(snapshot.cadastre || {}, 'https://apicarto.ign.fr/api/doc/cadastre'),
    groupedSources(observations.filter(o => o.group !== 'nature'), 'Urbanisme et servitudes · IGN API Carto / GPU', 'https://apicarto.ign.fr/api/doc/gpu'),
    groupedSources(observations.filter(o => o.group === 'nature'), 'Natura 2000 et ZNIEFF · IGN / INPN', 'https://apicarto.ign.fr/api/doc/nature'),
    sourceLine(snapshot.buildings || { name: 'BDNB' }, 'https://bdnb.io/'),
    ...(risks ? [sourceLine(risks)] : []), ...(networks?.datasets || []).map(s => sourceLine(s)), ...(horizon ? [sourceLine(horizon)] : [])];
  return { title: `Qualification du site - ${String(name).slice(0, 200)}`, documentLabel: 'QUALIFICATION DU SITE · SYNTHÈSE PROVISOIRE',
    meta: `${address || p.city || p.cityCode || 'Adresse non renseignée'} | Export du ${date(generatedAt)} | Données provisoires à confirmer`,
    metrics: [{ label: 'Parcelle', value: `${p.section || ''} ${p.number || ''} - ${p.id}` }, { label: 'Contenance cadastrale', value: `${fmt(p.areaM2)} m² de terrain` },
      { label: 'Zonage renvoyé', value: zones?.state === 'AVAILABLE' && zones.items.length ? [...new Set(zones.items.map(i => i.label))].join(', ') : 'À vérifier' },
      { label: 'Statut', value: 'Qualification indicative - revue projet nécessaire' }],
    sections: [
      { title: 'Prochaines vérifications', text: qualificationChecks(snapshot).map((c, i) => `${i + 1}. ${c.label}`).join('\n') },
      { title: 'Constats sur l’emprise', text: summary.join('\n') + '\n' + (snapshot.buildings?.state === 'AVAILABLE' ? `BDNB : ${(snapshot.buildings.items || []).map(b => `${b.usage || 'usage non renseigné'}, emprise ${fmt(b.areaM2)} m²${b.year ? `, construction ${b.year}` : ''}`).join(' ; ') || 'aucun bâtiment lié renvoyé, rattachement à vérifier'}.` : 'BDNB : source indisponible ou rattachement incomplet.') },
      { title: 'Risques naturels et technologiques', text: riskText },
      { title: 'Réseaux électriques proches', text: networkText },
      { title: 'Masque solaire du relief - PVGIS', horizon: horizon?.state === 'AVAILABLE' ? horizon : null, text: horizonText },
      { title: 'Inconnues et portée de la synthèse', text: `${unknown.length ? `À compléter : ${unknown.join(' ; ')}.` : 'Les sources consultées ont répondu ; leur interprétation reste à valider pour le projet.'}\nLa contenance cadastrale ne représente pas la surface de panneaux disponible. Les résultats vides ne prouvent pas l’absence de contrainte. Autres protections, structure et état de toiture à examiner. Cette synthèse ne vaut ni autorisation, ni étude de raccordement, ni validation technique ou financière.` },
      { title: 'Sources et dates de consultation', text: sources.join('\n') },
      ...(documents.length ? [{ title: 'Pièces publiées à consulter', text: documents.join('\n') }] : [])
    ] };
}
export const buildQualificationPdf = (snapshot, identity) => buildReportPdf(buildQualificationReport(snapshot, identity));
export function downloadQualificationPdf(snapshot, identity = {}) {
  return downloadReportPdf(buildQualificationReport(snapshot, identity), { filename: `qualification-site-${snapshot.parcel.id}.pdf` });
}
