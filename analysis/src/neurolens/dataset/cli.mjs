#!/usr/bin/env node
/**
 * Deterministic W4.1 dataset builder.
 *
 * Usage:
 *   node analysis/src/neurolens/dataset/cli.mjs build --in <file.json...> --out <directory>
 *   node analysis/src/neurolens/dataset/cli.mjs build --in a.json --in b.json --out ./out
 *   node analysis/src/neurolens/dataset/cli.mjs build --in a.json --out ./out --id neurolens-w4-1
 *   node analysis/src/neurolens/dataset/cli.mjs build --in a.json --out ./out --report-only
 *   node analysis/src/neurolens/dataset/cli.mjs build --in a.json --out ./out --replace
 *
 * Exit codes:
 *   0  Validation succeeded. Dataset files written, or --report-only printed a success report.
 *   2  Usage error (including refusing to overwrite an existing dataset). No dataset written.
 *   3  Validation failed (fail-closed). No usable dataset or success manifest written.
 *   1  Unexpected I/O or runtime error. Staging cleaned; previous published pair left intact.
 *
 * Publication strategy:
 *   1. Validate fully before touching --out.
 *   2. Refuse non-empty existing --out unless --replace.
 *   3. Write the complete dataset.json + manifest.json pair into a sibling staging directory.
 *   4. Publish by renaming the staging directory onto --out (empty existing dirs are swapped).
 *   5. --replace retires the previous directory, then renames staging into place; a failed
 *      rename restores the retired directory.
 *   6. Staging/retired leftovers are removed after failure.
 *
 * A failed or interrupted build cannot leave a new dataset.json paired with an old
 * success manifest. The builder does not call network, D1, Sites, or OpenAI APIs
 * and does not use Date.now() or Math.random() in dataset content.
 */
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { DEFAULT_DATASET_ID, REASON_CODES, toCanonicalJson } from './contracts.mjs';
import { buildDataset } from './manifest.mjs';

export const EXIT = Object.freeze({
  OK: 0,
  UNEXPECTED: 1,
  USAGE: 2,
  VALIDATION: 3,
});

export const PUBLISHED_FILES = Object.freeze(['dataset.json', 'manifest.json']);
export const STAGING_DIR_PREFIX = '.nl-dataset-staging-';
export const RETIRED_DIR_PREFIX = '.nl-dataset-retired-';

const USAGE = `Usage:
  node analysis/src/neurolens/dataset/cli.mjs build --in <file.json...> --out <directory>
  node analysis/src/neurolens/dataset/cli.mjs build --in a.json --in b.json --out ./out [--id <slug>]
  node analysis/src/neurolens/dataset/cli.mjs build --in a.json --out ./out --report-only
  node analysis/src/neurolens/dataset/cli.mjs build --in a.json --out ./out --replace

Exit codes: 0 success, 2 usage (including existing output without --replace), 3 validation failure, 1 unexpected error.
Publication: stage a complete dataset.json + manifest.json pair, then rename onto --out.
Refuse to overwrite a non-empty existing --out unless --replace. Failures clean staging and leave any previous pair intact.`;

const defaultFs = Object.freeze({
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
});

function fsFrom(io) {
  return {
    mkdir: io.mkdir ?? defaultFs.mkdir,
    mkdtemp: io.mkdtemp ?? defaultFs.mkdtemp,
    readFile: io.readFile ?? defaultFs.readFile,
    readdir: io.readdir ?? defaultFs.readdir,
    rename: io.rename ?? defaultFs.rename,
    rm: io.rm ?? defaultFs.rm,
    stat: io.stat ?? defaultFs.stat,
    writeFile: io.writeFile ?? defaultFs.writeFile,
  };
}

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
  let replace = false;
  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--report-only') {
      reportOnly = true;
      continue;
    }
    if (arg === '--replace') {
      replace = true;
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
  return { command, ins, out, id, reportOnly, replace };
}

