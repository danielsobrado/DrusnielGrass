#!/usr/bin/env node

/**
 * LOC (Lines of Code) Counter for FluffyGrass
 * Fast, accurate, zero-dependency codebase metrics.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// Command line arguments
const args = process.argv.slice(2);
let targetDir = REPO_ROOT;
let showByDir = true;
let showHelp = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') {
    showHelp = true;
  } else if (arg === '--no-dir') {
    showByDir = false;
  } else if (arg === '--by-dir' || arg === '-d') {
    showByDir = true;
  } else if (!arg.startsWith('-')) {
    targetDir = path.resolve(process.cwd(), arg);
  }
}

if (showHelp) {
  console.log(`
Usage: node scripts/loc.mjs [path] [options]

Options:
  -d, --by-dir    Show breakdown by directory (default: true)
  --no-dir        Hide directory breakdown
  -h, --help      Show this help message

Examples:
  node scripts/loc.mjs
  node scripts/loc.mjs src
  node scripts/loc.mjs --no-dir
`);
  process.exit(0);
}

const EXCLUDE_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.shots',
  '.tmp-screenshots',
  '.claude',
  '.gemini',
  '.vscode',
  '.idea',
  'coverage',
  'build'
]);

const EXCLUDE_FILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb'
]);

const BINARY_EXTENSIONS = new Set([
  '.glb', '.gltf', '.bin', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico',
  '.svg', '.mp3', '.wav', '.ogg', '.zip', '.tar', '.gz', '.7z', '.pdf',
  '.log', '.exe', '.dll', '.so', '.dylib', '.woff', '.woff2', '.ttf', '.eot'
]);

const LANGUAGE_MAP = {
  '.ts': { name: 'TypeScript', category: 'Code' },
  '.tsx': { name: 'TypeScript React', category: 'Code' },
  '.d.ts': { name: 'TypeScript Decl', category: 'Code' },
  '.js': { name: 'JavaScript', category: 'Code' },
  '.jsx': { name: 'JavaScript React', category: 'Code' },
  '.mjs': { name: 'JavaScript ESM', category: 'Code' },
  '.cjs': { name: 'JavaScript CJS', category: 'Code' },
  '.css': { name: 'CSS', category: 'Code' },
  '.scss': { name: 'SCSS', category: 'Code' },
  '.sass': { name: 'Sass', category: 'Code' },
  '.less': { name: 'Less', category: 'Code' },
  '.html': { name: 'HTML', category: 'Code' },
  '.htm': { name: 'HTML', category: 'Code' },
  '.glsl': { name: 'GLSL Shader', category: 'Code' },
  '.vert': { name: 'GLSL Vertex', category: 'Code' },
  '.frag': { name: 'GLSL Fragment', category: 'Code' },
  '.wgsl': { name: 'WGSL Shader', category: 'Code' },
  '.ps1': { name: 'PowerShell', category: 'Script' },
  '.sh': { name: 'Shell / Bash', category: 'Script' },
  '.bat': { name: 'Batch Script', category: 'Script' },
  '.cmd': { name: 'Batch Script', category: 'Script' },
  '.json': { name: 'JSON', category: 'Data/Config' },
  '.yaml': { name: 'YAML', category: 'Data/Config' },
  '.yml': { name: 'YAML', category: 'Data/Config' },
  '.toml': { name: 'TOML', category: 'Data/Config' },
  '.xml': { name: 'XML', category: 'Data/Config' },
  '.md': { name: 'Markdown', category: 'Docs' },
  '.txt': { name: 'Plain Text', category: 'Docs' }
};

function collectFiles(dir) {
  let fileList = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.has(entry.name)) {
          fileList = fileList.concat(collectFiles(path.join(dir, entry.name)));
        }
      } else if (entry.isFile()) {
        const name = entry.name;
        const ext = path.extname(name).toLowerCase();
        if (EXCLUDE_FILES.has(name)) continue;
        if (BINARY_EXTENSIONS.has(ext)) continue;
        if (name.startsWith('.vite-') && name.endsWith('.log')) continue;
        fileList.push(path.join(dir, name));
      }
    }
  } catch (err) {
    // skip unreadable directories
  }
  return fileList;
}

const files = collectFiles(targetDir);

const langStats = {};
const dirStats = {};

let grandTotalFiles = 0;
let grandTotalLines = 0;
let grandTotalBlank = 0;
let grandTotalComment = 0;
let grandTotalCode = 0;

for (const filePath of files) {
  const fileName = path.basename(filePath);
  let ext = path.extname(fileName).toLowerCase();
  if (fileName.toLowerCase().endsWith('.d.ts')) {
    ext = '.d.ts';
  }
  if (!ext) {
    ext = '(no ext)';
  }

  const langInfo = LANGUAGE_MAP[ext] || { name: `Other (${ext})`, category: 'Other' };

  const relPath = path.relative(targetDir, filePath).replace(/\\/g, '/');
  const topDir = relPath.includes('/') ? relPath.split('/')[0] + '/' : '(root)';

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    continue;
  }

  const lines = content.split(/\r?\n/);
  // remove trailing blank line at end of file if present
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  let fBlank = 0;
  let fComment = 0;
  let fCode = 0;
  let inBlockComment = false;

  const isHtmlOrXml = ext === '.html' || ext === '.htm' || ext === '.xml' || ext === '.svg';
  const isShellOrYaml = ext === '.sh' || ext === '.ps1' || ext === '.yaml' || ext === '.yml' || ext === '.toml';
  const isBatch = ext === '.bat' || ext === '.cmd';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      fBlank++;
      continue;
    }

    if (inBlockComment) {
      fComment++;
      if (isHtmlOrXml && trimmed.includes('-->')) {
        inBlockComment = false;
      } else if (!isHtmlOrXml && trimmed.includes('*/')) {
        inBlockComment = false;
      }
      continue;
    }

    if (isHtmlOrXml && trimmed.startsWith('<!--')) {
      fComment++;
      if (!trimmed.includes('-->') || trimmed.indexOf('-->') === trimmed.indexOf('<!--')) {
        inBlockComment = true;
      }
      continue;
    }

    if (!isShellOrYaml && !isBatch && trimmed.startsWith('/*')) {
      fComment++;
      if (!trimmed.includes('*/') || trimmed.indexOf('*/') === trimmed.indexOf('/*')) {
        inBlockComment = true;
      }
      continue;
    }

    if (
      trimmed.startsWith('//') ||
      (isShellOrYaml && trimmed.startsWith('#')) ||
      (isBatch && (trimmed.toUpperCase().startsWith('REM') || trimmed.startsWith('::')))
    ) {
      fComment++;
      continue;
    }

    fCode++;
  }

  const langKey = langInfo.name;
  if (!langStats[langKey]) {
    langStats[langKey] = {
      name: langInfo.name,
      category: langInfo.category,
      extension: ext,
      files: 0,
      lines: 0,
      blank: 0,
      comment: 0,
      code: 0
    };
  }
  langStats[langKey].files++;
  langStats[langKey].lines += lines.length;
  langStats[langKey].blank += fBlank;
  langStats[langKey].comment += fComment;
  langStats[langKey].code += fCode;

  if (!dirStats[topDir]) {
    dirStats[topDir] = {
      directory: topDir,
      files: 0,
      lines: 0,
      blank: 0,
      comment: 0,
      code: 0
    };
  }
  dirStats[topDir].files++;
  dirStats[topDir].lines += lines.length;
  dirStats[topDir].blank += fBlank;
  dirStats[topDir].comment += fComment;
  dirStats[topDir].code += fCode;

  grandTotalFiles++;
  grandTotalLines += lines.length;
  grandTotalBlank += fBlank;
  grandTotalComment += fComment;
  grandTotalCode += fCode;
}

