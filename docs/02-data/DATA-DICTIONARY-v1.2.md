# SolarShift â€” Data Dictionary v1.2

> Statut : rÃ©fÃ©rence mÃ©tier prÃ©-dÃ©veloppement.
>
> Source primaire : `docs/source/DATA-DICTIONARY-v1.2.pdf`. Cette transcription Markdown conserve le contenu mÃ©tier complet afin de le rendre consultable, diffable et exploitable dans le dÃ©pÃ´t.
<!-- Page 1 -->

SOLARSHIFT 
DATA DICTIONARY v1.2 
60 paramètres cœur du Project Qualification Engine 
Version : 1.2 
Statut : Référence métier — pré-développement 
Périmètre : Qualification, faisabilité, économie, Certainty, Risk, Resilience 
Nombre de paramètres cœur : 60 
 
1. PRINCIPES DU DATA MODEL 
Le Data Dictionary définit les données fondamentales nécessaires à la qualification d'un projet 
solaire B2B. 
Le principe architectural est : 
PROJECT → PARAMETERS → EVIDENCES → CALCULATIONS → SCORES → RISKS → ACTIONS 
Aucune donnée critique ne doit être utilisée dans un calcul important sans que le système 
puisse identifier : 
• sa valeur ; 
• son unité ; 
• sa source ; 
• sa date ; 
• son niveau de confiance ; 
• son statut de validation ; 
• son historique de modification. 
1.1 Types de sources 
Code Source 
API Donnée issue d'une API externe 
OFFICIAL_DOCUMENT Document officiel 
PROFESSIONAL_DOCUMENT Étude ou document professionnel 
MEASUREMENT Mesure directe 
CLIENT_DECLARATION Déclaration du client 
MANDATAIRE_DECLARATION Déclaration du mandataire 
EXPERT_VALIDATION Validation ou étude d'un expert 

<!-- Page 2 -->

Code Source 
AI_INFERENCE Inférence réalisée par l'IA 
CALCULATION Valeur calculée par SolarShift 
MOCK Donnée simulée pour développement 
OTHER Autre source 
1.2 Niveaux de confiance 
Niveau Score Signification 
L5 1,00 Source officielle, mesure directe ou contrat signé 
L4 0,90 Document fiable et récent 
L3 0,75 Étude ou modèle professionnel 
L2 0,55 Déclaration client ou mandataire 
L1 0,35 Inférence IA ou donnée indirecte 
L0 0,00 Donnée inconnue 
Principe : une donnée inconnue ne signifie pas nécessairement que le projet est mauvais. Elle 
diminue principalement le niveau de certitude. 
 
2. STATUTS DES DONNÉES 
Chaque paramètre possède un statut de validation : 
• MISSING 
• PROVISIONAL 
• PENDING_VALIDATION 
• VALIDATED 
• REJECTED 
• OVERRIDDEN 
Une donnée OVERRIDDEN doit conserver sa valeur précédente, son auteur, sa date et son motif 
dans l'Audit Log. 
 
3. NIVEAUX D'IMPORTANCE 
Chaque paramètre est classé selon son importance dans le workflow. 
CRITICAL 

<!-- Page 3 -->

Donnée indispensable pour qu'un projet puisse atteindre certains niveaux de maturité ou passer 
certains Critical Gates. 
REQUIRED 
Donnée nécessaire pour obtenir une qualification complète. 
PROGRESSIVE 
Donnée pouvant être complétée au cours de l'instruction du projet. 
 
A — SITE & POTENTIEL SOLAIRE 
9 paramètres 
A01 — Surface totale du site 
Définition : surface totale pertinente du bâtiment/site concerné par le projet. 
• Type : numérique 
• Unité : m² 
• Sources : API, document, déclaration client/mandataire 
• Importance : REQUIRED 
• Validation : documentaire ou humaine 
• Moteurs : Project Quality, Certainty 
• Peut être calculé : non, sauf rapprochement cadastral/documentaire 
 
A02 — Surface exploitable PV 
Définition : surface réellement disponible pour l'installation photovoltaïque après exclusion des 
zones non exploitables. 
• Type : numérique 
• Unité : m² 
• Sources : plan, étude technique, expertise, IA avec validation 
• Importance : CRITICAL 
• Validation : EXPERT ou SOLARSHIFT 
• Moteurs : Economics, Certainty, Risk 
• Peut être calculé : partiellement 
 
