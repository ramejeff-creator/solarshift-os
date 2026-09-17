# SolarShift â€” Architecture technique Supabase & Rule Engine v1.0

> Source primaire : `docs/source/ARCHITECTURE-TECHNIQUE.pdf`. La prÃ©sente version Markdown est la transcription complÃ¨te de lâ€™architecture publiÃ©e.
<!-- Page 1 -->

SolarShift — Architecture technique v1.0 
1. Architecture cible 
                    ┌──────────────────────┐ 
                    │      Lovable         │ 
                    │  Frontend / UI / UX  │ 
                    └──────────┬───────────┘ 
                               │ 
                         Authenticated API 
                               │ 
                    ┌──────────▼───────────┐ 
                    │       Supabase       │ 
                    │ Auth / DB / Storage  │ 
                    └──────────┬───────────┘ 
                               │ 
                    ┌──────────▼───────────┐ 
                    │    Edge Functions    │ 
                    │  Business Services   │ 
                    └──────────┬───────────┘ 
                               │ 
        ┌──────────────────────┼──────────────────────┐ 
        │                      │                      │ 
        ▼                      ▼                      ▼ 
  Document Engine        Calculation Engine      Rule Engine 
        │                      │                      │ 
        ▼                      ▼                      ▼ 
 Evidence Layer          KPI Engine          Certainty Engine 
                                                   │ 
                              ┌────────────────────┼───────────────┐ 
                              ▼                    ▼               ▼ 
                           Risk Engine       Resilience       Decision Engine 
                              │                    │               │ 

<!-- Page 2 -->

                              └────────────────────┴───────────────┘ 
                                                   │ 
                                                   ▼ 
                                            Project Status 
Principe : 
Lovable construit l'interface. Supabase conserve la vérité métier. Les Edge Functions 
exécutent les calculs. 
 
2. Tables principales 
PROJECTS 
Table centrale. 
Champ Type 
id UUID 
project_reference TEXT 
project_name TEXT 
status ENUM 
commercial_stage ENUM 
address TEXT 
postal_code TEXT 
city TEXT 
country TEXT 
client_id UUID 
owner_id UUID 
occupant_id UUID 
mandataire_id UUID 
building_type TEXT 
activity_type TEXT 
site_surface NUMERIC 
roof_surface NUMERIC 

<!-- Page 3 -->

Champ Type 
contact_name TEXT 
contact_email TEXT 
target_contract_duration INTEGER 
created_at TIMESTAMP 
updated_at TIMESTAMP 
project_reference est généré automatiquement : 
SOL-2026-00001 
SOL-2026-00002 
... 
 
3. CLIENTS 
Champ Type 
id UUID 
legal_name TEXT 
siren TEXT 
siret TEXT 
legal_form TEXT 
activity_type TEXT 
address TEXT 
postal_code TEXT 
city TEXT 
credit_score NUMERIC 
created_at TIMESTAMP 
updated_at TIMESTAMP 
Un client peut posséder plusieurs projets. 
 
4. PROJECT_PARAMETERS 

<!-- Page 4 -->

Cette table constitue le cœur du moteur. 
Champ Type 
id UUID 
project_id UUID 
parameter_code TEXT 
value_numeric NUMERIC 
value_text TEXT 
value_boolean BOOLEAN 
value_date DATE 
value_json JSONB 
unit TEXT 
status ENUM 
source_type TEXT 
confidence_level TEXT 
validation_status TEXT 
validated_by UUID 
validated_at TIMESTAMP 
calculation_method TEXT 
version INTEGER 
created_at TIMESTAMP 
updated_at TIMESTAMP 
Un seul paramètre peut donc être : 
B01 
annual_consumption 
1 240 000 
kWh/year 
L4 
VALIDATED 

<!-- Page 5 -->

 
5. EVIDENCES 
Une donnée importante doit pouvoir être justifiée. 
Champ Type 
id UUID 
project_id UUID 
parameter_id UUID 
document_id UUID 
source_id UUID 
evidence_type TEXT 
extracted_value JSONB 
confidence NUMERIC 
evidence_date DATE 
page_reference TEXT 
excerpt TEXT 
extraction_method TEXT 
validated_by UUID 
validated_at TIMESTAMP 
created_at TIMESTAMP 
Exemple : 
Parameter : B01 
Document : Facture EDF Janvier 2026 
Page : 1 
Valeur : 103 450 kWh 
Confidence : 0.97 
Method : AI_EXTRACTION 
Validation : HUMAN_VALIDATED 
 
