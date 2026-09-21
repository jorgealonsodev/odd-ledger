# ODD Ledger

A read-only VS Code extension that renders a project's `odd/` folder: every
Organic Driven Development (ODD) feature, its sections, its tasks, the
evidence that closed each one, and the next step.

The extension never writes to a feature document, never commits, and never
runs or automates the ODD workflow. Its only data source is the project's
`odd/` folder and the git history of the files in it.

## Architecture

`src/` is split along a hard boundary:

- **`src/domain/`** — discovery, parsing and derivation. Plain TypeScript
  over strings and paths. Imports nothing from `vscode`. Unit-tested with
  `node --test` against compiled output; no editor is launched.
- **`src/adapter/`** — providers, panel, commands and `src/extension.ts`.
  The only code allowed to import `vscode`. Tested with `@vscode/test-cli`
  inside a real (headless-capable) extension host.

## Build

```sh
npm install
npm run check-types   # tsc --noEmit
npm run compile       # tsc -> out/
npm run bundle        # esbuild -> dist/extension.js (vscode external)
```

`npm run watch` runs the esbuild bundler in watch mode.

## Test

Two independent suites, one per layer:

```sh
npm run test:domain     # node --test over compiled src/domain/**/*.test.ts
npm run test:extension  # @vscode/test-cli over compiled src/adapter/**/*.test.ts
```

`test:extension` downloads a VS Code build on first run and launches a real
extension host, so it needs network access and a display (or headless X
server) available.

## Debug

Open this folder in VS Code and use the **Run Extension** launch
configuration to start a development instance, or **Extension Tests** to run
the adapter suite under the debugger.
