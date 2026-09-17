# SolarShift â€” Dataset Demo & Tests v1.0

> Source primaire : `docs/source/DATASET-DEMO-TESTS.pdf`. Cette version Markdown est la transcription complÃ¨te du dataset et des tests de rÃ©gression.
<!-- Page 1 -->

SolarShift — Dataset Demo & Tests v1.0 
1. Objectif 
Créer cinq projets fictifs représentant cinq situations différentes : 
Projet Cas Résultat attendu 
A Dossier très solide FINANCEABLE 
B Bon projet mais incomplet PRE-FINANCEABLE 
C Raccordement problématique HUMAN REVIEW 
D Risque structurel HUMAN REVIEW 
E Économie borderline PRE-FINANCEABLE 
Toutes les données ci-dessous sont fictives et doivent être affichées dans l'application avec le 
label : 
DEMO DATA 
 
2. Projet A — Dossier solide 
Identification 
Référence : SOL-2026-DEMO-A 
Nom : Parc d'activités Atlantique 
Type : bâtiment industriel 
Surface toiture : 4 800 m² 
Puissance PV envisagée : 500 kWc 
Paramètres MVP 
Code Valeur Confiance Score cible 
A02 3 850 m² L5 95 
A05 1 080 kWh/kWc/an L4 92 
A06 Très bon état L5 95 
A07 27 ans L4 97 
B01 620 000 kWh/an L5 98 
B03 Courbe 15 min disponible L5 98 
B07 82 % L4 96 
B08 Très bonne adéquation L4 94 

<!-- Page 2 -->

Code Valeur Confiance Score cible 
C01 425 000 € L4 90 
C03 540 000 kWh/an L4 94 
C04 0,185 €/kWh L5 96 
C06 28 % d'économie L4 94 
C09 TRI 7,4 % L4 91 
D01 Compatible L4 95 
D06 VALIDATED L5 100 
E04 POSSIBLE L4 92 
F02 Droits documentés L5 100 
F03 Client solide L4 88 
F06 COMMITTED L4 90 
G01 Structure validée L5 97 
Résultat cible 
Data Confidence : 93 
Project Quality : 91 
Investment Readiness : 88 
Certainty : ~91 
Risk : ~25–30 
Resilience : ~65–70 
Statut : FINANCEABLE 
Next Best Actions 
• finaliser contrat ; 
• compléter quelques pièces administratives ; 
• préparer Investor Memo. 
 
3. Projet B — Bon projet incomplet 
Référence : SOL-2026-DEMO-B 
Situation 

<!-- Page 3 -->

Très bon potentiel mais documentation insuffisante. 
Code Valeur Confiance Score cible 
A02 2 900 m² L3 85 
A05 1 050 kWh/kWc/an L2 72 
A06 Bon état déclaré L2 65 
A07 20 ans estimés L2 70 
B01 410 000 kWh/an L3 85 
B03 Inconnu L0 — 
B07 Estimation 74 % L1 50 
B08 Probablement bon L1 55 
C01 310 000 € estimés L2 65 
C03 320 000 kWh/an L2 70 
C04 0,18 €/kWh L2 65 
C06 22 % estimé L2 70 
C09 TRI estimé 6,7 % L2 70 
D01 Probablement compatible L2 65 
D06 IN_PROGRESS L2 65 
E04 UNKNOWN L0 — 
F02 Bail à vérifier L2 55 
F03 Informations partielles L2 60 
F06 QUALIFIED L3 70 
G01 UNKNOWN L0 — 
Résultat cible 
Data Confidence : ~50–55 
Project Quality : ~70–78 
Investment Readiness : ~55–65 
Certainty : ~60–65 
Risk : ~45–55 

<!-- Page 4 -->

Statut : PRE-FINANCEABLE / VALIDATION 
Actions prioritaires 
1. Étude structure 
2. Étude raccordement 
3. Courbe de charge 
4. Validation des droits sur site 
5. Confirmation des hypothèses économiques 
Le moteur doit montrer que le projet est potentiellement intéressant mais que son niveau de 
preuve est insuffisant. 
 
4. Projet C — Raccordement problématique 
Référence : SOL-2026-DEMO-C 
Situation 
Projet économiquement intéressant mais réseau incertain. 
Code Valeur Confiance Score cible 
A02 4 100 m² L5 94 
A05 1 100 kWh/kWc/an L4 94 
A06 Très bon état L5 95 
A07 24 ans L4 92 
B01 700 000 kWh/an L5 98 
B03 Disponible L4 92 
B07 79 % L4 94 
B08 Excellent L4 93 
C01 440 000 € L4 88 
C03 550 000 kWh/an L4 93 
C04 0,19 €/kWh L5 98 
C06 27 % L4 92 
C09 TRI 7,8 % L4 94 
D01 Compatible L4 94 

