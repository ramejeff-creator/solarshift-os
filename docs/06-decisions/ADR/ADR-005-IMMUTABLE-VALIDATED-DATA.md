# ADR-005 — Données validées, preuve et audit immuables

- Statut : accepté
- Date : 2026-09-17

## Décision

Une valeur validée n’est jamais écrasée. Toute correction crée une nouvelle version du paramètre, liée à ses preuves, sa source, sa méthode, son niveau de confiance et sa validation.

L’historique conserve l’ancienne et la nouvelle valeur, l’auteur, la date et le motif dans `audit_log`. Une contradiction conserve ses deux preuves jusqu’à résolution documentée.

## Conséquences

- Prévoir une contrainte d’unicité sur la version d’un paramètre par projet, pas seulement sur son code.
- Les KPI et scores sont des sorties calculées distinctes des paramètres sources.
- Les tests de régression doivent vérifier conservation de la preuve, résolution de contradiction et traçabilité de chaque recalcul.

