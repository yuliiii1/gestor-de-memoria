/* =========================================================
   GUARDIÁN DE LA MEMORIA — Memory Manager
   El jugador ES el gestor de memoria: coloca, libera, saca a
   disco y compacta procesos reales sobre una RAM que evoluciona.
   ========================================================= */

const MAX_LIVES = 3;
const TIME_LIMIT = 30; // segundos por situación
const CONFETTI_COLORS = ['#FF3E9A','#FFD23F','#31E3D6','#9B6BFF','#93FF5E','#FF8A3D'];
const MB_COLORS = ['a','b','c','d'];

/* ---------------- motor de memoria (compartido por los mundos) ---------------- */

function firstFitIdx(blocks, size){
  for(let i=0;i<blocks.length;i++) if(blocks[i].type==='hole' && blocks[i].size>=size) return i;
  return -1;
}
function nextFitIdx(blocks, size, pointer){
  const n = blocks.length;
  for(let step=0; step<n; step++){
    const i = (pointer+step) % n;
    if(blocks[i].type==='hole' && blocks[i].size>=size) return i;
  }
  return -1;
}
function bestFitIdx(blocks, size){
  let best=-1;
  blocks.forEach((b,i)=>{ if(b.type==='hole' && b.size>=size){ if(best===-1 || b.size<blocks[best].size) best=i; } });
  return best;
}
function worstFitIdx(blocks, size){
  let worst=-1;
  blocks.forEach((b,i)=>{ if(b.type==='hole' && b.size>=size){ if(worst===-1 || b.size>blocks[worst].size) worst=i; } });
  return worst;
}
function placeAt(blocks, idx, size, label, colorIdx){
  const hole = blocks[idx];
  const newProc = { type:'proc', size, label, colorIdx };
  if(hole.size === size){
    blocks.splice(idx,1,newProc);
  } else {
    blocks.splice(idx,1,newProc,{type:'hole', size:hole.size-size});
  }
}
function renderMemStrip(container, blocks){
  container.innerHTML = '';
  const strip = document.createElement('div');
  strip.className = 'memstrip';
  blocks.forEach((b,i) => {
    const el = document.createElement('div');
    let cls = 'seg ' + b.type;
    if(b.type === 'proc') cls += ' proc-' + MB_COLORS[(b.colorIdx!=null?b.colorIdx:0) % MB_COLORS.length];
    el.className = cls;
    el.style.flexGrow = b.size;
    el.style.flexBasis = '0';
    el.dataset.idx = i;
    if(b.type === 'hole') el.classList.add('drop-hole');
    el.innerHTML = (b.label || (b.type==='os' ? 'SO' : '')) + '<br>' + b.size + 'MB';
    strip.appendChild(el);
  });
  container.appendChild(strip);
  return strip;
}

/* ---- arrastrar y soltar genérico (mouse, touch y lápiz vía Pointer Events) ---- */
function makeDraggable(el, onDrop, dropSelector){
  dropSelector = dropSelector || '.drop-hole';
  let dragging = false;
  let offsetX = 0, offsetY = 0;
  let clone = null;
  let lastHover = null;
  el.style.touchAction = 'none';

  function clearHover(){
    if(lastHover){ lastHover.classList.remove('drag-over'); lastHover = null; }
  }

  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    clone = el.cloneNode(true);
    clone.removeAttribute('id');
    clone.classList.add('dragging-clone');
    clone.style.width = rect.width + 'px';
    clone.style.left = rect.left + 'px';
    clone.style.top = rect.top + 'px';
    document.body.appendChild(clone);
    el.style.opacity = '0.25';
  });

  window.addEventListener('pointermove', (e) => {
    if(!dragging || !clone) return;
    clone.style.left = (e.clientX - offsetX) + 'px';
    clone.style.top = (e.clientY - offsetY) + 'px';
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const dropEl = target ? target.closest(dropSelector) : null;
    if(dropEl !== lastHover){
      clearHover();
      if(dropEl){ dropEl.classList.add('drag-over'); lastHover = dropEl; }
    }
  });

  window.addEventListener('pointerup', (e) => {
    if(!dragging) return;
    dragging = false;
    el.style.opacity = '1';
    clearHover();
    if(clone){ clone.remove(); clone = null; }
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const dropEl = target ? target.closest(dropSelector) : null;
    onDrop(dropEl);
  });
}

/* ---------------- estado compartido de cada "mundo" con memoria propia ---------------- */
let fitBlocks = [];
let fitPointer = 0;
let swapBlocks = [];

function freshFitBlocks(){
  return [
    { type:'os', size:10, label:'SO' },
    { type:'proc', size:20, label:'A', colorIdx:0 },
    { type:'hole', size:15 },
    { type:'proc', size:30, label:'B', colorIdx:1 },
    { type:'hole', size:25 },
  ];
}

