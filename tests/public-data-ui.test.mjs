import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadPublicCatalog } from '../analysis/src/neurolens/public-data/cognitive-lab.mjs';
import { buildAgentContext } from '../analysis/src/neurolens/public-data/evidence.mjs';

const snapshotUrl = new URL('../analysis/datasets/cognitive-lab/web-catalog.json', import.meta.url);
test('browser snapshot equals checksum-verified sources including every raw count', async () => {
  const snapshot = JSON.parse(await readFile(snapshotUrl, 'utf8'));
  assert.deepEqual(snapshot, await loadPublicCatalog());
  assert.equal(snapshot.records.length, 20);
});
test('web and CLI use the same pure query contract and preserve abstention', async () => {
  const snapshot = JSON.parse(await readFile(snapshotUrl, 'utf8'));
  for (const request of [{ tool: 'overview' }, { tool: 'get_board', file: snapshot.records[0].source_file }, { tool: 'predict_fatigue' }]) {
    assert.deepEqual(buildAgentContext(snapshot, request), buildAgentContext(await loadPublicCatalog(), request));
  }
});
test('browser evidence module has no Node, network or provider dependency', async () => {
  const source = await readFile(new URL('../analysis/src/neurolens/public-data/evidence.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /node:|\bfetch\s*\(|OPENAI_API_KEY|\bimport\s/);
});
test('page keeps public source lookup separate from the original synthetic demo', async () => {
  const page = await readFile(new URL('../app/research-agent/page.tsx', import.meta.url), 'utf8');
  const panel = await readFile(new URL('../app/research-agent/public-data-panel.tsx', import.meta.url), 'utf8');
  assert.match(page, /<PublicDataPanel/);
  assert.match(page, /Original synthetic Agent demo/);
  assert.match(page, /<ResearchAgentPanel/);
  assert.match(panel, /Not recorded/);
  assert.match(panel, /CC BY 4.0/);
  assert.match(panel, /Insufficient evidence/);
  assert.doesNotMatch(panel, /getUserMedia|OPENAI_API_KEY|\bfetch\s*\(/);
});
