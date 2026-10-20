import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeProjectTransfer, sameProjectSite } from '../../public-simulator/app/project-transfer.mjs';
test('transfer appends local qualification without losing cloud identity, unknown preview fields or source dates', () => {
  const local = { name: 'MURET', address: 'Adresse de test', clientName: '', preview: { schemaVersion: 1, controls: { cons: '120000' }, parcelQualification: { horizon: { retrievedAt: '2026-10-20T07:49:54Z', profile: [1, 2] } }, roofs: { surfaces: [{ id: 'local-roof' }] } } };
  const cloud = { name: 'Muret', address: 'Adresse de test', clientName: 'Identité conservée', version: 4, commercialStatus: 'IN_PROGRESS', preview: { controls: { extra: 'preserved', cons: 'older' }, extension: { preserved: true }, siteQualification: { activityKnowledge: 'KNOWN', activityLabel: 'Tertiaire' } } };
  const before = structuredClone({ local, cloud }); const merged = mergeProjectTransfer(local, cloud, { localDraftId: 'draft', localVersion: 10 });
  assert.equal(merged.clientName, cloud.clientName); assert.equal(merged.preview.controls.extra, 'preserved'); assert.equal(merged.preview.controls.cons, '120000');
  assert.deepEqual(merged.preview.parcelQualification, local.preview.parcelQualification); assert.deepEqual(merged.preview.roofs, local.preview.roofs);
  assert.deepEqual(merged.preview.extension, cloud.preview.extension); assert.deepEqual(merged.preview.siteQualification, cloud.preview.siteQualification);
  assert.equal(merged.preview.transferProvenance.previousCloudVersion, 4); assert.equal(merged.preview.transferProvenance.localVersion, 10);
  assert.deepEqual({ local, cloud }, before);
});
test('transfer refuses another site and keeps existing contours, qualification and risks when local information is absent', () => {
  const cloud = { name: 'Site', address: 'Adresse', preview: { roofs: { surfaces: [{ id: 'kept' }] }, parcelQualification: { kept: true }, risks: [{ id: 'kept-risk' }] } };
  const local = { name: 'Site', address: 'Adresse', preview: { roofs: { surfaces: [] }, risks: [] } };
  const merged = mergeProjectTransfer(local, cloud);
  assert.deepEqual(merged.preview.roofs, cloud.preview.roofs); assert.deepEqual(merged.preview.risks, cloud.preview.risks); assert.deepEqual(merged.preview.parcelQualification, cloud.preview.parcelQualification);
  assert.equal(sameProjectSite({ name: 'Site', address: 'Autre adresse' }, cloud), false);
  assert.throws(() => mergeProjectTransfer({ ...local, address: 'Autre adresse' }, cloud), /correspondre/);
});