function makeFitSituation(algoName, computeFn, world){
  return {
    topic: algoName,
    tagText: world + ' — ' + algoName,
    tagClass: 'alloc',
    prompt: `Algoritmo activo: ${algoName}. Arrastrá el proceso entrante hasta el hueco que le corresponde según esta regla.`,
    context: null,
    setup(container, resolve){
      const jobSize = 8;
      const label = String.fromCharCode(69 + (fitBlocks.filter(b=>b.type==='proc').length - 2)); // E, F, G, H...
      const wrap = document.createElement('div');
      const incoming = document.createElement('div');
      incoming.className = 'incoming';
      const piece = document.createElement('div');
      piece.className = 'proc-piece';
      piece.textContent = jobSize + 'MB';
      incoming.innerHTML = 'Proceso entrante: ';
      incoming.appendChild(piece);
      container.appendChild(incoming);
      container.appendChild(wrap);
      renderMemStrip(wrap, fitBlocks);

      let correctIdx;
      if(algoName === 'NEXT FIT') correctIdx = computeFn(fitBlocks, jobSize, fitPointer);
      else correctIdx = computeFn(fitBlocks, jobSize);

      makeDraggable(piece, (holeEl) => {
        if(!holeEl) return;
        const idx = parseInt(holeEl.dataset.idx);
        const success = idx === correctIdx;
        if(success){
          placeAt(fitBlocks, idx, jobSize, label, (fitBlocks.filter(b=>b.type==='proc').length) % 4);
          fitPointer = idx + 1;
        }
        resolve(success, success
          ? `Correcto: ${algoName} elige ese hueco. El proceso ${label} (${jobSize}MB) quedó ubicado ahí.`
          : `Ese no era el hueco correcto para ${algoName}. Se resalta cuál era.`);
        if(!success){
          const correctEl = wrap.querySelector('[data-idx="'+correctIdx+'"]');
          if(correctEl) correctEl.classList.add('correct');
        }
      }, '.drop-hole');
    },
    timeoutMsg: `Se acabó el tiempo antes de ubicar el proceso con ${algoName}.`
  };
}

/* ---------------- las 17 situaciones, en 5 mundos + jefe final ---------------- */