<!-- Page 5 -->

Code Valeur Confiance Score cible 
D06 VALIDATED L5 100 
E04 CONDITIONAL L4 55 
F02 Documenté L5 100 
F03 Solide L4 90 
F06 COMMITTED L4 90 
G01 Validée L5 95 
Résultat 
Le projet peut conserver : 
Project Quality élevé 
et : 
Data Confidence élevé 
mais son : 
Investment Readiness est pénalisé 
par le raccordement. 
Gate 
GRID_FEASIBILITY_REVIEW 
Statut 
HUMAN REVIEW REQUIRED 
Action 
NBA05 — Lancer / finaliser étude raccordement 
Le système ne doit surtout pas transformer automatiquement ce cas en « projet mauvais ». 
 
5. Projet D — Risque structurel 
Référence : SOL-2026-DEMO-D 
Situation 
Excellent client et excellente économie. 
Mais toiture ancienne et structure non validée. 

<!-- Page 6 -->

Code Valeur Confiance Score cible 
A02 3 200 m² L4 90 
A05 1 070 kWh/kWc/an L4 90 
A06 Toiture vieillissante L4 38 
A07 9 ans L4 25 
B01 520 000 kWh/an L5 96 
B03 Disponible L4 92 
B07 81 % L4 95 
B08 Excellent L4 93 
C01 350 000 € L4 86 
C03 400 000 kWh/an L4 91 
C04 0,185 €/kWh L5 96 
C06 26 % L4 91 
C09 TRI 7,1 % L4 88 
D01 Compatible L4 95 
D06 VALIDATED L5 100 
E04 POSSIBLE L4 90 
F02 Documenté L5 100 
F03 Très solide L5 95 
F06 COMMITTED L4 90 
G01 UNKNOWN L0 — 
Résultat 
Le score agrégé peut rester relativement élevé. 
Mais : 
GATE = STRUCTURAL_REVIEW_REQUIRED 
Le projet ne peut pas devenir automatiquement FINANCEABLE. 
Action prioritaire 
NBA01 — Obtenir étude structure 

<!-- Page 7 -->

Action secondaire : 
NBA02 — Diagnostic toiture 
Le moteur devra également recalculer l'économie si une rénovation de toiture devient 
nécessaire. 
 
6. Projet E — Économie borderline 
Référence : SOL-2026-DEMO-E 
Situation 
Site, client et technique solides. 
Mais CAPEX élevé et TRI proche du seuil. 
Code Valeur Confiance Score cible 
A02 3 700 m² L5 93 
A05 1 060 kWh/kWc/an L4 90 
A06 Bon état L5 92 
A07 23 ans L4 90 
B01 480 000 kWh/an L5 95 
B03 Disponible L4 92 
B07 68 % L4 85 
B08 Bon L4 84 
C01 475 000 € L4 52 
C03 420 000 kWh/an L4 90 
C04 0,17 €/kWh L5 88 
C06 15 % L4 58 
C09 TRI 5,9 % L4 48 
D01 Compatible L4 94 
D06 VALIDATED L5 100 
E04 POSSIBLE L4 90 
F02 Documenté L5 100 

<!-- Page 8 -->

Code Valeur Confiance Score cible 
F03 Solide L4 90 
F06 COMMITTED L4 90 
G01 Validée L5 95 
Résultat 
Project Quality : ~70 
Data Confidence : ~90 
Investment Readiness : ~60 
Certainty : ~70 
Statut 
PRE-FINANCEABLE 
Actions prioritaires 
1. NBA15 — Optimiser CAPEX 
2. NBA14 — Optimiser dimensionnement 
3. NBA13 — Comparer offres EPC 
4. tester scénario économique dégradé ; 
5. étudier éventuellement une évolution du montage contractuel. 
 
7. Test de comportement du moteur 
Le moteur doit respecter les principes suivants. 
Cas A 
Bon projet + bonnes preuves 
→ score élevé 
→ FINANCEABLE 
Cas B 
Bon projet + mauvaises preuves 
→ qualité potentiellement élevée 
→ confiance faible 
→ pas de FINANCEABLE automatique. 
Cas C 
Bon projet + risque réseau 

