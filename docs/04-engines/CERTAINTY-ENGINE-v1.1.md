# SolarShift Certainty Engineâ„¢ â€” Rulebook mÃ©tier v1.1

> Source primaire : pages 25 Ã  41 de `docs/source/DATA-DICTIONARY-v1.2.pdf`.
>
> Ce Rulebook utilise les coefficients L0â€“L5 de la version 1.1 : L1=.25, L2=.50, L3=.70, L4=.85. Le Data Dictionary placÃ© dans le mÃªme PDF dÃ©crit une autre table de qualification des sources. Cette diffÃ©rence est conservÃ©e et doit faire lâ€™objet dâ€™un ADR avant toute implÃ©mentation.
SolarShift Certainty Engine™

Rulebook métier v1.1

## 1. Principe général

Pour chaque paramètre :

Raw Score 0–100
→ qualité intrinsèque de la situation

Confidence L0–L5
→ fiabilité de l'information

Effective Score = Raw Score × Confidence

Le moteur conserve toujours séparément :

- la valeur observée ;

- le score ;

- la confiance ;

- la preuve ;

- la date ;

- la méthode ;

- la validation humaine.

## 2. Échelle universelle de score

| Score | Interprétation |
| --- | --- |
| 90–100 | Très favorable / maîtrisé |
| 75–89 | Favorable |
| 60–74 | Acceptable |
| 40–59 | Incertain / intermédiaire |
| 20–39 | Défavorable |
| 0–19 | Très défavorable / critique |

Cette échelle est adaptée par paramètre lorsque cela est nécessaire.

## 3. Confiance

| Niveau | Définition | Coefficient |
| --- | --- | --- |
| L0 | Inconnu | 0 |
| L1 | Hypothèse / estimation IA | 0,25 |
| L2 | Déclaration / source indirecte | 0,50 |
| L3 | Document fiable | 0,70 |
| L4 | API / étude professionnelle / source officielle | 0,85 |
| L5 | Vérifié humainement | 1,00 |

## 4. Règles des 60 paramètres

A — Site & potentiel solaire — 15 %

| Code | Règle de scoring principale | Importance |
| --- | --- | --- |
| A01 | Surface cohérente avec plans/cadastre : 90–100 ; estimation fiable : 60–89 ; très incertaine : <60 | Required |
| A02 | Surface réellement exploitable après contraintes : >85 % du potentiel théorique = 90+ ; 65–85 % = 75–89 ; 40–65 % = 50–74 ; <40 % = <50 | Critical |
| A03 | Orientation/géométrie favorable et documentée = 80–100 ; partiellement connue = 50–79 ; inconnue = 40 avant confiance | Required |
| A04 | Ombrage <5 % = 95 ; 5–10 % = 85 ; 10–20 % = 70 ; 20–30 % = 50 ; >30 % = <40 | Required |
| A05 | Productible conforme au potentiel local et à l'étude = 90+ ; hypothèse standard = 60–79 ; forte incertitude = <60 | Critical |
| A06 | Toiture neuve/bon état = 90–100 ; bon état = 75–89 ; travaux nécessaires = 50–74 ; mauvais état = 20–49 ; incompatible = <20 | Critical |
| A07 | Durée résiduelle ≥25 ans = 95 ; 20–24 = 85 ; 15–19 = 70 ; 10–14 = 50 ; <10 = <30 | Critical |
| A08 | Accès simple = 90+ ; contraintes modérées = 60–89 ; complexe = 30–59 ; très difficile = <30 | Required |
| A09 | Cohérence surface/puissance calculée = 95–100 ; écart mineur = 75–94 ; incohérence significative = 40–74 ; impossible = <40 | Critical |

Gates A

A-G01 Structure/toiture

Déclenchement si A06 <40 ou A07 <10 ans sans solution de rénovation documentée.

Action :

TECHNICAL_ROOF_REVIEW

B — Consommation & adéquation — 15 %

