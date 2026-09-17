# SolarShift â€” Risk & Resilience Engineâ„¢ v1.0

> Source primaire : `docs/source/RISK-RESILIENCE-ENGINE.pdf`. Cette transcription Markdown conserve la spÃ©cification fonctionnelle v1.0 complÃ¨te.
<!-- Page 1 -->

SOLARSHIFT — RISK & RESILIENCE ENGINE™ 
Spécification fonctionnelle v1.0 
1. Finalité 
Le Risk & Resilience Engine complète le Certainty Engine sans le remplacer. 
Il répond à deux questions distinctes : 
Risk Engine 
À quels risques le projet et l'actif sont-ils exposés pendant leur durée de vie ? 
Resilience Engine 
Dans quelle mesure le projet contribue-t-il à réduire certaines vulnérabilités énergétiques 
du client ? 
Le système ne cherche pas à prédire les événements rares ni à attribuer une probabilité 
arbitraire à une guerre, une catastrophe ou une crise géopolitique. 
Il mesure des facteurs d'exposition objectivement documentables, leur criticité, leurs 
interactions et les mesures de mitigation disponibles. 
 
2. Séparation avec le Certainty Engine 
Moteur Question Nature 
Certainty Peut-on réaliser et financer le projet avec suffisamment 
de certitude ? Certitude 
Quality Quelle est la qualité intrinsèque du projet ? Performance 
Investment 
Readiness Le projet est-il suffisamment mature pour être financé ? Maturité 
Risk À quels risques le projet est-il exposé ? Exposition 
Resilience Quelle robustesse énergétique apporte-t-il ? Contribution 
Decision Quelle action faut-il entreprendre maintenant ? Action 
Aucun de ces indicateurs ne doit être fusionné en un score unique. 
 
3. Risk Dictionary 
Le moteur conserve 25 paramètres principaux. 
R1 — Risque technique 

<!-- Page 2 -->

ID Paramètre Description 
R01 Structural Risk Risque lié à la capacité structurelle du bâtiment 
R02 Roof Condition Risk Risque lié à l'état et à la durabilité de la toiture 
R03 Electrical Risk Risque lié à l'installation électrique existante 
R04 Installation Complexity Complexité technique du chantier 
R05 Maintenance 
Dependency 
Niveau de dépendance à des opérations de maintenance 
spécifiques 
R2 — Risque contractuel 
ID Paramètre Description 
R06 Client Credit Risk Risque de solvabilité de la contrepartie 
R07 Contract Duration Risk Compatibilité entre durée contractuelle et durée 
économique de l'actif 
R08 Occupancy Risk Stabilité de l'occupation du site 
R09 Counterparty 
Concentration Concentration de l'exposition sur une contrepartie 
R10 Contract Termination 
Exposure Exposition à une résiliation anticipée 
R3 — Risque réglementaire 
ID Paramètre Description 
R11 Planning / Regulatory 
Exposure Exposition aux contraintes réglementaires identifiées 
R12 Regulatory Change Exposure Sensibilité du modèle à une évolution réglementaire 
R13 Authorization Dependency Dépendance à une autorisation ou procédure 
administrative 
R4 — Risque énergie / réseau 
ID Paramètre Description 
R14 Grid Dependency Dépendance énergétique au réseau 
R15 Grid Single Point of Failure Dépendance à un point unique critique 
R16 Connection Risk Risque associé au raccordement 
R17 Energy Price Exposure Sensibilité économique aux prix de l'électricité 

<!-- Page 3 -->

ID Paramètre Description 
R18 Production Variability Sensibilité à la variabilité de production 
R5 — Risque systémique 
ID Paramètre Description 
R19 Critical Infrastructure Proximity Proximité d'infrastructures sensibles 
R20 Geographic Concentration Concentration géographique des actifs 
R21 Supplier Dependency Dépendance à certains fournisseurs 
R22 Component Dependency Dépendance à certains composants ou technologies 
R23 Climate Exposure Exposition aux risques climatiques 
R24 Portfolio Correlation Corrélation des risques entre plusieurs actifs 
R25 External Dependency Dépendances externes critiques 
 
4. Échelle individuelle de risque 
Chaque paramètre reçoit un Risk Exposure Score de 0 à 100. 
Score Niveau 
0–20 Très faible 
21–40 Faible 
41–60 Modéré 
61–80 Élevé 
81–100 Très élevé 
Le score mesure l'exposition, et non la probabilité qu'un événement survienne. 
Exemple : 
Proximité d'une infrastructure sensible = exposition élevée 
ne signifie pas : 
probabilité élevée d'attaque. 
Cette distinction doit être conservée dans toute l'interface et tous les rapports. 
 
5. Niveau de confiance 
Chaque Risk Score est accompagné d'un niveau de confiance. 