<!-- Page 9 -->

→ qualité élevée 
→ risque élevé 
→ gate 
→ action corrective. 
Cas D 
Bon projet + risque structurel 
→ score agrégé éventuellement élevé 
→ gate obligatoire 
→ revue humaine. 
Cas E 
Bon projet + mauvaise économie 
→ pas de gate technique 
→ IR faible 
→ actions d'optimisation économique. 
 
8. Test essentiel : modification d'une donnée 
Le MVP doit permettre de tester la chaîne de dépendance. 
Pour le projet E : 
Modifier : 
C01 CAPEX 
de : 
475 000 € 
à : 
390 000 € 
Le système doit automatiquement recalculer : 
C02 CAPEX/kWc 
C09 TRI 
Project Quality 
Investment Readiness 
Certainty 
Actions 
Project Status 
Le changement doit être enregistré dans : 
AUDIT_LOG 

<!-- Page 10 -->

avec ancienne valeur, nouvelle valeur, utilisateur, date et raison. 
 
9. Test essentiel : résolution d'un gate 
Projet D : 
G01 = UNKNOWN 
→ STRUCTURAL_REVIEW_REQUIRED 
Puis expert : 
G01 = POSSIBLE 
Confidence = L5 
Evidence = rapport structure 
Le moteur doit : 
1. fermer le gate ; 
2. créer l'évidence ; 
3. recalculer G01 ; 
4. recalculer les scores ; 
5. recalculer IR ; 
6. recalculer Certainty ; 
7. mettre à jour le statut ; 
8. enregistrer la validation dans AUDIT_LOG. 
 
10. Test essentiel : contradiction 
Projet B : 
Document A : 
410 000 kWh/an 
Document B : 
530 000 kWh/an 
Créer automatiquement : 
DOCUMENT_CONFLICT 
Sévérité : 
HIGH 
Tant que la contradiction n'est pas résolue : 
• B01 ne passe pas en L5 ; 

<!-- Page 11 -->

• H04 diminue ; 
• Data Confidence diminue ; 
• une action est créée. 
 
11. Test de traçabilité 
Pour chaque score affiché, l'utilisateur ADMIN doit pouvoir remonter : 
CERTAINTY 
 ↓ 
Investment Readiness 
 ↓ 
C09 TRI 
 ↓ 
C03 Production 
 ↓ 
A05 Productible 
 ↓ 
Evidence 
 ↓ 
Document 
 ↓ 
Page 
C'est cette chaîne qui constituera progressivement le patrimoine de données de SolarShift. 
 
12. Données de démonstration supplémentaires 
Créer également quelques données fictives : 
Mandataires 
• Mandataire Bretagne Nord 
• Mandataire Grand Ouest 
• Mandataire Atlantique 
Clients 
• Industrie Atlantique SAS 

<!-- Page 12 -->

• Logistique Armor SAS 
• Distribution Ouest SAS 
• Agro Bretagne SAS 
• Services Grand Ouest SAS 
Documents 
Chaque projet doit avoir 5 à 10 documents fictifs : 
• facture ; 
• historique consommation ; 
• plan toiture ; 
• photos ; 
• devis EPC ; 
• document urbanisme ; 
• document contractuel ; 
• rapport technique selon le cas. 
Tous doivent être explicitement marqués : 
DEMO DATA — NOT REAL 
 
13. Critère de réussite du Dataset 
Après chargement, le dashboard doit permettre de voir immédiatement les cinq 
comportements : 
A → FINANCEABLE 
 
B → PRE-FINANCEABLE 
 
C → HUMAN REVIEW — GRID 
 
D → HUMAN REVIEW — STRUCTURE 
 
E → PRE-FINANCEABLE — ECONOMICS 
Le but n'est pas que les scores soient parfaitement calibrés dès V1. 
Le but est de vérifier que : 

<!-- Page 13 -->

le moteur réagit logiquement aux différentes qualités de données, aux différents risques et 
aux différentes situations économiques. 
 
14. Règle de développement 
Ces cinq projets constituent le jeu de régression V1. 
À chaque modification du moteur : 
1. recalculer les cinq projets ; 
2. vérifier les scores ; 
3. vérifier les gates ; 
4. vérifier les actions ; 
5. vérifier les statuts ; 
6. vérifier qu'aucune régression n'est apparue. 
Un changement du RuleSet doit donc être testé contre l'ensemble du dataset avant activation.
