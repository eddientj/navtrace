import * as assert from 'assert';
import * as vscode from 'vscode';
import {
    TrailProvider,
    NavNode,
    STATE_KEY,
    LEGACY_STATE_KEY
} from '../trailProvider';

/** In-memory Memento for isolated tests. */
class FakeMemento implements vscode.Memento {
    private readonly store = new Map<string, unknown>();

    keys(): readonly string[] {
        return [...this.store.keys()];
    }

    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    get<T>(key: string, defaultValue?: T): T | undefined {
        return (this.store.has(key) ? this.store.get(key) : defaultValue) as T | undefined;
    }

    update(key: string, value: unknown): Thenable<void> {
        if (value === undefined) {
            this.store.delete(key);
        } else {
            this.store.set(key, value);
        }
        return Promise.resolve();
    }

    setEternalSeed(key: string, value: unknown): void {
        this.store.set(key, value);
    }
}

function sampleStep(overrides: Partial<Omit<NavNode, 'id' | 'parentId'>> = {}): Omit<NavNode, 'id' | 'parentId'> {
    return {
        symbol: 'foo',
        fromFile: '/repo/a.ts',
        fromLine: 10,
        toFile: '/repo/b.ts',
        toLine: 20,
        ...overrides
    };
}

suite('TrailProvider', () => {
    test('starts empty', () => {
        const provider = new TrailProvider(new FakeMemento());
        assert.strictEqual(provider.size(), 0);
        assert.strictEqual(provider.getCurrentId(), null);
        assert.deepStrictEqual(provider.getChildren(), []);
    });

    test('push appends a node and advances the current pointer', () => {
        const provider = new TrailProvider(new FakeMemento());
        const node = provider.push(sampleStep({ symbol: 'first' }));

        assert.strictEqual(provider.size(), 1);
        assert.strictEqual(provider.getCurrentId(), node.id);
        assert.strictEqual(provider.getCurrent()?.symbol, 'first');
        assert.deepStrictEqual(provider.getChildren(), [node.id]);
    });

    test('push parents new nodes under the current pointer (linear walk)', () => {
        const provider = new TrailProvider(new FakeMemento());
        const a = provider.push(sampleStep({ symbol: 'a' }));
        const b = provider.push(sampleStep({ symbol: 'b' }));
        const c = provider.push(sampleStep({ symbol: 'c' }));

        assert.strictEqual(b.parentId, a.id);
        assert.strictEqual(c.parentId, b.id);
        assert.deepStrictEqual(provider.getChildren(), [a.id]);
        assert.deepStrictEqual(provider.getChildren(a.id), [b.id]);
        assert.deepStrictEqual(provider.getChildren(b.id), [c.id]);
        assert.strictEqual(provider.getCurrentId(), c.id);
    });

    test('setCurrent to a parent then push creates a branch (the core branching feature)', () => {
        const provider = new TrailProvider(new FakeMemento());
        const a = provider.push(sampleStep({ symbol: 'a' }));
        const b = provider.push(sampleStep({ symbol: 'b' }));
        provider.push(sampleStep({ symbol: 'c' })); // a > b > c

        provider.setCurrent(a.id);
        const d = provider.push(sampleStep({ symbol: 'd' })); // forks at a

        assert.strictEqual(d.parentId, a.id);
        const childrenOfA = provider.getChildren(a.id);
        assert.strictEqual(childrenOfA.length, 2, 'a should now have two children');
        assert.ok(childrenOfA.includes(b.id));
        assert.ok(childrenOfA.includes(d.id));
        assert.strictEqual(provider.getCurrentId(), d.id);
    });

    test('parentOf returns parent node or undefined for roots', () => {
        const provider = new TrailProvider(new FakeMemento());
        const a = provider.push(sampleStep({ symbol: 'a' }));
        const b = provider.push(sampleStep({ symbol: 'b' }));

        assert.strictEqual(provider.parentOf(a.id), undefined, 'root has no parent');
        assert.strictEqual(provider.parentOf(b.id)?.id, a.id);
    });

    test('clear empties everything', () => {
        const provider = new TrailProvider(new FakeMemento());
        provider.push(sampleStep());
        provider.push(sampleStep());

        provider.clear();

        assert.strictEqual(provider.size(), 0);
        assert.strictEqual(provider.getCurrentId(), null);
        assert.deepStrictEqual(provider.getChildren(), []);
    });

    test('updateSymbol mutates only the named node', () => {
        const provider = new TrailProvider(new FakeMemento());
        const a = provider.push(sampleStep({ symbol: 'a' }));
        const b = provider.push(sampleStep({ symbol: 'b' }));

        provider.updateSymbol(a.id, 'MyClass.a');

        assert.strictEqual(provider.get(a.id)?.symbol, 'MyClass.a');
        assert.strictEqual(provider.get(b.id)?.symbol, 'b');
    });

    test('updateSymbol is a no-op when the symbol is unchanged', () => {
        const provider = new TrailProvider(new FakeMemento());
        const a = provider.push(sampleStep({ symbol: 'a' }));

        let fired = 0;
        provider.onDidChangeTreeData(() => { fired += 1; });
        provider.updateSymbol(a.id, 'a');

        assert.strictEqual(fired, 0, 'unchanged updates should not fire change events');
    });

    test('persists to memento and rehydrates with the same structure', () => {
        const memento = new FakeMemento();

        const first = new TrailProvider(memento);
        const a = first.push(sampleStep({ symbol: 'a' }));
        const b = first.push(sampleStep({ symbol: 'b' }));
        first.setCurrent(a.id);
        const c = first.push(sampleStep({ symbol: 'c' })); // a > {b, c}

        const second = new TrailProvider(memento);
        assert.strictEqual(second.size(), 3);
        assert.strictEqual(second.getCurrentId(), c.id);
        assert.deepStrictEqual(
            new Set(second.getChildren(a.id)),
            new Set([b.id, c.id])
        );
    });

    test('migrates a legacy v1 flat trail into a linear chain', () => {
        const memento = new FakeMemento();
        const legacy = [
            { symbol: 'a', fromFile: '/x.ts', fromLine: 1, toFile: '/y.ts', toLine: 2 },
            { symbol: 'b', fromFile: '/y.ts', fromLine: 2, toFile: '/z.ts', toLine: 3 }
        ];
        memento.setEternalSeed(LEGACY_STATE_KEY, legacy);

        const provider = new TrailProvider(memento);

        assert.strictEqual(provider.size(), 2);
        const roots = provider.getChildren();
        assert.strictEqual(roots.length, 1, 'migration should produce one root');
        const root = provider.get(roots[0])!;
        assert.strictEqual(root.symbol, 'a');
        const second = provider.get(provider.getChildren(root.id)[0])!;
        assert.strictEqual(second.symbol, 'b');
        assert.strictEqual(provider.getCurrentId(), second.id);
        // legacy key wiped
        assert.strictEqual(memento.get(LEGACY_STATE_KEY), undefined);
        // new key populated
        assert.ok(memento.get(STATE_KEY));
    });

    test('getTreeItem reflects current marker and collapsible state', () => {
        const provider = new TrailProvider(new FakeMemento());
        const a = provider.push(sampleStep({ symbol: 'parent', toFile: '/repo/x.ts', toLine: 5 }));
        const b = provider.push(sampleStep({ symbol: 'child' }));

        const parentItem = provider.getTreeItem(a.id);
        const childItem = provider.getTreeItem(b.id);

        assert.strictEqual(parentItem.label, 'parent');
        assert.strictEqual(
            parentItem.collapsibleState,
            vscode.TreeItemCollapsibleState.Expanded,
            'parent with children should be expandable'
        );
        assert.ok(
            String(parentItem.description ?? '').includes('x.ts:5'),
            'description should include the to-file basename and line'
        );

        assert.strictEqual(
            childItem.collapsibleState,
            vscode.TreeItemCollapsibleState.None,
            'leaf has no collapsible state'
        );
        assert.ok(
            String(childItem.description ?? '').includes('●'),
            'current node description should carry the current marker'
        );
    });

    test('onDidChangeTreeData fires on push, clear, and setCurrent', () => {
        const provider = new TrailProvider(new FakeMemento());
        let count = 0;
        provider.onDidChangeTreeData(() => { count += 1; });

        provider.push(sampleStep());
        provider.setCurrent(null);
        provider.clear();

        assert.strictEqual(count, 3);
    });
});
