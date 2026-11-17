import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** research/out/<name>, relative to this file; the folder is gitignored. */
export function outPath(name: string): string {
  const path = fileURLToPath(new URL(`./out/${name}`, import.meta.url));
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

/** Append one line to research/out/<name> straight away, so progress is visible while a run is going. */
export function record(name: string, line: string): void {
  appendFileSync(outPath(name), line + '\n');
}
