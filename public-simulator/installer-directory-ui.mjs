import { fetchPublicInstallerDirectory, mergePublicInstallerPartners } from './installer-directory-client.mjs';

export const installerCategoryOptions = Object.freeze([
  { value: 'INSTALLER_PV', label: 'Installateur · Photovoltaïque', category: 'INSTALLER', technology: 'PV' },
  { value: 'INSTALLER_BATTERY', label: 'Installateur · Batterie', category: 'INSTALLER', technology: 'BATTERY' },
  { value: 'INSTALLER_PAC', label: 'Installateur · Pompe à chaleur', category: 'INSTALLER', technology: 'PAC' },
  { value: 'INSTALLER_IRVE', label: 'Installateur · Borne IRVE', category: 'INSTALLER', technology: 'IRVE' },
  { value: 'INSTALLER_OTHER', label: 'Installateur · Autre prestation', category: 'INSTALLER', technology: '' },
  { value: 'ENERGY_STUDY', label: 'Bureau d’étude énergétique', category: 'ENERGY_STUDY', technology: '' },
  { value: 'TECHNICAL_STUDY', label: 'Bureau d’étude technique', category: 'TECHNICAL_STUDY', technology: '' },
  { value: 'MAINTENANCE', label: 'Entretien', category: 'MAINTENANCE', technology: '' },
  { value: 'WORKS', label: 'Travaux', category: 'WORKS', technology: '' }
]);
const categoryByValue = new Map(installerCategoryOptions.map(item => [item.value, item]));
const labels = { PV: 'Photovoltaïque', PAC: 'Pompe à chaleur', BATTERY: 'Batterie', IRVE: 'Borne IRVE' };
const node = (tag, text = '', className = '') => { const result = document.createElement(tag); result.textContent = text; result.className = className; return result; };

const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
const partnerReviews = partner => [...(partner?.reviews || []), ...(partner?.known_partner?.reviews || [])];
const hasReview = partner => partnerReviews(partner).some(review => review.rating != null && Number.isFinite(Number(review.rating)) && Number(review.rating) >= 0 && Number(review.rating) <= 5);
const hasRge = (partner, technologies = []) => {
  const today = new Date().toISOString().slice(0, 10);
  return (partner?.qualifications || []).some(item => {
    if (item.status !== 'VALID' || (item.startsOn && item.startsOn > today) || (item.expiresOn && item.expiresOn < today)) return false;
    if (technologies.length && item.technology && !technologies.includes(item.technology)) return false;
    const rgeQualification = /rge|qualipv|qualipac|qualifelec/i.test(`${item.label || ''} ${item.issuer || ''} ${item.domain || ''}`);
    return partner?.source_kind === 'PUBLIC_RGE' || rgeQualification;
  });
};
function localPartnersForSearch(partners, postalCode, scope, selectedCategories) {
  const postcode = String(postalCode || '').replace(/\D/g, '').slice(0, 5);
  const department = postcode.startsWith('97') || postcode.startsWith('98') ? postcode.slice(0, 3) : postcode.slice(0, 2);
  return (partners || []).filter(partner => {
    if (!['CANDIDATE', 'REFERENCED'].includes(partner.network_status)) return false;
    const categories = partner.project_types?.length ? partner.project_types : ['INSTALLER'];
    if (selectedCategories.length && !selectedCategories.every(value => {
      const option = categoryByValue.get(value);
      return option && categories.includes(option.category) && (!option.technology || (partner.technologies || []).includes(option.technology));
    })) return false;
    if (partner.nationwide) return true;
    const codes = (partner.coverage_codes || []).map(value => String(value).trim().toUpperCase());
    return scope === 'postal' ? codes.includes(postcode) : codes.includes(department) || codes.includes(postcode);
  });
}

