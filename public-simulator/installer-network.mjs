import { installerCategoryOptions, mountPublicInstallerSearch } from './installer-directory-ui.mjs';
import { publicInstallerDraft, reviewedInstallerQualifications } from './installer-directory-client.mjs';

const techLabels = Object.freeze({ PV: 'Photovoltaïque', BATTERY: 'Batterie', PAC: 'Pompe à chaleur', IRVE: 'Borne IRVE' });
// `project_types` is the existing persisted text[] field and has no other
// consumer. Reuse it for partner disciplines to avoid a schema migration.
const partnerCategoryLabels = Object.freeze({ INSTALLER: 'Installateur', ENERGY_STUDY: 'Bureau d’étude énergétique', TECHNICAL_STUDY: 'Bureau d’étude technique', MAINTENANCE: 'Entretien', WORKS: 'Travaux' });
const categorySelection = (partner = {}) => {
  const categories = partner.project_types?.length ? partner.project_types : ['INSTALLER'];
  const technologies = partner.technologies || [];
  return installerCategoryOptions.filter(option => categories.includes(option.category)
    && (!option.technology || technologies.includes(option.technology))
    && (option.value !== 'INSTALLER_OTHER' || technologies.length === 0)).map(option => option.value);
};
const localV10 = () => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(globalThis.location?.hostname?.toLowerCase()) && (globalThis.SOLARSHIFT_CONFIG?.OOI_VISUAL_PREVIEW_ENABLED === true || new URLSearchParams(globalThis.location?.search || '').get('OOI_VISUAL_PREVIEW_ENABLED') === 'true');
const networkLabels = Object.freeze({ CANDIDATE: 'À évaluer', REFERENCED: 'Partenaire référencé', SUSPENDED: 'Suspendu', ARCHIVED: 'Archivé' });
const normalizeCode = (value) => String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
const safeExternalUrl = (value) => {
  try { const url = new URL(String(value ?? '')); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
};
const element = (tag, text = '', className = '') => {
  const node = document.createElement(tag);
  if (text !== '') node.textContent = text;
  if (className) node.className = className;
  return node;
};
const detail = (label, value) => {
  const wrap = element('div', '', 'installerPartnerDetail');
  wrap.append(element('span', label), element('strong', value || 'Non renseigné'));
  return wrap;
};
const sourceDate = (value) => value ? new Date(value).toLocaleDateString('fr-FR') : 'date non renseignée';
const publicQualificationLabel = (item = {}) => {
  const label = String(item.label || '').trim();
  if (/qualipv\s*(elec|36)/i.test(label)) return 'QualiPV 36 · compétence électrique photovoltaïque raccordée au réseau (≤ 36 kVA)';
  if (/installations photovolta[iï]ques.*36\s*kva/i.test(label)) return 'Installation photovoltaïque raccordée au réseau (≤ 36 kVA)';
  return label || item.domain || 'Qualification publiée';
};
const publicIssuerLabel = (item = {}) => {
  const issuer = String(item.issuer || item.source || '').trim();
  if (/qualit'?\s*enr/i.test(issuer) || /qualitenr/i.test(issuer)) return 'Qualit’EnR';
  if (/qualibat/i.test(issuer)) return 'Qualibat';
  if (/qualifelec/i.test(issuer)) return 'Qualifelec';
  return issuer || 'Organisme non précisé';
};
const publicQualificationCode = (item = {}) => String(item.label || '').match(/\(([^()]*(?:\d{2,}|[A-Z]{2,})[^()]*)\)\s*$/i)?.[1] || '';

export function normalizeInstallerPartner(input = {}) {
  const legalName = String(input.legal_name ?? input.legalName ?? '').trim();
  if (!legalName) throw new Error('Indiquez la raison sociale ou le nom de l’entreprise.');
  const siren = String(input.siren ?? '').replace(/\s+/g, '');
  const siret = String(input.siret ?? '').replace(/\s+/g, '');
  if (siren && !/^\d{9}$/.test(siren)) throw new Error('Le SIREN doit contenir 9 chiffres.');
  if (siret && !/^\d{14}$/.test(siret)) throw new Error('Le SIRET doit contenir 14 chiffres.');
  const technologies = [...new Set((input.technologies || []).map((code) => String(code).toUpperCase()))];
  if (technologies.some((code) => !Object.hasOwn(techLabels, code))) throw new Error('Une spécialité sélectionnée n’est pas reconnue.');
  const reviewRating = input.reviews?.[0]?.rating;
  if (reviewRating != null && (!Number.isFinite(Number(reviewRating)) || Number(reviewRating) < 0 || Number(reviewRating) > 5)) throw new Error('La note client doit être comprise entre 0 et 5.');
  return {
    legal_name: legalName.slice(0, 200),
    trade_name: String(input.trade_name ?? '').trim().slice(0, 200),
    siren,
    siret,
    legal_status: ['Actif', 'À vérifier', 'Fermé'].includes(input.legal_status) ? input.legal_status : 'À vérifier',
    created_on: input.created_on || null,
    company_source: String(input.company_source ?? '').trim().slice(0, 300),
    company_checked_at: input.company_checked_at || null,
    phone: String(input.phone ?? '').trim().slice(0, 80),
    email: String(input.email ?? '').trim().slice(0, 254),
    website: String(input.website ?? '').trim().slice(0, 500),
    technologies,
    project_types: [...new Set((input.project_types || []).map(String).filter((code) => Object.hasOwn(partnerCategoryLabels, code)))].slice(0, 20),
    nationwide: input.nationwide === true,
    coverage_codes: [...new Set((input.coverage_codes || []).map(normalizeCode).filter(Boolean))].slice(0, 200),
    qualifications: Array.isArray(input.qualifications) ? input.qualifications.slice(0, 20) : [],
    reviews: Array.isArray(input.reviews) ? input.reviews.slice(0, 20) : [],
    network_status: ['CANDIDATE', 'REFERENCED', 'SUSPENDED', 'ARCHIVED'].includes(input.network_status) ? input.network_status : 'CANDIDATE',
    verified_at: input.verified_at || null,
    notes: String(input.notes ?? '').trim().slice(0, 4000)
  };
}

export function matchInstallerPartners(partners, { postalCode = '', departmentCode = '', technologies = [] } = {}) {
  const postcode = String(postalCode).replace(/\D/g, '').slice(0, 5);
  const department = normalizeCode(departmentCode || (postcode.startsWith('97') || postcode.startsWith('98') ? postcode.slice(0, 3) : postcode.slice(0, 2)));
  const required = [...new Set(technologies.map((code) => String(code).toUpperCase()))];
  if (!required.length || required.some((code) => !Object.hasOwn(techLabels, code))) return [];
  const today = new Date().toISOString().slice(0, 10);
  const hasCurrentQualification = (partner) => (partner.qualifications || []).some((qualification) =>
    qualification.status === 'VALID' && (!qualification.expiresOn || qualification.expiresOn >= today));
  return (partners || []).filter((partner) => {
    if (!['CANDIDATE', 'REFERENCED'].includes(partner.network_status)) return false;
    if (!required.some((technology) => (partner.technologies || []).includes(technology))) return false;
    if (partner.nationwide) return true;
    const codes = (partner.coverage_codes || []).map(normalizeCode);
    return (postcode && codes.includes(postcode)) || (department && codes.includes(department));
  }).sort((a, b) => {
    const referenced = Number(b.network_status === 'REFERENCED') - Number(a.network_status === 'REFERENCED');
    if (referenced) return referenced;
    const aValid = hasCurrentQualification(a);
    const bValid = hasCurrentQualification(b);
    if (aValid !== bValid) return Number(bValid) - Number(aValid);
    const aRating = Math.max(-1, ...(a.reviews || []).map((review) => Number(review.rating) || -1));
    const bRating = Math.max(-1, ...(b.reviews || []).map((review) => Number(review.rating) || -1));
    if (aRating !== bRating) return bRating - aRating;
    const aCount = Math.max(0, ...(a.reviews || []).map((review) => Number(review.count) || 0));
    const bCount = Math.max(0, ...(b.reviews || []).map((review) => Number(review.count) || 0));
    return bCount - aCount || String(a.legal_name).localeCompare(String(b.legal_name), 'fr');
  });
}

export function projectPostalCode(project, canonicalSite = null) {
  const candidates = [project?.postalCode, project?.postal_code, project?.addressReference?.postalCode, project?.addressReference?.postal_code,
    canonicalSite?.postalCode, canonicalSite?.postal_code, canonicalSite?.sitePostalCode];
  for (const candidate of candidates) {
    const code = String(candidate || '').trim();
    if (/^\d{5}$/.test(code)) return code;
  }
  return String(project?.address || '').match(/\b(\d{5})\b/)?.[1] || '';
}

export function makePartnerCard(partner, { editable = false, project = null, selected = false, onEdit = () => {}, onSelect = () => {}, onAdd = null } = {}) {
  const isPublic = ['PUBLIC_RGE', 'PUBLIC_QUALIFELEC', 'PUBLIC_DIRECTORY'].includes(partner.source_kind);
  const card = element('article', '', 'installerPartnerCard');
  const head = element('div', '', 'installerPartnerCardHead');
  const name = element('div', '', isPublic ? 'installerPublicName' : '');
  const titleLine = element('div', '', isPublic ? 'installerPublicTitleLine' : '');
  titleLine.append(element('h3', partner.trade_name || partner.legal_name));
  const qualifications = partner.qualifications || [];
  const publishedQualiPv = isPublic && qualifications.find((item) => /qualipv/i.test(String(item.label || '')));
  const review = [...(partner.reviews || []), ...(partner.known_partner?.reviews || [])].find((item) => item.rating != null && Number.isFinite(Number(item.rating)) && Number(item.rating) >= 0 && Number(item.rating) <= 5);
  if (isPublic) {
    const address = [partner.address, partner.postal_code, partner.city].filter(Boolean).join(' ');
    titleLine.append(element('span', partner.known_partner?.network_status === 'REFERENCED' ? '★ Référencé OZENO' : 'Annuaire public', partner.known_partner?.network_status === 'REFERENCED' ? 'installerNetworkStar' : 'installerNetworkStatus'));
    if (publishedQualiPv) {
      const badge = element('span', '✓ QualiPV · RGE publié', 'installerPublicQualiPv');
      badge.setAttribute('aria-label', `Qualification ${publishedQualiPv.label} publiée dans l’annuaire`);
      titleLine.append(badge);
    }
    if (review) {
      const isGoogle = /google/i.test(String(review.source || ''));
      const roundedStars = Math.max(0, Math.min(5, Math.round(Number(review.rating))));
      const rating = element('span', `${isGoogle ? 'Google ' : ''}${'★'.repeat(roundedStars)}${'☆'.repeat(5 - roundedStars)} ${Number(review.rating).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}${review.count ? ` · ${review.count} avis` : ''}`, 'installerPublicRating');
      rating.title = `Note déclarée par ${review.source || 'une source non précisée'} · vérifiée le ${sourceDate(review.checkedAt)}.`;
      titleLine.append(rating);
    }
    name.append(titleLine, element('p', address || 'Adresse de l’établissement non publiée', 'installerPublicAddress'));
    qualifications.forEach(item => {
      const dated = item.status === 'VALID' && item.startsOn && item.expiresOn;
      const summary = element('div', '', `installerPublicQualification${dated ? ' isValid' : ' isUnverified'}`);
      summary.append(element('strong', publicQualificationLabel(item)));
      const meta = element('span', `${publicIssuerLabel(item)} · ${dated ? `attribuée le ${sourceDate(item.startsOn)} · valable jusqu’au ${sourceDate(item.expiresOn)}` : 'validité à vérifier sur le certificat'}`);
      summary.append(meta);
      const urls = [...new Set((item.certificates || [item.sourceUrl]).map(safeExternalUrl).filter(Boolean))];
      urls.forEach((url, index) => {
        const certificate = element('a', urls.length > 1 ? `Certificat ${index + 1}` : 'Certificat');
        certificate.href = url; certificate.target = '_blank'; certificate.rel = 'noopener noreferrer';
        summary.append(certificate);
      });
      name.append(summary);
    });
  } else {
    name.append(titleLine);
  }
  if (partner.trade_name && partner.trade_name !== partner.legal_name) name.append(element('p', partner.legal_name, 'installerPartnerLegalName'));
  if (!isPublic) titleLine.append(element('span', partner.network_status === 'REFERENCED' ? '★ Partenaire référencé' : partner.network_status === 'CANDIDATE' ? 'Candidat externe' : networkLabels[partner.network_status], partner.network_status === 'REFERENCED' ? 'installerNetworkStar' : 'installerNetworkStatus'));
  head.append(name);
  const techs = element('div', '', 'installerTechTags');
  (partner.technologies || []).forEach((technology) => techs.append(element('span', techLabels[technology] || technology)));
  const categories = partner.project_types?.length ? partner.project_types : ['INSTALLER'];
  categories.forEach((category) => techs.append(element('span', partnerCategoryLabels[category] || category, 'installerPartnerCategory')));
  head.append(techs); card.append(head);
  const details = element('div', '', 'installerPartnerDetails');
  details.append(detail('SIREN', partner.siren || 'Non renseigné'));
  if (isPublic) details.append(detail('Établissement', [partner.address, partner.postal_code, partner.city].filter(Boolean).join(' ')), detail('SIRET', partner.siret));
  details.append(detail('Créée le', partner.created_on ? sourceDate(partner.created_on) : 'Non renseignée'));
  details.append(detail('Statut société', partner.legal_status || 'À vérifier'));
  details.append(detail('Source société', partner.company_source ? `${partner.company_source}${partner.company_checked_at ? ` · ${sourceDate(partner.company_checked_at)}` : ''}` : 'Non renseignée'));
  details.append(detail('Zone d’intervention', isPublic ? 'À confirmer avec le prestataire' : partner.nationwide ? 'France entière' : (partner.coverage_codes || []).join(', ') || 'Non renseignée'));
  card.append(details);
  const qualification = qualifications.find((item) => item.label) || qualifications[0];
  if (isPublic) {
    qualifications.forEach(item => {
      const dated = item.status === 'VALID' && item.startsOn && item.expiresOn;
      const period = dated ? `attribuée le ${sourceDate(item.startsOn)} · expire le ${sourceDate(item.expiresOn)}` : 'Validité à vérifier sur le certificat · dates non publiées par l’annuaire';
      const code = publicQualificationCode(item);
      const line = element('p', `${item.label}${item.domain && !String(item.label || '').toLowerCase().includes(String(item.domain).toLowerCase()) ? ` · ${item.domain}` : ''}${code ? ` · Code : ${code}` : ''} · ${period} · ${item.issuer || 'organisme non précisé'}${item.probationary ? ' · comporte un indice ou une mention probatoire' : ''}${item.indices?.length ? ` · Indices publiés : ${item.indices.join(' ; ')}` : ''}`, `installerQualification${dated ? ' isValid' : ''}`);
      const urls = [...new Set((item.certificates || [item.sourceUrl]).map(safeExternalUrl).filter(Boolean))];
      urls.forEach((url, index) => { const certificate = element('a', urls.length > 1 ? `Certificat ${index + 1}` : 'Consulter le certificat'); certificate.href = url; certificate.target = '_blank'; certificate.rel = 'noopener noreferrer'; line.append(document.createTextNode(' · '), certificate); });
      card.append(line);
    });
    // Provenance et limites restent indiquées au niveau de la recherche, sans
    // répéter un avertissement complet dans chaque résultat.
  } else if (qualification) {
    const valid = qualification.status === 'VALID' && (!qualification.expiresOn || qualification.expiresOn >= new Date().toISOString().slice(0, 10));
    card.append(element('p', `${qualification.label || 'Qualification'} · ${valid ? 'validité déclarée' : qualification.status === 'EXPIRED' ? 'expirée' : 'à vérifier'}${qualification.expiresOn ? ` jusqu’au ${sourceDate(qualification.expiresOn)}` : ''}`, `installerQualification ${valid ? 'isValid' : ''}`));
  } else card.append(element('p', 'Qualification : non renseignée', 'installerQualification'));
  card.append(element('p', review
    ? `Avis ${review.rating}/5 · ${review.count || 0} avis · ${review.source || 'source non renseignée'} · vérifié le ${sourceDate(review.checkedAt)}`
    : 'Avis clients : non renseignés', 'installerReviewSummary'));
  const actions = element('div', '', 'installerPartnerActions');
  if (partner.phone) { const call = element('a', 'Appeler', 'hubSecondary'); call.href = `tel:${partner.phone.replace(/[^+\d]/g, '')}`; actions.append(call); }
  if (partner.email) { const email = element('a', 'E-mail', 'hubSecondary'); email.href = `mailto:${partner.email}`; actions.append(email); }
  const website = safeExternalUrl(partner.website);
  if (website) { const site = element('a', 'Site web', 'hubSecondary'); site.href = website; site.target = '_blank'; site.rel = 'noopener noreferrer'; actions.append(site); }
  if (editable) { const edit = element('button', 'Modifier', 'hubSecondary'); edit.type = 'button'; edit.addEventListener('click', () => onEdit(partner)); actions.append(edit); }
  if (isPublic) {
    (partner.sources || [{ name: 'ADEME', url: partner.source_url }]).forEach(item => { const url = safeExternalUrl(item.url); if (!url) return; const source = element('a', `Source ${item.name}`, 'hubSecondary'); source.href = url; source.target = '_blank'; source.rel = 'noopener noreferrer'; actions.append(source); });
    if (!review) {
      // Prefer the published establishment address. Adding the company name can
      // make Maps resolve a historic business listing at a former address.
      const businessQuery = [partner.address, partner.postal_code, partner.city].filter(Boolean).join(' ') || partner.trade_name || partner.legal_name;
      const maps = element('a', 'Voir sur Google Maps', 'hubSecondary');
      maps.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(businessQuery)}`;
      maps.target = '_blank'; maps.rel = 'noopener noreferrer';
      maps.title = 'Ouvrir Google Maps à partir de l’adresse publiée ; vérifier l’identité de l’établissement et ses avis.';
      maps.setAttribute('aria-label', `Localiser ${partner.trade_name || partner.legal_name} à l’adresse publiée sur Google Maps`);
      actions.append(maps);
    }
    if (onAdd && !partner.known_partner) { const add = element('button', 'Ajouter au réseau OZENO', 'hubSecondary'); add.type = 'button'; add.addEventListener('click', () => onAdd(partner)); actions.append(add); }
  }
  if (project && (!isPublic || partner.known_partner) && onSelect) {
    const select = element('button', selected ? 'Déjà retenu pour ce dossier' : 'Retenir pour ce dossier', 'hubPrimary'); select.type = 'button'; select.disabled = selected;
    select.addEventListener('click', () => onSelect(isPublic ? partner.known_partner : partner)); actions.append(select);
  }
  card.append(actions);
  if (localV10() || isPublic) {
    const toggle = element('button', 'Détails', 'hubSecondary installerPartnerDetailsToggle'); toggle.type = 'button';
    const expandable = element('details', '', 'ooiPartnerDetails');
    expandable.append(element('summary', 'Informations du partenaire'), details);
    card.querySelectorAll('.installerQualification,.installerReviewSummary').forEach(node => expandable.append(node));
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => { expandable.open = !expandable.open; toggle.setAttribute('aria-expanded', String(expandable.open)); toggle.textContent = expandable.open ? 'Réduire' : 'Détails'; });
    if (isPublic) {
      head.append(toggle); head.after(expandable);
    } else {
      const badge = name.querySelector('.installerNetworkStar,.installerNetworkStatus');
      const status = element('div', '', 'ooiPartnerStatus');
      if (badge) status.append(badge); status.append(toggle); head.after(status, expandable);
    }
  }
  return card;
}

function departmentFromProject(project, postalCode) {
  const existing = String(project?.departmentCode || '').trim();
  if (existing) return normalizeCode(existing);
  const address = String(project?.address || '');
  const match = address.match(/\b(\d{5})\b/);
  const code = String(postalCode || match?.[1] || '').replace(/\D/g, '');
  return code.startsWith('97') || code.startsWith('98') ? code.slice(0, 3) : code.slice(0, 2);
}

export function createInstallerNetwork({ host, client, getToken, getOrganizations = () => [], getProject = () => null, getCanonicalProject = () => null, notify = () => {} }) {
  let directoryUnavailable = false, directoryLoaded = false; // États de présentation de la lecture, jamais enregistrés.
  let directoryError = '', loadGeneration = 0, publicDirectory = null, destroyed = false;
  let partners = [], selectedOrganizationId = '', loading = false, projectHost = null, currentProject = null, currentPostalCode = '', currentOpportunities = [];
  let formQualifications = [];
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = './installer-network.css'; document.head.append(css);
  const setState = (message, isError = false) => {
    const state = host?.querySelector('[data-installer-state]');
    if (state) { state.textContent = message; state.classList.toggle('isError', isError); state.hidden = !message; }
  };
  const organizationSelect = () => host?.querySelector('[data-installer-org]');
  function renderOrganizations() {
    const select = organizationSelect(); if (!select) return;
    const organizations = getOrganizations();
    select.replaceChildren();
    organizations.forEach((organization) => {
      const option = element('option', organization.name || 'Organisation'); option.value = organization.id; select.append(option);
    });
    if (!selectedOrganizationId && organizations[0]) selectedOrganizationId = organizations[0].id;
    select.value = selectedOrganizationId;
    select.disabled = organizations.length <= 1;
  }
  async function loadPartners() {
    if (!selectedOrganizationId) { partners = []; renderDirectory(); renderProjectSuggestions(); return; }
    const generation = ++loadGeneration, organizationId = selectedOrganizationId;
    loading = true; directoryUnavailable = false; directoryLoaded = false; directoryError = ''; partners = []; setState('Chargement du réseau OZENO…');
    renderDirectory(); renderProjectSuggestions(); publicDirectory?.refreshPartners();
    const add = host?.querySelector('[data-installer-add]'); if (add) add.disabled = true;
    try {
      const records = await client.cloudInstallerPartners(await getToken(), organizationId) || [];
      if (generation !== loadGeneration || destroyed) return;
      partners = records;
      directoryLoaded = true;
      setState(''); renderDirectory(); renderProjectSuggestions();
    } catch (error) {
      if (generation !== loadGeneration || destroyed) return;
      partners = []; directoryUnavailable = true; directoryError = error.message || 'Impossible de charger le réseau OZENO.';
      setState(directoryError, true);
    } finally {
      if (generation === loadGeneration && !destroyed) {
        loading = false; renderDirectory(); renderProjectSuggestions(); publicDirectory?.refreshPartners();
        const add = host?.querySelector('[data-installer-add]'); if (add) { add.disabled = directoryUnavailable; add.title = directoryUnavailable ? directoryError : ''; }
      }
    }
  }
  function openForm(partner = null) {
    const dialog = host.querySelector('[data-installer-dialog]');
    const form = dialog.querySelector('form');
    form.reset();
    formQualifications = structuredClone(partner?.qualifications || []);
    form.elements.partnerId.value = partner?.id || '';
    form.elements.legalName.value = partner?.legal_name || '';
    form.elements.tradeName.value = partner?.trade_name || '';
    form.elements.siren.value = partner?.siren || '';
    form.elements.siret.value = partner?.siret || '';
    form.elements.legalStatus.value = partner?.legal_status || 'À vérifier';
    form.elements.createdOn.value = partner?.created_on || '';
    form.elements.companySource.value = partner?.company_source || '';
    form.elements.companyCheckedAt.value = partner?.company_checked_at || '';
    form.elements.phone.value = partner?.phone || '';
    form.elements.email.value = partner?.email || '';
    form.elements.website.value = partner?.website || '';
    const selectedCategories = categorySelection(partner || {});
    form.querySelectorAll('[name="partnerCategory"]').forEach((input) => { input.checked = selectedCategories.includes(input.value); });
    form.elements.coverageCodes.value = (partner?.coverage_codes || []).join(', ');
    form.elements.nationwide.checked = partner?.nationwide === true;
    form.elements.networkStatus.value = partner?.network_status || 'CANDIDATE';
    form.elements.notes.value = partner?.notes || '';
    const qualification = partner?.qualifications?.[0] || {};
    form.elements.qualificationLabel.value = qualification.label || '';
    form.elements.qualificationStatus.value = qualification.status || 'PENDING';
    form.elements.qualificationExpiry.value = qualification.expiresOn || '';
    form.elements.qualificationSource.value = qualification.source || '';
    let additional = form.querySelector('[data-installer-additional-qualifications]');
    if (!additional) { additional = element('p', '', 'installerFormWide installerMuted'); additional.dataset.installerAdditionalQualifications = 'true'; form.elements.qualificationSource.closest('label').after(additional); }
    additional.hidden = formQualifications.length <= 1;
    additional.textContent = formQualifications.length > 1 ? `Qualifications complémentaires conservées avec leurs sources et certificats : ${formQualifications.slice(1).map(item => item.label || item.domain || 'Qualification à vérifier').join(' ; ')}. Leurs états restent inchangés.` : '';
    const review = partner?.reviews?.[0] || {};
    form.elements.reviewSource.value = review.source || '';
    form.elements.reviewRating.value = review.rating ?? '';
    form.elements.reviewCount.value = review.count ?? '';
    form.elements.reviewUrl.value = review.url || '';
    form.elements.reviewCheckedAt.value = review.checkedAt || '';
    dialog.querySelector('[data-installer-form-state]').textContent = '';
    dialog.querySelector('[data-installer-dialog-title]').textContent = partner?.id ? 'Modifier un partenaire' : 'Ajouter un partenaire';
    dialog.showModal();
  }
  async function saveForm(event) {
    event.preventDefault();
    const dialog = host.querySelector('[data-installer-dialog]'); const form = event.currentTarget; const state = dialog.querySelector('[data-installer-form-state]');
    const submit = form.querySelector('[type="submit"]'); submit.disabled = true; state.textContent = 'Enregistrement…';
    try {
      if (!selectedOrganizationId) throw new Error('Aucune organisation de compte n’est disponible.');
      const selectedCategories = [...form.querySelectorAll('[name="partnerCategory"]:checked')].map((input) => input.value).map(value => installerCategoryOptions.find(option => option.value === value)).filter(Boolean);
      const technologies = [...new Set(selectedCategories.map(option => option.technology).filter(Boolean))];
      const projectTypes = [...new Set(selectedCategories.map(option => option.category))];
      const qualificationLabel = form.elements.qualificationLabel.value.trim();
      const qualification = reviewedInstallerQualifications(formQualifications, qualificationLabel ? { label: qualificationLabel, status: form.elements.qualificationStatus.value, expiresOn: form.elements.qualificationExpiry.value || null, source: form.elements.qualificationSource.value.trim(), checkedAt: new Date().toISOString() } : null);
      const ratingText = form.elements.reviewRating.value.trim();
      const reviewSource = form.elements.reviewSource.value.trim();
      const reviews = (ratingText || reviewSource) ? [{ source: reviewSource, rating: ratingText ? Number(ratingText) : null, count: Number(form.elements.reviewCount.value || 0), url: form.elements.reviewUrl.value.trim(), checkedAt: form.elements.reviewCheckedAt.value || new Date().toISOString().slice(0, 10) }] : [];
      const partner = normalizeInstallerPartner({
        legal_name: form.elements.legalName.value, trade_name: form.elements.tradeName.value,
        siren: form.elements.siren.value, siret: form.elements.siret.value, legal_status: form.elements.legalStatus.value,
        created_on: form.elements.createdOn.value || null, company_source: form.elements.companySource.value,
        company_checked_at: form.elements.companyCheckedAt.value || null, phone: form.elements.phone.value, email: form.elements.email.value,
        website: form.elements.website.value, technologies, project_types: projectTypes, nationwide: form.elements.nationwide.checked,
        coverage_codes: form.elements.coverageCodes.value.split(','), qualifications, reviews,
        network_status: form.elements.networkStatus.value, verified_at: new Date().toISOString(), notes: form.elements.notes.value
      });
      if (partner.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(partner.email)) throw new Error('Vérifiez le courriel professionnel.');
      await client.saveCloudInstallerPartner(await getToken(), selectedOrganizationId, partner, form.elements.partnerId.value || null);
      dialog.close(); await loadPartners(); notify('Fiche partenaire enregistrée.');
    } catch (error) { state.textContent = error.message || 'Impossible d’enregistrer cette fiche.'; }
    finally { submit.disabled = false; }
  }
  function renderDirectory() {
    if (!host) return;
    renderOrganizations();
    const list = host.querySelector('[data-installer-list]'); const count = host.querySelector('[data-installer-count]');
    if (!list || !count) return;
    list.replaceChildren(); count.textContent = loading ? 'Chargement…' : directoryUnavailable ? 'Réseau OZENO non disponible' : `${partners.length} partenaire${partners.length === 1 ? '' : 's'}`;
    if (!partners.length) {
      list.append(element('p', directoryUnavailable ? 'Le réseau enregistré n’a pas pu être chargé. Cela ne signifie pas qu’il est vide. Vous pouvez réessayer ou ajouter une fiche.' : loading ? 'Chargement…' : 'Aucun partenaire enregistré dans ce réseau. Ajoutez une fiche partenaire pour constituer le répertoire OZENO.', 'installerEmpty'));
      return;
    }
    partners.forEach((partner) => list.append(makePartnerCard(partner, { editable: true, onEdit: openForm })));
  }
  async function selectForProject(partner) {
    const project = currentProject;
    if (!project?.id || project.scope !== 'cloud' || !selectedOrganizationId) {
      setProjectState('Enregistrez ce projet dans le compte pour conserver l’attribution au dossier.', true); return;
    }
    const prior = currentOpportunities.find((item) => item.partner_id === partner.id);
    if (prior) { setProjectState('Ce partenaire est déjà rattaché au dossier.'); return; }
    try {
      await client.recordCloudInstallerOpportunity(await getToken(), {
        organization_id: selectedOrganizationId, project_id: project.id, partner_id: partner.id,
        source_type: 'PRESTUDY', source_reference: project.reference || project.name || '',
        source_note: 'Partenaire retenu par le mandataire depuis la pré-étude. Aucune coordonnée de prospect n’est transmise par cette action.',
        status: 'SELECTED'
      });
      currentOpportunities = await client.cloudInstallerOpportunities(await getToken(), project.id) || [];
      renderProjectSuggestions(); setProjectState('Partenaire rattaché en interne au dossier. Aucune information ne lui est transmise. Une proposition externe nécessitera les accords de partenariat et de non-contournement, dont le processus reste à définir.');
    } catch (error) { setProjectState(error.message || 'Impossible de rattacher ce partenaire au dossier.', true); }
  }
  function setProjectState(message, isError = false) {
    if (!projectHost) return;
    const state = projectHost.querySelector('[data-installer-project-state]');
    if (state) { state.textContent = message; state.classList.toggle('isError', isError); }
  }
  async function loadProjectOpportunities(project) {
    currentOpportunities = [];
    if (project?.scope === 'cloud' && project.id) {
      try { currentOpportunities = await client.cloudInstallerOpportunities(await getToken(), project.id) || []; }
      catch { currentOpportunities = []; }
    }
  }
  function renderProjectSuggestions() {
    if (!projectHost) return;
    const project = currentProject;
    const postal = currentPostalCode;
    const department = departmentFromProject(project, postal);
    const categorySelect = projectHost.querySelector('[data-installer-project-category]');
    const partnerSelect = projectHost.querySelector('[data-installer-project-partner]');
    const detailsPanel = projectHost.querySelector('[data-installer-project-details]');
    if (!categorySelect || !partnerSelect || !detailsPanel) return;
    const detailsButton = projectHost.querySelector('[data-installer-project-details-toggle]');
    const selectedCategory = installerCategoryOptions.find(option => option.value === categorySelect.value);
    const list = projectHost.querySelector('[data-installer-suggestions]');
    if (directoryUnavailable || !directoryLoaded) {
      partnerSelect.replaceChildren(new Option(loading ? 'Chargement du répertoire…' : 'Répertoire OZENO indisponible', ''));
      partnerSelect.disabled = true;
      if (detailsButton) detailsButton.disabled = true;
      projectHost.querySelector('[data-installer-suggestion-count]').textContent = 'Partenaires référencés non évalués';
      list.replaceChildren(element('p', loading ? 'Lecture du répertoire OZENO…' : 'Le répertoire OZENO n’a pas pu être chargé. Aucune recherche publique n’est proposée dans la pré-étude.', 'installerEmpty'));
      list.hidden = false;
      return;
    }
    const categoriesFor = partner => partner.project_types?.length ? partner.project_types : ['INSTALLER'];
    const matching = selectedCategory ? partners.filter(partner => {
      if (partner.network_status !== 'REFERENCED') return false;
      if (!categoriesFor(partner).includes(selectedCategory.category)) return false;
      if (selectedCategory.technology && !(partner.technologies || []).includes(selectedCategory.technology)) return false;
      if (partner.nationwide) return true;
      const codes = (partner.coverage_codes || []).map(normalizeCode);
      return (postal && codes.includes(normalizeCode(postal))) || (department && codes.includes(normalizeCode(department)));
    }).sort((a, b) => String(a.trade_name || a.legal_name).localeCompare(String(b.trade_name || b.legal_name), 'fr')) : [];
    const priorSelection = partnerSelect.value;
    partnerSelect.replaceChildren(new Option(matching.length ? 'Choisir un partenaire référencé' : 'Aucun partenaire référencé dans cette zone', ''));
    matching.forEach(partner => partnerSelect.add(new Option(partner.trade_name || partner.legal_name, partner.id)));
    partnerSelect.disabled = matching.length === 0;
    if (matching.some(partner => partner.id === priorSelection)) partnerSelect.value = priorSelection;
    if (detailsButton) detailsButton.disabled = !partnerSelect.value;
    projectHost.querySelector('[data-installer-suggestion-count]').textContent = `${matching.length} partenaire${matching.length === 1 ? '' : 's'} référencé${matching.length === 1 ? '' : 's'} pour cette prestation et cette zone`;
    projectHost.querySelector('[data-installer-postcode-help]').textContent = postal
      ? `Zone du site : ${postal}${department ? ` · département ${department}` : ''}. Seuls les partenaires OZENO référencés sont proposés.`
      : 'Le code postal du projet est nécessaire pour filtrer les partenaires par zone.';
    if (!matching.length) {
      list.replaceChildren(element('p', 'Aucun partenaire OZENO référencé ne correspond à cette prestation et à la zone du projet. Les annuaires publics restent consultables depuis le tableau de bord, rubrique Partenaires.', 'installerEmpty'));
      list.hidden = false;
      detailsPanel.hidden = true;
      return;
    }
    detailsPanel.hidden = true;
    const detailsToggle = projectHost.querySelector('[data-installer-project-details-toggle]');
    if (detailsToggle) detailsToggle.textContent = 'Détails du partenaire';
    list.replaceChildren();
    list.hidden = true;
  }
  function attachProjectSuggestions(project, organizationId = '') {
    currentProject = project || getProject();
    if (!currentProject) return;
    projectHost = document.querySelector('[data-installer-prestudy]');
    const summary = document.getElementById('ozeno-summary') || document.querySelector('.decision');
    let partnerSlot = localV10() ? document.getElementById('ooiPartnersSlot') : null;
    if (localV10() && !partnerSlot) {
      const surfaces = document.getElementById('audit-roof');
      if (surfaces) { partnerSlot = element('section', '', 'ooiPartnersSlot'); partnerSlot.id = 'ooiPartnersSlot'; surfaces.append(partnerSlot); }
    }
    if (!projectHost) {
      projectHost = element('section', '', 'installerPrestudyPanel'); projectHost.dataset.installerPrestudy = 'true';
      // The summary root is hidden by the chapter navigator on every other step.
      // Keep the partner module inside it instead of appending a visible sibling.
      if (partnerSlot) partnerSlot.prepend(projectHost);
      else if (summary) summary.append(projectHost); else (document.querySelector('main') || document.body).append(projectHost);
    }
    // Repair a host created by an earlier integration that placed it beside the summary.
    if (partnerSlot) { if (!partnerSlot.contains(projectHost)) partnerSlot.prepend(projectHost); }
    else if (summary && !summary.contains(projectHost)) summary.append(projectHost);
    if (!projectHost.dataset.mounted) {
      projectHost.dataset.mounted = 'true';
      projectHost.innerHTML = `<div class="installerPrestudyHead"><div><p class="installerEyebrow">RÉSEAU PARTENAIRES</p><h2>Partenaires pour étude et devis <span data-installer-site-locality>· Localité du site étudié : —</span></h2><p>Répertoire administré dans le tableau de bord. Seuls les partenaires référencés par OZENO apparaissent ici.</p></div></div><p class="installerAgreementNotice">Seuls les partenaires référencés par OZENO peuvent être proposés au projet. Les contrats de partenariat et de non-contournement restent un prérequis avant toute transmission ou proposition externe ; leur suivi contractuel n’est pas encore enregistré dans cette fiche.</p><div class="installerProjectSelection"><label>Type de prestation<select data-installer-project-category aria-label="Type de prestation">${installerCategoryOptions.map(option => `<option value="${option.value}">${option.label}</option>`).join('')}</select></label><label>Partenaire référencé<select data-installer-project-partner aria-label="Partenaire référencé"><option value="">Lecture du répertoire…</option></select></label><button type="button" class="hubSecondary" data-installer-project-details-toggle disabled>Détails du partenaire</button></div><p class="installerMuted" data-installer-postcode-help></p><p class="installerMuted" data-installer-suggestion-count role="status" aria-live="polite"></p><p class="installerStatus" data-installer-project-state role="status" aria-live="polite"></p><div class="installerSuggestionList" data-installer-suggestions hidden></div><div data-installer-project-details hidden></div>`;
      projectHost.querySelector('[data-installer-project-category]').addEventListener('change', () => { projectHost.querySelector('[data-installer-project-details]').hidden = true; renderProjectSuggestions(); });
      projectHost.querySelector('[data-installer-project-partner]').addEventListener('change', () => { projectHost.querySelector('[data-installer-project-details-toggle]').disabled = !projectHost.querySelector('[data-installer-project-partner]').value; projectHost.querySelector('[data-installer-project-details]').hidden = true; renderProjectSuggestions(); });
      projectHost.querySelector('[data-installer-project-details-toggle]').addEventListener('click', () => {
        const chosen = partners.find(partner => partner.id === projectHost.querySelector('[data-installer-project-partner]').value && partner.network_status === 'REFERENCED');
        const panel = projectHost.querySelector('[data-installer-project-details]');
        if (!chosen) return;
        if (!panel.hidden) { panel.hidden = true; projectHost.querySelector('[data-installer-project-details-toggle]').textContent = 'Détails du partenaire'; return; }
        const selected = currentOpportunities.some(item => item.partner_id === chosen.id);
        panel.replaceChildren(makePartnerCard(chosen, { project: currentProject, selected, onSelect: selectForProject }));
        panel.hidden = false;
        projectHost.querySelector('[data-installer-project-details-toggle]').textContent = 'Masquer les détails';
      });
    }
    const canonicalProject = getCanonicalProject();
    const canonicalSite = canonicalProject?.id && canonicalProject.id === currentProject.id ? canonicalProject : null;
    const postalCode = projectPostalCode(currentProject, canonicalSite);
    currentPostalCode = postalCode;
    projectHost.querySelector('[data-installer-site-locality]').textContent = `· Localité du site étudié : ${postalCode || 'code postal non renseigné'}`;
    const orgId = organizationId || currentProject.organizationId || selectedOrganizationId || getOrganizations()[0]?.id || '';
    const detailsButton = projectHost.querySelector('[data-installer-project-details-toggle]');
    if (detailsButton) detailsButton.disabled = !projectHost.querySelector('[data-installer-project-partner]')?.value;
    if (orgId && (orgId !== selectedOrganizationId || (!directoryLoaded && !loading && !directoryUnavailable))) { selectedOrganizationId = orgId; loadPartners(); }
    loadProjectOpportunities(currentProject).then(renderProjectSuggestions);
    renderProjectSuggestions();
  }
  function mountDirectory() {
    if (!host) return;
    if (!host.dataset.mounted) {
      host.dataset.mounted = 'true';
      host.innerHTML = `<div class="hubDashboardIntro installerDirectoryIntro"><div><p class="ozenoEyebrow">ESPACE COMMERCIAL / RÉSEAU</p><h1>Partenaires</h1><p>Répertoire central des partenaires et candidats de votre organisation.</p></div><button type="button" class="hubPrimary" data-installer-add>Ajouter un partenaire</button></div><section class="installerAgreementNotice installerAgreementNoticeDirectory"><strong>Pré-requis avant toute proposition de projet</strong><span>Chaque partenaire devra disposer d’un contrat de partenariat et d’un accord de non-contournement. Les contrats et le processus restent à définir. Le statut « Partenaire référencé » dans l’annuaire ne vaut pas signature de ces accords. Aucune proposition de projet n’est envoyée depuis ce répertoire.</span></section><section class="hubProjectPanel installerDirectoryPanel"><div class="installerToolbar"><label>Organisation<select data-installer-org aria-label="Organisation"></select></label><span data-installer-count>0 partenaires</span></div><p data-installer-state class="installerStatus" role="status" aria-live="polite" hidden></p><div class="installerDirectoryList" data-installer-list></div></section><dialog class="installerDialog" data-installer-dialog aria-labelledby="installerDialogTitle"><div class="installerDialogHead"><h2 data-installer-dialog-title id="installerDialogTitle">Ajouter un partenaire</h2><button type="button" class="hubSecondary" data-installer-close>Fermer</button></div><form class="installerForm"><input type="hidden" name="partnerId"><div class="installerFormGrid"><label>Raison sociale *<input name="legalName" maxlength="200" required></label><label>Nom commercial<input name="tradeName" maxlength="200"></label><label>SIREN<input name="siren" inputmode="numeric" maxlength="9"></label><label>SIRET de l’agence<input name="siret" inputmode="numeric" maxlength="14"></label><label>Statut entreprise<select name="legalStatus"><option>À vérifier</option><option>Actif</option><option>Fermé</option></select></label><label>Date de création<input name="createdOn" type="date"></label><label>Source société<input name="companySource" maxlength="300" placeholder="Annuaire des entreprises, document…"></label><label>Date de vérification société<input name="companyCheckedAt" type="date"></label><label>Téléphone professionnel<input name="phone" type="tel" maxlength="80"></label><label>E-mail professionnel<input name="email" type="email" maxlength="254"></label><label class="installerFormWide">Site web<input name="website" type="url" maxlength="500" placeholder="https://"></label><fieldset class="installerFormWide installerCategoryFieldset"><legend>Catégories de partenaire</legend><p>Choisissez les métiers et prestations que ce partenaire peut couvrir. Les métiers hors installation sont référencés et suivis par OZENO.</p>${installerCategoryOptions.map(({value, label}) => `<label><input type="checkbox" name="partnerCategory" value="${value}">${label}</label>`).join('')}</fieldset><label class="installerFormWide">Départements ou codes postaux couverts<input name="coverageCodes" placeholder="75, 92, 69001"><small>Pour un réseau national, cochez la case ci-dessous.</small></label><label class="installerFormWide"><input name="nationwide" type="checkbox">Intervient sur toute la France</label><label>Qualification principale<input name="qualificationLabel" placeholder="QualiPV, QualiPAC, IRVE…"></label><label>État de la qualification<select name="qualificationStatus"><option value="PENDING">À vérifier</option><option value="VALID">Vérifiée valide</option><option value="EXPIRED">Expirée</option></select></label><label>Date d’échéance<input name="qualificationExpiry" type="date"></label><label>Source de vérification<input name="qualificationSource" placeholder="Annuaire ou document"></label><label>Source de la note<input name="reviewSource" placeholder="Google ou autre source vérifiable"></label><label>Note client<input name="reviewRating" type="number" min="0" max="5" step="0.1"></label><label>Nombre d’avis<input name="reviewCount" type="number" min="0" step="1"></label><label class="installerFormWide">Lien des avis<input name="reviewUrl" type="url" placeholder="https://"></label><label>Date de vérification de la note<input name="reviewCheckedAt" type="date"></label><label>Statut réseau<select name="networkStatus"><option value="CANDIDATE">À évaluer</option><option value="REFERENCED">Partenaire référencé</option><option value="SUSPENDED">Suspendu</option><option value="ARCHIVED">Archivé</option></select></label><label class="installerFormWide">Notes internes<textarea name="notes" maxlength="4000" rows="3"></textarea></label></div><p class="installerFormState" data-installer-form-state role="status" aria-live="polite"></p><div class="installerFormActions"><button type="button" class="hubSecondary" data-installer-cancel>Annuler</button><button type="submit" class="hubPrimary">Enregistrer la fiche</button></div></form></dialog>`;
      host.querySelector('[data-installer-add]').addEventListener('click', () => openForm());
      host.querySelector('[data-installer-close]').addEventListener('click', () => host.querySelector('[data-installer-dialog]').close());
      host.querySelector('[data-installer-cancel]').addEventListener('click', () => host.querySelector('[data-installer-dialog]').close());
      host.querySelector('.installerForm').addEventListener('submit', saveForm);
      organizationSelect().addEventListener('change', (event) => { selectedOrganizationId = event.target.value; loadPartners(); });
    }
    if (globalThis.SOLARSHIFT_CONFIG?.installerDirectoryEndpoint && !publicDirectory) {
      const panel = host.querySelector('.installerDirectoryPanel');
      const publicHost = element('div'); panel.before(publicHost);
      publicDirectory = mountPublicInstallerSearch(publicHost, { renderCard: makePartnerCard, getPartners: () => partners,
        onAdd: partner => {
          if (!directoryLoaded || directoryUnavailable) { setState('L’enregistrement dans le réseau OZENO nécessite l’installation de son stockage dans cet environnement.', true); return; }
          openForm(publicInstallerDraft(partner));
        } });
    }
    renderOrganizations(); loadPartners();
  }
  return {
    mountDirectory,
    attachProjectSuggestions,
    selectDashboardModule() { mountDirectory(); },
    setOrganizations(organizations) { renderOrganizations(); if (!selectedOrganizationId && organizations?.[0]) selectedOrganizationId = organizations[0].id; },
    destroy() { destroyed = true; loadGeneration++; publicDirectory?.destroy(); css.remove(); }
  };
}
