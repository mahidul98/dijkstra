// ── Canvas Setup ──

const cv  = document.getElementById('cv');
const ctx = cv.getContext('2d');
let W, H;

function resize() {
  const wrap = document.getElementById('canvas-wrap');
  const dpr  = window.devicePixelRatio || 1;
  W = wrap.clientWidth;
  H = wrap.clientHeight;
  cv.width  = W * dpr;
  cv.height = H * dpr;
  cv.style.width  = W + 'px';
  cv.style.height = H + 'px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  draw();
}

window.addEventListener('resize', resize);
setTimeout(resize, 60);

// ── State ──

let nodes       = [];
let edges       = [];
let mode        = 'node';
let startNode   = null;
let endNode     = null;
let edgeSrc     = null;
let animState   = null;
let animTimer   = null;
let nodeCounter = 0;
let hoverNode   = null;

// ── Mode Control ──

function setMode(m) {
  mode = m;

  document.getElementById('m-node').className  = 'mode-btn' + (m === 'node'  ? ' active'       : '');
  document.getElementById('m-edge').className  = 'mode-btn' + (m === 'edge'  ? ' active'       : '');
  document.getElementById('m-start').className = 'mode-btn' + (m === 'start' ? ' active-start' : '');
  document.getElementById('m-end').className   = 'mode-btn' + (m === 'end'   ? ' active-end'   : '');

  document.getElementById('edge-controls').style.display = (m === 'edge') ? 'block' : 'none';

  edgeSrc = null;
  if (m === 'edge') refreshSelects();
  updateStatus();
  draw();
}

function updateStatus(txt) {
  const msgs = {
    node:  'Click on the canvas to place a node.',
    edge:  'Click a node to start an edge, then click the destination. Or use dropdowns below.',
    start: 'Click any node to mark it as the START.',
    end:   'Click any node to mark it as the END.',
  };
  document.getElementById('status').textContent = txt || msgs[mode] || '';
}

// ── Node Helpers ──

function getLetter(i) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (i < 26) return alpha[i];
  return alpha[Math.floor(i / 26) - 1] + alpha[i % 26];
}

function addNode(x, y, label) {
  const id  = 'n' + (nodeCounter++);
  const lbl = label || getLetter(nodes.length);
  nodes.push({ id, x, y, label: lbl });
  refreshSelects();
  return id;
}

function nodeById(id) {
  return nodes.find(n => n.id === id);
}

function nodeAt(x, y) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (Math.hypot(nodes[i].x - x, nodes[i].y - y) < 22) return nodes[i];
  }
  return null;
}

// ── Edge Helpers ──

function addEdge(a, b, w) {
  if (!a || !b || a === b) return false;
  const exists = edges.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
  if (exists) return false;
  edges.push({ a, b, w: Math.max(1, parseInt(w) || 10) });
  return true;
}

function addEdgeFromMenu() {
  const a = document.getElementById('sel-a').value;
  const b = document.getElementById('sel-b').value;
  const w = document.getElementById('weight-in').value;
  if (!a || !b) { updateStatus('Select both From and To nodes.'); return; }
  if (addEdge(a, b, w)) {
    draw();
    updateStatus('Edge added!');
  } else {
    updateStatus('Edge already exists or invalid selection.');
  }
}

function refreshSelects() {
  ['sel-a', 'sel-b'].forEach((id, i) => {
    const s = document.getElementById(id);
    const v = s.value;
    s.innerHTML = `<option value="">${i === 0 ? 'From' : 'To'} node…</option>`;
    nodes.forEach(n => s.add(new Option(n.label, n.id)));
    s.value = v;
  });
}

// ── Canvas Events ──

cv.addEventListener('mousemove', e => {
  const { x, y } = canvasPos(e);
  const h = nodeAt(x, y);

  if (h !== hoverNode) { hoverNode = h; draw(); }

  const tip = document.getElementById('tooltip');
  if (h) {
    let info = 'Node: ' + h.label;
    if (h.id === startNode) info += ' [START]';
    if (h.id === endNode)   info += ' [END]';
    if (animState && animState.dist && animState.dist[h.id] !== undefined && animState.dist[h.id] < Infinity) {
      info += '  d=' + animState.dist[h.id];
    }
    tip.style.display = 'block';
    tip.style.left    = (e.offsetX + 14) + 'px';
    tip.style.top     = (e.offsetY - 10) + 'px';
    tip.textContent   = info;
    cv.style.cursor   = 'pointer';
  } else {
    tip.style.display = 'none';
    cv.style.cursor   = (mode === 'node') ? 'crosshair' : 'default';
  }
});

cv.addEventListener('mouseleave', () => {
  document.getElementById('tooltip').style.display = 'none';
  hoverNode = null;
  draw();
});