const SITUATIONS = [

  // ===== MUNDO 1 — FUNDAMENTOS =====
  {
    topic: 'Gestión básica de memoria',
    tagText: 'Mundo 1 — Fundamentos',
    prompt: 'Esta es tu RAM. Hacé clic en TODOS los bloques libres (los que no tienen proceso) para demostrar que sabés distinguir ocupado de libre.',
    context: 'Ojo: si tocás un bloque ocupado por error, perdés la ronda.',
    setup(container, resolve){
      const blocks = [
        {type:'os', size:10, label:'SO'},
        {type:'proc', size:20, label:'A', colorIdx:0},
        {type:'hole', size:15},
        {type:'proc', size:30, label:'B', colorIdx:1},
        {type:'hole', size:25},
      ];
      const strip = renderMemStrip(container, blocks);
      const holeEls = [...strip.querySelectorAll('.seg.hole')];
      const procEls = [...strip.querySelectorAll('.seg.proc')];
      let remaining = holeEls.length;
      holeEls.forEach(el => {
        el.classList.add('zone-click');
        el.addEventListener('click', () => {
          if(el.dataset.done) return;
          el.dataset.done = '1';
          el.classList.add('correct');
          remaining--;
          if(remaining === 0) resolve(true, 'Identificaste los dos huecos libres. El gestor de memoria necesita saber esto exactamente en todo momento.');
        });
      });
      procEls.forEach(el => {
        el.classList.add('zone-click');
        el.addEventListener('click', () => {
          el.classList.add('wrong');
          resolve(false, 'Ese bloque estaba ocupado por un proceso — no era memoria libre.');
        });
      });
    },
    timeoutMsg: 'Se acabó el tiempo sin identificar todos los huecos libres.'
  },

  {
    topic: 'Monoprogramación',
    tagText: 'Mundo 1 — Fundamentos',
    prompt: 'Este sistema es monousuario: solo hay UN espacio para el programa de usuario. Cargá los 3 programas de la cola, uno a la vez.',
    context: 'Cada vez que cargues uno nuevo, el anterior se pierde de la memoria — así funcionaba la monoprogramación.',
    setup(container, resolve){
      const queue = ['P1','P2','P3'];
      let loaded = 0;
      container.innerHTML = `
        <div class="console-box">
          <div class="console-slot" id="monoSlot">— vacío —</div>
          <div class="gauge-label" id="monoQueue"></div>
          <button class="btn" id="monoLoadBtn">Cargar siguiente</button>
        </div>
      `;
      const slot = container.querySelector('#monoSlot');
      const queueLbl = container.querySelector('#monoQueue');
      function renderQueue(){
        const rest = queue.slice(loaded);
        queueLbl.textContent = 'Cola: ' + (rest.length ? rest.join(', ') : 'vacía');
      }
      renderQueue();
      container.querySelector('#monoLoadBtn').addEventListener('click', () => {
        if(loaded >= queue.length) return;
        slot.textContent = queue[loaded];
        slot.classList.remove('flash'); void slot.offsetWidth; slot.classList.add('flash');
        loaded++;
        renderQueue();
        if(loaded === queue.length){
          setTimeout(() => resolve(true, 'Cargaste los 3 programas, pero cada uno sobrescribió al anterior: solo corre uno a la vez. Eso es monoprogramación.'), 400);
        }
      });
    },
    timeoutMsg: 'No llegaste a cargar los 3 programas a tiempo.'
  },

  {
    topic: 'Multiprogramación',
    tagText: 'Mundo 1 — Fundamentos',
    prompt: 'Ahora el sistema soporta multiprogramación: podés tener más de un proceso a la vez, mientras entren en los 40MB libres.',
    context: 'Cargá procesos hasta tener al menos 2 procesos activos en simultáneo.',
    setup(container, resolve){
      const queue = [{n:'P1', s:15},{n:'P2', s:20},{n:'P3', s:10}];
      const freeSpace = 40;
      let used = 0, count = 0, idx = 0;
      container.innerHTML = `
        <div class="console-box">
          <div class="gauge-label">Memoria libre usada: <strong id="usedLbl">0</strong>/${freeSpace} MB</div>
          <div class="gauge-bar-outer"><div class="gauge-bar-inner" id="multiGauge" style="width:0%"></div></div>
          <div class="console-slot" id="multiSlots" style="min-height:44px;"></div>
          <button class="btn" id="multiLoadBtn">Cargar próximo proceso</button>
        </div>
      `;
      const usedLbl = container.querySelector('#usedLbl');
      const gauge = container.querySelector('#multiGauge');
      const slots = container.querySelector('#multiSlots');
      container.querySelector('#multiLoadBtn').addEventListener('click', () => {
        if(idx >= queue.length) return;
        const p = queue[idx];
        if(used + p.s > freeSpace){ idx++; return; }
        used += p.s; count++; idx++;
        usedLbl.textContent = used;
        gauge.style.width = Math.min(100, (used/freeSpace)*100) + '%';
        const chip = document.createElement('span');
        chip.className = 'proc-piece';
        chip.style.marginRight = '6px';
        chip.textContent = p.n;
        slots.appendChild(chip);
        if(count >= 2){
          setTimeout(() => resolve(true, `Lograste tener ${count} procesos activos a la vez: mientras uno espera E/S, otro usa la CPU. Eso es multiprogramación.`), 350);
        }
      });
    },
    timeoutMsg: 'No llegaste a tener 2 procesos activos a la vez.'
  },

  {
    topic: 'Particiones fijas',
    tagText: 'Mundo 1 — Fundamentos',
    prompt: 'Esta RAM está dividida en particiones FIJAS. Arrastrá el proceso a la partición más chica donde entre — no desperdicies una grande con un trabajo chico.',
    context: 'Proceso entrante: 12 MB.',
    setup(container, resolve){
      const lanes = [ {size:20}, {size:35}, {size:15} ];
      const jobSize = 12;
      let correctIdx = -1;
      lanes.forEach((l,i) => { if(l.size >= jobSize){ if(correctIdx===-1 || l.size < lanes[correctIdx].size) correctIdx = i; } });

      const incoming = document.createElement('div');
      incoming.className = 'incoming';
      const piece = document.createElement('div');
      piece.className = 'proc-piece';
      piece.textContent = jobSize + 'MB';
      incoming.innerHTML = 'Arrastrá: ';
      incoming.appendChild(piece);
      container.appendChild(incoming);

      const wrap = document.createElement('div');
      wrap.className = 'lane-row';
      lanes.forEach((l,i) => {
        const lane = document.createElement('div');
        lane.className = 'lane drop-hole';
        lane.dataset.idx = i;
        lane.innerHTML = 'Partición ' + (i+1) + '<br>' + l.size + ' MB';
        wrap.appendChild(lane);
      });
      container.appendChild(wrap);

      makeDraggable(piece, (laneEl) => {
        if(!laneEl) return;
        const idx = parseInt(laneEl.dataset.idx);
        const success = idx === correctIdx;
        resolve(success, success
          ? 'Esa era la partición más chica donde entraba: se desperdicia lo menos posible.'
          : 'Esa partición no era la correcta: o no entraba, o desperdiciabas una partición más grande.');
      }, '.drop-hole');
    },
    timeoutMsg: 'No llegaste a ubicar el proceso en la partición correcta.'
  },

  // ===== MUNDO 2 — CONTROL =====
  {
    topic: 'Utilización de CPU y grado de multiprogramación',
    tagText: 'Mundo 2 — Control',
    prompt: 'Cada proceso espera E/S el 80% del tiempo (p = 0,8). Sumá procesos hasta que la utilización de CPU llegue al 90%.',
    context: 'Utilización de CPU = 1 − p^n',
    setup(container, resolve){
      let n = 0;
      container.innerHTML = `
        <div class="console-box">
          <div class="gauge-label">Procesos en memoria: <strong id="nLbl">0</strong> — Utilización: <strong id="utilLbl">0%</strong></div>
          <div class="gauge-bar-outer"><div class="gauge-bar-inner" id="cpuGauge" style="width:0%"></div></div>
          <button class="btn" id="addProcBtn">+ Proceso</button>
        </div>
      `;
      const nLbl = container.querySelector('#nLbl');
      const utilLbl = container.querySelector('#utilLbl');
      const gauge = container.querySelector('#cpuGauge');
      container.querySelector('#addProcBtn').addEventListener('click', () => {
        n++;
        const util = 1 - Math.pow(0.8, n);
        nLbl.textContent = n;
        utilLbl.textContent = Math.round(util*100) + '%';
        gauge.style.width = Math.min(100, util*100) + '%';
        if(util >= 0.9){
          setTimeout(() => resolve(true, `Con n=${n} procesos, 1 − 0,8^${n} ≈ ${Math.round(util*100)}%. A mayor grado de multiprogramación, menos tiempo ocioso de CPU.`), 300);
        }
      });
    },
    timeoutMsg: 'No llegaste al 90% de utilización a tiempo.'
  },

  {
    topic: 'Reubicación',
    tagText: 'Mundo 2 — Control',
    prompt: 'Un programa fue enlazado asumiendo que arranca en la dirección 0. Su primera instrucción es CALL 100, y se cargó en la Partición 2 (arranca en 200MB). Hacé clic en la partición donde esa instrucción realmente termina apuntando.',
    context: null,
    setup(container, resolve){
      const parts = ['Partición 1\n(0–200MB)','Partición 2\n(200–400MB)','Partición 3\n(400–600MB)'];
      const correctIdx = 1;
      const strip = document.createElement('div');
      strip.className = 'memstrip';
      parts.forEach((p,i) => {
        const el = document.createElement('div');
        el.className = 'seg zone-click';
        el.style.flexGrow = 1;
        el.style.flexBasis = '0';
        el.innerHTML = p.replace('\n','<br>');
        el.addEventListener('click', () => {
          [...strip.children].forEach(c => c.style.pointerEvents = 'none');
          const success = i === correctIdx;
          el.classList.add(success ? 'correct' : 'wrong');
          resolve(success, success
            ? 'El programa se cargó en la Partición 2 (arranca en 200MB): CALL 100 se convierte en CALL 200MB+100.'
            : 'El programa se cargó en la Partición 2 (200MB en adelante) — ahí es donde termina apuntando.');
        });
        strip.appendChild(el);
      });
      container.appendChild(strip);
    },
    timeoutMsg: 'Se acabó el tiempo sin reubicar la dirección correctamente.'
  },

  {
    topic: 'Protección',
    tagText: 'Mundo 2 — Control',
    prompt: 'El Proceso A intenta leer una dirección que pertenece a la memoria del Proceso B.',
    context: 'Como gestor de memoria con protección por claves (como el IBM 360), ¿qué hacés?',
    setup(container, resolve){
      container.innerHTML = `
        <div class="permit-row">
          <button class="btn permit-btn allow" id="allowBtn">🟢 PERMITIR</button>
          <button class="btn permit-btn block" id="blockBtn">🔴 BLOQUEAR</button>
        </div>
      `;
      container.querySelector('#allowBtn').addEventListener('click', () => {
        resolve(false, 'Permitir el acceso rompe el aislamiento entre procesos — exactamente lo que la protección por claves del 360 evita.');
      });
      container.querySelector('#blockBtn').addEventListener('click', () => {
        resolve(true, 'Correcto: el hardware genera una excepción cuando la clave del proceso no coincide con el código de protección del bloque.');
      });
    },
    timeoutMsg: 'No reaccionaste a tiempo — el acceso indebido pasó sin bloquearse.'
  },

  // ===== MUNDO 3 — MEMORIA DINÁMICA =====
  {
    topic: 'Intercambio (Swapping)',
    tagText: 'Mundo 3 — Memoria dinámica',
    prompt: 'La RAM está completamente llena. El Proceso B está bloqueado esperando una E/S larga. Arrastralo a DISCO para liberar espacio.',
    context: 'Intercambiar (swapping) significa sacar el proceso ENTERO a disco.',
    setup(container, resolve){
      swapBlocks = [
        {type:'proc', size:20, label:'A', colorIdx:0},
        {type:'proc', size:25, label:'B', colorIdx:1},
        {type:'proc', size:15, label:'C', colorIdx:2},
        {type:'proc', size:20, label:'D', colorIdx:3},
      ];
      const stripWrap = document.createElement('div');
      container.appendChild(stripWrap);
      const strip = renderMemStrip(stripWrap, swapBlocks);
      const disk = document.createElement('div');
      disk.className = 'disk-zone';
      disk.textContent = '💾 DISCO';
      container.appendChild(disk);

      [...strip.querySelectorAll('.seg.proc')].forEach(procEl => {
        makeDraggable(procEl, (dropEl) => {
          if(!dropEl) return;
          const idx = parseInt(procEl.dataset.idx);
          const label = swapBlocks[idx].label;
          const success = label === 'B';
          if(success){
            swapBlocks.splice(idx, 1, {type:'hole', size: swapBlocks[idx].size});
            for(let i = swapBlocks.length-2; i>=0; i--){
              if(swapBlocks[i].type==='hole' && swapBlocks[i+1].type==='hole'){
                swapBlocks[i].size += swapBlocks[i+1].size;
                swapBlocks.splice(i+1,1);
              }
            }
          }
          resolve(success, success
            ? 'Sacaste al Proceso B a disco: ahora hay un hueco libre para cargar otra cosa.'
            : 'Ese no era el proceso bloqueado — sacar cualquiera al azar no resuelve el problema real.');
        }, '.disk-zone');
      });
    },
    timeoutMsg: 'No sacaste al proceso correcto a tiempo.'
  },

  {
    topic: 'Compactación',
    tagText: 'Mundo 3 — Memoria dinámica',
    prompt: 'Quedaron huecos chicos y separados. Llega un proceso de 30MB que no entra en ninguno solo, aunque sumados alcancen. Compactá la memoria para unificar el espacio libre.',
    context: 'Compactar mueve los procesos para juntar todos los huecos en uno solo.',
    setup(container, resolve){
      if(!swapBlocks.length || swapBlocks.filter(b=>b.type==='hole').length < 2){
        swapBlocks = [
          {type:'proc', size:20, label:'A', colorIdx:0},
          {type:'hole', size:15},
          {type:'proc', size:15, label:'C', colorIdx:2},
          {type:'hole', size:10},
          {type:'proc', size:20, label:'D', colorIdx:3},
        ];
      }
      const stripWrap = document.createElement('div');
      container.appendChild(stripWrap);
      renderMemStrip(stripWrap, swapBlocks);
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.style.marginTop = '14px';
      btn.textContent = '🧹 Compactar memoria';
      container.appendChild(btn);
      btn.addEventListener('click', () => {
        const procs = swapBlocks.filter(b => b.type==='proc');
        const totalHoles = swapBlocks.filter(b => b.type==='hole').reduce((a,b)=>a+b.size,0);
        swapBlocks = [...procs, {type:'hole', size: totalHoles}];
        renderMemStrip(stripWrap, swapBlocks);
        btn.disabled = true;
        setTimeout(() => resolve(true, 'Compactar junta todos los huecos en uno grande — pero en un sistema real cuesta bastante tiempo de CPU, por eso no se hace todo el tiempo.'), 500);
      });
    },
    timeoutMsg: 'No compactaste la memoria a tiempo.'
  },

  // ===== MUNDO 4 — ADMINISTRANDO LA MEMORIA =====
  {
    topic: 'Gestión con mapas de bits',
    tagText: 'Mundo 4 — Administrando la memoria',
    prompt: 'Esta RAM tiene 8 unidades de asignación. Tocá las unidades OCUPADAS para construir el mapa de bits correcto (1 = ocupado, 0 = libre) y después verificalo.',
    context: null,
    setup(container, resolve){
      const occupied = [1,1,1,0,0,1,0,1];
      container.innerHTML = `
        <div class="bit-visual" id="bitVisual"></div>
        <div class="bit-toggle-row" id="bitToggleRow"></div>
        <button class="btn" id="verifyBitsBtn" style="margin-top:14px;">Verificar mapa</button>
      `;
      const visual = container.querySelector('#bitVisual');
      occupied.forEach(v => {
        const c = document.createElement('div');
        c.className = 'bit-visual-cell' + (v ? ' occ' : '');
        visual.appendChild(c);
      });
      const row = container.querySelector('#bitToggleRow');
      const state8 = new Array(8).fill(0);
      occupied.forEach((_, i) => {
        const c = document.createElement('button');
        c.className = 'bit-toggle';
        c.textContent = '0';
        c.addEventListener('click', () => {
          state8[i] = state8[i] ? 0 : 1;
          c.textContent = state8[i];
          c.classList.toggle('on', !!state8[i]);
        });
        row.appendChild(c);
      });
      container.querySelector('#verifyBitsBtn').addEventListener('click', () => {
        const success = state8.every((v,i) => v === occupied[i]);
        resolve(success, success
          ? 'El mapa coincide: cada bit dice si esa unidad de asignación está libre (0) u ocupada (1).'
          : 'El mapa no coincidía con la memoria de arriba — revisá bloque por bloque.');
      });
    },
    timeoutMsg: 'No terminaste de construir el mapa de bits a tiempo.'
  },

  {
    topic: 'Gestión con listas enlazadas',
    tagText: 'Mundo 4 — Administrando la memoria',
    prompt: 'La memoria ahora se representa como una lista de nodos. Hacé clic en el nodo que es un HUECO (H), no un proceso (P).',
    context: null,
    setup(container, resolve){
      const nodes = [
        {type:'P', addr:0, len:20},
        {type:'P', addr:20, len:30},
        {type:'H', addr:50, len:15},
        {type:'P', addr:65, len:10},
      ];
      const row = document.createElement('div');
      row.className = 'node-row';
      nodes.forEach(n => {
        const el = document.createElement('div');
        el.className = 'node-box ' + (n.type==='H' ? 'node-hole' : 'node-proc');
        el.innerHTML = `[${n.type}, ${n.addr}, ${n.len}]`;
        el.addEventListener('click', () => {
          [...row.children].forEach(c => c.style.pointerEvents = 'none');
          const success = n.type === 'H';
          el.classList.add(success ? 'correct' : 'wrong');
          resolve(success, success
            ? 'Ese nodo es H (hueco): 15 unidades libres a partir de la dirección 50.'
            : 'Ese nodo era P (proceso), no un hueco.');
        });
        row.appendChild(el);
      });
      container.appendChild(row);
    },
    timeoutMsg: 'No identificaste el nodo hueco a tiempo.'
  },

  // ===== MUNDO 5 — EL DESAFÍO FINAL =====
  makeFitSituation('FIRST FIT', firstFitIdx, 'Mundo 5 — Desafío final'),
  makeFitSituation('NEXT FIT', nextFitIdx, 'Mundo 5 — Desafío final'),
  makeFitSituation('BEST FIT', bestFitIdx, 'Mundo 5 — Desafío final'),
  makeFitSituation('WORST FIT', worstFitIdx, 'Mundo 5 — Desafío final'),

  {
    topic: 'Quick Fit',
    tagText: 'Mundo 5 — Desafío final',
    prompt: 'Quick Fit mantiene listas separadas de huecos por tamaño frecuente. Arrastrá el proceso a la LISTA de su tamaño — no busques en toda la memoria.',
    context: 'Proceso entrante: 8 MB.',
    setup(container, resolve){
      const buckets = [4,8,12];
      const jobSize = 8;
      const correctIdx = buckets.indexOf(jobSize);

      const incoming = document.createElement('div');
      incoming.className = 'incoming';
      const piece = document.createElement('div');
      piece.className = 'proc-piece';
      piece.textContent = jobSize + 'MB';
      incoming.innerHTML = 'Arrastrá: ';
      incoming.appendChild(piece);
      container.appendChild(incoming);

      const row = document.createElement('div');
      row.className = 'bucket-row';
      buckets.forEach((b,i) => {
        const el = document.createElement('div');
        el.className = 'bucket drop-hole';
        el.dataset.idx = i;
        el.innerHTML = 'Lista<br>' + b + ' MB';
        row.appendChild(el);
      });
      container.appendChild(row);

      makeDraggable(piece, (bEl) => {
        if(!bEl) return;
        const idx = parseInt(bEl.dataset.idx);
        const success = idx === correctIdx;
        resolve(success, success
          ? 'Quick Fit va directo a la lista de huecos de 8MB: mucho más rápido que recorrer toda la memoria.'
          : 'Ese proceso corresponde a la lista de otro tamaño.');
      }, '.bucket');
    },
    timeoutMsg: 'No elegiste la lista correcta a tiempo.'
  },

  // ===== JEFE FINAL =====
  {
    topic: 'Jefe final — Memoria al límite',
    tagText: '👑 Jefe final',
    tagClass: 'alloc',
    prompt: 'Última prueba. La memoria está fragmentada y llega un proceso de 12MB. Elegí el algoritmo correcto para ubicarlo en el hueco más ajustado posible.',
    context: 'Huecos disponibles: 8MB, 22MB y 13MB.',
    setup(container, resolve){
      const bossBlocks = [
        {type:'os', size:10, label:'SO'},
        {type:'proc', size:20, label:'A', colorIdx:0},
        {type:'hole', size:8},
        {type:'proc', size:15, label:'B', colorIdx:1},
        {type:'hole', size:22},
        {type:'proc', size:10, label:'C', colorIdx:2},
        {type:'hole', size:13},
      ];
      const jobSize = 12;
      container.innerHTML = `<div id="bossStep1"></div><div id="bossStep2" style="display:none;"></div>`;
      const step1 = container.querySelector('#bossStep1');
      const step2 = container.querySelector('#bossStep2');
      const algos = ['FIRST FIT','NEXT FIT','BEST FIT','WORST FIT','QUICK FIT'];
      const algoRow = document.createElement('div');
      algoRow.className = 'algo-choice-row';
      algos.forEach(a => {
        const b = document.createElement('button');
        b.className = 'btn secondary';
        b.textContent = a;
        b.addEventListener('click', () => {
          if(a !== 'BEST FIT'){
            resolve(false, 'Ese no era el algoritmo pedido. Con huecos de 8, 22 y 13MB para un proceso de 12MB, Best Fit elige el más ajustado (13MB).');
            return;
          }
          step1.style.display = 'none';
          step2.style.display = 'block';
          const stripWrap = document.createElement('div');
          step2.appendChild(stripWrap);
          renderMemStrip(stripWrap, bossBlocks);
          const incoming = document.createElement('div');
          incoming.className = 'incoming';
          const piece = document.createElement('div');
          piece.className = 'proc-piece';
          piece.textContent = jobSize + 'MB';
          incoming.innerHTML = 'Arrastrá: ';
          incoming.appendChild(piece);
          step2.insertBefore(incoming, stripWrap);
          const correctIdx = bestFitIdx(bossBlocks, jobSize);
          makeDraggable(piece, (holeEl) => {
            if(!holeEl) return;
            const idx = parseInt(holeEl.dataset.idx);
            const success = idx === correctIdx;
            resolve(success, success
              ? '¡Sistema estabilizado! Ese hueco de 13MB era el ajuste más cercano a los 12MB pedidos.'
              : 'Ese hueco no era el más ajustado — Best Fit busca el más chico que aún así entre.');
          }, '.drop-hole');
        });
        algoRow.appendChild(b);
      });
      step1.appendChild(algoRow);
    },
    timeoutMsg: 'El sistema colapsó por falta de tiempo en el desafío final.'
  },
];

