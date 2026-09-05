export function getViewerHtml(wsPort = 5051): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🐦 PigeonGraph — Live Architecture Canvas</title>
  <style>
    :root {
      --bg: #080b14;
      --panel-bg: rgba(13, 20, 36, 0.88);
      --panel-border: #1e293b;
      --panel-border-bright: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --cyan: #06b6d4;
      --cyan-bright: #22d3ee;
      --purple: #a855f7;
      --purple-bright: #c084fc;
      --green: #10b981;
      --amber: #f59e0b;
      --rose: #f43f5e;
      --blue: #3b82f6;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      overflow: hidden;
      height: 100vh;
      width: 100vw;
      user-select: none;
    }

    /* Top Navigation Bar */
    header {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 56px;
      background: var(--panel-bg);
      backdrop-filter: blur(16px);
      border-bottom: 1px solid var(--panel-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      z-index: 20;
      gap: 16px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 15px;
      letter-spacing: -0.02em;
      white-space: nowrap;
    }
    .brand-badge {
      background: rgba(6, 182, 212, 0.15);
      color: var(--cyan);
      border: 1px solid rgba(6, 182, 212, 0.35);
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 10px;
      font-family: var(--font-mono);
      font-weight: 600;
      letter-spacing: 0.05em;
    }

    /* Filter Controls in Header */
    .filter-group {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      max-width: 720px;
    }

    .search-box {
      display: flex;
      align-items: center;
      background: #0f172a;
      border: 1px solid var(--panel-border);
      border-radius: 8px;
      padding: 6px 12px;
      width: 260px;
      gap: 8px;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    .search-box:focus-within {
      border-color: var(--cyan);
      box-shadow: 0 0 0 2px rgba(6, 182, 212, 0.2);
    }
    .search-box input {
      background: transparent;
      border: none;
      color: var(--text);
      font-size: 12px;
      outline: none;
      width: 100%;
    }
    .search-box input::placeholder { color: var(--text-dim); }

    .kind-filters {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow-x: auto;
    }
    .filter-btn {
      background: #0f172a;
      border: 1px solid var(--panel-border);
      color: var(--text-muted);
      font-size: 11px;
      font-family: var(--font-mono);
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .filter-btn:hover {
      background: #1e293b;
      color: var(--text);
      border-color: var(--panel-border-bright);
    }
    .filter-btn.active {
      background: rgba(6, 182, 212, 0.2);
      color: var(--cyan-bright);
      border-color: rgba(6, 182, 212, 0.5);
      font-weight: 600;
    }

    .stats {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 11px;
      font-family: var(--font-mono);
      white-space: nowrap;
    }
    .stat-pill {
      background: #0f172a;
      border: 1px solid var(--panel-border);
      padding: 4px 10px;
      border-radius: 6px;
      color: var(--text-muted);
    }
    .stat-pill strong { color: var(--text); }

    .live-status {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      padding: 4px 8px;
      border-radius: 6px;
      background: #0f172a;
      border: 1px solid var(--panel-border);
    }
    .pulse-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--amber);
      box-shadow: 0 0 8px var(--amber);
      transition: background 0.2s, box-shadow 0.2s;
    }
    .pulse-dot.connected {
      background: var(--green);
      box-shadow: 0 0 10px var(--green);
      animation: pulse 2.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(0.85); }
    }

    /* Main Canvas */
    #canvas-container {
      width: 100vw;
      height: 100vh;
      position: relative;
    }
    canvas {
      display: block;
      cursor: grab;
    }
    canvas:active { cursor: grabbing; }

    /* Floating Toolbar Controls */
    .controls-bar {
      position: absolute;
      bottom: 24px;
      right: 24px;
      background: var(--panel-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--panel-border);
      border-radius: 10px;
      display: flex;
      gap: 4px;
      padding: 5px;
      box-shadow: 0 12px 28px rgba(0,0,0,0.5);
      z-index: 15;
    }
    .control-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      width: 34px;
      height: 34px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.15s;
    }
    .control-btn:hover {
      background: #1e293b;
      color: var(--text);
    }
    .control-btn.active {
      background: rgba(6, 182, 212, 0.2);
      color: var(--cyan);
    }

    /* Floating Legend */
    .legend {
      position: absolute;
      bottom: 24px;
      left: 24px;
      background: var(--panel-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--panel-border);
      border-radius: 10px;
      padding: 10px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 11px;
      font-family: var(--font-mono);
      z-index: 10;
      box-shadow: 0 12px 28px rgba(0,0,0,0.5);
    }
    .legend-row {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .legend-color { width: 9px; height: 9px; border-radius: 50%; }
    .legend-tip {
      font-size: 10px;
      color: var(--text-dim);
      border-top: 1px solid var(--panel-border);
      padding-top: 6px;
      margin-top: 2px;
    }

    /* Right Inspection Drawer */
    #drawer {
      position: absolute;
      top: 68px; right: 20px; bottom: 24px;
      width: 380px;
      background: var(--panel-bg);
      backdrop-filter: blur(20px);
      border: 1px solid var(--panel-border);
      border-radius: 12px;
      box-shadow: 0 24px 48px rgba(0,0,0,0.6);
      display: flex;
      flex-direction: column;
      z-index: 30;
      transition: transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s;
      overflow: hidden;
    }
    #drawer.collapsed {
      transform: translateX(410px);
      opacity: 0;
      pointer-events: none;
    }

    .drawer-header {
      padding: 16px;
      border-bottom: 1px solid var(--panel-border);
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      background: rgba(15, 23, 42, 0.5);
    }
    .drawer-title-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-width: 300px;
    }
    .drawer-title {
      font-size: 15px;
      font-weight: 700;
      color: var(--text);
      word-break: break-all;
      letter-spacing: -0.01em;
    }
    .drawer-badge-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .drawer-kind {
      font-size: 10px;
      font-family: var(--font-mono);
      font-weight: 600;
      text-transform: uppercase;
      padding: 2px 7px;
      border-radius: 4px;
      background: rgba(168, 85, 247, 0.18);
      color: var(--purple-bright);
      border: 1px solid rgba(168, 85, 247, 0.35);
      display: inline-block;
    }
    .drawer-pkg {
      font-size: 10px;
      font-family: var(--font-mono);
      padding: 2px 7px;
      border-radius: 4px;
      background: rgba(59, 130, 246, 0.15);
      color: var(--blue);
      border: 1px solid rgba(59, 130, 246, 0.3);
    }
    .close-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 18px;
      padding: 2px 6px;
      border-radius: 4px;
      transition: color 0.15s, background 0.15s;
    }
    .close-btn:hover { color: var(--text); background: #1e293b; }

    /* Quick Action Buttons in Drawer */
    .drawer-actions {
      display: flex;
      gap: 8px;
      padding: 8px 16px;
      border-bottom: 1px solid var(--panel-border);
      background: rgba(10, 15, 28, 0.4);
    }
    .action-btn {
      flex: 1;
      background: #0f172a;
      border: 1px solid var(--panel-border);
      color: var(--text-muted);
      font-size: 11px;
      font-family: var(--font-mono);
      padding: 5px 8px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      transition: all 0.15s;
    }
    .action-btn:hover {
      background: #1e293b;
      color: var(--text);
      border-color: var(--panel-border-bright);
    }

    .drawer-body {
      padding: 16px;
      overflow-y: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 16px;
      font-size: 12px;
    }

    .prop-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .prop-label {
      font-size: 10px;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-family: var(--font-mono);
    }
    .prop-val {
      font-size: 12px;
      font-family: var(--font-mono);
      color: var(--text);
      word-break: break-all;
    }

    .code-block {
      background: #040711;
      border: 1px solid #1e293b;
      border-radius: 6px;
      padding: 10px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: #38bdf8;
      overflow-x: auto;
      white-space: pre-wrap;
      line-height: 1.45;
    }

    /* Related Connections in Drawer */
    .connections-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .connections-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      font-family: var(--font-mono);
      display: flex;
      justify-content: space-between;
    }
    .connections-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      max-height: 140px;
      overflow-y: auto;
    }
    .connection-pill {
      background: #0f172a;
      border: 1px solid var(--panel-border);
      padding: 5px 8px;
      border-radius: 6px;
      font-family: var(--font-mono);
      font-size: 11px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      color: var(--text-muted);
      transition: all 0.15s;
    }
    .connection-pill:hover {
      background: #1e293b;
      color: var(--cyan-bright);
      border-color: rgba(6, 182, 212, 0.4);
    }
    .connection-tag {
      font-size: 9px;
      padding: 1px 4px;
      border-radius: 3px;
      background: rgba(255,255,255,0.06);
    }

    /* Live Mutation Feed */
    .feed-container {
      border-top: 1px solid var(--panel-border);
      max-height: 140px;
      display: flex;
      flex-direction: column;
      background: rgba(4, 7, 17, 0.7);
    }
    .feed-title {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-dim);
      padding: 8px 14px;
      border-bottom: 1px solid var(--panel-border);
      font-family: var(--font-mono);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .feed-list {
      overflow-y: auto;
      flex: 1;
      font-family: var(--font-mono);
      font-size: 10px;
      padding: 6px 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .feed-item {
      display: flex;
      gap: 6px;
      color: var(--text-muted);
    }
    .feed-tag-upsert { color: var(--green); font-weight: 600; }
    .feed-tag-delete { color: var(--rose); font-weight: 600; }

    /* Tooltip */
    #tooltip {
      position: absolute;
      pointer-events: none;
      background: rgba(15, 23, 42, 0.94);
      border: 1px solid var(--cyan);
      border-radius: 6px;
      padding: 4px 8px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--text);
      z-index: 100;
      display: none;
      white-space: nowrap;
      box-shadow: 0 8px 16px rgba(0,0,0,0.5);
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span>🐦</span> PigeonGraph
      <span class="brand-badge">LIVE ARCHITECTURE</span>
    </div>

    <div class="filter-group">
      <div class="search-box">
        <span>🔍</span>
        <input type="text" id="search-input" placeholder="Search symbol, route, file..." autocomplete="off">
      </div>

      <div class="kind-filters" id="kind-filters">
        <button class="filter-btn active" data-kind="all">All</button>
        <button class="filter-btn" data-kind="file">Files</button>
        <button class="filter-btn" data-kind="class">Classes</button>
        <button class="filter-btn" data-kind="method">Methods</button>
        <button class="filter-btn" data-kind="function">Functions</button>
        <button class="filter-btn" data-kind="route">Routes</button>
      </div>
    </div>

    <div class="stats">
      <div class="stat-pill">Nodes: <strong id="node-count">0</strong></div>
      <div class="stat-pill">Edges: <strong id="edge-count">0</strong></div>
      <div class="live-status">
        <span class="pulse-dot" id="status-dot"></span>
        <span id="status-text">Connecting...</span>
      </div>
    </div>
  </header>

  <div id="canvas-container">
    <canvas id="viewport"></canvas>
  </div>

  <div id="tooltip"></div>

  <!-- Floating Controls -->
  <div class="controls-bar">
    <button class="control-btn" id="btn-fit" title="Fit to View (F / Space)">⛶</button>
    <button class="control-btn" id="btn-zoom-in" title="Zoom In (+)">➕</button>
    <button class="control-btn" id="btn-zoom-out" title="Zoom Out (-)">➖</button>
    <button class="control-btn" id="btn-pause" title="Pause / Resume Physics (P)">⏸</button>
    <button class="control-btn" id="btn-reheat" title="Reheat Layout (R)">🔄</button>
  </div>

  <!-- Floating Legend -->
  <div class="legend">
    <div class="legend-row">
      <div class="legend-item"><span class="legend-color" style="background:#06b6d4;"></span> Function</div>
      <div class="legend-item"><span class="legend-color" style="background:#38bdf8;"></span> Method</div>
      <div class="legend-item"><span class="legend-color" style="background:#a855f7;"></span> Class / Struct</div>
      <div class="legend-item"><span class="legend-color" style="background:#10b981;"></span> Route</div>
      <div class="legend-item"><span class="legend-color" style="background:#f59e0b;"></span> File Hub</div>
    </div>
    <div class="legend-tip">
      Scroll: Zoom &nbsp;|&nbsp; Drag: Pan/Move Node &nbsp;|&nbsp; Click: Inspect &nbsp;|&nbsp; F: Fit
    </div>
  </div>

  <!-- Inspection Drawer -->
  <div id="drawer" class="collapsed">
    <div class="drawer-header">
      <div class="drawer-title-row">
        <div class="drawer-title" id="d-name">Symbol Details</div>
        <div class="drawer-badge-row">
          <span class="drawer-kind" id="d-kind">FUNCTION</span>
          <span class="drawer-pkg" id="d-pkg">package</span>
        </div>
      </div>
      <button class="close-btn" id="d-close" title="Close (Esc)">&times;</button>
    </div>

    <div class="drawer-actions">
      <button class="action-btn" id="btn-focus-node">🎯 Center Camera</button>
      <button class="action-btn" id="btn-copy-id">📋 Copy URN</button>
    </div>

    <div class="drawer-body">
      <div class="prop-row">
        <div class="prop-label">Qualified Name</div>
        <div class="prop-val" id="d-qname">-</div>
      </div>
      <div class="prop-row">
        <div class="prop-label">Source Location</div>
        <div class="prop-val" id="d-loc">-</div>
      </div>
      <div class="prop-row">
        <div class="prop-label">Signature</div>
        <div class="code-block" id="d-sig">// No signature</div>
      </div>
      <div class="prop-row">
        <div class="prop-label">Semantic Invariant Hash</div>
        <div class="prop-val" id="d-hash" style="font-size: 10px; color: var(--text-muted);">-</div>
      </div>

      <!-- Outgoing dependencies -->
      <div class="connections-section">
        <div class="connections-title">
          <span>Outgoing Dependencies</span>
          <span id="d-out-count" style="color:var(--cyan);">0</span>
        </div>
        <div class="connections-list" id="d-out-list">
          <div style="color:var(--text-dim); font-size:11px;">No outgoing calls or imports</div>
        </div>
      </div>

      <!-- Incoming dependencies -->
      <div class="connections-section">
        <div class="connections-title">
          <span>Incoming Callers / References</span>
          <span id="d-in-count" style="color:var(--purple-bright);">0</span>
        </div>
        <div class="connections-list" id="d-in-list">
          <div style="color:var(--text-dim); font-size:11px;">No incoming callers detected</div>
        </div>
      </div>
    </div>

    <div class="feed-container">
      <div class="feed-title">
        <span>Live Diff Stream</span>
        <span style="font-size:9px; color:var(--text-dim);">WebSocket :${wsPort}</span>
      </div>
      <div class="feed-list" id="mutation-feed">
        <div class="feed-item"><span class="feed-tag-upsert">[READY]</span> Architecture Canvas loaded</div>
      </div>
    </div>
  </div>

  <script>
    const WS_PORT = ${wsPort};
    const canvas = document.getElementById('viewport');
    const ctx = canvas.getContext('2d');
    const tooltip = document.getElementById('tooltip');

    let width = window.innerWidth;
    let height = window.innerHeight;

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * window.devicePixelRatio);
      canvas.height = Math.floor(height * window.devicePixelRatio);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    window.addEventListener('resize', resize);
    resize();

    // Graph Data
    const nodes = new Map();
    const edges = [];
    const edgeSet = new Set();
    const packageCenters = new Map();
    const fileNodeMap = new Map();

    // State
    let selectedNode = null;
    let hoveredNode = null;
    let searchQuery = '';
    let selectedKind = 'all';

    // Camera
    let panX = width / 2;
    let panY = height / 2;
    let zoom = 0.65;
    let isPanning = false;
    let startPanX = 0, startPanY = 0;
    let draggedNode = null;
    let hasAutoFitted = false;

    // Physics Engine State
    let alpha = 1.0;
    let isPhysicsPaused = false;
    const centerGravity = 0.008;
    const clusterStrength = 0.032;
    const maxSpeed = 10.0;
    const damping = 0.80;
    const k = 42; // optimal spring distance

    function reheat(temperature = 0.3) {
      if (isPhysicsPaused) return;
      alpha = Math.max(alpha, temperature);
    }

    // Determine package from file path
    function extractPackage(filePath) {
      if (!filePath) return 'core';
      if (filePath.includes('packages/')) {
        const parts = filePath.split('packages/')[1].split('/');
        return parts[0] || 'core';
      }
      const top = filePath.split('/')[0] || 'core';
      return top.replace(/\\.[^/.]+$/, '');
    }

    // Refresh orbital package anchors
    function updatePackageClusters() {
      const pkgs = new Set();
      nodes.forEach(n => pkgs.add(n.pkg));
      const pkgList = Array.from(pkgs);
      const total = pkgList.length;

      pkgList.forEach((pkg, i) => {
        const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
        const radius = total > 2 ? 380 : 180;
        packageCenters.set(pkg, {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius
        });
      });

      // Update cluster center on all nodes
      nodes.forEach(n => {
        n.clusterCenter = packageCenters.get(n.pkg) || { x: 0, y: 0 };
        if (n.parentFileId && fileNodeMap.has(n.parentFileId)) {
          n.parentFileNode = nodes.get(n.parentFileId);
        }
      });
    }

    // Colors
    function getNodeColor(kind) {
      switch (kind) {
        case 'function': return '#06b6d4';
        case 'method': return '#38bdf8';
        case 'class':
        case 'struct':
        case 'interface': return '#a855f7';
        case 'route': return '#10b981';
        case 'file': return '#f59e0b';
        default: return '#64748b';
      }
    }

    // Add or update node
    function addOrUpdateNode(raw) {
      const existing = nodes.get(raw.id);
      const filePath = raw.substrate?.sourceLocation?.filePath || raw.name || '';
      const pkg = extractPackage(filePath);

      if (raw.kind === 'file') {
        fileNodeMap.set(filePath, raw.id);
      }

      if (existing) {
        Object.assign(existing, raw);
        existing.pulse = 1.0;
        existing.pkg = pkg;
      } else {
        const radius = raw.kind === 'file' ? 12 :
                       raw.kind === 'class' || raw.kind === 'struct' ? 9 : 6;

        const center = packageCenters.get(pkg) || { x: 0, y: 0 };
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 60;

        nodes.set(raw.id, {
          ...raw,
          pkg,
          x: center.x + Math.cos(angle) * dist,
          y: center.y + Math.sin(angle) * dist,
          vx: 0,
          vy: 0,
          radius,
          pulse: 0.8,
          clusterCenter: center,
          parentFileId: raw.kind !== 'file' ? fileNodeMap.get(filePath) : null
        });
      }

      // Ingest outgoing edges from substrate
      if (raw.substrate && raw.substrate.outgoingEdges) {
        for (const e of raw.substrate.outgoingEdges) {
          const edgeKey = raw.id + '->' + e.targetId + ':' + e.kind;
          if (!edgeSet.has(edgeKey)) {
            edgeSet.add(edgeKey);
            edges.push({
              source: raw.id,
              target: e.targetId,
              kind: e.kind
            });
          }
        }
      }
    }

    // Load initial graph snapshot
    async function loadSnapshot() {
      try {
        const res = await fetch('/api/graph');
        const data = await res.json();

        if (data.nodes) {
          // Pre-populate file nodes first
          data.nodes.forEach(n => {
            if (n.kind === 'file') {
              const fp = n.substrate?.sourceLocation?.filePath || n.name;
              fileNodeMap.set(fp, n.id);
            }
          });
          data.nodes.forEach(n => addOrUpdateNode(n));
        }

        if (data.edges) {
          for (const e of data.edges) {
            const edgeKey = e.source + '->' + e.target + ':' + e.kind;
            if (!edgeSet.has(edgeKey)) {
              edgeSet.add(edgeKey);
              edges.push(e);
            }
          }
        }

        updatePackageClusters();
        updateCounts();
        reheat(1.0);

        // Frame graph automatically
        setTimeout(() => {
          fitToScreen();
          hasAutoFitted = true;
        }, 120);

      } catch (err) {
        console.error('Failed to load initial graph snapshot:', err);
      }
    }

    function updateCounts() {
      document.getElementById('node-count').textContent = nodes.size;
      document.getElementById('edge-count').textContent = edges.length;
    }

    function addFeedLog(type, text) {
      const feed = document.getElementById('mutation-feed');
      const item = document.createElement('div');
      item.className = 'feed-item';
      const tagClass = type === 'UPSERT' ? 'feed-tag-upsert' : 'feed-tag-delete';
      const timeStr = new Date().toLocaleTimeString().split(' ')[0];
      item.innerHTML = '<span style="color:var(--text-dim);">' + timeStr + '</span> <span class="' + tagClass + '">[' + type + ']</span> ' + text;
      feed.appendChild(item);
      feed.scrollTop = feed.scrollHeight;
    }

    // WebSocket Live Updates
    function connectWs() {
      const wsUrl = 'ws://' + window.location.hostname + ':' + WS_PORT;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        const dot = document.getElementById('status-dot');
        dot.className = 'pulse-dot connected';
        document.getElementById('status-text').textContent = 'Live (' + WS_PORT + ')';
      };

      ws.onmessage = (event) => {
        try {
          const envelope = JSON.parse(event.data);
          if (envelope.mutations) {
            envelope.mutations.forEach(m => {
              if (m.type === 'NodeUpsert') {
                addOrUpdateNode(m.node);
                addFeedLog('UPSERT', m.node.name + ' (' + m.node.kind + ')');
              } else if (m.type === 'NodeDelete') {
                nodes.delete(m.nodeId);
                addFeedLog('DELETE', m.nodeId.split('#').pop() || m.nodeId);
              }
            });
            updatePackageClusters();
            updateCounts();
            reheat(0.25);
          }
        } catch (e) {
          console.error('WebSocket envelope parse error:', e);
        }
      };

      ws.onclose = () => {
        const dot = document.getElementById('status-dot');
        dot.className = 'pulse-dot';
        document.getElementById('status-text').textContent = 'Reconnecting...';
        setTimeout(connectWs, 2000);
      };
    }

    // Fit Graph into Viewport
    function fitToScreen() {
      const nodeList = Array.from(nodes.values());
      if (nodeList.length === 0) return;

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const n of nodeList) {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
      }

      const graphWidth = Math.max(maxX - minX, 100);
      const graphHeight = Math.max(maxY - minY, 100);
      const padding = 120;

      const availWidth = width - padding * 2;
      const availHeight = height - padding * 2 - 56;

      const scaleX = availWidth / graphWidth;
      const scaleY = availHeight / graphHeight;
      const isHuge = nodeList.length > 1000;
      const minAllowedZoom = isHuge ? 0.08 : 0.20;
      const maxAllowedZoom = isHuge ? 0.55 : 1.15;
      const targetZoom = Math.min(Math.max(Math.min(scaleX, scaleY), minAllowedZoom), maxAllowedZoom);

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      zoom = targetZoom;
      panX = width / 2 - centerX * zoom;
      panY = height / 2 + 28 - centerY * zoom;
    }

    // Focus Camera on specific node
    function centerOnNode(target) {
      if (!target) return;
      panX = width / 2 - target.x * zoom;
      panY = height / 2 + 28 - target.y * zoom;
    }

    // Force Simulation Step
    function stepSimulation() {
      if (isPhysicsPaused || alpha <= 0.001) {
        alpha = 0;
        return;
      }

      const nodeList = Array.from(nodes.values());
      const total = nodeList.length;

      // 1. Softened Repulsion
      if (total <= 600) {
        for (let i = 0; i < total; i++) {
          const a = nodeList[i];
          for (let j = i + 1; j < total; j++) {
            const b = nodeList[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.max(16, Math.hypot(dx, dy));
            if (dist < 280) {
              const force = ((k * k) / dist) * alpha * 0.12;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              a.vx -= fx; a.vy -= fy;
              b.vx += fx; b.vy += fy;
            }
          }
        }
      } else {
        // Fast spatial bucketing for large graphs (e.g. 1,000 - 10,000+ nodes)
        const cellSize = 160;
        const grid = new Map();
        for (let i = 0; i < total; i++) {
          const n = nodeList[i];
          const key = (Math.floor(n.x / cellSize) << 16) ^ Math.floor(n.y / cellSize);
          let b = grid.get(key);
          if (!b) { b = []; grid.set(key, b); }
          b.push(n);
        }
        for (let i = 0; i < total; i++) {
          const a = nodeList[i];
          const cx = Math.floor(a.x / cellSize);
          const cy = Math.floor(a.y / cellSize);
          for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
              const key = ((cx + dx) << 16) ^ (cy + dy);
              const bucket = grid.get(key);
              if (!bucket) continue;
              for (let j = 0; j < bucket.length; j++) {
                const b = bucket[j];
                if (b.id <= a.id) continue;
                const dX = b.x - a.x;
                const dY = b.y - a.y;
                const dist = Math.max(16, Math.hypot(dX, dY));
                if (dist < 200) {
                  const force = ((k * k) / dist) * alpha * 0.12;
                  const fx = (dX / dist) * force;
                  const fy = (dY / dist) * force;
                  a.vx -= fx; a.vy -= fy;
                  b.vx += fx; b.vy += fy;
                }
              }
            }
          }
        }
      }

      // 2. Spring Attraction along Edges
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const s = nodes.get(e.source);
        const t = nodes.get(e.target);
        if (!s || !t) continue;

        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.max(2, Math.hypot(dx, dy));
        const targetDist = e.kind === 'CONTAINS' ? 35 : 70;
        const force = (dist - targetDist) * 0.035 * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        s.vx += fx;
        s.vy += fy;
        t.vx -= fx;
        t.vy -= fy;
      }

      // 3. Virtual Hierarchy Attraction (Symbols nestled near parent file)
      for (let i = 0; i < total; i++) {
        const n = nodeList[i];
        if (n.parentFileNode) {
          const p = n.parentFileNode;
          const dx = p.x - n.x;
          const dy = p.y - n.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 45) {
            n.vx += (dx / (dist || 1)) * (dist - 45) * 0.025 * alpha;
            n.vy += (dy / (dist || 1)) * (dist - 45) * 0.025 * alpha;
          }
        }
      }

      // 4. Cluster Anchoring, Global Center Gravity, Clamping & Integration
      for (let i = 0; i < total; i++) {
        const n = nodeList[i];
        if (n === draggedNode) continue;

        // Pull toward package cluster
        if (n.clusterCenter) {
          n.vx += (n.clusterCenter.x - n.x) * clusterStrength * alpha;
          n.vy += (n.clusterCenter.y - n.y) * clusterStrength * alpha;
        }

        // Global centering gravity toward (0, 0)
        n.vx -= n.x * centerGravity * alpha;
        n.vy -= n.y * centerGravity * alpha;

        // Velocity clamping
        const speed = Math.hypot(n.vx, n.vy);
        if (speed > maxSpeed) {
          n.vx = (n.vx / speed) * maxSpeed;
          n.vy = (n.vy / speed) * maxSpeed;
        }

        // Damping
        n.vx *= damping;
        n.vy *= damping;
        n.x += n.vx;
        n.y += n.vy;

        // Pulse decay
        if (n.pulse > 0) {
          n.pulse = Math.max(0, n.pulse - 0.02);
        }
      }

      // Cooling schedule
      alpha *= 0.993;
    }

    // Render Loop
    function render() {
      stepSimulation();

      ctx.save();
      ctx.clearRect(0, 0, width, height);

      // Background Grid Dots
      ctx.fillStyle = 'rgba(148, 163, 184, 0.07)';
      const gridSize = 40 * zoom;
      const offsetX = (panX % gridSize + gridSize) % gridSize;
      const offsetY = (panY % gridSize + gridSize) % gridSize;
      for (let x = offsetX; x < width; x += gridSize) {
        for (let y = offsetY; y < height; y += gridSize) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.translate(panX, panY);
      ctx.scale(zoom, zoom);

      // Draw Package Cluster Watermarks when zoomed out
      if (zoom < 1.1) {
        ctx.font = 'bold 16px var(--font-mono)';
        ctx.fillStyle = 'rgba(148, 163, 184, 0.08)';
        ctx.textAlign = 'center';
        packageCenters.forEach((center, pkg) => {
          ctx.fillText(pkg.toUpperCase(), center.x, center.y - 120);
        });
        ctx.textAlign = 'left';
      }

      // Determine active highlight neighborhood
      const activeNode = hoveredNode || selectedNode;
      const connectedNodeIds = new Set();
      if (activeNode) {
        connectedNodeIds.add(activeNode.id);
        for (const e of edges) {
          if (e.source === activeNode.id) connectedNodeIds.add(e.target);
          if (e.target === activeNode.id) connectedNodeIds.add(e.source);
        }
      }

      // 1. Draw Edges
      for (let i = 0; i < edges.length; i++) {
        const e = edges[i];
        const s = nodes.get(e.source);
        const t = nodes.get(e.target);
        if (!s || !t) continue;

        // Filter visibility
        if (selectedKind !== 'all') {
          if (s.kind !== selectedKind && t.kind !== selectedKind) continue;
        }

        const isIncident = activeNode && (s.id === activeNode.id || t.id === activeNode.id);

        if (activeNode) {
          if (isIncident) {
            ctx.strokeStyle = s.id === activeNode.id ? '#06b6d4' : '#a855f7';
            ctx.lineWidth = 2.5;
            ctx.globalAlpha = 0.9;
          } else {
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 0.7;
            ctx.globalAlpha = 0.05; // spotlight dim
          }
        } else {
          ctx.strokeStyle = e.kind === 'CONTAINS' ? 'rgba(71, 85, 105, 0.25)' : 'rgba(56, 189, 248, 0.22)';
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.45;
        }

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();

        // Direction arrowhead for highlighted edges
        if (isIncident && zoom > 0.4) {
          const angle = Math.atan2(t.y - s.y, t.x - s.x);
          const arrowDist = t.radius + 6;
          const ax = t.x - Math.cos(angle) * arrowDist;
          const ay = t.y - Math.sin(angle) * arrowDist;
          ctx.fillStyle = ctx.strokeStyle;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax - 6 * Math.cos(angle - Math.PI / 6), ay - 6 * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(ax - 6 * Math.cos(angle + Math.PI / 6), ay - 6 * Math.sin(angle + Math.PI / 6));
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1.0;

      // 2. Draw Nodes
      const isHuge = nodes.size > 1000;
      const showAllLabels = zoom >= (isHuge ? 1.6 : 1.25);
      const showMidLabels = zoom >= (isHuge ? 1.1 : 0.65);
      const fileZoomThreshold = isHuge ? 0.95 : 0.65;

      for (const n of nodes.values()) {
        const isMatch = searchQuery && n.name.toLowerCase().includes(searchQuery);
        const isSelected = selectedNode && selectedNode.id === n.id;
        const isHovered = hoveredNode && hoveredNode.id === n.id;
        const isConnected = connectedNodeIds.has(n.id);
        const matchesKind = selectedKind === 'all' || n.kind === selectedKind;

        // Dimming factor
        let nodeAlpha = 1.0;
        if (activeNode && !isConnected && !isMatch) {
          nodeAlpha = 0.15;
        } else if (!matchesKind) {
          nodeAlpha = 0.10;
        }
        ctx.globalAlpha = nodeAlpha;

        const baseColor = getNodeColor(n.kind);

        // Pulse halo for live mutations
        if (n.pulse > 0) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + n.pulse * 18, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(6, 182, 212, ' + n.pulse + ')';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Outer glow halo for selected or hovered
        if (isSelected || isHovered || isMatch) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + (isSelected ? 6 : 4), 0, Math.PI * 2);
          ctx.fillStyle = isSelected ? 'rgba(6, 182, 212, 0.3)' : 'rgba(255, 255, 255, 0.2)';
          ctx.fill();
        }

        // Node Circle Core
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = baseColor;
        ctx.fill();

        // Border
        ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.stroke();

        // Level-of-Detail (LOD) Label
        const shouldShowLabel = isSelected || isHovered || isMatch ||
          (n.kind === 'file' && zoom > fileZoomThreshold) ||
          (showMidLabels && (n.kind === 'class' || n.kind === 'struct' || n.kind === 'route')) ||
          showAllLabels;

        if (shouldShowLabel && nodeAlpha > 0.25) {
          const fontSize = isSelected ? 12 : 10;
          ctx.font = (isSelected ? 'bold ' : '') + fontSize + 'px var(--font-mono)';
          const text = n.name;
          const textWidth = ctx.measureText(text).width;
          const tx = n.x + n.radius + 6;
          const ty = n.y - fontSize / 2;

          // Frosted background pill for crisp readability
          ctx.fillStyle = 'rgba(8, 12, 22, 0.82)';
          ctx.fillRect(tx - 3, ty, textWidth + 6, fontSize + 4);

          // Label text
          if (isSelected) {
            ctx.fillStyle = '#38bdf8';
          } else if (isMatch) {
            ctx.fillStyle = '#fef08a';
          } else if (n.kind === 'file') {
            ctx.fillStyle = '#fde68a';
          } else {
            ctx.fillStyle = '#cbd5e1';
          }
          ctx.fillText(text, tx, ty + fontSize);
        }
      }

      ctx.restore();
      requestAnimationFrame(render);
    }

    // Interaction: Hover & Hit Testing
    function getNodeAt(px, py) {
      const mouseX = (px - panX) / zoom;
      const mouseY = (py - panY) / zoom;

      for (const n of nodes.values()) {
        const hitRadius = Math.max(n.radius + 4, 10);
        const dist = Math.hypot(n.x - mouseX, n.y - mouseY);
        if (dist <= hitRadius) {
          return n;
        }
      }
      return null;
    }

    // Canvas Events
    canvas.addEventListener('mousedown', (e) => {
      const hit = getNodeAt(e.clientX, e.clientY);
      if (hit) {
        draggedNode = hit;
        selectNode(hit);
        reheat(0.3);
        return;
      }

      isPanning = true;
      startPanX = e.clientX - panX;
      startPanY = e.clientY - panY;
    });

    window.addEventListener('mousemove', (e) => {
      if (draggedNode) {
        draggedNode.x = (e.clientX - panX) / zoom;
        draggedNode.y = (e.clientY - panY) / zoom;
        draggedNode.vx = 0;
        draggedNode.vy = 0;
        reheat(0.25);
        return;
      }

      if (isPanning) {
        panX = e.clientX - startPanX;
        panY = e.clientY - startPanY;
        return;
      }

      // Hover check
      const hit = getNodeAt(e.clientX, e.clientY);
      if (hit !== hoveredNode) {
        hoveredNode = hit;
        canvas.style.cursor = hit ? 'pointer' : 'grab';
        if (hit) {
          tooltip.style.display = 'block';
          tooltip.style.left = (e.clientX + 14) + 'px';
          tooltip.style.top = (e.clientY - 12) + 'px';
          tooltip.innerHTML = '<span style="color:' + getNodeColor(hit.kind) + '">[' + hit.kind.toUpperCase() + ']</span> ' + hit.name;
        } else {
          tooltip.style.display = 'none';
        }
      } else if (hit) {
        tooltip.style.left = (e.clientX + 14) + 'px';
        tooltip.style.top = (e.clientY - 12) + 'px';
      }
    });

    window.addEventListener('mouseup', () => {
      draggedNode = null;
      isPanning = false;
      canvas.style.cursor = hoveredNode ? 'pointer' : 'grab';
    });

    // Pointer-anchored wheel zooming
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.15), 4.0);

      // Anchor zoom to cursor coordinates
      panX = e.clientX - (e.clientX - panX) * (newZoom / zoom);
      panY = e.clientY - (e.clientY - panY) * (newZoom / zoom);
      zoom = newZoom;
    }, { passive: false });

    // Select & Populate Node Details
    function selectNode(n) {
      selectedNode = n;
      const drawer = document.getElementById('drawer');
      drawer.classList.remove('collapsed');

      document.getElementById('d-name').textContent = n.name;
      document.getElementById('d-kind').textContent = n.kind.toUpperCase();
      document.getElementById('d-pkg').textContent = n.pkg || 'core';
      document.getElementById('d-qname').textContent = n.qualifiedName || n.name;

      const loc = n.substrate?.sourceLocation;
      document.getElementById('d-loc').textContent = loc ? loc.filePath + ':' + loc.startLine : 'Unknown';
      document.getElementById('d-sig').textContent = n.substrate?.symbolSignature || '// No explicit signature';
      document.getElementById('d-hash').textContent = n.versioning?.semanticValidityHash || 'N/A';

      // Outgoing connections
      const outList = document.getElementById('d-out-list');
      outList.innerHTML = '';
      const outgoing = edges.filter(e => e.source === n.id);
      document.getElementById('d-out-count').textContent = outgoing.length;
      if (outgoing.length === 0) {
        outList.innerHTML = '<div style="color:var(--text-dim); font-size:11px;">No outgoing dependencies</div>';
      } else {
        outgoing.forEach(e => {
          const target = nodes.get(e.target);
          const item = document.createElement('div');
          item.className = 'connection-pill';
          const targetName = target ? target.name : e.target.split('#').pop() || e.target;
          item.innerHTML = '<span>' + targetName + '</span><span class="connection-tag">' + e.kind + '</span>';
          if (target) {
            item.onclick = () => {
              selectNode(target);
              centerOnNode(target);
              reheat(0.2);
            };
          }
          outList.appendChild(item);
        });
      }

      // Incoming connections
      const inList = document.getElementById('d-in-list');
      inList.innerHTML = '';
      const incoming = edges.filter(e => e.target === n.id);
      document.getElementById('d-in-count').textContent = incoming.length;
      if (incoming.length === 0) {
        inList.innerHTML = '<div style="color:var(--text-dim); font-size:11px;">No incoming references</div>';
      } else {
        incoming.forEach(e => {
          const source = nodes.get(e.source);
          const item = document.createElement('div');
          item.className = 'connection-pill';
          const srcName = source ? source.name : e.source.split('#').pop() || e.source;
          item.innerHTML = '<span>' + srcName + '</span><span class="connection-tag">' + e.kind + '</span>';
          if (source) {
            item.onclick = () => {
              selectNode(source);
              centerOnNode(source);
              reheat(0.2);
            };
          }
          inList.appendChild(item);
        });
      }
    }

    // Drawer Controls
    document.getElementById('d-close').addEventListener('click', () => {
      document.getElementById('drawer').classList.add('collapsed');
      selectedNode = null;
    });

    document.getElementById('btn-focus-node').addEventListener('click', () => {
      if (selectedNode) centerOnNode(selectedNode);
    });

    document.getElementById('btn-copy-id').addEventListener('click', () => {
      if (selectedNode) {
        navigator.clipboard.writeText(selectedNode.id);
        const btn = document.getElementById('btn-copy-id');
        btn.textContent = '✅ Copied!';
        setTimeout(() => { btn.textContent = '📋 Copy URN'; }, 1500);
      }
    });

    // Toolbar Buttons
    document.getElementById('btn-fit').addEventListener('click', fitToScreen);

    document.getElementById('btn-zoom-in').addEventListener('click', () => {
      zoom = Math.min(zoom * 1.25, 4.0);
    });

    document.getElementById('btn-zoom-out').addEventListener('click', () => {
      zoom = Math.max(zoom * 0.8, 0.15);
    });

    document.getElementById('btn-pause').addEventListener('click', () => {
      isPhysicsPaused = !isPhysicsPaused;
      const btn = document.getElementById('btn-pause');
      btn.textContent = isPhysicsPaused ? '▶' : '⏸';
      btn.title = isPhysicsPaused ? 'Resume Physics (P)' : 'Pause Physics (P)';
      if (!isPhysicsPaused) reheat(0.3);
    });

    document.getElementById('btn-reheat').addEventListener('click', () => {
      reheat(0.8);
    });

    // Search Input
    document.getElementById('search-input').addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      reheat(0.15);
    });

    // Kind Filter Buttons
    document.getElementById('kind-filters').addEventListener('click', (e) => {
      if (e.target.classList.contains('filter-btn')) {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        selectedKind = e.target.dataset.kind;
        reheat(0.2);
      }
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'f' || e.key === 'F' || e.code === 'Space') {
        e.preventDefault();
        fitToScreen();
      } else if (e.key === 'Escape') {
        document.getElementById('drawer').classList.add('collapsed');
        selectedNode = null;
      } else if (e.key === '+' || e.key === '=') {
        zoom = Math.min(zoom * 1.25, 4.0);
      } else if (e.key === '-' || e.key === '_') {
        zoom = Math.max(zoom * 0.8, 0.15);
      } else if (e.key === 'p' || e.key === 'P') {
        document.getElementById('btn-pause').click();
      } else if (e.key === 'r' || e.key === 'R') {
        reheat(0.8);
      } else if (e.key === '/') {
        e.preventDefault();
        document.getElementById('search-input').focus();
      }
    });

    // Boot
    loadSnapshot();
    connectWs();
    render();
  </script>
</body>
</html>
`;
}
