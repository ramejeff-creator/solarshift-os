// Read-only local DVF reference. No API, CRM write, ownership or EET inference.
export const DVF_REFERENCE_PATH = './obi-dvf-muret-recorded-reference.json';
export const DVF_EMPTY_LIMIT = 'Une recherche sans résultat ne prouve pas l’absence de changement de propriétaire : ventes anciennes, donations, successions ou changements de parcelle peuvent échapper à cette recherche.';
const PARCEL_ID = /^\d{5}[A-Z0-9]{9}$/;
const unique = values => [...new Set(values)];

export function dvfHistoryForParcels(reference, parcelIds) {
  if (reference?.schemaVersion !== 1 || reference.status !== 'RECORDED_PUBLIC_DVF_REFERENCE' || !Array.isArray(reference.rows)
    || !reference.source?.coverage?.from || !reference.source?.coverage?.to || !Array.isArray(reference.source.coverage.communeCodes)) {
    throw new Error('Référence DVF locale invalide ou incomplète.');
  }
  const ids = unique((parcelIds || []).filter(id => typeof id === 'string' && PARCEL_ID.test(id)));
  if (!ids.length) return { state: 'NEEDS_PARCEL', parcelIds: [], rows: [], outsideCoverage: [], source: reference.source };
  const covered = ids.filter(id => reference.source.coverage.communeCodes.includes(id.slice(0, 5)));
  const outsideCoverage = ids.filter(id => !covered.includes(id));
  if (!covered.length) return { state: 'OUTSIDE_COVERAGE', parcelIds: ids, rows: [], outsideCoverage, source: reference.source };
  const rows = reference.rows.filter(row => covered.includes(row.parcelId) || covered.includes(row.previousParcelId))
    .map(row => ({ ...row, lots: (row.lots || []).map(lot => ({ ...lot })), parcelMatch: covered.includes(row.parcelId) ? 'CURRENT_PARCEL_ID' : 'PREVIOUS_PARCEL_ID' }))
    .sort((a, b) => b.date.localeCompare(a.date));
  return { state: rows.length ? 'AVAILABLE' : 'NO_MATCH', parcelIds: covered, outsideCoverage, rows, source: reference.source };
}

export function dvfSurfaceLabel(value, type = 'bâtie déclarée') {
  if (value == null || String(value).trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0) return 'Non renseignée';
  if (Number(value) === 0) return 'Valeur publiée : 0 m² · surface à vérifier';
  return `${Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m² · surface ${type}`;
}

const make = (tag, text = '', className = '') => {
  const node = document.createElement(tag); node.textContent = text;
  if (className) node.className = className;
  return node;
};
const dateLabel = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date.split('-').reverse().join('/') : 'Date non renseignée';
let referencePromise;
async function readReference() {
  referencePromise ||= fetch(DVF_REFERENCE_PATH, { method: 'GET', credentials: 'same-origin' })
    .then(response => { if (!response.ok) throw new Error('Référence DVF locale indisponible.'); return response.json(); })
    .catch(error => { referencePromise = null; throw error; });
  return referencePromise;
}