const TOTAL = SITUATIONS.length;
let autoAdvanceTimeout = null;

function clearAutoAdvance(){
  if(autoAdvanceTimeout){ clearTimeout(autoAdvanceTimeout); autoAdvanceTimeout = null; }
}

/* ---------------- estado del juego ---------------- */
let state, timerInterval;

function freshState(){
  return {
    index: 0,
    score: 0,
    streak: 0,
    lives: MAX_LIVES,
    timeLeft: TIME_LIMIT,
    answered: false,
    wrongTopics: [],
    results: new Array(TOTAL).fill(null),
    started: false,
    finished: false
  };
}

const app = document.getElementById('app');
const scoreDisplay = document.getElementById('scoreDisplay');
const livesBox = document.getElementById('livesBox');
const streakTag = document.getElementById('streakTag');
const timerWrap = document.getElementById('timerWrap');
const timerBar = document.getElementById('timerBar');
const progressStrip = document.getElementById('progressStrip');
const progressLabel = document.getElementById('progressLabel');
const progressCount = document.getElementById('progressCount');
const confettiWrap = document.getElementById('confettiWrap');
const coreStripWrap = document.getElementById('coreStripWrap');
const coreStrip = document.getElementById('coreStrip');

function buildCoreStrip(){
  coreStrip.innerHTML = '';
  for(let i=0;i<TOTAL;i++){
    const c = document.createElement('div');
    c.className = 'core-cell';
    c.id = 'core-cell-' + i;
    coreStrip.appendChild(c);
  }
}
function updateCoreStrip(){
  for(let i=0;i<TOTAL;i++){
    const c = document.getElementById('core-cell-' + i);
    if(!c) continue;
    c.classList.remove('correct','wrong','current');
    const r = state.results[i];
    if(r === 'correct') c.classList.add('correct');
    else if(r === 'wrong') c.classList.add('wrong');
    if(i === state.index && state.started && !state.finished) c.classList.add('current');
  }
}

