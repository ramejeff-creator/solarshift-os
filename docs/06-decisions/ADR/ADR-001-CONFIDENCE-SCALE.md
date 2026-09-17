# ADR-001 — Échelle de confiance

- Statut : accepté
- Date : 2026-09-17
- Décideur métier : propriétaire du projet SolarShift

## Contexte

Les sources contiennent deux variantes incompatibles pour les coefficients de confiance L1 à L4. Le Data Dictionary v1.2 indique `.35/.55/.75/.90`, tandis que le Certainty Engine v1.1 indique `.25/.50/.70/.85`.

## Décision

SolarShift OS adopte l’échelle du Certainty Engine v1.1 pour tous les calculs nouveaux :

| Niveau | Coefficient |
| --- | ---: |
| L0 | 0.00 |
| L1 | 0.25 |
| L2 | 0.50 |
| L3 | 0.70 |
| L4 | 0.85 |
| L5 | 1.00 |

La formule de référence est `effective_score = raw_score × confidence_coefficient`.

## Conséquences

- Les RuleSets de Certainty, Risk et Resilience doivent référencer cette table versionnée.
- Les sources originales restent inchangées et traçables.
- Tout score doit enregistrer la version du RuleSet utilisée.

