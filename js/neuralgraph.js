const STYLE_ID = 'radplan-neural-graph-styles';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .ng-container {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: radial-gradient(circle at 50% 50%, #060b19 0%, #02040a 100%);
      background-image: 
        radial-gradient(circle at 50% 50%, rgba(6, 11, 25, 0.45) 0%, rgba(2, 4, 10, 0.96) 100%),
        linear-gradient(rgba(18, 30, 60, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(18, 30, 60, 0.04) 1px, transparent 1px);
      background-size: 100% 100%, 24px 24px, 24px 24px;
      padding: 22px;
    }
    .ng-canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      z-index: 1;
      pointer-events: none;
    }
    .ng-matrix-grid {
      position: relative;
      display: grid;
      width: 100%;
      height: 100%;
      grid-auto-rows: 1fr;
      z-index: 2;
      will-change: transform, opacity;
    }
    
    /* Clean glass scanning reflection sweep overlay */
    .ng-glass-scan {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 10;
      overflow: hidden;
      border-radius: inherit;
    }
    .ng-glass-scan::after {
      content: '';
      position: absolute;
      top: -150%;
      left: -150%;
      width: 400%;
      height: 400%;
      background: linear-gradient(
        45deg,
        transparent 45%,
        rgba(255, 255, 255, 0.0) 48%,
        rgba(255, 255, 255, 0.12) 50%,
        rgba(255, 255, 255, 0.0) 52%,
        transparent 55%
      );
      transform: rotate(-15deg);
      animation: glassSweep 6s cubic-bezier(0.25, 1, 0.5, 1) infinite;
    }
    @keyframes glassSweep {
      0% { transform: translate(-30%, -30%) rotate(-15deg); }
      30%, 100% { transform: translate(30%, 30%) rotate(-15deg); }
    }
    
    /* Clean, high-end vertical glass scanning line */
    .ng-scan-line {
      position: absolute;
      left: 0;
      width: 100%;
      height: 100px;
      background: linear-gradient(
        to bottom,
        transparent,
        rgba(56, 189, 248, 0.01) 20%,
        rgba(56, 189, 248, 0.08) 50%,
        rgba(255, 255, 255, 0.15) 51%,
        rgba(56, 189, 248, 0.08) 52%,
        rgba(56, 189, 248, 0.01) 80%,
        transparent
      );
      pointer-events: none;
      z-index: 4;
      opacity: 0.6;
      animation: verticalScan 8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
    }
    @keyframes verticalScan {
      0% { top: -120px; }
      100% { top: 100%; }
    }
    
    .ng-flat-cell {
      position: relative;
      border-radius: 6px;
      background: rgba(8, 17, 36, 0.65);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.06);
      box-shadow: 
        0 4px 10px rgba(0, 0, 0, 0.25), 
        inset 0 1px 1px rgba(255, 255, 255, 0.05);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      will-change: transform, background-color, border-color, box-shadow;
      transition: 
        background-color 0.25s ease, 
        border-color 0.25s ease, 
        box-shadow 0.25s ease;
    }
    .ng-flat-cell.pulse {
      background: rgba(14, 25, 52, 0.75);
    }
    .ng-flat-cell.error {
      background: rgba(127, 29, 29, 0.15);
    }
    .ng-day-number {
      position: absolute;
      top: 6px;
      left: 8px;
      font-family: var(--font-mono, monospace);
      font-size: 11px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.4);
      pointer-events: none;
      z-index: 5;
    }
    .ng-slots-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 5px;
      gap: 5px;
      margin-top: 18px;
    }
    .ng-slot {
      flex: 1;
      position: relative;
      background: rgba(2, 6, 18, 0.55);
      border-radius: 4px;
      border: 1px solid rgba(255, 255, 255, 0.04);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      overflow: hidden;
    }
    .ng-slot::before {
      content: attr(data-label);
      position: absolute;
      left: 6px;
      top: 50%;
      transform: translateY(-50%);
      font-family: var(--font-mono, monospace);
      font-size: 8px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.2);
      letter-spacing: 0.05em;
      pointer-events: none;
    }
    .ng-slot.active-d {
      background: rgba(239, 68, 68, 0.22);
      border-color: rgba(239, 68, 68, 0.7);
      box-shadow: 0 0 10px rgba(239, 68, 68, 0.4);
    }
    .ng-slot.active-hg {
      background: rgba(14, 165, 233, 0.22);
      border-color: rgba(14, 165, 233, 0.7);
      box-shadow: 0 0 10px rgba(14, 165, 233, 0.4);
    }
    .ng-slot-emp {
      font-family: var(--font-mono, monospace);
      font-size: 11px;
      font-weight: 700;
      color: transparent;
      text-align: center;
      letter-spacing: 0.02em;
      display: inline-block;
      transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), color 0.2s;
    }
    .ng-slot.has-val .ng-slot-emp {
      color: #fff;
    }
    .ng-slot.is-pulsing {
      background: rgba(255, 255, 255, 0.08);
      border-color: var(--pulse-color);
    }
    
    /* Success Badges & Checkmarks */
    .ng-checkmark-icon {
      position: absolute;
      top: 6px;
      right: 6px;
      width: 12px;
      height: 12px;
      color: #22c55e;
      opacity: 0;
      transform: scale(0.5);
      transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      pointer-events: none;
      z-index: 5;
    }
    .ng-flat-cell.success-active .ng-checkmark-icon {
      opacity: 1;
      transform: scale(1);
    }
    .ng-slot.success-reveal .ng-slot-emp {
      animation: slotSpringUp 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
    }
    @keyframes slotSpringUp {
      0% { transform: translateY(10px); opacity: 0; }
      100% { transform: translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

const PHASE_RGB = {
  init:    [56, 189, 248],
  greedy:  [245, 158, 11],
  hg:      [56, 189, 248],
  deep:    [168, 85, 247],
  success: [34, 197, 94],
  error:   [239, 68, 68],
};

function getECGValue(t) {
  t = t % 1.0;
  if (t < 0.1) {
    // P wave
    return 0.12 * Math.sin((t / 0.1) * Math.PI);
  }
  if (t < 0.15) {
    return 0;
  }
  if (t < 0.18) {
    // Q wave
    return -0.18 * Math.sin(((t - 0.15) / 0.03) * Math.PI);
  }
  if (t < 0.22) {
    // R wave
    return 1.0 * Math.sin(((t - 0.18) / 0.04) * Math.PI);
  }
  if (t < 0.25) {
    // S wave
    return -0.35 * Math.sin(((t - 0.22) / 0.03) * Math.PI);
  }
  if (t < 0.35) {
    return 0;
  }
  if (t < 0.5) {
    // T wave
    return 0.22 * Math.sin(((t - 0.35) / 0.15) * Math.PI);
  }
  return 0;
}

export class NeuralGraph {
  constructor(container) {
    this.container = container;
    this.cells = new Map();
    this.nodeFx = new Map();
    this.employees = [];
    this.daysCount = 0;
    this.phase = 'init';
    this.basePhase = 'init';

    // UI elements
    this.miniMapCanvas = null;
    this.miniMapCtx = null;
    this.bgCanvas = null;
    this.bgCtx = null;

    // Simulation states
    this.dataPackets = [];          // flowing blue/grey data packets
    this.coreErrorLevel = 0;        // glowing red outline value
    this.throughputActivity = 0.05; // CPU/solver activity throughput
    this.throughputHistory = new Array(40).fill(0.05);
    
    this.lastActiveDay = null;

    // Constellation setup
    this.constellationParticles = [];
    this.seedConstellation();

    // Molecular network core nodes
    this.coreNodes = [];
    this.seedCoreNodes();

    // 3D high-precision globe vertices
    this.globeVertices = [];
    this.globeEdges = [];
    this.seedGlobe();

    this.animId = null;
    this.resizeObserver = null;
    this.gridFloat = null;
    this.positionsDirty = true;
    this.t0 = performance.now();
    this.frameCount = 0;

    // Animation metrics
    this.entranceStartTime = performance.now();
    this.successStartTime = null;

    injectStyles();
    this.buildDOM();
    this.setupResizeObserver();
  }

  seedConstellation() {
    this.constellationParticles = [];
    const numParticles = 45;
    for (let i = 0; i < numParticles; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() - 0.5) * 2);
      const dist = 60 + Math.random() * 140;
      this.constellationParticles.push({
        x: dist * Math.sin(phi) * Math.cos(theta),
        y: dist * Math.sin(phi) * Math.sin(theta),
        z: dist * Math.cos(phi),
        baseSize: 0.6 + Math.random() * 1.2
      });
    }
  }

  seedCoreNodes() {
    this.coreNodes = [];
    const numNodes = 14;
    for (let i = 0; i < numNodes; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() - 0.5) * 2);
      const r = 20 + Math.random() * 25;
      this.coreNodes.push({
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.sin(phi) * Math.sin(theta),
        z: r * Math.cos(phi),
        baseSize: 1.8 + Math.random() * 2.2
      });
    }
  }

  seedGlobe() {
    this.globeVertices = [];
    this.globeEdges = [];
    
    const latDivs = 8;
    const lonDivs = 10;
    const radius = 18;
    
    for (let i = 0; i <= latDivs; i++) {
      const theta = (i * Math.PI) / latDivs;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      
      for (let j = 0; j < lonDivs; j++) {
        const phi = (j * Math.PI * 2) / lonDivs;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        
        const x = radius * sinTheta * cosPhi;
        const y = radius * sinTheta * sinPhi;
        const z = radius * cosTheta;
        
        this.globeVertices.push({ x, y, z });
      }
    }
    
    // Latitudinal lines
    for (let i = 0; i <= latDivs; i++) {
      for (let j = 0; j < lonDivs; j++) {
        const idx1 = i * lonDivs + j;
        const idx2 = i * lonDivs + ((j + 1) % lonDivs);
        this.globeEdges.push([idx1, idx2]);
      }
    }
    
    // Longitudinal lines
    for (let i = 0; i < latDivs; i++) {
      for (let j = 0; j < lonDivs; j++) {
        const idx1 = i * lonDivs + j;
        const idx2 = (i + 1) * lonDivs + j;
        this.globeEdges.push([idx1, idx2]);
      }
    }
  }

  buildDOM() {
    this.container.innerHTML = '';
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'ng-container';

    this.bgCanvas = document.createElement('canvas');
    this.bgCanvas.className = 'ng-canvas';
    this.bgCtx = this.bgCanvas.getContext('2d');

    // Add high-end vertical glass scanning line
    this.scanLine = document.createElement('div');
    this.scanLine.className = 'ng-scan-line';
    this.wrapper.appendChild(this.scanLine);

    this.gridFloat = document.createElement('div');
    this.gridFloat.className = 'ng-matrix-grid';
    
    // Add glass scan sweep overlays
    this.glassScan = document.createElement('div');
    this.glassScan.className = 'ng-glass-scan';
    this.gridFloat.appendChild(this.glassScan);

    this.wrapper.appendChild(this.bgCanvas);
    this.wrapper.appendChild(this.gridFloat);
    this.container.appendChild(this.wrapper);

    this.startLoop();
    window.lastNeuralGraphInstance = this;
  }

  setupResizeObserver() {
    this.resizeObserver = new ResizeObserver(() => {
      this.resizeMiniMap();
      this.resizeBgCanvas();
      this.positionsDirty = true;
    });
    this.resizeObserver.observe(this.container);
  }

  resizeBgCanvas() {
    if (!this.bgCanvas || !this.wrapper) return;
    const w = this.wrapper.clientWidth;
    const h = this.wrapper.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = window.devicePixelRatio || 1;
    this.bgCanvas.width = w * dpr;
    this.bgCanvas.height = h * dpr;
    this.bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.bgW = w;
    this.bgH = h;
  }

  initData(daysCount, employees) {
    this.daysCount = daysCount;
    this.employees = employees;
    this.gridFloat.innerHTML = '';
    
    this.glassScan = document.createElement('div');
    this.glassScan.className = 'ng-glass-scan';
    this.gridFloat.appendChild(this.glassScan);

    this.cells.clear();
    this.nodeFx.clear();

    const cols = 7;
    const rows = Math.ceil(daysCount / cols);
    this.gridFloat.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    this.gridFloat.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    this.gridFloat.style.gap = `8px`;

    for (let d = 1; d <= daysCount; d++) {
      const cell = document.createElement('div');
      cell.className = 'ng-flat-cell rest';

      const dayLabel = document.createElement('div');
      dayLabel.className = 'ng-day-number';
      dayLabel.textContent = d;

      // Add soft SVG checkmark icon
      const checkmark = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      checkmark.setAttribute('class', 'ng-checkmark-icon');
      checkmark.setAttribute('viewBox', '0 0 24 24');
      checkmark.setAttribute('fill', 'none');
      checkmark.setAttribute('stroke', 'currentColor');
      checkmark.setAttribute('stroke-width', '3.5');
      checkmark.setAttribute('stroke-linecap', 'round');
      checkmark.setAttribute('stroke-linejoin', 'round');
      checkmark.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
      cell.appendChild(checkmark);

      const slotsContainer = document.createElement('div');
      slotsContainer.className = 'ng-slots-container';

      const dSlot = document.createElement('div');
      dSlot.className = 'ng-slot slot-d';
      dSlot.setAttribute('data-label', 'D');
      const dEmp = document.createElement('span');
      dEmp.className = 'ng-slot-emp';
      dSlot.appendChild(dEmp);

      const hgSlot = document.createElement('div');
      hgSlot.className = 'ng-slot slot-hg';
      hgSlot.setAttribute('data-label', 'HG');
      const hgEmp = document.createElement('span');
      hgEmp.className = 'ng-slot-emp';
      hgSlot.appendChild(hgEmp);

      slotsContainer.appendChild(dSlot);
      slotsContainer.appendChild(hgSlot);

      cell.appendChild(dayLabel);
      cell.appendChild(slotsContainer);
      this.gridFloat.appendChild(cell);

      this.cells.set(d, { 
        el: cell, 
        dSlot, 
        dEmp, 
        hgSlot, 
        hgEmp,
        currScale: 1.0
      });
      this.nodeFx.set(d, { glow: 0, color: [56, 189, 248], x: 0, y: 0 });
    }

    this.entranceStartTime = performance.now();
    this.successStartTime = null;

    this.positionsDirty = true;
    this.resizeBgCanvas();
  }

  computeNodePositions() {
    if (!this.wrapper || !this.gridFloat) return;
    const wrapRect = this.wrapper.getBoundingClientRect();
    const gridRect = this.gridFloat.getBoundingClientRect();
    if (wrapRect.width === 0 || gridRect.width === 0) return;

    const offsetX = gridRect.left - wrapRect.left;
    const offsetY = gridRect.top - wrapRect.top;

    for (const [d, fx] of this.nodeFx.entries()) {
      const cellData = this.cells.get(d);
      if (!cellData) continue;
      const el = cellData.el;
      fx.x = offsetX + el.offsetLeft + el.offsetWidth / 2;
      fx.y = offsetY + el.offsetTop + el.offsetHeight / 2;
    }
    this.coreX = this.bgW ? this.bgW / 2 : wrapRect.width / 2;
    this.coreY = this.bgH ? this.bgH / 2 : wrapRect.height / 2;
    this.positionsDirty = false;
  }

  attachMiniMap(container) {
    container.innerHTML = '';
    this.miniMapCanvas = document.createElement('canvas');
    this.miniMapCanvas.style.width = '100%';
    this.miniMapCanvas.style.height = '100%';
    this.miniMapCanvas.style.display = 'block';
    container.appendChild(this.miniMapCanvas);
    this.miniMapCtx = this.miniMapCanvas.getContext('2d', { alpha: false });

    if (this.resizeObserver) {
      this.resizeObserver.observe(container);
    }

    this.resizeMiniMap();
  }

  resizeMiniMap() {
    if (!this.miniMapCanvas || !this.miniMapCanvas.parentElement) return;
    const parent = this.miniMapCanvas.parentElement;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w === 0 || h === 0) return;

    const dpr = window.devicePixelRatio || 1;
    this.miniMapCanvas.width = w * dpr;
    this.miniMapCanvas.height = h * dpr;
    this.miniMapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  phaseColorArr() {
    return PHASE_RGB[this.phase] || PHASE_RGB.init;
  }

  dutyColorArr(dutyType) {
    return dutyType === 'HG' ? [14, 165, 233] : [239, 68, 68];
  }

  getAbbreviation(empId) {
    if (!empId) return '';
    const stripped = String(empId)
      .replace(/^(Herr|Frau|Hr\.|Fr\.|Dr\.\s*(med\.\s*)?|Prof\.\s*(Dr\.\s*(med\.\s*)?|med\.\s*)?|PD\s+Dr\.\s*(med\.\s*)?|Dipl\.\s*\w+\.\s*)/gi, '')
      .trim();
    const parts = stripped.split(/\s+/);
    if (parts.length <= 1) {
      return stripped.replace(/\s/g, '').substring(0, 3).toUpperCase();
    }
    const surnamePrefixes = ['el', 'al', 'van', 'von', 'de', 'le', 'la', 'di', 'lo', 'del', 'dal', 'bin', 'ben', 'abu'];
    const firstPartLower = parts[0].toLowerCase();
    if (surnamePrefixes.includes(firstPartLower)) {
      return parts.join('').substring(0, 3).toUpperCase();
    }
    const surname = parts[parts.length - 1];
    return surname.substring(0, 3).toUpperCase();
  }

  pulseCell(dayIdx, empId, isActive, isError = false, dutyType = 'D') {
    const cellData = this.cells.get(dayIdx);
    if (!cellData) return;

    const { el, dSlot, dEmp, hgSlot, hgEmp } = cellData;
    const targetSlot = dutyType === 'HG' ? hgSlot : dSlot;
    const targetEmp = dutyType === 'HG' ? hgEmp : dEmp;

    if (empId && empId !== 'SWAP') {
      targetEmp.textContent = this.getAbbreviation(empId);
      targetSlot.classList.add('has-val');
    } else if (empId === 'SWAP') {
      targetEmp.textContent = 'SWP';
      targetSlot.classList.add('has-val');
    }

    if (isActive) {
      const colorArr = isError ? PHASE_RGB.error : this.dutyColorArr(dutyType);
      const borderColor = `rgba(${colorArr[0]}, ${colorArr[1]}, ${colorArr[2]}, 0.95)`;

      el.classList.add(isError ? 'error' : 'pulse');
      el.style.setProperty('--pulse-color', borderColor);
      targetSlot.classList.add('is-pulsing');
      targetSlot.style.setProperty('--pulse-color', borderColor);

      if (dutyType === 'HG') {
        targetSlot.classList.add('active-hg');
      } else {
        targetSlot.classList.add('active-d');
      }
      targetEmp.style.color = '#fff';

      const fx = this.nodeFx.get(dayIdx);
      if (fx) {
        fx.glow = Math.min(1.5, fx.glow + (isError ? 1.4 : 0.8));
        fx.color = colorArr;
      }
    } else {
      el.classList.remove('pulse', 'error');
      targetSlot.classList.remove('is-pulsing', 'active-hg', 'active-d');

      if (dutyType === 'HG') {
        targetEmp.style.color = targetSlot.classList.contains('has-val') ? '#0EA5E9' : 'transparent';
      } else {
        targetEmp.style.color = targetSlot.classList.contains('has-val') ? '#EF4444' : 'transparent';
      }

      if (empId === 'SWAP') {
        targetEmp.textContent = '';
        targetSlot.classList.remove('has-val');
      }
    }
  }

  fireMiniMapPulse(isError = false) {
    this.throughputActivity = Math.min(1.0, this.throughputActivity + (isError ? 0.35 : 0.2));
  }

  triggerSwap(dayIdx, oldEmpId, newEmpId, dutyType = 'D') {
    if (this.positionsDirty) this.computeNodePositions();

    const fx = this.nodeFx.get(dayIdx);
    if (fx && fx.x) {
      this.dataPackets.push({
        dayIdx,
        progress: 0,
        speed: 0.02 + Math.random() * 0.015,
        color: dutyType === 'HG' ? 'rgba(14, 165, 233, 0.85)' : 'rgba(56, 189, 248, 0.85)',
        size: 1.8
      });
      this.lastActiveDay = dayIdx;
    }

    this.pulseCell(dayIdx, 'SWAP', true, false, dutyType);
    this.fireMiniMapPulse();

    setTimeout(() => {
      if (this.phase !== 'success') {
        this.pulseCell(dayIdx, newEmpId, false, false, dutyType);
      }
    }, 450);
  }

  triggerAssignment(dayIdx, empId, dutyType = 'D') {
    if (this.positionsDirty) this.computeNodePositions();

    const fx = this.nodeFx.get(dayIdx);
    if (fx && fx.x) {
      this.dataPackets.push({
        dayIdx,
        progress: 0,
        speed: 0.02 + Math.random() * 0.015,
        color: dutyType === 'HG' ? 'rgba(14, 165, 233, 0.85)' : 'rgba(56, 189, 248, 0.85)',
        size: 1.8
      });
      this.lastActiveDay = dayIdx;
    }

    this.pulseCell(dayIdx, empId, true, false, dutyType);
    this.fireMiniMapPulse();

    setTimeout(() => {
      if (this.phase !== 'success') {
        this.pulseCell(dayIdx, empId, false, false, dutyType);
      }
    }, 450);
  }

  triggerError(dayIdx, empId, dutyType = 'D') {
    if (this.positionsDirty) this.computeNodePositions();

    if (this.phase !== 'error') {
      this.basePhase = this.phase;
    }
    this.phase = 'error';

    // Mark neural network core with a clean, thin red highlight border
    this.coreErrorLevel = 1.0;

    this.pulseCell(dayIdx, empId, true, true, dutyType);
    this.fireMiniMapPulse(true);

    setTimeout(() => {
      if (this.phase === 'error') {
        this.phase = this.basePhase || 'init';
      }
      this.pulseCell(dayIdx, empId, false, false, dutyType);
    }, 450);
  }

  setPhase(phase) {
    this.phase = phase;
    if (phase !== 'error') {
      this.basePhase = phase;
    }
  }

  triggerSuccess(finalAssignments) {
    this.setPhase('success');

    if (finalAssignments) {
      for (const [emp, days] of Object.entries(finalAssignments)) {
        for (const [dayStr, data] of Object.entries(days)) {
          const dayIdx = parseInt(dayStr, 10);
          const cellData = this.cells.get(dayIdx);
          if (cellData && data.duty) {
            if (data.duty === 'D') {
              cellData.dEmp.textContent = this.getAbbreviation(emp);
              cellData.dSlot.classList.add('has-val');
              cellData.dEmp.style.color = '#EF4444';
            }
            if (data.duty === 'HG') {
              cellData.hgEmp.textContent = this.getAbbreviation(emp);
              cellData.hgSlot.classList.add('has-val');
              cellData.hgEmp.style.color = '#0EA5E9';
            }
          }
        }
      }
    }

    if (this.positionsDirty) this.computeNodePositions();
    this.phase = 'success';

    // Trigger success animations (slide up slide values and soft checkmark/completed)
    for (const [dayIdx, cellData] of this.cells.entries()) {
      cellData.el.classList.add('success-active');
      cellData.dSlot.classList.add('success-reveal');
      cellData.hgSlot.classList.add('success-reveal');
      
      const fx = this.nodeFx.get(dayIdx);
      if (fx) {
        fx.glow = 1.0;
        fx.color = PHASE_RGB.success;
      }
    }

    this.successStartTime = performance.now();

    for (let p = 0; p < 6; p++) {
      setTimeout(() => {
        this.fireMiniMapPulse();
      }, p * 150);
    }
  }

  startLoop() {
    if (this.animId) cancelAnimationFrame(this.animId);
    const loop = () => {
      this.renderConstellation();
      this.renderMiniMap();
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  renderConstellation() {
    const ctx = this.bgCtx;
    if (!ctx || !this.bgW || !this.bgH) return;
    if (this.positionsDirty) this.computeNodePositions();

    const w = this.bgW;
    const h = this.bgH;
    const time = (performance.now() - this.t0) / 1000;
    const [pr, pg, pb] = this.phaseColorArr();
    const now = performance.now();

    ctx.clearRect(0, 0, w, h);

    // Muted clinic grid lines in background
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.015)';
    ctx.lineWidth = 0.5;
    const gridSz = 32;
    ctx.beginPath();
    for (let x = 0; x < w; x += gridSz) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y < h; y += gridSz) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    ctx.restore();

    // 1. Grid entrance fade and flat scaling (no 3D rotate angles)
    const entranceElapsed = (now - this.entranceStartTime) / 1000;
    const entranceDuration = 1.0;
    const tEntrance = Math.min(1.0, entranceElapsed / entranceDuration);
    const easeEntrance = 1 - Math.pow(1 - tEntrance, 3); // easeOutCubic

    const currentScale = 0.94 + 0.06 * easeEntrance;
    const currentOpacity = easeEntrance;

    this.gridFloat.style.transform = `scale(${currentScale})`;
    this.gridFloat.style.opacity = currentOpacity;

    // Apply micro-scale animations to cells (flat grid transitions)
    for (const [d, cellData] of this.cells.entries()) {
      const el = cellData.el;
      const isPulse = el.classList.contains('pulse');
      const isError = el.classList.contains('error');
      
      const targetScale = isPulse ? 1.03 : (isError ? 1.03 : 1.0);
      cellData.currScale = cellData.currScale * 0.85 + targetScale * 0.15;
      
      el.style.transform = `scale(${cellData.currScale})`;
      
      if (isPulse || isError) {
        el.style.boxShadow = isError 
          ? '0 6px 16px rgba(239, 68, 68, 0.18), 0 0 8px rgba(239, 68, 68, 0.15)'
          : '0 6px 16px rgba(56, 189, 248, 0.18), 0 0 8px rgba(56, 189, 248, 0.15)';
        el.style.borderColor = isError ? '#ef4444' : 'rgba(56, 189, 248, 0.6)';
      } else {
        el.style.boxShadow = '';
        el.style.borderColor = '';
      }
    }

    const cx = this.coreX || w / 2;
    const cy = this.coreY || h / 2;

    // Decay core error level
    if (this.coreErrorLevel > 0) {
      this.coreErrorLevel *= 0.94;
    }

    // Decay node glow levels
    for (const [d, fx] of this.nodeFx.entries()) {
      if (fx.glow > 0) {
        fx.glow *= 0.92;
        if (fx.glow < 0.01) fx.glow = 0;
      }
    }

    // 2. Draw connections: thin, semi-transparent grey/blue lines to core with glow highlights
    ctx.save();
    for (const [d, fx] of this.nodeFx.entries()) {
      if (!fx.x) continue;
      
      const cellData = this.cells.get(d);
      const hasError = cellData?.el.classList.contains('error');
      
      // Base line
      ctx.lineWidth = hasError ? 0.8 : 0.5;
      ctx.strokeStyle = hasError 
        ? `rgba(239, 68, 68, ${this.coreErrorLevel * 0.5 + 0.25})` 
        : 'rgba(148, 163, 184, 0.12)';
      
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(fx.x, fx.y);
      ctx.stroke();

      // Glowing active laser connection
      if (fx.glow > 0.01) {
        ctx.save();
        ctx.lineWidth = 0.5 + fx.glow * 1.5;
        const [fr, fg, fb] = fx.color;
        ctx.strokeStyle = `rgba(${fr}, ${fg}, ${fb}, ${fx.glow * 0.4})`;
        ctx.shadowColor = `rgba(${fr}, ${fg}, ${fb}, 0.8)`;
        ctx.shadowBlur = 4 + fx.glow * 6;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(fx.x, fx.y);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();

    // 2.5 Draw glowing radar circles/pulses at node locations
    ctx.save();
    for (const [d, fx] of this.nodeFx.entries()) {
      if (!fx.x || fx.glow <= 0.01) continue;
      const [fr, fg, fb] = fx.color;
      
      ctx.shadowColor = `rgba(${fr}, ${fg}, ${fb}, 0.8)`;
      ctx.shadowBlur = 6 + fx.glow * 8;
      ctx.fillStyle = `rgba(${fr}, ${fg}, ${fb}, ${fx.glow * 0.6})`;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, 4 + fx.glow * 4, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = `rgba(${fr}, ${fg}, ${fb}, ${fx.glow})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, 8 + fx.glow * 10, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // 3. Draw data packets: glowing white photons with outer color rings
    ctx.save();
    for (let i = this.dataPackets.length - 1; i >= 0; i--) {
      const p = this.dataPackets[i];
      p.progress += p.speed;
      if (p.progress >= 1.0) {
        this.dataPackets.splice(i, 1);
        continue;
      }
      
      const fx = this.nodeFx.get(p.dayIdx);
      if (!fx || !fx.x) continue;
      
      const px = cx + (fx.x - cx) * p.progress;
      const py = cy + (fx.y - cy) * p.progress;
      
      // Outer glow ring
      ctx.beginPath();
      ctx.arc(px, py, p.size + 1.2, 0, Math.PI * 2);
      ctx.fillStyle = p.color.replace('0.85', '0.25');
      ctx.fill();

      // White inner core
      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    ctx.restore();

    // 4. Draw Rotating Molecular/Neural Network Core (rotating sphere nodes) pulsing dynamically
    const coreRotX = time * 0.12;
    const coreRotY = time * 0.18;
    const corePulse = 1.0 + this.throughputActivity * 0.35;
    const projectedCore = this.coreNodes.map(n => {
      let x1 = n.x * Math.cos(coreRotY) - n.z * Math.sin(coreRotY);
      let z1 = n.x * Math.sin(coreRotY) + n.z * Math.cos(coreRotY);
      let y2 = n.y * Math.cos(coreRotX) - z1 * Math.sin(coreRotX);
      let z2 = n.y * Math.sin(coreRotX) + z1 * Math.cos(coreRotX);
      const scale = 200 / (200 + z2);
      return {
        x: cx + x1 * scale * corePulse,
        y: cy + y2 * scale * corePulse,
        z: z2,
        size: n.baseSize * scale * (1.0 + this.throughputActivity * 0.2)
      };
    });

    // Draw molecular network core connections
    ctx.save();
    ctx.strokeStyle = this.coreErrorLevel > 0.05 
      ? `rgba(239, 68, 68, ${this.coreErrorLevel * 0.4 + 0.1})` 
      : `rgba(56, 189, 248, 0.18)`;
    ctx.lineWidth = 0.6;
    for (let i = 0; i < projectedCore.length; i++) {
      const n1 = projectedCore[i];
      for (let j = i + 1; j < projectedCore.length; j++) {
        const n2 = projectedCore[j];
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 45 * 45) {
          ctx.beginPath();
          ctx.moveTo(n1.x, n1.y);
          ctx.lineTo(n2.x, n2.y);
          ctx.stroke();
        }
      }
    }

    // Draw molecular network core nodes
    for (const n of projectedCore) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.size, 0, Math.PI * 2);
      ctx.fillStyle = this.coreErrorLevel > 0.05 ? `rgba(239, 68, 68, 0.85)` : `rgba(255, 255, 255, 0.95)`;
      ctx.fill();
      
      ctx.strokeStyle = this.coreErrorLevel > 0.05 ? `rgba(239, 68, 68, 0.9)` : `rgba(56, 189, 248, 0.45)`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    ctx.restore();

    // Core Error schematic highlight border and glow (soft red)
    ctx.save();
    if (this.coreErrorLevel > 0.05) {
      ctx.beginPath();
      ctx.arc(cx, cy, 55, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(239, 68, 68, ${this.coreErrorLevel})`;
      ctx.lineWidth = 1;
      ctx.shadowColor = 'rgba(239, 68, 68, 0.7)';
      ctx.shadowBlur = 10;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, 55, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.restore();

    // 5. Draw ambient constellation particles (very faint)
    ctx.save();
    const constAngleX = time * 0.03;
    const constAngleY = time * 0.04;
    const projectedConstellation = [];
    for (const p of this.constellationParticles) {
      let x1 = p.x * Math.cos(constAngleY) - p.z * Math.sin(constAngleY);
      let z1 = p.x * Math.sin(constAngleY) + p.z * Math.cos(constAngleY);
      let y2 = p.y * Math.cos(constAngleX) - z1 * Math.sin(constAngleX);
      let z2 = p.y * Math.sin(constAngleX) + z1 * Math.cos(constAngleX);
      
      const scale = 250 / (250 + z2);
      projectedConstellation.push({
        x: cx + x1 * scale,
        y: cy + y2 * scale,
        size: p.baseSize * scale,
        alpha: 0.12 + (1 - (z2 + 150) / 300) * 0.28
      });
    }

    ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, 0.2)`;
    for (const p of projectedConstellation) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(148, 163, 184, ${p.alpha * 0.35})`;
      ctx.fill();
    }
    ctx.restore();

    // 6. Draw contour light-trace for each card when distribution is final (success phase)
    if (this.phase === 'success' && this.successStartTime !== null) {
      ctx.save();
      const tTrace = 0.8; // tracing duration (seconds)
      const tFade = 0.8;  // fade out duration (seconds)
      
      for (const [d, cellData] of this.cells.entries()) {
        const fx = this.nodeFx.get(d);
        if (!fx || !fx.x) continue;
        
        const el = cellData.el;
        const cellW = el.offsetWidth;
        const cellH = el.offsetHeight;
        
        // Calculate offset position to draw just outside the card border
        const pad = 1;
        const rectX = fx.x - cellW / 2 - pad;
        const rectY = fx.y - cellH / 2 - pad;
        const rectW = cellW + 2 * pad;
        const rectH = cellH + 2 * pad;
        const radius = 7; // slightly larger than 6 to match outer offset
        
        // Accurate perimeter for rounded rectangle dash offset
        const perimeter = 2 * (rectW + rectH) - 8 * radius + 2 * Math.PI * radius;
        
        const tStart = (d - 1) * 0.03; // 30ms stagger delay
        const elapsed = (now - this.successStartTime) / 1000 - tStart;
        
        if (elapsed < 0) continue;
        
        if (elapsed < tTrace) {
          // Tracing in progress
          const progress = elapsed / tTrace;
          ctx.strokeStyle = 'rgba(34, 197, 94, 0.95)';
          ctx.shadowColor = 'rgba(34, 197, 94, 0.9)';
          ctx.shadowBlur = 8;
          ctx.lineWidth = 2.0;
          ctx.lineCap = 'round';
          
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(rectX, rectY, rectW, rectH, radius);
          } else {
            ctx.moveTo(rectX + radius, rectY);
            ctx.lineTo(rectX + rectW - radius, rectY);
            ctx.quadraticCurveTo(rectX + rectW, rectY, rectX + rectW, rectY + radius);
            ctx.lineTo(rectX + rectW, rectY + rectH - radius);
            ctx.quadraticCurveTo(rectX + rectW, rectY + rectH, rectX + rectW - radius, rectY + rectH);
            ctx.lineTo(rectX + radius, rectY + rectH);
            ctx.quadraticCurveTo(rectX, rectY + rectH, rectX, rectY + rectH - radius);
            ctx.lineTo(rectX, rectY + radius);
            ctx.quadraticCurveTo(rectX, rectY, rectX + radius, rectY);
            ctx.closePath();
          }
          ctx.setLineDash([perimeter]);
          ctx.lineDashOffset = perimeter * (1 - progress);
          ctx.stroke();
        } else if (elapsed < tTrace + tFade) {
          // Tracing complete, fading out
          const fadeProgress = (elapsed - tTrace) / tFade;
          const opacity = 1 - fadeProgress;
          
          ctx.strokeStyle = `rgba(34, 197, 94, ${opacity * 0.95})`;
          ctx.shadowColor = `rgba(34, 197, 94, ${opacity * 0.9})`;
          ctx.shadowBlur = 8 * opacity;
          ctx.lineWidth = 2.0 * opacity;
          ctx.lineCap = 'round';
          
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(rectX, rectY, rectW, rectH, radius);
          } else {
            ctx.moveTo(rectX + radius, rectY);
            ctx.lineTo(rectX + rectW - radius, rectY);
            ctx.quadraticCurveTo(rectX + rectW, rectY, rectX + rectW, rectY + radius);
            ctx.lineTo(rectX + rectW, rectY + rectH - radius);
            ctx.quadraticCurveTo(rectX + rectW, rectY + rectH, rectX + rectW - radius, rectY + rectH);
            ctx.lineTo(rectX + radius, rectY + rectH);
            ctx.quadraticCurveTo(rectX, rectY + rectH, rectX, rectY + rectH - radius);
            ctx.lineTo(rectX, rectY + radius);
            ctx.quadraticCurveTo(rectX, rectY, rectX + radius, rectY);
            ctx.closePath();
          }
          ctx.setLineDash([]); // solid line
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  renderMiniMap() {
    if (!this.miniMapCtx || !this.miniMapCanvas.parentElement) return;

    const ctx = this.miniMapCtx;
    const parent = this.miniMapCanvas.parentElement;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w === 0 || h === 0) return;
    
    const time = (performance.now() - this.t0) / 1000;
    this.frameCount++;

    // Clear background
    ctx.fillStyle = '#040a15';
    ctx.fillRect(0, 0, w, h);

    // Muted clinic grid lines in telemetry HUD background
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.035)';
    ctx.lineWidth = 0.5;
    const gridSz = 10;
    ctx.beginPath();
    for (let x = 0; x < w; x += gridSz) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y < h; y += gridSz) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
    ctx.restore();

    // Responsive dimensions
    let globeRadius, globeX, globeY, tableX, tableW, ecgStartX, ecgW, ecgY, ecgMaxVal;
    if (w < 130) {
      globeRadius = 12;
      globeX = 18;
      globeY = h / 2;
      tableX = 40;
      tableW = w - 45;
      ecgW = 0;
    } else {
      globeRadius = Math.min(20, h / 2 - 6);
      globeX = globeRadius + 8;
      globeY = h / 2;
      tableW = 60;
      tableX = w - tableW - 8;
      ecgStartX = globeX + globeRadius + 12;
      ecgW = tableX - ecgStartX - 10;
      ecgY = h / 2 - 4;
      ecgMaxVal = Math.min(15, h / 2 - 8);
    }

    // 1. Draw rotating high-precision wireframe globe
    const globeRotX = time * 0.06;
    const globeRotY = time * 0.12;
    const projectedGlobe = this.globeVertices.map(v => {
      let x1 = v.x * Math.cos(globeRotY) - v.z * Math.sin(globeRotY);
      let z1 = v.x * Math.sin(globeRotY) + v.z * Math.cos(globeRotY);
      let y2 = v.y * Math.cos(globeRotX) - z1 * Math.sin(globeRotX);
      let z2 = v.y * Math.sin(globeRotX) + z1 * Math.cos(globeRotX);
      const fov = 150;
      const scale = fov / (fov + z2);
      return {
        x: globeX + x1 * scale,
        y: globeY + y2 * scale,
        z: z2
      };
    });

    ctx.save();
    ctx.lineWidth = 0.5;
    for (const edge of this.globeEdges) {
      const p1 = projectedGlobe[edge[0]];
      const p2 = projectedGlobe[edge[1]];
      const avgZ = (p1.z + p2.z) / 2;
      // Fade back lines for high-end depth projection
      const alpha = 0.1 + 0.35 * (1 - (avgZ + 18) / 36);
      ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.restore();

    // 2. Draw continuous real-time ECG/heartbeat waveform line
    if (ecgW > 10) {
      if (!this.ecgPoints || this.ecgPoints.length !== Math.floor(ecgW)) {
        this.ecgPoints = new Array(Math.floor(ecgW)).fill(0);
      }
      
      const ecgLen = this.ecgPoints.length;
      const sweepProgress = (time * 65) % ecgLen;
      const currentIdx = Math.floor(sweepProgress);
      
      const tCycle = (time * 1.35) % 1.0; // ~81 BPM
      this.ecgPoints[currentIdx] = getECGValue(tCycle);
      
      ctx.save();
      ctx.lineWidth = 0.9;
      for (let x = 0; x < ecgLen - 1; x++) {
        let dist = currentIdx - x;
        if (dist < 0) dist += ecgLen;
        if (dist > ecgLen - 8) continue; // scan head gap
        
        const alpha = Math.max(0.02, 1 - dist / ecgLen);
        ctx.strokeStyle = `rgba(34, 197, 94, ${alpha * 0.9})`;
        
        const y1 = this.ecgPoints[x] || 0;
        const y2 = this.ecgPoints[x + 1] || 0;
        
        const px1 = ecgStartX + x;
        const py1 = ecgY - y1 * ecgMaxVal;
        const px2 = ecgStartX + x + 1;
        const py2 = ecgY - y2 * ecgMaxVal;
        
        ctx.beginPath();
        ctx.moveTo(px1, py1);
        ctx.lineTo(px2, py2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 3. Draw filled calculation throughput area chart
    this.throughputActivity = this.throughputActivity * 0.985 + 0.015 * 0.05;
    if (this.frameCount % 2 === 0) {
      const noise = (Math.random() - 0.5) * 0.02;
      const val = Math.max(0.02, Math.min(1.0, this.throughputActivity + noise));
      this.throughputHistory.push(val);
      if (this.throughputHistory.length > 40) {
        this.throughputHistory.shift();
      }
    }

    if (ecgW > 10) {
      const chartX = ecgStartX;
      const chartW = ecgW;
      const chartH = Math.min(14, h / 2 - 8);
      const chartY = h - chartH - 6;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(chartX, chartY + chartH);
      for (let i = 0; i < this.throughputHistory.length; i++) {
        const px = chartX + (i / (this.throughputHistory.length - 1)) * chartW;
        const py = chartY + chartH - (this.throughputHistory[i] * chartH);
        ctx.lineTo(px, py);
      }
      ctx.lineTo(chartX + chartW, chartY + chartH);
      ctx.closePath();

      const chartGrad = ctx.createLinearGradient(chartX, chartY, chartX, chartY + chartH);
      chartGrad.addColorStop(0, 'rgba(56, 189, 248, 0.1)');
      chartGrad.addColorStop(1, 'rgba(56, 189, 248, 0.0)');
      ctx.fillStyle = chartGrad;
      ctx.fill();

      ctx.beginPath();
      for (let i = 0; i < this.throughputHistory.length; i++) {
        const px = chartX + (i / (this.throughputHistory.length - 1)) * chartW;
        const py = chartY + chartH - (this.throughputHistory[i] * chartH);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.restore();
    }

    // 4. Telemetry stats table readouts
    const bdEl = document.getElementById('ap-ls-bd');
    const hgEl = document.getElementById('ap-ls-hg');
    const rulesEl = document.getElementById('ap-ls-rules');
    const swapEl = document.getElementById('ap-ls-swaps');
    const pctEl = document.getElementById('ap-prog-pct');

    const bdVal = bdEl ? bdEl.textContent : '0';
    const hgVal = hgEl ? hgEl.textContent : '0';
    const rulesVal = rulesEl ? rulesEl.textContent : '0';
    const swapsVal = swapEl ? swapEl.textContent : '0';
    const pctVal = pctEl ? pctEl.textContent : (this.phase === 'success' ? '100%' : '0%');

    ctx.save();
    ctx.font = '7.5px monospace';
    ctx.textBaseline = 'middle';

    const rowH = Math.min(11, (h - 16) / 5);
    const startY = 8 + rowH / 2;

    const labels = ['BD', 'HG', 'SWP', 'RULE', 'PCT'];
    const values = [bdVal, hgVal, swapsVal, rulesVal, pctVal];

    for (let i = 0; i < labels.length; i++) {
      const ry = startY + i * rowH;

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.04)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(tableX, ry + rowH / 2);
      ctx.lineTo(tableX + tableW, ry + rowH / 2);
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillText(labels[i], tableX, ry);

      ctx.textAlign = 'right';
      ctx.fillStyle = (i === 4) ? '#22c55e' : '#38bdf8';
      ctx.fillText(values[i], tableX + tableW, ry);
    }
    ctx.restore();
  }

  dispose() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.container) {
      this.container.innerHTML = '';
    }
    if (this.miniMapCanvas && this.miniMapCanvas.parentElement) {
      this.miniMapCanvas.parentElement.innerHTML = '';
    }
    this.cells.clear();
    this.nodeFx.clear();
    this.dataPackets = [];
    this.constellationParticles = [];
    this.coreNodes = [];
    this.globeVertices = [];
    this.globeEdges = [];
  }
}
