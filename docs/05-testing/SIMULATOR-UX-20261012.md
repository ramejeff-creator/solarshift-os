# Public simulator UX — 2026-10-12

Scope: presentation and map interaction in `public-simulator`, not canonical project data or financial policy.

- Detected and drawn outlines open their editing handles immediately. Returning to the map reopens the last outline. Save and cancel retain their original semantics.
- Roof slope remains a customer description for pitched roofs. Flat roofs display a read-only default and contextual help, not an editable panel-engineering choice.
- Shade, material and consumption explanations are explicit. Usable area reflects the selected percentage.
- Project timing is collected in `input.projectTiming` and shown in the hypothesis summary. Values: `asap`, `3-6-months`, `later`, `unknown`. The optional JSON export was removed at the user's request; printing remains available.
- The user explicitly deferred dashboard/lead delivery integration. No request is sent and no project/canonical parameter is created. Future ingestion must preserve timing as declared commercial metadata, separate from technical assumptions.
- Summary includes four KPIs, site preview, monthly production chart with axis and accessible data table, ACI/ACC percentages and volumes, consumption coverage, solar cost, financial detail, and return-on-investment year window read from the existing server projection. No financial policy was changed.
- Carbon equivalence uses Impact CO₂'s average diesel car, 142 gCO₂e/km, fabrication + use (https://impactco2.fr/outils/transport/voiturethermique, consulted 2026-10-12). It compares the existing gross RTE-based electricity equivalent with a car footprint; it is not a measured avoided-emissions balance or actual avoided travel.

Verification:

- `npm run ci`: foundation checks and 43 tests, including map edit/cancel/save, presentation unknowns and DOM binding consistency.
- `scripts/verify-public-simulator.mjs`: isolated headless Chrome; local static bundle, real read-only PVGIS calculation through the local preview service on port 3000. Optional `SOLARSHIFT_QA_URL` runs the same journey against the published page.
- Browser journey: GPS → building → manual outline → automatic handles → usable-area check → default flat-roof tilt → consumption and timing → live calculation → monthly values → financial figures → study CTA and absent export button → mobile overflow check → backward navigation and retained timing → map handles on return → pitched slope choice.
- Screenshots stored locally in ignored `output/simulator-qa/`; these use QA inputs, not an actual customer dossier.
