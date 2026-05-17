import * as assert from 'assert';
import * as vscode from 'vscode';
import { findContainingSymbol } from '../extension';

function makeSymbol(
    name: string,
    range: vscode.Range,
    children: vscode.DocumentSymbol[] = []
): vscode.DocumentSymbol {
    const sym = new vscode.DocumentSymbol(
        name,
        '',
        vscode.SymbolKind.Function,
        range,
        range
    );
    sym.children = children;
    return sym;
}

suite('Extension', () => {
    test('the extension activates and registers commands', async () => {
        const ext = vscode.extensions.getExtension('breadkrumb.navtrace');
        assert.ok(ext, 'extension should be registered');
        await ext!.activate();
        const commands = await vscode.commands.getCommands(true);
        assert.ok(commands.includes('navtrace.back'));
        assert.ok(commands.includes('navtrace.jumpTo'));
        assert.ok(commands.includes('navtrace.clear'));
        assert.ok(commands.includes('navtrace.showOutput'));
    });
});

suite('findContainingSymbol', () => {
    test('returns undefined when there are no symbols', () => {
        assert.strictEqual(findContainingSymbol(undefined, new vscode.Position(0, 0)), undefined);
        assert.strictEqual(findContainingSymbol([], new vscode.Position(0, 0)), undefined);
    });

    test('returns the outer symbol when no children contain the position', () => {
        const outer = makeSymbol('outer', new vscode.Range(0, 0, 10, 0));
        const result = findContainingSymbol([outer], new vscode.Position(2, 0));
        assert.strictEqual(result?.name, 'outer');
    });

    test('prefers the innermost containing symbol', () => {
        const inner = makeSymbol('inner', new vscode.Range(2, 0, 4, 0));
        const outer = makeSymbol('outer', new vscode.Range(0, 0, 10, 0), [inner]);

        assert.strictEqual(
            findContainingSymbol([outer], new vscode.Position(3, 0))?.name,
            'inner'
        );
        assert.strictEqual(
            findContainingSymbol([outer], new vscode.Position(5, 0))?.name,
            'outer'
        );
    });

    test('returns undefined when position falls outside every symbol', () => {
        const a = makeSymbol('a', new vscode.Range(0, 0, 2, 0));
        const b = makeSymbol('b', new vscode.Range(5, 0, 7, 0));
        assert.strictEqual(findContainingSymbol([a, b], new vscode.Position(3, 0)), undefined);
    });
});
