import * as vscode from 'vscode';
import * as path from 'path';
import { NavNode, TrailProvider } from './trailProvider';

const NOISE_WORDS = new Set([
    'this', 'return', 'const', 'let', 'var', 'if', 'else',
    'true', 'false', 'null', 'undefined', 'new', 'await',
    'async', 'export', 'import', 'from', 'of', 'in'
]);

const DEFAULT_LANGUAGES = [
    'typescript', 'typescriptreact',
    'javascript', 'javascriptreact',
    'python', 'java', 'go', 'rust',
    'c', 'cpp', 'csharp', 'php', 'ruby'
];

function trackedLanguages(): Set<string> {
    const configured = vscode.workspace
        .getConfiguration('navtrace')
        .get<string[]>('languages', DEFAULT_LANGUAGES);
    return new Set(configured);
}

async function openAt(file: string, line: number): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(file);
    const editor = await vscode.window.showTextDocument(doc, { preview: false });
    const pos = new vscode.Position(Math.max(0, line - 1), 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
}

/**
 * Walks the document symbol tree to find the innermost symbol containing the given position.
 * Used to enrich captures with the real containing function/method name from the language server.
 */
export function findContainingSymbol(
    symbols: vscode.DocumentSymbol[] | undefined,
    position: vscode.Position
): vscode.DocumentSymbol | undefined {
    if (!symbols) {
        return undefined;
    }
    for (const sym of symbols) {
        if (!sym.range.contains(position)) {
            continue;
        }
        const inner = findContainingSymbol(sym.children, position);
        return inner ?? sym;
    }
    return undefined;
}

async function lookupContainingSymbol(
    uri: vscode.Uri,
    position: vscode.Position
): Promise<string | undefined> {
    try {
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            uri
        );
        return findContainingSymbol(symbols, position)?.name;
    } catch {
        return undefined;
    }
}

export function activate(context: vscode.ExtensionContext): { provider: TrailProvider } {
    const output = vscode.window.createOutputChannel('NavTrace');
    output.appendLine('NavTrace running...');

    const provider = new TrailProvider(context.workspaceState);
    const view = vscode.window.createTreeView('navtrace.trail', {
        treeDataProvider: provider,
        showCollapseAll: true
    });

    let lastSymbol: string | null = null;
    let lastFrom: { file: string; line: number } | null = null;
    let captureTime = 0;
    let debounceTimer: NodeJS.Timeout | null = null;
    let expectingSameFileJump = false;
    let suppressCaptureUntil = 0;

    function recordNode(toFile: string, toLine: number, toUri: vscode.Uri, toPosition: vscode.Position): void {
        if (!lastSymbol || !lastFrom) {
            return;
        }

        const node = provider.push({
            symbol: lastSymbol,
            fromFile: lastFrom.file,
            fromLine: lastFrom.line,
            toFile,
            toLine
        });

        output.appendLine(
            `+ ${node.symbol} — ${path.basename(node.fromFile)}:${node.fromLine} → ${path.basename(toFile)}:${toLine}`
        );

        void view.reveal(node.id, { select: true, focus: false, expand: true }).then(undefined, () => {});

        void lookupContainingSymbol(toUri, toPosition).then(name => {
            if (name && name !== node.symbol) {
                provider.updateSymbol(node.id, name);
                output.appendLine(`  resolved: ${node.symbol} → ${name}`);
            }
        });

        lastSymbol = null;
        lastFrom = null;
        expectingSameFileJump = false;
    }

    const onCursorMove = vscode.window.onDidChangeTextEditorSelection(event => {
        const editor = event.textEditor;
        const languages = trackedLanguages();
        if (!languages.has(editor.document.languageId)) {
            return;
        }
        if (event.kind !== vscode.TextEditorSelectionChangeKind.Command) {
            return;
        }
        if (Date.now() < suppressCaptureUntil) {
            return;
        }

        const position = editor.selection.active;
        const document = editor.document;
        const wordRange = document.getWordRangeAtPosition(position);
        const word = wordRange ? document.getText(wordRange) : null;
        const file = document.fileName;
        const line = position.line + 1;

        if (expectingSameFileJump && lastFrom && file === lastFrom.file) {
            if (line !== lastFrom.line) {
                recordNode(file, line, document.uri, position);
                return;
            }
        }

        if (!word) {
            return;
        }
        if (NOISE_WORDS.has(word)) {
            return;
        }
        if (word.length < 2) {
            return;
        }

        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
            lastSymbol = word;
            lastFrom = { file, line };
            captureTime = Date.now();
            expectingSameFileJump = true;
        }, 120);
    });

    const onNavigate = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor) {
            return;
        }
        const languages = trackedLanguages();
        if (!languages.has(editor.document.languageId)) {
            return;
        }
        if (!lastSymbol || !lastFrom) {
            return;
        }
        if (Date.now() < suppressCaptureUntil) {
            return;
        }

        const timeSince = Date.now() - captureTime;
        if (timeSince > 5000) {
            lastSymbol = null;
            lastFrom = null;
            return;
        }

        const position = editor.selection.active;
        recordNode(editor.document.fileName, position.line + 1, editor.document.uri, position);
    });

    const jumpTo = vscode.commands.registerCommand('navtrace.jumpTo', async (idOrNode: string | NavNode) => {
        const id = typeof idOrNode === 'string' ? idOrNode : idOrNode?.id;
        if (!id) {
            return;
        }
        const node = provider.get(id);
        if (!node) {
            return;
        }

        provider.setCurrent(id);
        suppressCaptureUntil = Date.now() + 500;
        try {
            await openAt(node.toFile, node.toLine);
        } catch (err) {
            void vscode.window.showErrorMessage(`NavTrace: could not open ${node.toFile}: ${err}`);
        }
    });

    const back = vscode.commands.registerCommand('navtrace.back', async () => {
        const current = provider.getCurrent();
        if (!current) {
            vscode.window.setStatusBarMessage('NavTrace: trail is empty', 2000);
            return;
        }

        const parent = provider.parentOf(current.id);
        provider.setCurrent(parent ? parent.id : null);

        const target = parent
            ? { file: parent.toFile, line: parent.toLine }
            : { file: current.fromFile, line: current.fromLine };

        suppressCaptureUntil = Date.now() + 500;
        try {
            await openAt(target.file, target.line);
            output.appendLine(`back to ${path.basename(target.file)}:${target.line}`);
        } catch (err) {
            void vscode.window.showErrorMessage(`NavTrace: could not open ${target.file}: ${err}`);
        }
    });

    const clear = vscode.commands.registerCommand('navtrace.clear', () => {
        provider.clear();
        output.appendLine('trail cleared');
    });

    const showOutput = vscode.commands.registerCommand('navtrace.showOutput', () => {
        output.show();
    });

    context.subscriptions.push(
        output,
        view,
        onCursorMove,
        onNavigate,
        jumpTo,
        back,
        clear,
        showOutput
    );

    return { provider };
}

export function deactivate(): void {
    // nothing to clean up beyond context.subscriptions
}
