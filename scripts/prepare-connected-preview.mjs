import { lstat, realpath, symlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const target = new URL('../previews/mission/dist/',import.meta.url);
const link = new URL('../public/mission',import.meta.url);
await lstat(target);
try {
  await lstat(link);
  if (await realpath(link) !== await realpath(target)) throw Error('public/mission exists and is not the expected preview link. Refusing to overwrite.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  await symlink(process.platform === 'win32' ? fileURLToPath(target) : '../previews/mission/dist',fileURLToPath(link),process.platform === 'win32' ? 'junction' : 'dir');
}
console.log('Connected preview ready: /mission/index.html and /research-agent share one browser origin.');
