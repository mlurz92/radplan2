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
      background: transparent;
      padding: 24px;
      perspective: 1200px;
    }
    .ng-matrix-grid {
      display: grid;
      width: 100%;
      height: 100%;
      grid-auto-rows: 1fr;
      will-change: transform;
      transform-style: preserve-3d;
      transition: transform 0.8s cubic-bezier(0.23, 1, 0.32, 1);
    }
    .ng-flat-cell {
      border-radius: 10px;
      position: relative;
      background: rgba(15, 23, 42, 0.4);
      backdrop-filter: blur(4px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 
        0 4px 6px rgba(0, 0, 0, 0.3),
        inset 0 1px 1px rgba(255, 255, 255, 0.05);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      will-change: transform, background-color, box-shadow, border-color;
      transform-style: preserve-3d;
      transition: 
        transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), 
        background-color 0.3s ease, 
        box-shadow 0.3s ease, 
        border-color 0.3s ease;
      backface-visibility: hidden;
    }
    .ng-flat-cell.rest {
      transform: translateZ(0) rotateX(4deg) rotateY(-4deg);
    }
    .ng-flat-cell.pulse {
      transform: translateZ(40px) scale(1.05) rotateX(0deg) rotateY(0deg);
      z-index: 50;
      background: rgba(15, 23, 42, 0.7);
      border-color: var(--pulse-color, rgba(56, 189, 248, 0.4));
      box-shadow: 
        0 15px 35px rgba(0, 0, 0, 0.5),
        0 0 20px var(--pulse-color, transparent);
    }
    .ng-flat-cell.error {
      transform: translateZ(20px) rotateX(-10deg) rotateY(15deg);
      background: rgba(127, 29, 29, 0.4);
      border-color: #ef4444;
      box-shadow: 0 10px 25px rgba(239, 68, 68, 0.3);
    }
    .ng-day-number {
      position: absolute;
      top: 6px;
      left: 8px;
      font-family: var(--font-mono, monospace);
      font-size: 11px;
      font-weight: 800;
      color: rgba(255, 255, 255, 0.2);
      pointer-events: none;
      z-index: 5;
    }
    .ng-slots-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 4px;
      gap: 4px;
      margin-top: 18px;
    }
    .ng-slot {
      flex: 1;
      position: relative;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.03);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
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
      font-weight: 900;
      color: rgba(255, 255, 255, 0.1);
      letter-spacing: 0.1em;
    }
    .ng-slot.active-d {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.3);
      box-shadow: inset 0 0 10px rgba(239, 68, 68, 0.1);
    }
    .ng-slot.active-hg {
      background: rgba(14, 165, 233, 0.15);
      border-color: rgba(14, 165, 233, 0.3);
      box-shadow: inset 0 0 10px rgba(14, 165, 233, 0.1);
    }
    .ng-slot-emp {
      font-family: var(--font-mono, monospace);
      font-size: 11px;
      font-weight: 800;
      color: transparent;
      text-align: center;
      letter-spacing: 0.02em;
      transition: all 0.3s ease;
      transform: translateZ(5px);
    }
    .ng-slot.has-val .ng-slot-emp {
      color: #fff;
      text-shadow: 0 0 8px currentColor;
    }
    .ng-slot.is-pulsing {
      background: rgba(255, 255, 255, 0.1);
      box-shadow: 0 0 15px var(--pulse-color);
    }
  `;
  document.head.appendChild(style);
}

export class NeuralGraph {
  constructor(container) {
    this.container = container;
    this.cells = new Map();
    this.employees = [];
    this.daysCount = 0;
    this.phase = 'init';
    this.basePhase = 'init';
    this.miniMapCanvas = null;
    this.miniMapCtx = null;
    this.pulses = [];
    this.animId = null;
    this.resizeObserver = null;
    this.gridFloat = null;
    
    injectStyles();
    this.buildDOM();
    this.setupResizeObserver();
  }

  buildDOM() {
    this.container.innerHTML = '';
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'ng-container';
    this.gridFloat = document.createElement('div');
    this.gridFloat.className = 'ng-matrix-grid';
    
    this.wrapper.appendChild(this.gridFloat);
    this.container.appendChild(this.wrapper);
  }

  setupResizeObserver() {
    this.resizeObserver = new ResizeObserver(() => {
      this.resizeMiniMap();
    });
    this.resizeObserver.observe(this.container);
  }

  initData(daysCount, employees) {
    this.daysCount = daysCount;
    this.employees = employees;
    this.gridFloat.innerHTML = '';
    this.cells.clear();

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
        dSlot, dEmp, 
        hgSlot, hgEmp 
      });
    }
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
    this.startLoop();
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
    this.miniMapCtx.scale(dpr, dpr);
  }

  getPhaseColor(alpha = 1) {
    const colors = {
      init: `rgba(14, 165, 233, ${alpha})`,
      greedy: `rgba(245, 158, 11, ${alpha})`,
      hg: `rgba(56, 189, 248, ${alpha})`,
      deep: `rgba(168, 85, 247, ${alpha})`,
      success: `rgba(34, 197, 94, ${alpha})`,
      error: `rgba(239, 68, 68, ${alpha})`
    };
    return colors[this.phase] || colors.init;
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
    const surnamePrefixes = ['el','al','van','von','de','le','la','di','lo','del','dal','bin','ben','abu'];
    const firstPartLower = parts[0].toLowerCase();
    
    if (surnamePrefixes.includes(firstPartLower)) {
      return parts.join('').substring(0, 3).toUpperCase();
    }
    const surname = parts[parts.length - 1];
    return surname.substring(0, 3).toUpperCase();
  }

  pulseCell(dayIdx, empId, isActive, isError = false, dutyType = "D") {
    const cellData = this.cells.get(dayIdx);
    if (!cellData) return;
    
    const { el, dSlot, dEmp, hgSlot, hgEmp } = cellData;
    const targetSlot = dutyType === "HG" ? hgSlot : dSlot;
    const targetEmp = dutyType === "HG" ? hgEmp : dEmp;

    if (empId && empId !== "SWAP") {
      targetEmp.textContent = this.getAbbreviation(empId);
      targetSlot.classList.add('has-val');
    } else if (empId === "SWAP") {
      targetEmp.textContent = "SWP";
      targetSlot.classList.add('has-val');
    }

    if (isActive) {
      const color = isError ? 'rgba(239, 68, 68, 0.4)' : this.getPhaseColor(0.4);
      const borderColor = isError ? 'rgba(239, 68, 68, 0.9)' : this.getPhaseColor(0.9);
      
      el.classList.remove('rest');
      el.classList.add(isError ? 'error' : 'pulse');
      
      el.style.setProperty('--pulse-color', borderColor);
      targetSlot.classList.add('is-pulsing');
      targetSlot.style.setProperty('--pulse-color', borderColor);

      if (dutyType === "HG") {
        targetSlot.classList.add('active-hg');
        targetEmp.style.color = '#fff';
      } else {
        targetSlot.classList.add('active-d');
        targetEmp.style.color = '#fff';
      }
    } else {
      el.classList.remove('pulse', 'error');
      el.classList.add('rest');
      
      targetSlot.classList.remove('is-pulsing', 'active-hg', 'active-d');
      
      if (dutyType === "HG") {
        targetEmp.style.color = targetSlot.classList.contains('has-val') ? '#0EA5E9' : 'transparent';
      } else {
        targetEmp.style.color = targetSlot.classList.contains('has-val') ? '#EF4444' : 'transparent';
      }

      if (empId === "SWAP") {
        targetEmp.textContent = "";
        targetSlot.classList.remove('has-val');
      }
    }
  }

  fireMiniMapPulse(isError = false) {
    this.pulses.push({
      progress: 0,
      color: isError ? 'rgba(239, 68, 68, 1)' : this.getPhaseColor(1),
      speed: 0.05 + Math.random() * 0.05,
      direction: Math.random() > 0.5 ? 1 : -1
    });
  }

  triggerSwap(dayIdx, oldEmpId, newEmpId, dutyType = "D") {
    this.pulseCell(dayIdx, "SWAP", true, false, dutyType);
    this.fireMiniMapPulse();
    
    setTimeout(() => {
      if (this.phase !== 'success') {
        this.pulseCell(dayIdx, newEmpId, false, false, dutyType);
      }
    }, 450);
  }

  triggerAssignment(dayIdx, empId, dutyType = "D") {
    this.pulseCell(dayIdx, empId, true, false, dutyType);
    this.fireMiniMapPulse();
    
    setTimeout(() => {
      if (this.phase !== 'success') {
        this.pulseCell(dayIdx, empId, false, false, dutyType);
      }
    }, 450);
  }

  triggerError(dayIdx, empId, dutyType = "D") {
    if (this.phase !== 'error') {
      this.basePhase = this.phase;
    }
    this.phase = 'error';
    this.pulseCell(dayIdx, empId, true, true, dutyType);
    this.fireMiniMapPulse(true);
    
    setTimeout(() => {
      if (this.phase === 'error') {
        this.phase = this.basePhase || 'init';
      }
      this.pulseCell(dayIdx, empId, false, false, dutyType);
    }, 350);
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
            if (data.duty === "D") {
               cellData.dEmp.textContent = this.getAbbreviation(emp);
               cellData.dSlot.classList.add('has-val');
               cellData.dEmp.style.color = '#EF4444';
            }
            if (data.duty === "HG") {
               cellData.hgEmp.textContent = this.getAbbreviation(emp);
               cellData.hgSlot.classList.add('has-val');
               cellData.hgEmp.style.color = '#0EA5E9';
            }
          }
        }
      }
    }

    let delay = 0;
    for (const [dayIdx, cellData] of this.cells.entries()) {
      if (cellData.dSlot.classList.contains('has-val') || cellData.hgSlot.classList.contains('has-val')) {
        setTimeout(() => {
          cellData.el.classList.remove('rest');
          cellData.el.classList.add('pulse');
          cellData.el.style.setProperty('--pulse-color', this.getPhaseColor(0.9));
        }, delay);
        
        setTimeout(() => {
          cellData.el.classList.remove('pulse');
          cellData.el.classList.add('rest');
        }, delay + 700);
        delay += 20;
      }
    }
    
    for (let p = 0; p < 20; p++) {
      setTimeout(() => this.fireMiniMapPulse(), p * 50);
    }
  }

  startLoop() {
    if (this.animId) cancelAnimationFrame(this.animId);
    const loop = () => {
      this.renderMiniMap();
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  renderMiniMap() {
    if (!this.miniMapCtx || !this.miniMapCanvas.parentElement) return;
    
    const ctx = this.miniMapCtx;
    const parent = this.miniMapCanvas.parentElement;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    const pi2 = Math.PI * 2;

    ctx.fillStyle = '#040A15';
    ctx.fillRect(0, 0, w, h);

    const padX = 30;
    const lineY = h / 2;
    const lineLen = w - padX * 2;

    ctx.beginPath();
    ctx.moveTo(padX, lineY);
    ctx.lineTo(w - padX, lineY);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();

    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.progress += p.speed;

      if (p.progress >= 1) {
        this.pulses.splice(i, 1);
        continue;
      }

      const x = p.direction === 1 
        ? padX + lineLen * p.progress 
        : (w - padX) - lineLen * p.progress;

      ctx.beginPath();
      ctx.arc(x, lineY, 3, 0, pi2);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.beginPath();
    ctx.arc(padX, lineY, 4, 0, pi2);
    ctx.arc(w - padX, lineY, 4, 0, pi2);
    ctx.fillStyle = '#10172A';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = this.getPhaseColor(0.9);
    ctx.stroke();
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
    this.pulses = [];
  }
}