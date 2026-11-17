// Versioned commercial facts shared by the portfolio and the pre-study.
// Monetary calculations are performed by the server financial model.
export const MISSION_VERSION = 'OZENO-MISSIONS-2026-11-16.1';
export const MISSION_LABELS = Object.freeze({
  LEAD_PV:'Lead PV', LEAD_RENOVATION:'Lead rénovation énergétique',
  PROJECT_AMO:'AMO projet', ACC_MANAGEMENT:'Gestion ACC (PMO)'
});
// Presentation availability does not rewrite existing commercial agreements.
export const MISSION_AVAILABILITY = Object.freeze({
  LEAD_PV:true, LEAD_RENOVATION:true, PROJECT_AMO:true, ACC_MANAGEMENT:false
});
export const MISSION_FIELDS = Object.freeze({
  leadPvWorksHtEur:{label:'Travaux PV et périphériques concernés, hors honoraires OZENO',unit:'€ HT',min:0,max:1e12},
  leadPvRatePct:{label:'Commission versée par le prestataire PV',unit:'%',min:8,max:10},
  leadRenovationWorksHtEur:{label:'Travaux de rénovation concernés, hors honoraires OZENO',unit:'€ HT',min:0,max:1e12},
  leadRenovationRatePct:{label:'Commission versée par le prestataire rénovation',unit:'%',min:8,max:10},
  amoWorksHtEur:{label:'Travaux couverts par la mission AMO, hors honoraires OZENO',unit:'€ HT',min:0,max:1e12},
  accManagementRatePct:{label:'Honoraires sur les ventes d’électricité consommée en ACC',unit:'%',min:0,max:100}
});
export function createMissionPlan({qualificationRequired=false}={}) {
  return {version:MISSION_VERSION,missions:qualificationRequired?[]:['LEAD_PV'],
    leadPvWorksHtEur:null,leadPvRatePct:null,leadRenovationWorksHtEur:null,leadRenovationRatePct:null,
    amoWorksHtEur:null,accManagementRatePct:5,qualificationRequired};
}
export function normalizeMissionPlan(input) {
  if(!input || typeof input!=='object' || Array.isArray(input) || input.version!==MISSION_VERSION) throw new TypeError('Version des missions OZENO incompatible');
  if(!Array.isArray(input.missions) || input.missions.some(key=>!Object.hasOwn(MISSION_LABELS,key)) || new Set(input.missions).size!==input.missions.length) throw new TypeError('Missions OZENO invalides');
  if(input.qualificationRequired!=null && typeof input.qualificationRequired!=='boolean') throw new TypeError('État de qualification des missions invalide');
  const result={version:MISSION_VERSION,missions:Object.keys(MISSION_LABELS).filter(key=>input.missions.includes(key)),qualificationRequired:input.qualificationRequired===true};
  if(!result.qualificationRequired && !result.missions.some(key=>key==='LEAD_PV'||key==='LEAD_RENOVATION')) throw new TypeError('Un apport d’affaires PV ou rénovation est obligatoire');
  for(const [key,field] of Object.entries(MISSION_FIELDS)) {
    const value=input[key];
    if(value==null || value==='') result[key]=key==='accManagementRatePct'?5:null;
    else {
      if(typeof value!=='number'||!Number.isFinite(value)||value<field.min||value>field.max) throw new TypeError(`${field.label} : valeur requise entre ${field.min} et ${field.max}`);
      result[key]=value;
    }
  }
  return result;
}
export function missionPlanForRecord(record={}) {
  const saved=record.missionPlan ?? record.preview?.missionPlan;
  // A legacy ACC code must never become a renovation or AMO mission by renaming.
  return saved?availableMissionPlan(saved):createMissionPlan({qualificationRequired:true});
}
export function availableMissionPlan(input) {
  const value=normalizeMissionPlan(input);
  return {...value,missions:value.missions.filter(key=>MISSION_AVAILABILITY[key]!==false)};
}
export function missionLabels(plan) {
  const value=normalizeMissionPlan(plan);
  return value.qualificationRequired?['Apport d’affaires à qualifier',...value.missions.map(key=>MISSION_LABELS[key])]:value.missions.map(key=>MISSION_LABELS[key]);
}
export function withMissions(plan,missions) {
  return normalizeMissionPlan({...plan,missions,qualificationRequired:false});
}
export function missionRemunerationMatches(result,plan) {
  try{return result?.version===MISSION_VERSION&&JSON.stringify(normalizeMissionPlan(result.plan))===JSON.stringify(normalizeMissionPlan(plan));}
  catch{return false;}
}
