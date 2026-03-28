# playwright-mcp-wsl

Drop-in WSL-safe wrapper for `@playwright/mcp`. Prevents Chromium GPU crashes on Windows Subsystem for Linux.

## The Problem

Running Claude Code (or any Playwright-based browser automation) on WSL2 with parallel browser sessions causes cascading crashes:

1. Chromium tries to allocate GPU memory through WSL's `dxg` bridge
2. Multiple browser instances exhaust GPU memory allocations
3. Chrome processes SEGFAULT (signal 11)
4. Crash cascade takes down the entire WSL instance

This is invisible to users — WSL just "crashes" or "freezes" with no clear error.

## The Fix

This package wraps `@playwright/mcp` and automatically injects GPU-safe flags when running on WSL:

```
--disable-gpu
--disable-software-rasterizer
--disable-dev-shm-usage
```

On non-WSL systems, it passes through to `@playwright/mcp` unchanged. No performance impact — GPU acceleration is meaningless for headless browser automation.

## Installation

### Claude Code (recommended)

Add to your Claude Code settings (`.claude/settings.json` or global settings):

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["playwright-mcp-wsl@latest"]
    }
  }
}
```

This replaces the default `@playwright/mcp` entry.

### Manual / Other MCP Hosts

```bash
npx playwright-mcp-wsl@latest
```

All `@playwright/mcp` CLI flags are supported:

```bash
npx playwright-mcp-wsl@latest --headless --viewport-size 1440x900
```

### Programmatic

```js
const { createConnection } = require('playwright-mcp-wsl');
// Same API as @playwright/mcp, with WSL-safe defaults
```

## How It Works

1. **Detects WSL** by reading `/proc/version` for Microsoft/WSL kernel strings
2. **If WSL**: sets `PLAYWRIGHT_MCP_CONFIG` to a bundled config that adds `--disable-gpu` and related flags to Chromium launch args
3. **If not WSL**: passes through to `@playwright/mcp` with zero modifications
4. **If user has custom config**: merges WSL-safe args into existing config (no overwrite)

## What It Disables

| Flag | Why |
|------|-----|
| `--disable-gpu` | Prevents GPU memory allocation through the dxg bridge |
| `--disable-software-rasterizer` | Prevents fallback software GPU that still uses dxg |
| `--disable-dev-shm-usage` | Uses `/tmp` instead of `/dev/shm` (often undersized on WSL) |

## What It Doesn't Affect

- Page rendering quality (identical for headless automation)
- JavaScript execution
- Network requests
- Screenshot quality
- DOM interaction
- Any Playwright MCP functionality

## Compatibility

- WSL1 and WSL2
- Windows 10 and Windows 11
- Node.js 18+
- All `@playwright/mcp` versions >= 0.0.60
- Claude Code, Cursor, Windsurf, or any MCP-compatible host

## Verifying It Works

When running on WSL, you'll see in stderr:

```
[playwright-mcp-wsl] Detected WSL2 + dxg bridge. Injecting GPU-safe config.
```

When running on non-WSL:

```
[playwright-mcp-wsl] Not running in WSL. Passing through to @playwright/mcp.
```

## Background

This package was created after diagnosing cascading WSL crashes during parallel browser automation with Claude Code's PAI system. The root cause was Chromium's GPU memory allocation through WSL2's `dxg` (DirectX Graphics) bridge — a kernel-level GPU passthrough layer not designed for concurrent headless browser load.

Crash signature in `dmesg`:
```
misc dxg: dxgk: dxgvmb_send_create_allocation: send_create_allocation failed ffffffb5
misc dxg: dxgk: dxgkio_create_allocation: Ioctl failed: -75
chrome: potentially unexpected fatal signal 11
WSL (CaptureCrash): Capturing crash for pid: ..., executable: chrome, signal: 11
```

## License

Apache-2.0 — same as Playwright.
