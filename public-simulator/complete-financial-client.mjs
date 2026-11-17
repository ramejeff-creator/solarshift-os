// Inputs and presentation for the pre-study; all financial calculations stay on the server.
import { createMissionEditor } from './mission-editor.mjs';
export function createCompleteFinancialClient({ endpoint, fetchImpl = fetch, documentRef = document } = {}) {
  let policy=null,validationMessage='';
  let missionEditor=null,legacyOptions=null,pendingMissionContext=null;
  const technicalKeys=['productionDegradationRate','energyPriceEscalationRate','s21SurplusEscalationRate','contractSurplusEscalationRate','costInflationRate','maintenanceEurPerKwp','insuranceEpcRate','replacementYear','replacementEurPerKwp','contingencyRate','financingFeeRate'];
  const options=[
    {key:'managementRevenueRate',toggle:'contractManagementApplicable',title:'Gestion OZENO',label:'Commission de gestion sur les revenus de vente',note:'Facultatif. Le pourcentage porte sur les ventes ACC, IRVE et réseau, ainsi que sur l’ACI vendue par un tiers investisseur. Les économies ACI du propriétaire sont exclues. Aucun autre abonnement ou service OZENO n’est ajouté.'},
    {key:'administrationEur',toggle:'contractAdministrationApplicable',title:'Administration du projet',label:'Frais administratifs annuels',note:'Facultatif : comptabilité, frais bancaires ou administration de la structure qui porte le projet. Renseignez uniquement un budget connu, hors prestations déjà couvertes par la gestion OZENO.'},
    {key:'accPmoEur',toggle:'contractPmoApplicable',title:'Organisation de l’ACC (PMO)',label:'Prestation PMO facturée au projet',note:'La personne morale organisatrice coordonne les participants à l’ACC et leurs échanges avec Enedis. Activez seulement si une prestation est facturée au projet ; vérifiez qu’elle n’est pas déjà comprise dans la gestion OZENO. Le coût s’applique uniquement si une part ACC est prévue.'}
  ];
  const optionByKey=new Map(options.map(option=>[option.key,option]));
  const ready=fetchImpl(endpoint,{cache:'no-store',signal:AbortSignal.timeout(10000)}).then(async response=>{
    if(!response.ok)throw Error('Référentiel financier indisponible');
    const value=await response.json();
    if(!value?.modelVersion?.startsWith('OZENO-FULL-') || !value.preStudy || !Array.isArray(value.parameters))throw Error('Référentiel de pré-étude incompatible ; actualisez le serveur');
    policy=value;return value;
  });
  const display=p=>Number((p.value*(p.unit==='%'?100:1)).toFixed(8));
  const changed=()=>window.dispatchEvent(new CustomEvent('ozeno:complete-finance-input'));
  function syncOption(option) {
    const active=Boolean(documentRef.getElementById(option.toggle)?.checked);
    const node=documentRef.getElementById('fullFinance_'+option.key);
    if(node){node.disabled=!active;node.required=active;node.closest?.('.financialOptionValues')?.toggleAttribute('hidden',!active);if(!active){node.setCustomValidity?.('');node.removeAttribute?.('aria-invalid');}}
    if(option.key==='managementRevenueRate'){
      const status=documentRef.getElementById('fullManagementSummary');
      if(status)status.textContent=active?'Gestion OZENO activée : renseignez le taux pour calculer la commission.':'Gestion OZENO désactivée : 0 € de commission.';
    }
    return active;
  }
  function getValues() {
    validationMessage='';
    if(!policy)return null;
    let missionPlan=null;
    try {missionPlan=missionEditor?.active?missionEditor.capture():null;}
    catch(error){validationMessage=error.message;return null;}
    const amoField=documentRef.getElementById('mission_amoWorksHtEur');
    amoField?.setCustomValidity?.('');amoField?.removeAttribute?.('aria-invalid');
    if(missionPlan?.missions.includes('PROJECT_AMO')&&missionPlan.amoWorksHtEur==null){validationMessage='AMO projet : renseignez le montant HT des travaux couverts, hors honoraires OZENO.';amoField?.setCustomValidity?.(validationMessage);amoField?.setAttribute?.('aria-invalid','true');return null;}
    const values={...policy.preStudy.defaultOverrides};
    const npvComparisonEnabled=Boolean(documentRef.getElementById('npvComparisonApplicable')?.checked);
    for(const p of policy.parameters){
      const option=optionByKey.get(p.key);
      if(option&&missionPlan){values[p.key]=0;continue;}
      if(option&&!syncOption(option)){values[p.key]=0;continue;}
      if(!technicalKeys.includes(p.key)&&!option&&!['discountRate','equityDiscountRate'].includes(p.key))continue;
      if(!npvComparisonEnabled&&['discountRate','equityDiscountRate'].includes(p.key)){values[p.key]=p.value;continue;}
      const node=documentRef.getElementById(p.id),raw=node?.value;
      node?.setCustomValidity?.('');node?.removeAttribute?.('aria-invalid');
      if(option&&(raw==null||String(raw).trim()==='')){
        validationMessage=option.title+' : renseignez le montant ou le taux, ou décochez l’option.';
        node?.setCustomValidity?.(validationMessage);node?.setAttribute?.('aria-invalid','true');return null;
      }
      const v=raw==null||String(raw).trim()===''?p.value:Number(raw)/(p.unit==='%'?100:1);
      if(!Number.isFinite(v)||v<p.min||v>p.max){validationMessage=p.label+' : corrigez la valeur renseignée.';node?.setCustomValidity?.(validationMessage);node?.setAttribute?.('aria-invalid','true');return null;}
      values[p.key]=v;
    }
    const target=documentRef.getElementById('npvTargetValues');
    if(target)target.hidden=!npvComparisonEnabled;
    return {modelVersion:policy.modelVersion,values,npvComparisonEnabled,...(missionPlan?{missionPlan}:{})};
  }
  function paragraph(text,className='fine') {
    const node=documentRef.createElement('p');node.className=className;node.textContent=text;return node;
  }
  function amountField(p,note,empty=false) {
    const field=documentRef.createElement('label');field.className='financialSimpleField';
    const text=documentRef.createElement('span');text.textContent=p.label+' ('+p.unit+')';
    const input=documentRef.createElement('input');input.type='number';input.id=p.id;input.min=String(p.min);input.max=String(p.max*(p.unit==='%'?100:1));input.step='any';
    input.value=empty?'':String(display(p));input.dataset.modelDefault=input.value;input.dataset.completeFinancialInput='true';
    input.addEventListener('input',changed);field.append(text,input,paragraph(note));return field;
  }
  async function renderEditor(container) {
    const model=await ready;if(!container)return;
    missionEditor?.dispose();
    container.replaceChildren();
    container.append(paragraph('Pré-étude avant IS : le montage juridique et la fiscalité de l’investisseur seront précisés dans le rapport financier. Aucun démantèlement n’est supposé à la fin de l’horizon financier.'));
    const details=documentRef.createElement('details'),title=documentRef.createElement('summary');title.textContent='Hypothèses techniques de la pré-étude';details.append(title);
    details.append(paragraph('Ces hypothèses servent à la projection. Vous pouvez les ajuster si vous disposez d’un devis, d’un contrat ou d’une étude technique.'));
    const grid=documentRef.createElement('div');grid.className='financialSimpleGrid';
    for(const key of technicalKeys){
      const p=model.parameters.find(parameter=>parameter.key===key);
      if(p)grid.append(amountField(p,model.parameterGuidance?.[key]||''));
    }
    details.append(grid);container.append(details);
    const missions=documentRef.createElement('fieldset');missions.className='financialContractCosts';
    missionEditor=createMissionEditor({documentRef,endpoint,fetchImpl,onChange:(plan,{persist})=>{
      pendingMissionContext=[plan,{...(pendingMissionContext?.[1]||{}),historical:false}];
      if(legacyOptions)legacyOptions.hidden=true;
      changed();window.dispatchEvent(new CustomEvent('ozeno:missions-change',{detail:{plan,persist}}));
    }});
    missionEditor.render(missions);container.append(missions);
    const optional=documentRef.createElement('fieldset');optional.className='financialContractCosts';
    legacyOptions=optional;optional.hidden=true;
    const legend=documentRef.createElement('legend');legend.textContent='Options de gestion';optional.append(legend,paragraph('Cochez uniquement les prestations applicables. Une option non cochée ne génère aucun frais, même si un ancien montant était enregistré.'));
    for(const option of options){
      const p=model.parameters.find(parameter=>parameter.key===option.key);if(!p)continue;
      const block=documentRef.createElement('div');block.className='financialContractOption';
      const label=documentRef.createElement('label');label.className='financialOptionToggle';
      const toggle=documentRef.createElement('input');toggle.type='checkbox';toggle.id=option.toggle;toggle.dataset.completeFinancialToggle='true';
      const name=documentRef.createElement('span');name.textContent=option.title+' · applicable';label.append(toggle,name);
      const values=documentRef.createElement('div');values.className='financialOptionValues';values.hidden=true;
      const field=amountField({...p,label:option.label,unit:p.unit==='%'?'%':p.unit},'',true);
      values.append(field);block.append(label,paragraph(option.note),values);
      const input=field.children[1];input.disabled=true;input.required=false;input.placeholder=p.unit==='%'?'Ex. 5, 10 ou 15':'Montant prévu au contrat';
      toggle.addEventListener('change',()=>{syncOption(option);changed();});
      optional.append(block);
      if(option.key==='accPmoEur'){
        const source=documentRef.createElement('a');source.href='https://www.enedis.fr/produire-consommer-son-electricite';source.target='_blank';source.rel='noopener';source.textContent='Comprendre le rôle de la PMO · Enedis';block.append(source);
      }
    }
    const managementStatus=paragraph('Gestion OZENO désactivée : 0 € de commission.');managementStatus.id='fullManagementSummary';managementStatus.setAttribute?.('role','status');optional.append(managementStatus);
    container.append(optional);
    const connection=documentRef.createElement('fieldset');connection.className='financialInvestmentCosts';
    const connectionTitle=documentRef.createElement('legend');connectionTitle.textContent='Raccordement';connection.append(connectionTitle,paragraph('Le montant automatique utilise la puissance calculée depuis les surfaces et les panneaux à l’étape précédente. Il reste une estimation à confirmer par une proposition de raccordement.'));
    const status=paragraph('La puissance estimée et le montant utilisé apparaîtront dès que le projet sera dimensionné.');status.id='fullConnectionEstimate';status.setAttribute?.('role','status');connection.append(status);
    const field=documentRef.createElement('label');field.className='financialSimpleField';field.append('Remplacer l’estimation par un devis de raccordement HT (€)');
    const connectionInput=documentRef.createElement('input');connectionInput.id='fullConnectionEur';connectionInput.type='number';connectionInput.min='0';connectionInput.step='any';connectionInput.placeholder='Facultatif · estimation automatique si vide';connectionInput.dataset.modelDefault='';connectionInput.addEventListener('input',changed);field.append(connectionInput);connection.append(field);
    const scope=documentRef.createElement('label');scope.className='financialSimpleField';scope.append('Périmètre du devis photovoltaïque');
    const select=documentRef.createElement('select');select.id='fullQuoteScope';
    for(const [value,label]of[['EPC','Installation PV seule, raccordement à part'],['UNSPECIFIED','Devis tout compris / périmètre à préciser']]){
      const item=documentRef.createElement('option');item.value=value;item.textContent=label;select.append(item);
    }
    select.addEventListener('change',changed);scope.append(select,paragraph('Ce choix évite d’ajouter une seconde fois un raccordement déjà compris dans le devis.'));connection.append(scope);container.append(connection);
    const comparison=documentRef.createElement('details');comparison.className='financialNpvComparison';
    const comparisonTitle=documentRef.createElement('summary');comparisonTitle.textContent='Comparer à un rendement cible (facultatif)';comparison.append(comparisonTitle,paragraph('La VAN compare les flux à un rendement que vous choisissez. Les références 7 % projet et 10 % fonds propres sont des conventions de scénario, sans valeur de norme. Elles ne changent ni le TRI ni le coût du kWh.'));
    const enable=documentRef.createElement('label');enable.className='financialOptionToggle';
    const checkbox=documentRef.createElement('input');checkbox.type='checkbox';checkbox.id='npvComparisonApplicable';checkbox.dataset.completeFinancialToggle='true';enable.append(checkbox,'Afficher la VAN et le rendement cible retenu');
    const targets=documentRef.createElement('div');targets.id='npvTargetValues';targets.className='financialSimpleGrid';targets.hidden=true;
    for(const key of ['discountRate','equityDiscountRate']){
      const p=model.parameters.find(parameter=>parameter.key===key);if(p)targets.append(amountField(p,model.parameterGuidance?.[key]||''));
    }
    checkbox.addEventListener('change',()=>{targets.hidden=!checkbox.checked;changed();});comparison.append(enable,targets);container.append(comparison);
    if(pendingMissionContext)restoreMissions(...pendingMissionContext);
  }
  function restoreMissions(plan,options={}) {
    pendingMissionContext=[plan,options];
    missionEditor?.restore(plan,options);
    if(legacyOptions)legacyOptions.hidden=missionEditor?.active!==false;
  }
  async function requestSchedule(input,{signal}={}) {
    await ready;
    const response=await fetchImpl(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});
    const result=await response.json();
    if(!response.ok)throw Error(result.error||'Calcul financier indisponible');
    if(result.modelVersion!==policy.modelVersion||!Array.isArray(result.rows))throw Error('Version financière incompatible ; actualisez le référentiel');
    return result;
  }
  return {ready,getValues,renderEditor,requestSchedule,restoreMissions,captureMissions:()=>missionEditor?.capture()??null,
    captureMissionRemuneration:()=>missionEditor?.captureRemuneration()??null,showMissionRemuneration:value=>missionEditor?.showRemuneration(value),
    get policy(){return policy;},get validationMessage(){return validationMessage;}};
}