async function pathExists(fsApi, target) {
  try {
    await fsApi.stat(target);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
}

function safeDirToken(outDir) {
  const token = basename(outDir) || 'dataset';
  return token.replace(/[^A-Za-z0-9._-]/g, '_');
}

async function removeIfExists(fsApi, target) {
  await fsApi.rm(target, { recursive: true, force: true });
}

export async function listPublishedArtifacts(fsApi, directory) {
  const found = [];
  for (const name of PUBLISHED_FILES) {
    if (await pathExists(fsApi, join(directory, name))) found.push(name);
  }
  return found;
}

async function inspectOutputDirectory(fsApi, outDir) {
  if (!(await pathExists(fsApi, outDir))) {
    return { exists: false, entries: [], published: [] };
  }
  const entries = await fsApi.readdir(outDir);
  const published = await listPublishedArtifacts(fsApi, outDir);
  return { exists: true, entries, published };
}

/**
 * Write a complete published pair into a sibling staging directory, then rename
 * that directory onto `outDir`. Never writes dataset.json without a matching
 * new manifest in the same published generation.
 */
export async function publishDataset(outDir, files, options = {}) {
  const fsApi = options.fsApi ?? defaultFs;
  const replace = options.replace === true;
  const parent = dirname(outDir) || '.';
  const token = safeDirToken(outDir);
  await fsApi.mkdir(parent, { recursive: true });

  const inspection = await inspectOutputDirectory(fsApi, outDir);
  if (inspection.exists && inspection.entries.length > 0 && !replace) {
    const listed = inspection.published.length > 0
      ? inspection.published.join(', ')
      : 'existing files';
    return {
      ok: false,
      exit: EXIT.USAGE,
      message: `Output directory already contains ${listed}. Refusing to overwrite without --replace.`,
      details: { out: outDir, published: inspection.published },
    };
  }

  const staging = await fsApi.mkdtemp(join(parent, `${STAGING_DIR_PREFIX}${token}-`));
  let stagingLive = true;
  let retired = null;
  try {
    for (const name of PUBLISHED_FILES) {
      if (!Object.hasOwn(files, name)) {
        throw new Error(`Missing staged file ${name}.`);
      }
      await fsApi.writeFile(join(staging, name), files[name]);
    }
    const staged = await listPublishedArtifacts(fsApi, staging);
    if (staged.length !== PUBLISHED_FILES.length) {
      throw new Error('Staging did not contain a complete dataset pair.');
    }

    if (!inspection.exists) {
      await fsApi.rename(staging, outDir);
      stagingLive = false;
      return { ok: true };
    }

    retired = await fsApi.mkdtemp(join(parent, `${RETIRED_DIR_PREFIX}${token}-`));
    await removeIfExists(fsApi, retired);
    await fsApi.rename(outDir, retired);
    try {
      await fsApi.rename(staging, outDir);
      stagingLive = false;
    } catch (error) {
      await fsApi.rename(retired, outDir);
      retired = null;
      throw error;
    }
    await removeIfExists(fsApi, retired);
    return { ok: true };
  } catch (error) {
    if (stagingLive) await removeIfExists(fsApi, staging);
    throw error;
  }
}

async function readDocuments(paths, fsApi) {
  const documents = [];
  for (const filePath of paths) {
    const raw = await fsApi.readFile(filePath, 'utf8');
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
  const fsApi = fsFrom(io);
  const parsed = parseArgs(argv);
  if (parsed.help) {
    stdout.write(`${USAGE}\n`);
    return EXIT.OK;
  }
  if (parsed.error) {
    stderr.write(`${parsed.error}\n${USAGE}\n`);
    return EXIT.USAGE;
  }

  const documents = await readDocuments(parsed.ins, fsApi);
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

  const files = {
    'dataset.json': toCanonicalJson(built.value),
    'manifest.json': toCanonicalJson(built.value.manifest),
  };
  let published;
  try {
    published = await publishDataset(parsed.out, files, { replace: parsed.replace, fsApi });
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    return EXIT.UNEXPECTED;
  }
  if (!published.ok) {
    stderr.write(`${published.message}\n${USAGE}\n`);
    return published.exit ?? EXIT.USAGE;
  }

  stdout.write(toCanonicalJson({
    ok: true,
    dataset_id: built.value.manifest.dataset_id,
    output_fingerprint: built.value.manifest.output_fingerprint,
    files: [...PUBLISHED_FILES],
    counts: built.value.manifest.counts,
    replaced: parsed.replace,
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