A03 — Orientation + géométrie toiture 

<!-- Page 4 -->

Définition : orientation, inclinaison, géométrie et configuration de la toiture utiles au 
dimensionnement PV . 
• Type : structuré / JSON 
• Unité : degrés / géométrie 
• Sources : plan, étude, mesure, modèle géospatial 
• Importance : REQUIRED 
• Validation : EXPERT 
• Moteurs : Solar Potential, Economics, Certainty 
• Peut être calculé : partiellement 
 
A04 — Facteur d'ombrage 
Définition : impact estimé des ombres sur le productible photovoltaïque. 
• Type : numérique 
• Unité : % 
• Sources : étude solaire, modèle géospatial, expertise 
• Importance : REQUIRED 
• Validation : EXPERT ou méthode documentée 
• Moteurs : Production, Economics, Certainty 
 
A05 — Productible spécifique 
Définition : production annuelle estimée par kWc installé. 
• Type : numérique 
• Unité : kWh/kWc/an 
• Sources : API solaire, données météorologiques, étude professionnelle 
• Importance : CRITICAL 
• Validation : méthode documentée 
• Moteurs : Economics, Certainty, Scenarios 
 
A06 — État de la toiture 
Définition : appréciation de l'état technique de la toiture et de sa compatibilité avec une 
installation PV . 
• Type : score 0–100 + commentaire 

<!-- Page 5 -->

• Unité : score 
• Sources : inspection, diagnostic, expertise, document 
• Importance : CRITICAL 
• Validation : EXPERT 
• Moteurs : Certainty, Risk 
• Critical Gate potentiel : oui 
 
A07 — Durée de vie résiduelle toiture 
Définition : durée estimée avant rénovation ou remplacement significatif de la toiture. 
• Type : numérique 
• Unité : années 
• Sources : diagnostic, expertise, historique travaux 
• Importance : CRITICAL 
• Validation : EXPERT 
• Moteurs : Risk, Economics, Certainty 
 
A08 — Accessibilité du site 
Définition : facilité d'accès du site pour les travaux, équipements, maintenance et 
interventions. 
• Type : score 0–100 + commentaire 
• Unité : score 
• Sources : visite, photos, plans, mandataire 
• Importance : REQUIRED 
• Validation : MANDATAIRE / EXPERT 
• Moteurs : Technical Risk, Certainty 
 
A09 — Cohérence surface ↔ puissance PV 
Définition : cohérence entre la surface exploitable, la technologie retenue et la puissance PV 
proposée. 
• Type : score 0–100 
• Unité : score 
• Source : CALCULATION 

<!-- Page 6 -->

• Importance : CRITICAL 
• Validation : automatique 
• Moteurs : Certainty, Economics 
 
B — CONSOMMATION & ADÉQUATION ÉNERGÉTIQUE 
9 paramètres 
B01 — Consommation annuelle 
• Définition : consommation électrique annuelle du site. 
• Type : numérique 
• Unité : kWh/an 
• Sources : API, historique, factures 
• Importance : CRITICAL 
• Validation : obligatoire 
• Moteurs : Economics, Certainty, Risk 
 
B02 — Historique de consommation 
• Définition : profondeur et qualité de l'historique disponible. 
• Type : structuré 
• Unité : années / qualité 
• Sources : API, factures 
• Importance : REQUIRED 
• Validation : automatique + humaine si nécessaire 
• Moteurs : Certainty, Energy Risk 
 
B03 — Profil de charge 
• Définition : répartition temporelle de la consommation. 
• Type : structuré 
• Unité : courbe / kWh par pas de temps 
• Sources : API, compteur, historique 
• Importance : CRITICAL 
• Validation : automatique 

<!-- Page 7 -->

• Moteurs : Economics, Certainty, Resilience 
 
B04 — Part de consommation diurne 
• Définition : proportion de la consommation intervenant pendant les périodes de 
production solaire. 
• Type : numérique 
• Unité : % 
• Sources : CALCULATION/API 
• Importance : REQUIRED 
• Validation : automatique 
• Moteurs : Economics, Certainty 
 