export function mountPublicInstallerSearch(host, { renderCard, getPartners = () => [], fetchDirectory = fetchPublicInstallerDirectory, onAdd, onSelect, getProject = () => null, isSelected = () => false, contextManaged = false } = {}) {
  const section = node('section', '', 'installerPublicDirectory');
  section.innerHTML = `<div class="installerPublicHeading"><p class="installerEyebrow">PRESTATAIRES LOCAUX</p><h2>Recherche globale</h2><p>Annuaire RGE public et réseau OZENO réunis dans les mêmes résultats. Les qualifications et la zone d’intervention restent à vérifier pour le chantier.</p></div><form class="installerPublicSearch"><label class="installerGlobalQuery">Recherche un prestataire<input name="publicInstallerQuery" type="search" data-local-filter placeholder="Entreprise, adresse ou ville" autocomplete="off"></label><label data-public-postal-wrap>Code postal<input name="publicInstallerPostal" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" required placeholder="Code postal du site"></label><label data-public-scope-wrap>Zone<select name="publicInstallerScope"><option value="department">Département</option><option value="region" hidden>Région du site</option><option value="postal">Code postal exact</option></select></label><fieldset data-public-category-wrap><legend>Catégories de partenaire recherchées</legend>${installerCategoryOptions.map(({ value, label }) => `<label><input type="checkbox" name="publicInstallerCategory" value="${value}" data-search-criterion ${value === 'INSTALLER_PV' ? 'checked' : ''}>${label}</label>`).join('')}</fieldset><fieldset class="installerSearchFilters" data-public-filters-wrap hidden><legend>Filtres</legend><label data-public-rge-filter-wrap><input type="checkbox" name="publicInstallerRge" data-local-filter> RGE</label><label data-public-review-filter-wrap><input type="checkbox" name="publicInstallerReviews" data-local-filter> Notes</label></fieldset><button class="hubPrimary" type="submit">Rechercher</button></form><p class="installerMuted installerFilterHint" data-public-rge-hint hidden></p><p class="installerStatus" data-public-installer-status role="status" aria-live="polite">Indiquez un code postal pour consulter les prestataires locaux.</p><p class="installerMuted" data-public-installer-source></p><div class="installerDirectoryList" data-public-installer-list role="region" aria-label="Résultats des prestataires locaux" tabindex="0"></div>`;
  section.querySelectorAll('input,select').forEach(input => { input.dataset.suppressProjectDirty = 'true'; });
  host.append(section);
  const form = section.querySelector('form'), state = section.querySelector('[data-public-installer-status]'), source = section.querySelector('[data-public-installer-source]');
  if (contextManaged) {
    section.classList.add('installerPublicContextManaged');
    form.elements.publicInstallerPostal.disabled = true;
    form.elements.publicInstallerPostal.closest('label').hidden = true;
    form.querySelector('[data-public-scope-wrap]').hidden = true;
  }
  const list = section.querySelector('[data-public-installer-list]'), submit = form.querySelector('[type=submit]');
  let controller, generation = 0, result = null, resultLabel = '', lastContext = '', disposed = false;
  function render() {
    list.replaceChildren();
    const selectedCategories = [...form.querySelectorAll('[name=publicInstallerCategory]:checked')].map(input => input.value);
    const selectedTechnologies = selectedCategories.map(value => categoryByValue.get(value)?.technology).filter(Boolean);
    const coversSelectedTechnologies = partner => {
      const available = new Set([...(partner.technologies || []), ...(partner.known_partner?.technologies || [])]);
      const categories = partner.project_types?.length ? partner.project_types : ['INSTALLER'];
      return !selectedCategories.length || selectedCategories.every(value => {
        const option = categoryByValue.get(value);
        return option && categories.includes(option.category) && (!option.technology || available.has(option.technology));
      });
    };
    const activeScope = form.elements.publicInstallerScope.value === 'region' ? 'department' : form.elements.publicInstallerScope.value;
    const privateMatches = localPartnersForSearch(getPartners(), form.elements.publicInstallerPostal.value, activeScope, selectedCategories);
    const publicMatches = result?.partners || [];
    const partners = mergePublicInstallerPartners(publicMatches, getPartners()).filter(coversSelectedTechnologies);
    const seen = new Set(partners.map(partner => partner.siret ? `siret:${partner.siret}` : `id:${partner.id}`));
    privateMatches.forEach(partner => {
      const key = partner.siret ? `siret:${partner.siret}` : `id:${partner.id}`;
      if (!seen.has(key)) { seen.add(key); partners.push(partner); }
    });
    const rgeFilterWrap = section.querySelector('[data-public-rge-filter-wrap]');
    const reviewFilterWrap = section.querySelector('[data-public-review-filter-wrap]');
    const rgeHint = section.querySelector('[data-public-rge-hint]');
    const rgeMatchCount = partners.filter(partner => hasRge(partner, selectedTechnologies)).length;
    const allResultsRge = partners.length > 0 && rgeMatchCount === partners.length;
    const mixedRgeResults = rgeMatchCount > 0 && !allResultsRge;
    const notesAvailable = partners.some(hasReview);
    rgeFilterWrap.hidden = !mixedRgeResults;
    rgeHint.hidden = !partners.length || mixedRgeResults;
    rgeHint.textContent = allResultsRge
      ? 'Tous les prestataires de cette recherche ont une qualification RGE valide vérifiée ; le filtre est masqué.'
      : rgeMatchCount === 0 && partners.length
        ? 'Aucune qualification RGE en cours de validité n’est vérifiable pour cette sélection ; consultez les certificats.'
        : '';
    reviewFilterWrap.hidden = !notesAvailable;
    section.querySelector('[data-public-filters-wrap]').hidden = rgeFilterWrap.hidden && reviewFilterWrap.hidden;
    if (!mixedRgeResults) form.elements.publicInstallerRge.checked = false;
    if (!notesAvailable) form.elements.publicInstallerReviews.checked = false;
    const query = normalized(form.elements.publicInstallerQuery.value.trim());
    const rgeOnly = form.elements.publicInstallerRge.checked, reviewedOnly = form.elements.publicInstallerReviews.checked;
    const visible = partners.filter(partner => {
      const haystack = normalized([partner.trade_name, partner.legal_name, partner.address, partner.postal_code, partner.city].filter(Boolean).join(' '));
      return (!query || haystack.includes(query)) && (!rgeOnly || hasRge(partner, selectedTechnologies)) && (!reviewedOnly || hasReview(partner));
    });
    const project = getProject();
    visible.forEach(partner => list.append(renderCard(partner, { onAdd, onSelect, project, selected: isSelected(partner) })));
    if (!result) {
      if (privateMatches.length) state.textContent = `${visible.length} partenaire${visible.length === 1 ? '' : 's'} OZENO dans la zone · recherche publique à lancer.`;
      return;
    }
    const activeFilters = [query, rgeOnly && 'RGE', reviewedOnly && 'Notes'].filter(Boolean).length;
    const zone = result.metadata.scope === 'postal' ? `code postal ${result.metadata.postalCode}` : result.metadata.scope === 'region' && result.metadata.regionName ? `région ${result.metadata.regionName}` : `département ${result.metadata.prefix}`;
    const summary = partners.length
      ? `${partners.length} prestataire${partners.length > 1 ? 's' : ''} dans les résultats · ${zone}${result.metadata.partial ? ' · sélection partielle' : ''}`
      : resultLabel;
    state.textContent = activeFilters ? `${visible.length} résultat${visible.length > 1 ? 's' : ''} affiché${visible.length > 1 ? 's' : ''} sur ${partners.length} · ${zone}` : summary;
  }
  function invalidate(message) {
    generation++; controller?.abort(); controller = null; result = null;
    resultLabel = ''; state.textContent = message; state.classList.remove('isError'); source.textContent = ''; submit.disabled = false;
    render();
  }
  let searchTimer;
  function updateScopeForTechnology() {
    const scope = form.elements.publicInstallerScope;
    const selected = [...form.querySelectorAll('[name=publicInstallerCategory]:checked')].map(input => categoryByValue.get(input.value)?.technology).filter(Boolean);
    const batteryOnly = selected.length === 1 && selected[0] === 'BATTERY';
    const regionOption = [...scope.options].find(option => option.value === 'region');
    if (regionOption) regionOption.hidden = !batteryOnly;
    if (contextManaged) { scope.value = batteryOnly ? 'region' : 'department'; return; }
    if (batteryOnly && !scope.dataset.userSelected) { scope.value = 'region'; scope.dataset.autoRegion = 'true'; }
    else if (!batteryOnly && scope.dataset.autoRegion === 'true') { scope.value = 'department'; delete scope.dataset.autoRegion; }
  }
  function scheduleSearch() { clearTimeout(searchTimer); searchTimer = setTimeout(() => search(), 250); }
  async function search() {
    invalidate('Consultation des annuaires de prestataires…');
    updateScopeForTechnology();
    const postalCode = form.elements.publicInstallerPostal.value.trim();
    const selectedCategories = [...form.querySelectorAll('[name=publicInstallerCategory]:checked')].map(input => input.value);
    const technologies = selectedCategories.map(value => categoryByValue.get(value)?.technology).filter(Boolean);
    if (!/^\d{5}$/.test(postalCode)) { state.textContent = 'Indiquez un code postal de cinq chiffres.'; return; }
    if (!selectedCategories.length) { state.textContent = 'Choisissez au moins une catégorie de partenaire.'; return; }
    if (!technologies.length) {
      result = { partners: [], metadata: { source: 'Réseau OZENO uniquement', observedAt: new Date().toISOString(), scope: form.elements.publicInstallerScope.value, prefix: postalCode.slice(0, 2) } };
      resultLabel = 'Aucune source publique n’est raccordée pour ces catégories ; le réseau OZENO a été consulté.';
      render(); return;
    }
    const run = generation; controller = new AbortController(); submit.disabled = true;
    try {
      const data = await fetchDirectory({ postalCode, technologies, scope: form.elements.publicInstallerScope.value }, { signal: controller.signal });
      if (run !== generation || disposed) return;
      result = data;
      const unsupported = data.metadata.unsupportedTechnologies || [];
      const unavailable = data.metadata.unavailableTechnologies || [];
      const zone = data.metadata.scope === 'postal' ? `code postal ${postalCode}` : data.metadata.scope === 'region' && data.metadata.regionName ? `région ${data.metadata.regionName}` : data.metadata.prefix === '20' ? 'Corse (codes postaux 20xxx)' : `département ${data.metadata.prefix}`;
      const count = data.partners.length;
      resultLabel = data.status === 'UNSUPPORTED' ? 'Source publique non raccordée pour les prestations choisies.'
        : count ? `${count} établissement${count > 1 ? 's' : ''} recensé${count > 1 ? 's' : ''} · ${zone}${data.metadata.partial ? ' · sélection partielle' : ''}`
          : `Aucun établissement trouvé dans les sources consultées pour le ${zone}${data.metadata.partial ? ' · recherche partielle' : ''}. Cela ne signifie pas qu’aucun prestataire n’existe.`;
      state.textContent = resultLabel;
      source.textContent = `${data.metadata.source} · consulté le ${new Date(data.metadata.observedAt).toLocaleDateString('fr-FR')}.${data.metadata.scope === 'region' ? ` Recherche élargie à la région ${data.metadata.regionName || ''}; premier lot consulté dans chaque département, résultats potentiellement partiels.` : data.metadata.regionUnavailable ? ' Région non déterminée pour ce code postal : recherche limitée au département.' : ''}${data.metadata.sources?.some(item => item.id === 'QUALIFELEC') ? ' Qualifelec : validité et dates à vérifier sur les certificats; mention Stockage limitée aux systèmes couplés au photovoltaïque.' : ''}${unsupported.length ? ` Source non raccordée : ${unsupported.map(code => labels[code] || code).join(', ')}.` : ''}${unavailable.length ? ` Source momentanément indisponible pour : ${unavailable.map(code => labels[code] || code).join(', ')}.` : ''}${data.metadata.partial ? ' Résultats non exhaustifs.' : ''}`;
      render();
    } catch (error) {
      if (run !== generation || disposed) return;
      state.textContent = error.message || 'La recherche est indisponible. Réessayez.'; state.classList.add('isError');
    } finally { if (run === generation && !disposed) submit.disabled = false; }
  }
  form.addEventListener('submit', event => { event.preventDefault(); search(); });
  form.addEventListener('input', event => { if (event.target.matches('[data-local-filter]')) render(); else if (event.target.matches('input,select') && event.target.type !== 'submit') invalidate('Recherche à actualiser : les critères ont changé.'); });
  form.addEventListener('change', event => {
    if (event.target.matches('[data-local-filter]')) render();
    else if (event.target.matches('[data-search-criterion]')) { updateScopeForTechnology(); scheduleSearch(); }
    else if (event.target === form.elements.publicInstallerScope) { scopeManuallyChanged(); scheduleSearch(); }
    else if (event.target.matches('input,select')) scheduleSearch();
  });
  function scopeManuallyChanged() { delete form.elements.publicInstallerScope.dataset.autoRegion; form.elements.publicInstallerScope.dataset.userSelected = 'true'; }
  return {
    updateContext({ postalCode = '', technologies = null } = {}) {
      const selectedTechnologies = Array.isArray(technologies) ? technologies : [...form.querySelectorAll('[name=publicInstallerCategory]:checked')].map(input => categoryByValue.get(input.value)?.technology).filter(Boolean);
      const key = JSON.stringify([postalCode, selectedTechnologies]);
      if (key === lastContext) return;
      lastContext = key;
      form.elements.publicInstallerPostal.value = postalCode;
      if (Array.isArray(technologies)) form.querySelectorAll('[name=publicInstallerCategory]').forEach(input => { const option = categoryByValue.get(input.value); input.checked = option.technology ? technologies.includes(option.technology) : false; });
      updateScopeForTechnology();
      if (/^\d{5}$/.test(postalCode)) search(); else invalidate('Le code postal du site n’est pas encore disponible.');
    },
    refreshPartners: render,
    destroy() { disposed = true; invalidate(''); section.remove(); }
  };
}
