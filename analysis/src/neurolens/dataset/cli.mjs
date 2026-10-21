#!/usr/bin/env node
/**
 * Deterministic W4.1 dataset builder.
 *
 * Usage:
 *   node analysis/src/neurolens/dataset/cli.mjs build --in <file.json...> --out <directory>
 *   node analysis/src/neurolens/dataset/cli.mjs build --in a.json --in b.json --out ./out
 *   node analysis/src/neurolens/dataset/cli.mjs build --in a.json --out ./out --id neurolens-w4-1
 *   node analysis/src/neurolens/dataset/cli.mjs build --in a.json --out ./out --report-only
 *
 * Exit codes:
 *   0  Validation succeeded. Dataset files written, or --report-only printed a success report.
 *   2  Usage error. No dataset written.
 *   3  Validation failed (fail-closed). No usable dataset or success manifest written.
 *   1  Unexpected I/O or runtime error. No success manifest written.
 *
 * On failure this command does not emit dataset.json or a success manifest.
 * It does not call network, D1, Sites, or OpenAI APIs. It does not use Date.now()
 * or Math.random() in the builder.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { DEFAULT_DATASET_ID, REASON_CODES, toCanonicalJson } from './contracts.mjs';
import { buildDataset } from './manifest.mjs';

export const EXIT = Object.freeze({
  OK: 0,
  UNEXPECTED: 1,
  USAGE: 2,
  VALIDATION: 3,
});

const USAGE = `Usage:
  node analysis/src/neurolens/dataset/cli.mjs build --in <file.json...> --out <directory>
  node analysis/src/neurolens/dataset/cli.mjs build --in a.json --in b.json --out ./out [--id <slug>]
  node analysis/src/neurolens/dataset/cli.mjs build --in a.json --out ./out --report-only

Exit codes: 0 success, 2 usage, 3 validation failure, 1 unexpected error.
Fail-closed: invalid inputs do not write dataset.json or a success manifest.`;

export function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    return { help: true };
  }
  const command = args[0];
  if (command !== 'build') {
    return { error: `Unknown command '${command}'.` };
  }
  const ins = [];
  let out = null;
  let id = DEFAULT_DATASET_ID;
  let reportOnly = false;
  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--report-only') {
      reportOnly = true;
      continue;
    }
    if (arg === '--in' || arg === '--out' || arg === '--id') {
      const values = [];
      i += 1;
      while (i < args.length && !args[i].startsWith('--')) {
        values.push(args[i]);
        i += 1;
      }
      i -= 1;
      if (values.length === 0) return { error: `${arg} requires a value.` };
      if (arg === '--in') ins.push(...values);
      else if (arg === '--out') out = values[0];
      else id = values[0];
      continue;
    }
    return { error: `Unknown argument '${arg}'.` };
  }
  if (ins.length === 0) return { error: '--in requires at least one JSON file.' };
  if (!out) return { error: '--out is required.' };
  return { command, ins, out, id, reportOnly };
}

async function readDocuments(paths) {
  const documents = [];
  for (const filePath of paths) {
    const raw = await readFile(filePath, 'utf8');
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      return {
        ok: false,
        reason_code: REASON_CODES.MALFORMED_OUTPUT,
        message: `File is not valid JSON: ${filePath}`,
        details: { label: basename(filePath) },
      };
    }
    documents.push({ label: basename(filePath), value });
  }
  return { ok: true, value: documents };
}

export async function runCli(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const parsed = parseArgs(argv);
  if (parsed.help) {
    stdout.write(`${USAGE}\n`);
    return EXIT.OK;
  }
  if (parsed.error) {
    stderr.write(`${parsed.error}\n${USAGE}\n`);
    return EXIT.USAGE;
  }

  const documents = await readDocuments(parsed.ins);
  if (!documents.ok) {
    stderr.write(`${toCanonicalJson(documents)}`);
    return EXIT.VALIDATION;
  }

  const built = buildDataset(documents.value, { dataset_id: parsed.id });
  if (!built.ok) {
    stderr.write(`${toCanonicalJson({
      ok: false,
      reason_code: built.reason_code,
      message: built.message,
      details: built.details ?? null,
    })}`);
    return EXIT.VALIDATION;
  }

  if (parsed.reportOnly) {
    stdout.write(toCanonicalJson({
      ok: true,
      report_only: true,
      dataset_id: built.value.manifest.dataset_id,
      output_fingerprint: built.value.manifest.output_fingerprint,
      counts: built.value.manifest.counts,
    }));
    return EXIT.OK;
  }

  await mkdir(parsed.out, { recursive: true });
  await writeFile(join(parsed.out, 'dataset.json'), toCanonicalJson(built.value));
  await writeFile(join(parsed.out, 'manifest.json'), toCanonicalJson(built.value.manifest));
  stdout.write(toCanonicalJson({
    ok: true,
    dataset_id: built.value.manifest.dataset_id,
    output_fingerprint: built.value.manifest.output_fingerprint,
    files: ['dataset.json', 'manifest.json'],
    counts: built.value.manifest.counts,
  }));
  return EXIT.OK;
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith('cli.mjs');
if (invokedDirectly) {
  runCli(process.argv).then((code) => {
    process.exit(code);
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(EXIT.UNEXPECTED);
  });
}