| Code | Règle |
| --- | --- |
| B01 | Consommation documentée sur ≥12 mois = 90+ ; estimation = 50–79 ; inconnue = 0 effective |
| B02 | ≥3 années cohérentes = 95 ; 2 années = 85 ; 1 année = 65 ; données fragmentaires = <50 |
| B03 | Profil horaire réel = 95 ; profil reconstitué = 75 ; profil standard = 50 ; inconnu = 0 effective |
| B04 | Consommation diurne élevée = score croissant ; >70 % = 95 ; 50–70 % = 80 ; 30–50 % = 60 ; <30 % = 40 |
| B05 | Saison faible = 90+ ; modérée = 70–89 ; forte = 50–69 ; très forte = <50 |
| B06 | Puissance souscrite/appelée cohérente avec projet = 90+ ; écart modéré = 60–89 ; incohérence = <60 |
| B07 | Taux d'autoconsommation calculé = score croissant ; >80 % = 95 ; 60–80 % = 85 ; 40–60 % = 70 ; <40 % = <55 |
| B08 | Fit PV/charge : excellent = 90+ ; bon = 75–89 ; moyen = 55–74 ; faible = 35–54 ; mauvais <35 |
| B09 | Consommation stable = 90+ ; variation modérée = 70–89 ; instable = 40–69 ; très volatile <40 |

Gate B

CONSUMPTION_MODEL_REQUIRED

Si B01, B03 ou B08 sont inconnus alors que le projet entre en phase pré-financement.

C — Économie — 20 %

C est volontairement le domaine le plus pondéré.

| Code | Règle |
| --- | --- |
| C01 | CAPEX issu d'un devis EPC fiable = 90–100 ; estimation professionnelle = 75–89 ; hypothèse = <70 |
| C02 | €/kWc comparé à une référence interne actualisée : décile favorable = 90+ ; médian = 60–80 ; élevé = <50 |
| C03 | Production cohérente avec A05 × puissance = 90+ ; estimation = 60–89 ; incohérence = <50 |
| C04 | Prix réseau réel documenté = 95 ; contrat/factures partielles = 80 ; hypothèse = <60 |
| C05 | Prix solaire contractuellement justifié = 90+ ; hypothèse économique = 50–79 ; non établi = <50 |
| C06 | Économies client attractives et robustes = 90+ ; correctes = 70–89 ; faibles = 50–69 ; insuffisantes <50 |
| C07 | Revenus calculés à partir de données validées = 90+ ; hypothèses partielles = 60–89 ; incertains <60 |
| C08 | OPEX documenté = 90+ ; benchmark = 70–89 ; hypothèse = <70 |
| C09 | TRI cible atteint avec hypothèses validées = 90+ ; légèrement inférieur = 60–89 ; faible = 40–59 ; non viable = <40 |

KPI dérivés

Ne jamais noter directement :

- VAN ;

- DSCR ;

- Payback ;

- marge opérationnelle ;

- LCOE ;

- sensibilité.

Ils sont calculés à partir de C01–C09.

Gate C

ECONOMIC_VIABILITY_REVIEW

Si C09 <40.

Le projet n'est pas automatiquement rejeté : le moteur cherche des actions d'amélioration.

D — Urbanisme & réglementation — 10 %

| Code | Règle |
| --- | --- |
| D01 | Compatibilité confirmée = 95–100 ; probable = 70–89 ; incertaine = 40–69 ; incompatible = <20 |
| D02 | Destination clairement documentée = 90+ ; déclaration fiable = 70 ; inconnue = <40 |
| D03 | Absence de contrainte = 95 ; contrainte maîtrisée = 75 ; contrainte nécessitant validation = 50 ; blocage probable <30 |
| D04 | Autorisation simple et identifiée = 90+ ; procédure multiple = 60–89 ; parcours inconnu <50 |
| D05 | Absence de contrainte environnementale = 95 ; contraintes maîtrisées = 70–89 ; incertitude = 40–69 ; incompatibilité <30 |
| D06 | VALIDATED = 100 ; IN_PROGRESS = 65 ; UNKNOWN = 30 ; REJECTED = 0 |

Gate D

REGULATORY_REVIEW_REQUIRED

Si D01 <40, D03 <30 ou D06 = REJECTED.

E — Réseau — 10 %

| Code | Règle |
| --- | --- |
| E01 | Point de raccordement identifié et validé = 95+ ; identifié mais non validé = 70 ; inconnu <40 |
| E02 | Puissance de raccordement calculée = 90+ ; estimation = 60–79 ; inconnue <40 |
| E03 | Complexité faible = 90+ ; moyenne = 60–89 ; forte = 30–59 ; extrême <30 |
| E04 | POSSIBLE = 90 ; CONDITIONAL = 60 ; UNKNOWN = 30 ; IMPOSSIBLE = 0 |
| E05 | VALIDATED = 100 ; RECEIVED = 90 ; IN_PROGRESS = 65 ; REQUESTED = 45 ; NOT_STARTED = 20 |
| E06 | Coût confirmé = 95 ; estimation = 70 ; inconnue = 30 |
| E07 | Délai faible = 90+ ; moyen = 60–89 ; élevé = 30–59 ; très élevé <30 |

