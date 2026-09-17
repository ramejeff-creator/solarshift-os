# SolarShift — Risk & Resilience Engine™ v1.0

## Principes

Le **Risk Score** mesure une exposition, non une probabilité d'événement. Le **Resilience Score** mesure une capacité de continuité/adaptation. Ils restent indépendants du Certainty Score et l'un de l'autre : un projet bien documenté peut être risqué, et une installation PV raccordée ne devient pas automatiquement une solution de secours.

L'IA peut extraire, rapprocher, détecter et expliquer ; le moteur déterministe applique les règles, pondérations, gates, calculs et versioning.

## Risk Engine — 25 facteurs

| Domaine / poids | Codes et facteurs |
|---|---|
| Technical — 20 % | R01 Structural Risk ; R02 Roof Condition Risk ; R03 Electrical Risk ; R04 Installation Complexity ; R05 Maintenance Dependency |
| Contractual — 20 % | R06 Client Credit Risk ; R07 Contract Duration Risk ; R08 Occupancy Risk ; R09 Counterparty Concentration ; R10 Contract Termination Exposure |
| Regulatory — 15 % | R11 Planning / Regulatory Exposure ; R12 Regulatory Change Exposure ; R13 Authorization Dependency |
| Energy / Grid — 25 % | R14 Grid Dependency ; R15 Grid Single Point of Failure ; R16 Connection Risk ; R17 Energy Price Exposure ; R18 Production Variability |
| Systemic — 20 % | R19 Critical Infrastructure Proximity ; R20 Geographic Concentration ; R21 Supplier Dependency ; R22 Component Dependency ; R23 Climate Exposure ; R24 Portfolio Correlation ; R25 External Dependency |

Chaque facteur enregistre `exposure_score`, confiance, sévérité, preuve, statut et mitigation. Il est présenté comme `Cause → Evidence → Confidence → Mitigation`.

`Domain Risk = Σ(Risk × Weight × Confidence) / Σ(Weight × Confidence)`

`Global Risk = Σ(Domain Risk × Domain Weight)`

| Score | Niveau |
|---:|---|
| 0–20 | Very Low |
| 21–40 | Low |
| 41–60 | Moderate |
| 61–80 | High |
| 81–100 | Very High |

Un score faible de confiance exprime l'incertitude des données. Il ne doit pas être utilisé pour effacer une exposition prouvée, ni pour assimiler une inconnue à une exposition nulle.

## Resilience Engine — 12 paramètres

| Code | Paramètre |
|---|---|
| RES01 | Local Energy Production |
| RES02 | Self-Consumption Level |
| RES03 | Grid Dependency Reduction |
| RES04 | Energy Autonomy Potential |
| RES05 | Storage Capability |
| RES06 | Backup Capability |
| RES07 | Islanding Capability |
| RES08 | Critical Load Coverage |
| RES09 | Multi-Source Capability |
| RES10 | Geographic Diversification |
| RES11 | Operational Continuity |
| RES12 | Resilience Scalability |

Le modèle conserve notamment production locale, autoconsommation, réduction de dépendance réseau, autonomie, stockage, backup, islanding, charges critiques, diversification, continuité et extensibilité. Aucune capacité de backup/islanding ne peut être déduite de la seule présence de PV : elle exige une architecture technique démontrée.

## Gates et scénarios

Les gates critiques restent ceux du Certainty Engine. Ils demandent une revue humaine avec cause, preuve, date, confiance, règle déclenchée et action requise. Ils ne sont pas des rejets automatiques.

Les scénarios `BASE`, `DEGRADED` et `STRESS` sont des stress tests, non des prédictions. Variables : production, prix électricité, prix solaire, CAPEX, OPEX, autoconsommation, délai de raccordement. Sorties : CA, économies client, marge, TRI, VAN, DSCR, Risk, Certainty et Resilience.

## Next Best Action

Le moteur propose les actions ayant le meilleur compromis :

`40 % Risk Reduction + 30 % Certainty Gain + 20 % IR Gain + 10 % Cost / Time Efficiency`

Chaque action fournit problème, recommandation, priorité, risque actuel/potentiel et delta, Certainty actuel/potentiel et delta, gain de résilience, coût, délai, statut et assignation.

| Priorité | Sens |
|---|---|
| P1 | indispensable |
| P2 | fortement recommandée |
| P3 | optimisation |

Catalogue initial : obtenir étude structure, diagnostic toiture, historique de consommation, courbe de charge, étude/confirmation de raccordement, validation urbanisme, vérification droits site, données financières client, identification décideur, sécurisation engagement client, renégociation durée, devis EPC, optimisation dimensionnement/CAPEX, vérification hypothèses économiques, résolution contradiction documentaire, complétion dossier de preuves.

Une recommandation doit expliquer pourquoi : incertitude ou risque concerné, preuve, impact attendu, coût/délai, et non seulement afficher une liste générique.

## Versioning et audit

Les évaluations, scénarios, règles et actions conservent versions de framework/RuleSet/modèle, snapshot de données et horodatage. Toute évolution des règles passe par un RuleSet versionné et les tests de régression du dataset.
