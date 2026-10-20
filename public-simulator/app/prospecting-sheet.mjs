import { loadBuildingObservations, buildingAddresses, parcelsLinkedToBuilding, requestJson, knownNumber, addressResolutionMessage } from './prospecting-data.mjs';
import { publishedConsumption } from './prospecting-energy.mjs';
import { qualifyParcel, qualificationChecks, safeSourceUrl } from './parcel-qualification.mjs';
import { appendSiteContext } from './site-context-view.mjs';
import { appendHorizon } from './qualification-horizon.mjs';
import { downloadQualificationPdf } from './qualification-report.mjs';
import { appendSituationPlan } from './situation-plan-ui.mjs';

const number = value => knownNumber(value) == null ? 'Non renseigné' : Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 3 });
const energyNumber = value => knownNumber(value) == null ? 'Non renseigné' : Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const node = (tag, text = '', className = '') => {
  const result = document.createElement(tag); result.textContent = String(text ?? ''); if (className) result.className = className; return result;
};
function field(host, label, value) {
  const item = node('div', '', 'hubSheetField'); item.append(node('dt', label), node('dd', value == null || value === '' ? 'Non renseigné' : value)); host.append(item);
}
function section(host, title) {
  const block = node('section', '', 'hubSheetBlock'); block.append(node('h3', title)); host.append(block); return block;
}
function source(host, observation) {
  const line = node('p', '', 'hubPrivacyNote');
  const link = node('a', observation.name); link.href = observation.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
  line.append(link, document.createTextNode(` · consulté le ${new Date(observation.retrievedAt).toLocaleString('fr-FR')} · observation non validée`)); host.append(line);
}
function status(host, observation, emptyLabel) {
  if (observation.state === 'UNAVAILABLE') host.append(node('p', observation.error || 'Service temporairement indisponible.', 'hubSheetWarning'));
  else if (!observation.data?.length) host.append(node('p', emptyLabel, 'hubMuted'));
}

