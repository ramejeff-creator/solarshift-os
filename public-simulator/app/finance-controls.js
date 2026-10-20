(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const format = (value) => Math.round(value).toLocaleString('fr-FR');
  const manualConsumptionSource = 'Déclaration du mandataire · saisie manuelle';
  let prestudyBenchmarkTools = null;
  import('./prestudy-building-benchmarks.mjs').then((tools) => {
    prestudyBenchmarkTools = tools;
    window.dispatchEvent(new CustomEvent('ozeno:prestudy-benchmarks-ready'));
  }).catch(() => {});
  function confirmedConsumptionKwh() {
    const input = $('cons');
    const value = Number(input?.value);
    return input?.dataset.referenceSource && input.dataset.referenceValue === input.value.trim()
      && Number.isFinite(value) && value >= 0 ? value : null;
  }
  function previewConsumptionReference() {
    const declared = confirmedConsumptionKwh();
    if (declared != null) return { valueKwh: declared, status: 'DECLARED', benchmark: null };
    const input = $('cons');
    if (input?.value.trim()) return { valueKwh: null, status: 'PENDING_DECLARATION', benchmark: null };
    const benchmark = prestudyBenchmarkTools?.resolveBuildingConsumptionBenchmark({
      buildingUse: $('prestudyBuildingType')?.value,
      subtype: $('prestudyWarehouseSubtype')?.value || 'unknown',
      industrySchedule: $('prestudyIndustrySchedule')?.value || 'UNKNOWN',
      areaM2: $('roofTotal')?.value
    }) || null;
    const resolved = prestudyBenchmarkTools?.resolveAnnualConsumption({ benchmark });
    return resolved ? { ...resolved, benchmark } : { valueKwh: null, status: 'UNKNOWN', benchmark: null };
  }
  function previewElectricityReference() {
    const power = prestudyBenchmarkTools?.resolvePowerBand({
      buildingUse: $('prestudyBuildingType')?.value,
      selectedBand: $('prestudyPowerBand')?.value || '',
      exactKva: $('prestudyExactPowerKva')?.value.trim() || null
    }) || { band: null, status: 'UNKNOWN' };
    const price = prestudyBenchmarkTools?.resolveElectricityPrice({
      selectedBand: power.band,
      declaredEurPerKwh: $('prestudyGridPrice')?.value.trim() || null,
      declaredBasis: $('prestudyGridPriceBasis')?.value || 'HT'
    }) || { status: 'UNKNOWN', valueEurPerKwh: null };
    const benchmarkPrice = prestudyBenchmarkTools?.resolveElectricityPrice({ selectedBand: power.band }) || { status: 'UNKNOWN' };
    return { power, price, benchmarkPrice };
  }
  function enedisCustomerClassFromDeclaredPower() {
    const power = previewElectricityReference().power;
    if (power.status !== 'DECLARED' || !power.band) return null;
    return power.band === 'LE_36_KVA' ? 'pro' : 'ent';
  }
  window.SolarShiftConsumptionReference = Object.freeze({ getAnnualKwh: confirmedConsumptionKwh });
  let productionPreviewKwh = null;
  let productionPreviewDetail = null;
  let installationSizing = null;
  let productionPreviewSource = 'UNKNOWN';
  let manualProductionFallbackKwh = null;
  let reportFinanceSummary = { status: 'UNKNOWN', message: 'À calculer' };
  const regulatedSurplusTariff = Object.freeze({
    mode: 'oa_s21',
    valueEurPerKwh: 0.011,
    effectiveFrom: '2026-06-05',
    articleUrl: 'https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000051383193',
    creUrl: 'https://www.cre.fr/documents/open-data/arretes-tarifaires-photovoltaiques-en-metropole.html'
  });

  function calculateAnnualEnergyRevenue({ productionKwh, aciShare, accShare, irveShare = 0, surplusShare, aciPrice, accPrice, irvePrice = 0, surplusPrice, yearIndex, surplusMode, financialAssumptions }) {
    const assumptions = financialAssumptions || window.SolarShiftFinancialAssumptions?.getValues()?.values;
    if (!assumptions) return NaN;
    const elapsedYears = Math.max(0, Math.floor(Number(yearIndex) || 0));
    const productionFactor = (1 - assumptions.productionDegradationRate) ** elapsedYears;
    const otherPriceFactor = (1 + assumptions.energyPriceEscalationRate) ** elapsedYears;
    const surplusIndexation = surplusMode === regulatedSurplusTariff.mode ? assumptions.s21SurplusEscalationRate : assumptions.contractSurplusEscalationRate;
    const surplusPriceFactor = (1 + surplusIndexation) ** elapsedYears;
    const weightedRevenue = (share, price) => Number(share) === 0 ? 0 : Number(share) * Number(price);
    return Number(productionKwh) * productionFactor * (
      (weightedRevenue(aciShare, aciPrice) + weightedRevenue(accShare, accPrice) + weightedRevenue(irveShare, irvePrice)) * otherPriceFactor
      + weightedRevenue(surplusShare, surplusPrice) * surplusPriceFactor
    );
  }

  function calculateDiscountedContractPrices(referencePrice, aciDiscountPercent, accDiscountPercent) {
    const price = Number(referencePrice), aciDiscount = Number(aciDiscountPercent), accDiscount = Number(accDiscountPercent);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(aciDiscount) || aciDiscount < 0 || aciDiscount > 100 || !Number.isFinite(accDiscount) || accDiscount < 0 || accDiscount > 100) return null;
    return {
      aciPrice: price * (1 - aciDiscount / 100),
      accPrice: price * (1 - accDiscount / 100)
    };
  }

  function calculateAciValuationPrice(ownershipMode, referencePrice, discountedAciPrice) {
    const reference = Number(referencePrice), discounted = Number(discountedAciPrice);
    if (ownershipMode === 'owner') return Number.isFinite(reference) && reference > 0 ? reference : null;
    return Number.isFinite(discounted) && discounted >= 0 ? discounted : null;
  }

  function publishedActivityLabel(row) {
    if (!row.category) return '';
    if (row.population !== 'BUSINESS') return `${row.categoryLabel || 'Segment'} ${row.category}`;
    // NAF rév. 2 divisions published in the historical Enedis address dataset.
    const names = {
      '25': 'Fabrication de produits métalliques (hors machines et équipements)',
      '36': 'Captage, traitement et distribution d’eau',
      '46': 'Commerce de gros (hors automobiles et motocycles)'
    };
    return `NAF niveau 2 : ${row.category}${names[row.category] ? ` · ${names[row.category]}` : ''}`;
  }

  function calculateTotalCapex(solarCapex, irvePowerKw, irveInstalledCostPerKw) {
    const solar = Number(solarCapex), power = irvePowerKw === '' || irvePowerKw == null ? 0 : Number(irvePowerKw);
    if (!Number.isFinite(solar) || solar <= 0 || !Number.isFinite(power) || power < 0) return null;
    const installedCost = irveInstalledCostPerKw === '' || irveInstalledCostPerKw == null ? NaN : Number(irveInstalledCostPerKw);
    if (power > 0 && (!Number.isFinite(installedCost) || installedCost <= 0)) return { ready: false, solarCapex: solar, irveCapex: null, totalCapex: null };
    const irveCapex = power > 0 ? power * installedCost : 0;
    return { ready: true, solarCapex: solar, irveCapex, totalCapex: solar + irveCapex };
  }

  function calculateIrvePowerKw(count, powerOption, customPowerKw = '') {
    const chargerCount = Number(count);
    if (!Number.isInteger(chargerCount) || chargerCount < 0 || chargerCount > 10) return null;
    if (chargerCount === 0) return 0;
    const power = powerOption === 'custom' ? Number(customPowerKw) : Number(powerOption);
    if (!Number.isFinite(power) || power <= 0) return null;
    return Number((chargerCount * power).toFixed(1));
  }

  window.OzenoSurplusPricingModel = Object.freeze({ regulatedSurplusTariff, calculateAnnualEnergyRevenue, calculateDiscountedContractPrices, calculateAciValuationPrice, calculateTotalCapex, calculateIrvePowerKw });

  function installContractPricingControls() {
    const reference = $('contractReferencePrice');
    const aciDiscount = $('aciDiscountPercent');
    const accDiscount = $('accDiscountPercent');
    const aciPrice = $('aciPrice');
    const accPrice = $('accPrice');
    const status = $('contractPricingStatus');
    if (!reference || !aciDiscount || !accDiscount || !aciPrice || !accPrice || !status) return;

    const legacyAciDefault = ['.15', '.150', '0.15', '0.150'].includes(aciPrice.value.trim());
    aciPrice.dataset.manualPrice = legacyAciDefault ? '' : aciPrice.value;
    if (legacyAciDefault) aciPrice.value = '';
    accPrice.dataset.manualPrice = accPrice.value;
    const update = () => {
      const hasReference = reference.value.trim() !== '';
      const ownershipMode = $('financialAnalysis')?.value || 'owner';
      const prices = hasReference
        ? calculateDiscountedContractPrices(reference.value, ownershipMode === 'owner' ? 0 : aciDiscount.value, accDiscount.value)
        : null;
      const invalidReference = hasReference && !prices;
      const aciDiscountLabel = aciDiscount.closest('label');
      const pricingLegend = $('contractPricingGroup')?.querySelector('legend');
      if (aciDiscountLabel) aciDiscountLabel.hidden = ownershipMode === 'owner';
      if (pricingLegend) pricingLegend.textContent = ownershipMode === 'owner'
        ? 'Prix de référence client et décote ACC'
        : 'Prix client et décotes ACI / ACC';
      reference.setCustomValidity(invalidReference ? 'Saisissez un prix de référence positif et des décotes entre 0 et 100 %.' : '');
      if (prices) {
        const aciValuationPrice = calculateAciValuationPrice(ownershipMode, reference.value, prices.aciPrice);
        aciPrice.value = String(Number(aciValuationPrice.toFixed(6)));
        accPrice.value = String(Number(prices.accPrice.toFixed(6)));
        aciPrice.readOnly = true;
        accPrice.readOnly = true;
        status.textContent = ownershipMode === 'owner'
          ? `ACI : ${Number(aciValuationPrice.toFixed(3)).toLocaleString('fr-FR')} €/kWh de facture évitée (sans décote) ; ACC : ${Number(prices.accPrice.toFixed(3)).toLocaleString('fr-FR')} €/kWh après ${Number(accDiscount.value).toLocaleString('fr-FR')} % de décote. La décote ACC reste modifiable.`
          : `Prix calculés depuis le prix de référence : ACI ${Number(prices.aciPrice.toFixed(3)).toLocaleString('fr-FR')} €/kWh après ${Number(aciDiscount.value).toLocaleString('fr-FR')} % de décote ; ACC ${Number(prices.accPrice.toFixed(3)).toLocaleString('fr-FR')} €/kWh après ${Number(accDiscount.value).toLocaleString('fr-FR')} %. Ces décotes restent modifiables.`;
      } else {
        aciPrice.readOnly = false;
        accPrice.readOnly = false;
        aciPrice.value = aciPrice.dataset.manualPrice ?? '';
        accPrice.value = accPrice.dataset.manualPrice ?? '';
        status.textContent = invalidReference
          ? 'Prix ou décote invalide : corrigez les valeurs pour calculer les prix ACI / ACC.'
          : ownershipMode === 'owner'
            ? 'Prix d’achat du kWh absent : renseignez le tarif évité ou indiquez une hypothèse de prospection pour valoriser l’économie ACI.'
            : 'Aucun prix propriétaire renseigné : prix ACI / ACC saisis comme hypothèses de vente en prospection.';
      }
      calculate();
    };
    aciPrice.addEventListener('input', () => { if (!aciPrice.readOnly) aciPrice.dataset.manualPrice = aciPrice.value; });
    accPrice.addEventListener('input', () => { if (!accPrice.readOnly) accPrice.dataset.manualPrice = accPrice.value; });
    [reference, aciDiscount, accDiscount].forEach((input) => input.addEventListener('input', update));
    reference.addEventListener('change', update);
    $('financialAnalysis')?.addEventListener('change', update);
  }

  function organizeRevenueFields() {
    const form = $('aciShare')?.closest('.form');
    if (!form || form.querySelector('.financeRevenueGroups')) return;
    const anchor = $('aciShare').closest('label');
    const investment = document.createElement('fieldset');
    investment.className = 'financeGroup';
    investment.id = 'investmentGroup';
    investment.innerHTML = '<legend>Investissement et financement</legend>';
    form.insertBefore(investment, anchor);
    let costLabel;
    if (!$('capexPerKwp')) {
      costLabel = document.createElement('label');
      costLabel.innerHTML = 'CAPEX photovoltaïque indicatif par kWc (€)<input id="capexPerKwp" type="number" min="0" step="10" value="900">';
    } else {
      costLabel = $('capexPerKwp').closest('label');
    }
    if (costLabel?.firstChild) costLabel.firstChild.nodeValue = 'CAPEX photovoltaïque indicatif par kWc (€)';
    costLabel?.querySelectorAll('small.fine').forEach((note) => note.remove());
    costLabel?.querySelector('#capexTypologyBenchmarks')?.remove();
    if (costLabel && !costLabel.querySelector('#capexTypologyHelp')) {
      const capexBenchmarks = document.createElement('span');
      capexBenchmarks.innerHTML = '<strong>Repères indicatifs par typologie · hors TVA selon les références :</strong><br><br>Toiture commerciale 10–100 kWc : 1 000 €/kWc (620–1 400) · 100–250 kWc : 850 €/kWc (750–1 200) · toiture industrielle &gt;250 kWc : 800 €/kWc (750–1 000).<br><br>Ombrière &gt;250 kWc : 1 000–1 250 €/kWc · centrale au sol : environ 750 €/kWc.<br><br>En mode abaque, la référence est sélectionnée selon le chantier et la puissance. Le mode prix saisi / devis conserve votre valeur. Ces repères ne sont pas un devis et leur périmètre doit être confirmé.';
      const help = createFinanceHelp('capexTypologyHelp', 'Afficher les repères CAPEX par typologie', capexBenchmarks);
      help.id = 'capexTypologyHelpControl';
      help.classList.add('capexTypologyHelp');
      $('capexPerKwp')?.insertAdjacentElement('beforebegin', help);
    }
    const capexLabel = $('capex')?.closest('label');
    if (capexLabel) {
      if (capexLabel.firstChild) capexLabel.firstChild.nodeValue = 'CAPEX total moyen estimé (€) ';
      $('capex').readOnly = true;
      let range = capexLabel.querySelector('#capexRangeNote');
      if (!range) {
        range = document.createElement('small');
        range.id = 'capexRangeNote';
        range.className = 'fine';
        range.setAttribute('aria-live', 'polite');
        $('capex').insertAdjacentElement('afterend', range);
      }
      attachFinanceHelp(capexLabel, $('capex'), 'capexHelp', 'Le coût PV utilise le même abaque de chantier que le simulateur, ou votre prix saisi / devis. Le coût IRVE renseigné est ajouté séparément. La commission facturée à l’installateur n’est pas ajoutée à l’investissement client. Typologie, base HT/TTC et périmètre exact restent à confirmer par devis.');
    }
    const costRow = document.createElement('div');
    costRow.className = 'financeInvestmentCostRow';
    const referenceControls = document.createElement('div');
    referenceControls.className = 'form';
    referenceControls.innerHTML = '<label>Origine du coût PV<select id="capexReferenceMode"><option value="benchmark">Abaque selon le chantier</option><option value="manual">Prix saisi / devis</option></select></label><label>Type de chantier pour l’abaque<select id="capexInstallationType"><option value="auto">Abaque automatique selon le chantier</option><option value="commercial">Toiture commerciale</option><option value="industrial">Toiture industrielle</option><option value="carport">Ombrière</option><option value="ground">Centrale au sol</option></select></label><small id="capexReferenceStatus" class="fine" role="status"></small>';
    investment.appendChild(referenceControls);
    ['capexReferenceMode', 'capexInstallationType'].forEach((id) => $(id).addEventListener('change', calculate));
    $('capexPerKwp')?.addEventListener('input', () => { $('capexReferenceMode').value = 'manual'; });
    costRow.append(costLabel);
    if (capexLabel) costRow.append(capexLabel);
    investment.appendChild(costRow);

    const irveInvestment = document.createElement('fieldset');
    irveInvestment.className = 'financeGroup financeIrveInvestment';
    irveInvestment.id = 'irveInvestmentGroup';
    irveInvestment.innerHTML = '<legend>Infrastructure de recharge IRVE</legend><p class="fine">Le coût IRVE dépend du nombre de bornes, de leur puissance et du devis d’installation. Avec 0 borne, aucun CAPEX IRVE n’est ajouté ; les montants non validés restent des estimations.</p><div class="irveInvestmentInputs"><label>Nombre de bornes<select id="irveChargerCount"><option value="0" selected>0 borne</option><option value="1">1 borne</option><option value="2">2 bornes</option><option value="3">3 bornes</option><option value="4">4 bornes</option><option value="5">5 bornes</option><option value="6">6 bornes</option><option value="7">7 bornes</option><option value="8">8 bornes</option><option value="9">9 bornes</option><option value="10">10 bornes</option></select></label><label>Puissance par borne<select id="irvePowerPerChargerKw"><option value="7.4" selected>7,4 kW</option><option value="11">11 kW</option><option value="22">22 kW</option><option value="custom">Supérieure à 22 kW · préciser</option></select></label><label id="irveCustomPowerLabel" hidden>Puissance unitaire précise (kW)<input id="irveCustomPowerKw" type="number" min="0.1" step="0.1" placeholder="Obligatoire si &gt;22 kW"></label><label>Puissance IRVE totale (kW)<input id="irvePowerKw" type="number" min="0" step="0.1" value="0" readonly></label><label>Coût installé IRVE (€/kW)<input id="irveInstalledCostPerKw" type="number" min="0" step="10" placeholder="Devis / hypothèse sourcée"></label></div><label>CAPEX IRVE estimé (€)<input id="irveCapex" type="text" readonly value="0"></label><p id="irveCapexStatus" class="fine" role="status" aria-live="polite">Aucune borne renseignée : aucun CAPEX IRVE ajouté. Une borne standard ne stocke pas l’énergie ; le stockage véhicule nécessite une fonction bidirectionnelle compatible, non simulée ici.</p>';
    investment.appendChild(irveInvestment);

    const investorChoice = document.createElement('fieldset');
    investorChoice.className = 'financeGroup financeOwnershipChoice';
    investorChoice.id = 'financeOwnershipChoice';
    investorChoice.innerHTML = '<legend>Porteur du projet</legend>';
    const investorLabel = document.createElement('label');
    investorLabel.innerHTML = 'Propriété de l’installation<select id="financialAnalysis"><option value="owner" selected>Propriétaire exploitant · ACI = facture évitée</option><option value="investor">Propriétaire bailleur ou tiers investisseur / SPV · ACI = vente</option></select>';
    investorChoice.appendChild(investorLabel);
    const introHint = $('audit-finance')?.querySelector(':scope > .hint');
    if (introHint) introHint.insertAdjacentElement('afterend', investorChoice);
    else form.insertAdjacentElement('beforebegin', investorChoice);

    const funding = document.createElement('fieldset');
    funding.className = 'financeFundingMode';
    funding.innerHTML = '<legend>Mode de financement</legend><div class="financeFundingOptions"><label><input type="radio" name="financingMode" value="equity"><span>100 % fonds propres</span></label><label><input type="radio" name="financingMode" value="mixed" checked><span>Mix dette bancaire</span></label></div><p class="fine">En financement mixte, précisez la part, le taux et la durée de la dette.</p>';
    const fundingConfiguration = document.createElement('div');
    fundingConfiguration.className = 'financeFundingConfiguration';
    const durationLabel = $('term')?.closest('label');
    durationLabel?.classList.add('financeHorizonControl');
    fundingConfiguration.appendChild(funding);
    if (durationLabel) fundingConfiguration.appendChild(durationLabel);
    investment.appendChild(fundingConfiguration);

    const debtDetails = document.createElement('div');
    debtDetails.className = 'financeDebtDetails';
    debtDetails.id = 'financeDebtDetails';
    ['debtShare', 'debtRate', 'debtTerm'].forEach((id) => { if ($(id)) debtDetails.appendChild($(id).closest('label')); });
    investment.appendChild(debtDetails);
    const consumption = $('cons');
    const consumptionLabel = consumption?.closest('label');
    if (consumptionLabel) {
      const consumptionGroup = document.createElement('fieldset');
      consumptionGroup.className = 'financeGroup financeEnergyReference';
      consumptionGroup.id = 'consumptionReferenceGroup';
      consumptionGroup.innerHTML = '<legend>Consommation et répartition indicative</legend><p class="fine">Consommation annuelle du bâtiment pour estimer l’ACI et le reste à valoriser.</p>';
      consumptionGroup.querySelector('legend').append(createFinanceHelp('consumptionAllocationHelp', 'Comprendre la répartition indicative', 'Les répartitions calculées à partir de totaux annuels sont théoriques : elles ne démontrent pas la coïncidence horaire entre production et consommation. Sur un site avec plusieurs occupants, vérifiez le périmètre de consommation retenu.'));
      const profilePanel = document.getElementById('productionConsumptionPanel');
      if (profilePanel) profilePanel.appendChild(consumptionGroup);
      else form.insertBefore(consumptionGroup, investment);
      if (consumptionLabel.firstChild) consumptionLabel.firstChild.nodeValue = 'Consommation annuelle (kWh) ';
      const benchmarkControls = document.createElement('div');
      benchmarkControls.className = 'prestudyBenchmarkControls';
      benchmarkControls.innerHTML = '<label for="prestudyBuildingType">Activité principale du bâtiment <span class="fine">(pour une estimation uniquement)</span><select id="prestudyBuildingType"><option value="">À préciser</option><option value="offices">Bureaux et tertiaire</option><option value="logistics">Stockage et logistique</option><option value="industry">Industrie et atelier</option><option value="retail">Commerce et grande surface</option><option value="public">Équipement public</option><option value="other">Autre bâtiment professionnel</option></select></label><label id="prestudyWarehouseSubtypeLabel" hidden>Votre site comporte-t-il du froid ou de la réfrigération ?<select id="prestudyWarehouseSubtype"><option value="unknown">Je ne sais pas</option><option value="dry">Non · entrepôt sec</option><option value="cold">Oui · entrepôt frigorifique</option></select></label><label id="prestudyIndustryScheduleLabel" hidden>Rythme d’activité industrielle<select id="prestudyIndustrySchedule"><option value="UNKNOWN">Je ne sais pas</option><option value="DAYTIME">Journée</option><option value="TWO_SHIFT">2×8</option><option value="THREE_SHIFT">3×8 / continu</option></select></label><p class="fine" id="prestudyBenchmarkAreaNote">L’abaque utilise l’emprise au sol mesurée sur le contour de la carte, pas une deuxième surface ni la surface de plancher.</p><p class="fine" id="prestudyBenchmarkStatus" role="status" aria-live="polite"></p><fieldset class="prestudyElectricityBenchmarks"><legend>Puissance et prix de l’électricité · repères de pré-étude</legend><label for="prestudyExactPowerKva">Puissance souscrite exacte (kVA), si connue<input id="prestudyExactPowerKva" type="number" min="0.1" step="0.1" inputmode="decimal" placeholder="À relever sur la facture"></label><label for="prestudyPowerBand">Sinon, tranche de puissance<select id="prestudyPowerBand"><option value="">Suggestion selon l’activité</option><option value="LE_36_KVA">≤ 36 kVA</option><option value="37_100_KVA">37–100 kVA</option><option value="101_250_KVA">101–250 kVA</option><option value="GT_250_KVA_BT">> 250 kVA · BT</option><option value="HTA">HTA / grande puissance</option><option value="UNKNOWN">Je ne sais pas</option></select></label><p id="prestudyPowerStatus" class="fine" role="status" aria-live="polite"></p><label for="prestudyGridPrice">Prix moyen du kWh facturé, si connu (€/kWh)<input id="prestudyGridPrice" type="number" min="0.001" max="10" step="0.001" placeholder="À relever sur la facture"></label><label for="prestudyGridPriceBasis">Base du prix<select id="prestudyGridPriceBasis"><option value="HT">HT</option><option value="TTC">TTC</option></select></label><p id="prestudyPriceStatus" class="fine" role="status" aria-live="polite"></p></fieldset>';
      consumptionGroup.appendChild(benchmarkControls);
      const areaNote = $('prestudyBenchmarkAreaNote');
      const activityLabel = $('prestudyBuildingType').closest('label');
      const activityTitle = document.createElement('span');
      activityTitle.textContent = 'Activité principale du bâtiment';
      activityTitle.append(createFinanceHelp('prestudyBuildingAreaHelp', 'À propos de la surface utilisée pour l’estimation', areaNote.textContent));
      activityLabel.firstChild.replaceWith(activityTitle);
      areaNote.remove();
      const syncBenchmarkControls = () => {
        const buildingUse = $('prestudyBuildingType')?.value || '';
        $('prestudyWarehouseSubtypeLabel').hidden = buildingUse !== 'logistics';
        $('prestudyIndustryScheduleLabel').hidden = buildingUse !== 'industry';
        const status = $('prestudyBenchmarkStatus');
        const reference = previewConsumptionReference();
        if (!status) return;
        if (reference.status === 'DECLARED') status.textContent = 'La consommation saisie et validée reste prioritaire sur l’abaque.';
        else if (reference.status === 'PENDING_DECLARATION') status.textContent = 'La consommation saisie n’est pas encore validée ; l’abaque ne la remplacera pas.';
        else if (reference.status === 'ASSUMPTION' && reference.benchmark) {
          const { consumptionLowKwhYear: low, consumptionRefKwhYear: ref, consumptionHighKwhYear: high, intensityRefKwhM2Year: intensity, areaM2, confidence } = reference.benchmark;
          status.textContent = `Hypothèse SolarShift V1 : ${format(ref)} kWh/an (corridor ${format(low)}–${format(high)}), calculée sur ${format(areaM2)} m² d’emprise (${intensity} kWh/m²/an, confiance ${confidence.toLowerCase()}). Valeur estimative, non mesurée ; à confirmer avec un conseiller.`;
        } else status.textContent = buildingUse ? 'L’abaque sera disponible lorsque le contour de carte sera mesuré.' : 'Choisissez une activité pour afficher une estimation indicative.';
        const electricity = previewElectricityReference();
        const powerStatus = $('prestudyPowerStatus');
        if (powerStatus) {
          const powerLabel = { LE_36_KVA: '≤ 36 kVA', '37_100_KVA': '37–100 kVA', '101_250_KVA': '101–250 kVA', GT_250_KVA_BT: '> 250 kVA BT', HTA: 'HTA / grande puissance' }[electricity.power.band] || 'non renseignée';
          const exact = electricity.power.value == null ? '' : ` (${Number(electricity.power.value).toLocaleString('fr-FR')} kVA)`;
          powerStatus.textContent = electricity.power.band
            ? `Tranche retenue : ${powerLabel}${exact} · ${electricity.power.status === 'ASSUMPTION' ? 'suggestion SolarShift à confirmer sur facture' : 'information déclarée'}.`
            : 'Puissance inconnue : aucune tranche tarifaire n’est supposée.';
        }
        const priceStatus = $('prestudyPriceStatus');
        if (priceStatus) {
          if (electricity.price.status === 'DECLARED') {
            priceStatus.textContent = `Prix réseau déclaré : ${Number(electricity.price.valueEurPerKwh).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} €/kWh ${electricity.price.basis}. ${electricity.price.usableForHtEconomics ? 'La composante ACI reste distincte et estimée selon la tranche.' : 'Base TTC : cette valeur n’est pas injectée dans le calcul financier HT.'}`;
          } else if (electricity.price.status === 'PARTIAL') {
            priceStatus.textContent = 'Prix déclaré TTC : conservé à titre indicatif, non utilisé dans un calcul HT. Vérifiez la facture ou choisissez une base HT comparable.';
          } else if (electricity.benchmarkPrice.corridorEurPerKwh) {
            const grid = electricity.benchmarkPrice.corridorEurPerKwh;
            const aci = electricity.benchmarkPrice.aciAvoidableCorridorEurPerKwh;
            priceStatus.textContent = `Benchmark SolarShift HT à confirmer sur facture : réseau ${grid.low.toFixed(2)}–${grid.high.toFixed(2)} €/kWh (réf. ${grid.ref.toFixed(2)}) ; composante ACI évitable ${aci.low.toFixed(2)}–${aci.high.toFixed(2)} €/kWh (réf. ${aci.ref.toFixed(2)}). L’ACC reste une hypothèse distincte à ${Number($('accPrice')?.value || 0.12).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/kWh.`;
          } else priceStatus.textContent = 'Choisissez une activité ou une tranche de puissance pour obtenir un corridor tarifaire indicatif.';
        }
        const aciField = $('aciPrice');
        const owner = $('financialAnalysis')?.value === 'owner';
        const contractPrice = $('contractReferencePrice')?.value.trim();
        if (aciField && aciField.dataset.prestudyBenchmark === 'true'
            && (!owner || contractPrice || !electricity.benchmarkPrice.aciAvoidableCorridorEurPerKwh)) {
          if (!owner && !contractPrice || !electricity.benchmarkPrice.aciAvoidableCorridorEurPerKwh && !contractPrice) aciField.value = '';
          delete aciField.dataset.prestudyBenchmark;
        }
        if (aciField && aciField.dataset.manualPrice !== undefined && owner && !contractPrice && !aciField.dataset.manualPrice.trim()
            && electricity.benchmarkPrice.aciAvoidableCorridorEurPerKwh) {
          aciField.value = String(electricity.benchmarkPrice.aciAvoidableCorridorEurPerKwh.ref);
          aciField.dataset.prestudyBenchmark = 'true';
          aciField.dispatchEvent(new Event('change', { bubbles: true }));
        }
        window.dispatchEvent(new CustomEvent('ozeno:consumption-reference'));
      };
      ['prestudyBuildingType', 'prestudyWarehouseSubtype', 'prestudyIndustrySchedule', 'prestudyExactPowerKva', 'prestudyPowerBand', 'prestudyGridPrice', 'prestudyGridPriceBasis'].forEach((id) => $(id)?.addEventListener('change', syncBenchmarkControls));
      ['prestudyExactPowerKva', 'prestudyGridPrice'].forEach((id) => $(id)?.addEventListener('input', syncBenchmarkControls));
      $('aciPrice')?.addEventListener('input', () => { delete $('aciPrice').dataset.prestudyBenchmark; });
      $('financialAnalysis')?.addEventListener('change', syncBenchmarkControls);
      $('contractReferencePrice')?.addEventListener('input', syncBenchmarkControls);
      window.addEventListener('ozeno:prestudy-finance-controls-ready', syncBenchmarkControls);
      window.addEventListener('ozeno:roof-surfaces', syncBenchmarkControls);
      window.addEventListener('ozeno:prestudy-benchmarks-ready', syncBenchmarkControls);
      window.addEventListener('ozeno:project-context-loaded', syncBenchmarkControls);
      syncBenchmarkControls();
      const consumptionInstructions = document.createElement('p');
      consumptionInstructions.className = 'fine';
      consumptionInstructions.textContent = 'Saisissez votre consommation annuelle puis validez-la. Vous pouvez aussi choisir une référence Enedis ci-dessous : elle est appliquée en un clic. Le profil et le graphique se mettent ensuite à jour automatiquement.';
      consumptionGroup.appendChild(consumptionInstructions);
      consumptionGroup.appendChild(consumptionLabel);
      const lookup = document.createElement('section');
      lookup.className = 'enedisConsumptionLookup';
      lookup.id = 'enedisConsumptionLookup';
      lookup.innerHTML = '<p class="enedisLookupPrompt" title="Une référence publique reste indicative et doit être confirmée avec le propriétaire.">Référence de consommation Enedis pour l’adresse du projet</p><button class="secondary" type="button" id="searchEnedisConsumption">Rechercher sur Enedis</button><p class="enedisLookupStatus fine" id="enedisLookupStatus" role="status" aria-live="polite"></p><div class="enedisLookupResults" id="enedisLookupResults" aria-label="Données Enedis trouvées"></div>';
      const lookupDetails = document.createElement('details');
      lookupDetails.id = 'enedisLookupDetails';
      lookupDetails.className = 'financePreviewDetails';
      lookupDetails.innerHTML = '<summary>Rechercher une consommation de référence sur Enedis · facultatif</summary>';
      lookupDetails.appendChild(lookup);
      consumptionGroup.appendChild(lookupDetails);
      const syntheticPicker = document.createElement('section');
      syntheticPicker.id = 'enedisSyntheticProfilePicker';
      consumptionGroup.appendChild(syntheticPicker);
      const validateManual = document.createElement('button');
      validateManual.type = 'button';
      validateManual.id = 'validateManualConsumption';
      validateManual.className = 'action';
      validateManual.textContent = 'Valider la consommation saisie';
      validateManual.hidden = true;
      consumptionLabel.insertAdjacentElement('afterend', validateManual);
      const refStatus = $('enedisLookupStatus');
      // Keep the selected consumption and search feedback next to the main action.
      validateManual.insertAdjacentElement('afterend', refStatus);
      const syncManualConsumption = () => {
        if (consumption.dataset.referenceSource && consumption.dataset.referenceValue !== consumption.value.trim()) {
          delete consumption.dataset.referenceSource;
          delete consumption.dataset.referenceYear;
          delete consumption.dataset.referenceValue;
        }
        const confirmed = confirmedConsumptionKwh() != null;
        validateManual.hidden = !consumption.value.trim();
        validateManual.textContent = confirmed ? 'Actualiser le calcul avec cette valeur' : 'Valider la consommation saisie';
        if (!confirmed && consumption.value.trim()) refStatus.textContent = 'Valeur saisie en aperçu uniquement : cliquez sur « Valider la consommation saisie » pour l’utiliser dans le calcul.';
        if (confirmed && consumption.dataset.referenceSource === manualConsumptionSource) {
          refStatus.textContent = `Consommation appliquée : ${format(Number(consumption.value))} kWh/an. Le profil se met à jour automatiquement ci-dessous.`;
        } else if (confirmed) {
          refStatus.textContent = `Référence ${consumption.dataset.referenceSource} appliquée : ${format(Number(consumption.value))} kWh/an. Le profil se met à jour automatiquement ci-dessous.`;
        }
        window.dispatchEvent(new CustomEvent('ozeno:consumption-reference'));
      };
      consumption.addEventListener('input', syncManualConsumption);
      // A selection/validation commits with change only; input would invalidate the profile request just started.
      consumption.addEventListener('change', syncManualConsumption);
      window.addEventListener('ozeno:project-context-loaded', syncManualConsumption);
      validateManual.addEventListener('click', () => {
        const value = Number(consumption.value);
        if (!Number.isFinite(value) || value < 0) {
          refStatus.textContent = 'Saisissez une consommation annuelle égale ou supérieure à zéro avant de la valider.';
          return;
        }
        if (confirmedConsumptionKwh() == null) {
          consumption.dataset.referenceSource = manualConsumptionSource;
          consumption.dataset.referenceYear = 'saisie manuelle';
          consumption.dataset.referenceValue = consumption.value.trim();
        }
        consumption.dispatchEvent(new Event('change', { bubbles: true }));
      });
      syncManualConsumption();
      import('./enedis-synthetic-picker.mjs').then(({ mountEnedisSyntheticProfilePicker }) => {
        mountEnedisSyntheticProfilePicker({
          container: syntheticPicker,
          getAnnualConsumption: confirmedConsumptionKwh,
          getCustomerClass: enedisCustomerClassFromDeclaredPower,
          config: window.SOLARSHIFT_CONFIG || {}
        });
      }).catch((error) => {
        syntheticPicker.textContent = `Sélecteur de profil Enedis indisponible : ${error.message}`;
      });
    }
    const groups = document.createElement('div');
    groups.className = 'financeRevenueGroups';
    groups.innerHTML = '<fieldset class="financeGroup" id="priceGroup"><legend>Prix de valorisation et hypothèses</legend></fieldset><fieldset class="financeGroup" id="shareGroup"><legend>Répartition de l’énergie et prix par débouché</legend></fieldset>';
    form.insertBefore(groups, anchor);
    const allocationMode = document.createElement('label');
    allocationMode.className = 'allocationMode';
    allocationMode.innerHTML = '<input id="manualEnergyAllocation" type="checkbox"> Ajuster la répartition estimée (ACI / ACC / IRVE / surplus)';
    $('shareGroup').appendChild(allocationMode);
    const allocationStatus = document.createElement('p');
    allocationStatus.id = 'allocationStatus';
    allocationStatus.className = 'fine allocationStatus';
    allocationStatus.setAttribute('role', 'status');
    $('shareGroup').appendChild(allocationStatus);
    $('shareGroup').appendChild($('mixValidation'));
    const channelGrid = document.createElement('div');
    channelGrid.id = 'financeChannelGrid';
    channelGrid.className = 'financeChannelGrid';
    $('shareGroup').appendChild(channelGrid);
    const channelDefinitions = [
      { key: 'aci', title: 'Autoconsommation individuelle (ACI)', shareId: 'aciShare', priceId: 'aciPrice' },
      { key: 'acc', title: 'Autoconsommation collective (ACC)', shareId: 'accShare', priceId: 'accPrice' },
      { key: 'irve', title: 'Recharge des véhicules (IRVE)', shareId: null, priceId: null },
      { key: 'surplus', title: 'Surplus vendu au réseau', shareId: 'gridShare', priceId: 'gridPrice' }
    ];
    const channelCards = new Map();
    channelDefinitions.forEach(({ key, title }) => {
      const card = document.createElement('section');
      card.className = `financeChannelCard financeChannel-${key}`;
      card.setAttribute('aria-label', title);
      const heading = document.createElement('h4');
      heading.textContent = title;
      card.appendChild(heading);
      channelGrid.appendChild(card);
      channelCards.set(key, card);
    });
    const irveShareLabel = document.createElement('label');
    irveShareLabel.innerHTML = 'Part IRVE (%)<input id="irveShare" type="number" min="0" max="100" step="0.1" value="0"><small class="fine allocationVolume" id="irveShareKwh">kWh/an à calculer</small>';
    channelCards.get('irve').appendChild(irveShareLabel);
    ['aciShare', 'accShare', 'gridShare'].forEach((id) => {
      const label = $(id).closest('label');
      const volume = document.createElement('small');
      volume.className = 'fine allocationVolume';
      volume.id = `${id}Kwh`;
      volume.textContent = 'kWh/an à calculer';
      label.appendChild(volume);
      channelCards.get(id === 'aciShare' ? 'aci' : id === 'accShare' ? 'acc' : 'surplus').appendChild(label);
    });
    const contractPricing = document.createElement('fieldset');
    contractPricing.className = 'financeGroup financeContractPricing';
    contractPricing.id = 'contractPricingGroup';
    contractPricing.innerHTML = '<legend>Prix client et décotes ACI / ACC</legend><p class="fine">En étude avec le propriétaire, partez du prix variable du kWh indiqué sur sa facture ou son contrat. En prospection sans contrat, laissez vide et renseignez une hypothèse dans les prix ACI / ACC.</p><label>Prix de référence du kWh client (€/kWh)<input id="contractReferencePrice" type="number" min="0" step="0.001" placeholder="Contrat ou facture"></label><div class="contractDiscountInputs"><label>Décote ACI (%)<input id="aciDiscountPercent" type="number" min="0" max="100" step="1" value="15"></label><label>Décote ACC (%)<input id="accDiscountPercent" type="number" min="0" max="100" step="1" value="20"></label></div><label>Source du prix de référence<input id="contractReferenceSource" type="text" maxlength="300" autocomplete="off" placeholder="Ex. facture propriétaire, offre de fourniture"></label><p id="contractPricingStatus" class="fine" role="status" aria-live="polite">Aucun prix propriétaire renseigné : prix ACI / ACC saisis comme hypothèses.</p>';
    $('priceGroup').appendChild(contractPricing);
    ['aciPrice', 'accPrice', 'gridPrice', 'rentOn', 'annualRent'].forEach((id) => $('priceGroup').appendChild($(id).closest('label')));
    const rentRateLabel = document.createElement('label');
    rentRateLabel.innerHTML = 'Taux de loyer sur la valeur annuelle produite (%)<input id="rentRate" type="number" min="0" max="100" step="0.1" placeholder="Ex. 10">';
    const annualRentLabel = $('annualRent').closest('label');
    annualRentLabel.firstChild.nodeValue = 'Loyer annuel calculé · année 1 (€) ';
    $('annualRent').readOnly = true;
    $('annualRent').disabled = false;
    $('annualRent').setAttribute('aria-describedby', 'rentMetricsSummary');
    $('annualRent').setAttribute('title', 'Calcul automatique : taux de loyer × valeur annuelle estimée de la production.');
    $('priceGroup').insertBefore(rentRateLabel, annualRentLabel);
    const rentAreaLabel = document.createElement('label');
    rentAreaLabel.innerHTML = 'Loyer calculé par m² de surface exploitable (€/m²/an)<input id="rentPerM2" type="number" min="0" step="0.01" readonly aria-describedby="rentMetricsSummary">';
    annualRentLabel.insertAdjacentElement('afterend', rentAreaLabel);
    if (!$('discountAssumptionsGroup')) {
      const financialAssumptions = document.createElement('fieldset');
      financialAssumptions.className = 'financeGroup financeAssumptionSettings';
      financialAssumptions.id = 'discountAssumptionsGroup';
      financialAssumptions.innerHTML = '<legend>Hypothèses financières du projet</legend>';
      window.SolarShiftFinancialAssumptions?.renderEditor(financialAssumptions);
      form.insertBefore(financialAssumptions, investment.nextSibling);
      $('resetFinancialAssumptions')?.addEventListener('click', () => {
        financialAssumptions.querySelectorAll('input[type="number"][data-model-default]').forEach((input) => { input.value = input.dataset.modelDefault; });
        calculate();
      });
    }
    if (!$('rentMetricsSummary')) {
      const rentSummary = document.createElement('p');
      rentSummary.id = 'rentMetricsSummary';
      rentSummary.className = 'fine';
      rentSummary.setAttribute('aria-live', 'polite');
      rentAreaLabel.appendChild(rentSummary);
    }
    const irvePriceLabel = document.createElement('label');
    irvePriceLabel.innerHTML = 'Prix de recharge IRVE facturé (€/kWh)<input id="irvePrice" type="number" min="0" step="0.01" placeholder="Ex. 0,35 · à confirmer">';
    channelCards.get('aci').appendChild($('aciPrice').closest('label'));
    channelCards.get('acc').appendChild($('accPrice').closest('label'));
    channelCards.get('irve').appendChild(irvePriceLabel);
    channelCards.get('irve').querySelector('h4')?.appendChild(createFinanceHelp(
      'irveRevenueHelp',
      'Informations sur la recette IRVE',
      'Exemple prospectif à confirmer selon le service et le site. Recette brute de recharge ; le coût d’électricité acheté n’est pas inclus. Aucune recette IRVE incluse tant qu’une part d’énergie n’est pas affectée aux bornes.'
    ));
    channelCards.get('surplus').appendChild($('gridPrice').closest('label'));
    const wrapChannelLabelText = (label) => {
      if (!label || label.querySelector('.financeChannelLabelText')) return;
      const textNodes = [...label.childNodes].filter((node) => node.nodeType === 3 && node.nodeValue.trim());
      if (!textNodes.length) return;
      const title = document.createElement('span');
      title.className = 'financeChannelLabelText';
      title.textContent = textNodes.map((node) => node.nodeValue.trim()).join(' ');
      textNodes.forEach((node) => node.remove());
      const control = label.querySelector(':scope > input, :scope > select, :scope > textarea');
      label.insertBefore(title, control || label.firstChild);
    };
    ['aciPrice', 'accPrice', 'irvePrice', 'gridPrice'].forEach((id) => wrapChannelLabelText($(id)?.closest('label')));
    const updateAciPriceLabel = () => {
      const label = $('aciPrice')?.closest('label');
      const title = label?.querySelector('.financeChannelLabelText');
      const text = $('financialAnalysis')?.value === 'owner'
        ? 'Prix du kWh évité pour le propriétaire (€/kWh) '
        : 'Prix de vente ACI au client (€/kWh) ';
      if (title) title.textContent = text.trim();
      else if (label?.firstChild) label.firstChild.nodeValue = text;
    };
    $('financialAnalysis')?.addEventListener('change', updateAciPriceLabel);
    updateAciPriceLabel();
    const irvePriceStatus = document.createElement('p');
    irvePriceStatus.id = 'irvePriceStatus';
    irvePriceStatus.className = 'fine';
    irvePriceStatus.setAttribute('role', 'status');
    channelCards.get('irve').appendChild(irvePriceStatus);
    channelDefinitions.forEach(({ key }) => {
      const card = channelCards.get(key);
      card.querySelectorAll('label').forEach((label) => {
        label.classList.add('financeChannelField');
        const controlId = label.querySelector('input,select,textarea')?.id;
        if (['aciShare', 'accShare', 'irveShare', 'gridShare'].includes(controlId)) label.classList.add('financeShareField');
        if (['aciPrice', 'accPrice', 'irvePrice', 'gridPrice'].includes(controlId)) label.classList.add('financePriceField');
      });
    });
    installContractPricingControls();
    // Use the same entry bounds as the existing declared electricity-price field.
    // These are input sanity bounds, not a market tariff or a profitability rule.
    ['aciPrice', 'accPrice', 'irvePrice', 'gridPrice', 'contractReferencePrice'].forEach((id) => {
      const input = $(id);
      input.min = '0'; input.max = $('prestudyGridPrice')?.max || '10';
      input.name = `electricity-price-${id}`; input.autocomplete = 'off';
    });
    window.dispatchEvent(new CustomEvent('ozeno:prestudy-finance-controls-ready'));
    installSurplusPricingControls();
  }

  function installSurplusPricingControls() {
    const priceInput = $('gridPrice');
    const priceLabel = priceInput?.closest('label');
    const group = priceLabel?.closest('.financeChannelCard') || $('priceGroup');
    if (!group || !priceInput || !priceLabel || $('gridPriceMode')) return;

    const modeLabel = document.createElement('div');
    modeLabel.className = 'surplusModeField';
    modeLabel.innerHTML = '<div class="surplusModeTitle"><label for="gridPriceMode">Cadre de vente du surplus</label></div><select id="gridPriceMode"><option value="oa_s21">Obligation d’achat réglementée · S21</option><option value="contract">Autre contrat de vente</option></select>';
    group.insertBefore(modeLabel, priceLabel);

    const sourceLabel = document.createElement('label');
    sourceLabel.innerHTML = 'Source du tarif contractuel<input id="gridPriceSource" type="text" maxlength="300" autocomplete="off" placeholder="Ex. contrat d’achat, offre d’un agrégateur">';
    sourceLabel.hidden = true;
    priceLabel.insertAdjacentElement('afterend', sourceLabel);

    const reference = document.createElement('span');
    reference.append(document.createTextNode('Référence S21 au 05/06/2026 : 0,011 €/kWh HT, indexée de 2 % par an à l’anniversaire du contrat. Éligibilité et tarif contractuel à confirmer selon le projet et la date de demande de raccordement. Tarif réglementaire affiché à titre indicatif ; l’éligibilité S21 reste à confirmer. '));
    const articleLink = document.createElement('a');
    articleLink.href = regulatedSurplusTariff.articleUrl;
    articleLink.target = '_blank';
    articleLink.rel = 'noreferrer';
    articleLink.textContent = 'Arrêté S21 · article 8';
    const creLink = document.createElement('a');
    creLink.href = regulatedSurplusTariff.creUrl;
    creLink.target = '_blank';
    creLink.rel = 'noreferrer';
    creLink.textContent = 'Barèmes de la CRE';
    reference.append(articleLink, document.createTextNode(' · '), creLink);
    const tariffHelp = createFinanceHelp('surplusTariffHelp', 'Référence et conditions du tarif S21', reference);
    tariffHelp.querySelector('.financeHelpBubble')?.setAttribute('role', 'dialog');
    tariffHelp.querySelector('.financeHelpButton')?.setAttribute('aria-haspopup', 'dialog');
    modeLabel.querySelector('.surplusModeTitle')?.appendChild(tariffHelp);

    const status = document.createElement('p');
    status.className = 'surplusPriceStatus fine';
    status.id = 'surplusPriceStatus';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    sourceLabel.insertAdjacentElement('afterend', status);

    const mode = $('gridPriceMode');
    const sourceInput = $('gridPriceSource');
    const validateSurplusPrice = () => {
      const contractMode = mode.value === 'contract';
      const share = Number($('gridShare')?.value || 0);
      const priceMissing = contractMode && share > 0 && priceInput.value.trim() === '';
      const sourceMissing = contractMode && share > 0 && sourceInput.value.trim() === '';
      priceInput.setCustomValidity(priceMissing ? 'Saisissez le prix prévu par le contrat de vente.' : '');
      sourceInput.setCustomValidity(sourceMissing ? 'Indiquez la source du prix contractuel.' : '');
      status.classList.toggle('invalid', priceMissing || sourceMissing);
      status.textContent = contractMode
        ? priceMissing || sourceMissing
          ? 'Prix et source contractuels requis.'
          : 'Prix contractuel à vérifier sur la pièce citée.'
        : '';
      return priceMissing || sourceMissing;
    };
    const syncMode = () => {
      const nextMode = mode.value === 'contract' ? 'contract' : regulatedSurplusTariff.mode;
      const previousMode = mode.dataset.appliedMode;
      if (previousMode === 'contract' && nextMode === regulatedSurplusTariff.mode) {
        if (priceInput.value.trim()) priceInput.dataset.contractPrice = priceInput.value;
        if (sourceInput.value.trim()) sourceInput.dataset.contractSource = sourceInput.value;
      }
      if (nextMode === regulatedSurplusTariff.mode) {
        priceInput.value = regulatedSurplusTariff.valueEurPerKwh.toFixed(3);
        priceInput.readOnly = true;
        sourceInput.value = 'Arrêté S21 du 6 octobre 2021, article 8, version en vigueur au 5 juin 2026 ; barèmes photovoltaïques CRE.';
        sourceInput.readOnly = true;
        priceLabel.firstChild.nodeValue = 'Tarif réglementé du surplus (€/kWh HT) ';
      } else {
        priceInput.readOnly = false;
        sourceInput.readOnly = false;
        if (previousMode === regulatedSurplusTariff.mode) {
          const savedContractPrice = priceInput.dataset.contractPrice;
          const savedContractSource = sourceInput.dataset.contractSource;
          if (savedContractPrice != null) priceInput.value = savedContractPrice;
          else if (Number(priceInput.value) === regulatedSurplusTariff.valueEurPerKwh) priceInput.value = '';
          if (savedContractSource != null) sourceInput.value = savedContractSource;
          else if (sourceInput.value.startsWith('Arrêté S21 du ')) sourceInput.value = '';
        }
        priceLabel.firstChild.nodeValue = 'Prix contractuel du surplus année 1 (€/kWh HT) ';
      }
      sourceLabel.hidden = nextMode !== 'contract';
      reference.hidden = nextMode !== regulatedSurplusTariff.mode;
      mode.dataset.appliedMode = nextMode;
      validateSurplusPrice();
    };

    priceLabel.firstChild.nodeValue = 'Tarif réglementé du surplus (€/kWh HT) ';
    priceInput.step = '0.001';
    mode.addEventListener('change', () => { syncMode(); calculate(); });
    sourceInput.addEventListener('input', () => { validateSurplusPrice(); calculate(); });
    priceInput.addEventListener('input', () => {
      if (mode.value !== 'contract') {
        priceInput.value = regulatedSurplusTariff.valueEurPerKwh.toFixed(3);
        return;
      }
      priceInput.dataset.contractPrice = priceInput.value;
      validateSurplusPrice();
      calculate();
    });
    $('gridShare')?.addEventListener('input', validateSurplusPrice);
    syncMode();
  }

  function attachFinanceHelp(label, input, id, message) {
    input.insertAdjacentElement('beforebegin', createFinanceHelp(id, 'Afficher l’aide sur le CAPEX', message));
  }

  function createFinanceHelp(id, ariaLabel, content) {
    const help = document.createElement('span');
    help.className = 'financeHelp';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'financeHelpButton';
    button.setAttribute('aria-label', ariaLabel);
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-describedby', id);
    button.textContent = 'i';
    const bubble = document.createElement('span');
    bubble.className = 'financeHelpBubble';
    bubble.id = id;
    bubble.setAttribute('role', 'tooltip');
    if (typeof content === 'string') bubble.textContent = content;
    else bubble.append(content);
    help.append(button, bubble);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const open = help.classList.toggle('is-open');
      button.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (event) => {
      if (help.contains(event.target)) return;
      help.classList.remove('is-open');
      button.setAttribute('aria-expanded', 'false');
    });
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      help.classList.remove('is-open');
      button.setAttribute('aria-expanded', 'false');
      button.blur();
    });
    return help;
  }

  function applyFinancingMode(mode) {
    const share = $('debtShare');
    const details = $('financeDebtDetails');
    if (!share || !details) return;
    const mixed = mode === 'mixed';
    if (!mixed) {
      const currentShare = Number(share.value);
      if (currentShare > 0) share.dataset.previousMixedShare = String(currentShare);
      share.value = '0';
    } else if (Number(share.value) <= 0) {
      share.value = share.dataset.previousMixedShare || '30';
    }
    details.hidden = !mixed;
    ['debtShare', 'debtRate', 'debtTerm'].forEach((id) => { if ($(id)) $(id).disabled = !mixed; });
  }

  function simplifyPreviewFinance() {
    const card = $('audit-finance');
    if (!card) return;
    const financeHeading = card.querySelector('.sectionTitle h2');
    if (financeHeading) financeHeading.textContent = 'Simulation économique du projet';
    const irrLabel = $('irr')?.previousElementSibling;
    if (irrLabel) irrLabel.textContent = 'TRI annuel avant fiscalité';
    const multipleLabel = $('multiple')?.previousElementSibling;
    if (multipleLabel) {
      multipleLabel.replaceChildren(document.createTextNode('Multiple investi à '));
      const horizonLabel = document.createElement('span');
      horizonLabel.id = 'multipleHorizon';
      const initialHorizon = Number($('term')?.value || 30);
      horizonLabel.textContent = `${initialHorizon} ${initialHorizon === 1 ? 'an' : 'ans'}`;
      multipleLabel.appendChild(horizonLabel);
    }
    const paybackLabel = $('payback')?.previousElementSibling;
    if (paybackLabel) {
      paybackLabel.textContent = 'Durée d’amortissement';
      paybackLabel.title = 'Nombre d’années avant que les flux de trésorerie cumulés couvrent les fonds propres investis ; ce n’est pas la durée d’amortissement comptable.';
    }
    const metrics = card.querySelector('.metrics');
    metrics?.classList.add('financePreviewMetrics');
    if (metrics && !$('financeCapexTotal')) {
      const capexTile = document.createElement('div');
      capexTile.className = 'metric';
      capexTile.innerHTML = '<b>CAPEX total</b><span id="financeCapexTotal">À calculer</span><small id="financeInitialInvestmentDetail" class="fine">CAPEX client : à calculer</small>';
      metrics.appendChild(capexTile);
    }
    const equityLabel = $('equity')?.previousElementSibling;
    if (equityLabel && !$('financeEquitySharePercent')) {
      const percentage = document.createElement('span');
      percentage.className = 'financeMetricPercent';
      percentage.id = 'financeEquitySharePercent';
      equityLabel.append(document.createTextNode(' · '), percentage);
    }
    const badge = card.querySelector('.sectionTitle .pill');
    const hint = card.querySelector('.hint');
    if (badge) badge.textContent = 'APERÇU · NON CANONIQUE';
    if (hint) hint.textContent = 'Simulation indicative calculée dans le navigateur à partir de l’aperçu toiture. Ces résultats ne sont pas des résultats OZENO validés.';

    const productionStatus = document.createElement('p');
    productionStatus.className = 'financeProductionSource';
    productionStatus.id = 'financeProductionSource';
    productionStatus.setAttribute('role', 'status');
    card.querySelector('.metrics')?.insertAdjacentElement('beforebegin', productionStatus);
    const benchmarkNote = document.createElement('p');
    benchmarkNote.className = 'fine financeBenchmarkNote';
    benchmarkNote.id = 'financeBenchmarkNote';
    benchmarkNote.textContent = 'Le calcul utilise la production moyenne estimée par PVGIS, pas un P50 ou un P90. Ces scénarios ne seront intégrés qu’à partir de résultats externes qualifiés ; aucune décote statistique n’est inventée.';
    productionStatus.insertAdjacentElement('afterend', benchmarkNote);
    const methodNote = document.createElement('p');
    methodNote.className = 'fine financeMethodNote';
    methodNote.textContent = 'TRI annuel de démonstration calculé avant fiscalité : aucun impôt sur les sociétés (IS) ni impôt sur le revenu (IR) n’est inclus. Il est calculé sur les flux de la durée choisie. La répartition automatique retient le plafond annuel d’ACI, pas l’autoconsommation réelle : elle doit être recalculée avec des profils horaires. Les recettes présentées sont brutes, en année 1, avant charges.';
    card.querySelector('.metrics')?.insertAdjacentElement('afterend', methodNote);
    ['adjust'].forEach((id) => {
      const label = $(id)?.closest('label');
      if (label) label.hidden = true;
    });

    const form = card.querySelector('.form');
    if (form && !form.closest('.financePreviewDetails')) {
      const details = document.createElement('details');
      details.className = 'financePreviewDetails';
      details.open = true;
      details.innerHTML = '<summary>Modifier les hypothèses financières de démonstration</summary><p class="fine">La production est reprise de PVGIS si l’aperçu est disponible ; sinon, saisissez une hypothèse annuelle plausible. Dans les deux cas, cette valeur reste indicative et à confirmer. Dette, prix et autres paramètres restent des hypothèses de prévisualisation, pas des données canoniques.</p>';
      form.parentNode.insertBefore(details, form);
      details.appendChild(form);
      ['mixInfo', 'financingAssumptions'].forEach((id) => { if ($(id)) details.appendChild($(id)); });
    }

    const report = document.querySelector('.reportEditor');
    const reportBadge = report?.querySelector('.sectionTitle .pill');
    if (reportBadge) reportBadge.textContent = 'BROUILLON · APERÇU';
    const reportHint = report?.querySelector('.hint');
    if (reportHint) reportHint.textContent = 'Rapport de travail mis à jour avec les données du projet. Relisez-le, puis téléchargez directement son PDF.';
  }

  function updatePreviewFinanceMetrics(capexResult) {
    const capex = capexResult?.ready && Number.isFinite(Number(capexResult.totalCapex))
      ? Number(capexResult.totalCapex)
      : null;
    const split = currentCapexSplit();
    const capexNode = $('financeCapexTotal');
    if (capexNode) capexNode.textContent = split ? `${format(split.initialInvestmentEur)} €` : 'À calculer';
    const investmentDetail = $('financeInitialInvestmentDetail');
    if (investmentDetail) investmentDetail.textContent = split
      ? `CAPEX client ${format(split.capex)} € · commission facturée à l’installateur, sans supplément client`
      : 'CAPEX client : à calculer';
    const percentageNode = $('financeEquitySharePercent');
    const sharePercent = split && split.initialInvestmentEur > 0 ? split.equity / split.initialInvestmentEur * 100 : null;
    if (percentageNode) percentageNode.textContent = sharePercent == null
      ? '—'
      : `${sharePercent.toFixed(1).replace('.', ',')} %`;
  }

  function currentInstallationCostReference() {
    const referenceKwp = Number(installationSizing?.referenceKwp);
    if (!(referenceKwp > 0)) return null;
    const selected = $('capexInstallationType')?.value || 'auto';
    const types = window.OzenoRoofSurfaces?.getInstallationTypes?.() || [];
    const roof = types.length && types.every((type) => ['PITCHED', 'FLAT'].includes(type));
    const carport = types.length && types.every((type) => type === 'PARKING_CANOPY');
    const ground = types.length && types.every((type) => type === 'GROUND_MOUNTED');
    if (selected === 'auto' && !roof && !carport && !ground) return null;
    const isCarport = selected === 'carport' || (selected === 'auto' && carport);
    const isGround = selected === 'ground' || (selected === 'auto' && ground);
    return window.SolarShiftInstallationCosts?.resolve({
      referenceKwp, siteKind: isCarport || isGround ? 'land' : 'building',
      buildingUse: selected === 'industrial' ? 'industry' : selected === 'commercial' ? 'other' : $('prestudyBuildingType')?.value || null,
      externalSurfaceType: isCarport ? 'parking' : isGround ? 'terrain' : null
    }) || null;
  }

  function updateGlobalCapex() {
    const capexInput = $('capex');
    if (!capexInput) return null;
    const cost = $('capexPerKwp');
    const automatic = $('capexReferenceMode')?.value === 'benchmark';
    const reference = currentInstallationCostReference();
    if (cost) {
      cost.readOnly = automatic;
      if (automatic) cost.value = reference ? String(reference.referenceEurPerKwp) : '';
    }
    const referenceStatus = $('capexReferenceStatus');
    if (referenceStatus) referenceStatus.textContent = automatic
      ? reference ? `${reference.label} · ${reference.version} · ${format(reference.referenceEurPerKwp)} €/kWc. Commission installateur non ajoutée au coût client.`
        : 'Nature ou puissance à préciser pour choisir un abaque ; vous pouvez aussi saisir un prix / devis.'
      : `Prix saisi / devis conservé : ${Number(cost?.value) > 0 ? format(Number(cost.value)) + ' €/kWc' : 'à renseigner'}. ${reference ? `Abaque indicatif pour ce chantier : ${format(reference.referenceEurPerKwp)} €/kWc. Pour l’appliquer, sélectionnez « Abaque selon le chantier » dans « Origine du coût PV ».` : 'Nature ou puissance à préciser pour afficher l’abaque de comparaison.'} Aucun supplément de commission installateur.`;
    if (automatic && !reference) capexInput.dataset.solarBaseCapex = '';
    const capacity = Number(installationSizing?.referenceKwp);
    if (capacity > 0) capexInput.dataset.solarBaseCapex = Number(cost?.value) > 0 ? String(Math.round(capacity * Number(cost.value))) : '';
    const solarBase = capexInput.dataset.solarBaseCapex ?? capexInput.value;
    const irvePower = calculateIrvePowerKw($('irveChargerCount')?.value ?? 0, $('irvePowerPerChargerKw')?.value || '7.4', $('irveCustomPowerKw')?.value);
    const irvePowerInput = $('irvePowerKw');
    const customPowerLabel = $('irveCustomPowerLabel');
    const customPowerSelected = $('irvePowerPerChargerKw')?.value === 'custom';
    if (irvePowerInput) irvePowerInput.value = irvePower == null ? '' : String(Number(irvePower.toFixed(1)));
    if (customPowerLabel) customPowerLabel.hidden = !customPowerSelected;
    const irveCapex = $('irveCapex');
    const status = $('irveCapexStatus');
    if (irvePower == null) {
      capexInput.value = '';
      if (irveCapex) irveCapex.value = '';
      if (status) status.textContent = 'Puissance par borne à préciser (une valeur supérieure à 22 kW est requise dans cette option) avant de calculer le CAPEX.';
      return { ready: false, solarCapex: Number(solarBase), irveCapex: null, totalCapex: null };
    }
    const result = calculateTotalCapex(solarBase, irvePower, $('irveInstalledCostPerKw')?.value);
    if (!result) {
      capexInput.value = '';
      if (irveCapex) irveCapex.value = '';
      if (status) status.textContent = 'CAPEX solaire en attente du calcul de toiture.';
      return null;
    }
    if (!result.ready) {
      capexInput.value = '';
      if (irveCapex) irveCapex.value = '';
      if (status) status.textContent = `${$('irveChargerCount').value} borne(s) × ${Number($('irvePowerPerChargerKw').value === 'custom' ? $('irveCustomPowerKw').value : $('irvePowerPerChargerKw').value).toLocaleString('fr-FR')} kW = ${irvePower.toLocaleString('fr-FR')} kW au total. Renseignez le coût installé €/kW à partir d’un devis pour calculer le CAPEX global.`;
      return result;
    }
    capexInput.value = String(Math.round(result.totalCapex));
    if (irveCapex) irveCapex.value = String(Math.round(result.irveCapex));
    if (status) status.textContent = result.irveCapex > 0
      ? `${$('irveChargerCount').value} borne(s) × ${Number($('irvePowerPerChargerKw').value === 'custom' ? $('irveCustomPowerKw').value : $('irvePowerPerChargerKw').value).toLocaleString('fr-FR')} kW = ${irvePower.toLocaleString('fr-FR')} kW ; ${format(irvePower)} kW × ${format(Number($('irveInstalledCostPerKw').value))} €/kW installé = ${format(result.irveCapex)} € estimés, à confirmer par devis validé.`
      : 'Aucune borne renseignée : aucun CAPEX IRVE ajouté.';
    return result;
  }

  function updateCapexRangeNote(capexResult = null) {
    const note = $('capexRangeNote');
    if (!note) return;
    const sizing = installationSizing;
    const unitCost = Number($('capexPerKwp')?.value);
    if (!(sizing?.lowKwp > 0) || !(sizing.highKwp >= sizing.lowKwp) || !(unitCost > 0)) {
      note.textContent = 'Fourchette CAPEX indisponible : puissance et nature du chantier à préciser.';
      return;
    }
    const automatic = $('capexReferenceMode')?.value === 'benchmark';
    const reference = automatic ? currentInstallationCostReference() : null;
    const lowUnit = reference?.lowEurPerKwp ?? unitCost;
    const highUnit = reference?.highEurPerKwp ?? unitCost;
    const irve = capexResult?.ready ? capexResult.irveCapex : 0;
    const low = Math.round(sizing.lowKwp * lowUnit + irve);
    const high = Math.round(sizing.highKwp * highUnit + irve);
    note.textContent = `Fourchette indicative : ${format(low)}–${format(high)} € · ${automatic ? reference?.label || 'abaque à préciser' : 'prix saisi / devis'} (${format(lowUnit)}–${format(highUnit)} €/kWc). ${irve > 0 ? 'IRVE estimée incluse.' : Number($('irveChargerCount')?.value) > 0 ? 'IRVE non incluse : coût à préciser.' : 'PV seul.'} Commission installateur non ajoutée ; base HT/TTC et périmètre à confirmer.`;
  }

  function currentCapexSplit() {
    const capex = Number($('capex')?.value);
    if (!Number.isFinite(capex) || capex <= 0) return null;
    const commissionBase = capex;
    const commissionRate = Number($('assumptionInitialProjectCommissionPct')?.value ?? 10) / 100;
    if (!Number.isFinite(commissionBase) || commissionBase < 0 || !Number.isFinite(commissionRate) || (commissionRate < .08 || commissionRate > .1)) return null;
    const installerCommissionEur = commissionBase * commissionRate;
    const initialProjectCommissionEur = 0;
    const initialInvestmentEur = capex;
    const mode = document.querySelector('input[name="financingMode"]:checked')?.value || 'mixed';
    const debtShare = mode === 'mixed' ? Math.min(100, Math.max(0, Number($('debtShare')?.value) || 0)) / 100 : 0;
    const debt = initialInvestmentEur * debtShare;
    return { capex, initialProjectCommissionEur, installerCommissionEur, initialInvestmentEur, equity: initialInvestmentEur - debt, debt };
  }

  function updateDecisionFinanceMetrics() {
    if (!$('decisionFinanceMetrics')) return;
    const ownerMode = $('financialAnalysis')?.value === 'owner';
    const capexSplit = currentCapexSplit();
    const setText = (id, value) => { const node = $(id); if (node) node.textContent = value; };
    setText('decisionFinanceMetricsTitle', ownerMode ? 'Investissement du propriétaire exploitant' : 'Montage du tiers investisseur / SPV');
    setText('decisionFinanceEquityLabel', ownerMode ? 'Fonds propres du propriétaire' : 'Fonds propres investisseur');
    setText('decisionFinanceIrrLabel', ownerMode ? 'TRI fonds propres propriétaire · avant impôts' : 'TRI fonds propres investis · avant impôts');
    setText('decisionFinanceCapex', capexSplit ? `${format(capexSplit.initialInvestmentEur)} €` : 'À calculer');
    const capexDetail = $('decisionFinanceCapex')?.parentElement;
    if (capexDetail) {
      let commissionNote = capexDetail.querySelector('[data-initial-project-commission]');
      if (!commissionNote) {
        commissionNote = document.createElement('small');
        commissionNote.dataset.initialProjectCommission = 'true';
        capexDetail.appendChild(commissionNote);
      }
      commissionNote.textContent = capexSplit
        ? `CAPEX client ${format(capexSplit.capex)} € · commission installateur non ajoutée`
        : 'Commission 1 : à calculer';
    }
    setText('decisionFinanceEquity', capexSplit ? `${format(capexSplit.equity)} €` : 'À calculer');
    setText('decisionFinanceDebt', capexSplit ? `${format(capexSplit.debt)} €` : 'À calculer');
    const unavailable = reportFinanceSummary.message || 'À calculer';
    setText('decisionFinanceIrr', reportFinanceSummary.status === 'READY' ? $('irr')?.textContent || 'À calculer' : unavailable);
    setText('decisionFinancePayback', reportFinanceSummary.status === 'READY' ? $('payback')?.textContent || 'À calculer' : unavailable);
  }

  function renderFinanceImpactChart(flows, horizon, ownershipMode, payback, unavailableMessage = 'Complétez les données financières pour afficher la trésorerie cumulée.') {
    const panel = $('decisionCashflowPanel');
    const chart = $('decisionCashflowChart');
    const interpretation = $('decisionCashflowInterpretation');
    if (!panel || !chart || !interpretation) return;
    const ownerMode = ownershipMode === 'owner';
    const title = $('decisionCashflowTitle');
    if (title) title.textContent = `Trésorerie cumulée estimée · ${ownerMode ? 'propriétaire exploitant' : 'tiers investisseur / SPV'}`;
    chart.replaceChildren();
    const valuesReady = Array.isArray(flows) && flows.length === horizon + 1 && flows.every(Number.isFinite);
    if (!valuesReady) {
      window.SOLARSHIFT_FINANCIAL_PREVIEW = { ...(window.SOLARSHIFT_FINANCIAL_PREVIEW || {}), status: 'UNKNOWN', cashflowCumulativeEur: null, annualRows: null };
      chart.hidden = true;
      interpretation.textContent = unavailableMessage;
      return;
    }

    const cumulative = [];
    flows.reduce((total, flow) => { const next = total + flow; cumulative.push(next); return next; }, 0);
    window.SOLARSHIFT_FINANCIAL_PREVIEW = {
      ...(window.SOLARSHIFT_FINANCIAL_PREVIEW || {}),
      status: 'READY',
      ownershipMode,
      horizonYears: horizon,
      cashflowCumulativeEur: cumulative,
      cashflowInterpretation: interpretation.textContent
    };
    const rawMin = Math.min(0, ...cumulative), rawMax = Math.max(0, ...cumulative);
    const padding = Math.max(1, (rawMax - rawMin) * .1);
    const minValue = rawMin - padding, maxValue = rawMax + padding;
    const left = 74, right = 858, top = 18, bottom = 190;
    const barWidth = Math.min(24, Math.max(5, (right - left) / Math.max(2, horizon + 1) * .66));
    // Keep year 0's bar clear of the y-axis and the tick labels on its left.
    const firstBarCenter = left + barWidth / 2 + 8;
    const x = (year) => firstBarCenter + (right - firstBarCenter) * year / Math.max(1, horizon);
    const y = (value) => bottom - (value - minValue) / (maxValue - minValue) * (bottom - top);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 900 232');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Trésorerie cumulée estimée non actualisée sur ${horizon} ans, ${ownerMode ? 'propriétaire exploitant' : 'tiers investisseur / SPV'}`);
    const addLine = (x1, y1, x2, y2, className) => {
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1); line.setAttribute('x2', x2); line.setAttribute('y2', y2); line.setAttribute('class', className); svg.appendChild(line);
    };
    const addText = (text, tx, ty, anchor = 'start') => {
      const label = document.createElementNS(ns, 'text');
      label.textContent = text; label.setAttribute('x', tx); label.setAttribute('y', ty); label.setAttribute('text-anchor', anchor); svg.appendChild(label);
    };
    [minValue, 0, maxValue].forEach((value) => {
      const lineY = y(value);
      addLine(left, lineY, right, lineY, value === 0 ? 'cashflowZero' : 'cashflowGrid');
      addText(`${value > 0 ? '+' : ''}${format(value)} €`, left - 8, lineY + 4, 'end');
    });
    addLine(left, top, left, bottom, 'cashflowGrid');
    const zeroY = y(0);
    cumulative.forEach((value, year) => {
      const valueY = y(value);
      const bar = document.createElementNS(ns, 'rect');
      bar.setAttribute('class', value < 0 ? 'cashflowBarNegative' : 'cashflowBarPositive');
      bar.setAttribute('x', x(year) - barWidth / 2);
      bar.setAttribute('y', Math.min(zeroY, valueY));
      bar.setAttribute('width', barWidth);
      bar.setAttribute('height', Math.max(1, Math.abs(zeroY - valueY)));
      bar.setAttribute('rx', '2');
      bar.setAttribute('aria-label', `Année ${year} : ${format(value)} euros cumulés`);
      const label = document.createElementNS(ns, 'title');
      label.textContent = `Année ${year} : ${format(value)} € cumulés`;
      bar.appendChild(label);
      svg.appendChild(bar);
    });
    const crossing = cumulative.findIndex((value, year) => year > 0 && value >= 0);
    const midYear = Math.round(horizon / 2);
    [...new Set([0, midYear, horizon])].forEach((year) => addText(`Année ${year}`, x(year), 218, 'middle'));
    chart.appendChild(svg);
    chart.hidden = false;
    if (crossing > 0) {
      interpretation.textContent = `Le cumul estimé repasse au-dessus de zéro en année ${crossing} (${payback || `${crossing} ans`} de retour simple, sans actualisation).`;
    } else {
      const finalValue = cumulative[cumulative.length - 1];
      interpretation.textContent = `Le seuil de retour n’est pas atteint sur ${horizon} ans ; le cumul estimé en fin de période est de ${finalValue < 0 ? '−' : ''}${format(Math.abs(finalValue))} €.`;
    }
  }

  function updateReportFinanceTiles() {
    updateDecisionFinanceMetrics();
    updatePreviewDecisionIndicators();
    const reportCapex = $('reportPerformance');
    const capexLabel = reportCapex?.previousElementSibling;
    if (capexLabel) capexLabel.textContent = 'CAPEX global';
    const capexSplit = currentCapexSplit();
    if (reportCapex) reportCapex.textContent = capexSplit ? `${format(capexSplit.initialInvestmentEur)} €` : 'À calculer';
    if (reportCapex) {
      const tile = reportCapex.closest('div');
      let detail = tile?.querySelector('[data-report-capex-detail]');
      if (tile && !detail) {
        detail = document.createElement('small');
        detail.className = 'fine';
        detail.dataset.reportCapexDetail = 'true';
        tile.appendChild(detail);
      }
      if (detail) detail.textContent = capexSplit
        ? `CAPEX client ${format(capexSplit.capex)} € · fonds propres ${format(capexSplit.equity)} € + dette ${format(capexSplit.debt)} €`
        : 'Fonds propres + dette';
    }

    const reportGain = $('reportMix');
    const gainLabel = reportGain?.previousElementSibling;
    const horizon = Number(reportFinanceSummary.horizonYears || $('term')?.value || 30);
    const ownerMode = reportFinanceSummary.ownershipMode === 'owner';
    if (gainLabel) gainLabel.textContent = `${ownerMode ? 'Économies et recettes brutes estimées' : 'Recettes brutes estimées'} · ${horizon} ans`;
    if (reportGain) reportGain.textContent = reportFinanceSummary.status === 'READY'
      ? `${format(reportFinanceSummary.totalEnergyValueEur)} €`
      : reportFinanceSummary.message || 'À calculer';
    if (reportGain) {
      const tile = reportGain.closest('div');
      let detail = tile?.querySelector('[data-report-gain-detail]');
      if (tile && !detail) {
        detail = document.createElement('small');
        detail.className = 'fine';
        detail.dataset.reportGainDetail = 'true';
        tile.appendChild(detail);
      }
      if (detail) detail.textContent = reportFinanceSummary.status === 'READY'
        ? ownerMode
          ? 'Économie ACI (factures évitées) et recettes ACC, IRVE et surplus cumulées, avant charges et impôts.'
          : 'Recettes ACI, ACC, IRVE et surplus cumulées, avant charges et impôts.'
        : ownerMode
          ? 'Économie ACI et recettes ACC, IRVE et surplus cumulées sur la durée choisie.'
          : 'Recettes cumulées ACI, ACC, IRVE et surplus sur la durée choisie.';
    }

    const benchmark = $('reportBenchmark');
    const benchmarkLabel = benchmark?.previousElementSibling;
    if (benchmarkLabel) benchmarkLabel.textContent = 'Rendement spécifique estimé · PVGIS moyen';
    const yieldText = $('dashPerformance')?.textContent?.trim() || '';
    if (benchmark) benchmark.textContent = /\d[\d\s\u202f,.]*\s*kWh\/kWc\/an/i.test(yieldText)
      ? yieldText
      : 'À calculer';
    if (benchmark) benchmark.title = 'Production moyenne PVGIS utilisée pour la simulation ; P50/P90 non intégrés.';
  }

  function setTextIfChanged(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  function updatePreviewDecisionIndicators() {
    const preview = window.SOLARSHIFT_FINANCIAL_PREVIEW || {};
    const ready = preview.status === 'READY';
    const projectIrr = $('decisionFinanceProjectIrr');
    const projectNote = $('decisionFinanceProjectIrrNote');
    setTextIfChanged(projectIrr, ready && Number.isFinite(preview.projectIrrPct)
      ? `${preview.projectIrrPct.toFixed(1).replace('.', ',')} %`
      : ready ? 'Non calculable' : preview.status === 'UNKNOWN' && preview.reason ? 'À recalculer' : 'À calculer');
    setTextIfChanged(projectNote, ready && !Number.isFinite(preview.projectIrrPct)
      ? 'Flux projet sans TRI interprétable sur la période.'
      : ready
        ? `CAPEX initial, puis revenus moins OPEX sur ${preview.horizonYears} ans, avant financement et impôts · aperçu indicatif.`
        : 'CAPEX initial, puis revenus moins OPEX, avant financement et impôts · aperçu indicatif.');

    const dscr = $('decisionFinanceDscr');
    const dscrNote = $('decisionFinanceDscrNote');
    if (!dscr) return;
    if (!ready) {
      setTextIfChanged(dscr, preview.status === 'UNKNOWN' && preview.reason ? 'À recalculer' : 'À calculer');
      setTextIfChanged(dscrNote, 'Flux disponible avant dette ÷ intérêts et principal ; minimum pendant la durée de dette.');
    } else if (preview.debtEur <= 0) {
      setTextIfChanged(dscr, 'Sans dette');
      setTextIfChanged(dscrNote, 'Aucun service de dette à couvrir. Définition : (revenus − OPEX) ÷ intérêts et principal.');
    } else if (Number.isFinite(preview.minimumDscr)) {
      setTextIfChanged(dscr, `${preview.minimumDscr.toFixed(2).replace('.', ',')}× · année ${preview.minimumDscrYear}`);
      setTextIfChanged(dscrNote, 'Minimum annuel : (revenus − OPEX) ÷ intérêts et principal, avant impôts.');
    } else {
      setTextIfChanged(dscr, 'Non calculable');
      setTextIfChanged(dscrNote, 'Le service de dette n’est pas complet sur la période retenue.');
    }
  }
  if (typeof window.addEventListener === 'function') window.addEventListener('ozeno:prestudy-summary-presentation-ready', updatePreviewDecisionIndicators);

  function installReportFinanceTiles() {
    const originalUpdate = window.updateReport;
    if (typeof originalUpdate === 'function' && !originalUpdate.__ozenoFinanceTiles) {
      const update = function (...args) {
        const result = originalUpdate.apply(this, args);
        updateReportFinanceTiles();
        return result;
      };
      update.__ozenoFinanceTiles = true;
      window.updateReport = update;
      if ($('reportRefresh')) $('reportRefresh').onclick = update;
      if ($('reportPrint')) $('reportPrint').onclick = update;
      ['reportTitle', 'reportDate', 'reportConclusion'].forEach((id) => {
        const field = $(id);
        if (field && field.dataset.reportFinanceTilesBound !== 'true') {
          field.dataset.reportFinanceTilesBound = 'true';
          field.addEventListener('input', updateReportFinanceTiles);
        }
      });
    }
    updateReportFinanceTiles();
  }

  function installProjectReportShortcut() {
    const finance = $('audit-finance');
    const report = document.querySelector('.reportEditor');
    const heading = finance?.querySelector('.sectionTitle');
    if (!finance || !report || !heading || report.dataset.cr007Launcher === 'true') return;
    report.dataset.cr007Launcher = 'true';
    report.id ||= 'reportEditor';

    const title = report.querySelector('.sectionTitle h2');
    if (title) title.textContent = 'Rapport de restitution';
    const reportBadge = report.querySelector('.sectionTitle .pill');
    if (reportBadge) reportBadge.textContent = 'Étude préalable · provisoire';
    [...report.children].filter((child) => !child.matches('.sectionTitle')).forEach((child) => { child.hidden = true; });

    const launchPanel = document.createElement('div');
    launchPanel.className = 'scenarioReportLaunch';
    const explanation = document.createElement('p');
    explanation.textContent = 'Étape 1 · Pré-étude d’évaluation. Les calculs PVGIS et financiers peuvent s’appuyer sur des hypothèses plausibles ; ils restent des estimations et ne nécessitent pas de profil canonique vérifié. Les pièces et données à confirmer sont signalées.';
    const status = document.createElement('p');
    status.className = 'scenarioReportLaunchStatus';
    status.id = 'projectScenarioReportStatus';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const audience = document.createElement('label');
    audience.className = 'scenarioReportAudience';
    audience.append(document.createTextNode('Rapport destiné à '));
    const viewpoint = document.createElement('select');
    viewpoint.id = 'projectScenarioReportViewpoint';
    viewpoint.setAttribute('aria-label', 'Destinataire du rapport');
    viewpoint.innerHTML = '<option value="OWNER">Porteur du projet / propriétaire</option><option value="INVESTOR">Investisseur</option><option value="SPV">Société de projet (SPV)</option>';
    viewpoint.value = $('financialAnalysis')?.value === 'owner' ? 'OWNER' : 'INVESTOR';
    audience.appendChild(viewpoint);
    const generateButton = document.createElement('button');
    generateButton.className = 'action scenarioReportLaunchLink';
    generateButton.id = 'generateProvisionalScenarioReport';
    generateButton.type = 'button';
    generateButton.textContent = 'Générer le rapport provisoire';
    const finalStepLink = document.createElement('a');
    finalStepLink.className = 'action scenarioReportLaunchLink';
    finalStepLink.id = 'openFinalReportWorkspace';
    finalStepLink.textContent = 'Étape 2 · Continuer vers le rapport final';
    finalStepLink.hidden = true;
    const syncFinalStepLink = () => {
      const projectId = window.SOLARSHIFT_CONFIG?.projectId;
      finalStepLink.hidden = !projectId;
      if (projectId) finalStepLink.href = `./workspace.html?projectId=${encodeURIComponent(projectId)}`;
    };
    syncFinalStepLink();
    window.addEventListener('ozeno:project-context-loaded', syncFinalStepLink);
    const launchLink = document.createElement('a');
    launchLink.className = 'action scenarioReportLaunchLink';
    launchLink.id = 'projectScenarioReportLink';
    launchLink.target = '_blank';
    launchLink.rel = 'noopener noreferrer';
    launchLink.hidden = true;
    launchPanel.append(explanation, audience, generateButton, status, launchLink, finalStepLink);
    report.appendChild(launchPanel);

    const actions = document.createElement('div');
    actions.className = 'financeReportActions';
    const badge = heading.querySelector('.pill');
    if (badge) actions.appendChild(badge);
    const shortcutLink = document.createElement('a');
    shortcutLink.className = 'financeReportShortcut';
    shortcutLink.href = '#reportEditor';
    shortcutLink.textContent = 'Accéder au rapport';
    actions.appendChild(shortcutLink);
    heading.appendChild(actions);

    generateButton.addEventListener('click', async () => {
      generateButton.disabled = true;
      launchLink.hidden = true;
      status.textContent = 'Assemblage du rapport provisoire depuis les données visibles de l’étude…';
      try {
        if (typeof window.updateReport === 'function') window.updateReport();
        const { buildProvisionalReport } = await import('./provisional-report.mjs');
        const currentReport = getDecisionReportPdfData();
        const config = window.SOLARSHIFT_CONFIG || {};
        const projectName = $('name')?.value?.trim() || $('ozenoProjectName')?.textContent?.trim() || currentReport.title || 'Projet sans nom';
        const projectSite = config.projectContext?.address || $('dashAddress')?.textContent?.trim() || 'Site à préciser';
        const representative = await window.OzenoProjectHub?.getMandataireContact?.() || {};
        const roofDraft = window.OzenoRoofSurfaces?.captureDraft?.() || null;
        const metrics = [...currentReport.metrics];
        const consumption = previewConsumptionReference();
        metrics.push({ label: consumption.status === 'ASSUMPTION' ? 'Consommation annuelle estimée · abaque SolarShift V1' : 'Consommation annuelle retenue pour l’étude', value: Number.isFinite(consumption.valueKwh) ? `${format(consumption.valueKwh)} kWh/an${consumption.status === 'ASSUMPTION' ? ' · hypothèse à confirmer' : ''}` : 'Non renseigné ou à valider' });
        const electricityReference = previewElectricityReference();
        if (electricityReference.power.band) {
          const powerLabel = { LE_36_KVA: '≤ 36 kVA', '37_100_KVA': '37–100 kVA', '101_250_KVA': '101–250 kVA', GT_250_KVA_BT: '>250 kVA BT', HTA: 'HTA / grande puissance' }[electricityReference.power.band] || electricityReference.power.band;
          metrics.push({ label: 'Puissance souscrite · pré-étude', value: `${powerLabel}${electricityReference.power.value == null ? '' : ` · ${Number(electricityReference.power.value).toLocaleString('fr-FR')} kVA`}${electricityReference.power.status === 'ASSUMPTION' ? ' · suggestion SolarShift à confirmer' : ' · information déclarée'}` });
        }
        if (electricityReference.price.status === 'DECLARED' || electricityReference.price.status === 'PARTIAL') {
          metrics.push({ label: 'Prix moyen du kWh réseau · déclaration', value: `${Number(electricityReference.price.valueEurPerKwh).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} €/kWh ${electricityReference.price.basis}${electricityReference.price.usableForHtEconomics ? '' : ' · base à harmoniser'}` });
        } else if (electricityReference.benchmarkPrice.corridorEurPerKwh) {
          const price = electricityReference.benchmarkPrice.corridorEurPerKwh;
          const aci = electricityReference.benchmarkPrice.aciAvoidableCorridorEurPerKwh;
          metrics.push({ label: 'Prix réseau total · benchmark SolarShift V1 HT', value: `${price.low.toFixed(2)}–${price.high.toFixed(2)} €/kWh · réf. ${price.ref.toFixed(2)} €/kWh` });
          metrics.push({ label: 'Composante ACI évitable · benchmark SolarShift V1 HT', value: `${aci.low.toFixed(2)}–${aci.high.toFixed(2)} €/kWh · réf. ${aci.ref.toFixed(2)} €/kWh` });
        }
        if ($('financialAnalysis')?.value === 'owner' && $('aciPrice')?.dataset.prestudyBenchmark === 'true') {
          metrics.push({ label: 'Valorisation ACI propriétaire exploitant', value: `${Number($('aciPrice').value).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} €/kWh évité · hypothèse SolarShift V1, distincte du coût de production solaire` });
        }
        const moduleCount = $('terrainPanelCount')?.textContent?.trim();
        const sizingReference = $('terrainSizingReference')?.textContent?.trim();
        const sizingMethod = $('roofSizingSummary')?.textContent?.trim();
        if (moduleCount && moduleCount !== 'À calculer') metrics.push({ label: 'Quantité indicative de modules photovoltaïques', value: moduleCount });
        if (sizingReference && sizingReference !== 'Repère de densité et puissance à calculer.') metrics.push({ label: 'CR-010 V2 · densité et puissance de pré-dimensionnement', value: sizingReference });
        if (sizingMethod) metrics.push({ label: 'Méthode de dimensionnement et réserve installateur', value: `${sizingMethod} Étude solaire EPONE jointe : DMEGC Solar DM500M10RT-B60HBT, 500 Wc, 600 modules pour 300 kWc, bifacial double-verre, 1 950 × 1 134 × 30 mm. Cette configuration est distincte de la quantité calculée par l’estimation de toiture ; à confirmer ou remplacer pour tout autre projet.` });
        const climatePreview = config.climateYieldPreview;
        const productionPreview = config.commercialProductionPreview;
        if (productionPreview?.status === 'READY') {
          const annualProduction = Number(productionPreview.annualKwh);
          const specificYield = Number(productionPreview.specificYieldKwhKwp);
          const hasAnnualProduction = metrics.some(metric => /production annuelle/i.test(metric.label || ''));
          const hasSpecificYield = metrics.some(metric => /rendement specifique|kwh\/kwc/i.test((metric.label || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
          if (!hasAnnualProduction && Number.isFinite(annualProduction) && annualProduction > 0) metrics.push({ label: 'Production annuelle estimée · PVGIS', value: `${format(annualProduction)} kWh/an` });
          if (!hasSpecificYield && Number.isFinite(specificYield) && specificYield > 0) metrics.push({ label: 'Rendement spécifique estimé', value: `${format(specificYield)} kWh/kWc/an` });
        }
        if (climatePreview?.status === 'READY') {
          const climateUnit = value => `${format(Number(value))} kWh/an`;
          if (climatePreview.climateP50Kwh != null && Number.isFinite(Number(climatePreview.climateP50Kwh))) metrics.push({ label: 'Production historique · Climate P50', value: climateUnit(climatePreview.climateP50Kwh) });
          if (climatePreview.climateP75Kwh != null && Number.isFinite(Number(climatePreview.climateP75Kwh))) metrics.push({ label: 'Production historique · Climate P75', value: climateUnit(climatePreview.climateP75Kwh) });
          if (climatePreview.climateP90Kwh != null && Number.isFinite(Number(climatePreview.climateP90Kwh))) metrics.push({ label: 'Production historique · Climate P90', value: climateUnit(climatePreview.climateP90Kwh) });
        }
        const capexValue = Number($('capex')?.value);
        const financePreview = window.SOLARSHIFT_FINANCIAL_PREVIEW || {};
        metrics.splice(0, metrics.length, ...metrics.filter(metric => !/opex hypothèse intégré/i.test(metric.label || '')));
        const yearOneFinanceRow = financePreview.status === 'READY' ? financePreview.annualRows?.[1] : null;
        if (yearOneFinanceRow) {
          metrics.push({
            label: 'OPEX hypothèse année 1 intégré au calcul du TRI',
            value: `${format(yearOneFinanceRow.opexEur)} €/an · maintenance ${format(yearOneFinanceRow.maintenanceEur)} € · assurance ${format(yearOneFinanceRow.insuranceEur)} €${yearOneFinanceRow.managementCommissionEur ? ` · commission ${format(yearOneFinanceRow.managementCommissionEur)} €` : ''}${yearOneFinanceRow.rentEur ? ` · loyer ${format(yearOneFinanceRow.rentEur)} €` : ''}`
          });
        } else if (Number.isFinite(capexValue) && capexValue > 0) {
          metrics.push({ label: 'OPEX hypothèse intégré au calcul du TRI', value: `Maintenance : ${format(capexValue * .025)} €/an · assurance estimée : ${format(capexValue * .004)} €/an` });
        }
        const revenueValues = financePreview.revenueStatus === 'READY' ? financePreview.yearOneRevenueByUseEur : null;
        const revenueItems = revenueValues ? [
          { label: financePreview.ownershipMode === 'owner' ? 'Économie ACI' : 'Recette ACI', value: revenueValues.aci, color: '#f2bb35' },
          { label: 'Recettes ACC', value: revenueValues.acc, color: '#49b887' },
          { label: 'Recettes IRVE', value: revenueValues.irve, color: '#bc78e0' },
          { label: 'Vente du surplus', value: revenueValues.surplus, color: '#63a9d1' }
        ] : [];
        const annual = Array.isArray(climatePreview?.annual_yield_by_year)
          ? climatePreview.annual_yield_by_year.map(item => ({ year: item.year, productionKwh: item.production_kwh }))
          : [];
        const id = globalThis.crypto?.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const reportData = buildProvisionalReport({
          id,
          title: reportTitleValue(projectName),
          site: projectSite,
          financialViewpoint: viewpoint.value,
          representative,
          metrics,
          sections: currentReport.sections,
          visuals: {
            roof: roofDraft,
            matching: window.SOLARSHIFT_PROSPECTING_MATCHING || null,
            pricing: window.SOLARSHIFT_ACC_PRICING || null,
            production: productionPreview?.status === 'READY' ? {
              monthlyKwh: productionPreview.monthlyKwh,
              annualKwh: productionPreview.annualKwh,
              consumptionAnnualKwh: Number.isFinite(consumption) && consumption > 0 ? consumption : null
            } : null,
            climate: climatePreview?.status === 'READY' ? {
              annual,
              p50Kwh: climatePreview.climateP50Kwh,
              p75Kwh: climatePreview.climateP75Kwh,
              p90Kwh: climatePreview.climateP90Kwh,
              interpretation: `${annual.length} années historiques PVGIS comparées. P50 = médiane ; P90 = seuil bas observé environ 9 années sur 10. Cette variabilité climatique ne constitue pas un P90 d’investissement.`
            } : null,
            revenue: revenueItems.length ? { title: $('revenueChartTitle')?.textContent, items: revenueItems } : null,
            cashflow: financePreview.status === 'READY' ? {
              cumulativeEur: financePreview.cashflowCumulativeEur,
              horizonYears: financePreview.horizonYears,
              interpretation: financePreview.cashflowInterpretation,
              basis: financePreview.basis,
              financing: { capexEur: financePreview.capexEur, installationCapexEur: financePreview.installationCapexEur, totalCapexEur: financePreview.totalCapexEur, initialProjectCommissionEur: financePreview.initialProjectCommissionEur, totalInitialInvestmentEur: financePreview.totalInitialInvestmentEur, equityEur: financePreview.equityEur, debtEur: financePreview.debtEur },
              annualRows: financePreview.annualRows
            } : null
          },
          generatedAt: new Date().toISOString()
        });
        reportData.payload.return_url = location.href;
        const storageKey = `ozeno-provisional-report:${id}`;
        localStorage.setItem(storageKey, JSON.stringify({ expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, report: reportData }));
        launchLink.href = `./scenario-report.html?local=${encodeURIComponent(id)}`;
        launchLink.textContent = 'Ouvrir le rapport provisoire';
        launchLink.hidden = false;
        status.textContent = 'Rapport provisoire créé dans un nouvel onglet. Votre étude reste ouverte et aucune donnée canonique n’a été modifiée.';
      } catch (error) {
        status.textContent = `Impossible de créer le rapport provisoire : ${error.message || 'erreur inconnue'}`;
      } finally {
        generateButton.disabled = false;
      }
    });
  }

  function reportTitleValue(fallback) {
    const custom = $('reportTitle')?.value?.trim();
    return custom || fallback;
  }

  function getDecisionReportPdfData() {
    const preview = $('reportPreview');
    const metrics = [...(preview?.querySelectorAll('.reportGrid > div') || [])].map((item) => ({
      label: item.querySelector('small')?.textContent?.trim() || '',
      value: item.querySelector('b,strong')?.textContent?.trim() || item.textContent.trim()
    }));
    const sections = [];
    let section = null;
    [...(preview?.children || [])].forEach((element) => {
      if (element.matches('h3')) {
        if (section) sections.push(section);
        section = { title: element.textContent.trim(), text: '' };
      } else if (section && element.matches('p, ul, ol')) {
        const text = element.innerText?.trim() || element.textContent.trim();
        if (text) section.text += `${section.text ? '\n' : ''}${text}`;
      } else if (element.matches('.reportOptional')) {
        const summary = element.querySelector('summary')?.textContent?.trim() || 'Informations complémentaires';
        const text = [...element.querySelectorAll('p, li')].map((item) => item.innerText?.trim() || item.textContent.trim()).filter(Boolean).join('\n');
        sections.push({ title: summary, text });
      }
    });
    if (section) sections.push(section);
    return {
      title: $('reportHeading')?.textContent?.trim() || $('reportTitle')?.value?.trim() || 'Rapport décisionnel',
      meta: $('reportProject')?.textContent?.trim() || '',
      metrics,
      sections
    };
  }

  function installDirectReportPdfExport() {
    const button = $('reportPrint');
    const actions = button?.closest('.reportActions');
    if (!button || button.dataset.directPdfBound === 'true') return;
    button.dataset.directPdfBound = 'true';
    button.textContent = 'Télécharger le rapport PDF';
    button.title = 'Génère et télécharge le rapport décisionnel en PDF sans ouvrir la fenêtre d’impression.';
    let status = $('reportExportStatus');
    if (!status && actions) {
      status = document.createElement('p');
      status.id = 'reportExportStatus';
      status.className = 'fine reportExportStatus';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      actions.insertAdjacentElement('afterend', status);
    }
    button.onclick = async () => {
      button.disabled = true;
      if (status) status.textContent = 'Préparation du PDF…';
      try {
        if (typeof window.updateReport === 'function') window.updateReport();
        const report = getDecisionReportPdfData();
        const { downloadReportPdf } = await import('./report-pdf.mjs');
        const projectSlug = report.meta.split('·')[0].trim().replace(/[^a-z0-9]+/giu, '-').replace(/^-+|-+$/gu, '').toLowerCase();
        const titleSlug = report.title.replace(/[^a-z0-9]+/giu, '-').replace(/^-+|-+$/gu, '').toLowerCase();
        const filename = [projectSlug, titleSlug || 'rapport-decisionnel'].filter(Boolean).join('-');
        const downloadedName = downloadReportPdf(report, { filename });
        if (status) status.textContent = `PDF téléchargé : ${downloadedName}`;
      } catch (error) {
        if (status) status.textContent = `Le PDF n’a pas pu être généré : ${error?.message || 'erreur inconnue'}. Réessayez après avoir actualisé l’aperçu.`;
      } finally {
        button.disabled = false;
      }
    };
  }

  function irr(flows) {
    if (!flows.every(Number.isFinite) || !flows.some((value) => value < 0) || !flows.some((value) => value > 0)) return null;
    const signs = flows.filter((value) => value !== 0).map(Math.sign);
    if (signs.slice(1).filter((sign, index) => sign !== signs[index]).length > 1) return null;
    let low = -.9999, high = 1;
    const npv = (rate) => flows.reduce((sum, value, index) => sum + value / (1 + rate) ** index, 0);
    let lowValue = npv(low), highValue = npv(high);
    while (Math.sign(lowValue) === Math.sign(highValue) && high < 100) { high *= 2; highValue = npv(high); }
    if (Math.sign(lowValue) === Math.sign(highValue)) return null;
    for (let index = 0; index < 200; index++) {
      const middle = (low + high) / 2, middleValue = npv(middle);
      if (Math.abs(middleValue) < 1e-10) return middle;
      if (Math.sign(middleValue) === Math.sign(lowValue)) { low = middle; lowValue = middleValue; } else high = middle;
    }
    return (low + high) / 2;
  }

  function calculatePreviewReturnMetrics(schedule, horizonYears, debtTermYears) {
    const horizon = Math.floor(Number(horizonYears));
    const debtTerm = Math.floor(Number(debtTermYears));
    const rows = schedule?.rows;
    const investment = Number(schedule?.totalInitialInvestmentEur);
    const debt = Number(schedule?.debtEur);
    if (!Array.isArray(rows) || rows.length !== horizon + 1 || horizon < 1 || debtTerm < 1
      || !Number.isFinite(investment) || investment <= 0 || !Number.isFinite(debt) || debt < 0
      || rows.some((row, index) => Number(row.year) !== index)) return null;
    const operatingCashflows = rows.slice(1).map((row) => Number(row.energyValueEur) - Number(row.opexEur));
    if (operatingCashflows.some((flow) => !Number.isFinite(flow))) return null;
    const projectIrrRate = irr([-investment, ...operatingCashflows]);
    const debtRows = rows.slice(1, Math.min(horizon, debtTerm) + 1)
      .filter((row) => Number(row.debtServiceEur) > 0)
      .map((row) => ({ year: Number(row.year), ratio: (Number(row.energyValueEur) - Number(row.opexEur)) / Number(row.debtServiceEur) }));
    if (debtRows.some((row) => !Number.isFinite(row.ratio))) return null;
    const minimumDscr = debt > 0 && debtRows.length
      ? debtRows.reduce((minimum, row) => row.ratio < minimum.ratio ? row : minimum)
      : null;
    return { projectIrrRate, minimumDscr: minimumDscr?.ratio ?? null, minimumDscrYear: minimumDscr?.year ?? null };
  }

  function applyProductionPreview(detail) {
    window.SOLARSHIFT_CONFIG = window.SOLARSHIFT_CONFIG || {};
    const annualKwh = Number(detail?.annualKwh);
    const usableAnnualKwh = Number.isFinite(annualKwh) && annualKwh > 0 ? Math.round(annualKwh) : null;
    productionPreviewDetail = detail?.status === 'READY' && usableAnnualKwh ? detail : null;
    installationSizing = detail?.sizing || null;
    window.SOLARSHIFT_CONFIG.commercialProductionPreview = productionPreviewDetail ? detail : null;
    const annual = $('annual');
    if (productionPreviewDetail) {
      productionPreviewKwh = usableAnnualKwh;
      productionPreviewSource = 'PVGIS';
      if (annual) annual.value = productionPreviewKwh;
      if (annual) annual.dataset.productionSource = 'PVGIS';
    } else {
      productionPreviewKwh = manualProductionFallbackKwh;
      productionPreviewSource = productionPreviewKwh ? 'MANUAL_ASSUMPTION' : 'UNKNOWN';
      if (annual) {
        annual.value = productionPreviewKwh == null ? '' : String(productionPreviewKwh);
        annual.dataset.productionSource = productionPreviewSource;
      }
    }
    const benchmarkNote = $('financeBenchmarkNote');
    if (benchmarkNote) benchmarkNote.textContent = productionPreviewSource === 'PVGIS'
      ? 'Le calcul utilise la production moyenne estimée par PVGIS, pas un P50 ou un P90. Les scénarios restent indicatifs jusqu’à validation par une étude qualifiée.'
      : 'Le calcul utilise une hypothèse annuelle de production saisie manuellement. Remplacez-la par PVGIS dès que les coordonnées et paramètres le permettent ; aucun P50/P90 n’est inventé.';
    calculate();
    if (!productionPreviewDetail) updateCapexRangeNote();
  }

  function applyManualProductionAssumption() {
    const annual = $('annual');
    manualProductionFallbackKwh = normalizeAnnualProductionKwh(annual?.value);
    productionPreviewKwh = manualProductionFallbackKwh;
    productionPreviewSource = productionPreviewKwh ? 'MANUAL_ASSUMPTION' : 'UNKNOWN';
    productionPreviewDetail = null;
    if (annual) {
      if (manualProductionFallbackKwh == null) delete annual.dataset.manualFallbackKwh;
      else annual.dataset.manualFallbackKwh = String(manualProductionFallbackKwh);
      annual.dataset.productionSource = productionPreviewSource;
    }
    window.SOLARSHIFT_CONFIG = window.SOLARSHIFT_CONFIG || {};
    window.SOLARSHIFT_CONFIG.commercialProductionPreview = null;
    calculate();
  }

  function normalizeAnnualProductionKwh(value) {
    const annualKwh = Number(value);
    return Number.isFinite(annualKwh) && annualKwh > 0 ? Math.round(annualKwh) : null;
  }

  function resetAnnualProductionForProject() {
    manualProductionFallbackKwh = null;
    productionPreviewKwh = null;
    productionPreviewDetail = null;
    installationSizing = null;
    productionPreviewSource = 'UNKNOWN';
    window.SOLARSHIFT_CONFIG = window.SOLARSHIFT_CONFIG || {};
    window.SOLARSHIFT_CONFIG.commercialProductionPreview = null;
    const annual = $('annual');
    if (annual) {
      annual.value = '';
      delete annual.dataset.manualFallbackKwh;
      annual.dataset.productionSource = 'UNKNOWN';
    }
  }

  window.OzenoAnnualProductionAssumption = Object.freeze({
    captureManualFallbackKwh: () => manualProductionFallbackKwh,
    resetForProject: resetAnnualProductionForProject,
    restoreManualFallback(value) {
      manualProductionFallbackKwh = normalizeAnnualProductionKwh(value);
      const annual = $('annual');
      if (!annual) return;
      if (manualProductionFallbackKwh == null) delete annual.dataset.manualFallbackKwh;
      else annual.dataset.manualFallbackKwh = String(manualProductionFallbackKwh);
      // A ready PVGIS result is authoritative; retain the manual value only as a
      // project-specific fallback if PVGIS later becomes unavailable.
      if (productionPreviewDetail?.status === 'READY') return;
      productionPreviewKwh = manualProductionFallbackKwh;
      productionPreviewSource = manualProductionFallbackKwh ? 'MANUAL_ASSUMPTION' : 'UNKNOWN';
      annual.value = manualProductionFallbackKwh == null ? '' : String(manualProductionFallbackKwh);
      annual.dataset.productionSource = productionPreviewSource;
    }
  });

  function calculate() {
    window.SOLARSHIFT_FINANCIAL_PREVIEW = { status: 'UNKNOWN', reason: 'RECALCULATION_PENDING' };
    if (typeof updatePreviewDecisionIndicators === 'function') updatePreviewDecisionIndicators();
    if ($('dashNetGain')) $('dashNetGain').textContent = 'À calculer';
    if ($('dashLcoe')) $('dashLcoe').textContent = 'À calculer';
    // Installation cost depends on chantier and power, never consumption or prices.
    const capexResult = updateGlobalCapex();
    updateCapexRangeNote(capexResult);
    updatePreviewFinanceMetrics(capexResult);
    const costReference = currentInstallationCostReference();
    window.SOLARSHIFT_INSTALLER_COMMISSION_PREVIEW = window.OzenoInstallerCommission?.estimate({
      installationBaseEur: capexResult?.totalCapex,
      ratePct: $('assumptionInitialProjectCommissionPct')?.value ?? 10,
      basis: $('capexReferenceMode')?.value === 'manual' ? 'MANUAL_INSTALLATION_PRICE' : 'INSTALLATION_COST_BENCHMARK',
      costModelVersion: costReference?.version ?? null
    }) ?? null;
    const invalidPrice = ['aciPrice', 'accPrice', 'irvePrice', 'gridPrice', 'contractReferencePrice'].map((id) => {
      const input = $(id);
      const raw = input?.value?.trim() ?? '';
      const invalid = input && (input.validity?.badInput || input.validity?.rangeOverflow || input.validity?.rangeUnderflow
        || (raw !== '' && (!Number.isFinite(Number(raw)) || Number(raw) < 0 || Number(raw) > 10)));
      input?.setAttribute('aria-invalid', String(Boolean(invalid)));
      return invalid ? id : null;
    }).find(Boolean);
    if (invalidPrice) {
      const message = 'Prix d’électricité à corriger : indiquez un prix en €/kWh, et non une consommation ou une production annuelle.';
      $('financingAssumptions').textContent = message;
      ['irr', 'multiple', 'payback', 'equity', 'dashIrr'].forEach((id) => { if ($(id)) $(id).textContent = 'Prix à corriger'; });
      reportFinanceSummary = { status: 'UNKNOWN', message };
      window.SOLARSHIFT_FINANCIAL_PREVIEW = { status: 'UNKNOWN', reason: 'ENERGY_PRICE_INPUT_INVALID' };
      renderFinanceImpactChart(null, Number($('term')?.value) || 25, $('financialAnalysis')?.value || 'owner', null, message);
      updateRevenueSummary(null, [], [], false, message);
      window.dispatchEvent(new CustomEvent('ozeno:local-finance', { detail: { status: 'UNKNOWN', reason: 'ENERGY_PRICE_INPUT_INVALID' } }));
      updateReportFinanceTiles();
      return;
    }
    const assumptionSnapshot = window.SolarShiftFinancialAssumptions?.getValues();
    if (!assumptionSnapshot) {
      $('financingAssumptions').textContent = 'Une hypothèse financière est invalide ou manquante : vérifiez le tableau des hypothèses avant de calculer.';
      $('irr').textContent = 'Hypothèses à corriger'; $('multiple').textContent = '—'; $('payback').textContent = '—'; $('equity').textContent = '—'; $('dashIrr').textContent = 'À corriger';
      reportFinanceSummary = { status: 'UNKNOWN', message: 'Hypothèses financières à corriger' };
      renderFinanceImpactChart(null, Number($('term')?.value) || 25, $('financialAnalysis')?.value || 'owner', null, 'Corrigez les hypothèses financières avant de recalculer les indicateurs.');
      window.dispatchEvent(new CustomEvent('ozeno:local-finance', { detail: { status: 'UNKNOWN', reason: 'FINANCIAL_ASSUMPTIONS_INVALID' } }));
      if (typeof updateDecision === 'function') updateDecision();
      if (typeof updateReport === 'function') updateReport();
      updateReportFinanceTiles();
      return;
    }
    const assumptions = assumptionSnapshot.values;
    const horizon = +$('term').value;
    const mode = $('financialAnalysis')?.value || 'owner';
    const capex = capexResult?.ready ? capexResult.totalCapex : null;
    const production = productionPreviewKwh;
    reportFinanceSummary = { status: 'UNKNOWN', ownershipMode: mode, horizonYears: horizon, message: 'À calculer' };
    const consumptionReference = previewConsumptionReference();
    const ceiling = window.OzenoAnnualAllocation?.calculateAnnualCeiling(production, consumptionReference.valueKwh);
    const manualAllocation = Boolean($('manualEnergyAllocation')?.checked);
    ['aciShare', 'accShare', 'irveShare', 'gridShare'].forEach((id) => { if ($(id)) $(id).readOnly = !manualAllocation; });
    if (!manualAllocation && ceiling?.hasDemand) {
      $('aciShare').value = String(ceiling.aciPercent);
      $('accShare').value = String(ceiling.accPercent);
      $('irveShare').value = '0';
      $('gridShare').value = String(ceiling.surplusPercent);
    } else if (!manualAllocation && productionPreviewKwh && !ceiling?.hasDemand) {
      // Do not retain default/stale shares as if unknown consumption meant 100% surplus.
      ['aciShare', 'accShare', 'irveShare', 'gridShare'].forEach((id) => { if ($(id)) $(id).value = ''; });
    }
    const allocationStatus = $('allocationStatus');
    if (allocationStatus) allocationStatus.textContent = !ceiling
      ? 'La répartition attend une production PV calculée.'
      : ceiling.hasDemand
        ? `Solde annuel théorique : ACI plafonnée aux besoins annuels (${format(ceiling.aciCeilingKwh)} kWh/an, ${ceiling.aciPercent.toLocaleString('fr-FR')} %) ; production restante ${format(ceiling.outsideSiteKwh)} kWh/an. ${consumptionReference.status === 'ASSUMPTION' ? `Consommation issue d’un abaque SolarShift V1, non mesurée (${consumptionReference.benchmark?.areaDescription || 'hypothèse à confirmer'}). ` : ''}Ce solde n’est pas un surplus mesuré ni automatiquement revendable. ${manualAllocation ? 'Répartition manuelle : vérifiez les volumes ACC, surplus ou IRVE et les clients associés.' : `À titre d’hypothèse, le solde est affecté à l’ACC (${ceiling.accPercent.toLocaleString('fr-FR')} %), surplus à 0 % ; à confirmer avec des consommateurs ACC.`} L’ACI réelle exige un profil horaire ; la référence Enedis peut être agrégée.`
        : manualAllocation
          ? 'Consommation annuelle absente : les parts saisies restent des hypothèses à justifier.'
          : 'Consommation annuelle inconnue : les volumes ACI, ACC et surplus restent non calculés. Saisissez une consommation ou choisissez une activité et mesurez l’emprise cartographiée pour obtenir une hypothèse SolarShift V1.';
    const decisionAllocation = $('decisionEnergyAllocation');
    if (decisionAllocation) decisionAllocation.textContent = !ceiling
      ? 'Répartition en attente de la production PV.'
      : ceiling.hasDemand
        ? `Plafond annuel théorique ACI : ${format(ceiling.aciCeilingKwh)} kWh · solde annuel de production à qualifier : ${format(ceiling.outsideSiteKwh)} kWh. Ce solde ne constitue pas un volume vendu ; l’ACI réelle demande un profil horaire et l’ACC des voisins identifiés.`
        : 'Consommation du site non renseignée : ACI, ACC et surplus restent UNKNOWN ; aucune part n’est déduite.';
    // Display-rounded percentages must never drive the financial cashflows.
    const aciShare = !manualAllocation && ceiling?.hasDemand ? ceiling.aciCeilingKwh / production : +$('aciShare').value / 100;
    const accShare = !manualAllocation && ceiling?.hasDemand ? ceiling.potentialAccKwh / production : +$('accShare').value / 100;
    const irveShare = !manualAllocation && ceiling?.hasDemand ? 0 : +$('irveShare').value / 100;
    const gridShare = !manualAllocation && ceiling?.hasDemand ? 0 : +$('gridShare').value / 100;
    const shares = aciShare + accShare + irveShare + gridShare;
    const surplusMode = $('gridPriceMode')?.value === 'contract' ? 'contract' : regulatedSurplusTariff.mode;
    const aciPrice = $('aciPrice').value.trim() === '' ? NaN : Number($('aciPrice').value);
    const accPrice = $('accPrice').value.trim() === '' ? NaN : Number($('accPrice').value);
    const irvePrice = $('irvePrice').value.trim() === '' ? NaN : Number($('irvePrice').value);
    const surplusPrice = $('gridPrice').value.trim() === '' ? NaN : Number($('gridPrice').value);
    const price = aciShare * (Number.isFinite(aciPrice) ? aciPrice : 0) + accShare * (Number.isFinite(accPrice) ? accPrice : 0) + irveShare * (Number.isFinite(irvePrice) ? irvePrice : 0) + gridShare * (Number.isFinite(surplusPrice) ? surplusPrice : 0);
    const aciPricingIncomplete = aciShare > 0 && (!Number.isFinite(aciPrice) || aciPrice < 0);
    const accPricingIncomplete = accShare > 0 && (!Number.isFinite(accPrice) || accPrice < 0);
    const irvePricingIncomplete = irveShare > 0 && (!Number.isFinite(irvePrice) || irvePrice < 0);
    const surplusPricingIncomplete = gridShare > 0 && surplusMode === 'contract'
      && (!$('gridPrice').value.trim() || !Number.isFinite(Number($('gridPrice').value)) || Number($('gridPrice').value) < 0 || !$('gridPriceSource')?.value.trim());
    const otherPricingIncomplete = aciPricingIncomplete || accPricingIncomplete;
    const pricingIncompleteMessage = [
      aciPricingIncomplete ? 'Prix ACI' : null,
      accPricingIncomplete ? 'Prix ACC' : null,
      irvePricingIncomplete ? 'Prix IRVE' : null,
      surplusPricingIncomplete ? 'Tarif surplus' : null
    ].filter(Boolean).join(' et ') + ([aciPricingIncomplete, accPricingIncomplete, irvePricingIncomplete, surplusPricingIncomplete].some(Boolean) ? ' à renseigner/documenter' : '');
    const irvePriceStatus = $('irvePriceStatus');
    if (irvePriceStatus) {
      irvePriceStatus.classList.toggle('invalid', irvePricingIncomplete);
      irvePriceStatus.textContent = irvePricingIncomplete
        ? 'Prix de recharge requis pour calculer les recettes.'
        : '';
    }
    let rent = 0;
    const sharePercent = shares * 100;
    const overAllocated = sharePercent > 100.0001;
    $('shareGroup')?.classList.toggle('allocationOverLimit', overAllocated);
    ['aciShare', 'accShare', 'irveShare', 'gridShare'].forEach((id) => {
      const input = $(id);
      const volume = $(`${id}Kwh`);
      const percent = input?.value.trim() === '' ? NaN : Number(input?.value);
      if (volume) volume.textContent = (manualAllocation || ceiling?.hasDemand) && production > 0 && Number.isFinite(percent) && percent >= 0
        ? `${format(production * percent / 100)} kWh/an`
        : 'kWh/an à calculer';
    });
    const aciExceedsDemand = manualAllocation && ceiling?.hasDemand && aciShare * production > ceiling.aciCeilingKwh + 1;
    const allocationUnknown = !manualAllocation && !ceiling?.hasDemand;
    const shareInvalid = allocationUnknown || Math.abs(sharePercent - 100) > .0001 || aciExceedsDemand;
    const revenueBreakdown = updateRevenueSummary(
      production,
      [aciShare, accShare, irveShare, gridShare],
      [aciPrice, accPrice, irvePrice, surplusPrice],
      !shareInvalid && !surplusPricingIncomplete && !irvePricingIncomplete && !otherPricingIncomplete,
      allocationUnknown ? 'UNKNOWN · consommation annuelle non renseignée' : pricingIncompleteMessage
    );
    const rentRateInput = $('rentRate');
    const rentRateValue = rentRateInput?.value.trim() === '' ? NaN : Number(rentRateInput?.value);
    const rentRateValid = Number.isFinite(rentRateValue) && rentRateValue >= 0 && rentRateValue <= 100;
    const rentBaseReady = Number.isFinite(revenueBreakdown?.total) && revenueBreakdown.total >= 0;
    const rentEnabled = $('rentOn').checked;
    rent = rentEnabled && rentRateValid && rentBaseReady
      ? Math.round(revenueBreakdown.total * rentRateValue / 100)
      : 0;
    $('annualRent').value = rentEnabled && rentRateValid && rentBaseReady ? String(rent) : '';
    const usableAreaText = $('terrainUsable')?.textContent || '';
    const usableAreaMatch = usableAreaText.match(/[\d\s\u202f,.]+/);
    const usableArea = usableAreaMatch ? Number(usableAreaMatch[0].replace(/[\s\u202f]/g, '').replace(',', '.')) : NaN;
    const rentSummary = $('rentMetricsSummary');
    if (rentSummary) {
      const rentRate = rentRateValid ? rentRateValue : NaN;
      const rentPerM2 = rentEnabled && rentRateValid && rentBaseReady && Number.isFinite(usableArea) && usableArea > 0 ? rent / usableArea : NaN;
      $('rentPerM2').value = Number.isFinite(rentPerM2) ? rentPerM2.toFixed(2) : '';
      const configuredRentRate = rentRateInput?.value.trim() !== '';
      rentSummary.textContent = !rentEnabled
        ? 'Cochez « Projet avec loyer » pour saisir un taux et afficher le loyer annuel ainsi que le montant par m² exploitable.'
        : !configuredRentRate
          ? 'Renseignez le taux de loyer. Le montant annuel sera calculé sur la valeur annuelle estimée de la production.'
          : !rentRateValid
            ? 'Le taux de loyer doit être compris entre 0 et 100 %.'
          : !rentBaseReady
            ? 'Le loyer sera calculé dès que la production, sa répartition et les prix de valorisation seront disponibles.'
            : `Année 1 : ${rentRate.toFixed(1).replace('.', ',')} % de ${format(revenueBreakdown.total)} € de valeur annuelle produite = ${format(rent)} € de loyer · ${Number.isFinite(rentPerM2) ? `${rentPerM2.toFixed(2).replace('.', ',')} €/m²/an` : 'surface exploitable à renseigner'}.`;
    }
    const shareStatus = $('mixValidation');
    if (shareStatus) {
      shareStatus.textContent = allocationUnknown
        ? 'Répartition UNKNOWN : renseignez la consommation annuelle ou activez une répartition manuelle hypothétique.'
        : overAllocated
        ? `Alerte : la somme des parts atteint ${sharePercent.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %, soit plus de 100 %. Réduisez une ou plusieurs parts.`
        : aciExceedsDemand
        ? 'La part ACI dépasse la consommation annuelle du site : l’installation semble surdimensionnée au regard des besoins. Réduisez la part ACI ou confirmez les besoins avant de poursuivre.'
        : `Répartition utilisée : ${sharePercent.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % sur 100 %${shareInvalid ? ' — ajustez les quatre parts pour obtenir 100 %.' : ''}`;
      shareStatus.className = `mixValidation ${shareInvalid ? 'invalid' : 'valid'}`;
    }
    ['aciShare', 'accShare', 'irveShare', 'gridShare'].forEach((id) => {
      $(id).setCustomValidity(aciExceedsDemand ? 'L’ACI ne peut pas dépasser la consommation annuelle du site.' : allocationUnknown ? 'La répartition est inconnue sans consommation ou hypothèse manuelle.' : shareInvalid ? 'La somme ACI + ACC + IRVE + surplus doit être égale à 100 %.' : '');
      $(id).setAttribute('aria-invalid', shareInvalid ? 'true' : 'false');
    });
    const rentField = $('annualRent')?.closest('label');
    if (rentField) rentField.hidden = !rentEnabled;
    const rentRateField = rentRateInput?.closest('label');
    if (rentRateField) rentRateField.hidden = !rentEnabled;
    const rentAreaField = $('rentPerM2')?.closest('label');
    if (rentAreaField) rentAreaField.hidden = !rentEnabled;
    if (rentRateInput) rentRateInput.disabled = !rentEnabled;
    $('mixInfo').textContent = allocationUnknown
      ? 'Répartition non calculée : la consommation et les parts d’énergie restent UNKNOWN. Les hypothèses de prix ne produisent pas de recettes sans allocation explicite.'
      : `${mode === 'owner' ? 'Valeur moyenne pondérée' : 'Prix moyen pondéré'} année 1 : ${price.toFixed(3).replace('.', ',')} €/kWh · ACI ${(aciShare * 100).toFixed(0)} % · ACC ${(accShare * 100).toFixed(0)} % · IRVE ${(irveShare * 100).toFixed(0)} % · surplus ${(gridShare * 100).toFixed(0)} %${rent ? ` · loyer indexé : ${format(rent)} €/an` : ' · sans loyer'}.`;
    const debtShare = Math.min(100, Math.max(0, +$('debtShare').value)) / 100;
    const debtRate = Math.max(0, +$('debtRate').value) / 100;
    const debtTerm = Math.max(1, +$('debtTerm').value);
    $('termout').textContent = `${horizon} ans`;
    const multipleHorizon = $('multipleHorizon');
    if (multipleHorizon) multipleHorizon.textContent = `${horizon} ${horizon === 1 ? 'an' : 'ans'}`;
    const financingMode = document.querySelector('input[name="financingMode"]:checked')?.value || (debtShare > 0 ? 'mixed' : 'equity');
    const debtSummary = financingMode === 'mixed'
      ? `dette ${(debtShare * 100).toFixed(0)} % à ${(debtRate * 100).toFixed(1).replace('.', ',')} % sur ${debtTerm} ans`
      : '100 % fonds propres';
    const pct = (value) => `${(value * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
    const managementSummary = mode === 'investor' ? `frais de gestion annuels ${pct(assumptions.investorManagementFeeRate)} des revenus bruts d’exploitation` : 'aucuns frais de gestion annuels en mode propriétaire exploitant';
    $('financingAssumptions').textContent = `Référentiel ${assumptionSnapshot.modelVersion} · dégradation ${pct(assumptions.productionDegradationRate)}/an · ACI/ACC/IRVE +${pct(assumptions.energyPriceEscalationRate)}/an · surplus +${pct(surplusMode === regulatedSurplusTariff.mode ? assumptions.s21SurplusEscalationRate : assumptions.contractSurplusEscalationRate)}/an (${surplusMode === regulatedSurplusTariff.mode ? 'hypothèse S21' : 'hypothèse contractuelle'}) · commission ${pct(assumptions.initialProjectCommissionRate)} facturée à l’installateur, non ajoutée au CAPEX client · ${debtSummary} · maintenance ${pct(assumptions.maintenanceCapexRate)}/an + assurance ${pct(assumptions.insuranceCapexRate)}/an, calculées sur le CAPEX client · ${managementSummary} · loyer indexé à ${pct(assumptions.rentEscalationRate)}/an · ACI valorisée comme facture évitée pour le propriétaire exploitant, comme vente pour un tiers investisseur · calcul du TRI avant impôts, sans IS/IR.`;
    const source = $('financeProductionSource');
    if (source) source.textContent = productionPreviewKwh && capex > 0
      ? `Production utilisée : ${format(productionPreviewKwh)} kWh/an · ${productionPreviewSource === 'PVGIS' ? 'estimation PVGIS selon la toiture' : 'hypothèse commerciale saisie, à confirmer'}. CAPEX global estimé : ${format(capex)} €${Number($('irveCapex')?.value) > 0 ? ` dont ${format(Number($('irveCapex').value))} € d’IRVE` : ''}. Le coût IRVE reste une hypothèse jusqu’au devis validé. Aperçu non canonique.`
      : !productionPreviewKwh
        ? 'Production inconnue : calculez PVGIS ou saisissez une hypothèse annuelle provisoire pour obtenir un aperçu financier. Elle restera à confirmer.'
        : Number($('irveChargerCount')?.value) > 0 && !Number($('irveInstalledCostPerKw')?.value)
          ? 'CAPEX global incomplet : renseignez le coût installé des bornes IRVE à partir d’un devis.'
          : 'CAPEX en attente : renseignez le coût indicatif au kWc dans les hypothèses financières.';
    if (!productionPreviewKwh || !(capex > 0)) {
      const irveCostMissing = Number($('irveChargerCount')?.value) > 0 && !Number($('irveInstalledCostPerKw')?.value);
      reportFinanceSummary.message = !productionPreviewKwh ? 'Production à calculer' : irveCostMissing ? 'Devis IRVE à renseigner' : 'CAPEX à calculer';
      renderFinanceImpactChart(null, horizon, mode, null, `${reportFinanceSummary.message} : le graphique financier reste indisponible.`);
      $('irr').textContent = 'UNKNOWN'; $('multiple').textContent = 'UNKNOWN'; $('payback').textContent = 'UNKNOWN'; $('equity').textContent = 'UNKNOWN'; $('dashIrr').textContent = 'UNKNOWN';
      window.dispatchEvent(new CustomEvent('ozeno:local-finance', { detail: { status: 'UNKNOWN', reason: !productionPreviewKwh ? 'PRODUCTION_PREVIEW_UNAVAILABLE' : irveCostMissing ? 'IRVE_CAPEX_UNPRICED' : 'CAPEX_UNAVAILABLE' } }));
      if (typeof updateDecision === 'function') updateDecision();
      if (typeof updateReport === 'function') updateReport();
      updateReportFinanceTiles();
      return;
    }
    if (allocationUnknown) {
      reportFinanceSummary.message = 'UNKNOWN · consommation annuelle non renseignée';
      renderFinanceImpactChart(null, horizon, mode, null, 'La consommation annuelle est inconnue : la répartition énergétique et les indicateurs financiers qui en dépendent ne sont pas calculés.');
      $('irr').textContent = 'UNKNOWN';
      $('multiple').textContent = 'UNKNOWN';
      $('payback').textContent = 'UNKNOWN';
      $('dashIrr').textContent = 'UNKNOWN';
      window.dispatchEvent(new CustomEvent('ozeno:local-finance', { detail: { status: 'UNKNOWN', reason: 'ANNUAL_ALLOCATION_UNKNOWN' } }));
      if (typeof updateDecision === 'function') updateDecision();
      if (typeof updateReport === 'function') updateReport();
      updateReportFinanceTiles();
      return;
    }
    if (shareInvalid) {
      reportFinanceSummary.message = 'Répartition à corriger';
      renderFinanceImpactChart(null, horizon, mode, null, 'Corrigez la répartition énergétique à 100 % avant de calculer les flux financiers.');
      $('irr').textContent = 'Répartition à corriger';
      $('multiple').textContent = '—';
      $('payback').textContent = '—';
      $('dashIrr').textContent = 'UNKNOWN';
      window.dispatchEvent(new CustomEvent('ozeno:local-finance', { detail: { status: 'UNKNOWN', reason: aciExceedsDemand ? 'ACI_EXCEEDS_ANNUAL_DEMAND' : 'ENERGY_SHARES_NOT_100_PERCENT' } }));
      if (typeof updateDecision === 'function') updateDecision();
      if (typeof updateReport === 'function') updateReport();
      updateReportFinanceTiles();
      return;
    }
    if (surplusPricingIncomplete || irvePricingIncomplete || otherPricingIncomplete) {
      reportFinanceSummary.message = pricingIncompleteMessage;
      renderFinanceImpactChart(null, horizon, mode, null, `${pricingIncompleteMessage} : les flux financiers restent indisponibles.`);
      $('irr').textContent = 'Prix à documenter';
      $('multiple').textContent = '—';
      $('payback').textContent = '—';
      $('dashIrr').textContent = 'À documenter';
      const pricingReason = irvePricingIncomplete && surplusPricingIncomplete ? 'IRVE_AND_SURPLUS_PRICE_MISSING' : irvePricingIncomplete ? 'IRVE_PRICE_MISSING' : surplusPricingIncomplete ? 'SURPLUS_PRICE_SOURCE_MISSING' : 'ENERGY_PRICE_MISSING';
      window.dispatchEvent(new CustomEvent('ozeno:local-finance', { detail: { status: 'UNKNOWN', reason: pricingReason } }));
      if (typeof updateDecision === 'function') updateDecision();
      if (typeof updateReport === 'function') updateReport();
      updateReportFinanceTiles();
      return;
    }
    const effectiveDebtShare = financingMode === 'mixed' ? debtShare : 0;
    const scheduleInput = {
      horizonYears: horizon,
      capexEur: capex,
      initialCommissionBaseEur: capex,
      productionKwh: production,
      debtShare: effectiveDebtShare,
      debtRate,
      debtTermYears: debtTerm,
      ownershipMode: mode,
      annualRentEur: rent,
      surplusMode,
      financialAssumptions: assumptions,
      energyMix: { aci: aciShare, acc: accShare, irve: irveShare, surplus: gridShare },
      pricesEurPerKwh: {
        aci: Number.isFinite(aciPrice) ? aciPrice : 0,
        acc: Number.isFinite(accPrice) ? accPrice : 0,
        irve: Number.isFinite(irvePrice) ? irvePrice : 0,
        surplus: Number.isFinite(surplusPrice) ? surplusPrice : 0
      }
    };
    const schedule = window.SolarShiftEquityCashflow?.buildEquityCashflowSchedule(scheduleInput);
    if (!schedule) {
      reportFinanceSummary = { status: 'UNKNOWN', message: 'Flux financiers indisponibles' };
      window.SOLARSHIFT_FINANCIAL_PREVIEW = { status: 'UNKNOWN', reason: 'FINANCIAL_SCHEDULE_INVALID' };
      window.dispatchEvent(new CustomEvent('ozeno:local-finance', { detail: { status: 'UNKNOWN', reason: 'FINANCIAL_SCHEDULE_INVALID' } }));
      renderFinanceImpactChart(null, horizon, mode, null, 'Le tableau financier reste indisponible tant que les hypothèses ne sont pas cohérentes.');
      $('irr').textContent = 'UNKNOWN'; $('multiple').textContent = 'UNKNOWN'; $('payback').textContent = 'UNKNOWN'; $('equity').textContent = 'UNKNOWN'; $('dashIrr').textContent = 'UNKNOWN';
      return;
    }
    const { debtEur: debt, equityEur: equity, rows: annualRows } = schedule;
    const flows = schedule.cashflowsEur;
    const gainSchedule = window.SolarShiftEquityCashflow?.buildEquityCashflowSchedule({ ...scheduleInput, horizonYears: 25 });
    const netGain25Eur = gainSchedule?.cashflowsEur.reduce((sum, flow) => sum + flow, 0) ?? null;
    const lcoeSchedule = schedule;
    const discountRate = assumptions.discountRate;
    const lcoe = window.SolarShiftEquityCashflow?.calculateLifecycleLcoe({ capexEur: capex, rows: lcoeSchedule?.rows });
    const lcoeNode = $('dashLcoe');
    if (lcoeNode) lcoeNode.textContent = lcoe ? `${lcoe.lcoeEurPerKwh.toFixed(3).replace('.', ',')} €/kWh` : 'Taux à renseigner';
    const lcoeLabel = $('dashLcoe')?.previousElementSibling;
    if (lcoeLabel) lcoeLabel.textContent = `Prix de revient du kWh solaire · ${horizon} ans`;
    const gainNode = $('dashNetGain');
    if (gainNode) gainNode.textContent = Number.isFinite(netGain25Eur) ? `${format(netGain25Eur)} €` : 'À calculer';
    const annualRevenue = annualRows.slice(1).map(row => row.energyValueEur);
    const annualEbitda = annualRows.slice(1).map(row => row.energyValueEur - row.opexEur);
    const returnMetrics = calculatePreviewReturnMetrics(schedule, horizon, debtTerm);
    const projectRate = returnMetrics?.projectIrrRate ?? null;
    const dscrMetrics = returnMetrics && debt > 0 ? returnMetrics : null;
    const totalGrossRevenueEur = annualRevenue.reduce((sum, value) => sum + value, 0);
    reportFinanceSummary = { status: 'READY', ownershipMode: mode, horizonYears: horizon, totalEnergyValueEur: totalGrossRevenueEur, totalGrossRevenueEur };
    const rate = irr(flows);
    let cumulative = 0, payback = 'Non atteint';
    flows.forEach((flow, year) => { cumulative += flow; if (year && payback === 'Non atteint' && cumulative >= 0) payback = `${year} ans`; });
    window.SOLARSHIFT_FINANCIAL_PREVIEW = { status: 'READY', annualRows, netGain25Eur, lcoeEurPerKwh: lcoe?.lcoeEurPerKwh ?? null, lcoeMethod: 'UNDISCOUNTED_LIFECYCLE_COST_PER_TOTAL_PRODUCTION', discountRatePct: Number.isFinite(discountRate) ? discountRate * 100 : null, assumptions: { modelVersion: assumptionSnapshot.modelVersion, values: assumptions }, basis: 'EQUITY_PRE_TAX_DEBT_INCLUDED', projectIrrPct: projectRate == null ? null : projectRate * 100, projectIrrBasis: 'PROJECT_OPERATING_CASHFLOW_BEFORE_FINANCING_AND_TAX', minimumDscr: dscrMetrics?.minimumDscr ?? null, minimumDscrYear: dscrMetrics?.minimumDscrYear ?? null, dscrBasis: debt > 0 ? 'MINIMUM_ANNUAL_CFADS_BEFORE_TAX_OVER_INTEREST_AND_PRINCIPAL_DURING_DEBT_TERM' : 'NOT_APPLICABLE_NO_DEBT', capexEur: capex, installationCapexEur: capex, totalCapexEur: schedule.totalInitialInvestmentEur, initialProjectCommissionEur: schedule.initialProjectCommissionEur, installerCommissionEur: schedule.installerCommissionEur, totalInitialInvestmentEur: schedule.totalInitialInvestmentEur, equityEur: equity, debtEur: debt };
    renderFinanceImpactChart(flows, horizon, mode, payback);
    $('irr').textContent = rate == null ? 'Non calculable' : `${(rate * 100).toFixed(1).replace('.', ',')} %`;
    $('multiple').textContent = equity ? `${(flows.slice(1).reduce((sum, flow) => sum + flow, 0) / equity).toFixed(2).replace('.', ',')}x` : '—';
    $('payback').textContent = payback;
    $('equity').textContent = `${format(equity)} €`;
    $('dashIrr').textContent = $('irr').textContent;
    const irrHorizon = $('dashIrr')?.nextElementSibling;
    if (irrHorizon) irrHorizon.textContent = `Sur ${horizon} ans`;
    window.dispatchEvent(new CustomEvent('ozeno:local-finance', { detail: {
      horizonYears: horizon,
      averageRevenueEur: annualRevenue.reduce((sum, value) => sum + value, 0) / Math.max(1, horizon),
      totalGrossRevenueEur,
      totalEnergyValueEur: totalGrossRevenueEur,
      ownershipMode: mode,
      yearOneGrossRevenueEur: revenueBreakdown.total,
      yearOneGrossRevenueByUseEur: revenueBreakdown.byUse,
      yearOneEnergyValueEur: revenueBreakdown.total,
      yearOneEnergyValueByUseEur: revenueBreakdown.byUse,
      averageEbitdaEur: annualEbitda.reduce((sum, value) => sum + value, 0) / Math.max(1, horizon),
      installationCapexEur: capex,
      totalCapexEur: schedule.totalInitialInvestmentEur,
      initialProjectCommissionEur: schedule.initialProjectCommissionEur,
      installerCommissionEur: schedule.installerCommissionEur,
      totalInitialInvestmentEur: schedule.totalInitialInvestmentEur,
      equityEur: equity,
      debtEur: debt,
      irrPct: rate == null ? null : rate * 100,
      paybackYears: payback,
      netTotalEur: flows.reduce((sum, value) => sum + value, 0),
      netGain25Eur,
      lcoeEurPerKwh: lcoe?.lcoeEurPerKwh ?? null,
      discountRatePct: Number.isFinite(discountRate) ? discountRate * 100 : null
    } }));
    if (typeof updateDecision === 'function') updateDecision();
    if (typeof updateReport === 'function') updateReport();
    updateReportFinanceTiles();
  }

  function installRevenueSummary() {
    const decision = document.querySelector('.decision');
    const decisionGrid = decision?.querySelector('.decisionGrid');
    const decisionMore = decision?.querySelector('.decisionMore');
    if (decisionMore && !$('dashNetGain')) {
      const gainTile = document.createElement('div');
      gainTile.innerHTML = '<small>Gain cumulé net estimé · 25 ans</small><b id="dashNetGain">À calculer</b><em hidden></em>';
      gainTile.querySelector('small').append(createFinanceHelp(
        'dashNetGainHelp',
        'Détail du gain cumulé net estimé',
        'Flux nets des fonds propres sur 25 ans : économies et recettes, moins investissement initial client, OPEX et service de la dette, le cas échéant. Le calcul actuel comprend maintenance, assurance, frais de gestion investisseur le cas échéant et loyer saisi. Le coût d’accès au réseau et le remplacement des onduleurs ne sont pas inclus à ce stade.'
      ));
      decisionMore.prepend(gainTile);
      const lcoeTile = document.createElement('div');
      lcoeTile.innerHTML = '<small>Prix de revient du kWh solaire</small><b id="dashLcoe">À calculer</b><em hidden></em>';
      decisionMore.insertBefore(lcoeTile, gainTile.nextSibling);
      const performance = $('dashPerformance')?.closest('.decisionMore > div');
      if (performance) { performance.hidden = true; performance.querySelector('small').textContent = 'Rendement PVGIS'; }
    }
    if (decisionGrid && !document.getElementById('decisionRevenue')) {
      const summary = document.createElement('section');
      summary.className = 'decisionRevenue';
      summary.id = 'decisionRevenue';
      summary.setAttribute('aria-label', 'Économies et recettes brutes estimées par répartition énergétique');
      summary.innerHTML = '<div class="decisionRevenueHeading"><b id="decisionRevenueTitle">Recettes estimées · année 1</b><small id="decisionRevenueDescription">Production PVGIS · ventes d’énergie brutes, hors charges. Aucune recette forfaitaire ajoutée.</small></div><p id="decisionEnergyAllocation" class="decisionEnergyAllocation">Répartition en attente de la production PV.</p><div class="decisionRevenueGrid"><div title="Autoconsommation individuelle"><small id="dashAciValuationLabel">Recette ACI</small><b id="dashRevenueAci">À calculer</b><small id="dashPriceAci">Prix : à renseigner</small></div><div title="Autoconsommation collective"><small>Recette ACC</small><b id="dashRevenueAcc">À calculer</b><small id="dashPriceAcc">Prix : à renseigner</small></div><div title="Recharge des véhicules électriques"><small>Recette IRVE</small><b id="dashRevenueIrve">À calculer</b><small id="dashPriceIrve">Prix : à renseigner</small></div><div title="Vente du surplus au réseau"><small>Recette surplus</small><b id="dashRevenueSurplus">À calculer</b><small id="dashPriceSurplus">Prix : à renseigner</small></div><div class="decisionRevenueTotal" title="Valeur totale des économies ACI et recettes d’énergie"><small id="dashRevenueTotalLabel">Total recettes</small><b id="dashRevenueTotal">À calculer</b><small id="dashRevenueAveragePrice">Valeur moyenne : à calculer</small></div></div><div class="decisionRevenueVisual" hidden><b class="revenueChartTitle" id="revenueChartTitle">Répartition des recettes</b><div class="revenueDonut" role="img" aria-label="Répartition des recettes estimées"><span>€/an</span></div><div class="revenueLegend" aria-label="Répartition de la valeur énergétique"><div role="group" aria-label="Autoconsommation individuelle"><i class="revenueAci"></i><span id="dashRevenueAciLegend">ACI</span><small>Autoconsommation individuelle</small><b id="dashRevenueAciShare">—</b></div><div role="group" aria-label="Autoconsommation collective"><i class="revenueAcc"></i><span>ACC</span><small>Autoconsommation collective</small><b id="dashRevenueAccShare">—</b></div><div role="group" aria-label="Recharge des véhicules électriques"><i class="revenueIrve"></i><span>IRVE</span><small>Recharge des véhicules</small><b id="dashRevenueIrveShare">—</b></div><div role="group" aria-label="Vente du surplus au réseau"><i class="revenueSurplus"></i><span>Surplus</span><small>Vente du surplus</small><b id="dashRevenueSurplusShare">—</b></div></div></div>';
      decisionGrid.insertAdjacentElement('afterend', summary);
    }
    const reportGrid = document.querySelector('.reportPreview .reportGrid');
    if (reportGrid && !document.getElementById('reportRevenue')) {
      const tile = document.createElement('div');
      tile.innerHTML = '<small id="reportRevenueLabel">Ventes d’électricité estimées · année 1</small><b id="reportRevenue">À calculer</b>';
      const anchor = document.getElementById('reportMix')?.closest('div');
      if (anchor) anchor.insertAdjacentElement('afterend', tile); else reportGrid.appendChild(tile);
    }
    const revenueSummary = document.getElementById('decisionRevenue');
    if (revenueSummary && !document.getElementById('decisionFinanceMetrics')) {
      const metrics = document.createElement('section');
      metrics.className = 'decisionFinanceMetrics';
      metrics.id = 'decisionFinanceMetrics';
      metrics.setAttribute('aria-label', 'Indicateurs financiers estimatifs selon la propriété de l’installation');
      metrics.innerHTML = '<b id="decisionFinanceMetricsTitle">Montage financier estimatif</b><div class="decisionFinanceMetricGrid"><div><small>CAPEX global estimé</small><strong id="decisionFinanceCapex">À calculer</strong></div><div><small id="decisionFinanceEquityLabel">Fonds propres</small><strong id="decisionFinanceEquity">À calculer</strong></div><div><small>Dette estimée</small><strong id="decisionFinanceDebt">À calculer</strong></div><div><small id="decisionFinanceIrrLabel">TRI fonds propres avant impôts</small><strong id="decisionFinanceIrr">À calculer</strong></div><div><small>Délai de retour estimé</small><strong id="decisionFinancePayback">À calculer</strong></div></div><section id="decisionCashflowPanel" class="decisionCashflow" aria-label="Interprétation graphique des flux financiers"><div class="decisionCashflowHeading"><b id="decisionCashflowTitle">Trésorerie cumulée estimée</b><small>Flux des fonds propres non actualisés · production PVGIS</small></div><div class="decisionCashflowLegend" aria-label="Légende du graphique"><span><i class="cashflowKeyLine"></i>Cumul estimé</span><span><i class="cashflowKeyZero"></i>Seuil de retour · 0 €</span></div><div id="decisionCashflowChart" class="decisionCashflowChart" hidden></div><p id="decisionCashflowInterpretation" class="decisionCashflowInterpretation">Complétez les données financières pour afficher la trésorerie cumulée.</p><small class="decisionCashflowNote">TRI des fonds propres avant impôts : apport initial (CAPEX client − dette tirée), puis flux après frais de gestion, autres OPEX et service de la dette. Aucun impôt IS/IR n’est inclus. Ce scénario n’intègre ni aides ni valeur résiduelle ; il ne remplace pas une offre bancaire ou un avis fiscal/comptable.</small></section><small class="decisionFinanceCaveat">Aperçu indicatif : CAPEX et financement à confirmer par devis et offre bancaire.</small>';
      const chartLegend = metrics.querySelector('.decisionCashflowLegend');
      if (chartLegend) chartLegend.innerHTML = '<span><i class="cashflowKeyNegative"></i>Cumul négatif</span><span><i class="cashflowKeyPositive"></i>Cumul positif</span><span><i class="cashflowKeyZero"></i>Repère zéro</span>';
      revenueSummary.querySelector('.decisionRevenueGrid')?.insertAdjacentElement('afterend', metrics);
    }
    if (reportGrid && !document.getElementById('reportBenchmark')) {
      const tile = document.createElement('div');
      tile.innerHTML = '<small>Base de production · PVGIS moyen</small><b id="reportBenchmark">À calculer</b>';
      reportGrid.appendChild(tile);
    }
  }

  function updateRevenueSummary(production, shares, prices, sharesValid, notReadyMessage = null) {
    const ownerMode = $('financialAnalysis')?.value === 'owner';
    const ids = ['dashRevenueAci', 'dashRevenueAcc', 'dashRevenueIrve', 'dashRevenueSurplus'];
    const sharesTotal = shares.reduce((sum, value) => sum + value, 0);
    const inputsValid = prices.every((value, index) => shares[index] === 0 || (Number.isFinite(value) && value >= 0));
    const ready = production > 0 && sharesValid && Math.abs(sharesTotal - 1) <= .000001 && inputsValid;
    const amounts = ready ? shares.map((share, index) => production * share * (Number.isFinite(prices[index]) ? prices[index] : 0)) : [null, null, null, null];
    const total = ready ? amounts.reduce((sum, value) => sum + value, 0) : null;
    const financialPreview = window.SOLARSHIFT_FINANCIAL_PREVIEW || {};
    window.SOLARSHIFT_FINANCIAL_PREVIEW = {
      ...financialPreview,
      revenueStatus: ready ? 'READY' : 'UNKNOWN',
      yearOneRevenueByUseEur: ready ? { aci: amounts[0], acc: amounts[1], irve: amounts[2], surplus: amounts[3] } : null,
      yearOneRevenueTotalEur: ready ? total : null
    };
    const fallback = notReadyMessage || (production > 0 && (!sharesValid || Math.abs(sharesTotal - 1) > .000001)
      ? 'Répartition à corriger'
      : 'À calculer');
    ids.forEach((id, index) => {
      const node = $(id);
      if (node) node.textContent = ready ? `${format(amounts[index])} €/an` : fallback;
      const priceNode = $(['dashPriceAci', 'dashPriceAcc', 'dashPriceIrve', 'dashPriceSurplus'][index]);
      if (priceNode) priceNode.textContent = Number.isFinite(prices[index]) && prices[index] >= 0
        ? index === 0 && ownerMode
          ? `Facture évitée valorisée à ${prices[index].toFixed(3).replace('.', ',')} €/kWh`
          : `${prices[index].toFixed(3).replace('.', ',')} €/kWh`
        : 'Prix : à renseigner';
    });
    const totalNode = $('dashRevenueTotal');
    if (totalNode) totalNode.textContent = ready ? `${format(total)} €/an` : fallback;
    const averagePriceNode = $('dashRevenueAveragePrice');
    if (averagePriceNode) averagePriceNode.textContent = ready
      ? `Valeur moyenne pondérée : ${(total / production).toFixed(3).replace('.', ',')} €/kWh`
      : 'Valeur moyenne : à calculer';
    const setText = (id, value) => { const node = $(id); if (node) node.textContent = value; };
    setText('decisionRevenueTitle', `${ownerMode ? 'Économies et recettes' : 'Recettes'} estimées · année 1`);
    setText('decisionRevenueDescription', ownerMode
      ? 'Production PVGIS · ACI = achat d’électricité évité ; ACC, IRVE et surplus = recettes brutes, hors charges. Estimation indicative.'
      : 'Production PVGIS · ventes d’énergie brutes, hors charges. Aucune recette forfaitaire ajoutée.');
    setText('dashAciValuationLabel', ownerMode ? 'Économie ACI' : 'Recette ACI');
    setText('dashRevenueTotalLabel', ownerMode ? 'Économies + recettes' : 'Total recettes');
    setText('dashRevenueAciLegend', ownerMode ? 'Économie ACI' : 'ACI');
    setText('revenueChartTitle', ownerMode ? 'Répartition des économies et recettes' : 'Répartition des recettes');
    const summary = $('decisionRevenue');
    if (summary) summary.setAttribute('aria-label', ownerMode
      ? 'Économies et recettes brutes estimées par répartition énergétique'
      : 'Recettes brutes estimées par répartition énergétique');
    const chart = document.querySelector('.decisionRevenueVisual');
    const donut = chart?.querySelector('.revenueDonut');
    if (chart && donut) {
      chart.hidden = !ready || !(total > 0);
      if (ready && total > 0) {
        const percentages = amounts.map((amount) => amount / total * 100);
        const colors = ['#f2bb35', '#49b887', '#bc78e0', '#63a9d1'];
        let start = 0;
        const stops = percentages.map((percentage, index) => {
          const end = start + percentage * 3.6;
          const stop = `${colors[index]} ${start}deg ${end}deg`;
          start = end;
          return stop;
        });
        donut.style.background = `conic-gradient(${stops.join(',')})`;
        donut.setAttribute('aria-label', `${ownerMode ? 'Répartition des économies et recettes' : 'Répartition des recettes'} : ACI ${percentages[0].toFixed(1)} %, ACC ${percentages[1].toFixed(1)} %, IRVE ${percentages[2].toFixed(1)} %, surplus ${percentages[3].toFixed(1)} %`);
        ['dashRevenueAciShare', 'dashRevenueAccShare', 'dashRevenueIrveShare', 'dashRevenueSurplusShare'].forEach((id, index) => {
          const shareNode = $(id);
          if (shareNode) shareNode.textContent = `${percentages[index].toFixed(1).replace('.', ',')} %`;
        });
      }
    }
    const reportNode = $('reportRevenue');
    setText('reportRevenueLabel', `${ownerMode ? 'Économies + recettes estimées' : 'Ventes d’électricité estimées'} · année 1`);
    if (reportNode) reportNode.textContent = ready
      ? `${ownerMode ? 'Économie ACI' : 'ACI'} ${format(amounts[0])} € · recettes ACC ${format(amounts[1])} € · IRVE ${format(amounts[2])} € · surplus ${format(amounts[3])} € · total ${format(total)} €/an`
      : fallback;
    return { status: ready ? 'READY' : 'UNKNOWN', total, byUse: ready ? { aci: amounts[0], acc: amounts[1], irve: amounts[2], surplus: amounts[3] } : null };
  }

  function boot() {
    const style = document.createElement('style');
    style.textContent = '.financeRevenueGroups{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:14px}.financeGroup{min-width:0;margin:0;padding:14px;border:1px solid #cfe0d5;border-radius:10px;background:#f8fbf9;display:grid;gap:12px}.financeGroup legend{padding:0 7px;color:#0a3f2d;font-weight:800}.financeGroup label{margin:0}.financeGroup input{margin-top:5px}.financeEnergyReference{grid-column:1/-1}.financeEnergyReference p{margin:0}.enedisConsumptionLookup{display:grid;gap:8px;padding:11px;border:1px solid #d5e4d8;border-radius:8px;background:#fff}.enedisConsumptionLookup>p{margin:0}.enedisLookupStatus{color:#315c4b}.enedisLookupResults{display:grid;gap:8px}.enedisLookupResult{display:grid;gap:6px;padding:10px;border:1px solid #d5e4d8;border-radius:7px;background:#f8fbf9}.enedisLookupResult p{margin:0;color:#587469;font-size:13px}.enedisLookupResult button{justify-self:start}.decisionRevenue{margin:0 0 12px;padding:10px 12px;border:1px solid #284b3a;border-radius:9px;background:#0c2119}.decisionRevenueHeading{display:flex;justify-content:space-between;gap:10px;align-items:baseline;margin-bottom:8px}.decisionRevenueHeading small,.decisionRevenueGrid small{display:block;color:#b9d3c2;font-size:12px}.decisionRevenueGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.decisionRevenueGrid>div{padding:8px 10px;border-radius:7px;background:#132b20}.decisionRevenueGrid b{display:block;margin-top:4px;color:#f6c443;font-size:17px}.decisionRevenueGrid .decisionRevenueTotal{border:1px solid #62805e}.financeBenchmarkNote{margin-top:-4px}.financePreviewDetails{margin:14px 0;padding:12px 14px;border:1px solid #cfe0d5;border-radius:9px;background:#f8fbf9}.financePreviewDetails summary{font-weight:700;color:#0a3f2d;cursor:pointer}.financePreviewDetails[open] summary{margin-bottom:10px}.financePreviewDetails>.fine{margin-bottom:12px}.financePreviewDetails .form{margin-top:0}.financeProductionSource{margin:12px 0;padding:10px 12px;border-radius:7px;background:#f5faf7;color:#315c4b;font-size:14px}.financeMethodNote{margin:4px 0 13px;padding:9px 11px;border-left:4px solid #c88a20;border-radius:6px;background:#fff9ed}.reportPreview:before{content:"BROUILLON · APERÇU NON CANONIQUE";display:inline-block;margin-bottom:12px;padding:5px 9px;border-radius:99px;background:#fff2c9;color:#493500;font-size:12px;font-weight:800;letter-spacing:.03em}@media(max-width:760px){.financeRevenueGroups{grid-template-columns:1fr}.decisionRevenueHeading{align-items:flex-start;flex-direction:column}.decisionRevenueGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}';
    style.textContent += '.financeEnergyReference{gap:8px;padding:10px 12px}.financeEnergyReference>p{line-height:1.4}.financeEnergyReference>p.fine{font-size:13px}.enedisConsumptionLookup{grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px 10px;padding:8px 10px}.enedisLookupPrompt{font-size:13px}.enedisLookupStatus,.enedisLookupResults,#enedisAddressConfirmation{grid-column:1/-1}.enedisLookupResult{grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:4px 12px;padding:8px 10px}.enedisResultInfo{min-width:0}.enedisResultInfo>*{margin:0}.enedisResultInfo strong{display:block;color:#315c4b}.enedisResultInfo p{margin-top:3px}.enedisLookupResult button{justify-self:end;white-space:nowrap}#enedisAddressConfirmation{margin:0;padding:0;border:0;background:transparent}#enedisAddressConfirmation p{margin:0;font-size:13px}#enedisCurrentAddress{font-weight:600}@media(max-width:700px){.enedisConsumptionLookup{grid-template-columns:1fr}.enedisLookupResult{grid-template-columns:1fr}.enedisLookupResult button{justify-self:end}}';
    style.textContent += '#investmentGroup{grid-column:1/-1}.financeInvestmentCostRow{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.financeInvestmentCostRow>label{min-width:0}.financeInvestmentCostRow .fine{display:block}.financeFundingMode{min-width:0;margin:0;padding:12px;border:1px solid #cfe0d5;border-radius:9px;background:#fff}.financeFundingMode legend{padding:0 7px;color:#0a3f2d;font-weight:800}.financeFundingOptions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.financeFundingOptions label{display:grid;grid-template-columns:18px minmax(0,1fr);align-items:center;justify-content:start;gap:8px;min-width:0;margin:0;padding:10px;border:1px solid #d5e4d8;border-radius:8px;background:#f8fbf9;font-weight:700}.financeFundingOptions input[type=radio]{display:block;width:16px;height:16px;box-sizing:border-box;padding:0;margin:0;justify-self:center}.financeFundingOptions span{min-width:0;line-height:1.25;overflow-wrap:anywhere}.financeFundingMode>p{margin:8px 0 0}.financeDebtDetails{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.financeDebtDetails[hidden]{display:none}.financeDebtDetails>label{min-width:0}.financeInvestmentCostRow input,.financeDebtDetails input{width:100%}.decisionRevenueGrid>div>small:last-child{margin-top:3px;color:#93b8a4;font-size:11px}.decisionRevenueVisual{display:flex;align-items:center;gap:15px;margin-top:10px;padding:9px 10px;border-radius:8px;background:#10271d}.revenueChartTitle{font-size:12px;color:#b9d3c2}.revenueDonut{position:relative;display:grid;flex:none;place-items:center;width:72px;height:72px;border-radius:50%;background:conic-gradient(#f2bb35 0deg,#f2bb35 120deg,#49b887 120deg,#49b887 240deg,#63a9d1 240deg,#63a9d1 360deg)}.revenueDonut:before{content:"";position:absolute;inset:11px;border-radius:50%;background:#10271d}.revenueDonut span{position:relative;color:#f6c443;font-size:11px;font-weight:700}.revenueLegend{display:grid;grid-template-columns:repeat(3,minmax(90px,1fr));gap:12px;flex:1}.revenueLegend>div{display:grid;grid-template-columns:12px 1fr;align-items:center;gap:0 6px;color:#b9d3c2;font-size:12px}.revenueLegend i{grid-row:span 2;width:10px;height:10px;border-radius:50%}.revenueLegend .revenueAci{background:#f2bb35}.revenueLegend .revenueAcc{background:#49b887}.revenueLegend .revenueSurplus{background:#63a9d1}.revenueLegend b{color:#fff;font-size:13px}.decisionRevenueVisual[hidden]{display:none}@media(max-width:760px){.financeInvestmentCostRow,.financeFundingOptions,.financeDebtDetails{grid-template-columns:1fr}.revenueLegend{grid-template-columns:1fr;gap:6px}}';
    style.textContent += '.allocationMode{display:flex;align-items:center;gap:8px;font-weight:700}.allocationMode input{width:auto;margin:0}.allocationStatus{margin:0;padding:9px 11px;border-left:3px solid #c88a20;border-radius:5px;background:#fff9ed}.financeGroup input[readonly]{background:#edf3ef;color:#315c4b}.decisionEnergyAllocation{margin:0 0 9px;color:#d6e6da;font-size:12px;line-height:1.4}';
    style.textContent += '.allocationVolume{display:block;margin-top:4px;color:#456b59;font-size:12px}.allocationOverLimit input:is(#aciShare,#accShare,#gridShare){border:2px solid #c5362e!important;box-shadow:0 0 0 2px #c5362e22}.allocationOverLimit #mixValidation{color:#a22621;font-weight:700}.financeHelp{position:relative;display:inline-block;vertical-align:middle;margin:0 0 3px 6px;font-weight:400}.financeHelpButton{display:inline-grid;place-items:center;width:20px;height:20px;padding:0;border:1px solid #87b6a0;border-radius:50%;background:#fff;color:#08734c;font:700 12px system-ui;cursor:help}.financeHelpButton:focus-visible{outline:2px solid #08734c;outline-offset:2px}.financeHelpBubble{display:none;position:absolute;top:calc(100% + 7px);right:0;z-index:1200;width:min(360px,calc(100vw - 48px));padding:10px 12px;border:1px solid #cfe0d5;border-radius:8px;background:#fff;color:#123d30;box-shadow:0 4px 18px #0002;font-size:13px;font-weight:400;line-height:1.45}.financeHelp:hover .financeHelpBubble,.financeHelp:focus-within .financeHelpBubble,.financeHelp.is-open .financeHelpBubble{display:block}@media(max-width:760px){.financeHelpBubble{width:min(280px,calc(100vw - 40px))}}.capexTypologyHelp{margin:0 0 0 6px}.capexTypologyHelp .financeHelpBubble{white-space:pre-line;width:min(440px,calc(100vw - 48px))}';
    style.textContent += '.surplusTariffReference,.surplusPriceStatus{grid-column:1/-1;margin:0;padding:9px 11px;border-radius:6px;background:#eef6f1;color:#315c4b;line-height:1.45}.surplusTariffReference a{color:#075c43;font-weight:700}.surplusPriceStatus.invalid{border-left:3px solid #bd332b;background:#fff2f0;color:#9d211b;font-weight:700}.financeGroup input[readonly]#gridPrice{background:#edf3ef;color:#315c4b}';
    style.textContent += '.decisionRevenueGrid{grid-template-columns:repeat(5,minmax(0,1fr))}.irveInvestmentInputs,.contractDiscountInputs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.financeIrveInvestment{grid-column:1/-1}.financeIrveInvestment>p{margin:0}.financeIrveInvestment input,.contractDiscountInputs input{width:100%}.financeContractPricing>p{margin:0}.revenueLegend{grid-template-columns:repeat(4,minmax(70px,1fr))}.revenueLegend .revenueIrve{background:#bc78e0}#irvePriceStatus{grid-column:1/-1;margin:0;padding:9px 11px;border-radius:6px;background:#eef6f1;color:#315c4b}.financeContractPricing #contractPricingStatus{padding:9px 11px;border-radius:6px;background:#eef6f1;color:#315c4b}#irvePriceStatus.invalid{border-left:3px solid #bd332b;background:#fff2f0;color:#9d211b;font-weight:700}@media(max-width:1050px){.decisionRevenueGrid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:760px){.decisionRevenueGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.irveInvestmentInputs,.contractDiscountInputs{grid-template-columns:1fr}.revenueLegend{grid-template-columns:repeat(2,minmax(90px,1fr))}}';
    style.textContent += '.financeRevenueGroups{grid-template-columns:minmax(0,1fr)}#priceGroup{grid-template-columns:repeat(2,minmax(0,1fr))}#contractPricingGroup{grid-column:1/-1;grid-template-columns:repeat(2,minmax(0,1fr))}#contractPricingGroup>legend,#contractPricingStatus{grid-column:1/-1}#shareGroup{grid-template-columns:minmax(0,1fr)}.allocationMode,#allocationStatus,#mixValidation,#financeChannelGrid{grid-column:1/-1}.financeChannelGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.financeChannelCard{display:grid;align-content:start;gap:10px;min-width:0;padding:12px;border:1px solid #d5e4d8;border-radius:9px;background:#fff}.financeChannelCard h4{margin:0;color:#0a3f2d;font-size:15px;line-height:1.3}.financeChannelCard label{min-width:0}.financeChannelCard label small{display:block}.financeChannelCard .allocationVolume{grid-column:1/-1}.financeChannelCard #irvePriceStatus{grid-column:1/-1}.financeChannelCard #surplusTariffReference,.financeChannelCard #surplusPriceStatus{grid-column:1/-1}.financeChannelCard .financeChannelField{display:block}.financeGroup label[hidden],#irveCustomPowerLabel[hidden]{display:none!important}#irveCustomPowerLabel{grid-column:1/-1}.financeIrveInvestment .irveInvestmentInputs{grid-template-columns:repeat(3,minmax(0,1fr))}.financeIrveInvestment .irveInvestmentInputs label{min-width:0}.financeIrveInvestment select{width:100%;margin-top:5px}.financeIrveInvestment #irvePowerKw{background:#edf3ef;color:#315c4b}.financeIrveInvestment #irveCapex{background:#edf3ef;color:#315c4b}.financeIrveInvestment #irveCapexStatus{padding:9px 11px;border-radius:6px;background:#eef6f1}.allocationOverLimit input:is(#aciShare,#accShare,#irveShare,#gridShare){border:2px solid #c5362e!important;box-shadow:0 0 0 2px #c5362e22}.financeGroup#priceGroup label{min-width:0}@media(max-width:1050px){.financeChannelGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.financeIrveInvestment .irveInvestmentInputs{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){#priceGroup,#contractPricingGroup{grid-template-columns:1fr}.financeChannelGrid{grid-template-columns:1fr}.financeIrveInvestment .irveInvestmentInputs{grid-template-columns:1fr}}';
    style.textContent += '.surplusModeField{min-width:0}.surplusModeTitle{display:flex;align-items:center;justify-content:space-between;gap:6px}.surplusModeTitle label{min-width:0}.surplusModeTitle .financeHelp{flex:0 0 auto;margin:0}.financeHelpBubble[role=dialog]{max-height:min(65vh,420px);overflow:auto}.financeChannelCard #irvePriceStatus:empty,.financeChannelCard #surplusPriceStatus:empty{display:none}';
    style.textContent += '.financeOwnershipChoice{grid-template-columns:minmax(0,1fr);margin:12px 0}.financeFundingConfiguration{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,.8fr);gap:12px;align-items:stretch}.financeHorizonControl{display:grid;grid-template-columns:minmax(0,1fr) auto;align-content:start;align-items:center;gap:8px 12px;min-width:0;margin:0;padding:12px;border:1px solid #cfe0d5;border-radius:9px;background:#fff}.financeHorizonControl .rangeout{float:none}.financeHorizonControl input[type=range]{grid-column:1/-1;width:100%;margin:0;padding:0;accent-color:#287662}@media(max-width:760px){.financeFundingConfiguration{grid-template-columns:1fr}}';
    style.textContent += '.decisionCashflow{margin-top:12px;padding:10px 12px;border:1px solid #284b3a;border-radius:8px;background:#10271d}.decisionCashflowHeading{display:flex;justify-content:space-between;align-items:baseline;gap:10px}.decisionCashflowHeading>b{color:#fff}.decisionCashflowHeading small,.decisionCashflowNote{color:#b9d3c2;font-size:11px}.decisionCashflowLegend{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:7px;color:#b9d3c2;font-size:11px}.decisionCashflowLegend span{display:flex;align-items:center;gap:6px}.decisionCashflowLegend i{display:inline-block;width:18px;height:0;border-top:3px solid #7652a5}.decisionCashflowLegend .cashflowKeyZero{border-top:2px dashed #d5a323}.decisionCashflowChart{margin-top:6px;padding:6px;border-radius:7px;background:#f8fbf9}.decisionCashflowChart[hidden]{display:none}.decisionCashflowChart svg{display:block;width:100%;height:auto}.decisionCashflowChart .cashflowGrid{stroke:#dce9e0;stroke-width:1}.decisionCashflowChart .cashflowZero{stroke:#d5a323;stroke-width:2;stroke-dasharray:7 5}.decisionCashflowChart .cashflowLine{fill:none;stroke:#7652a5;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.decisionCashflowChart .cashflowPoint{fill:#7652a5;stroke:#fff;stroke-width:2}.decisionCashflowChart text{fill:#587469;font:11px system-ui,sans-serif}.decisionCashflowInterpretation{margin:8px 0 3px;color:#fff;font-size:13px}.decisionCashflowNote{display:block;margin-top:6px}@media(max-width:760px){.decisionCashflowHeading{align-items:flex-start;flex-direction:column}}';
    style.textContent += '.financeReportActions{display:flex;align-items:center;justify-content:flex-end;gap:9px;flex-wrap:wrap}.financeReportShortcut{display:inline-flex;align-items:center;min-height:30px;padding:5px 10px;border:1px solid #9ab4a6;border-radius:7px;background:#fff;color:#075c43;font-size:12px;font-weight:700;text-decoration:none;white-space:nowrap}.financeReportShortcut:hover{background:#eef6f1;text-decoration:underline}.financeReportShortcut:focus-visible{outline:2px solid #08734c;outline-offset:2px}.reportEditor{scroll-margin-top:24px}.financeChannelCard{grid-template-columns:minmax(0,1fr);grid-template-rows:2.6em auto auto auto}.financeChannelCard>h4{grid-row:1;height:2.6em;overflow:visible}.financeChannelCard>.financeShareField{grid-row:2}.financeChannelCard>.financePriceField{grid-row:3}.financeChannelCard>.surplusModeField{grid-row:4}.financeChannelLabelText{display:block;min-height:2.7em;line-height:1.35}.financeChannelCard #irvePriceStatus{grid-row:4}@media(max-width:760px){.financeReportActions{justify-content:flex-start}.financeReportShortcut{white-space:normal}.financeChannelLabelText{min-height:0}}';
    style.textContent += '.scenarioReportLaunch{margin-top:12px;padding:18px;border:1px solid #cfe0d5;border-radius:10px;background:#f6faf7}.scenarioReportLaunch>p{max-width:900px;line-height:1.55}.scenarioReportLaunchStatus{padding:11px 13px;border-left:4px solid #c88a20;border-radius:6px;background:#fff8e8;color:#694d14}.scenarioReportAudience{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:12px 0}.scenarioReportAudience select{min-height:38px;padding:6px 9px;border:1px solid #cbdad2;border-radius:6px;background:#fff;color:#123c32;font:inherit}.scenarioReportLaunchLink{display:inline-flex;align-items:center;margin-top:0;color:#fff;text-decoration:none}.scenarioReportLaunchLink:hover{text-decoration:underline}.scenarioReportLaunch button.scenarioReportLaunchLink:disabled{opacity:.6}.enedisPublishedHistory{margin-top:8px;padding:10px 12px;border:1px solid #d5e4d8;border-radius:7px;background:#f8fbf9}.enedisPublishedHistory summary{color:#315c4b;font-weight:700;cursor:pointer}.enedisPublishedHistory[open]>summary{margin-bottom:10px}.enedisPublishedHistoryList{display:grid;grid-template-columns:1fr auto;gap:7px 18px;margin:8px 0}.enedisPublishedHistoryList dt,.enedisPublishedHistoryList dd{margin:0}.enedisPublishedHistoryList dd{font-variant-numeric:tabular-nums;text-align:right}.enedisHistoryAverage{padding-top:8px;border-top:1px solid #d5e4d8;font-weight:700}.reportEditor>[hidden]{display:none!important}@media(max-width:760px){.scenarioReportLaunch{padding:14px}.scenarioReportLaunchLink{width:100%;justify-content:center;text-align:center}.scenarioReportAudience{align-items:stretch;flex-direction:column}.scenarioReportAudience select{width:100%}}';
    style.textContent += '.financeAssumptionSettings{grid-column:1/-1}.financialAssumptionScroll{overflow-x:auto}.financialAssumptionTable{width:100%;min-width:650px;border-collapse:collapse}.financialAssumptionTable th,.financialAssumptionTable td{padding:9px 10px;border-bottom:1px solid #e3ece6;text-align:left;vertical-align:middle}.financialAssumptionTable thead th{background:#f2f7f3;color:#315c4b}.financialAssumptionTable tbody th{width:32%;font-weight:700}.financialAssumptionTable td:nth-child(2){white-space:nowrap;color:#496c5c}.financialAssumptionValue{min-width:220px}.financialAssumptionValue input{width:100%}.financialAssumptionValue small{display:block;margin-top:3px}.financialAssumptionActions{display:flex;justify-content:flex-end;margin-top:12px}@media(max-width:760px){.financialAssumptionActions button{width:100%}}';
    style.textContent += '.enedisSyntheticPicker{display:grid;gap:9px;padding:12px;border:1px solid #d5e4d8;border-radius:8px;background:#f5faf7}.enedisSyntheticPicker h3{margin:0;color:#0a3f2d;font-size:16px}.enedisSyntheticPicker>p{margin:0;line-height:1.45}.syntheticConsumptionWarning[hidden]{display:none}.syntheticConsumptionWarning.is-invalid{padding:8px 10px;border:1px solid #b42318;border-left:4px solid #b42318;border-radius:5px;background:#fff;color:#8a1c13;font-weight:700}.syntheticPickerControls{display:grid;grid-template-columns:minmax(220px,360px);align-items:end;gap:10px}.syntheticPickerControls label{display:grid;gap:4px;font-size:13px;font-weight:700}.syntheticPickerControls select{min-width:0;min-height:38px;padding:6px 9px;border:1px solid #cbdad2;border-radius:6px;background:#fff;color:#123c32;font:inherit}.syntheticPickerStatus{padding:9px 11px;border:1px solid #cbdad2;border-radius:7px;background:#fff;color:#123c32}.enedisSyntheticPicker [aria-busy=true]{opacity:.7;cursor:progress}@media(max-width:760px){.syntheticPickerControls{grid-template-columns:1fr}}';
    style.textContent += '.reportExportStatus{margin:7px 0 0}.reportActions button:disabled{opacity:.65;cursor:wait}.financeChannelCard>.financeShareField input,.financeChannelCard>.financePriceField input{margin-top:5px}.financeChannelCard>.financeShareField{min-height:0}.financeChannelCard>.financePriceField{min-height:0}.financeChannelCard>.financeShareField .allocationVolume{min-height:1.3em}';
    style.textContent += '.enedisRecentAveragePanel{display:grid;gap:7px;margin:10px 0;padding:12px 14px;border:1px solid #bcd7c8;border-left:4px solid #328064;border-radius:8px;background:#f1f8f3}.enedisRecentAveragePanel p{margin:0}.enedisRecentAverageValue{font-weight:700;color:#123c32}.enedisRecentAveragePanel .fine{font-size:13px;line-height:1.4}.enedisRecentAveragePanel button{justify-self:start;margin-top:2px}.enedisPublishedHistory{margin-top:8px}';
    style.textContent += '#validateManualConsumption[hidden]{display:none!important}.financeDiscountAssumptions{grid-column:1/-1}';
    style.textContent += '#audit-finance .metrics.financePreviewMetrics{grid-template-columns:repeat(5,minmax(0,1fr))}#audit-finance .financeMetricPercent{display:inline;color:inherit;font:inherit;white-space:nowrap}@media(max-width:1050px){#audit-finance .metrics.financePreviewMetrics{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:700px){#audit-finance .metrics.financePreviewMetrics{grid-template-columns:repeat(2,minmax(0,1fr))}}';
    style.textContent += '.prestudyBenchmarkControls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:12px;border:1px solid #d5e4d8;border-radius:9px;background:#fff}.prestudyBenchmarkControls>label{display:grid;gap:5px;font-weight:650}.prestudyBenchmarkControls select,.prestudyBenchmarkControls input{width:100%;min-width:0;min-height:38px;padding:7px 10px;border:1px solid #cbdad2;border-radius:6px;background:#fff;color:#123c32;font:inherit}.prestudyBenchmarkControls>p{grid-column:1/-1;line-height:1.45}.prestudyElectricityBenchmarks{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0;padding:10px;border:1px solid #e0e9e3;border-radius:7px;background:#f8fbf9}.prestudyElectricityBenchmarks legend{padding:0 6px;color:#315c49;font-weight:700}.prestudyElectricityBenchmarks>label{display:grid;gap:5px}.prestudyElectricityBenchmarks>p{grid-column:1/-1;margin:0;line-height:1.45}.prestudyBenchmarkControls [hidden]{display:none!important}@media(max-width:700px){.prestudyBenchmarkControls,.prestudyElectricityBenchmarks{grid-template-columns:1fr}.prestudyBenchmarkControls>p,.prestudyElectricityBenchmarks>p{grid-column:1}}';
    document.head.appendChild(style);
    organizeRevenueFields();
    const financeHint = document.querySelector('#audit-finance > .hint');
    if (financeHint) financeHint.textContent = 'La propriété de l’installation détermine le traitement de l’ACI : économie de facture pour le propriétaire exploitant, recette pour un tiers investisseur. ACC, IRVE et surplus restent des recettes. Le CAPEX global inclut le solaire et, si prévues, les bornes ; ces estimations restent provisoires avant validation des devis et pièces.';
    $('aciShare').value = '0';
    $('accShare').value = '0';
    $('gridShare').value = '100';
    const financingRadios = [...document.querySelectorAll('input[name="financingMode"]')];
    const initialFinancingMode = Number($('debtShare')?.value) > 0 ? 'mixed' : 'equity';
    financingRadios.forEach((radio) => {
      radio.checked = radio.value === initialFinancingMode;
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        applyFinancingMode(radio.value);
        calculate();
      });
    });
    applyFinancingMode(initialFinancingMode);
    installRevenueSummary();
    window.dispatchEvent(new CustomEvent('ozeno:finance-summary-ready'));
    installEnedisConsumptionLookup();
    simplifyPreviewFinance();
    installReportFinanceTiles();
    installDirectReportPdfExport();
    installProjectReportShortcut();
    const configuredPreview = window.SOLARSHIFT_CONFIG?.commercialProductionPreview;
    const annualLabel = $('annual')?.closest('label');
    if (annualLabel) annualLabel.firstChild.textContent = 'Production annuelle retenue (kWh) · PVGIS ou hypothèse provisoire';
    if ($('annual')) $('annual').placeholder = 'PVGIS ou hypothèse explicite';
    if (!configuredPreview || configuredPreview.status !== 'READY') resetAnnualProductionForProject();
    if ($('adjust')) $('adjust').value = '100';
    ['term', 'capex', 'debtShare', 'debtRate', 'debtTerm', 'discountRate', 'assumptionProductionDegradationPct', 'assumptionEnergyPriceEscalationPct', 'assumptionS21SurplusEscalationPct', 'assumptionContractSurplusEscalationPct', 'assumptionMaintenanceCapexPct', 'assumptionInsuranceCapexPct', 'assumptionInitialProjectCommissionPct', 'assumptionManagementFeePct', 'assumptionRentEscalationPct', 'aciShare', 'aciPrice', 'accShare', 'accPrice', 'irveShare', 'irvePrice', 'gridShare', 'gridPrice', 'rentOn', 'rentRate', 'annualRent', 'cons', 'irveCustomPowerKw', 'irveInstalledCostPerKw'].forEach((id) => { if ($(id)) $(id).oninput = calculate; });
    window.addEventListener('ozeno:consumption-reference', calculate);
    $('rentOn')?.addEventListener('change', () => {
      calculate();
    });
    ['irveChargerCount', 'irvePowerPerChargerKw'].forEach((id) => $(id)?.addEventListener('change', calculate));
    $('manualEnergyAllocation')?.addEventListener('change', calculate);
    $('capexPerKwp')?.addEventListener('input', () => { calculate(); window.dispatchEvent(new CustomEvent('ozeno:recalculate-roof-preview')); });
    window.sim = calculate;
    window.addEventListener('ozeno:financial-mode', calculate);
    window.addEventListener('ozeno:commercial-production-preview', (event) => applyProductionPreview(event.detail));
    $('annual')?.addEventListener('input', applyManualProductionAssumption);
    applyProductionPreview(configuredPreview || { status: 'UNKNOWN' });
    if ($('capex')) { $('capex').value = ''; $('capex').dispatchEvent(new Event('input')); }
    window.dispatchEvent(new CustomEvent('ozeno:recalculate-roof-preview'));
  }

  async function lookupAddress() {
    const { resolveEnedisAddress } = await import('./site-address.mjs');
    return resolveEnedisAddress(window.SOLARSHIFT_CONFIG || {});
  }

  function installEnedisConsumptionLookup() {
    const button = $('searchEnedisConsumption');
    const status = $('enedisLookupStatus');
    const results = $('enedisLookupResults');
    const consumption = $('cons');
    if (!button || !status || !results || !consumption || button.dataset.ready === 'true') return;
    button.dataset.ready = 'true';
    const addressDetails = document.createElement('section');
    addressDetails.id = 'enedisAddressConfirmation';
    addressDetails.innerHTML = '<p title="Cette adresse est reprise du projet et ne peut pas être modifiée depuis le module Enedis."><strong>Adresse du projet :</strong> <span id="enedisCurrentAddress"></span></p>';
    button.closest('.enedisConsumptionLookup')?.querySelector('.enedisLookupPrompt')?.insertAdjacentElement('beforebegin', addressDetails);
    if (!addressDetails.parentElement) results.insertAdjacentElement('beforebegin', addressDetails);
    const currentAddress = $('enedisCurrentAddress');
    const refreshAddressLabel = () => {
      const config = window.SOLARSHIFT_CONFIG || {};
      const reference = config.commercialAddressForLookup || config.selectedAddressCoordinates || {};
      const projectAddress = $('dashAddress')?.textContent?.trim() || (config.projectContextLoaded ? config.projectContext?.address : '') || '';
      const preciseAddress = reference.address
        ? [reference.address, reference.postalCode, reference.city].filter(Boolean).join(', ')
        : '';
      const coordinateOnly = ['MAP_CLICK', 'CONTOUR_CENTER', 'USER_PROVIDED', 'COORDINATES', 'DEVICE_POSITION'].includes(reference.precision);
      const label = preciseAddress || (coordinateOnly ? projectAddress : reference.label) || projectAddress || 'Adresse à préciser';
      if (currentAddress) currentAddress.textContent = config.addressLookupNeedsSelection ? `${label} · à confirmer` : label;
    };
    refreshAddressLabel();
    $('newProjectAddress')?.addEventListener('input', () => {
      refreshAddressLabel();
      results.replaceChildren();
    });
    const addressChanged = () => {
      refreshAddressLabel();
      results.replaceChildren();
      status.textContent = 'Adresse mise à jour. Relancez la recherche Enedis pour cette adresse.';
    };
    window.addEventListener('ozeno:project-context-loaded', () => { results.replaceChildren(); status.textContent = ''; refreshAddressLabel(); });
    window.addEventListener('ozeno:site-address-confirmed', addressChanged);
    window.addEventListener('ozeno:address-selected', addressChanged);
    button.addEventListener('click', async () => {
      let address;
      button.disabled = true;
      button.textContent = 'Préparation de la recherche…';
      button.setAttribute('aria-busy', 'true');
      status.textContent = 'Vérification de l’adresse postale du projet…';
      try { address = await lookupAddress(); }
      catch (error) {
        status.textContent = `Donnée non disponible via Enedis : la recherche n’a pas pu être préparée (${error.message || 'service indisponible'}). Vous pouvez renseigner une consommation issue d’une autre source.`;
        button.disabled = false;
        button.textContent = 'Rechercher sur Enedis';
        button.removeAttribute('aria-busy');
        return;
      }
      if (!address) {
        status.textContent = 'Donnée non disponible via Enedis : aucune référence ne peut être recherchée pour l’adresse du projet. Renseignez une consommation issue d’une autre source si elle est connue.';
        results.replaceChildren();
        button.disabled = false;
        button.textContent = 'Rechercher sur Enedis';
        button.removeAttribute('aria-busy');
        return;
      }
      button.textContent = 'Recherche en cours…';
      status.textContent = `Recherche d’une référence à ${address.city || `la commune ${address.cityCode}`}… L’adresse sera transmise à l’API publique Enedis.`;
      results.replaceChildren();
      try {
        const [{ publishedConsumption }, { recentConsumptionAverage }, { groupComparableEnedisEstimates }] = await Promise.all([
          import('./prospecting-energy.mjs'),
          import('./prospecting-data.mjs'),
          import('./enedis-estimate-groups.mjs')
        ]);
        const payload = await publishedConsumption({ ...address, communeCode: address.cityCode || '' });
        const rows = Array.isArray(payload.latest) ? payload.latest : [];
        if (!rows.length) {
          status.textContent = `Donnée non disponible via Enedis pour cette adresse. Cela ne signifie pas que le site ne consomme pas d’électricité ; renseignez une autre source si elle est connue.${payload.warnings?.length ? ` ${payload.warnings.join(' ')}` : ''}`;
          return;
        }
        status.textContent = `${rows.length} référence(s) publique(s) à vérifier. Les codes NAF décrivent des activités, pas des locataires ni des compteurs. Plusieurs lignes ne permettent pas d’identifier les occupants ; vérifiez l’adresse exacte et le périmètre avant de choisir une ligne ou une moyenne.${payload.warnings?.length ? ` ${payload.warnings.join(' ')}` : ''}`;
        const estimateGroups = groupComparableEnedisEstimates(rows);
        const groupByRow = new Map();
        estimateGroups.forEach((group) => group.rows.forEach((row) => groupByRow.set(row, group)));
        const cards = rows.map((row) => {
          const card = document.createElement('article');
          card.className = 'enedisLookupResult';
          const group = groupByRow.get(row);
          const heading = document.createElement('strong');
          const populationLabel = row.population === 'RESIDENTIAL' ? 'Résidentiel agrégé' : 'Entreprise';
          heading.textContent = `${row.year || payload.latestYear || 'Année inconnue'} · ${Number(row.annualMwh).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} MWh/an · ${populationLabel}`;
          heading.title = 'Référence publique indicative, à confirmer avec le propriétaire.';
          const details = document.createElement('p');
          const addressText = [row.address, row.city, row.postalCode].filter(Boolean).join(' · ');
          const countText = row.count == null
            ? (row.population === 'RESIDENTIAL' ? 'nombre de logements inconnu' : 'nombre de sites inconnu')
            : `${row.count} ${row.countLabel || (row.population === 'RESIDENTIAL' ? 'logement(s)' : 'site(s)')}`;
          const categoryText = publishedActivityLabel(row);
          const sectorText = [row.sector, categoryText].filter(Boolean).join(' / ') || 'secteur non précisé';
          const averageText = row.averageMwhPerDwelling == null ? '' : `${Number(row.averageMwhPerDwelling).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} MWh/an/logement en moyenne`;
          details.textContent = [addressText, countText, sectorText, averageText, group?.rows.length > 1 ? 'Incluse dans le total proposé' : ''].filter(Boolean).join(' · ');
          const info = document.createElement('div');
          info.className = 'enedisResultInfo';
          info.append(heading, details);
          card.append(info);
          if (!group || group.rows.length === 1) {
            const choose = document.createElement('button');
            choose.className = 'secondary';
            choose.type = 'button';
            choose.textContent = 'Valider cette estimation';
            choose.addEventListener('click', () => {
              const annualKwh = Number(row.annualMwh) * 1000;
              if (!Number.isFinite(annualKwh) || annualKwh <= 0) {
                status.textContent = 'Cette ligne ne contient pas de valeur annuelle exploitable.';
                return;
              }
              consumption.value = String(Math.round(annualKwh));
              consumption.dataset.referenceSource = row.sourceName || 'Enedis Open Data';
              consumption.dataset.referenceYear = String(row.year || '');
              consumption.dataset.referenceValue = consumption.value.trim();
              consumption.dispatchEvent(new Event('change', { bubbles: true }));
              $('enedisLookupDetails').open = false;
              status.textContent = `Estimation Enedis reprise pour le calcul : ${format(annualKwh)} kWh/an · ${row.year || 'année inconnue'}. À confirmer avec le client.`;
            });
            card.append(choose);
          }
          return card;
        });
        const aggregatePanels = estimateGroups.filter((group) => group.rows.length > 1).map((group) => {
          const panel = document.createElement('section');
          panel.className = 'enedisRecentAveragePanel enedisCombinedEstimate';
          panel.setAttribute('aria-label', `Somme de ${group.rows.length} références Enedis pour ${group.year}`);
          const populationLabel = group.population === 'RESIDENTIAL' ? 'résidentiels' : 'entreprise';
          const total = document.createElement('p');
          total.className = 'enedisRecentAverageValue';
          total.textContent = `Total des ${group.rows.length} références ${populationLabel} (${group.year}) : ${group.totalMwh.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} MWh/an.`;
          const caveat = document.createElement('p');
          caveat.className = 'fine';
          caveat.textContent = 'Le total est proposé comme hypothèse pour le site. L’addition suppose que les lignes correspondent à des occupants ou compteurs distincts ; les catégories d’activité ne le prouvent pas. À confirmer avec le client.';
          const useTotal = document.createElement('button');
          useTotal.type = 'button';
          useTotal.className = 'action';
          useTotal.textContent = 'Reprendre le total comme hypothèse';
          useTotal.addEventListener('click', () => {
            const annualKwh = Math.round(group.totalMwh * 1000);
            if (!(annualKwh > 0)) {
              status.textContent = 'Le total des références ne contient pas de consommation annuelle exploitable.';
              return;
            }
            consumption.value = String(annualKwh);
            consumption.dataset.referenceSource = `Enedis Open Data · somme de ${group.rows.length} références`;
            consumption.dataset.referenceYear = `total ${group.year}`;
            consumption.dataset.referenceValue = consumption.value.trim();
            consumption.dispatchEvent(new Event('change', { bubbles: true }));
            $('enedisLookupDetails').open = false;
            status.textContent = `Somme des ${group.rows.length} références reprise comme hypothèse : ${format(annualKwh)} kWh/an · ${group.year}. À confirmer avec le client.`;
          });
          panel.append(total, caveat, useTotal);
          return panel;
        });
        results.replaceChildren(...cards, ...aggregatePanels);
        const history = Array.isArray(payload.history) ? payload.history.filter((item) => Number.isInteger(Number(item.year)) && Number.isFinite(Number(item.totalMwh))) : [];
        if (history.length) {
          const recentAverage = recentConsumptionAverage(history, 3);
          if (recentAverage) {
            const mean = recentAverage.meanMwh;
            const years = recentAverage.years;
            const averagePanel = document.createElement('section');
            averagePanel.className = 'enedisRecentAveragePanel';
            averagePanel.setAttribute('aria-label', 'Moyenne des consommations annuelles Enedis');
            const average = document.createElement('p');
            average.className = 'enedisRecentAverageValue';
            average.textContent = `Moyenne des ${recentAverage.yearCount} dernières années publiées (${years.join(', ')}) : ${mean.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} MWh/an.`;
            averagePanel.appendChild(average);
            const needsReview = !recentAverage.scopeComparable || payload.partial || payload.warnings?.length;
            const caveat = document.createElement('p');
            caveat.className = 'fine';
            caveat.textContent = !recentAverage.scopeComparable
              ? 'Agrégats publics annuels, pas un profil de compteur. Les catégories ou le nombre de sites/logements diffèrent selon les années : cette moyenne peut être reprise comme hypothèse, mais le périmètre doit être vérifié avec le client.'
              : payload.partial || payload.warnings?.length
                ? 'Agrégats publics annuels, pas un profil de compteur. Le résultat Enedis est partiel ou comporte un avertissement : moyenne indicative à vérifier avant de la retenir.'
                : 'Agrégats publics annuels, pas un profil de compteur. Périmètre comparable sur les années retenues ; vérifiez que l’activité du site est restée représentative.';
            averagePanel.appendChild(caveat);
            const useAverage = document.createElement('button');
            useAverage.type = 'button';
            useAverage.className = 'secondary';
            useAverage.textContent = needsReview
              ? `Reprendre comme hypothèse (${recentAverage.yearCount} ans · à vérifier)`
              : `Utiliser cette moyenne ${recentAverage.yearCount} ans comme hypothèse`;
            useAverage.addEventListener('click', () => {
              consumption.value = String(Math.round(mean * 1000));
              consumption.dataset.referenceSource = 'Enedis Open Data · moyenne historique indicative';
              consumption.dataset.referenceYear = `moyenne ${years.join(', ')}`;
              consumption.dataset.referenceValue = consumption.value.trim();
              consumption.dispatchEvent(new Event('change', { bubbles: true }));
              $('enedisLookupDetails').open = false;
              status.textContent = `Moyenne indicative des ${recentAverage.yearCount} dernières années (${years.join(', ')}) reprise dans l’étude : ${mean.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} MWh/an.${needsReview ? ' Les périmètres publiés ou la réponse Enedis doivent être vérifiés avec le client ; cette valeur reste modifiable et non validée canoniquement.' : ' La consommation reste modifiable et non validée canoniquement.'}`;
            });
            averagePanel.appendChild(useAverage);
            results.appendChild(averagePanel);
          }
          const disclosure = document.createElement('details');
          disclosure.className = 'enedisPublishedHistory';
          const summary = document.createElement('summary');
          summary.textContent = 'Historique annuel publié';
          disclosure.appendChild(summary);
          const list = document.createElement('dl');
          list.className = 'enedisPublishedHistoryList';
          history.forEach((item) => {
            const year = document.createElement('dt'); year.textContent = String(item.year);
            const amount = document.createElement('dd'); amount.textContent = `${Number(item.totalMwh).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} MWh`;
            list.append(year, amount);
          });
          disclosure.appendChild(list);
          results.appendChild(disclosure);
        }
      } catch (error) {
        status.textContent = `Recherche Enedis indisponible : ${error.message}. Vous pouvez saisir une consommation confirmée manuellement.`;
      } finally {
        button.disabled = false;
        button.textContent = 'Rechercher sur Enedis';
        button.removeAttribute('aria-busy');
      }
    });
    consumption.addEventListener('input', () => {
      if (!consumption.dataset.referenceSource) return;
      status.textContent = consumption.dataset.referenceSource === manualConsumptionSource
        ? ''
        : `Repère issu d’Enedis Open Data (${consumption.dataset.referenceYear || 'année inconnue'}), pris en compte pour le calcul et modifiable. Ce n’est pas un profil de compteur.`;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
}());