Gate E

GRID_FEASIBILITY_REVIEW

Si E04 = IMPOSSIBLE.

Ou :

si E04 = UNKNOWN et le projet est au stade PRE-FINANCEABLE.

F — Client & contractualisation — 15 %

| Code | Règle |
| --- | --- |
| F01 | Identité légale vérifiée = 100 ; document partiel = 70 ; inconnue <40 |
| F02 | Droits sur site juridiquement documentés = 100 ; déclaration = 60 ; inconnus = 20 |
| F03 | Qualité crédit élevée = 90+ ; moyenne = 60–89 ; faible = 30–59 ; très faible <30 |
| F04 | Activité stable = 90+ ; stable avec incertitude = 70–89 ; fragile = 40–69 ; très fragile <40 |
| F05 | Décideur identifié + rôle confirmé = 100 ; identifié = 70 ; inconnu = 30 |
| F06 | SIGNED = 100 ; COMMITTED = 90 ; QUALIFIED = 70 ; INTERESTED = 40 ; LEAD = 20 |
| F07 | Durée contractuelle parfaitement compatible = 95–100 ; compatible sous conditions = 70–89 ; courte = 40–69 ; incompatible <40 |

Gates F

SITE_RIGHTS_REQUIRED

si F02 <60.

CONTRACT_DURATION_REVIEW

si F07 <40.

G — Technique & exécution — 10 %

| Code | Règle |
| --- | --- |
| G01 | Structure validée = 95–100 ; probable = 70–89 ; inconnue = 40 ; incompatible = 0 |
| G02 | Compatibilité électrique validée = 95 ; probable = 75 ; inconnue = 40 ; incompatible <20 |
| G03 | Accès/travaux simples = 90+ ; modérés = 60–89 ; complexes = 30–59 ; très complexes <30 |
| G04 | Installation simple = 90+ ; moyenne = 70–89 ; complexe = 40–69 ; très complexe <40 |
| G05 | Devis EPC détaillé = 95 ; devis standard = 80 ; estimation = 60 ; hypothèse <50 |
| G06 | Risque d'exécution faible = 90+ ; moyen = 60–89 ; élevé = 30–59 ; critique <30 |

Gate G

STRUCTURAL_REVIEW_REQUIRED

si G01 <40.

H — Données & documentation — 5 %

H n'est pas une « qualité du projet ».

C'est la qualité de ce que SolarShift sait réellement démontrer.

| Code | Règle |
| --- | --- |
| H01 | >90 % des données nécessaires = 95 ; 75–90 % = 80 ; 50–75 % = 60 ; <50 % = <40 |
| H02 | Sources officielles/professionnelles dominantes = 90+ ; mixtes = 60–89 ; déclaratives = <60 |
| H03 | Données récentes = 90+ ; partiellement anciennes = 60–89 ; anciennes = <60 |
| H04 | Aucun conflit = 95–100 ; conflits mineurs = 70–89 ; conflit majeur = <50 |
| H05 | Hypothèses entièrement traçables = 95 ; majorité = 75–94 ; partiellement = 50–74 ; faible <50 |
| H06 | >90 % validation humaine sur données critiques = 95 ; 70–90 = 80 ; 40–70 = 60 ; <40 = <40 |
| H07 | >90 % des paramètres critiques couverts par preuves = 95 ; 75–90 = 80 ; 50–75 = 60 ; <50 = <40 |

Gate H

EVIDENCE_COVERAGE_REQUIRED

si H07 <50 au moment de déclarer le projet FINANCEABLE.

## 5. Règles de blocage global

Le moteur doit empêcher automatiquement le statut FINANCEABLE lorsqu'un des éléments suivants est vrai :

- Critical Gate actif ;

- IR <75 ;

- CS <75 ;

- H07 <50 ;

- au moins un paramètre critique avec L0/L1 sans action de résolution planifiée ;

- contradiction documentaire critique non résolue ;

- structure incompatible ;

- raccordement impossible ;

- droits sur site non établis ;

- incompatibilité réglementaire avérée.

