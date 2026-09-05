export function getViewerHtml(wsPort = 5051): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🐦 PigeonGraph — Live Architecture Canvas</title>
  <style>
    :root {
      --bg: #090d16;
      --panel-bg: rgba(15, 23, 42, 0.85);
      --panel-border: #1e293b;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --cyan: #06b6d4;
      --purple: #a855f7;
      --green: #10b981;
      --amber: #f59e0b;
      --rose: #f43f5e;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      overflow: hidden;
      height: 100vh;
      width: 100vw;
    }

    /* Top Navigation Bar */
    header {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 54px;
      background: var(--panel-bg);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--panel-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      z-index: 20;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 700;
      font-size: 16px;
      letter-spacing: -0.02em;
    }
    .brand-badge {
      background: rgba(6, 182, 212, 0.15);
      color: var(--cyan);
      border: 1px solid rgba(6, 182, 212, 0.3);
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 11px;
      font-family: var(--font-mono);
    }

    .search-box {
      display: flex;
      align-items: center;
      background: #0f172a;
      border: 1px solid var(--panel-border);
      border-radius: 8px;
      padding: 6px 12px;
      width: 320px;
      gap: 8px;
    }
    .search-box input {
      background: transparent;
      border: none;
      color: var(--text);
      font-size: 13px;
      outline: none;
      width: 100%;
    }
    .search-box input::placeholder { color: var(--text-muted); }

    .stats {
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 12px;
      font-family: var(--font-mono);
    }
    .stat-pill {
      background: #1e293b;
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
    }
    .pulse-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--green);
      box-shadow: 0 0 10px var(--green);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    /* Main Viewport */
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

    /* Right Inspection Drawer */
    #drawer {
      position: absolute;
      top: 64px; right: 16px; bottom: 16px;
      width: 360px;
      background: var(--panel-bg);
      backdrop-filter: blur(16px);
      border: 1px solid var(--panel-border);
      border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
      display: flex;
      flex-direction: column;
      z-index: 30;
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      overflow: hidden;
    }
    #drawer.collapsed {
      transform: translateX(390px);
    }

    .drawer-header {
      padding: 16px;
      border-bottom: 1px solid var(--panel-border);
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .drawer-title { font-size: 15px; font-weight: 600; word-break: break-all; }
    .drawer-kind {
      font-size: 10px;
      font-family: var(--font-mono);
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(168, 85, 247, 0.15);
      color: var(--purple);
      border: 1px solid rgba(168, 85, 247, 0.3);
      margin-top: 4px;
      display: inline-block;
    }
    .close-btn {
      background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px; padding: 4px;
    }
    .close-btn:hover { color: var(--text); }

    .drawer-body {
      padding: 16px;
      overflow-y: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 14px;
      font-size: 13px;
    }

    .code-block {
      background: #030712;
      border: 1px solid #1f2937;
      border-radius: 6px;
      padding: 10px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: #38bdf8;
      overflow-x: auto;
      white-space: pre-wrap;
    }

    .prop-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .prop-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .prop-val { font-size: 13px; font-family: var(--font-mono); color: var(--text); }

    /* Live Mutation Feed */
    .feed-container {
      border-top: 1px solid var(--panel-border);
      max-height: 160px;
      display: flex;
      flex-direction: column;
      background: rgba(3, 7, 18, 0.6);
    }
    .feed-title {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      padding: 8px 12px;
      border-bottom: 1px solid var(--panel-border);
      font-family: var(--font-mono);
    }
    .feed-list {
      overflow-y: auto;
      flex: 1;
      font-family: var(--font-mono);
      font-size: 11px;
      padding: 6px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .feed-item {
      display: flex;
      gap: 6px;
      color: var(--text-muted);
    }
    .feed-tag-upsert { color: var(--green); }
    .feed-tag-delete { color: var(--rose); }

    /* Floating Legend */
    .legend {
      position: absolute;
      bottom: 20px;
      left: 20px;
      background: var(--panel-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--panel-border);
      border-radius: 8px;
      padding: 10px 14px;
      display: flex;
      gap: 14px;
      font-size: 11px;
      font-family: var(--font-mono);
      z-index: 10;
    }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .legend-color { width: 10px; height: 10px; border-radius: 50%; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span>🐦</span> PigeonGraph Canvas
      <span class="brand-badge">LIVE AST</span>
    </div>

    <div class="search-box">
      <span>🔍</span>
      <input type="text" id="search-input" placeholder="Filter symbols, routes, structs..." autocomplete="off">
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

  <div id="drawer" class="collapsed">
    <div class="drawer-header">
      <div>
        <div class="drawer-title" id="d-name">Symbol Details</div>
        <span class="drawer-kind" id="d-kind">FUNCTION</span>
      </div>
      <button class="close-btn" id="d-close">&times;</button>
    </div>
    <div class="drawer-body">
      <div class="prop-row">
        <div class="prop-label">Qualified Name</div>
        <div class="prop-val" id="d-qname">-</div>
      </div>
      <div class="prop-row">
        <div class="prop-label">File & Coordinates</div>
        <div class="prop-val" id="d-loc">-</div>
      </div>
      <div class="prop-row">
        <div class="prop-label">Signature</div>
        <div class="code-block" id="d-sig">// No signature</div>
      </div>
      <div class="prop-row">
        <div class="prop-label">Epistemic Tier / Invariant Hash</div>
        <div class="prop-val" id="d-hash" style="font-size: 10px; word-break: break-all;">-</div>
      </div>
    </div>
    <div class="feed-container">
      <div class="feed-title">Live Mutation Diff Stream</div>
      <div class="feed-list" id="mutation-feed">
        <div class="feed-item"><span class="feed-tag-upsert">[READY]</span> Canvas initialized</div>
      </div>
    </div>
  </div>

  <div class="legend">
    <div class="legend-item"><span class="legend-color" style="background:#06b6d4;"></span> Function / Method</div>
    <div class="legend-item"><span class="legend-color" style="background:#a855f7;"></span> Struct / Class</div>
    <div class="legend-item"><span class="legend-color" style="background:#10b981;"></span> HTTP Route</div>
    <div class="legend-item"><span class="legend-color" style="background:#f59e0b;"></span> File</div>
  </div>

  <script>
    const WS_PORT = ${wsPort};
    const canvas = document.getElementById('viewport');
    const ctx = canvas.getContext('2d');
    let width = window.innerWidth;
    let height = window.innerHeight;

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    window.addEventListener('resize', resize);
    resize();

    // Graph Data
    const nodes = new Map();
    const edges = [];
    let selectedNode = null;
    let hoveredNode = null;
    let searchQuery = '';

    // Camera
    let panX = width / 2;
    let panY = height / 2;
    let zoom = 1;
    let isPanning = false;
    let startPanX = 0, startPanY = 0;
    let draggedNode = null;

    // Colors by Kind
    function getNodeColor(kind) {
      switch (kind) {
        case 'function':
        case 'method': return '#06b6d4'; // Cyan
        case 'class':
        case 'struct':
        case 'interface': return '#a855f7'; // Purple
        case 'route': return '#10b981'; // Green
        case 'file': return '#f59e0b'; // Amber
        default: return '#94a3b8'; // Slate
      }
    }

    // Load initial snapshot
    async function loadSnapshot() {
      try {
        const res = await fetch('/api/graph');
        const data = await res.json();
        if (data.nodes) {
          data.nodes.forEach(n => addOrUpdateNode(n));
        }
        if (data.edges) {
          edges.push(...data.edges);
        }
        updateCounts();
      } catch (err) {
        console.error('Failed to load initial graph snapshot:', err);
      }
    }

    function addOrUpdateNode(n) {
      const existing = nodes.get(n.id);
      if (existing) {
        Object.assign(existing, n);
        existing.pulse = 1.0; // trigger visual glow
      } else {
        const radius = n.kind === 'file' ? 12 : n.kind === 'struct' || n.kind === 'class' ? 10 : 7;
        nodes.set(n.id, {
          ...n,
          x: (Math.random() - 0.5) * 400,
          y: (Math.random() - 0.5) * 400,
          vx: 0,
          vy: 0,
          radius,
          pulse: 1.0,
        });
      }
      // Add edges from node outgoing edges
      if (n.substrate && n.substrate.outgoingEdges) {
        n.substrate.outgoingEdges.forEach(e => {
          if (!edges.some(existing => existing.source === n.id && existing.target === e.targetId)) {
            edges.push({ source: n.id, target: e.targetId, kind: e.kind });
          }
        });
      }
      updateCounts();
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
      item.innerHTML = '<span class="' + tagClass + '">[' + type + ']</span> ' + text;
      feed.appendChild(item);
      feed.scrollTop = feed.scrollHeight;
    }

    // WebSocket connection
    function connectWs() {
      const wsUrl = 'ws://' + window.location.hostname + ':' + WS_PORT;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        document.getElementById('status-dot').style.background = '#10b981';
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
                updateCounts();
              }
            });
          }
        } catch (e) {
          console.error(e);
        }
      };

      ws.onclose = () => {
        document.getElementById('status-dot').style.background = '#f59e0b';
        document.getElementById('status-text').textContent = 'Reconnecting...';
        setTimeout(connectWs, 2000);
      };
    }

    // Force simulation step
    function stepSimulation() {
      const nodeList = Array.from(nodes.values());
      const repulsion = 1200;
      const springLength = 70;
      const springStrength = 0.05;

      // Repulsion between nodes
      for (let i = 0; i < nodeList.length; i++) {
        for (let j = i + 1; j < nodeList.length; j++) {
          const a = nodeList[i];
          const b = nodeList[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy || 1;
          const dist = Math.sqrt(distSq);
          if (dist < 400) {
            const force = repulsion / distSq;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            a.vx -= fx;
            a.vy -= fy;
            b.vx += fx;
            b.vy += fy;
          }
        }
      }

      // Attraction along edges
      for (const e of edges) {
        const source = nodes.get(e.source);
        const target = nodes.get(e.target);
        if (source && target) {
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = (dist - springLength) * springStrength;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          source.vx += fx;
          source.vy += fy;
          target.vx -= fx;
          target.vy -= fy;
        }
      }

      // Update positions
      for (const n of nodeList) {
        if (n === draggedNode) continue;
        n.vx *= 0.85;
        n.vy *= 0.85;
        n.x += n.vx;
        n.y += n.vy;
        if (n.pulse > 0) n.pulse = Math.max(0, n.pulse - 0.015);
      }
    }

    // Render loop
    function render() {
      stepSimulation();

      ctx.save();
      ctx.clearRect(0, 0, width, height);

      // Background grid dots
      ctx.fillStyle = '#1e293b';
      const gridSize = 40 * zoom;
      const offsetX = panX % gridSize;
      const offsetY = panY % gridSize;
      for (let x = offsetX; x < width; x += gridSize) {
        for (let y = offsetY; y < height; y += gridSize) {
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.translate(panX, panY);
      ctx.scale(zoom, zoom);

      // Draw Edges
      ctx.lineWidth = 1;
      for (const e of edges) {
        const s = nodes.get(e.source);
        const t = nodes.get(e.target);
        if (!s || !t) continue;

        const isHighlight = selectedNode && (s.id === selectedNode.id || t.id === selectedNode.id);
        ctx.strokeStyle = isHighlight ? '#06b6d4' : 'rgba(51, 65, 85, 0.4)';
        ctx.lineWidth = isHighlight ? 2 : 1;

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
      }

      // Draw Nodes
      for (const n of nodes.values()) {
        const isMatch = searchQuery && n.name.toLowerCase().includes(searchQuery);
        const isSelected = selectedNode && selectedNode.id === n.id;
        const color = getNodeColor(n.kind);

        // Pulse glow ring for updates
        if (n.pulse > 0) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + n.pulse * 14, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(6, 182, 212, ' + n.pulse + ')';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Node Circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = isSelected || isMatch ? 16 : 4;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Label
        ctx.font = (isSelected ? 'bold 12px ' : '10px ') + 'var(--font-mono)';
        ctx.fillStyle = isSelected ? '#38bdf8' : isMatch ? '#fef08a' : '#cbd5e1';
        ctx.fillText(n.name, n.x + n.radius + 4, n.y + 4);
      }

      ctx.restore();
      requestAnimationFrame(render);
    }

    // Interaction handling
    canvas.addEventListener('mousedown', (e) => {
      const mouseX = (e.clientX - panX) / zoom;
      const mouseY = (e.clientY - panY) / zoom;

      for (const n of nodes.values()) {
        const dist = Math.hypot(n.x - mouseX, n.y - mouseY);
        if (dist <= n.radius + 4) {
          draggedNode = n;
          selectNode(n);
          return;
        }
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
      } else if (isPanning) {
        panX = e.clientX - startPanX;
        panY = e.clientY - startPanY;
      }
    });

    window.addEventListener('mouseup', () => {
      draggedNode = null;
      isPanning = false;
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      zoom = Math.min(Math.max(zoom * zoomFactor, 0.2), 3);
    });

    function selectNode(n) {
      selectedNode = n;
      const drawer = document.getElementById('drawer');
      drawer.classList.remove('collapsed');

      document.getElementById('d-name').textContent = n.name;
      document.getElementById('d-kind').textContent = n.kind.toUpperCase();
      document.getElementById('d-qname').textContent = n.qualifiedName || n.name;
      document.getElementById('d-loc').textContent = (n.substrate?.sourceLocation?.filePath || '') + ':' + (n.substrate?.sourceLocation?.startLine || 1);
      document.getElementById('d-sig').textContent = n.substrate?.symbolSignature || '// No explicit signature';
      document.getElementById('d-hash').textContent = n.versioning?.semanticValidityHash || 'N/A';
    }

    document.getElementById('d-close').addEventListener('click', () => {
      document.getElementById('drawer').classList.add('collapsed');
      selectedNode = null;
    });

    document.getElementById('search-input').addEventListener('input', (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
    });

    loadSnapshot();
    connectWs();
    render();
  </script>
</body>
</html>
`;
}
