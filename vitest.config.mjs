// Test and coverage config. The coverage bar is the source's (Cliff Hall's inspector): >= 90 on all four
// dimensions, per file, enforced here and therefore in `bun run test`, `bun run local:gate` and CI. Never lower it
// to pass; see AGENTS.md "Always test new or modified code".
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Anchored to the repo root: an unanchored pattern can match a folder name somewhere up the path.
    include: ['./test/**/*.test.mjs'],
    environment: 'node',
    restoreMocks: true,
    unstubEnvs: true,
    coverage: {
      provider: 'v8',
      // The wrapper's own runtime code, by exact path: these three files are all of it.
      include: ['./cli.js', './detect.js', './index.js'],
      reporter: [['text', { skipFull: false }], 'json-summary'],
      thresholds: { perFile: true, lines: 90, statements: 90, functions: 90, branches: 90 },
    },
  },
});
