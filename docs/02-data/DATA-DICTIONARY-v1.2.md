# SolarShift — Data Dictionary v1.2

## Statut et conventions

Ce document définit les **60 paramètres cœur** : A9 / B9 / C9 / D6 / E7 / F7 / G6 / H7. Il est la référence de données prioritaire.

Sources : `API` (automatique), `DOC` (document), `MESURE`, `CLIENT`, `MANDATAIRE`, `EXPERT`, `IA` (inférence, jamais preuve définitive), `CALCUL` (dérivé).

| Niveau | Confiance | Origine indicative |
|---|---:|---|
| L5 | 1.00 | source officielle, mesure directe ou contrat signé |
| L4 | 0.90 | document fiable et récent |
| L3 | 0.75 | étude ou modèle professionnel |
| L2 | 0.55 | déclaration client/mandataire |
| L1 | 0.35 | inférence IA ou source indirecte |
| L0 | 0.00 | inconnu |

Chaque enregistrement de paramètre conserve valeur typée, unité, source, date, niveau de confiance, statut de validation, preuve(s), méthode de calcul le cas échéant, version et historique.

## A — Site & potentiel solaire (9)

| Code | Paramètre | Type / unité | Sources / règle |
|---|---|---|---|
| A01 | Surface totale du site | numérique, m² | DOC/API |
| A02 | Surface exploitable PV | numérique, m² | DOC/EXPERT/IA |
| A03 | Orientation et géométrie toiture | structuré | DOC/EXPERT |
| A04 | Facteur d'ombrage | numérique, % | EXPERT/modèle |
| A05 | Productible spécifique | numérique, kWh/kWc/an | API/EXPERT |
| A06 | État de la toiture | score, 0–100 | EXPERT/DOC |
| A07 | Durée de vie résiduelle toiture | numérique, années | EXPERT/DOC |
| A08 | Accessibilité du site | score, 0–100 | EXPERT/MANDATAIRE |
| A09 | Cohérence surface ↔ puissance PV | score, 0–100 | CALCUL ; dérivé et vérifié automatiquement |

## B — Consommation & adéquation énergétique (9)

| Code | Paramètre | Type / unité | Sources / règle |
|---|---|---|---|
| B01 | Consommation annuelle | numérique, kWh/an | factures, API, DOC |
| B02 | Historique de consommation | structuré, années | API/DOC |
| B03 | Profil de charge | structuré, courbe | API/DOC/MESURE |
| B04 | Part de consommation diurne | %, % | CALCUL/DOC |
| B05 | Saisonnalité | score, 0–100 | CALCUL/DOC |
| B06 | Puissance souscrite / appelée | numérique, kVA | DOC/API |
| B07 | Taux d'autoconsommation | %, % | CALCUL si possible, sinon documenté |
| B08 | Adéquation charge / PV | score, 0–100 | CALCUL si possible |
| B09 | Stabilité de la consommation | score, 0–100 | CALCUL/DOC |

## C — Économie du projet (9)

| Code | Paramètre | Type / unité | Sources / règle |
|---|---|---|---|
| C01 | CAPEX total | numérique, € | devis/étude |
| C02 | CAPEX spécifique | numérique, €/kWc | CALCUL |
| C03 | Production annuelle | numérique, kWh/an | CALCUL/API/EXPERT |
| C04 | Prix électricité réseau | numérique, €/kWh | factures/contrat |
| C05 | Prix de vente solaire | numérique, €/kWh | contrat/hypothèse versionnée |
| C06 | Économie annuelle client | numérique, €/an | CALCUL |
| C07 | Chiffre d'affaires projet | numérique, €/an | CALCUL |
| C08 | OPEX projet | numérique, €/an | devis/hypothèse versionnée |
| C09 | TRI investisseur | numérique, % | CALCUL |

VAN, DSCR, payback, marge, LCOE et sensibilités sont des KPI dérivés ; ils ne s'ajoutent pas aux 60 paramètres.

## D — Urbanisme & réglementation (6)

