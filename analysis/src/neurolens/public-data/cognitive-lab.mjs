/** Public-data evidence boundary. Not the V1 collector schema or a trained model. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const DATA_ROOT = new URL('../../../datasets/cognitive-lab/', import.meta.url);
export { LIMITATIONS, validateBoard, queryPublicData, buildAgentContext } from "./evidence.mjs";
import { validateBoard } from "./evidence.mjs";

export async function loadPublicCatalog(root = DATA_ROOT) {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  if (manifest.schema_version !== 'cognitive-lab-subset/0.1'
      || manifest.license.spdx !== 'CC-BY-4.0'
      || manifest.dataset_version !== 3 || manifest.files.length !== 20) throw Error('Unsupported manifest');
  const names = new Set();
  const records = [];
  for (const file of manifest.files) {
    if (!/^D2_S\d+_results_(?:corsi_block_)?board(?:_[12])?\.json$/.test(file.name)
        || names.has(file.name)) throw Error('Unsafe or duplicate file');
    names.add(file.name);
    const bytes = await readFile(new URL(`raw/${file.name}`, root));
    // The Git text copies have exactly one added LF; hashes describe original Figshare bytes.
    const sourceBytes = bytes.subarray(0, file.bytes);
    if (bytes.length !== file.bytes + 1 || bytes.at(-1) !== 10
        || createHash('sha256').update(sourceBytes).digest('hex') !== file.sha256
        || createHash('md5').update(sourceBytes).digest('hex') !== file.upstream_md5) throw Error('Source checksum mismatch');
    const data = validateBoard(JSON.parse(bytes.toString('utf8')));
    records.push({
      record_ref: `cognitive-lab:${file.name}`,
      source_alias: file.name.match(/^D2_(S\d+)_/)[1],
      source_file: file.name,
      source_url: file.download_url,
      sha256: file.sha256,
      data,
    });
  }
  return { manifest, records };
}
