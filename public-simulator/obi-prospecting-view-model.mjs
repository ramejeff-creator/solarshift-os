const JOFFRERY_WAY_ID = 81401972;
const RNB_CANDIDATES = ['6TQD9BX8CP45', '7GFB2KH6AS87'];

export function createObiProspectingViewModel(candidate, { fixtureStatus = 'LOCAL_DEMO' } = {}) {
  const osmId = Number(candidate?.osmId);
  const footprintArea = Number(candidate?.areaM2);
  const hasIdentityCandidates = osmId === JOFFRERY_WAY_ID;
  const source = {
    name: 'OpenStreetMap',
    attribution: '© OpenStreetMap contributors',
    license: 'ODbL 1.0',
    retrievedAt: '2026-10-26',
    status: fixtureStatus
  };

  return {
    target: { kind: 'OSM_CONTOUR_CANDIDATE', id: `way/${osmId}`, label: 'Emprise au sol OSM estimée' },
    geometry: candidate.geometry,
    distanceMeters: candidate.distanceMeters,
    surfaces: {
      osm_footprint_area_m2: Number.isFinite(footprintArea) ? footprintArea : null,
      roof_exploitable_area_m2: null,
      tertiary_floor_area_m2: null
    },
    identities: {
      site_ref: null,
      legal_scope_state: 'UNKNOWN',
      buildingLinks: hasIdentityCandidates ? RNB_CANDIDATES.map((id) => ({
        namespace: 'RNB', id, status: 'CANDIDATE', confidence: 'LOW', assignment: 'NOT_ESTABLISHED'
      })) : [],
      activity: { state: 'UNKNOWN', proof: 'INSUFFICIENT' }
    },
    indicators: {
      eet: {
        family: 'Éco Énergie Tertiaire', conclusion: 'UNKNOWN', proof: 'INSUFFICIENT',
        label: 'Périmètre à vérifier', reason: 'Cet indicateur concerne les obligations réglementaires d’un périmètre d’activité tertiaire. L’activité, l’unité d’exploitation et la surface de plancher ne sont pas établies par une emprise au sol.',
        missing: ['Pièce établissant l’activité et l’occupant', 'Surface de plancher du périmètre', 'Périmètre OPERAT/EET documenté']
      },
      pv: {
        family: 'Potentiel photovoltaïque', conclusion: 'POTENTIAL', proof: 'TO_VERIFY',
        label: 'Hypothèse à vérifier', reason: 'Le contour décrit une emprise au sol ; la toiture exploitable et ses contraintes restent inconnues.',
        missing: ['Vérification de toiture sur imagerie ou visite', 'Orientation, ombrage et contraintes du site']
      },
      renovation: {
        family: 'Rénovation énergétique', conclusion: 'UNKNOWN', proof: 'INSUFFICIENT',
        label: 'Aucune preuve liée', reason: 'Recherche de preuves de performance ou de travaux (DPE, audit, dossier) rattachées au bon bâtiment. Aucun document lié ne prouve ni la présence ni l’absence de travaux.',
        missing: ['DPE ou audit énergétique lié au bon bâtiment', 'Historique de travaux documenté']
      }
    },
    energy: {
      annual_actual_final_energy_kwh: null,
      enedisAddressAggregate: null,
      operat: { kind: 'NATIONAL_STATISTICAL_REFERENCE', assignedToCandidate: false, value: null },
      dpe: { status: 'NOT_ESTABLISHED', assignedToCandidate: false }
    },
    provenance: { source, boundary: 'FIXTURE_GEOGRAPHIC_COVERAGE', partial: true },
    poc: { isDemo: true, banner: 'POC — données de test / préqualification non certifiée' }
  };
}

export function summarizeObiEvidence(viewModel) {
  return Object.values(viewModel.indicators).map((indicator) => ({
    family: indicator.family,
    conclusion: indicator.conclusion,
    proof: indicator.proof,
    label: indicator.label,
    reason: indicator.reason,
    missing: [...indicator.missing]
  }));
}
