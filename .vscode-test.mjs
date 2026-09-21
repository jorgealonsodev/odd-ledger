import { defineConfig } from '@vscode/test-cli';

// Points at the compiled adapter tests only. Domain tests run separately
// under plain node --test (see package.json "test:domain") and are never
// picked up here.
export default defineConfig({
  files: 'out/adapter/**/*.test.js',
});
