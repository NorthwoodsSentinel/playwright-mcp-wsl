#!/usr/bin/env node
/**
 * playwright-mcp-wsl — Drop-in WSL-safe wrapper for @playwright/mcp
 *
 * Detects WSL environment and injects --disable-gpu flags to prevent
 * Chromium GPU crashes through the dxg bridge. On non-WSL systems,
 * passes through to @playwright/mcp unchanged.
 *
 * Apache-2.0 — https://github.com/NorthwoodsSentinel/playwright-mcp-wsl
 */

const path = require('path');
const { isWSL, wslVersion, hasDxgBridge } = require('./detect');

const wsl = isWSL();
const version = wslVersion();
const dxg = hasDxgBridge();

if (wsl) {
  const detail = `WSL${version}${dxg ? ' + dxg bridge' : ''}`;
  process.stderr.write(`[playwright-mcp-wsl] Detected ${detail}. Injecting GPU-safe config.\n`);

  // If user hasn't set their own config, inject ours
  if (!process.env.PLAYWRIGHT_MCP_CONFIG) {
    process.env.PLAYWRIGHT_MCP_CONFIG = path.join(__dirname, 'wsl-config.json');
  } else {
    // User has a custom config — merge our args via the config file approach
    // We need to load their config, merge our args, write a temp merged config
    const fs = require('fs');
    const os = require('os');
    try {
      const userConfig = JSON.parse(fs.readFileSync(process.env.PLAYWRIGHT_MCP_CONFIG, 'utf8'));
      const wslArgs = ['--disable-gpu', '--disable-software-rasterizer', '--disable-dev-shm-usage'];

      if (!userConfig.browser) userConfig.browser = {};
      if (!userConfig.browser.launchOptions) userConfig.browser.launchOptions = {};
      const existingArgs = userConfig.browser.launchOptions.args || [];

      // Add our args if not already present
      for (const arg of wslArgs) {
        if (!existingArgs.includes(arg)) existingArgs.push(arg);
      }
      userConfig.browser.launchOptions.args = existingArgs;

      // Write merged config to temp file
      const tmpConfig = path.join(os.tmpdir(), `playwright-mcp-wsl-merged-${process.pid}.json`);
      fs.writeFileSync(tmpConfig, JSON.stringify(userConfig, null, 2));
      process.env.PLAYWRIGHT_MCP_CONFIG = tmpConfig;

      // Clean up on exit
      process.on('exit', () => {
        try {
          fs.unlinkSync(tmpConfig);
        } catch {
          // Already removed (or never written): nothing left to clean up.
        }
      });
    } catch (e) {
      process.stderr.write(
        `[playwright-mcp-wsl] Warning: could not merge with existing config: ${/** @type {Error} */ (e).message}\n`,
      );
      process.stderr.write(`[playwright-mcp-wsl] Falling back to WSL config only.\n`);
      process.env.PLAYWRIGHT_MCP_CONFIG = path.join(__dirname, 'wsl-config.json');
    }
  }
} else {
  process.stderr.write(`[playwright-mcp-wsl] Not running in WSL. Passing through to @playwright/mcp.\n`);
}

// Delegate to @playwright/mcp CLI
const { program } = require('playwright-core/lib/utilsBundle');
const { decorateMCPCommand } = require('playwright/lib/mcp/program');
const packageJSON = require('@playwright/mcp/package.json');

const p = program.version('Version ' + packageJSON.version + ' (wsl-safe)').name('Playwright MCP (WSL-Safe)');

decorateMCPCommand(p, packageJSON.version);
void program.parseAsync(process.argv);
