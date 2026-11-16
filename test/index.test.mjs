// index.js, the programmatic API: it must set the config before @playwright/mcp loads, and re-export
// createConnection untouched. @playwright/mcp is a stub here.
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NATIVE, WSL2, fakeHost, loadFresh, root } from './helpers/load.mjs';

const bundled = path.join(root, 'wsl-config.json');

function loadIndex() {
  const createConnection = vi.fn();
  /** @type {{ configAtLoad?: string }} */
  const seen = {};
  const api = loadFresh('index.js', {
    '@playwright/mcp': () => {
      seen.configAtLoad = process.env.PLAYWRIGHT_MCP_CONFIG;
      return { createConnection, other: 'not re-exported' };
    },
  });
  return { api, createConnection, seen };
}

beforeEach(() => {
  vi.stubEnv('PLAYWRIGHT_MCP_CONFIG', undefined);
});

describe('index.js', () => {
  it('sets the bundled config on WSL before @playwright/mcp loads, and re-exports only createConnection', () => {
    fakeHost({ procVersion: WSL2 });
    const { api, createConnection, seen } = loadIndex();
    expect(seen.configAtLoad).toBe(bundled);
    expect(process.env.PLAYWRIGHT_MCP_CONFIG).toBe(bundled);
    expect(api).toEqual({ createConnection });
    expect(api.createConnection).toBe(createConnection);
  });

  it('leaves a user config alone on WSL', () => {
    fakeHost({ procVersion: WSL2 });
    vi.stubEnv('PLAYWRIGHT_MCP_CONFIG', '/elsewhere/user.json');
    const { seen } = loadIndex();
    expect(seen.configAtLoad).toBe('/elsewhere/user.json');
  });

  it('changes nothing off WSL', () => {
    fakeHost({ procVersion: NATIVE });
    const { seen } = loadIndex();
    expect(seen.configAtLoad).toBeUndefined();
    expect(process.env.PLAYWRIGHT_MCP_CONFIG).toBeUndefined();
  });
});