// Formatting utilities
const fmt = (n) => Number(n).toLocaleString();
const padR = (str, len) => String(str).padEnd(len);
const padL = (str, len) => String(str).padStart(len);

console.log('');
console.log('================================================================================');
console.log(`  LINES OF CODE (LOC) REPORT: ${path.basename(targetDir)}`);
console.log(`  Path: ${targetDir}`);
console.log('================================================================================');
console.log('');

// Language Table
console.log(
  padR('Language', 22) + ' ' +
  padR('Category', 12) + ' ' +
  padL('Files', 7) + ' ' +
  padL('Lines', 10) + ' ' +
  padL('Blank', 9) + ' ' +
  padL('Comment', 9) + ' ' +
  padL('Code(SLOC)', 11) + ' ' +
  padL('% Code', 7)
);
console.log('-'.repeat(91));

const sortedLangs = Object.values(langStats).sort((a, b) => b.code - a.code);

for (const item of sortedLangs) {
  const pct = grandTotalCode > 0 ? ((item.code / grandTotalCode) * 100).toFixed(1) + '%' : '0.0%';
  console.log(
    padR(item.name, 22) + ' ' +
    padR(item.category, 12) + ' ' +
    padL(fmt(item.files), 7) + ' ' +
    padL(fmt(item.lines), 10) + ' ' +
    padL(fmt(item.blank), 9) + ' ' +
    padL(fmt(item.comment), 9) + ' ' +
    padL(fmt(item.code), 11) + ' ' +
    padL(pct, 7)
  );
}