B05 — Saisonnalité 
• Définition : degré de variation de la consommation selon les saisons. 
• Type : score 0–100 + données sous-jacentes 
• Unité : score 
• Sources : historique / calcul 
• Importance : REQUIRED 
• Moteurs : Economics, Scenarios, Certainty 
 
B06 — Puissance souscrite / appelée 
• Définition : puissance souscrite et puissance maximale effectivement appelée. 
• Type : structuré 
• Unité : kVA 
• Sources : API, facture 
• Importance : REQUIRED 
• Moteurs : Technical, Economics, Grid 
 
B07 — Taux d'autoconsommation 
• Définition : part de la production PV consommée localement. 
• Type : numérique 

<!-- Page 8 -->

• Unité : % 
• Source : CALCULATION 
• Importance : CRITICAL 
• Moteurs : Economics, Resilience, Certainty 
 
B08 — Adéquation charge / PV 
• Définition : adéquation entre le profil de consommation et le profil de production 
photovoltaïque. 
• Type : score 0–100 
• Source : CALCULATION 
• Importance : CRITICAL 
• Moteurs : Economics, Certainty, Resilience 
 
B09 — Stabilité de la consommation 
• Définition : stabilité historique de la consommation et des facteurs d'activité. 
• Type : score 0–100 
• Sources : historique, données client 
• Importance : REQUIRED 
• Moteurs : Risk, Certainty, Economics 
 
C — ÉCONOMIE DU PROJET 
9 paramètres 
C01 — CAPEX total 
• Type : numérique 
• Unité : € 
• Sources : devis EPC, estimation professionnelle 
• Importance : CRITICAL 
• Validation : REQUIRED 
• Moteurs : Economics, IRR, Risk, Certainty 
 
C02 — CAPEX spécifique 

<!-- Page 9 -->

• Type : numérique 
• Unité : €/kWc 
• Source : CALCULATION 
• Importance : REQUIRED 
• Moteurs : Economics, Certainty 
 
C03 — Production annuelle 
• Type : numérique 
• Unité : kWh/an 
• Sources : CALCULATION 
• Importance : CRITICAL 
• Moteurs : Economics, Scenarios, Risk 
 
C04 — Prix électricité réseau 
• Type : numérique 
• Unité : €/kWh 
• Sources : contrat, facture, données marché 
• Importance : CRITICAL 
• Moteurs : Economics, Scenarios, Risk 
 
C05 — Prix de vente solaire 
• Type : numérique 
• Unité : €/kWh 
• Sources : hypothèse contractuelle / modèle économique 
• Importance : CRITICAL 
• Validation : SOLARSHIFT 
• Moteurs : Economics, IRR 
 
C06 — Économie annuelle client 
• Type : numérique 
• Unité : €/an 

<!-- Page 10 -->

• Source : CALCULATION 
• Importance : CRITICAL 
• Moteurs : Economics, Commercial Qualification 
 
C07 — Chiffre d'affaires projet 
• Type : numérique 
• Unité : €/an 
• Source : CALCULATION 
• Importance : REQUIRED 
• Moteurs : Economics, Investor Memo 
 
C08 — OPEX projet 
• Type : numérique 
• Unité : €/an 
• Sources : devis, hypothèses professionnelles 
• Importance : REQUIRED 
• Moteurs : Economics, IRR, Risk 
 
C09 — TRI investisseur 
• Type : numérique 
• Unité : % 
• Source : CALCULATION 
• Importance : CRITICAL 
• Moteurs : Investment Readiness, Investor Memo 
KPI économiques dérivés 
Ne font pas partie des 60 paramètres cœur : 
• VAN ; 
• DSCR ; 
• Payback ; 
• marge opérationnelle ; 
• coût actualisé de l'énergie ; 

<!-- Page 11 -->

• sensibilité CAPEX ; 
• sensibilité production ; 
• sensibilité prix énergie ; 
• TRI par scénario. 
 
D — URBANISME & RÉGLEMENTATION 
6 paramètres 
D01 — Compatibilité urbanistique 
• Type : statut + score 
• Sources : documents d'urbanisme, instruction professionnelle 
• Importance : CRITICAL 
• Validation : EXPERT / SOLARSHIFT 
• Critical Gate : oui 
 
