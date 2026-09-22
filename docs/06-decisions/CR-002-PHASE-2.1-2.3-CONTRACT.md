# CR-002 — Implementation contract for phases 2.1–2.3

This contract records the approved Product Owner decisions without changing the
Data Dictionary v1.2, scoring rules, Investment Readiness v1.1 or Energy Engine formulas.

## Canonicality

- A simulation session is persisted for working convenience and is always non-canonical.
- Browser previews are non-canonical and must be reconciled with a versioned server run.
- A calculation run is reproducible input/output evidence, not a canonical parameter by itself.
- A scenario becomes investment-eligible only after an authorized validation.
- Investor visibility additionally requires an explicit publication and an active scenario ACL.
- C03 and C09 remain the backward-compatible canonical references. They are updated only by
  the controlled promotion of a validated calculated KPI; freezing, validating or publishing a
  scenario never updates them implicitly.

## Lifecycle

`WORKING simulation → FREEZE → DRAFT scenario → CALCULATED → VALIDATED → PUBLISHED → RETIRED`

- WORKING simulations may be edited and receive calculation-run references.
- FREEZE captures assumptions, working configuration, technical configuration reference and
  latest run reference in an immutable snapshot, then creates a new DRAFT scenario.
- Freeze never overwrites an existing scenario. A changed configuration requires a new version.
- Only CALCULATED scenarios may be validated.
- SOLARSHIFT, ADMIN and authorized EXPERT roles may validate.
- Only SOLARSHIFT and ADMIN may publish or revoke publication.
- Revocation returns the scenario to VALIDATED, revokes every active investor grant and is audited.
- Validated, published and retired scenario content is immutable.

## Retention

Working simulations expire 90 days after their last activity by default. The retention period is
stored per simulation and remains configurable. A promoted simulation keeps its frozen snapshot
permanently through the scenario reference. Expiry execution is an operational cleanup concern;
the migration only provides the status, dates and index required by that job.

## Technical and external engineering data

- Technical configuration fields are nullable: null means UNKNOWN and is not equivalent to zero.
- A scenario references a frozen technical configuration.
- No equipment catalog is introduced in V1; manufacturer and model are snapshot fields.
- External results retain engine, source reference, methodology, evidence, quality and provenance.
- PVGIS results are theoretical production/yield inputs and cannot be stored as P50 or P90.
- P50/P90 require an Evidence-linked, VALIDATED external result. No internal haircut is permitted.
- Commercial pre-analysis may be calculated and saved without P50/P90. Its PVGIS production and
  financial outputs remain explicitly indicative and may reach `CALCULATED`, but not `VALIDATED`.
- Promotion from `CALCULATED` to `VALIDATED` requires current P50 and P90 versions linked to the
  scenario, backed by Evidence and validated as external engineering results.

## Authorization summary

| Action | Authorized roles |
|---|---|
| Edit working simulation | ADMIN, SOLARSHIFT, MANDATAIRE, EXPERT with project access |
| Freeze simulation | ADMIN, SOLARSHIFT, MANDATAIRE, EXPERT with project access |
| Validate scenario | ADMIN, SOLARSHIFT, authorized EXPERT |
| Publish/revoke | ADMIN, SOLARSHIFT |
| Read published scenario as investor | INVESTOR plus active scenario-specific grant |

Direct client writes to the new tables remain disabled. Mutations are mediated by audited services
or RPCs. Sensitive role-specific financial visibility is reserved for the later authorized phase.