console.log('-'.repeat(91));
console.log(
  padR('TOTAL', 22) + ' ' +
  padR('', 12) + ' ' +
  padL(fmt(grandTotalFiles), 7) + ' ' +
  padL(fmt(grandTotalLines), 10) + ' ' +
  padL(fmt(grandTotalBlank), 9) + ' ' +
  padL(fmt(grandTotalComment), 9) + ' ' +
  padL(fmt(grandTotalCode), 11) + ' ' +
  padL('100.0%', 7)
);

// Directory Table
if (showByDir) {
  console.log('');
  console.log('--------------------------------------------------------------------------------');
  console.log('  BREAKDOWN BY DIRECTORY');
  console.log('--------------------------------------------------------------------------------');
  console.log(
    padR('Directory', 22) + ' ' +
    padL('Files', 7) + ' ' +
    padL('Lines', 10) + ' ' +
    padL('Blank', 9) + ' ' +
    padL('Comment', 9) + ' ' +
    padL('Code(SLOC)', 11) + ' ' +
    padL('% Code', 7)
  );
  console.log('-'.repeat(79));

  const sortedDirs = Object.values(dirStats).sort((a, b) => b.code - a.code);
  for (const item of sortedDirs) {
    const pct = grandTotalCode > 0 ? ((item.code / grandTotalCode) * 100).toFixed(1) + '%' : '0.0%';
    console.log(
      padR(item.directory, 22) + ' ' +
      padL(fmt(item.files), 7) + ' ' +
      padL(fmt(item.lines), 10) + ' ' +
      padL(fmt(item.blank), 9) + ' ' +
      padL(fmt(item.comment), 9) + ' ' +
      padL(fmt(item.code), 11) + ' ' +
      padL(pct, 7)
    );
  }
  console.log('-'.repeat(79));
}

// Summary section
const srcCodeOnly = sortedLangs
  .filter((l) => l.category === 'Code' || l.category === 'Script')
  .reduce((sum, l) => sum + l.code, 0);

const srcLinesOnly = sortedLangs
  .filter((l) => l.category === 'Code' || l.category === 'Script')
  .reduce((sum, l) => sum + l.lines, 0);

const docsLines = sortedLangs
  .filter((l) => l.category === 'Docs')
  .reduce((sum, l) => sum + l.lines, 0);

console.log('');
console.log('Summary:');
console.log(`  * Pure Source Code (SLOC):  ${fmt(srcCodeOnly).padStart(8)} lines (TypeScript, JavaScript, CSS, HTML, Scripts)`);
console.log(`  * Total Source Lines:       ${fmt(srcLinesOnly).padStart(8)} lines (including comments & blank lines)`);
console.log(`  * Documentation Lines:      ${fmt(docsLines).padStart(8)} lines (Markdown & text docs)`);
console.log(`  * Grand Total Repo Lines:   ${fmt(grandTotalLines).padStart(8)} lines across ${fmt(grandTotalFiles)} files`);
console.log('================================================================================');
console.log('');
