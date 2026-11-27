import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from './platform.js';

let cached = null;

/** Phiên bản ứng dụng, đọc từ package.json (một nguồn duy nhất). */
export function appVersion() {
  if (cached) return cached;
  try {
    cached = JSON.parse(readFileSync(join(projectRoot(), 'package.json'), 'utf8')).version;
  } catch {
    cached = '0.0.0-unknown';
  }
  return cached;
}