6. DOCUMENTS 

<!-- Page 6 -->

Champ Type 
id UUID 
project_id UUID 
document_type TEXT 
file_name TEXT 
storage_path TEXT 
uploaded_by UUID 
uploaded_at TIMESTAMP 
document_date DATE 
processing_status TEXT 
ai_extraction_status TEXT 
checksum TEXT 
version INTEGER 
Types initiaux : 
INVOICE 
CONSUMPTION_HISTORY 
LOAD_PROFILE 
ROOF_PLAN 
CADASTRAL_PLAN 
PHOTOS 
STRUCTURAL_REPORT 
ELECTRICAL_REPORT 
URBANISM_DOCUMENT 
EPC_QUOTE 
CONTRACT 
LEASE 
COMPANY_DOCUMENT 
OTHER 
 

<!-- Page 7 -->

7. CALCULATED_KPIS 
Les KPI calculés ne doivent pas être mélangés aux paramètres sources. 
Champ Type 
id UUID 
project_id UUID 
kpi_code TEXT 
value NUMERIC 
unit TEXT 
formula_version TEXT 
source_parameters JSONB 
calculated_at TIMESTAMP 
Exemples : 
PV_CAPACITY 
ANNUAL_PRODUCTION 
SELF_CONSUMPTION 
CLIENT_SAVINGS 
PROJECT_REVENUE 
OPERATING_MARGIN 
IRR 
NPV 
DSCR 
PAYBACK 
LCOE 
 
8. CERTAINTY_SCORES 
Champ Type 
id UUID 
project_id UUID 
certainty_score NUMERIC 

<!-- Page 8 -->

Champ Type 
data_confidence_score NUMERIC 
project_quality_score NUMERIC 
investment_readiness_score NUMERIC 
framework_version TEXT 
ruleset_version TEXT 
model_version TEXT 
calculated_at TIMESTAMP 
 
9. SCORE_COMPONENTS 
Permet d'expliquer exactement le score. 
Champ Type 
id UUID 
certainty_score_id UUID 
parameter_code TEXT 
raw_score NUMERIC 
confidence NUMERIC 
effective_score NUMERIC 
weight NUMERIC 
contribution NUMERIC 
reason_code TEXT 
explanation TEXT 
C'est cette table qui permettra au frontend d'afficher : 
Certainty : 82 
+12 grâce à la qualité des données énergie 
−6 en raison de l'incertitude raccordement 
−4 en raison de la contractualisation non finalisée 
 
10. RISK_ASSESSMENTS 

<!-- Page 9 -->

Champ Type 
id UUID 
project_id UUID 
global_risk_score NUMERIC 
technical_score NUMERIC 
contractual_score NUMERIC 
regulatory_score NUMERIC 
energy_grid_score NUMERIC 
systemic_score NUMERIC 
framework_version TEXT 
calculated_at TIMESTAMP 
 
11. RISK_FACTORS 
Champ Type 
id UUID 
assessment_id UUID 
risk_code TEXT 
exposure_score NUMERIC 
confidence NUMERIC 
severity TEXT 
evidence_id UUID 
status TEXT 
mitigation_action TEXT 
 
12. RESILIENCE_ASSESSMENTS 
Champ Type 
id UUID 

<!-- Page 10 -->

Champ Type 
project_id UUID 
resilience_score NUMERIC 
local_production_score NUMERIC 
self_consumption_score NUMERIC 
grid_dependency_score NUMERIC 
autonomy_score NUMERIC 
storage_score NUMERIC 
backup_score NUMERIC 
critical_load_score NUMERIC 
diversification_score NUMERIC 
calculated_at TIMESTAMP 
 
13. ACTIONS 
Champ Type 
id UUID 
project_id UUID 
action_code TEXT 
title TEXT 
description TEXT 
priority INTEGER 
estimated_cost NUMERIC 
estimated_delay INTEGER 
current_risk NUMERIC 
potential_risk NUMERIC 
risk_delta NUMERIC 
current_certainty NUMERIC 

<!-- Page 11 -->

Champ Type 
potential_certainty NUMERIC 
certainty_delta NUMERIC 
resilience_delta NUMERIC 
status TEXT 
assigned_to UUID 
created_at TIMESTAMP 
completed_at TIMESTAMP 
 