<!-- Page 4 -->

Même échelle que le Certainty Engine : 
Niveau Origine Confidence 
L5 donnée officielle / mesure directe / contrat 1,00 
L4 document fiable et récent 0,90 
L3 étude professionnelle / modèle 0,75 
L2 déclaration client / mandataire 0,55 
L1 inférence indirecte IA 0,35 
L0 inconnue 0 
Le système affiche donc : 
Risk Exposure : 72/100 
Confidence : 0,90 
et non simplement « risque 72 ». 
 
6. Calcul du Risk Score 
Pondération initiale : 
Domaine Poids 
Technique 20 % 
Contractuel 20 % 
Réglementaire 15 % 
Énergie / réseau 25 % 
Systémique 20 % 
Total 100 % 
Chaque domaine est calculé comme une moyenne pondérée des paramètres disponibles. 
Les paramètres inconnus ne reçoivent pas automatiquement un score de risque nul. 
Ils génèrent une réduction de confiance et éventuellement une action de collecte 
d'information. 
Formule conceptuelle 
Domain Risk = Σ(Risk_i × Weight_i × Confidence_i) / Σ(Weight_i × Confidence_i) 
Puis : 
Global Risk = Σ(Domain Risk × Domain Weight) 

<!-- Page 5 -->

Le système conserve simultanément : 
• score brut ; 
• score ajusté par confiance ; 
• couverture des données ; 
• paramètres inconnus ; 
• paramètres critiques non validés. 
 
7. Risk Amplifiers 
Certains risques deviennent significativement plus importants lorsqu'ils sont combinés. 
Le moteur doit donc détecter des Risk Patterns. 
Exemple 1 — dépendance réseau 
Grid Dependency élevée 
+ 
Single Point of Failure élevé 
+ 
Absence de Backup 
= 
Risk Amplifier 
Exemple 2 — risque contractuel 
Client Credit Risk élevé 
+ 
Contract Duration longue 
+ 
Absence de garantie 
= 
Contractual Exposure renforcée 
Exemple 3 — toiture 
Roof Condition Risk élevé 
+ 
Roof Remaining Life faible 
+ 

<!-- Page 6 -->

Installation PV longue durée 
= 
Technical Lifecycle Risk renforcé 
Exemple 4 — portefeuille 
Forte concentration géographique 
+ 
Actifs exposés au même événement climatique 
= 
Portfolio Correlation Risk 
Les amplificateurs doivent être déterministes et documentés. 
Ils ne doivent pas être produits uniquement par un LLM. 
 
8. Risk Gates 
Certaines situations nécessitent une alerte spécifique indépendamment du score global. 
Exemples : 
CRITICAL_STRUCTURAL_RISK 
CRITICAL_CONTRACTUAL_EXPOSURE 
CRITICAL_GRID_DEPENDENCY 
CRITICAL_REGULATORY_EXPOSURE 
CRITICAL_COUNTERPARTY 
CRITICAL_INFRASTRUCTURE_EXPOSURE 
CRITICAL_CLIMATE_EXPOSURE 
Un Risk Gate ne signifie pas nécessairement « projet rejeté ». 
Il signifie : 
Human Review Required 
L'utilisateur doit pouvoir voir : 
• le facteur déclencheur ; 
• la preuve ; 
• la date ; 
• le niveau de confiance ; 
• la règle déclenchée ; 

<!-- Page 7 -->

• l'action recommandée. 
 
9. Temporal Risk Engine 
Le risque doit être analysé sur la durée de vie du projet. 
Le système pourra produire trois horizons : 
T0 — Développement 
Risques liés à : 
• autorisations ; 
• raccordement ; 
• structure ; 
• contractualisation ; 
• financement. 
T1 — Exploitation 
Risques liés à : 
• production ; 
• maintenance ; 
• client ; 
• prix de l'énergie ; 
• équipements. 
T2 — Long terme 
Risques liés à : 
• vieillissement ; 
• remplacement des composants ; 
• évolution réglementaire ; 
• évolution du site ; 
• concentration du portefeuille ; 
• dépendances fournisseurs. 
L'objectif n'est pas de prédire précisément le futur mais d'identifier les risques dont 
l'exposition augmente avec le temps. 
 
10. Scenario Engine 

<!-- Page 8 -->

Trois scénarios standards : 
BASE 
Hypothèses actuelles. 
DÉGRADÉ 
Hypothèses défavorables mais plausibles sur les variables sensibles. 
Exemples : 
• production inférieure ; 
• CAPEX supérieur ; 
• prix énergétique moins favorable ; 
• retard de raccordement ; 
• durée d'exploitation réduite. 
STRESS 
Combinaison de plusieurs facteurs défavorables. 
Le scénario Stress ne doit pas être présenté comme une prévision. 
Il sert à tester : 
« Que devient le projet si plusieurs hypothèses importantes se dégradent simultanément ? 
» 
 
