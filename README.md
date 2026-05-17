# NavTrace

A VS Code extension that records your code-navigation trail — every `Go to Definition`, `Go to References`, and similar jump — as a **branching tree** you can browse and walk back through.

Linear breadcrumbs lose history the moment you backtrack. NavTrace keeps it: each fork in your exploration becomes a visible branch you can return to.

## Features

- **Trail view** in the activity bar (milestone icon) listing every navigation step as `symbol — file:line`.
- **Click any step** to jump back to that location.
- **Step Back** (`Ctrl+Alt+Left` / `Cmd+Alt+Left`) walks the trail backward without losing forward history.
- **Branching**: after stepping back, a new navigation forks a new branch rather than overwriting the old one. Both stay in the tree.
- **Current-position marker** (●) shows where you are in the trail.
- **Persisted per workspace** — the tree survives window reloads.

## Usage

1. Open a JS / TS / TSX file.
2. Use `F12`, `Ctrl+Click`, `Go to References`, or any built-in navigation. Each jump is appended to the trail.
3. Click the **NavTrace** icon in the activity bar to see the tree.
4. Click a node to jump there. Press `Ctrl+Alt+Left` to step back. Navigate again from any earlier node to start a new branch.

## Commands

| Command | Default keybinding | Description |
| --- | --- | --- |
| `NavTrace: Step Back` | `Ctrl+Alt+Left` (`Cmd+Alt+Left` on macOS) | Move the current pointer to the parent node and jump there. |
| `NavTrace: Jump to Step` | — | Jump to a specific node (invoked when you click a tree item). |
| `NavTrace: Clear Trail` | — | Wipe the trail for the current workspace. |
| `NavTrace: Show Output` | — | Open the NavTrace output channel for debugging. |

## Supported languages

TypeScript, JavaScript, TypeScript-React. Other languages are ignored.

## How it works

NavTrace listens for two events:

- `onDidChangeTextEditorSelection` with `Command` kind — captures the symbol under the cursor right before a navigation command fires.
- `onDidChangeActiveTextEditor` — if a captured symbol is pending within 5s and the active editor changes (or the cursor jumps within the same file), it records a step from the captured position to the new one.

The trail is stored as a tree of `NavNode { id, parentId, symbol, fromFile, fromLine, toFile, toLine }` plus a `currentId` pointer. Persistence uses `workspaceState` under the key `navtrace.trail.v2`.

## Known limitations

- Symbol capture is heuristic (word-under-cursor + a small noise filter) rather than language-server aware, so some captures will be inaccurate on dense lines.
- Same-file jumps are detected via a follow-up cursor move; rapid keyboard navigation can occasionally miss a step.
- TypeScript / JavaScript only for now.

## Development

```sh
npm install
npm run compile       # one-off build
npm run watch         # incremental build
```

Press `F5` in VS Code to launch the Extension Development Host with the extension loaded.
