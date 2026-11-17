import { createMissionPlan, normalizeMissionPlan, availableMissionPlan, MISSION_FIELDS, MISSION_LABELS, MISSION_AVAILABILITY } from './ozeno-missions.mjs';
import { buildMissionContractDraft } from './mission-contract-draft.mjs';

export function createMissionEditor({documentRef=document,endpoint,fetchImpl=fetch,onChange=()=>{},autoEstimateDelayMs=300,setTimeoutImpl=setTimeout,clearTimeoutImpl=clearTimeout}={}) {
  let root=null,plan=createMissionPlan(),legacy=false,notice=null,context={},requestGeneration=0,estimateSummary=null,lastRemuneration=null;
  let estimateTimer=null,estimateController=null,disposed=false;
  const fields=new Map(),toggles=new Map(),contractButtons=new Map();
  const cards=new Map(),results=new Map();
  const availableContracts=new Set(['PROJECT_AMO']);
  const add=(tag,text)=>{const n=documentRef.createElement(tag);if(text!=null)n.textContent=text;return n;};
  const groups={LEAD_PV:['leadPvWorksHtEur','leadPvRatePct'],LEAD_RENOVATION:['leadRenovationWorksHtEur','leadRenovationRatePct'],PROJECT_AMO:['amoWorksHtEur'],ACC_MANAGEMENT:['accManagementRatePct']};
  const notes={LEAD_PV:'PV et périphériques (IRVE, stockage…). Commission sur les travaux HT concernés, sans coût supplémentaire pour le client.',LEAD_RENOVATION:'Lots de rénovation énergétique du bâtiment, distincts des lots PV. La commission ne majore pas le coût client.',PROJECT_AMO:'5 % des travaux HT couverts, hors honoraires OZENO. Ajout unique à l’investissement initial ; cette assiette ne remplace pas le budget.',ACC_MANAGEMENT:'5 % par défaut, modifiable, des seules ventes d’électricité consommée dans l’ACC. ACI et surplus exclus ; aucun forfait PMO supplémentaire.'};
  function cancelEstimate() {
    if(estimateTimer!=null){clearTimeoutImpl(estimateTimer);estimateTimer=null;}
    estimateController?.abort();estimateController=null;
    estimateSummary?.setAttribute?.('aria-busy','false');
  }
  function queueEstimate() {
    if(estimateTimer!=null)clearTimeoutImpl(estimateTimer);
    estimateTimer=null;
    if(legacy||disposed)return;
    estimateTimer=setTimeoutImpl(()=>{estimateTimer=null;return estimate();},autoEstimateDelayMs);
    estimateTimer?.unref?.();
  }
  function resetResults() {
    for(const [key,result] of results){
      const active=!legacy&&toggles.get(key)?.checked;
      result.value.textContent=active?'À calculer':'Non applicable';
      result.node.dataset.state=active?'pending':'inactive';
    }
  }
  function capture() {
    if(legacy) return null;
    const value={...plan,missions:[...toggles].filter(([,node])=>node.checked).map(([key])=>key),qualificationRequired:false};
    for(const [key,node] of fields) value[key]=node.value==null||String(node.value).trim()===''?null:Number(node.value);
    return normalizeMissionPlan(value);
  }
  function sync() {
    for(const [key,toggle] of toggles){
      const unavailable=MISSION_AVAILABILITY[key]===false;
      toggle.disabled=unavailable;
      const card=cards.get(key);if(card){card.dataset.selected=String(toggle.checked);card.dataset.unavailable=String(unavailable);}
      if(unavailable)toggle.title='Gestion ACC en préparation · indisponible.';
      const result=results.get(key);if(result)result.node.hidden=unavailable;
    }
    for(const [key,toggle] of toggles) for(const fieldKey of groups[key]) {
      const input=fields.get(fieldKey);input.disabled=legacy||!toggle.checked||MISSION_AVAILABILITY[key]===false;
      input.closest?.('.financialOptionValues')?.toggleAttribute('hidden',legacy||!toggle.checked||MISSION_AVAILABILITY[key]===false);
    }
    for(const [key,button] of contractButtons)button.disabled=!availableContracts.has(key)||legacy||!toggles.get(key)?.checked;
    if(root)root.hidden=legacy;
    if(notice)notice.textContent=legacy?'Dossier historique : les anciennes hypothèses sont conservées. Confirmez les nouvelles missions pour changer de règle de rémunération.':'Apport d’affaires obligatoire ; missions cumulables. Les données inconnues restent à compléter.';
  }
  function change(persist=false) {
    requestGeneration++;cancelEstimate();lastRemuneration=null;if(estimateSummary)estimateSummary.textContent='Les estimations se mettent à jour automatiquement.';
    resetResults();
    try {plan=capture();if(notice)notice.textContent='Missions mises à jour. Les assiettes inconnues restent à compléter.';onChange(plan,{persist});}
    catch(error){if(notice)notice.textContent=error.message;}
    sync();
    queueEstimate();
  }
  function restore(value,{project={},historical=false,remuneration:stored=null}={}) {
    requestGeneration++;cancelEstimate();
    context=project;legacy=historical&&!value;
    plan=value?availableMissionPlan(value):createMissionPlan();
    for(const [key,toggle] of toggles) toggle.checked=plan.missions.includes(key);
    for(const [key,input] of fields) input.value=plan[key]==null?'':String(plan[key]);
    sync();
    lastRemuneration=null;
    resetResults();
    if(stored)showRemuneration(stored);
    else if(estimateSummary)estimateSummary.textContent='Les estimations se mettent à jour automatiquement.';
    const adoption=documentRef.getElementById('adoptOzenoMissions');if(adoption)adoption.hidden=!legacy;
    if(!lastRemuneration)queueEstimate();
  }
  async function remuneration({accSalesEur=null,signal}={}) {
    const value=capture();if(!value)throw new Error('Confirmez les nouvelles missions du dossier historique');
    const response=await fetchImpl(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'missionRemuneration',missionPlan:value,accSalesEur}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Rémunération indisponible');return result;
  }
  function showRemuneration(result) {
    try {
      if(disposed)return;
      if(JSON.stringify(normalizeMissionPlan(result?.plan))!==JSON.stringify(capture()))return;
      cancelEstimate();
      lastRemuneration=structuredClone(result);
      const amount=value=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('fr-FR',{maximumFractionDigits:2})+' € HT':'À compléter';
      resetResults();
      for(const [mission,key] of [['LEAD_PV','leadPv'],['LEAD_RENOVATION','leadRenovation'],['PROJECT_AMO','amo'],['ACC_MANAGEMENT','acc']]) {
        const fee=result[key];if(!fee?.active)continue;
        let value=amount(fee.amountEur);
        if(fee.amountEur==null&&fee.lowEur!=null&&fee.highEur!=null)value=`${amount(fee.lowEur)} à ${amount(fee.highEur)} ; taux à préciser`;
        const resultNode=results.get(mission);
        if(resultNode){resultNode.value.textContent=value;resultNode.node.dataset.state='ready';}
      }
      if(estimateSummary)estimateSummary.textContent='Estimations mises à jour dans chaque mission. Montants non facturés ; les commissions Lead ne majorent pas le coût client.';
    }catch{lastRemuneration=null;}
  }
  async function estimate() {
    if(legacy||disposed)return;
    const generation=requestGeneration;
    estimateController?.abort();
    const controller=new AbortController();estimateController=controller;
    if(estimateSummary){estimateSummary.textContent='Calcul automatique des rémunérations en cours…';estimateSummary.setAttribute?.('aria-busy','true');}
    try {
      const schedule=globalThis.window?.SOLARSHIFT_FINANCIAL_PREVIEW;
      const revenue=schedule?.status==='READY'?schedule.annualRows?.[1]?.accSalesEur??null:null;
      const result=await remuneration({accSalesEur:revenue,signal:controller.signal});
      if(!controller.signal.aborted&&generation===requestGeneration&&!disposed)showRemuneration(result);
    }catch(error){if(!controller.signal.aborted&&generation===requestGeneration&&!disposed&&estimateSummary)estimateSummary.textContent=error.message;}
    finally{if(estimateController===controller){estimateController=null;estimateSummary?.setAttribute?.('aria-busy','false');}}
  }
  async function downloadContract(kind) {
    if(!availableContracts.has(kind)){if(notice)notice.textContent='Le contrat de gestion ACC n’est pas encore disponible.';return;}
    const generation=requestGeneration;
    try {
      const schedule=globalThis.window?.SOLARSHIFT_FINANCIAL_PREVIEW;
      const revenue=schedule?.status==='READY'?schedule.annualRows?.[1]?.accSalesEur??null:null;
      const result=await remuneration({accSalesEur:revenue});
      if(generation!==requestGeneration)return;
      const html=buildMissionContractDraft({kind,project:context,plan:capture(),remuneration:result});
      const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
      const link=add('a');link.href=url;link.download=`projet-contrat-${kind==='PROJECT_AMO'?'amo':'gestion-acc'}.html`;documentRef.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    } catch(error) {if(notice)notice.textContent=error.message;}
  }
  function render(container) {
    container.className=(container.className||'')+' ozenoMissions';
    const heading=add('legend','Missions et rémunérations OZENO');container.append(heading);
    notice=add('p');notice.className='fine';notice.setAttribute?.('role','status');container.append(notice);
    const adopt=add('button','Passer aux nouvelles missions — Lead PV proposé par défaut');adopt.id='adoptOzenoMissions';adopt.className='ozenoMissionButton ozenoMissionButtonPrimary';adopt.type='button';adopt.hidden=true;
    adopt.addEventListener('click',()=>{legacy=false;adopt.hidden=true;sync();change(true);});container.append(adopt);
    root=add('div');root.id='ozenoMissionPlan';
    const intro=add('p','Les rémunérations se recalculent automatiquement. Les cases sont synchronisées ; cliquez sur « Enregistrer le projet » pour conserver vos montants et vos taux.');intro.className='ozenoMissionSaveHint';root.append(intro);
    const meta={LEAD_PV:['Prestataire → OZENO','Commission de 8 à 10 %'],LEAD_RENOVATION:['Prestataire → OZENO','Commission de 8 à 10 %'],PROJECT_AMO:['Investisseur → OZENO','Ponctuel · 5 %'],ACC_MANAGEMENT:['Investisseur → OZENO','Annuel · taux modifiable']};
    const grid=add('div');grid.className='ozenoMissionGrid';root.append(grid);
    for(const [key,label] of Object.entries(MISSION_LABELS)) {
      const block=add('div');block.className='financialContractOption ozenoMissionCard';block.dataset.mission=key;cards.set(key,block);
      const line=add('label');line.className='financialOptionToggle';
      const toggle=add('input');toggle.type='checkbox';toggle.id='mission_'+key;toggle.checked=plan.missions.includes(key);toggle.dataset.missionInput='true';toggles.set(key,toggle);
      line.append(toggle,add('span',label));
      const metadata=add('div');metadata.className='ozenoMissionMeta';for(const text of meta[key])metadata.append(add('span',text));
      const explanation=add('p',notes[key]);explanation.className='ozenoMissionDescription';block.append(line,metadata,explanation);
      if(MISSION_AVAILABILITY[key]===false)metadata.append(add('span','En préparation · indisponible'));
      const values=add('div');values.className='financialOptionValues financialSimpleGrid';
      for(const fieldKey of groups[key]) {
        const spec=MISSION_FIELDS[fieldKey],field=add('label'),input=add('input');field.className='financialSimpleField';
        field.append(add('span',`${spec.label} (${spec.unit})`));input.type='number';input.min=String(spec.min);input.max=String(spec.max);input.step='any';input.id='mission_'+fieldKey;input.value=plan[fieldKey]==null?'':String(plan[fieldKey]);input.placeholder='À compléter';input.dataset.missionInput='true';fields.set(fieldKey,input);input.addEventListener('input',()=>change(false));field.append(input);values.append(field);
      }
      block.append(values);
      const footer=add('div');footer.className='ozenoMissionFooter';
      const result=add('div');result.className='ozenoMissionResult';result.id='mission_result_'+key;
      const resultLabel=key==='PROJECT_AMO'?'Honoraires ponctuels estimés':key==='ACC_MANAGEMENT'?'Honoraires annuels estimés':'Commission estimée';
      const resultValue=add('strong','À calculer');result.append(add('span',resultLabel),resultValue);results.set(key,{node:result,value:resultValue});footer.append(result);
      if(['PROJECT_AMO','ACC_MANAGEMENT'].includes(key)) {
        const button=add('button',key==='PROJECT_AMO'?'Préparer le contrat AMO':'Contrat de gestion ACC · à venir');button.className='ozenoMissionButton';button.type='button';
        if(!availableContracts.has(key))button.title='Indisponible : contrat de gestion ACC en préparation.';
        button.addEventListener('click',()=>downloadContract(key));contractButtons.set(key,button);footer.append(button);
      }
      block.append(footer);
      toggle.addEventListener('change',()=>{
        if(MISSION_AVAILABILITY[key]===false){toggle.checked=plan.missions.includes(key);sync();return;}
        if(!toggles.get('LEAD_PV').checked&&!toggles.get('LEAD_RENOVATION').checked){toggle.checked=!toggle.checked;if(notice)notice.textContent='Conservez au moins un apport d’affaires PV ou rénovation.';return;}
        change(true);
      });grid.append(block);
    }
    const actions=add('div');actions.className='ozenoMissionActions';
    actions.append(add('small','Estimation automatique · Les contrats générés sont des brouillons à compléter.'));root.append(actions);
    estimateSummary=add('div','Les estimations se mettent à jour automatiquement.');estimateSummary.className='ozenoMissionResults';estimateSummary.setAttribute?.('role','status');estimateSummary.setAttribute?.('aria-live','polite');root.append(estimateSummary);
    container.append(root);sync();resetResults();queueEstimate();
  }
  return {render,capture,restore,remuneration,showRemuneration,captureRemuneration:()=>lastRemuneration?structuredClone(lastRemuneration):null,dispose:()=>{disposed=true;requestGeneration++;cancelEstimate();},get active(){return !legacy;}};
}