11. Resilience Dictionary 
Le Resilience Engine utilise 12 paramètres. 
ID Paramètre 
RES01 Local Energy Production 
RES02 Self-Consumption Level 
RES03 Grid Dependency Reduction 
RES04 Energy Autonomy Potential 
RES05 Storage Capability 
RES06 Backup Capability 
RES07 Islanding Capability 
RES08 Critical Load Coverage 
RES09 Multi-Source Capability 

<!-- Page 9 -->

ID Paramètre 
RES10 Geographic Diversification 
RES11 Operational Continuity 
RES12 Resilience Scalability 
 
12. Resilience Score 
Score de 0 à 100. 
Pondération initiale : 
Domaine Poids 
Production locale 15 % 
Autoconsommation 15 % 
Réduction dépendance réseau 15 % 
Autonomie potentielle 10 % 
Stockage 10 % 
Backup / secours 15 % 
Charges critiques 10 % 
Diversification / extensibilité 10 % 
Le score doit rester indépendant du Risk Score. 
Un projet peut présenter : 
• faible risque ; 
• faible résilience ; 
ou : 
• risque élevé ; 
• forte contribution potentielle à la résilience. 
 
13. Distinction essentielle : solaire ≠ secours 
Le moteur doit explicitement distinguer : 
Production locale 
de 

<!-- Page 10 -->

Continuité électrique en cas de coupure réseau. 
Une installation PV classique raccordée au réseau peut produire de l'électricité localement 
sans pour autant maintenir les équipements du bâtiment en fonctionnement lors d'une 
coupure. 
Pour obtenir une véritable capacité de secours, le système doit identifier les équipements 
nécessaires : 
• stockage ; 
• onduleur compatible ; 
• protection réseau ; 
• architecture de secours ; 
• éventuel îlotage ; 
• charges prioritaires. 
Cette distinction devra apparaître dans l'Investor Memo. 
 
14. Resilience Actions 
Le moteur identifie les actions pouvant augmenter la résilience. 
Exemples : 
ADD_STORAGE 
BACKUP_ARCHITECTURE 
CRITICAL_LOAD_MAPPING 
GRID_DIVERSIFICATION 
TECHNICAL_REDUNDANCY 
SUPPLIER_DIVERSIFICATION 
Chaque action possède : 
• coût estimatif ; 
• complexité ; 
• délai ; 
• gain potentiel de résilience ; 
• réduction potentielle du risque ; 
• gain éventuel de Certainty Score. 
 
15. Decision Engine 

<!-- Page 11 -->

Le Risk & Resilience Engine transmet ses résultats au Decision Engine. 
Celui-ci recherche les actions ayant le meilleur rapport : 
Risk Reduction / Cost / Time 
Exemple : 
ACTION 
Pré-étude raccordement 
 
Risk actuel        58 
Risk potentiel     43 
Delta Risk         -15 
 
Certainty actuel   72 
Certainty potentiel 80 
 
Coût               faible 
Délai              court 
 
PRIORITÉ            élevée 
Le système ne recommande donc pas seulement « réduire le risque ». 
Il indique comment le réduire. 
 
16. Architecture IA / déterministe 
IA 
L'IA peut : 
• lire les documents ; 
• identifier les facteurs de risque ; 
• extraire les données ; 
• détecter des contradictions ; 
• proposer des facteurs d'exposition ; 
• expliquer les risques ; 
• proposer des actions. 

<!-- Page 12 -->

Moteur déterministe 
Le moteur logiciel doit : 
• calculer les scores ; 
• appliquer les pondérations ; 
• appliquer les Risk Gates ; 
• appliquer les Risk Amplifiers ; 
• gérer les scénarios ; 
• gérer les versions ; 
• conserver l'audit trail. 
L'IA ne doit jamais pouvoir modifier silencieusement une règle de scoring. 
 
17. Evidence Layer 
Chaque risque doit pouvoir être remonté à sa preuve. 
Structure minimale : 
RISK 
  ↓ 
PARAMETER 
  ↓ 
VALUE 
  ↓ 
EVIDENCE 
  ↓ 
DOCUMENT / SOURCE 
  ↓ 
DATE 
  ↓ 
CONFIDENCE 
  ↓ 
VALIDATION 
Exemple : 
R19 Critical Infrastructure Proximity 

<!-- Page 13 -->

 
Score : 68 
Confidence : 0,90 
 
Source : 
base officielle / donnée géographique 
 
Date : 
XX/XX/XXXX 
 
Method : 
distance calculée 
 
Status : 
DOCUMENTED 
 