## 6. Règle importante : score ≠ décision

Un projet ayant :

CS = 78

mais un gate structurel actif ne doit pas être affiché comme :

FINANCEABLE

mais :

78 — Human Review Required

Cette distinction est fondamentale pour éviter qu'un score agrégé masque un risque critique.

## 7. Reason Codes normalisés

Chaque anomalie ou évolution significative doit produire un code.

Données

DATA_MISSING
DATA_UNCERTAIN
DATA_STALE
SOURCE_WEAK
DOCUMENT_CONFLICT
EVIDENCE_MISSING

Technique

ROOF_CONDITION_RISK
ROOF_LIFE_LOW
STRUCTURAL_UNCERTAIN
ELECTRICAL_UNCERTAIN
INSTALLATION_COMPLEX

Énergie

CONSUMPTION_UNKNOWN
LOAD_PROFILE_UNKNOWN
PV_LOAD_MISMATCH
CONSUMPTION_VOLATILE

Économie

CAPEX_UNCERTAIN
CAPEX_HIGH
ECONOMICS_BORDERLINE
IRR_LOW
REVENUE_UNCERTAIN

Réglementaire

PLANNING_UNCERTAIN
HERITAGE_CONSTRAINT
AUTHORIZATION_UNCERTAIN
REGULATORY_BLOCK

Réseau

GRID_UNCERTAIN
GRID_COMPLEX
GRID_COST_HIGH
GRID_DELAY_HIGH
GRID_IMPOSSIBLE

Contractuel

SITE_RIGHTS_UNCERTAIN
CLIENT_CREDIT_RISK
DECISION_MAKER_UNKNOWN
CONTRACT_DURATION_SHORT
COMMERCIAL_COMMITMENT_LOW

## 8. Next Best Action — catalogue initial

| Code | Action | Déclencheur |
| --- | --- | --- |
| NBA01 | Obtenir étude structure | G01/A06 faible |
| NBA02 | Diagnostic toiture | A06/A07 insuffisant |
| NBA03 | Obtenir historique consommation | B01/B02 faible |
| NBA04 | Obtenir courbe de charge | B03 inconnu |
| NBA05 | Lancer étude raccordement | E04 inconnu |
| NBA06 | Confirmer point de raccordement | E01 faible |
| NBA07 | Valider urbanisme | D01/D06 faible |
| NBA08 | Vérifier droits sur site | F02 faible |
| NBA09 | Obtenir données financières client | F03 faible |
| NBA10 | Identifier décideur | F05 inconnu |
| NBA11 | Sécuriser engagement client | F06 faible |
| NBA12 | Renégocier durée contractuelle | F07 faible |
| NBA13 | Obtenir devis EPC | C01/G05 faible |
| NBA14 | Optimiser dimensionnement | B08/C09 faible |
| NBA15 | Optimiser CAPEX | C02/C09 faible |
| NBA16 | Vérifier hypothèses économiques | C04/C05/C09 faible |
| NBA17 | Résoudre contradiction documentaire | H04 faible |
| NBA18 | Compléter dossier de preuves | H07 faible |

## 9. Priorisation des actions

Chaque NBA reçoit quatre indicateurs :

Risk Reduction

Certainty Gain

Investment Readiness Gain

Cost/Time Efficiency

Score :

**Priority = 40 % Risk Reduction

- 30 % Certainty Gain

- 20 % IR Gain

- 10 % Efficiency**

Le système affiche ensuite :

PRIORITÉ 1

Action indispensable avant poursuite.

PRIORITÉ 2

Action fortement recommandée.

PRIORITÉ 3

Action d'optimisation.

## 10. Test de cohérence — Projet A

Projet solaire industriel très documenté

- toiture validée ;

- 3 ans de consommation ;

- courbe de charge ;

- devis EPC ;

- raccordement étudié ;

- urbanisme validé ;

- client solide ;

- engagement commercial.

Résultat cible :

DC ≈ 92

PQ ≈ 88

IR ≈ 86

CS ≈ 88

Statut :

FINANCEABLE

## 11. Test — Projet B

Bon potentiel mais dossier incomplet

- excellente toiture ;

- consommation annuelle connue ;

- pas de courbe de charge ;

- pas d'étude structure ;

- raccordement inconnu ;

- client identifié.

Résultat cible :

PQ ≈ 78

DC ≈ 52

IR ≈ 55–65