cv.addEventListener('click', e => {
  const { x, y } = canvasPos(e);
  const hit = nodeAt(x, y);

  if (mode === 'node') {
    if (!hit) { addNode(x, y); draw(); }
    else updateStatus('A node already exists here.');

  } else if (mode === 'start') {
    if (hit) { startNode = hit.id; draw(); updateStatus('Start set to: ' + hit.label); }

  } else if (mode === 'end') {
    if (hit) { endNode = hit.id; draw(); updateStatus('End set to: ' + hit.label); }

  } else if (mode === 'edge') {
    if (hit) {
      if (!edgeSrc) {
        edgeSrc = hit.id;
        draw();
        updateStatus('From: ' + hit.label + ' — now click the destination node.');
      } else {
        const w = parseInt(document.getElementById('weight-in').value) || 10;
        if (addEdge(edgeSrc, hit.id, w)) {
          updateStatus('Edge ' + nodeById(edgeSrc).label + ' → ' + hit.label + ' (w=' + w + ') added.');
        } else {
          updateStatus('Edge already exists or same node selected.');
        }
        edgeSrc = null;
        draw();
      }
    }
  }
});

function canvasPos(e) {
  const r = cv.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (W / r.width),
    y: (e.clientY - r.top)  * (H / r.height)
  };
}

// ── Drawing ──

function draw() {
  ctx.clearRect(0, 0, W, H);

  // Draw edges
  edges.forEach(e => {
    const a = nodeById(e.a);
    const b = nodeById(e.b);
    if (!a || !b) return;

    const key1 = e.a + '_' + e.b;
    const key2 = e.b + '_' + e.a;

    const isVisEdge  = animState && animState.visitedEdges && (animState.visitedEdges.has(key1) || animState.visitedEdges.has(key2));
    const isPathEdge = animState && animState.pathEdges    && (animState.pathEdges.has(key1)    || animState.pathEdges.has(key2));

    let col = 'rgba(255,255,255,0.1)';
    if (isVisEdge)  col = 'rgba(127,119,221,0.45)';
    if (isPathEdge) col = '#EF9F27';

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = col;
    ctx.lineWidth   = isPathEdge ? 3.5 : 1.5;
    ctx.stroke();

    // Weight badge
    const mx  = (a.x + b.x) / 2;
    const my  = (a.y + b.y) / 2;
    const dx  = b.x - a.x;
    const dy  = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ox  = -dy / len * 11;
    const oy  =  dx / len * 11;

    ctx.beginPath();
    ctx.arc(mx + ox, my + oy, 10, 0, Math.PI * 2);
    ctx.fillStyle   = '#17171a';
    ctx.fill();
    ctx.strokeStyle = isPathEdge ? '#ba7517' : 'rgba(255,255,255,0.12)';
    ctx.lineWidth   = 0.5;
    ctx.stroke();

    ctx.font         = 'bold 10px JetBrains Mono, monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = isPathEdge ? '#EF9F27' : '#8a8880';
    ctx.fillText(e.w, mx + ox, my + oy);
  });

  // Dashed preview line while drawing an edge
  if (edgeSrc && hoverNode && hoverNode.id !== edgeSrc) {
    const s = nodeById(edgeSrc);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(hoverNode.x, hoverNode.y);
    ctx.strokeStyle = 'rgba(239,159,39,0.35)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw nodes
  nodes.forEach(n => {
    const isStart   = n.id === startNode;
    const isEnd     = n.id === endNode;
    const isCurrent = animState && animState.current === n.id;
    const isVisited = animState && animState.visited  && animState.visited.has(n.id);
    const isPath    = animState && animState.pathNodes && animState.pathNodes.has(n.id);
    const isHover   = hoverNode && hoverNode.id === n.id;
    const isSrc     = edgeSrc === n.id;

    let fill   = '#2a2a2e';
    let stroke = 'rgba(255,255,255,0.18)';
    let sw     = 1.5;

    if (isVisited) { fill = '#534AB7'; stroke = '#7F77DD'; }
    if (isCurrent) { fill = '#7F77DD'; stroke = '#AFA9EC'; sw = 2; }
    if (isPath)    { fill = '#ba7517'; stroke = '#EF9F27'; sw = 2.5; }
    if (isStart)   { fill = '#0f6e56'; stroke = '#1D9E75'; sw = 2; }
    if (isEnd)     { fill = '#993c1d'; stroke = '#D85A30'; sw = 2; }

    // Start/End always keep their color even on final path
    if (isPath && isStart) { fill = '#0f6e56'; stroke = '#1D9E75'; }
    if (isPath && isEnd)   { fill = '#993c1d'; stroke = '#D85A30'; }

    const r = 16;

    // Soft glow for current/path nodes
    if (isCurrent || isPath) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 6, 0, Math.PI * 2);
      ctx.fillStyle = isCurrent ? 'rgba(127,119,221,0.18)' : 'rgba(239,159,39,0.15)';
      ctx.fill();
    }

    // Hover / edge-source ring
    if (isHover || isSrc) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = isSrc ? '#EF9F27' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    }

    // Node circle
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle   = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth   = sw;
    ctx.stroke();

    // Node letter label
    ctx.font         = 'bold 12px JetBrains Mono, monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = '#ffffff';
    ctx.fillText(n.label, n.x, n.y);

    // S / E badge
    if (isStart || isEnd) {
      ctx.font      = 'bold 9px JetBrains Mono, monospace';
      ctx.fillStyle = isStart ? '#1D9E75' : '#D85A30';
      ctx.fillText(isStart ? 'S' : 'E', n.x + 14, n.y - 14);
    }

    // Distance label during animation
    if (animState && animState.dist && animState.dist[n.id] !== undefined && animState.dist[n.id] < Infinity && !isPath) {
      ctx.font         = '9px JetBrains Mono, monospace';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle    = 'rgba(127,119,221,0.75)';
      ctx.fillText('d=' + animState.dist[n.id], n.x, n.y - 22);
    }
  });
}