export function createProspectingSheet({ host, config, getToken, onConsumption = () => {} }) {
  let controller, generation = 0;
  function close() { generation++; controller?.abort(); host.hidden = true; host.replaceChildren(); }
  async function show(candidate, index, consumptionLabel, scroll = false, refresh = false) {
    controller?.abort(); controller = new AbortController();
    const signal = controller.signal, selected = ++generation;
    const active = () => selected === generation && !signal.aborted;
    host.hidden = false; host.replaceChildren(); host.setAttribute('aria-busy', 'true');
    const heading = node('div', '', 'hubSheetHeading');
    const title = node('h2', `Fiche de prospection · bâtiment ${index + 1}`); title.tabIndex = -1;
    const closeButton = node('button', 'Fermer la fiche', 'hubSecondary'); closeButton.type = 'button'; closeButton.onclick = close;
    const retry = node('button', 'Actualiser les données', 'hubSecondary'); retry.type = 'button';
    retry.onclick = () => show(candidate, index, consumptionLabel, false, true);
    heading.append(title, retry, closeButton); host.append(heading);
    host.append(node('p', 'Informations indicatives issues des sources publiques. Le propriétaire n’est pas nécessairement l’occupant ; un agrégat à l’adresse n’est pas la consommation validée de cette toiture.', 'hubDataCaveat'));
    const grid = node('div', '', 'hubSheetGrid'); host.append(grid);
    const physical = section(grid, 'Bâtiment et localisation');
    const base = node('dl', '', 'hubSheetFields');
    field(base, 'Surface estimée OSM', `${number(candidate.areaM2)} m² (surface au sol, toiture à vérifier)`);
    field(base, 'Distance au point de référence', `${number(candidate.distanceMeters)} m`);
    field(base, 'Coordonnées du repère', `${Number(candidate.latitude).toFixed(6)}, ${Number(candidate.longitude).toFixed(6)}`);
    physical.append(base, node('p', 'Récupération BDNB / cadastre…', 'hubMuted'));
    const energy = section(grid, 'Consommation électrique annuelle');
    energy.append(node('p', 'Recherche de l’adresse du bâtiment…', 'hubMuted'));
    const parcels = section(grid, 'Parcelles cadastrales'); parcels.append(node('p', 'Chargement…', 'hubMuted'));
    const planning = section(grid, 'Urbanisme · zonage PLU'); planning.append(node('p', 'Chargement…', 'hubMuted'));
    const owner = section(grid, 'Propriétaire et contacts · accès restreint');
    owner.append(node('p', 'Les données personnelles et les coordonnées de contact ne sont jamais chargées par les services publics du navigateur. Leur accès nécessite une vérification des droits sur le serveur.', 'hubMuted'));
    const assets = section(grid, 'Patrimoine et qualification commerciale');
    assets.append(node('p', 'Nombre d’établissements, surfaces regroupées, droit de propriété, dirigeant et contacts : non renseignés. Ces champs attendent le raccordement sécurisé de votre base / ERP ; ils ne sont pas déduits de la carte.', 'hubMuted'));
    if (scroll) { host.scrollIntoView({ behavior: 'smooth', block: 'start' }); title.focus({ preventScroll: true }); }
    consumptionLabel.textContent = 'Consommation : chargement…';
    try {
      const data = await loadBuildingObservations(candidate, { signal, refresh });
      if (!active()) return;
      physical.lastElementChild.remove();
      const building = data.building.building;
      if (building) {
        field(base, 'Adresse principale BDNB', building.libelle_adr_principale_ban);
        field(base, 'Usage principal', building.usage_principal_bdnb_open);
        field(base, 'Emprise au sol BDNB', knownNumber(building.surface_emprise_sol) == null ? null : `${number(building.surface_emprise_sol)} m²`);
        field(base, 'Année de construction', building.annee_construction);
        field(base, 'Hauteur moyenne', knownNumber(building.hauteur_mean) == null ? null : `${number(building.hauteur_mean)} m`);
        field(base, 'Matériau de toiture', building.mat_toit_txt === 'INDETERMINE' ? null : building.mat_toit_txt);
        field(base, 'Matériau des murs', building.mat_mur_txt === 'INDETERMINE' ? null : building.mat_mur_txt);
        field(base, 'Niveaux / logements', `${number(building.nb_niveau)} / ${number(building.nb_log)}`);
        physical.append(node('p', 'Rattachement spatial au repère du bâtiment (Lambert-93 pour la BDNB). À contrôler sur place ; pas de validation automatique des paramètres du projet.', 'hubPrivacyNote'));
        if (data.building.lookupMethod === 'REFERENCE_ADDRESS_AND_GEOMETRY') physical.append(node('p', 'Adresse retrouvée par recherche de secours à partir de l’adresse de référence, puis vérification du contour BDNB. L’adresse du projet n’a pas été appliquée aux bâtiments voisins.', 'hubPrivacyNote'));
      } else physical.append(node('p', data.building.state === 'AMBIGUOUS' ? 'Rattachement BDNB ambigu ou résultats incomplets : adresse et consommation non attribuées automatiquement.' : data.building.state === 'UNAVAILABLE' ? data.building.error : 'Aucun rattachement BDNB suffisamment certain. Aucune adresse voisine n’est utilisée par défaut.', 'hubSheetWarning'));
      source(physical, data.building);
      const linkedParcels = building ? parcelsLinkedToBuilding(data.parcels.data, building) : [];
      parcels.lastElementChild.remove();
      if (data.parcels.state === 'UNAVAILABLE') status(parcels, data.parcels, '');
      else if (!building) parcels.append(node('p', 'Parcelles non affichées : une simple intersection avec le contour OSM ne suffit pas à les rattacher au bâtiment ou à l’adresse ciblée.', 'hubMuted'));
      else if (!linkedParcels.length) parcels.append(node('p', 'Aucune des parcelles renvoyées par le cadastre ne correspond aux identifiants associés à ce bâtiment dans la BDNB ; les intersections seules ne sont pas affichées comme un rattachement.', 'hubMuted'));
      for (const feature of linkedParcels) {
        const p = feature.properties || {}, list = node('dl', '', 'hubSheetFields');
        field(list, 'Numéro / section', `${p.numero || 'Non renseigné'} / ${p.section || 'Non renseigné'}`);
        field(list, 'Identifiant parcellaire', p.idu);
        field(list, 'Commune / code INSEE', `${p.nom_com || 'Non renseigné'} / ${p.code_insee || 'Non renseigné'}`);
        field(list, 'Contenance cadastrale', knownNumber(p.contenance) == null ? null : `${number(p.contenance)} m²`);
        parcels.append(list);
        if (['Polygon', 'MultiPolygon'].includes(feature.geometry?.type)) {
          const examine = node('button', 'Examiner les contraintes de cette parcelle', 'hubSecondary'); examine.type = 'button';
          const qualification = node('div'); parcels.append(examine, qualification);
          examine.onclick = async () => {
            examine.disabled = true; qualification.replaceChildren(node('p', 'Consultation des sources sur l’emprise cadastrale…', 'hubMuted'));
            try {
              const snapshot = await qualifyParcel(feature, candidate, { signal, cadastre: data.parcels, siteContextEndpoint: config.siteContextEndpoint, pvgisEndpoint: config.pvgisEndpoint });
              if (!active()) return;
              candidate.parcelQualification = snapshot;
              qualification.replaceChildren(node('p', `Parcelle ${snapshot.parcel.id} · qualification indicative, à confirmer.`, 'hubPrivacyNote'));
              appendSiteContext(qualification, snapshot.siteContext);
              appendHorizon(qualification, snapshot.horizon);
              const exportButton = node('button', 'Exporter la qualification en PDF', 'hubSecondary'); exportButton.type = 'button';
              exportButton.onclick = () => { if (active()) downloadQualificationPdf(snapshot, { name: `Bâtiment en prospection ${index + 1}`, address: building?.libelle_adr_principale_ban || '' }); };
              qualification.append(exportButton);
              appendSituationPlan(qualification, snapshot, { active, identity: () => ({ name: `Bâtiment en prospection ${index + 1}`, address: building?.libelle_adr_principale_ban || '' }) });
              const checks = node('ul'); qualificationChecks(snapshot).forEach(check => checks.append(node('li', check.label))); qualification.append(checks);
              const details = node('details'); details.append(node('summary', 'Constats et sources de la parcelle'));
              snapshot.observations.forEach(observation => {
                details.append(node('p', `${observation.name} : ${observation.state !== 'AVAILABLE' ? 'source indisponible, à compléter' : observation.items.length ? observation.items.map(item => item.label).join(' · ') : 'aucun objet renvoyé par cette couche'}`));
                source(details, observation);
                observation.items.forEach(item => { if (safeSourceUrl(item.documentUrl)) { const a = node('a', 'Consulter la pièce publiée'); a.href = safeSourceUrl(item.documentUrl); a.target = '_blank'; a.rel = 'noopener noreferrer'; details.append(a); } });
              });
              qualification.append(details, node('p', 'Urbanisme : parcelle entière. Environnement : Natura 2000 et ZNIEFF ; autres protections à examiner. Géorisques : au point ; Enedis : proximité de la parcelle. Le zonage ne vaut pas autorisation photovoltaïque.', 'hubPrivacyNote'));
            } catch (error) { if (active()) qualification.replaceChildren(node('p', error.message, 'hubSheetWarning')); }
            finally { if (active()) examine.disabled = false; }
          };
        }
      }
      if (linkedParcels.length) {
        parcels.append(node('p', 'Parcelles liées à ce bâtiment dans la BDNB. La contenance désigne la superficie cadastrale totale du terrain, pas l’emprise du bâtiment ni la surface de toiture ; le lien et les limites restent à vérifier sur le plan cadastral.', 'hubPrivacyNote'));
        source(parcels, data.parcels);
      }
      planning.lastElementChild.remove(); status(planning, data.planning, 'Aucun zonage retourné. Cela ne signifie ni absence de PLU ni absence de contraintes.');
      for (const feature of data.planning.data) {
        const p = feature.properties || {}, list = node('dl', '', 'hubSheetFields');
        field(list, 'Libellé de zone', p.libelle); field(list, 'Libellé long', p.libelong);
        field(list, 'Type de zone', p.typezone); field(list, 'Date d’approbation publiée', p.datappro);
        planning.append(list);
        if (typeof p.urlfic === 'string' && /^https?:\/\//i.test(p.urlfic)) {
          const link = node('a', 'Consulter le règlement publié'); link.href = p.urlfic; link.target = '_blank'; link.rel = 'noopener noreferrer'; planning.append(link);
        }
      }
      planning.append(node('p', 'Zones intersectant le bâtiment. Le zonage seul ne permet pas de conclure à la faisabilité photovoltaïque : règlement, prescriptions et servitudes restent à vérifier.', 'hubPrivacyNote')); source(planning, data.planning);
      host.setAttribute('aria-busy', 'false');
      energy.replaceChildren(node('h3', 'Consommation électrique annuelle'));
      const addresses = buildingAddresses(building);
      if (!addresses.length) {
        const message = addressResolutionMessage(data.building);
        energy.append(node('p', message.detail, 'hubSheetWarning'));
        consumptionLabel.textContent = message.popup; return;
      }
      // Only owner/contact lookup is protected. Published Enedis aggregates do not require login.
      const ownerEndpoint = config.prospectingOwnerEndpoint || (config.supabaseUrl && `${config.supabaseUrl}/functions/v1/prospecting-owner-details`);
      if (ownerEndpoint) {
        const url = new URL(ownerEndpoint); url.searchParams.set('building_id', building.batiment_groupe_id);
        Promise.resolve().then(getToken).then(token => {
          if (!active()) return null;
          const headers = { Authorization: `Bearer ${token}`, ...(config.supabasePublishableKey ? { apikey: config.supabasePublishableKey } : {}) };
          return requestJson(url, { headers, signal });
        }).then(payload => {
          if (!payload) return;
          if (!active()) return;
          const list = node('dl', '', 'hubSheetFields');
          field(list, 'Dénominations des personnes morales publiées', payload.names?.join(' · '));
          field(list, 'SIREN publiés', payload.sirens?.join(' · '));
          owner.append(list, node('p', 'Ces listes ne prouvent pas une correspondance nom/SIREN ligne par ligne, ni l’identité de l’occupant ou du décideur. Aucun nom de personne physique n’est ajouté.', 'hubPrivacyNote'));
          source(owner, { name: 'BDNB Open · consultation protégée', url: 'https://bdnb.io/', retrievedAt: payload.retrievedAt });
        }).catch(error => { if (active()) owner.append(node('p', error.message || 'Connexion interne requise pour les propriétaires et contacts.', 'hubSheetWarning')); });
      }
      let lookupGeneration = 0;
      const detail = node('div');
      async function lookup(address) {
        const lookup = ++lookupGeneration;
        detail.replaceChildren(node('p', 'Consultation des agrégats publics Enedis…', 'hubMuted'));
        consumptionLabel.textContent = 'Consommation : chargement…';
        try {
          const summary = await publishedConsumption(address, { signal, refresh });
          if (!active() || lookup !== lookupGeneration) return;
          onConsumption(candidate, { ...summary, address, state: summary.totalMwh == null ? 'UNKNOWN' : 'AVAILABLE' });
          detail.replaceChildren(node('p', address.label, 'hubMuted'));
          const amount = summary.totalMwh == null ? 'Non publiée pour cette adresse exacte' : `${energyNumber(summary.totalMwh)} MWh/an · référence Enedis ${summary.latestYear}`;
          consumptionLabel.textContent = `Consommation : ${amount}`;
          detail.append(node('p', amount, 'hubSheetEnergyTotal'));
          const list = node('dl', '', 'hubSheetFields');
          summary.latest.forEach(row => field(list, row.population === 'RESIDENTIAL' ? `Résidentiel · ${row.category || 'segment non renseigné'}` : `${row.sector || 'Secteur non renseigné'} · NAF ${row.category || 'non renseigné'}`,
            `${energyNumber(row.annualMwh)} MWh · ${number(row.count)} ${row.countLabel || ''}`));
          detail.append(list, node('p', 'Agrégat publié à l’adresse, pour les catégories présentes uniquement. Ne décrit pas un compteur individuel ni la simultanéité des usages ACI / ACC.', 'hubPrivacyNote'));
          if (summary.history.length > 1) {
            const history = node('details'), table = node('dl', '', 'hubSheetFields'); history.append(node('summary', 'Historique annuel publié'));
            summary.history.forEach(row => field(table, row.year, `${energyNumber(row.totalMwh)} MWh`)); history.append(table); detail.append(history);
          }
          summary.warnings.forEach(warning => detail.append(node('p', warning, 'hubSheetWarning')));
          source(detail, { name: 'Enedis Open Data · agrégats annuels', url: 'https://opendata.enedis.fr/', retrievedAt: summary.retrievedAt || new Date().toISOString() });
        } catch (error) {
          if (!active() || lookup !== lookupGeneration) return;
          detail.replaceChildren(node('p', error.message, 'hubSheetWarning'));
          consumptionLabel.textContent = 'Consommation : indisponible';
          onConsumption(candidate, { state: 'UNAVAILABLE', totalMwh: null });
        }
      }
      if (addresses.length > 1) {
        const label = node('label', 'Plusieurs adresses : choisissez le périmètre à consulter.'), select = node('select');
        select.append(node('option', 'Choisir une adresse…')); select.firstChild.value = '';
        addresses.forEach((address,i) => { const option = node('option', address.label); option.value = String(i); select.append(option); });
        select.onchange = () => {
          if (select.value === '') { lookupGeneration++; detail.replaceChildren(); consumptionLabel.textContent = 'Consommation : adresse à choisir'; }
          else lookup(addresses[Number(select.value)]);
        };
        label.append(select); energy.append(label, detail); consumptionLabel.textContent = 'Consommation : adresse à choisir';
      } else { energy.append(detail); await lookup(addresses[0]); }
    } catch (error) {
      if (active()) { energy.replaceChildren(node('h3', 'Consommation électrique annuelle'), node('p', error.message, 'hubSheetWarning')); consumptionLabel.textContent = 'Consommation : indisponible'; }
    } finally { if (active()) host.setAttribute('aria-busy', 'false'); }
  }
  return { show, close };
}