D02 — Destination du bâtiment 
• Type : ENUM / texte 
• Sources : documents officiels, client 
• Importance : REQUIRED 
• Moteurs : Regulatory, Risk, Certainty 
 
D03 — Protection patrimoniale / contraintes ABF 
• Type : statut + score 
• Sources : données réglementaires, urbanisme, expertise 
• Importance : CRITICAL 
• Validation : humaine 
• Moteurs : Risk, Certainty 
 
D04 — Parcours d'autorisation 
Valeurs possibles : 
• UNKNOWN 
• NONE 

<!-- Page 12 -->

• DECLARATION 
• PERMIT 
• SPECIFIC_AUTHORIZATION 
• MULTIPLE_AUTHORIZATIONS 
• Importance : REQUIRED 
• Moteurs : Execution, Risk, Certainty 
 
D05 — Contraintes environnementales 
• Type : score + liste de contraintes 
• Sources : données officielles, études 
• Importance : REQUIRED 
• Moteurs : Risk, Certainty 
 
D06 — Validation réglementaire 
Valeurs : 
• UNKNOWN 
• IN_PROGRESS 
• VALIDATED 
• REJECTED 
• Importance : CRITICAL 
• Validation : humaine 
• Critical Gate : oui 
 
E — RÉSEAU & RACCORDEMENT 
7 paramètres 
E01 — Point et type de raccordement 
• Type : structuré 
• Unité : — 
• Sources : API, documents réseau 
• Importance : CRITICAL 
• Moteurs : Grid Risk, Certainty 

<!-- Page 13 -->

 
E02 — Puissance de raccordement requise 
• Type : numérique 
• Unité : kVA / kW 
• Sources : calcul / étude 
• Importance : CRITICAL 
 
E03 — Distance / complexité réseau 
• Type : score 0–100 
• Sources : données réseau, géospatial 
• Importance : REQUIRED 
• Moteurs : Risk, Certainty 
 
E04 — Faisabilité réseau 
• Type : statut + score 
• Valeurs : 
UNKNOWN / POSSIBLE / CONDITIONAL / IMPOSSIBLE 
• Importance : CRITICAL 
• Critical Gate : oui 
 
E05 — État de l'étude de raccordement 
• Type : ENUM 
• Valeurs : 
NOT_STARTED / REQUESTED / IN_PROGRESS / RECEIVED / VALIDATED 
• Importance : REQUIRED 
 
E06 — Coût de raccordement 
• Type : numérique 
• Unité : € 
• Sources : étude réseau / estimation 
• Importance : CRITICAL 

<!-- Page 14 -->

• Moteurs : Economics, Risk 
 
E07 — Délai de raccordement 
• Type : numérique 
• Unité : jours 
• Sources : étude / estimation 
• Importance : REQUIRED 
• Moteurs : Execution Risk, Scenarios 
 
F — CLIENT & CONTRACTUALISATION 
7 paramètres 
F01 — Identité juridique client 
• Type : structuré 
• Sources : SIRENE, Kbis, document 
• Importance : CRITICAL 
• Moteurs : Contractual Risk 
 
F02 — Propriétaire / occupant / relation au site 
• Type : structuré 
• Sources : titre, bail, documents, déclarations 
• Importance : CRITICAL 
• Critical Gate : oui 
Le système doit identifier : 
• propriétaire ; 
• occupant ; 
• relation contractuelle ; 
• droit d'installer ; 
• durée du droit. 
 
F03 — Qualité de crédit client 
• Type : score 0–100 

<!-- Page 15 -->

• Sources : données financières disponibles, documents, analyses 
• Importance : CRITICAL 
• Moteurs : Contractual Risk, Certainty 
 
F04 — Stabilité de l'activité 
• Type : score 0–100 
• Sources : historique, secteur, données client 
• Importance : REQUIRED 
• Moteurs : Risk, Certainty 
 
F05 — Décideur identifié 
• Type : booléen + identité/rôle 
• Importance : REQUIRED 
• Source : client/mandataire 
• Moteurs : Commercial Maturity, Certainty 
 
