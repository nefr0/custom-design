// File discovery: explicit files are taken as given, directories are walked.
import fs from 'node:fs';
import path from 'node:path';

import { SCANNABLE_EXTS } from './scan-content.mjs';

const SKIPPED_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);

export function isScannable(filePath) {
  return SCANNABLE_EXTS.has(path.extname(filePath).toLowerCase());
}

function walkDirectory(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIPPED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDirectory(full, files);
    else if (entry.isFile() && isScannable(full)) files.push(full);
  }
}

// Returns { files, missing } so the caller can report unreadable targets as a usage error.
export function collectFiles(targets) {
  const files = [];
  const missing = [];
  for (const target of targets) {
    let stat = null;
    try {
      stat = fs.statSync(target);
    } catch {
      missing.push(target);
      continue;
    }
    if (stat.isDirectory()) walkDirectory(target, files);
    else if (stat.isFile() && isScannable(target)) files.push(target);
  }
  return { files: [...new Set(files)].sort(), missing };
}
