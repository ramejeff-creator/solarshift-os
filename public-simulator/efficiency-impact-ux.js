(function () {
  'use strict';

  const ENDPOINT = window.SOLARSHIFT_CONFIG?.efficiencyImpactEndpoint || 'https://rniitydsksjrphulrlct.supabase.co/functions/v1/calculate-efficiency-impact';
  const money = (value) => `${Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €`;
  const integer = (value) => Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 0 });

  function addStyles() {
    if (document.getElementById('efficiencyImpactStyles')) return;
    const style = document.createElement('style');
    style.id = 'efficiencyImpactStyles';
    style.textContent = `
      .efficiencyImpact{border-color:#cfe0d5}.efficiencyImpact .efficiencyGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.efficiencyImpact .efficiencyCee{margin-top:14px;border:1px solid #d5e4d8;border-radius:9px;padding:12px}.efficiencyImpact .efficiencyCee summary{cursor:pointer;font-weight:700;color:#0a3f2d}.efficiencyImpact .efficiencyCee .form{margin-top:12px}.efficiencyImpact .efficiencyResults{display:none;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:14px}.efficiencyImpact .efficiencyResults[data-visible="true"]{display:grid}.efficiencyImpact .efficiencyValue{border:1px solid #cfe0d5;border-radius:9px;padding:13px;background:#f5faf7}.efficiencyImpact .efficiencyValue b,.efficiencyImpact .efficiencyValue span,.efficiencyImpact .efficiencyValue small{display:block}.efficiencyImpact .efficiencyValue b{color:#0a3f2d}.efficiencyImpact .efficiencyValue span{margin:5px 0;font-size:21px;font-weight:700;color:#08734c}.efficiencyImpact .efficiencyValue small{color:#587469}.efficiencyImpact .efficiencyStatus{margin-top:12px}.efficiencyImpact .efficiencyStatus.error{color:#8a261d}.efficiencyImpact .fine{line-height:1.45}@media(max-width:700px){.efficiencyImpact .efficiencyGrid,.efficiencyImpact .efficiencyResults{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function moduleMarkup() {
    return `<section id="audit-efficiency" class="card efficiencyImpact">
      <div class="sectionTitle"><h2>Efficacité énergétique, CO₂ & CEE</h2><span class="pill">APERÇU · NON CANONIQUE</span></div>
      <p class="hint">Évaluez une action d’efficacité énergétique en complément du projet solaire. Le CO₂ porte uniquement sur les consommations saisies, pas sur le cycle de vie complet. Cette première estimation n’est pas enregistrée au projet.</p>
      <form id="efficiencyImpactForm">
        <div class="form efficiencyGrid">
          <label>Action envisagée<input name="action" maxlength="160" placeholder="Ex. remplacement d’un équipement de chauffage"></label>
          <label>Énergie concernée (même énergie avant/après)<input name="energyCarrier" maxlength="80" placeholder="Ex. électricité, gaz naturel" required></label>
          <label>Consommation annuelle avant (kWh d’énergie finale)<input name="annualConsumptionBeforeKwh" type="number" min="0" step="any" required></label>
          <label>Consommation annuelle après (kWh d’énergie finale)<input name="annualConsumptionAfterKwh" type="number" min="0" step="any" required></label>
          <label>Facteur d’émission de l’énergie (kgCO₂e/kWh)<input name="emissionFactorKgCo2ePerKwh" type="number" min="0" step="any" required></label>
          <label>Source et version du facteur<input name="emissionFactorSource" maxlength="160" placeholder="Base Empreinte, audit… · version/année" required></label>
          <p class="fine">Le même facteur est appliqué avant et après. Si l’action change de type d’énergie, cette première version ne couvre pas encore ce cas.</p>
        </div>
        <details class="efficiencyCee">
          <summary>Valorisation CEE (facultatif, si une fiche a déjà été identifiée)</summary>
          <p class="fine">Le volume cumac dépend de la fiche officielle et des caractéristiques du projet. Il n’est pas déduit automatiquement des économies annuelles.</p>
          <div class="form efficiencyGrid">
            <label>Référence de la fiche CEE<input name="ceeFicheCode" maxlength="80" placeholder="Code officiel, si confirmé"></label>
            <label>Volume indiqué par la fiche/partenaire (kWh cumac)<input name="ceeVolumeKwhCumac" type="number" min="0" step="any"></label>
            <label>Source du volume<input name="ceeVolumeSource" maxlength="160" placeholder="Fiche applicable ou partenaire"></label>
            <label>Taux proposé (€/MWh cumac)<input name="ceeRateEurPerMwhCumac" type="number" min="0" step="any"></label>
            <label>Source du taux / offre reçue<input name="ceeRateSource" maxlength="160" placeholder="Obligé, délégataire ou partenaire"></label>
            <label>Date de l’offre<input name="ceeRateReferenceDate" maxlength="40" placeholder="Date de référence"></label>
          </div>
        </details>
        <button id="calculateEfficiencyImpact" class="action" type="submit">Calculer l’aperçu</button>
      </form>
      <p id="efficiencyImpactStatus" class="fine efficiencyStatus" role="status" aria-live="polite">Aucun facteur CO₂ ni barème CEE n’est prérempli. Renseignez des valeurs issues d’une source ou d’un audit.</p>
      <div id="efficiencyImpactResults" class="efficiencyResults" data-visible="false" aria-live="polite">
        <div class="efficiencyValue"><b>Économie annuelle</b><span id="efficiencyEnergyResult">—</span><small>Différence avant / après, à périmètre comparable</small></div>
        <div class="efficiencyValue"><b>Variation annuelle des émissions</b><span id="efficiencyCarbonResult">—</span><small>Calculée avec les facteurs saisis</small></div>
        <div class="efficiencyValue"><b>Valorisation CEE</b><span id="efficiencyCeeResult">À qualifier</span><small id="efficiencyCeeStatus">Fiche et conditions d’éligibilité à confirmer</small></div>
      </div>
      <p class="fine">Aperçu non contractuel : il ne confirme ni l’éligibilité, ni l’obtention des CEE. Les émissions évitées et les CEE sont deux indicateurs distincts. Vérifiez les périmètres, les preuves et les conditions de la fiche applicable avant tout engagement.</p>
    </section>`;
  }

  function formData(form) {
    const data = new FormData(form);
    const payload = {};
    data.forEach((value, key) => { payload[key] = typeof value === 'string' ? value.trim() : value; });
    for (const key of ['annualConsumptionBeforeKwh', 'annualConsumptionAfterKwh', 'emissionFactorKgCo2ePerKwh', 'ceeVolumeKwhCumac', 'ceeRateEurPerMwhCumac']) {
      if (payload[key] === '') delete payload[key];
      else if (payload[key] != null) payload[key] = Number(payload[key]);
    }
    return payload;
  }

  async function calculate(form) {
    const button = document.getElementById('calculateEfficiencyImpact');
    const status = document.getElementById('efficiencyImpactStatus');
    const results = document.getElementById('efficiencyImpactResults');
    button.disabled = true;
    status.classList.remove('error');
    status.textContent = 'Calcul de l’aperçu…';
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData(form))
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Le calcul est indisponible.');
      const { energy, carbon, cee } = result;
      const energyText = energy.direction === 'SAVING'
        ? `${integer(energy.annualEnergySavingsKwh)} kWh/an économisés`
        : energy.direction === 'INCREASE'
          ? `${integer(Math.abs(energy.annualEnergySavingsKwh))} kWh/an en plus`
          : 'Aucune variation';
      const tonnes = (value) => Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
      const carbonText = carbon.annualCo2eReductionKg > 0
        ? `${tonnes(carbon.annualCo2eReductionKg / 1000)} tCO₂e évitées/an`
        : carbon.annualCo2eReductionKg < 0
          ? `${tonnes(Math.abs(carbon.annualCo2eReductionKg) / 1000)} tCO₂e/an en plus`
          : 'Aucune variation';
      document.getElementById('efficiencyEnergyResult').textContent = energyText;
      document.getElementById('efficiencyCarbonResult').textContent = carbonText;
      document.getElementById('efficiencyCeeResult').textContent = cee.estimatedValueEur == null ? 'À qualifier' : money(cee.estimatedValueEur);
      document.getElementById('efficiencyCeeStatus').textContent = cee.estimatedValueEur == null
        ? cee.status === 'VALUATION_TO_COMPLETE' ? 'Compléter le volume ou le taux à partir d’une source vérifiée' : 'Identifier une fiche officielle applicable'
        : `${integer(cee.volumeKwhCumac)} kWh cumac · taux ${Number(cee.rateEurPerMwhCumac).toLocaleString('fr-FR')} €/MWh cumac · estimation indicative`;
      results.dataset.visible = 'true';
      status.textContent = 'Aperçu calculé par le service de calcul. Résultat indicatif, non enregistré et non validé.';
    } catch (error) {
      results.dataset.visible = 'false';
      status.classList.add('error');
      status.textContent = error instanceof TypeError && !navigator.onLine
        ? 'Connexion indisponible : réessayez lorsque vous serez en ligne.'
        : error.message || 'Calcul indisponible. Vérifiez les données puis réessayez.';
    } finally {
      button.disabled = false;
    }
  }

  function boot() {
    if (document.getElementById('audit-efficiency')) return;
    // finance-controls.js intentionally renames the heading before this module loads.
    // Mount against the stable finance container instead of translated presentation text.
    const finance = document.getElementById('audit-finance');
    if (!finance) return;
    addStyles();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = moduleMarkup();
    const card = wrapper.firstElementChild;
    finance.insertAdjacentElement('afterend', card);
    card.querySelector('#efficiencyImpactForm').addEventListener('submit', (event) => {
      event.preventDefault();
      calculate(event.currentTarget);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
