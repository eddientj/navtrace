# Change Log

All notable changes to the "navtrace" extension will be documented in this file.

## [0.1.2]

### Changed

- Resized icon from 1.4 MB to ~186 KB.

## [0.1.1]

### Added

- Extension icon.

## [0.1.0]

### Added

- **Trail view** in the activity bar showing every navigation step as `symbol — file:line`.
- **Branching tree model**: stepping back and re-navigating forks a new branch rather than overwriting history. The full tree is preserved.
- **`NavTrace: Step Back`** command bound to `Ctrl+Alt+Left` / `Cmd+Alt+Left`. Moves the current pointer to the parent and navigates there without losing forward history.
- **`NavTrace: Jump to Step`** — click any tree node to jump to that location.
- **`NavTrace: Clear Trail`** and **`NavTrace: Show Output`** commands, wired into the view title bar.
- **Per-workspace persistence** of the trail across window reloads (`workspaceState` under `navtrace.trail.v2`). Old v1 flat trails are migrated automatically on first load.
- **LSP-aware symbol labels**: captured node symbols are enriched asynchronously via `vscode.executeDocumentSymbolProvider` so labels reflect the real containing function / method name rather than the word under the cursor.
- **`navtrace.languages` setting** to configure which language IDs are tracked. Defaults broadened to include Python, Java, Go, Rust, C, C++, C#, PHP, Ruby in addition to TS/JS/TSX/JSX.
- **Unit tests** for `TrailProvider` (branching, persistence, legacy migration, tree-item rendering) and for `findContainingSymbol`, plus an extension activation smoke test.

### Changed

- `TrailProvider` extracted into `src/trailProvider.ts` for testability.
- Node ids now identify tree items, replacing the previous flat-array model.

## [0.0.1]

- Initial release.