export function mountDvfHistory(site, { model, candidate }) {
  const panel = make('section', '', 'dvfHistory'); panel.setAttribute('aria-label', 'Locaux et historique immobilier DVF');
  const style = make('style');
  style.textContent = `
.hubValidatedFiche .dvfHistory { margin-top:18px; padding-top:16px; border-top:1px solid #dce5df; }
.hubValidatedFiche .dvfHistory h4 { margin:0 0 6px; font-size:14px; line-height:1.4; }
.hubValidatedFiche .dvfHistory p { font-size:12px; line-height:1.55; margin:8px 0; }
.hubValidatedFiche .dvfHistory .dvfCaption { color:#64796f; font-size:11px; }
.hubValidatedFiche .dvfHistory .dvfStatus { padding:10px 12px; border-radius:8px; background:#f2f6f3; }
.hubValidatedFiche .dvfHistory .dvfWarning { border-left:3px solid #c18a26; padding-left:10px; color:#715621; }
.hubValidatedFiche .dvfHistory details { font-size:12px; margin-top:10px; }
.hubValidatedFiche .dvfHistory .dvfPublishedRow { border:1px solid #dce5df; border-radius:8px; padding:10px 12px; margin:8px 0; }
.hubValidatedFiche .dvfHistory dl { margin:0; }
.hubValidatedFiche .dvfHistory .dvfField { display:grid; grid-template-columns:minmax(100px,.75fr) minmax(0,1.25fr); gap:10px; padding:5px 0; font-size:12px; }
.hubValidatedFiche .dvfHistory dt { color:#64796f; }
.hubValidatedFiche .dvfHistory dd { margin:0; overflow-wrap:anywhere; }
.hubValidatedFiche .dvfHistory progress { width:100%; height:6px; margin:10px 0; }
.hubValidatedFiche .dvfHistory a { overflow-wrap:anywhere; color:#176453; }
@container(max-width:620px) { .hubValidatedFiche .dvfHistory .dvfField { grid-template-columns:minmax(0,1fr); gap:2px; } }
`;
  const title = make('h4', 'Locaux et historique immobilier · DVF');
  const meta = make('p', 'Référence locale Muret · lecture des mutations déclarées…', 'dvfCaption');
  const status = make('p', 'Lecture de la référence DVF locale…', 'dvfStatus'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const progress = make('progress'); progress.setAttribute('aria-label', 'Lecture de la référence DVF locale');
  const resultHost = make('div');
  panel.append(style, title, meta, progress, status, resultHost); site.append(panel);
  let reference = null;

  function render() {
    if (!reference || !panel.isConnected) return;
    resultHost.replaceChildren();
    const notes = make('div');
    const observation = model.publicObservations?.building;
    const recorded = reference.caseParcelReferences?.[String(candidate.osmId)];
    // Prefer the current reader, including an unresolved result; never replace a
    // failed current match with a historic parcel or a guessed nearby address.
    const parcelIds = observation ? observation.building?.l_parcelle_id || [] : recorded?.parcelIds || [];
    const data = dvfHistoryForParcels(reference, parcelIds);
    panel.dataset.dvfState = data.state;
    const coverage = `${dateLabel(data.source.coverage.from)} au ${dateLabel(data.source.coverage.to)}`;
    meta.textContent = `Référence DVF locale · mutations déclarées du ${coverage} · rattachement aux parcelles à vérifier.`;
    const scope = observation ? 'Parcelles du groupe BDNB consulté ; lien à la construction à confirmer.'
      : recorded ? `Parcelles du groupe BDNB consignées le ${dateLabel(recorded.observedAt?.slice(0, 10))} ; lien à la construction à confirmer.`
        : 'Aucune parcelle rattachée au groupe ou au bâtiment.';
    notes.append(make('p', scope, 'dvfCaption'));
    if (data.parcelIds.length) notes.append(make('p', 'Parcelles recherchées : ' + data.parcelIds.join(' · '), 'dvfCaption'));
    if (data.state === 'NEEDS_PARCEL') {
      status.textContent = 'Parcelle à établir avant de consulter les mutations.';
    } else if (data.state === 'OUTSIDE_COVERAGE') {
      status.textContent = 'Parcelles hors couverture de la référence locale Muret. Aucun résultat négatif n’est déduit.';
    } else if (data.state === 'NO_MATCH') {
      status.textContent = `Aucune mutation retrouvée pour ces parcelles sur la période du ${coverage}.`;
    } else {
      const mutations = new Map();
      for (const row of data.rows) { const key = row.mutationId + '/' + row.disposition; if (!mutations.has(key)) mutations.set(key, []); mutations.get(key).push(row); }
      status.textContent = `${data.rows.length} ligne(s) DVF publiée(s) retrouvée(s) · période du ${coverage}.`;
      for (const rows of mutations.values()) {
        const transaction = make('details');
        transaction.open = true;
        transaction.append(make('summary', `${dateLabel(rows[0].date)} · ${rows[0].nature} · ${rows.length} ligne(s) publiée(s)`));
        for (const row of rows) {
          const record = make('div', '', 'dvfPublishedRow'), list = make('dl');
          const fields = [['Parcelle publiée', row.parcelId], ['Nature du local', row.localType || 'Non renseignée'], ['Surface bâtie', dvfSurfaceLabel(row.builtAreaM2)]];
          if (row.parcelMatch === 'PREVIOUS_PARCEL_ID') fields.push(['Correspondance', `Ancienne référence ${row.previousParcelId} · évolution cadastrale à vérifier`]);
          for (const lot of row.lots || []) fields.push([`Lot publié ${lot.number}`, dvfSurfaceLabel(lot.carrezAreaM2, 'Carrez publiée')]);
          for (const [label, value] of fields) { const field = make('div', '', 'dvfField'); field.append(make('dt', label), make('dd', value)); list.append(field); }
          record.append(list); transaction.append(record);
        }
        resultHost.append(transaction);
      }
      notes.append(make('p', 'Les lignes peuvent répéter les mêmes locaux. Aucune somme de surfaces ni correspondance entre lots et locaux n’est établie. Le libellé industriel/commercial ne confirme pas une activité tertiaire.', 'dvfCaption'));
    }
    status.className = 'dvfStatus';
    if (data.outsideCoverage.length && data.state !== 'OUTSIDE_COVERAGE') resultHost.append(make('p', 'Consultation partielle : hors couverture pour ' + data.outsideCoverage.join(' · '), 'dvfWarning'));
    notes.append(make('p', DVF_EMPTY_LIMIT, 'dvfWarning'));
    notes.append(make('p', 'Ces surfaces décrivent des locaux publiés lors d’une mutation. Elles ne sont attribuées ni au contour OSM, ni à l’établissement occupant, ni au périmètre EET.', 'dvfCaption'));
    const sources = make('details'); sources.append(make('summary', 'Détails et source'), notes);
    const sourceLink = make('a', 'DVF géolocalisées · DGFiP / data.gouv.fr'); sourceLink.href = 'https://www.data.gouv.fr/datasets/demandes-de-valeurs-foncieres-geolocalisees'; sourceLink.target = '_blank'; sourceLink.rel = 'noopener noreferrer';
    sources.append(sourceLink, make('p', `Livraison ${data.source.delivery} · référence préparée le ${dateLabel(data.source.checkedAt?.slice(0, 10))} · commune Muret (31395) · du ${coverage}. Données consignées, mise à jour manuelle. ${data.source.scope}`, 'dvfCaption'));
    sources.append(make('p', 'La nature et l’activité de l’établissement, le propriétaire actuel et l’assujettissement restent à établir séparément.', 'dvfCaption'));
    resultHost.append(sources);
  }
  panel.setAttribute('aria-busy', 'true');
  readReference().then(value => {
    reference = value;
    render();
  }).catch(error => {
    status.textContent = error.message || 'Référence DVF locale indisponible.';
    panel.dataset.dvfState = 'UNAVAILABLE';
  }).finally(() => {
    progress.hidden = true;
    panel.setAttribute('aria-busy', 'false');
  });
  return { update: render };
}
