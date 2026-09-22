import { fileURLToPath } from 'node:url';
import { defineConfig } from '@vscode/test-cli';

// Two profiles, split by whether a workspace folder needs to be open.
//
// Domain tests run separately under plain node --test (see package.json
// "test:domain") and are never picked up by either profile here.
export default defineConfig([
  {
    // Unit-style adapter tests. No workspace folder is opened, which is
    // also the mandatory "no folder open at all" case the tree provider
    // must handle. Files ending in "-test.js" (not ".test.js") belong to
    // the workspace profile below and are deliberately not matched here.
    label: 'adapter-unit',
    files: 'out/adapter/**/*.test.js',
  },
  {
    // Adapter tests that need a real workspace folder on disk, e.g. to
    // exercise feature discovery end to end. The fixture is a synthetic,
    // invented workspace — never real project content.
    label: 'adapter-workspace',
    files: 'out/adapter/**/*.workspace-test.js',
    workspaceFolder: fileURLToPath(new URL('./src/adapter/fixtures/sample-workspace', import.meta.url)),
  },
]);