function renderHud(){
  scoreDisplay.textContent = state.score;
  livesBox.innerHTML = '';
  for(let i=0;i<MAX_LIVES;i++){
    const chip = document.createElement('div');
    chip.className = 'life-chip' + (i < state.lives ? '' : ' lost');
    livesBox.appendChild(chip);
  }
  if(state.streak >= 2){
    streakTag.textContent = '\u{1F525} RACHA x' + state.streak;
    streakTag.classList.add('show');
  } else {
    streakTag.classList.remove('show');
  }
  updateCoreStrip();
}

function shakeLives(){
  livesBox.classList.remove('shake');
  void livesBox.offsetWidth;
  livesBox.classList.add('shake');
}

function startTimer(){
  clearInterval(timerInterval);
  state.timeLeft = TIME_LIMIT;
  timerWrap.style.display = 'block';
  updateTimerBar();
  timerInterval = setInterval(() => {
    state.timeLeft -= 0.2;
    if(state.timeLeft <= 0){
      state.timeLeft = 0;
      updateTimerBar();
      clearInterval(timerInterval);
      if(!state.answered) handleTimeout();
      return;
    }
    updateTimerBar();
  }, 200);
}
function updateTimerBar(){
  const pct = Math.max(0, (state.timeLeft / TIME_LIMIT) * 100);
  timerBar.style.width = pct + '%';
  timerBar.classList.remove('warn','danger');
  if(pct < 20) timerBar.classList.add('danger');
  else if(pct < 50) timerBar.classList.add('warn');
}
function stopTimer(){
  clearInterval(timerInterval);
  timerWrap.style.display = 'none';
}