// ── Dijkstra's Algorithm ──

function dijkstra(src, dst) {
  const dist = {};
  const prev = {};
  const Q    = new Set(nodes.map(n => n.id));
  const visitedEdgesAcc = new Set();
  const steps = [];

  nodes.forEach(n => { dist[n.id] = Infinity; });
  dist[src] = 0;

  while (Q.size > 0) {
    // Pick unvisited node with smallest distance
    let u = null;
    Q.forEach(id => { if (u === null || dist[id] < dist[u]) u = id; });

    if (!u || dist[u] === Infinity) break;
    Q.delete(u);

    // Record step snapshot
    steps.push({
      current:      u,
      dist:         { ...dist },
      visited:      new Set(nodes.map(n => n.id).filter(id => !Q.has(id))),
      visitedEdges: new Set(visitedEdgesAcc)
    });

    // Relax neighbors
    edges.forEach(e => {
      let neighbor = null;
      if (e.a === u) neighbor = e.b;
      else if (e.b === u) neighbor = e.a;
      if (!neighbor || !Q.has(neighbor)) return;

      const alt = dist[u] + e.w;
      if (alt < dist[neighbor]) {
        dist[neighbor] = alt;
        prev[neighbor] = u;
        visitedEdgesAcc.add(u + '_' + neighbor);
      }
    });
  }

  // Reconstruct shortest path
  const path = [];
  let cur = dst;
  while (cur) { path.unshift(cur); cur = prev[cur]; }

  const valid = path[0] === src;
  const pathEdges = new Set();
  for (let i = 0; i < path.length - 1; i++) {
    pathEdges.add(path[i] + '_' + path[i + 1]);
  }

  return {
    steps,
    path:      valid ? path : [],
    pathEdges,
    pathNodes: new Set(valid ? path : []),
    dist,
    valid
  };
}

// ── Run / Reset / Clear ──

function runDijkstra() {
  if (!startNode || !endNode) {
    updateStatus('Please set both a Start and End node first.');
    return;
  }
  if (startNode === endNode) {
    updateStatus('Start and End cannot be the same node.');
    return;
  }
  if (animTimer) { clearInterval(animTimer); animTimer = null; }

  animState = null;
  document.getElementById('path-display').textContent = '';
  document.getElementById('dist-stat').style.display  = 'none';

  const result = dijkstra(startNode, endNode);

  if (!result.valid) {
    updateStatus('No path found. The graph may be disconnected.');
    return;
  }

  let step    = 0;
  const speed    = parseInt(document.getElementById('speed-sl').value);
  const interval = Math.round(1100 / speed);

  animTimer = setInterval(() => {
    if (step < result.steps.length) {
      const s = result.steps[step];
      animState = {
        current:      s.current,
        visited:      s.visited,
        visitedEdges: s.visitedEdges,
        dist:         s.dist,
        pathEdges:    null,
        pathNodes:    null
      };
      const n = nodeById(s.current);
      const d = s.dist[s.current];
      updateStatus('Visiting: ' + (n ? n.label : s.current) + '   dist=' + (d === Infinity ? '∞' : d));
      draw();
      step++;

    } else {
      // Final path reveal
      animState = {
        current:      null,
        visited:      new Set(nodes.map(n => n.id)),
        visitedEdges: result.pathEdges,
        pathEdges:    result.pathEdges,
        pathNodes:    result.pathNodes,
        dist:         result.dist
      };
      draw();
      clearInterval(animTimer);
      animTimer = null;

      const total   = result.dist[endNode];
      const pathStr = result.path.map(id => nodeById(id)?.label || id).join(' → ');
      document.getElementById('path-display').textContent = pathStr;
      document.getElementById('dist-val').textContent     = total;
      document.getElementById('dist-stat').style.display  = 'block';
      updateStatus('Done!  Shortest distance: ' + total);
    }
  }, interval);
}

