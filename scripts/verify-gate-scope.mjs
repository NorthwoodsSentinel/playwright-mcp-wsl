#!/usr/bin/env node
// verify-gate-scope: a gate must show how much it checked (AGENTS.md "Always test new or modified code").
// Three silent-shrink failures this catches, each of which would leave the gate green while checking less:
//   1. a tracked .js, .mjs or .d.ts file that lands in no tsconfig project is never typechecked;
//   2. a published .js file (package.json "files") missing from the coverage summary is never held to the bar;
//   3. a coverage run that measured zero files (a mis-anchored glob) passes every threshold vacuously.
// Fix a failure by fixing the include lists, never by excusing the file.
// Runs after `vitest run --coverage`, which writes coverage/coverage-summary.json.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const listed = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '*.js', '*.mjs', '*.ts'], {
  cwd: root,
  encoding: 'utf8',
});
if (listed.status !== 0) throw new Error(`verify-gate-scope: git ls-files failed:\n${listed.stderr}`);
const tracked = listed.stdout
  .split('\n')
  .filter(Boolean)
  .filter((f) => !f.startsWith('node_modules/'));
if (!tracked.length) throw new Error('verify-gate-scope: found no source files at all; the check itself is broken');

// 1. typecheck scope. Read each project's file list through the TypeScript API in-process (no subprocess, so the
// result cannot depend on how a launcher behaves in a given shell or sandbox), and treat an empty list as a broken
// check rather than as "nothing typechecked". Two projects, because TypeScript silently drops index.js from any
// project that also includes index.d.ts (same base name); tsconfig.index.json checks index.js on its own.
const pkg = JSON.parse(readFileSync(path.resolve(root, 'package.json'), 'utf8'));
const projects = ['tsconfig.json', 'tsconfig.index.json'];
/** @type {Set<string>} */
const typed = new Set();
for (const project of projects) {
  if (!String(pkg.scripts?.typecheck ?? '').includes(`-p ${project}`))
    throw new Error(`verify-gate-scope: the typecheck script does not run ${project}`);
  const parsed = ts.getParsedCommandLineOfConfigFile(
    path.resolve(root, project),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        throw new Error(`verify-gate-scope: ${project}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
      },
    },
  );
  if (!parsed || parsed.errors.length)
    throw new Error(`verify-gate-scope: could not parse ${project}; the check itself is broken`);
  if (!parsed.fileNames.length)
    throw new Error(`verify-gate-scope: ${project} lists no files; the check itself is broken`);
  for (const f of parsed.fileNames) typed.add(path.relative(root, f));
}
const untyped = tracked.filter((f) => !typed.has(f));

// 2 and 3. coverage scope: every published .js file must be measured.

/** @type {string[]} */
const sources = (pkg.files ?? []).filter((/** @type {string} */ f) => f.endsWith('.js'));
const summaryPath = path.resolve(root, 'coverage/coverage-summary.json');
if (!existsSync(summaryPath))
  throw new Error('verify-gate-scope: no coverage summary; run vitest with --coverage first');
const measured = new Set(
  Object.keys(JSON.parse(readFileSync(summaryPath, 'utf8')))
    .filter((k) => k !== 'total')
    .map((k) => path.relative(root, k)),
);
const unmeasured = sources.filter((f) => !measured.has(f));

console.log(`gate scope: typechecked ${tracked.length - untyped.length} of ${tracked.length} .js/.mjs/.ts files`);
console.log(
  `gate scope: coverage measured ${sources.length - unmeasured.length} of ${sources.length} published .js files`,
);
if (!sources.length || !measured.size) {
  console.error('  coverage measured zero files; a gate that checked nothing cannot pass');
  process.exit(1);
}
if (untyped.length || unmeasured.length) {
  for (const f of untyped) console.error(`  not in any tsconfig project: ${f}`);
  for (const f of unmeasured) console.error(`  missing from coverage: ${f}`);
  process.exit(1);
}