F06 — Engagement commercial 
Valeurs : 
LEAD / INTERESTED / QUALIFIED / COMMITTED / SIGNED 
• Importance : CRITICAL 
• Moteurs : Investment Readiness, Certainty 
 
F07 — Compatibilité durée contractuelle 
• Type : score + statut 
• Unité : années 
• Sources : projet / contrat 
• Importance : CRITICAL 
• Critical Gate : oui 
• Moteurs : Contractual Risk, IRR, Certainty 
 
G — TECHNIQUE & EXÉCUTION 

<!-- Page 16 -->

6 paramètres 
G01 — Faisabilité structurelle 
• Type : score + statut 
• Sources : étude structure, expertise 
• Importance : CRITICAL 
• Critical Gate : oui 
• Moteurs : Technical Risk, Certainty 
Valeurs : 
UNKNOWN / POSSIBLE / CONDITIONAL / IMPOSSIBLE 
 
G02 — Compatibilité électrique 
• Type : score 0–100 
• Sources : étude électrique, documents techniques 
• Importance : CRITICAL 
• Moteurs : Technical Risk, Grid Risk 
 
G03 — Accès / travaux préparatoires 
• Type : score 0–100 
• Sources : visite, photos, expertise 
• Importance : REQUIRED 
• Moteurs : Execution Risk 
 
G04 — Complexité installation 
• Type : score 0–100 
• Sources : étude / expertise 
• Importance : REQUIRED 
• Moteurs : Technical Risk, CAPEX 
 
G05 — Qualité du devis EPC 
• Type : score 0–100 
• Sources : devis / analyse 

<!-- Page 17 -->

• Importance : REQUIRED 
• Moteurs : Economics, Risk, Certainty 
 
G06 — Risque d'exécution 
• Type : score 0–100 
• Sources : CALCULATION + analyse 
• Importance : REQUIRED 
• Moteurs : Risk, Certainty 
 
H — DONNÉES & DOCUMENTATION 
7 paramètres 
H01 — Complétude documentaire 
• Type : % 
• Source : CALCULATION 
• Importance : REQUIRED 
• Moteurs : Data Confidence, Certainty 
 
H02 — Qualité des sources 
• Type : score 0–100 
• Source : CALCULATION 
• Importance : REQUIRED 
• Moteurs : Data Confidence 
 
H03 — Fraîcheur des données 
• Type : score 0–100 
• Source : CALCULATION 
• Importance : REQUIRED 
• Moteurs : Data Confidence, Risk 
 
H04 — Cohérence inter-documents 
• Type : score 0–100 

<!-- Page 18 -->

• Source : AI + CALCULATION 
• Importance : CRITICAL 
• Moteurs : Data Confidence, Certainty 
 
H05 — Traçabilité des hypothèses 
• Type : score 0–100 
• Source : CALCULATION 
• Importance : REQUIRED 
• Moteurs : Data Confidence, Certainty 
 
H06 — Taux de validation humaine 
• Type : % 
• Source : CALCULATION 
• Importance : REQUIRED 
• Moteurs : Data Confidence 
 
H07 — Couverture des preuves 
• Type : % 
• Source : CALCULATION 
• Importance : CRITICAL 
• Moteurs : Data Confidence, Certainty 
 
4. PARAMÈTRES DÉRIVÉS 
Les indicateurs suivants ne sont pas des paramètres cœur. 
Ils sont calculés par les moteurs à partir des 60 paramètres. 
Solar / Energy 
• puissance PV ; 
• production ; 
• autoconsommation ; 
• énergie injectée ; 
• taux d'autoconsommation ; 

<!-- Page 19 -->

• taux de couverture ; 
• adéquation charge/PV . 
Economics 
• CAPEX/kWc ; 
• économies client ; 
• chiffre d'affaires ; 
• OPEX ; 
• marge ; 
• VAN ; 
• TRI ; 
• DSCR ; 
• Payback. 
Data 
• complétude ; 
• fraîcheur ; 
• cohérence ; 
• couverture des preuves ; 
• confiance globale. 
Decision 
• Certainty Score ; 
• Project Quality ; 
• Investment Readiness ; 
• Risk Score ; 
• Resilience Score ; 
• Action Priority ; 
• Score Delta. 
 