CS ≈ 60–65

Statut :

VALIDATION / PRE-FINANCEABLE

NBA prioritaires :

- étude structure ;

- étude raccordement ;

- courbe de charge.

## 12. Test — Projet C

Projet économiquement excellent mais raccordement problématique

- PQ ≈ 86 ;

- DC ≈ 88 ;

- IR ≈ 64 ;

- Risk ≈ 58 ;

- Grid Risk élevé.

Résultat :

CS ≈ 77

mais :

GRID_FEASIBILITY_REVIEW

Statut :

HUMAN REVIEW REQUIRED

Le projet n'est pas rejeté.

La décision devient :

sécuriser le raccordement avant engagement financier.

## 13. Test — Projet D

Projet avec problème structurel

- consommation excellente ;

- économie excellente ;

- client excellent ;

- toiture ancienne ;

- structure non validée.

Résultat possible :

PQ ≈ 76

DC ≈ 82

IR ≈ 65

CS ≈ 74

mais :

STRUCTURAL_REVIEW_REQUIRED

Statut :

BLOCKED / HUMAN REVIEW

NBA :

NBA01 — Obtenir étude structure

## 14. Test — Projet E

Projet économiquement borderline

- site excellent ;

- consommation excellente ;

- client solide ;

- CAPEX élevé ;

- TRI proche du minimum ;

- raccordement correct.

Résultat :

PQ ≈ 67

DC ≈ 88

IR ≈ 61

CS ≈ 70

Statut :

PRE-FINANCEABLE

NBA :

- optimisation CAPEX ;

- optimisation dimensionnement ;

- comparaison EPC ;

- scénario économique dégradé.

## 15. Règle d'affichage

Le cockpit ne doit jamais présenter uniquement :

Score : 82

Il doit présenter :

CERTAINTY 82

Data Confidence 91
Project Quality 78
Investment Readiness 79

puis :

3 points forts

2 risques principaux

1 prochaine action

Cette présentation explique immédiatement pourquoi le score existe.

## 16. Règle d'or du moteur

Le système doit toujours pouvoir répondre à cinq questions :

## 1. Pourquoi ce score ?

→ composants + pondérations.

## 2. Sur quelles données ?

→ paramètres.

## 3. Sur quelles preuves ?

→ Evidence Layer.

## 4. Qu'est-ce qui peut faire changer le score ?

→ risques + inconnues + scénarios.

## 5. Que faut-il faire maintenant ?

→ Next Best Action.

Si le moteur ne peut pas répondre à ces cinq questions, le score ne doit pas être considéré comme suffisamment robuste.

## 17. Structure technique finale

Le calcul doit suivre cette chaîne :

DOCUMENT / API / INPUT

↓

EVIDENCE

↓

PARAMETER

↓

RAW SCORE

↓

CONFIDENCE

↓

EFFECTIVE SCORE

↓

DOMAIN SCORE

↓

PROJECT QUALITY

↓

DATA CONFIDENCE

↓

INVESTMENT READINESS

↓

CERTAINTY SCORE

↓

CRITICAL GATES

↓

RISK ENGINE

↓

RESILIENCE ENGINE

↓

NEXT BEST ACTION

↓

PROJECT STATUS

## 18. Ce qui reste volontairement paramétrable

Les seuils économiques comme :

- €/kWc ;

- TRI minimal ;

- niveau d'économie client ;

- prix solaire ;

- durée contractuelle ;

- seuil de DSCR ;

ne doivent pas être codés en dur.

Ils doivent être stockés dans un :

RULESET

avec :

- version ;

- date d'entrée en vigueur ;

- auteur ;

- justification ;

- paramètres ;

- statut actif/inactif.

Ainsi :

RULESET_2026_09

pourra être remplacé par :

RULESET_2027_01

sans réécrire le moteur.

## 19. Conclusion opérationnelle

À ce stade, SolarShift dispose de trois couches distinctes :

PROJECT ENGINE

→ transforme les données brutes en projet structuré.

CERTAINTY ENGINE

→ mesure ce que SolarShift sait réellement et peut démontrer.

RISK / RESILIENCE ENGINE

→ mesure l'exposition et les leviers d'amélioration.

Puis :

DECISION ENGINE

→ transforme ces informations en actions.

C'est cette architecture qui permet de passer d'un simple outil de qualification commerciale à une véritable infrastructure de décision pour les projets énergétiques B2B.