14. SCENARIOS 
Champ Type 
id UUID 
project_id UUID 
scenario_type TEXT 
name TEXT 
assumptions JSONB 
kpis JSONB 
risk_score NUMERIC 
certainty_score NUMERIC 
resilience_score NUMERIC 
created_at TIMESTAMP 
Valeurs : 
BASE 
DEGRADED 
STRESS 
 
15. CONTRADICTIONS 
Table importante pour l'IA. 

<!-- Page 12 -->

Champ Type 
id UUID 
project_id UUID 
parameter_code TEXT 
evidence_a_id UUID 
evidence_b_id UUID 
value_a JSONB 
value_b JSONB 
severity TEXT 
explanation TEXT 
status TEXT 
resolved_by UUID 
resolved_at TIMESTAMP 
Exemple : 
B01 
 
Facture 2025 : 1 240 000 kWh 
Déclaration client : 980 000 kWh 
 
Severity : HIGH 
Status : OPEN 
 
16. VALIDATIONS 
Champ Type 
id UUID 
project_id UUID 
entity_type TEXT 
entity_id UUID 

<!-- Page 13 -->

Champ Type 
validation_type TEXT 
previous_status TEXT 
new_status TEXT 
validated_by UUID 
comment TEXT 
validated_at TIMESTAMP 
 
17. AUDIT_LOG 
Aucune modification critique ne doit disparaître. 
Champ Type 
id UUID 
project_id UUID 
entity_type TEXT 
entity_id UUID 
action TEXT 
old_value JSONB 
new_value JSONB 
reason TEXT 
user_id UUID 
timestamp TIMESTAMP 
 
18. RULESETS 
C'est ici que les règles métier doivent être externalisées. 
Champ Type 
id UUID 
ruleset_code TEXT 
version TEXT 

<!-- Page 14 -->

Champ Type 
status TEXT 
effective_from DATE 
effective_to DATE 
rules JSONB 
created_by UUID 
created_at TIMESTAMP 
Exemple : 
CERTAINTY_RULESET 
VERSION 1.0 
STATUS ACTIVE 
 
19. Structure JSON du Rule Engine 
Exemple simplifié : 
{ 
  "parameter_code": "A04" , 
  "name": "Facteur d'ombrage" , 
  "domain": "A" , 
  "importance": "REQUIRED" , 
  "scoring": [ 
    { 
      "max": 5, 
      "score": 95 
    }, 
    { 
      "max": 10, 
      "score": 85 
    }, 
    { 
      "max": 20, 

<!-- Page 15 -->

      "score": 70 
    }, 
    { 
      "max": 30, 
      "score": 50 
    }, 
    { 
      "min": 30, 
      "score": 30 
    } 
  ], 
  "reason_codes": { 
    "good": "LOW_SHADING" , 
    "bad": "HIGH_SHADING" 
  } 
} 
Le moteur lit le RuleSet au lieu de contenir les seuils directement dans le code. 
 
20. Architecture des fonctions 
Les Edge Functions principales seront : 
create-project 
upload-document 
process-document 
extract-parameters 
validate-parameters 
calculate-kpis 
calculate-certainty 
calculate-risk 
calculate-resilience 
generate-actions 
calculate-scenarios 

<!-- Page 16 -->

generate-investor-memo 
Une fonction supplémentaire : 
recalculate-project 
permet de recalculer l'ensemble du projet après modification d'une donnée. 
 
21. Pipeline de recalcul 
Lorsqu'une donnée change : 
Parameter updated 
        ↓ 
Evidence check 
        ↓ 
Contradiction check 
        ↓ 
KPI recalculation 
        ↓ 
Certainty recalculation 
        ↓ 
Risk recalculation 
        ↓ 
Resilience recalculation 
        ↓ 
Action recalculation 
        ↓ 
Project status recalculation 
        ↓ 
Audit log 
Le système ne doit jamais recalculer uniquement le score final sans recalculer les 
dépendances. 
 
22. Exemple de dépendance 
Modification : 

<!-- Page 17 -->

A05 Productible spécifique 
entraîne : 
A05 
 ↓ 
C03 Production 
 ↓ 
B07 Self-consumption 
 ↓ 
C06 Savings 
 ↓ 
C07 Revenue 
 ↓ 
C09 IRR 
 ↓ 
PQ 
 ↓ 
IR 
 ↓ 
CS 
 ↓ 
Risk 
 ↓ 
