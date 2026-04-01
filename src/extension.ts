import * as vscode from 'vscode';

interface NavNode {
    symbol: string;
    fromFile: string;
    fromLine: number;
    toFile: string;
    toLine: number;
    relFromFile: string;
    relToFile: string;
}

const NOISE_WORDS = new Set([
    'this', 'return', 'const', 'let', 'var', 'if', 'else',
    'true', 'false', 'null', 'undefined', 'new', 'await',
    'async', 'export', 'import', 'from', 'of', 'in'
]);

function relativePath(absPath: string): string {
    return vscode.workspace.asRelativePath(absPath, false);
}

class NavTraceViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewId = 'navtrace.trailView';

    private _view?: vscode.WebviewView;
    private _trail: NavNode[] = [];

    constructor(private readonly _extensionUri: vscode.Uri) {}

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this._getHtml();

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._send(this._trail);
            }
        });
    }

    sendTrail(trail: NavNode[]) {
        this._trail = trail;
        this._send(trail);
    }

    private _send(trail: NavNode[]) {
        if (this._view) {
            this._view.webview.postMessage({ type: 'update', trail });
        }
    }

    private _getHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NavTrace</title>
<style>
  body { margin: 0; overflow: hidden; background: var(--vscode-editor-background); }
  svg { width: 100vw; height: 100vh; }
  .node circle { fill: var(--vscode-button-background); stroke: var(--vscode-button-foreground); stroke-width: 1.5px; }
  .node .label-main { font-size: 11px; font-weight: bold; fill: var(--vscode-editor-foreground); pointer-events: none; }
  .node .label-sub  { font-size: 9px; fill: var(--vscode-descriptionForeground); pointer-events: none; }
  .link { stroke: var(--vscode-editorLineNumber-foreground); stroke-opacity: 0.6; stroke-width: 1.5px; fill: none; }
  #empty { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
           color: var(--vscode-descriptionForeground); font-family: var(--vscode-font-family);
           font-size: 12px; text-align: center; pointer-events: none; }
</style>
</head>
<body>
<div id="empty">Navigate code to build the call trail.</div>
<svg id="graph"></svg>
<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
<script>
const svg   = d3.select('#graph');
const empty = document.getElementById('empty');
let simulation = null;
const savedPos = new Map(); // persists node positions across re-renders

function fileName(p) { return p.split(/[\\/]/).pop() || p; }

function render(trail) {
  empty.style.display = trail.length === 0 ? 'block' : 'none';
  if (simulation) { simulation.stop(); simulation = null; }
  svg.selectAll('*').remove();
  if (trail.length === 0) { savedPos.clear(); return; }

  const width  = window.innerWidth;
  const height = window.innerHeight;

  const nodeMap = new Map();
  const links   = [];
  let order = 0;

  for (const step of trail) {
    const srcId = step.fromFile + ':' + step.symbol;
    const dstId = step.toFile   + ':' + step.toLine;

    if (!nodeMap.has(srcId)) {
      nodeMap.set(srcId, { id: srcId, label: step.symbol,              sub: step.relFromFile + ':' + step.fromLine, order: order++ });
    }
    if (!nodeMap.has(dstId)) {
      nodeMap.set(dstId, { id: dstId, label: fileName(step.relToFile), sub: step.relToFile   + ':' + step.toLine,  order: order++ });
    }
    links.push({ source: srcId, target: dstId });
  }

  const nodes = Array.from(nodeMap.values());
  const STEP  = 160;

  // Restore saved positions for existing nodes; seed new nodes off the right edge
  nodes.forEach(n => {
    const s = savedPos.get(n.id);
    if (s) { n.x = s.x; n.y = s.y; }
    else    { n.x = 60 + n.order * STEP; n.y = height / 2 + (Math.random() - 0.5) * 40; }
  });

  const g = svg.append('g');
  const zoom = d3.zoom().scaleExtent([0.1, 4]).on('zoom', e => g.attr('transform', e.transform));
  svg.call(zoom).on('dblclick.zoom', null); // disable double-click zoom-in

  svg.append('defs').append('marker')
    .attr('id', 'arrow').attr('viewBox', '0 -4 8 8')
    .attr('refX', 20).attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
    .append('path').attr('d', 'M0,-4L8,0L0,4').attr('fill', '#888');

  const link = g.append('g').selectAll('line').data(links).join('line')
    .attr('class', 'link').attr('marker-end', 'url(#arrow)');

  const node = g.append('g').selectAll('g').data(nodes).join('g')
    .attr('class', 'node')
    .attr('transform', d => \`translate(\${d.x},\${d.y})\`)
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active && simulation) simulation.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end',   (e, d) => { if (!e.active && simulation) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
    );

  node.append('circle').attr('r', 16);
  node.append('text').attr('class', 'label-main').attr('x', 22).attr('dy', '-0.1em').text(d => d.label);
  node.append('text').attr('class', 'label-sub' ).attr('x', 22).attr('dy', '1.1em' ).text(d => d.sub);

  simulation = d3.forceSimulation(nodes)
    .force('link',   d3.forceLink(links).id(d => d.id).distance(STEP * 0.8).strength(0.8))
    .force('charge', d3.forceManyBody().strength(-120))
    .force('x',      d3.forceX(d => 60 + d.order * STEP).strength(0.4))
    .force('y',      d3.forceY(height / 2).strength(0.3))
    .alphaDecay(0.06).alphaMin(0.05)
    .on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      node.attr('transform', d => \`translate(\${d.x},\${d.y})\`);
      nodes.forEach(n => savedPos.set(n.id, { x: n.x, y: n.y }));
    });
}

window.addEventListener('message', e => {
  if (e.data.type === 'update') render(e.data.trail);
});
</script>
</body>
</html>`;
    }
}

