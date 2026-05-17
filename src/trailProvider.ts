import * as vscode from 'vscode';
import * as path from 'path';

export interface NavNode {
    id: string;
    parentId: string | null;
    symbol: string;
    fromFile: string;
    fromLine: number;
    toFile: string;
    toLine: number;
}

export interface TrailState {
    nodes: NavNode[];
    currentId: string | null;
}

export const STATE_KEY = 'navtrace.trail.v2';
export const LEGACY_STATE_KEY = 'navtrace.trail.v1';

let idCounter = 0;
export function newId(): string {
    idCounter += 1;
    return `${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export class TrailProvider implements vscode.TreeDataProvider<string> {
    private readonly _onDidChange = new vscode.EventEmitter<string | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChange.event;

    private readonly nodes = new Map<string, NavNode>();
    private readonly childIds = new Map<string | null, string[]>();
    private currentId: string | null = null;

    constructor(private readonly state: vscode.Memento) {
        this.load();
    }

    private load(): void {
        const saved = this.state.get<TrailState>(STATE_KEY);
        if (saved && Array.isArray(saved.nodes)) {
            for (const node of saved.nodes) {
                this.indexNode(node);
            }
            this.currentId = saved.currentId ?? null;
            return;
        }

        const legacy = this.state.get<Array<Omit<NavNode, 'id' | 'parentId'>>>(LEGACY_STATE_KEY);
        if (Array.isArray(legacy) && legacy.length > 0) {
            let prevId: string | null = null;
            for (const old of legacy) {
                const node: NavNode = { ...old, id: newId(), parentId: prevId };
                this.indexNode(node);
                prevId = node.id;
            }
            this.currentId = prevId;
            this.persist();
            void this.state.update(LEGACY_STATE_KEY, undefined);
        }
    }

    private indexNode(node: NavNode): void {
        this.nodes.set(node.id, node);
        const siblings = this.childIds.get(node.parentId) ?? [];
        siblings.push(node.id);
        this.childIds.set(node.parentId, siblings);
    }

    private persist(): void {
        const data: TrailState = {
            nodes: Array.from(this.nodes.values()),
            currentId: this.currentId
        };
        void this.state.update(STATE_KEY, data);
    }

    push(partial: Omit<NavNode, 'id' | 'parentId'>): NavNode {
        const node: NavNode = { ...partial, id: newId(), parentId: this.currentId };
        this.indexNode(node);
        this.currentId = node.id;
        this.persist();
        this._onDidChange.fire();
        return node;
    }

    updateSymbol(id: string, symbol: string): void {
        const node = this.nodes.get(id);
        if (!node || node.symbol === symbol) {
            return;
        }
        node.symbol = symbol;
        this.persist();
        this._onDidChange.fire(id);
    }

    get(id: string): NavNode | undefined {
        return this.nodes.get(id);
    }

    getCurrent(): NavNode | undefined {
        return this.currentId ? this.nodes.get(this.currentId) : undefined;
    }

    getCurrentId(): string | null {
        return this.currentId;
    }

    setCurrent(id: string | null): void {
        this.currentId = id;
        this.persist();
        this._onDidChange.fire();
    }

    parentOf(id: string): NavNode | undefined {
        const node = this.nodes.get(id);
        if (!node || !node.parentId) {
            return undefined;
        }
        return this.nodes.get(node.parentId);
    }

    childrenOf(id: string | null): readonly string[] {
        return this.childIds.get(id) ?? [];
    }

    clear(): void {
        this.nodes.clear();
        this.childIds.clear();
        this.currentId = null;
        this.persist();
        this._onDidChange.fire();
    }

    size(): number {
        return this.nodes.size;
    }

    getTreeItem(id: string): vscode.TreeItem {
        const node = this.nodes.get(id);
        if (!node) {
            return new vscode.TreeItem('(missing)');
        }
        const children = this.childIds.get(id) ?? [];
        const isCurrent = id === this.currentId;
        const toShort = path.basename(node.toFile);
        const fromShort = path.basename(node.fromFile);

        const item = new vscode.TreeItem(
            node.symbol,
            children.length > 0
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None
        );
        item.description = `${toShort}:${node.toLine}${isCurrent ? '  ●' : ''}`;
        item.tooltip = `${node.symbol}\n${fromShort}:${node.fromLine} → ${toShort}:${node.toLine}${isCurrent ? '\n(current)' : ''}`;
        item.iconPath = new vscode.ThemeIcon(isCurrent ? 'circle-filled' : 'arrow-right');
        item.command = {
            command: 'navtrace.jumpTo',
            title: 'Jump to step',
            arguments: [id]
        };
        item.contextValue = 'navtrace.step';
        return item;
    }

    getChildren(id?: string): string[] {
        return [...(this.childIds.get(id ?? null) ?? [])];
    }

    getParent(id: string): string | undefined {
        return this.nodes.get(id)?.parentId ?? undefined;
    }
}
