// cli.js, run unchanged: the host is faked, the Playwright modules it delegates to are stubs, the temp directory
// is a fresh one per test, and its `exit` handler is captured instead of registered.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NATIVE, WSL1, WSL2, captureStderr, fakeHost, loadFresh, root } from './helpers/load.mjs';

const WSL_ARGS = ['--disable-gpu', '--disable-software-rasterizer', '--disable-dev-shm-usage'];
const bundled = path.join(root, 'wsl-config.json');

/** @type {string} */
let tmp;
/** @type {Array<() => void>} */
let exitHandlers;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pmw-cli-test-'));
  vi.spyOn(os, 'tmpdir').mockReturnValue(tmp);
  vi.stubEnv('PLAYWRIGHT_MCP_CONFIG', undefined);
  exitHandlers = [];
  const realOn = process.on.bind(process);
  vi.spyOn(process, 'on').mockImplementation(
    /** @type {typeof process.on} */ (
      /** @type {unknown} */ (
        /** @param {string} event @param {(...args: unknown[]) => void} handler */
        (event, handler) => {
          if (event === 'exit') {
            exitHandlers.push(/** @type {() => void} */ (handler));
            return process;
          }
          return realOn(event, handler);
        }
      )
    ),
  );
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Run cli.js with Playwright stubbed; returns what it handed to Playwright. */
function runCli() {
  /** @type {{ version?: string, name?: string, argv?: string[], configAtLoad?: string }} */
  const seen = {};
  const program = {
    /** @param {string} v */
    version(v) {
      seen.version = v;
      return program;
    },
    /** @param {string} n */
    name(n) {
      seen.name = n;
      return program;
    },
    /** @param {string[]} argv */
    parseAsync(argv) {
      seen.argv = argv;
      return Promise.resolve();
    },
  };
  const decorateMCPCommand = vi.fn();
  loadFresh('cli.js', {
    'playwright-core/lib/utilsBundle': () => {
      seen.configAtLoad = process.env.PLAYWRIGHT_MCP_CONFIG;
      return { program };
    },
    'playwright/lib/mcp/program': () => ({ decorateMCPCommand }),
    '@playwright/mcp/package.json': () => ({ version: '0.0.99' }),
  });
  return { seen, program, decorateMCPCommand };
}

/** @param {unknown} config */
function writeUserConfig(config) {
  const p = path.join(tmp, 'user-config.json');
  fs.writeFileSync(p, typeof config === 'string' ? config : JSON.stringify(config));
  vi.stubEnv('PLAYWRIGHT_MCP_CONFIG', p);
  return p;
}

function mergedPath() {
  return path.join(tmp, `playwright-mcp-wsl-merged-${process.pid}.json`);
}

describe('cli.js delegation', () => {
  it('passes through off WSL: no config change, Playwright decorated and run with process.argv', () => {
    fakeHost({ platform: 'darwin' });
    const stderr = captureStderr();
    const { seen, program, decorateMCPCommand } = runCli();
    expect(stderr).toEqual(['[playwright-mcp-wsl] Not running in WSL. Passing through to @playwright/mcp.\n']);
    expect(process.env.PLAYWRIGHT_MCP_CONFIG).toBeUndefined();
    expect(seen.version).toBe('Version 0.0.99 (wsl-safe)');
    expect(seen.name).toBe('Playwright MCP (WSL-Safe)');
    expect(decorateMCPCommand).toHaveBeenCalledWith(program, '0.0.99');
    expect(seen.argv).toBe(process.argv);
    expect(exitHandlers).toHaveLength(0);
  });

  it('passes through on native Linux', () => {
    fakeHost({ procVersion: NATIVE, dxg: true });
    const stderr = captureStderr();
    runCli();
    expect(stderr[0]).toContain('Not running in WSL');
    expect(process.env.PLAYWRIGHT_MCP_CONFIG).toBeUndefined();
  });
});

describe('cli.js on WSL without a user config', () => {
  it('points Playwright at the bundled config before Playwright loads (WSL2 + dxg)', () => {
    fakeHost({ procVersion: WSL2, dxg: true });
    const stderr = captureStderr();
    const { seen } = runCli();
    expect(stderr).toEqual(['[playwright-mcp-wsl] Detected WSL2 + dxg bridge. Injecting GPU-safe config.\n']);
    expect(process.env.PLAYWRIGHT_MCP_CONFIG).toBe(bundled);
    expect(seen.configAtLoad).toBe(bundled);
    expect(exitHandlers).toHaveLength(0);
  });

  it('names WSL1 without the dxg suffix when /dev/dxg is absent', () => {
    fakeHost({ procVersion: WSL1, dxg: false });
    const stderr = captureStderr();
    runCli();
    expect(stderr).toEqual(['[playwright-mcp-wsl] Detected WSL1. Injecting GPU-safe config.\n']);
    expect(process.env.PLAYWRIGHT_MCP_CONFIG).toBe(bundled);
  });
});

