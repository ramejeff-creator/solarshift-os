# Public simulator UX — 2026-10-12

Scope: presentation and map interaction in `public-simulator`, not canonical project data or financial policy.

- Detected and drawn outlines open their editing handles immediately. Returning to the map reopens the last outline. Save and cancel retain their original semantics.
- Roof slope remains a customer description for pitched roofs. Flat roofs display a read-only default and contextual help, not an editable panel-engineering choice.
- Shade, material and consumption explanations are explicit. Usable area reflects the selected percentage.
- Project timing is collected in `input.projectTiming` and shown in the hypothesis summary. Values: `asap`, `3-6-months`, `later`, `unknown`. The optional JSON export was removed at the user's request; printing remains available.
- The user explicitly deferred dashboard/lead delivery integration. No request is sent and no project/canonical parameter is created. Future ingestion must preserve timing as declared commercial metadata, separate from technical assumptions.
- Summary includes four KPIs, site preview, monthly production chart with axis and accessible data table, ACI/ACC percentages and volumes, consumption coverage, solar cost, financial detail, and return-on-investment year window read from the existing server projection. No financial policy was changed.
- Carbon equivalence uses Impact CO₂'s average diesel car, 142 gCO₂e/km, fabrication + use (https://impactco2.fr/outils/transport/voiturethermique, consulted 2026-10-12). It compares the existing gross RTE-based electricity equivalent with a car footprint; it is not a measured avoided-emissions balance or actual avoided travel.
- Public copy uses generic customer-facing descriptions instead of naming sources or exposing calibration coefficients. Calculations and internal traceability are unchanged. This is editorial discretion, not code confidentiality: browser-delivered modules remain inspectable.
- Hero illustrations are fitted inside their reserved desktop/tablet area and clipped to the hero on all screen sizes, preventing decorative artwork from covering the header/progress row.
- Exact annual consumption (including decimal kWh) is accepted instead of restricting input to multiples of 1000. Qualification validates actual enabled controls, not inherited fieldset invalidity, and identifies numeric consumption errors separately from missing choices.

Verification:

- `npm run ci`: foundation checks and unit tests, including map edit/cancel/save, presentation unknowns, DOM binding consistency, generic public copy and hero containment rules.
- `scripts/verify-public-simulator.mjs`: isolated headless Chrome; local static bundle, real read-only PVGIS calculation through the local preview service on port 3000. Optional `SOLARSHIFT_QA_URL` runs the same journey against the published page.
- Browser journey: GPS → building → manual outline → automatic handles → usable-area check → default flat-roof tilt → consumption and timing → live calculation → monthly values → financial figures → study CTA and absent export button → mobile overflow check → backward navigation and retained timing → map handles on return → pitched slope choice.
- Screenshots stored locally in ignored `output/simulator-qa/`; these use QA inputs, not an actual customer dossier.

Latest editorial/header/qualification patch verification:

- Foundation check and all 46 tests passed using Node with a reduced memory allowance (`--max-old-space-size=96 --max-semi-space-size=2`). The regular npm invocation hit a system out-of-memory failure before the checks; no application failure was observed in the successful reduced-memory run.
- Added browser checks for exact/decimal/empty annual consumption, negative-consumption feedback, and hero bounds at 1920/1440/768/390 px. This updated browser journey has not been rerun: available system virtual memory was approximately 500 MB, so another Chrome instance was avoided. Visual verification of this patch remains to be done.
