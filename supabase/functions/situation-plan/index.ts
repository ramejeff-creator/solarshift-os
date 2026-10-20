import { handleSituationPlanRequest } from '../_shared/situation-plan-handler.mjs';
// Bounded public geographic rendering only; no project or account access.
Deno.serve((request) => handleSituationPlanRequest(request));
