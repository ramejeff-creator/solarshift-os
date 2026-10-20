const $ = (root, selector) => root.querySelector(selector);

function number(value) {
  return Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

async function postPreview(endpoint, payload, config) {
  const local = endpoint.startsWith('/__local/');
  const headers = { 'Content-Type': 'application/json' };
  if (!local) {
    const token = typeof config.getAccessToken === 'function' ? await config.getAccessToken() : config.sessionToken;
    if (!token) throw new Error('Connectez-vous pour utiliser les profils de charge synthétiques.');
    headers.apikey = config.supabasePublishableKey || '';
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(60_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Service de profils indisponible (${response.status}).`);
  return data;
}

/** Mounts an opt-in, non-persistent selector for Enedis synthetic profiles. */
export function mountEnedisSyntheticProfilePicker({ container, getAnnualConsumption, getCustomerClass = () => null, config = window.SOLARSHIFT_CONFIG || {} } = {}) {
  if (!container || container.dataset.syntheticPickerReady === 'true') return;
  container.dataset.syntheticPickerReady = 'true';
  container.className = 'enedisSyntheticPicker';
  container.innerHTML = `<h3>Profil de charge synthétique Enedis · facultatif</h3>
    <p class="fine">Après validation ou sélection de la consommation ci-dessus, le profil fictif le plus proche est chargé automatiquement et le graphique est actualisé. Si la puissance souscrite est renseignée, elle détermine la catégorie Enedis ; sinon, la recherche compare ENT et PRO.</p>
    <p class="fine syntheticConsumptionWarning" data-synthetic-warning role="alert">Validez une consommation annuelle positive pour charger un profil.</p>
    <p class="fine" data-synthetic-status role="status" aria-live="polite"></p>
    <button type="button" class="secondary" data-synthetic-retry hidden>Réessayer le chargement du profil</button>
    <p class="fine" data-synthetic-provenance hidden></p>`;

  const status = $(container, '[data-synthetic-status]');
  const warning = $(container, '[data-synthetic-warning]');
  const provenance = $(container, '[data-synthetic-provenance]');
  const retry = $(container, '[data-synthetic-retry]');
  let requestSequence = 0;
  let requestedKey = '';

  function syncConsumptionState() {
    const valid = Number.isFinite(getAnnualConsumption()) && getAnnualConsumption() > 0;
    warning.hidden = valid;
    warning.textContent = valid ? '' : 'Validez une consommation annuelle positive pour charger un profil.';
    warning.classList.toggle('is-invalid', !valid);
    return valid;
  }

  function clearProfile(message = '') {
    window.SOLARSHIFT_SYNTHETIC_LOAD_PROFILE = null;
    window.dispatchEvent(new CustomEvent('ozeno:synthetic-load-profile', { detail: { profile: null } }));
    provenance.hidden = true;
    provenance.textContent = '';
    if (message) status.textContent = message;
  }

  async function loadProfile(candidate, annualConsumptionKwh, sequence) {
    status.textContent = 'Chargement et validation du profil Enedis…';
    try {
      const result = await postPreview(config.enedisSyntheticProfilePreviewEndpoint, {
        action: 'profile', profile_id: candidate.id, customer_class: candidate.customerClass,
        activity_label: candidate.activityLabel, annual_consumption_kwh: annualConsumptionKwh
      }, config);
      if (sequence !== requestSequence) return;
      const profile = result.profile;
      if (result.status !== 'READY' || !profile?.points?.length) throw new Error(result.error || 'La courbe synthétique n’a pas été validée.');
      window.SOLARSHIFT_SYNTHETIC_LOAD_PROFILE = profile;
      window.dispatchEvent(new CustomEvent('ozeno:synthetic-load-profile', { detail: { profile } }));
      provenance.textContent = `Profil Enedis fictif ${profile.id} · catégorie ${profile.customerClass.toUpperCase()} · ${number(profile.annualConsumptionKwh)} kWh/an après mise à l’échelle. La sélection rapproche les volumes annuels ; elle ne confirme ni l’activité ni les horaires réels. Le profil n’est pas enregistré au projet.`;
      provenance.hidden = false;
      status.textContent = 'Profil le plus proche chargé automatiquement. Il reste une hypothèse de forme de consommation, pas une donnée de compteur.';
    } catch (error) {
      if (sequence === requestSequence) {
        requestedKey = '';
        retry.hidden = false;
        status.textContent = `${error.message} Aucune courbe n’a été retenue. Vous pouvez réessayer ci-dessous.`;
      }
    }
  }

  async function selectBestProfile() {
    retry.hidden = true;
    const annualConsumptionKwh = getAnnualConsumption();
    if (!syncConsumptionState()) {
      requestSequence += 1;
      requestedKey = '';
      clearProfile('Le profil sera proposé après validation de la consommation annuelle.');
      return;
    }
    const declaredClass = getCustomerClass();
    const knownClass = ['ent', 'pro'].includes(declaredClass) ? declaredClass : null;
    const key = `${knownClass || 'ent+pro'}:${annualConsumptionKwh}`;
    if (key === requestedKey) return;
    requestedKey = key;
    const sequence = ++requestSequence;
    clearProfile();
    status.textContent = knownClass
      ? `Recherche du profil le plus proche dans la catégorie ${knownClass.toUpperCase()} déduite de la puissance souscrite…`
      : 'Puissance souscrite non renseignée : comparaison automatique des profils ENT et PRO…';
    try {
      const result = await postPreview(config.enedisSyntheticProfilePreviewEndpoint, {
        action: 'candidates', ...(knownClass ? { customer_class: knownClass } : {}),
        annual_consumption_kwh: annualConsumptionKwh, limit: 1
      }, config);
      if (sequence !== requestSequence) return;
      const candidate = result.catalogue?.candidates?.[0];
      if (!candidate) throw new Error('Aucun profil synthétique disponible pour cette consommation.');
      await loadProfile(candidate, annualConsumptionKwh, sequence);
    } catch (error) {
      if (sequence === requestSequence) {
        requestedKey = '';
        retry.hidden = false;
        status.textContent = `${error.message} Le profil synthétique reste facultatif. Vous pouvez réessayer ci-dessous.`;
      }
    }
  }

  const powerFields = ['prestudyExactPowerKva', 'prestudyPowerBand'].map((id) => document.getElementById(id)).filter(Boolean);
  powerFields.forEach((field) => field.addEventListener('change', () => {
    requestedKey = '';
    void selectBestProfile();
  }));
  const consumption = document.getElementById('cons');
  const invalidate = () => {
    requestSequence += 1;
    requestedKey = '';
    retry.hidden = true;
    clearProfile('Consommation modifiée : cliquez sur « Valider la consommation saisie » ci-dessus pour actualiser le profil et le graphique.');
    syncConsumptionState();
  };
  consumption?.addEventListener('input', invalidate);
  retry.addEventListener('click', () => { requestedKey = ''; void selectBestProfile(); });
  window.addEventListener('ozeno:consumption-reference', () => { void selectBestProfile(); });
  window.addEventListener('ozeno:project-context-loaded', () => {
    invalidate();
    globalThis.setTimeout(() => { void selectBestProfile(); }, 0);
  });

  syncConsumptionState();
  if (Number.isFinite(getAnnualConsumption()) && getAnnualConsumption() > 0) void selectBestProfile();
}
