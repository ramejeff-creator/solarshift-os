# ADR-003 — Modèle d’accès multi-organisation

- Statut : accepté
- Date : 2026-09-17

## Décision

L’autorisation repose sur des organisations, des appartenances et des attributions de projet, appliquées par RLS dans PostgreSQL/Supabase.

| Rôle | Portée minimale |
| --- | --- |
| ADMIN | accès global contrôlé |
| SOLARSHIFT | projets de son périmètre SolarShift |
| MANDATAIRE | projets, clients et documents qui lui sont attribués |
| EXPERT | projets explicitement attribués pour revue |
| CLIENT | ses projets et documents explicitement autorisés |
| INVESTOR | dossiers explicitement autorisés |
| INSTITUTION | accès explicite, limité au besoin documenté |

## Conséquences

- `organizations`, `organization_memberships` et `project_access_grants` précèdent toute donnée métier en migration.
- Les fichiers Storage suivent la même portée que les projets.
- Les Edge Functions utilisent l’identité authentifiée et ne contournent pas les politiques RLS sans contrôle explicite.

