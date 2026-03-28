/**
 * playwright-mcp-wsl — Programmatic API
 *
 * Drop-in replacement for require('@playwright/mcp').
 * On WSL, injects GPU-safe config before creating the connection.
 *
 * Apache-2.0 — https://github.com/NorthwoodsSentinel/playwright-mcp-wsl
 */

const path = require('path');
const { isWSL } = require('./detect');

// Inject config before anything imports @playwright/mcp
if (isWSL() && !process.env.PLAYWRIGHT_MCP_CONFIG) {
  process.env.PLAYWRIGHT_MCP_CONFIG = path.join(__dirname, 'wsl-config.json');
}

const { createConnection } = require('@playwright/mcp');

module.exports = { createConnection };
