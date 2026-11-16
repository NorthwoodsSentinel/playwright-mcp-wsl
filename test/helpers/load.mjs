// Test helper: load one of the wrapper's CommonJS files fresh, through Node's real `require`, with chosen module
// ids answered by stubs. This is how the suite runs cli.js and index.js unchanged without ever loading
// @playwright/mcp or Playwright: no browser is launched and no child process or network call is made.
import fs from 'node:fs';
import os from 'node:os';
import Module, { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const requireFromRoot = createRequire(path.join(root, 'package.json'));
const ownFiles = ['cli.js', 'detect.js', 'index.js'].map((f) => path.join(root, f));

/**
 * Require `file` (relative to the repo root) in a fresh module registry for the wrapper's own files.
 * `stubs` maps a module id, exactly as the wrapper writes it in `require(...)`, to a factory whose return value
 * is handed back instead of loading the real module. A stubbed id is never loaded for real.
 * @param {string} file
 * @param {Record<string, () => unknown>} stubs
 */
export function loadFresh(file, stubs = {}) {
  for (const f of ownFiles) delete requireFromRoot.cache[f];
  // Module._load is Node's internal require entry point; it is not in the public type definitions.
  const mod = /** @type {{ _load: (request: string, ...rest: unknown[]) => unknown }} */ (
    /** @type {unknown} */ (Module)
  );
  const original = mod._load;
  mod._load = function (request, ...rest) {
    if (Object.hasOwn(stubs, request)) return stubs[request]();
    return original.call(this, request, ...rest);
  };
  try {
    return requireFromRoot(path.join(root, file));
  } finally {
    mod._load = original;
  }
}

/**
 * Pretend to be on `platform` with the given /proc/version text (null: the read throws) and /dev/dxg presence.
 * Every other file read goes to the real filesystem, so Node can still load modules.
 * @param {{ platform?: NodeJS.Platform, procVersion?: string | null, dxg?: boolean | 'throw' }} env
 */
export function fakeHost({ platform = 'linux', procVersion = null, dxg = false }) {
  vi.spyOn(os, 'platform').mockReturnValue(platform);
  const realRead = fs.readFileSync;
  const read = vi.spyOn(fs, 'readFileSync').mockImplementation(
    /** @type {typeof fs.readFileSync} */ (
      /** @type {unknown} */ (
        /** @param {fs.PathOrFileDescriptor} p @param {unknown[]} rest */
        (p, ...rest) => {
          if (p === '/proc/version') {
            if (procVersion === null) throw new Error('ENOENT: /proc/version');
            return procVersion;
          }
          return Reflect.apply(realRead, fs, [p, ...rest]);
        }
      )
    ),
  );
  const realExists = fs.existsSync;
  vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
    if (p === '/dev/dxg') {
      if (dxg === 'throw') throw new Error('EACCES: /dev/dxg');
      return dxg;
    }
    return realExists(p);
  });
  return { read };
}

/** Capture everything written to stderr, without printing it. */
export function captureStderr() {
  /** @type {string[]} */
  const lines = [];
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
  return lines;
}

export const WSL2 = 'Linux version 5.15.167.4-microsoft-standard-WSL2 (gcc) #1 SMP';
export const WSL1 = 'Linux version 4.4.0-19041-Microsoft (Microsoft@Microsoft.com) (gcc version 5.4.0)';
export const NATIVE = 'Linux version 6.8.0-45-generic (buildd@lcy02-amd64-075) (gcc) #45-Ubuntu SMP';
