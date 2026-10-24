/** Deterministic generator/checker. Prints JSON only; never downloads or changes files. */
import { readFile } from 'node:fs/promises';
import { loadPublicCatalog, DATA_ROOT } from '../analysis/src/neurolens/public-data/cognitive-lab.mjs';
const args = process.argv.slice(2);
if (args.length > 1 || (args.length && args[0] !== '--check')) {
  console.error('Usage: node scripts/public-data-web-catalog.mjs [--check]');
  process.exitCode = 2;
} else {
  const expected = JSON.stringify(await loadPublicCatalog(), null, 2) + '\n';
  if (args[0] === '--check') {
    if (await readFile(new URL('web-catalog.json', DATA_ROOT), 'utf8') !== expected) {
      console.error('Browser snapshot is stale or modified. Refuse to publish.');
      process.exitCode = 1;
    } else console.log('PASS: browser catalog matches all checksum-verified sources.');
  } else process.stdout.write(expected);
}
