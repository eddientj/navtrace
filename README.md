# NavTrace

[![Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/breadkrumb.navtrace?label=marketplace&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=breadkrumb.navtrace)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/breadkrumb.navtrace)](https://marketplace.visualstudio.com/items?itemName=breadkrumb.navtrace)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/breadkrumb.navtrace)](https://marketplace.visualstudio.com/items?itemName=breadkrumb.navtrace)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/breadkrumb.navtrace)](https://marketplace.visualstudio.com/items?itemName=breadkrumb.navtrace&ssr=false#review-details)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A VS Code extension that records your code-navigation trail as a **branching tree** you can browse and walk back through.

> **Current release: 0.1.2** — see [CHANGELOG](CHANGELOG.md) for what's new.

## The problem

When you're exploring an unfamiliar or legacy codebase, navigation is rarely a straight line. You follow a call chain five levels deep, realize you need to backtrack, then explore a different branch — and VS Code's built-in Alt+Left history is a flat list that discards everything the moment you take a new turn.

NavTrace keeps every fork. Each time you backtrack and navigate somewhere new, it opens a new branch in the tree rather than overwriting the old one. You can see the full shape of your exploration and jump to any point in it.

## Installation

**From the VS Code Marketplace (recommended)**

1. Open the Extensions panel (`Ctrl+Shift+X` / `Cmd+Shift+X`)
2. Search for **NavTrace**
3. Click **Install**

**From the command line**

```sh
code --install-extension breadkrumb.navtrace
```

**From a `.vsix` file**

```sh
code --install-extension navtrace-<version>.vsix
```

## Usage

1. Open a project and navigate your code normally — use `F12` (Go to Definition), `Shift+F12` (Go to References), `Ctrl+Click`, or any other built-in navigation command.
2. Click the **NavTrace icon** (milestone icon) in the activity bar to open the Trail panel. Each navigation step appears as `symbol — file:line`.
3. **Click any node** in the tree to jump directly to that location.
4. Press **`Ctrl+Alt+Left`** (`Cmd+Alt+Left` on macOS) to step backward through the trail without losing your forward history.
5. Navigate from any earlier node and NavTrace forks a new branch — both paths stay in the tree.

### Example: exploring a legacy codebase

```
processOrder          orders.ts:42
  └─ validateCart     cart.ts:18       ← you stepped back here...
       ├─ applyRules  rules.ts:91      ← ...explored this path
       └─ checkStock  inventory.ts:55  ● ← ...then explored this one (current)
```

Both branches are preserved. Click either to jump there instantly.

## Commands

| Command | Default keybinding | Description |
|---|---|---|
| `NavTrace: Step Back` | `Ctrl+Alt+Left` / `Cmd+Alt+Left` | Move the current pointer to the parent node and jump there. |
| `NavTrace: Jump to Step` | — | Jump to a specific node (invoked by clicking a tree item). |
| `NavTrace: Clear Trail` | — | Wipe the trail for the current workspace. |
| `NavTrace: Show Output` | — | Open the NavTrace output channel for debugging. |

The **Step Back** and **Clear Trail** buttons also appear in the Trail panel's toolbar.

## Supported languages

TypeScript, JavaScript, TypeScript React, JavaScript React, Python, Java, Go, Rust, C, C++, C#, PHP, Ruby.

You can add or remove languages via the `navtrace.languages` setting:

```json
"navtrace.languages": ["typescript", "typescriptreact", "python", "kotlin"]
```

## Settings

| Setting | Default | Description |
|---|---|---|
| `navtrace.languages` | See above | Language IDs to track for navigation. |

## How it works

NavTrace listens for two VS Code events:

- `onDidChangeTextEditorSelection` with `Command` kind — captures the symbol under the cursor just before a navigation command fires.
- `onDidChangeActiveTextEditor` — if a symbol was captured within the last 5 seconds and the active editor changes (or the cursor jumps within the same file), it records a step from the captured position to the new one.

After recording, it asynchronously queries the language server (`vscode.executeDocumentSymbolProvider`) to resolve the real containing function or method name and updates the node label if a better name is found.

The trail is stored as a tree of `NavNode { id, parentId, symbol, fromFile, fromLine, toFile, toLine }` with a `currentId` pointer. The state persists per workspace under `navtrace.trail.v2` in `workspaceState`.

## Known limitations

- Symbol capture is heuristic (word-under-cursor + a noise filter) rather than fully language-server aware, so labels on dense lines may occasionally be imprecise. The language server lookup corrects most of these asynchronously.
- Same-file jumps are detected via a follow-up cursor move; rapid keyboard navigation can occasionally miss a step.

## Development

```sh
npm install
npm run compile    # one-off build
npm run watch      # incremental rebuild on save
npm test           # run the test suite
```

Press `F5` in VS Code to launch the Extension Development Host with the extension loaded.

To package a `.vsix` for local distribution:

```sh
npm run package
```
