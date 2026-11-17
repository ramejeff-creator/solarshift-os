import { MISSION_VERSION, normalizeMissionPlan } from './ozeno-missions.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const euros=value=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' € HT':'À compléter';
export function buildMissionContractDraft({kind,project={},plan,remuneration}={}) {
  const normalized=normalizeMissionPlan(plan);
  if(!['PROJECT_AMO','ACC_MANAGEMENT'].includes(kind)||!normalized.missions.includes(kind)) throw new Error('La mission doit être sélectionnée pour préparer son contrat');
  if(remuneration?.version!==MISSION_VERSION||JSON.stringify(normalizeMissionPlan(remuneration.plan))!==JSON.stringify(normalized)) throw new Error('Le calcul serveur du contrat ne correspond pas aux missions affichées');
  const amo=kind==='PROJECT_AMO',fee=amo?remuneration.amo:remuneration.acc;
  const title=amo?'Projet de contrat de prestation AMO':'Projet de contrat de gestion ACC';
  const description=amo?'Accompagnement du projet depuis son identification jusqu’à sa livraison. Le périmètre des travaux et les diligences convenues sont à détailler dans les pièces contractuelles.':'Prestation de gestion de l’opération d’autoconsommation collective. La PMO, le mandat éventuel d’OZENO et le périmètre des tâches sont à identifier dans les pièces contractuelles.';
  const base=amo?`Montant des travaux couverts par l’AMO : ${euros(fee.basisHtEur)}, hors honoraires OZENO.`:'Assiette : chiffre d’affaires des ventes d’électricité photovoltaïque consommée dans l’ACC, hors surplus réseau et économies d’autoconsommation individuelle. Les volumes et prix proviennent des décomptes de l’opération.';
  const price=amo?`Honoraires ponctuels : 5 % de l’assiette HT, soit ${euros(fee.amountEur)}.`:`Honoraires récurrents : ${fee.ratePct.toLocaleString('fr-FR')} % de l’assiette ACC. La prévision de première année est ${euros(fee.amountEur)} ; elle ne constitue pas un montant forfaitaire ou une facture.`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escape(title)}</title><style>body{max-width:850px;margin:36px auto;padding:24px;font:15px/1.65 Arial,sans-serif;color:#183e35}h1{font-size:26px}h2{font-size:18px;margin-top:26px}.notice{border:2px solid #a86c15;padding:14px;background:#fff8e8}@media print{body{margin:0;padding:0}}</style></head><body>
<p class="notice"><strong>PROJET À COMPLÉTER — NON SIGNÉ.</strong> Les identités, le périmètre contractuel et les modalités non renseignées doivent être complétés avant signature. Ce document ne constate aucune commande, facture ou acceptation.</p>
<h1>${escape(title)}</h1><p>Projet : ${escape(project.name||'À compléter')}<br>Adresse : ${escape(project.address||'À compléter')}<br>Référence dossier : ${escape(project.id||'À compléter')}</p>
<h2>1. Parties</h2><p>OZENO : dénomination juridique, siège, identification et représentant à compléter.<br>Investisseur / cocontractant : identité juridique, siège, identification et représentant à compléter.</p>
<h2>2. Objet et périmètre</h2><p>${escape(description)}</p><p>Prestataires de travaux, lots concernés, livrables, responsabilités et exclusions : à compléter.</p>
<h2>3. Assiette et rémunération</h2><p>${escape(base)}</p><p>${escape(price)}</p><p>Payeur : investisseur / cocontractant à identifier. Bénéficiaire : OZENO. Taux et traitement de TVA : à compléter selon les parties et la prestation.</p>
<h2>4. Durée et paiement</h2><p>Dates de début et de fin, jalons de facturation, périodicité de décompte et délai de paiement : à compléter d’un commun accord. Aucune échéance n’est déduite du seul taux d’honoraires.</p>
<h2>5. Conditions et signatures</h2><p>Conditions d’exécution, assurances, révision, fin de mission, données, litiges et pièces annexes : à compléter avant signature.</p><p>Pour OZENO : ____________________<br>Pour l’investisseur : ____________________<br>Lieu et date : ____________________</p>
<p>Source : ${escape(MISSION_VERSION)} · génération locale depuis la pré-étude · montants prévisionnels calculés côté serveur.</p></body></html>`;
}
