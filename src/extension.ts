import * as vscode from 'vscode';

interface NavNode {
    symbol: string;
    fromFile: string;
    fromLine: number;
    toFile: string;
    toLine: number;
}

const NOISE_WORDS = new Set([
    'this', 'return', 'const', 'let', 'var', 'if', 'else',
    'true', 'false', 'null', 'undefined', 'new', 'await',
    'async', 'export', 'import', 'from', 'of', 'in'
]);

export function activate(context: vscode.ExtensionContext) {

    const output = vscode.window.createOutputChannel('NavTrace');
    output.show();
    output.appendLine('NavTrace running...');

    const TRACKED_LANGUAGES = ['typescript', 'javascript', 'typescriptreact'];
    const trail: NavNode[] = [];

    let lastSymbol: string | null = null;
    let lastFrom: { file: string; line: number } | null = null;
    let captureTime = 0;
    let debounceTimer: NodeJS.Timeout | null = null;
    let expectingSameFileJump = false;

    function recordNode(toFile: string, toLine: number) {
        if (!lastSymbol || !lastFrom) return;

        const fromShort = lastFrom.file.split('\\').pop() || lastFrom.file;
        const toShort = toFile.split('\\').pop() || toFile;

        const node: NavNode = {
            symbol: lastSymbol,
            fromFile: lastFrom.file,
            fromLine: lastFrom.line,
            toFile,
            toLine
        };

        trail.push(node);
        output.appendLine(
            `[${trail.length}] ${node.symbol} — ${fromShort}:${node.fromLine} → ${toShort}:${toLine}`
        );

        lastSymbol = null;
        lastFrom = null;
        expectingSameFileJump = false;
    }

    const onCursorMove = vscode.window.onDidChangeTextEditorSelection(event => {
        const editor = event.textEditor;
        if (!TRACKED_LANGUAGES.includes(editor.document.languageId)) return;
        if (event.kind !== vscode.TextEditorSelectionChangeKind.Command) return;

        const position = editor.selection.active;
        const document = editor.document;
        const wordRange = document.getWordRangeAtPosition(position);
        const word = wordRange ? document.getText(wordRange) : null;
        const file = document.fileName;
        const line = position.line + 1;

        // if we're expecting a same file jump destination
        // and cursor moved to a different line — record it
        if (expectingSameFileJump && lastFrom && file === lastFrom.file) {
            if (line !== lastFrom.line) {
                recordNode(file, line);
                return;
            }
        }

        if (!word) return;
        if (NOISE_WORDS.has(word)) return;
        if (word.length < 2) return;

        // debounce double-fire
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            lastSymbol = word;
            lastFrom = { file, line };
            captureTime = Date.now();
            expectingSameFileJump = true;
            output.appendLine(`captured: ${word} at ${file.split('\\').pop()}:${line}`);
        }, 120);
    });

    const onNavigate = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor) return;
        if (!TRACKED_LANGUAGES.includes(editor.document.languageId)) return;
        if (!lastSymbol || !lastFrom) return;

        const timeSince = Date.now() - captureTime;
        if (timeSince > 5000) {
            lastSymbol = null;
            lastFrom = null;
            return;
        }

        const toFile = editor.document.fileName;
        const toLine = editor.selection.active.line + 1;

        recordNode(toFile, toLine);
    });

    context.subscriptions.push(onCursorMove, onNavigate);
}

export function deactivate() {}