export function activate(context: vscode.ExtensionContext) {

    const output = vscode.window.createOutputChannel('NavTrace');
    output.show();
    output.appendLine('NavTrace running...');

    const TRACKED_LANGUAGES = ['typescript', 'javascript', 'typescriptreact'];
    const trail: NavNode[] = [];

    const provider = new NavTraceViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(NavTraceViewProvider.viewId, provider)
    );

    let lastSymbol: string | null = null;
    let lastFrom: { file: string; line: number } | null = null;
    let captureTime = 0;
    // pendingWord/From: the most recent Command-kind cursor position, used to detect same-file jumps
    let pendingWord: string | null = null;
    let pendingFrom: { file: string; line: number } | null = null;

    function recordNode(toFile: string, toLine: number) {
        if (!lastSymbol || !lastFrom) return;

        const node: NavNode = {
            symbol: lastSymbol,
            fromFile: lastFrom.file,
            fromLine: lastFrom.line,
            toFile,
            toLine,
            relFromFile: relativePath(lastFrom.file),
            relToFile:   relativePath(toFile),
        };

        trail.push(node);
        output.appendLine(
            `[${trail.length}] ${node.symbol} — ${node.relFromFile}:${node.fromLine} → ${node.relToFile}:${toLine}`
        );
        provider.sendTrail(trail);

        lastSymbol = null;
        lastFrom = null;
        pendingWord = null;
        pendingFrom = null;
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

        // Two consecutive Command events in the same file at different lines = same-file Go to Definition
        if (pendingFrom && pendingWord &&
            file === pendingFrom.file && line !== pendingFrom.line) {
            lastSymbol = pendingWord;
            lastFrom = pendingFrom;
            captureTime = Date.now();
            recordNode(file, line);
            return;
        }

        if (!word || NOISE_WORDS.has(word) || word.length < 2) {
            pendingWord = null;
            pendingFrom = null;
            return;
        }

        // Capture immediately — no debounce — so the cross-file onNavigate and
        // same-file second-event both see the right source word
        pendingWord = word;
        pendingFrom = { file, line };
        lastSymbol = word;
        lastFrom = { file, line };
        captureTime = Date.now();
        output.appendLine(`captured: ${word} at ${relativePath(file)}:${line}`);
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

    const clearCommand = vscode.commands.registerCommand('navtrace.clearTrail', () => {
        trail.length = 0;
        provider.sendTrail(trail);
        output.appendLine('Trail cleared.');
    });

    const exportCommand = vscode.commands.registerCommand('navtrace.exportTrail', async () => {
        if (trail.length === 0) {
            vscode.window.showInformationMessage('NavTrace: Nothing to export — trail is empty.');
            return;
        }
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file('navtrace-session.json'),
            filters: { 'JSON': ['json'] }
        });
        if (!uri) return;
        const content = JSON.stringify(trail, null, 2);
        await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
        vscode.window.showInformationMessage(`NavTrace: Trail exported to ${uri.fsPath}`);
    });

    context.subscriptions.push(onCursorMove, onNavigate, clearCommand, exportCommand);
}

export function deactivate() {}