function launchConfetti(){
  confettiWrap.innerHTML = '';
  for(let i=0;i<36;i++){
    const c = document.createElement('div');
    c.className = 'confetto';
    c.style.left = Math.random()*100 + '%';
    c.style.background = CONFETTI_COLORS[Math.floor(Math.random()*CONFETTI_COLORS.length)];
    c.style.animationDelay = (Math.random()*0.6) + 's';
    c.style.animationDuration = (1.8 + Math.random()*1.2) + 's';
    confettiWrap.appendChild(c);
  }
  setTimeout(() => { confettiWrap.innerHTML = ''; }, 3200);
}

/* ---------------- pantallas ---------------- */

function renderStart(){
  stopTimer();
  clearAutoAdvance();
  progressStrip.style.display = 'none';
  coreStripWrap.style.display = 'none';
  livesBox.innerHTML = '';
  scoreDisplay.textContent = '0';
  streakTag.classList.remove('show');
  confettiWrap.innerHTML = '';
  app.innerHTML = `
    <div class="screen">
      <h1>MEMORY<br>MANAGER</h1>
      <p>Sos el gestor de memoria del sistema operativo. Los procesos llegan y necesitan un lugar en la RAM — vos decidís dónde colocarlos, cuándo sacarlos a disco, cuándo compactar. Tenés ${MAX_LIVES} vidas. ¿Podés mantener el sistema en pie?</p>
      <div class="btn-row">
        <button class="btn secondary" id="toInstructions">Ver instrucciones</button>
        <button class="btn" id="startBtn">Jugar ahora</button>
      </div>
    </div>
  `;
  document.getElementById('toInstructions').addEventListener('click', renderInstructions);
  document.getElementById('startBtn').addEventListener('click', beginGame);
}