function resetPath() {
  if (animTimer) { clearInterval(animTimer); animTimer = null; }
  animState = null;
  document.getElementById('path-display').textContent = '';
  document.getElementById('dist-stat').style.display  = 'none';
  updateStatus();
  draw();
}

function clearAll() {
  if (animTimer) { clearInterval(animTimer); animTimer = null; }
  nodes       = [];
  edges       = [];
  startNode   = null;
  endNode     = null;
  animState   = null;
  edgeSrc     = null;
  nodeCounter = 0;
  document.getElementById('path-display').textContent = '';
  document.getElementById('dist-stat').style.display  = 'none';
  refreshSelects();
  draw();
  updateStatus();
}

// ── Sample Graphs ──

const SAMPLES = {
  city: {
    nodes: [
      {x:0.12, y:0.22, l:'A'}, {x:0.33, y:0.10, l:'B'}, {x:0.58, y:0.14, l:'C'},
      {x:0.80, y:0.22, l:'D'}, {x:0.20, y:0.50, l:'E'}, {x:0.47, y:0.44, l:'F'},
      {x:0.70, y:0.52, l:'G'}, {x:0.12, y:0.78, l:'H'}, {x:0.40, y:0.80, l:'I'},
      {x:0.65, y:0.82, l:'J'}, {x:0.85, y:0.65, l:'K'}
    ],
    edges: [
      ['A','B',4], ['A','E',7], ['B','C',5], ['B','F',8], ['C','D',3],
      ['C','F',6], ['D','G',9], ['D','K',11],['E','F',5], ['E','H',6],
      ['F','G',7], ['F','I',9], ['G','K',5], ['G','J',8], ['H','I',4],
      ['I','J',6], ['J','K',7]
    ],
    start: 'A', end: 'K'
  },
  metro: {
    nodes: [
      {x:0.08, y:0.50, l:'P'}, {x:0.25, y:0.22, l:'Q'}, {x:0.25, y:0.78, l:'R'},
      {x:0.50, y:0.50, l:'S'}, {x:0.50, y:0.18, l:'T'}, {x:0.50, y:0.82, l:'U'},
      {x:0.72, y:0.28, l:'V'}, {x:0.72, y:0.72, l:'W'}, {x:0.90, y:0.50, l:'X'}
    ],
    edges: [
      ['P','Q',6], ['P','R',6], ['Q','S',4], ['Q','T',8], ['R','S',4],
      ['R','U',8], ['S','T',6], ['S','U',6], ['S','V',7], ['S','W',7],
      ['T','V',5], ['U','W',5], ['V','X',6], ['W','X',6]
    ],
    start: 'P', end: 'X'
  },
  grid: {
    nodes: [
      {x:0.12, y:0.18, l:'A'}, {x:0.38, y:0.18, l:'B'}, {x:0.63, y:0.18, l:'C'},
      {x:0.87, y:0.18, l:'D'}, {x:0.12, y:0.50, l:'E'}, {x:0.38, y:0.50, l:'F'},
      {x:0.63, y:0.50, l:'G'}, {x:0.87, y:0.50, l:'H'}, {x:0.12, y:0.82, l:'I'},
      {x:0.38, y:0.82, l:'J'}, {x:0.63, y:0.82, l:'K'}, {x:0.87, y:0.82, l:'L'}
    ],
    edges: [
      ['A','B',3], ['B','C',5], ['C','D',2],
      ['E','F',4], ['F','G',3], ['G','H',6],
      ['I','J',2], ['J','K',7], ['K','L',3],
      ['A','E',4], ['E','I',5],
      ['B','F',6], ['F','J',4],
      ['C','G',3], ['G','K',5],
      ['D','H',7], ['H','L',4],
      ['B','E',8], ['C','F',6], ['C','H',9], ['J','G',5]
    ],
    start: 'A', end: 'L'
  }
};

function loadSample() {
  const key = document.getElementById('sample-sel').value;
  const s   = SAMPLES[key];
  if (!s) { updateStatus('Select a sample from the list first.'); return; }

  clearAll();

  const imap = {};
  s.nodes.forEach(n => { imap[n.l] = addNode(n.x * W, n.y * H, n.l); });
  s.edges.forEach(([a, b, w]) => addEdge(imap[a], imap[b], w));
  startNode = imap[s.start];
  endNode   = imap[s.end];

  draw();

  const sel   = document.getElementById('sample-sel');
  const label = sel.options[sel.selectedIndex].text;
  updateStatus('Loaded: ' + label + '. Press Find Shortest Path to run.');
}