describe('cli.js on WSL with a user config', () => {
  it('merges the three flags into existing args without duplicates and keeps every other field', () => {
    fakeHost({ procVersion: WSL2 });
    captureStderr();
    const user = {
      browser: { browserName: 'chromium', launchOptions: { headless: true, args: ['--foo', '--disable-gpu'] } },
      server: { port: 8931 },
    };
    const userPath = writeUserConfig(user);
    const { seen } = runCli();
    expect(process.env.PLAYWRIGHT_MCP_CONFIG).toBe(mergedPath());
    expect(seen.configAtLoad).toBe(mergedPath());
    const merged = JSON.parse(fs.readFileSync(mergedPath(), 'utf8'));
    expect(merged).toEqual({
      browser: {
        browserName: 'chromium',
        launchOptions: { headless: true, args: ['--foo', '--disable-gpu', ...WSL_ARGS.slice(1)] },
      },
      server: { port: 8931 },
    });
    expect(fs.readFileSync(mergedPath(), 'utf8')).toBe(JSON.stringify(merged, null, 2));
    // The user's own file is read, never rewritten.
    expect(JSON.parse(fs.readFileSync(userPath, 'utf8'))).toEqual(user);
  });

  it('creates browser.launchOptions.args when the user config has no browser section', () => {
    fakeHost({ procVersion: WSL2 });
    captureStderr();
    writeUserConfig({ server: { host: 'localhost' } });
    runCli();
    expect(JSON.parse(fs.readFileSync(mergedPath(), 'utf8'))).toEqual({
      server: { host: 'localhost' },
      browser: { launchOptions: { args: WSL_ARGS } },
    });
  });

  it('creates launchOptions when browser has none', () => {
    fakeHost({ procVersion: WSL2 });
    captureStderr();
    writeUserConfig({ browser: { browserName: 'chromium' } });
    runCli();
    expect(JSON.parse(fs.readFileSync(mergedPath(), 'utf8')).browser).toEqual({
      browserName: 'chromium',
      launchOptions: { args: WSL_ARGS },
    });
  });

  it('removes the merged file on exit, and the exit handler tolerates it being gone already', () => {
    fakeHost({ procVersion: WSL2 });
    captureStderr();
    writeUserConfig({ browser: { launchOptions: {} } });
    runCli();
    expect(exitHandlers).toHaveLength(1);
    expect(fs.existsSync(mergedPath())).toBe(true);
    exitHandlers[0]();
    expect(fs.existsSync(mergedPath())).toBe(false);
    expect(() => exitHandlers[0]()).not.toThrow();
  });

  it('falls back to the bundled config with a warning when the user config is not JSON', () => {
    fakeHost({ procVersion: WSL2 });
    const stderr = captureStderr();
    writeUserConfig('{ not json');
    const { seen } = runCli();
    expect(stderr).toHaveLength(3);
    expect(stderr[1]).toMatch(/^\[playwright-mcp-wsl\] Warning: could not merge with existing config: .+\n$/);
    expect(stderr[2]).toBe('[playwright-mcp-wsl] Falling back to WSL config only.\n');
    expect(process.env.PLAYWRIGHT_MCP_CONFIG).toBe(bundled);
    expect(seen.configAtLoad).toBe(bundled);
    expect(fs.existsSync(mergedPath())).toBe(false);
    expect(exitHandlers).toHaveLength(0);
  });

  it('falls back with the read error in the warning when the user config path does not exist', () => {
    fakeHost({ procVersion: WSL2 });
    const stderr = captureStderr();
    vi.stubEnv('PLAYWRIGHT_MCP_CONFIG', path.join(tmp, 'missing.json'));
    runCli();
    expect(stderr[1]).toContain('ENOENT');
    expect(process.env.PLAYWRIGHT_MCP_CONFIG).toBe(bundled);
  });
});

describe('wsl-config.json', () => {
  it('carries exactly the three Chromium flags the README documents', () => {
    expect(JSON.parse(fs.readFileSync(path.join(root, 'wsl-config.json'), 'utf8'))).toEqual({
      browser: { launchOptions: { args: WSL_ARGS } },
    });
  });
});