function renderInstructions(){
  app.innerHTML = `
    <div class="screen">
      <h2>INSTRUCCIONES</h2>
      <ul class="rules-list">
        <li><span class="ico">♥</span><span class="txt">Empezás con ${MAX_LIVES} vidas. Cada error o cada vez que se agote el tiempo te cuesta una vida.</span></li>
        <li><span class="ico">$</span><span class="txt">Cada acierto suma puntos, y si encadenás aciertos ganás un bonus de racha.</span></li>
        <li><span class="ico">▦</span><span class="txt">No hay preguntas de opción múltiple: en cada situación vas a <strong>operar la memoria de verdad</strong> — arrastrar procesos a huecos o particiones, sacarlos a disco, compactar, construir un mapa de bits, elegir un algoritmo y aplicarlo.</span></li>
        <li><span class="ico">🗺</span><span class="txt">El juego tiene 5 mundos (Fundamentos, Control, Memoria dinámica, Administración, Desafío final) y termina con un jefe final que combina todo.</span></li>
        <li><span class="ico">⧗</span><span class="txt">Cada situación tiene un tiempo límite — la barra de arriba se va agotando.</span></li>
        <li><span class="ico">i</span><span class="txt">Después de cada acción vas a ver de inmediato si funcionó o no, con una explicación breve.</span></li>
        <li><span class="ico">✓</span><span class="txt">Si superás las ${TOTAL} situaciones sin quedarte sin vidas, ganás. Si tus vidas llegan a 0 antes, el sistema colapsa.</span></li>
      </ul>
      <div class="btn-row">
        <button class="btn" id="startBtn2">Empezar</button>
        <button class="btn secondary" id="backBtn">Volver</button>
      </div>
    </div>
  `;
  document.getElementById('startBtn2').addEventListener('click', beginGame);
  document.getElementById('backBtn').addEventListener('click', renderStart);
}

function beginGame(){
  state = freshState();
  state.started = true;
  fitBlocks = freshFitBlocks();
  fitPointer = 0;
  swapBlocks = [];
  coreStripWrap.style.display = 'block';
  buildCoreStrip();
  renderHud();
  renderSituation();
}