18. Historisation 
Chaque évolution est versionnée. 
RISK_VERSION 
VALUE 
SCORE 
CONFIDENCE 
SOURCE 
MODEL_VERSION 
RULESET_VERSION 
VALIDATED_BY 
VALIDATED_AT 
Une modification ne détruit jamais l'historique. 
Cela permet de montrer à un investisseur : 
Risk Score initial : 61 
Après étude structure : 48 
Après sécurisation contractuelle : 39 

<!-- Page 14 -->

Le système devient ainsi une machine de réduction mesurable de l'incertitude. 
 
19. Dashboard projet 
Le cockpit final pourra afficher : 
PROJECT #0247 
 
CERTAINTY              82 
PROJECT QUALITY        78 
INVESTMENT READINESS   74 
 
RISK                   31 
RESILIENCE             67 
 
────────────────────────────── 
 
RISK BY DOMAIN 
 
Technique              24 
Contractuel            18 
Réglementaire          37 
Énergie / Réseau       42 
Systémique             21 
 
────────────────────────────── 
 
RISK GATES 
 
⚠ Raccordement à confirmer 
 
────────────────────────────── 
 

<!-- Page 15 -->

RESILIENCE 
 
Production locale       82 
Autoconsommation        76 
Backup                  20 
Storage                 0 
 
────────────────────────────── 
 
NEXT BEST ACTION 
 
Pré-étude raccordement 
Risk : -8 à -15 potentiel 
Certainty : +6 à +9 potentiel 
 
20. Investor Memo 
La restitution investisseur ne doit pas simplement afficher un score. 
Elle doit présenter : 
Project Overview 
• puissance ; 
• production ; 
• CAPEX ; 
• contrat ; 
• revenus ; 
• TRI. 
Certainty 
• Certainty Score ; 
• Investment Readiness ; 
• qualité des données. 
Risk 
• Risk Score ; 

<!-- Page 16 -->

• risques principaux ; 
• Risk Gates ; 
• risques non documentés. 
Resilience 
• production locale ; 
• réduction de dépendance ; 
• stockage ; 
• backup ; 
• continuité potentielle. 
Mitigation Plan 
• risques ; 
• actions ; 
• coût ; 
• délai ; 
• réduction potentielle du risque. 
 
21. Règle fondamentale de présentation 
SolarShift ne doit jamais afficher : 
« Risque de guerre : 4 % » 
ou : 
« Probabilité de coupure : 12 % » 
sans modèle statistique robuste et données permettant réellement de l'établir. 
Le système doit préférer : 
Exposition à une infrastructure sensible : élevée 
Dépendance au réseau : élevée 
Capacité de secours : inexistante 
Résilience énergétique additionnelle : limitée 
Cela est plus robuste juridiquement, techniquement et commercialement. 
 
22. Architecture globale finale 
                         PROJECT ENGINE 

<!-- Page 17 -->

                               │ 
             ┌─────────────────┼─────────────────┐ 
             │                 │                 │ 
             ▼                 ▼                 ▼ 
       DATA / EVIDENCE   CERTAINTY ENGINE   RISK ENGINE 
             │                 │                 │ 
             │                 │                 ▼ 
             │                 │            RISK SCORE 
             │                 │            RISK GATES 
             │                 │            RISK PATTERNS 
             │                 │                 │ 
             │                 └────────┐        │ 
             │                          │        │ 
             │                          ▼        ▼ 
             │                    RESILIENCE ENGINE 
             │                          │ 
             │                    RESILIENCE SCORE 
             │                          │ 
             └──────────────┬───────────┘ 
                            ▼ 
                     DECISION ENGINE 
                            │ 
                  ┌─────────┴─────────┐ 
                  ▼                   ▼ 
            NEXT BEST ACTION       SCENARIOS 
                  │                   │ 
                  └─────────┬─────────┘ 
                            ▼ 
                    SOLARSHIFT OUTPUT 
                            │ 
             ┌──────────────┼──────────────┐ 

<!-- Page 18 -->

             ▼              ▼              ▼ 
          COCKPIT       CLIENT REPORT   INVESTOR MEMO 
23. Versioning 
Cette V1.0 constitue le cadre fonctionnel. 
Les paramètres et pondérations devront ensuite être calibrés sur les projets réels. 
Le Risk Score ne doit pas être présenté comme une probabilité statistique de perte ou 
d'événement tant que SolarShift ne dispose pas d'un historique suffisamment important 
permettant une calibration empirique. 
À terme, après plusieurs centaines ou milliers de projets, SolarShift pourra comparer : 
Risk Score initial → événement réel → perte réelle → durée → mitigation 
et commencer à calibrer statistiquement les modèles. 
C'est à ce moment que le moteur pourra devenir progressivement un véritable Risk 
Intelligence Engine propriétaire.
