# CR-001 Energy Foundation — RLS integration test plan

Run against a migrated Supabase test project.

1. Create two organisations and one project each. Confirm a member of organisation A cannot read profiles, points, runs, KPI or scenario rows for organisation B.
2. Grant an INVESTOR project access. Confirm they can read only scenarios with status `PUBLISHED`; confirm DRAFT, CALCULATED and VALIDATED scenarios remain hidden.
3. Confirm an internal project role can read all project scenarios, profiles, runs and KPIs.
4. Confirm anonymous and authenticated clients cannot insert/update/delete CR-001 tables directly; server-mediated writes only.
5. Insert/update/delete each auditable entity and verify `audit_log` contains the project, entity type, operation and payloads.
6. Promote a validated C03 and C09 KPI as an authorised user. Verify exactly one new append-only `project_parameters` row per promotion, with `CALCULATION` source and the calculation run/KPI reference.
7. Attempt to promote an unvalidated KPI, a non-C03/C09 KPI, and an unauthorised project KPI; each must fail.