function renderSituation(){
  state.answered = false;
  clearAutoAdvance();
  const s = SITUATIONS[state.index];
  progressStrip.style.display = 'flex';
  progressLabel.textContent = s.topic;
  progressCount.textContent = (state.index+1) + '/' + TOTAL;
  updateCoreStrip();

  app.innerHTML = `
    <div class="card">
      <span class="round-tag ${s.tagClass || ''}">${s.tagText || ''}</span>
      <p class="prompt">${s.prompt}</p>
      ${s.context ? `<div class="context-note">${s.context}</div>` : ''}
      <div id="situationBody"></div>
      <div class="explain" id="explain"></div>
      <div class="next-row" id="nextRow" style="display:none;"><button class="btn" id="nextBtn"></button></div>
    </div>
  `;
  const body = document.getElementById('situationBody');
  s.setup(body, resolveSituation);
  startTimer();
}

function lockRound(){
  state.answered = true;
  stopTimer();
}

function applyResult(isCorrect, topic){
  state.results[state.index] = isCorrect ? 'correct' : 'wrong';
  if(isCorrect){
    state.streak++;
    const bonus = 100 + Math.max(0, state.streak-1) * 20;
    state.score += bonus;
  } else {
    state.streak = 0;
    state.lives--;
    state.wrongTopics.push(topic);
    shakeLives();
  }
  renderHud();
}

function showExplain(isCorrect, text){
  const el = document.getElementById('explain');
  el.className = 'explain show ' + (isCorrect ? 'ok' : 'bad');
  el.innerHTML = `<strong>${isCorrect ? '✔ Funcionó.' : '✘ No funcionó.'}</strong> ${text}`;
}

const AUTO_ADVANCE_MS = 3800;

function showNext(){
  const row = document.getElementById('nextRow');
  row.style.display = 'flex';
  const btn = document.getElementById('nextBtn');
  let action;
  if(state.lives <= 0){
    btn.textContent = 'Ver resultado';
    action = renderDefeat;
  } else if(state.index === TOTAL-1){
    btn.textContent = 'Ver resultado';
    action = renderVictory;
  } else {
    btn.textContent = 'Siguiente →';
    action = () => { state.index++; renderSituation(); };
  }

  const bar = document.createElement('div');
  bar.className = 'auto-advance-bar';
  btn.appendChild(bar);
  requestAnimationFrame(() => {
    bar.style.transitionDuration = AUTO_ADVANCE_MS + 'ms';
    bar.style.width = '0%';
  });

  function trigger(){ clearAutoAdvance(); action(); }
  btn.addEventListener('click', trigger);
  autoAdvanceTimeout = setTimeout(trigger, AUTO_ADVANCE_MS);
}

function resolveSituation(success, feedback){
  if(state.answered) return;
  lockRound();
  applyResult(success, SITUATIONS[state.index].topic);
  showExplain(success, feedback);
  showNext();
}

function handleTimeout(){
  if(state.answered) return;
  const s = SITUATIONS[state.index];
  resolveSituation(false, '¡Se acabó el tiempo! ' + (s.timeoutMsg || ''));
}

function renderVictory(){
  stopTimer();
  clearAutoAdvance();
  state.finished = true;
  progressStrip.style.display = 'none';
  coreStripWrap.style.display = 'none';
  let msg;
  if(state.lives === MAX_LIVES) msg = 'Ni un solo hueco desperdiciado. Gestión de memoria impecable.';
  else if(state.lives === 2) msg = 'El sistema se mantuvo estable, con algún que otro susto.';
  else msg = 'Por poco no colapsa el sistema — la memoria quedó bastante fragmentada.';
  app.innerHTML = `
    <div class="screen">
      <h2>¡SISTEMA ESTABLE!</h2>
      <div class="big-score">${state.score} PTS</div>
      <p class="lead">Vidas restantes: ${state.lives}/${MAX_LIVES}</p>
      <p>${msg}</p>
      ${state.wrongTopics.length ? `
        <p style="margin-bottom:6px;color:var(--white);"><strong>Repasá antes del próximo turno:</strong></p>
        <ul class="review-list">${[...new Set(state.wrongTopics)].map(t=>`<li>▸ ${t}</li>`).join('')}</ul>
      ` : ''}
      <div class="btn-row">
        <button class="btn" id="retryBtn">Jugar de nuevo</button>
      </div>
    </div>
  `;
  document.getElementById('retryBtn').addEventListener('click', renderStart);
  launchConfetti();
}

function renderDefeat(){
  stopTimer();
  clearAutoAdvance();
  state.finished = true;
  progressStrip.style.display = 'none';
  coreStripWrap.style.display = 'none';
  app.innerHTML = `
    <div class="screen">
      <h2>⚠ MEMORIA LLENA ⚠</h2>
      <div class="big-score" style="color:var(--red); text-shadow:0 0 24px rgba(255,78,99,0.55), 3px 3px 0 var(--red-dk);">${state.score} PTS</div>
      <p class="lead">Llegaste a la situación ${state.index+1} de ${TOTAL}</p>
      <p>Te quedaste sin vidas. El sistema colapsó — hora de repasar el capítulo.</p>
      ${state.wrongTopics.length ? `
        <p style="margin-bottom:6px;color:var(--white);"><strong>Repasá estos temas:</strong></p>
        <ul class="review-list">${[...new Set(state.wrongTopics)].map(t=>`<li>▸ ${t}</li>`).join('')}</ul>
      ` : ''}
      <div class="btn-row">
        <button class="btn" id="retryBtn">Reintentar</button>
      </div>
    </div>
  `;
  document.getElementById('retryBtn').addEventListener('click', renderStart);
}

renderStart();