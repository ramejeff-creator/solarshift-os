# ADR-004 — Versionnement et activation des RuleSets

- Statut : accepté
- Date : 2026-09-17

## Décision

Les règles de scoring, poids, seuils, gates et définitions sont stockés dans des RuleSets versionnés. Un calcul conserve toujours `ruleset_code`, `ruleset_version`, `framework_version` et sa date de calcul.

Un RuleSet est préparé, revu puis activé ; une seule version peut être active pour un même code et une même période d’effet.

## Conséquences

- Aucun seuil métier ne doit être figé dans le frontend.
- Une modification de règle ne modifie pas l’historique des résultats déjà calculés.
- Les recalculs explicites utilisent la version active choisie et la consignent dans l’audit.

