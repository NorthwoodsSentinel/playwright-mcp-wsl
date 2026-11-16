// Typecheck-only declarations (not published; `files` in package.json leaves this folder out) for the two
// untyped upstream internals that cli.js loads by deep path. They describe only what cli.js calls.
//
// Known gap, deliberately visible here and in AGENTS.md: `playwright/lib/mcp/program` is not exported by the
// playwright version that current @playwright/mcp (0.0.85) installs, so `require` of it throws at runtime with
// that version. Without this declaration `tsc` reports TS2307 on cli.js. Fixing the import changes behavior, so it
// is a follow-up, not part of the gate change; delete this block when cli.js stops importing that path.

declare module 'playwright-core/lib/utilsBundle' {
  interface Command {
    version(text: string): Command;
    name(text: string): Command;
    parseAsync(argv: string[]): Promise<unknown>;
  }
  export const program: Command;
}

declare module 'playwright/lib/mcp/program' {
  import type { Command } from 'playwright-core/lib/utilsBundle';
  export function decorateMCPCommand(command: Command, version: string): void;
}
