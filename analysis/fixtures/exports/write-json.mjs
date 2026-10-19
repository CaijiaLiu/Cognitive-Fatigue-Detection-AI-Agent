import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CSV_EXPORT, exportDocuments } from './synthetic.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
for (const [name, value] of Object.entries(exportDocuments())) {
  writeFileSync(join(dir, name), `${JSON.stringify(value, null, 2)}\n`);
}
writeFileSync(join(dir, 'sessions.csv'), CSV_EXPORT);