5. RÈGLE FONDAMENTALE : PARAMÈTRE ≠ SCORE 
Un paramètre représente une information sur le projet. 
Un score représente une interprétation calculée à partir de cette information. 
Exemple : 

<!-- Page 20 -->

A06 État toiture 
Valeur : 72/100 
Source : étude structure 
Confidence : L4 
Validation : VALIDATED 
Puis : 
Technical Risk 
↓ 
Risk Factor 
↓ 
Risk Domain 
↓ 
Global Risk 
La valeur initiale ne doit jamais être écrasée par le score. 
 
6. RÈGLE FONDAMENTALE : UNKNOWN ≠ BAD 
Une donnée inconnue doit être traitée comme une incertitude, pas comme une mauvaise 
valeur. 
Exemple : 
G01 Structure = UNKNOWN 
ne signifie pas : 
Structure = 0/100 
Cela signifie : 
Structure non vérifiée 
↓ 
Confidence faible 
↓ 
Certainty réduite 
↓ 
Action recommandée 
Une incompatibilité structurelle avérée, en revanche, peut déclencher un Critical Gate. 

<!-- Page 21 -->

 
7. EVIDENCE REQUIREMENT 
Chaque paramètre critique doit pouvoir être relié à une ou plusieurs preuves. 
Structure : 
PROJECT 
   ↓ 
PARAMETER 
   ↓ 
EVIDENCE 
   ↓ 
DOCUMENT / API / MEASUREMENT / SOURCE 
Une Evidence doit idéalement conserver : 
• valeur extraite ; 
• source ; 
• document ; 
• page ; 
• date ; 
• extrait ; 
• méthode d'extraction ; 
• confiance ; 
• validation. 
 
8. VERSIONING 
Chaque donnée importante doit être versionnée. 
Chaque calcul de score doit conserver : 
• framework_version 
• ruleset_version 
• model_version 
• data_snapshot_date 
• calculation_timestamp 
L'objectif est de pouvoir reproduire exactement le calcul d'un score historique. 

<!-- Page 22 -->

 
9. RESPONSABILITÉ DE LA DONNÉE 
Le système distingue les rôles : 
IA 
• extraction ; 
• classification ; 
• rapprochement ; 
• détection de contradiction ; 
• proposition ; 
• explication. 
Moteur déterministe 
• calcul ; 
• scoring ; 
• pondération ; 
• Critical Gates ; 
• versioning ; 
• audit. 
Mandataire 
• collecte ; 
• information terrain ; 
• relation client ; 
• validation de certaines données commerciales. 
Expert 
• validation technique ; 
• structure ; 
• électrique ; 
• urbanisme selon compétence. 
SolarShift 
• validation métier ; 
• règles ; 
• qualification ; 

<!-- Page 23 -->

• arbitrage. 
Client 
• données de son activité ; 
• documents ; 
• informations contractuelles. 
 
10. SYNTHÈSE DES 60 PARAMÈTRES 
Domaine Nombre 
A — Site & solaire 9 
B — Consommation & énergie 9 
C — Économie 9 
D — Urbanisme & réglementation 6 
E — Réseau 7 
F — Client & contrat 7 
G — Technique & exécution 6 
H — Données & documentation 7 
TOTAL 60 
 
11. ARCHITECTURE FINALE 
Les 60 paramètres constituent le socle de données métier. 
Ils alimentent ensuite : 
                 60 PARAMÈTRES 
                       │ 
                       ▼ 
               CALCULATION ENGINE 
                       │ 
          ┌────────────┼────────────┐ 
          ▼            ▼            ▼ 
       ECONOMICS    CERTAINTY      RISK 
          │            │            │ 

<!-- Page 24 -->

          │            │            ▼ 
          │            │       RESILIENCE 
          │            │            │ 
          └────────────┼────────────┘ 
                       ▼ 
                 DECISION ENGINE 
                       │ 
                       ▼ 
                 NEXT BEST ACTION 
                       │ 
              ┌────────┴────────┐ 
              ▼                 ▼ 
       PROJECT COCKPIT    INVESTOR MEMO 
Statut du document : DATA DICTIONARY v1.2 — BASE MÉTIER VALIDÉE POUR LA PHASE DE 
CONCEPTION DES RÈGLES.
