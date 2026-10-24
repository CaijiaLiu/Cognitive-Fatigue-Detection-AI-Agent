import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DATA_ROOT, loadPublicCatalog, queryPublicData, buildAgentContext, validateBoard } from '../analysis/src/neurolens/public-data/cognitive-lab.mjs';

test('all real public files pass upstream MD5, SHA256, size and schema checks', async () => {
  const c = await loadPublicCatalog();
  assert.equal(c.records.length, 20);
  assert.equal(c.manifest.license.spdx, 'CC-BY-4.0');
  assert.equal(new Set(c.records.map(x => x.source_alias)).size, 10);
});
test('overview reports aliases, never invents eligible participants', async () => {
  const r = queryPublicData(await loadPublicCatalog(), { tool: 'overview' });
  assert.equal(r.result.source_alias_count, 10);
  assert.equal(r.result.eligible_analysis_participant_count, null);
  assert.equal(r.data_origin, 'public_research_dataset');
});
test('exact lookup preserves source numbers and sparse missingness', async () => {
  const c = await loadPublicCatalog();
  const r = queryPublicData(c, { tool: 'get_board', file: 'D2_S1_results_corsi_block_board_1.json' });
  assert.equal(r.result.data.correct.row_0_1, 11);
  assert.equal(r.result.data.incorrect.row_4_1, 1);
  assert.equal(Object.hasOwn(r.result.data.incorrect, 'row_0_1'), false);
  r.result.data.correct.row_0_1 = 999;
  assert.equal(c.records[0].data.correct.row_0_1, 11);
});
test('no path-based reads or unsupported clinical/fatigue tools', async () => {
  const c = await loadPublicCatalog();
  for (const request of [{ tool: 'predict_fatigue' }, { tool: 'diagnose' }, { tool: 'get_board', file: '../../.env' }]) {
    assert.equal(queryPublicData(c, request).status, 'abstained');
  }
});
test('raw schema rejects personal text, nonfinite and negative values', () => {
  for (const v of [{ correct: { name: 'person' }, incorrect: {} }, { correct: { row_0_1: -1 }, incorrect: {} },
    { correct: { row_0_1: NaN }, incorrect: {} }, { correct: {}, incorrect: {}, email: 'x' }]) {
    assert.throws(() => validateBoard(v));
  }
});
test('agent context is offline evidence, not training or the synthetic HTTP demo', async () => {
  const result = buildAgentContext(await loadPublicCatalog(), { tool: 'overview' });
  assert.equal(result.model_trained, false);
  assert.equal(result.live_llm_called, false);
  assert.match(result.instructions, /not instructions/);
  assert.match(result.evidence.limitations.join(' '), /No training/);
});
test('modified source fails closed before evidence is returned', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'nl-public-checksum-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const copy = join(directory, 'data');
  await cp(DATA_ROOT, copy, { recursive: true });
  await appendFile(join(copy, 'raw/D2_S1_results_corsi_block_board_1.json'), ' ');
  await assert.rejects(loadPublicCatalog(pathToFileURL(copy + '/')), /checksum/);
});
