# ADR-002 — Gates et statut projet

- Statut : accepté
- Date : 2026-09-17

## Décision

Un gate est un objet distinct du statut du projet. `HUMAN_REVIEW_REQUIRED` est l’état d’un gate, pas un statut projet.

Les statuts projet restent : `LEAD`, `QUALIFICATION`, `DATA_COLLECTION`, `ANALYSIS`, `VALIDATION`, `PRE_FINANCEABLE`, `FINANCEABLE`, `CONTRACTING`, `EXECUTION`, `OPERATING`, `ARCHIVED`.

Un gate ouvert peut bloquer une transition, notamment vers `FINANCEABLE`, mais ne dégrade jamais silencieusement une donnée inconnue en donnée défavorable.

## Conséquences

- Créer une entité de gate versionnée, avec code, état, motif, preuves, règle et résolution.
- Le moteur de statut consulte les gates actifs ; le frontend ne change pas librement les statuts dépendant des règles.
- La résolution d’un gate déclenche la chaîne de recalcul et une entrée d’audit.