| Code | Paramètre | Type / valeurs | Importance / règle |
|---|---|---|---|
| D01 | Compatibilité urbanistique | score/statut | CRITICAL ; Risk, Certainty |
| D02 | Destination du bâtiment | texte/ENUM | REQUIRED |
| D03 | Protection patrimoniale / contraintes ABF | score/statut | REQUIRED |
| D04 | Parcours d'autorisation | ENUM : `NONE`, `DECLARATION`, `PERMIT`, `SPECIFIC_AUTHORIZATION`, `MULTIPLE_AUTHORIZATIONS` | REQUIRED |
| D05 | Contraintes environnementales | score + liste | REQUIRED |
| D06 | Validation réglementaire | `UNKNOWN`, `IN_PROGRESS`, `VALIDATED`, `REJECTED` | CRITICAL, validation humaine, gate |

## E — Réseau & raccordement (7)

| Code | Paramètre | Type / unité | Importance / règle |
|---|---|---|---|
| E01 | Point et type de raccordement | structuré | CRITICAL |
| E02 | Puissance de raccordement requise | numérique, kVA/kW | CRITICAL |
| E03 | Distance / complexité réseau | score, 0–100 | REQUIRED |
| E04 | Faisabilité réseau | statut + score : `UNKNOWN`, `POSSIBLE`, `CONDITIONAL`, `IMPOSSIBLE` | CRITICAL, gate |
| E05 | État étude raccordement | `NOT_STARTED`, `REQUESTED`, `IN_PROGRESS`, `RECEIVED`, `VALIDATED` | REQUIRED |
| E06 | Coût de raccordement | numérique, € | CRITICAL |
| E07 | Délai de raccordement | numérique, jours | REQUIRED |

## F — Client & contractualisation (7)

| Code | Paramètre | Type / valeurs | Importance / règle |
|---|---|---|---|
| F01 | Identité juridique client | structuré | CRITICAL ; SIRENE/Kbis/document |
| F02 | Propriétaire, occupant, relation au site | structuré | CRITICAL, gate ; droits et durée d'installation obligatoires |
| F03 | Qualité de crédit client | score, 0–100 | CRITICAL |
| F04 | Stabilité de l'activité | score, 0–100 | REQUIRED |
| F05 | Décideur identifié | booléen + identité/rôle | REQUIRED |
| F06 | Engagement commercial | `LEAD`, `INTERESTED`, `QUALIFIED`, `COMMITTED`, `SIGNED` | CRITICAL |
| F07 | Compatibilité durée contractuelle | score + statut, années | CRITICAL, gate |

## G — Technique & exécution (6)

| Code | Paramètre | Type / valeurs | Importance / règle |
|---|---|---|---|
| G01 | Faisabilité structurelle | statut + score : `UNKNOWN`, `POSSIBLE`, `CONDITIONAL`, `IMPOSSIBLE` | CRITICAL, gate, validation experte |
| G02 | Compatibilité électrique | score, 0–100 | CRITICAL |
| G03 | Accès / travaux préparatoires | score, 0–100 | REQUIRED |
| G04 | Complexité installation | score, 0–100 | REQUIRED |
| G05 | Qualité du devis EPC | score, 0–100 | REQUIRED |
| G06 | Risque d'exécution | score, 0–100 | REQUIRED, issu de calcul/analyse |

## H — Données & documentation (7)

| Code | Paramètre | Type | Importance / règle |
|---|---|---|---|
| H01 | Complétude documentaire | % | REQUIRED, calculé |
| H02 | Qualité des sources | score, 0–100 | REQUIRED, calculé |
| H03 | Fraîcheur des données | score, 0–100 | REQUIRED, calculé |
| H04 | Cohérence inter-documents | score, 0–100 | CRITICAL ; AI + calcul ; contradictions visibles |
| H05 | Traçabilité des hypothèses | score, 0–100 | REQUIRED, calculé |
| H06 | Taux de validation humaine | % | REQUIRED, calculé |
| H07 | Couverture des preuves | % | CRITICAL, calculé ; gate de couverture |

## Importance, preuve et inconnues

Les paramètres sont `CRITICAL`, `REQUIRED` ou progressifs selon l'étape de projet. Une donnée `UNKNOWN` signifie qu'elle n'est pas établie, pas qu'elle vaut zéro ou que le projet est mauvais. Pour les données critiques, une preuve relie valeur, source, document/API/mesure, date, page/extrait, méthode et validation humaine.

Une valeur validée reste historisée ; une correction crée une nouvelle version, une validation et une entrée d'audit. Les scores conservent `framework_version`, `ruleset_version`, `model_version`, date du snapshot et horodatage de calcul afin d'être reproductibles.