Actions 
Le moteur doit donc fonctionner comme un graphe de dépendances, et non comme une 
simple série de formulaires. 
 
23. API externe 
Architecture : 
External API 
     ↓ 
Connector 

<!-- Page 18 -->

     ↓ 
Normalization 
     ↓ 
Validation 
     ↓ 
Evidence 
     ↓ 
Parameter 
     ↓ 
Calculation 
Connecteurs MVP simulés : 
MockEnedisConnector 
MockCadastreConnector 
MockSolarConnector 
MockWeatherConnector 
MockCompanyConnector 
Ils seront ensuite remplacés progressivement par les connecteurs réels. 
Aucune clé API ne doit être exposée dans Lovable. 
 
24. RLS Supabase 
ADMIN 
Accès global. 
SOLARSHIFT 
Accès aux projets relevant de SolarShift. 
MANDATAIRE 
Accès uniquement : 
• à ses projets ; 
• à ses clients ; 
• aux documents correspondants. 
CLIENT 
Accès uniquement à ses propres projets et documents autorisés. 

<!-- Page 19 -->

EXPERT 
Accès aux projets qui lui sont attribués. 
INVESTOR 
Accès uniquement aux dossiers explicitement autorisés. 
 
25. Principe de sécurité 
Les règles critiques ne doivent pas être calculées dans React. 
Interdit : 
Frontend → score = ... 
Préférer : 
Frontend 
   ↓ 
Edge Function 
   ↓ 
Rule Engine 
   ↓ 
Supabase 
   ↓ 
Result 
Le frontend affiche le résultat ; il ne définit pas le résultat. 
 
26. Ce que Lovable devra faire 
Lovable doit principalement gérer : 
• navigation ; 
• formulaires ; 
• tableaux ; 
• dashboard ; 
• upload ; 
• affichage des scores ; 
• filtres ; 
• graphiques ; 

<!-- Page 20 -->

• gestion utilisateur ; 
• appels API ; 
• affichage des actions ; 
• génération/visualisation des mémos. 
Il ne doit pas inventer : 
• les paramètres ; 
• les poids ; 
• les seuils ; 
• les règles ; 
• les gates ; 
• les calculs financiers ; 
• les règles de statut. 
 
27. MVP réel 
Il n'est pas nécessaire d'implémenter les 60 paramètres dès le premier sprint. 
Sprint 1 
Infrastructure : 
• Auth ; 
• Projects ; 
• Clients ; 
• Documents ; 
• Parameters ; 
• Evidence ; 
• RuleSets ; 
• Audit. 
Sprint 2 
15–20 paramètres prioritaires : 
A02 
A05 
A06 
A07 

<!-- Page 21 -->

B01 
B03 
B07 
B08 
C01 
C03 
C04 
C06 
C09 
D01 
D06 
E04 
F02 
F03 
F06 
G01 
Sprint 3 
Moteurs : 
• KPI ; 
• Certainty ; 
• Risk ; 
• Resilience ; 
• Actions. 
Sprint 4 
Interface : 
• Portfolio ; 
• Project Cockpit ; 
• Data ; 
• Documents ; 
• Evidence ; 
• Scores ; 

<!-- Page 22 -->

• Risks ; 
• Actions ; 
• Scenarios. 
Sprint 5 
Investor Memo. 
 
28. Premier critère de réussite 
Le MVP doit réussir ce scénario : 
Adresse 
+ 
Client 
+ 
Quelques documents 
        ↓ 
Projet structuré 
        ↓ 
Extraction automatique 
        ↓ 
Preuves 
        ↓ 
Paramètres 
        ↓ 
KPI 
        ↓ 
Certainty 
        ↓ 
Risk 
        ↓ 
Resilience 
        ↓ 
Next Best Action 

<!-- Page 23 -->

        ↓ 
Investor Memo 
Si ce parcours fonctionne proprement, SolarShift possède déjà le cœur du produit. 
 
29. Principe architectural à verrouiller 
La hiérarchie devient : 
DATA 
→ EVIDENCE 
→ PARAMETERS 
→ CALCULATIONS 
→ SCORES 
→ RISKS 
→ ACTIONS 
→ DECISION 
et non : 
FORMULAIRE → SCORE 
Cette différence est fondamentale. 
Elle permet à SolarShift de conserver l'historique, d'expliquer chaque décision et, à terme, 
d'apprendre des résultats réels des projets.
