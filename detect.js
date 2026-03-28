/**
 * WSL detection utilities.
 * Apache-2.0 — https://github.com/NorthwoodsSentinel/playwright-mcp-wsl
 */

const fs = require('fs');
const os = require('os');

/**
 * Detect if running inside WSL (1 or 2).
 * Checks /proc/version for Microsoft/WSL kernel strings.
 */
function isWSL() {
  if (os.platform() !== 'linux') return false;
  try {
    const version = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
    return version.includes('microsoft') || version.includes('wsl');
  } catch {
    return false;
  }
}

/**
 * Detect WSL version (1 or 2). Returns 0 if not WSL.
 */
function wslVersion() {
  if (!isWSL()) return 0;
  try {
    const version = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
    // WSL2 uses a real Linux kernel with "microsoft-standard-WSL2"
    if (version.includes('wsl2') || version.includes('microsoft-standard')) return 2;
    // WSL1 uses "microsoft" without "standard"
    return 1;
  } catch {
    return 0;
  }
}

/**
 * Check if the dxg GPU bridge is present (WSL2 GPU passthrough).
 * This is the specific component that crashes under parallel browser load.
 */
function hasDxgBridge() {
  try {
    return fs.existsSync('/dev/dxg');
  } catch {
    return false;
  }
}

module.exports = { isWSL, wslVersion, hasDxgBridge };
