// Title skyline, pause controls, and outcome overlays.
function addStyle() {
  const style = document.createElement('style');
  style.textContent = [
    '.vb-skyline{position:absolute;inset:0;width:100%;height:100%;opacity:.9}',
    '.screen{overflow:hidden}',
    '.screen .card{position:relative;z-index:1}',
    '.vb-menu-actions{display:flex;flex-direction:column;align-items:center;gap:10px;margin-top:18px}',
    '.vb-menu-secondary{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.28);color:#fff2dc}',
    '.vb-controls{display:grid;grid-template-columns:1fr 1fr;gap:7px 18px;text-align:left;margin:19px auto 0;max-width:390px;color:#c9cfdb;font-size:11px}',
    '.vb-controls b{color:#fff1dc}',
    '.vb-save-info{margin:16px 0 0;color:#aab4c2;font-size:11px;line-height:1.6}',
    '.vb-outcome{position:fixed;inset:0;display:grid;place-items:center;background:rgba(8,10,20,.78);z-index:5}',
    '.vb-outcome[hidden]{display:none}',
    '.vb-outcome-card{width:min(520px,calc(100vw - 36px));padding:42px;background:rgba(13,15,27,.92);border:1px solid rgba(255,210,166,.36);text-align:center;box-shadow:0 20px 90px rgba(0,0,0,.55)}',
    '.vb-outcome-card h2{font-size:48px;line-height:1;margin:12px 0}',
    '.vb-outcome-card p{color:#ead5c5;margin:12px 0 24px}',
    '.vb-outcome-card .eyebrow{color:#62e3de;letter-spacing:.25em;font-size:11px}',
    '.vb-control-sheet[hidden]{display:none}',
    '.vb-control-sheet{padding-top:16px;border-top:1px solid rgba(255,255,255,.12)}',
    '.vb-menu-actions button:focus-visible,.screen button:focus-visible{outline:2px solid #62e3dc;outline-offset:4px}',
    '.vb-skyline{pointer-events:none}',
  ].join('');
  document.head.append(style);
}

function createButton(label, parent, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.className = className;
  button.setAttribute('aria-label', label);
  parent.append(button);
  return button;
}

function focusFirstButton(screen) {
  screen.querySelector('button')?.focus();
}

function createControlSheet(parent) {
  const controls = document.createElement('div');
  controls.className = 'vb-controls vb-control-sheet';
  const entries = [
    ['W A S D', 'Move / steer'],
    ['SHIFT', 'Sprint'],
    ['SPACE', 'Jump / handbrake'],
    ['E', 'Enter or exit vehicle'],
    ['1 2 3', 'Select weapon'],
    ['N', 'Change radio'],
    ['T', 'Toggle day cycle'],
    ['Y', 'Toggle rain'],
    ['H', 'Horn'],
    ['R', 'Reload'],
    ['P / ESC', 'Pause'],
  ];
  for (const [key, label] of entries) {
    const line = document.createElement('div');
    const bold = document.createElement('b');
    bold.textContent = key;
    line.append(bold, document.createTextNode('  ' + label));
    controls.append(line);
  }
  parent.append(controls);
  return controls;
}

function createSkyline(screen) {
  const canvas = document.createElement('canvas');
  canvas.className = 'vb-skyline';
  canvas.setAttribute('aria-hidden', 'true');
  screen.prepend(canvas);
  const context = canvas.getContext('2d');
  const buildings = [];
  let width = 0;
  let height = 0;
  let time = 0;
  let animation = 0;
  let resizeObserver = null;
  let stopped = false;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    buildings.length = 0;
    for (let x = -8; x < width + 16; x += 24) {
      const seed = Math.abs(Math.sin(x * 17.31) * 43758.5453) % 1;
      buildings.push({ x, width: 13 + seed * 18, height: 48 + seed * height * 0.34, seed });
    }
  }

  function paint(now) {
    if (stopped) return;
    time = now * 0.001;
    context.clearRect(0, 0, width, height);
    const sky = context.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#172038');
    sky.addColorStop(0.52, '#81506a');
    sky.addColorStop(1, '#ff9a77');
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);
    drawSun();
    drawBuildings();
    drawWaterline();
    animation = requestAnimationFrame(paint);
  }

  function drawSun() {
    const sunX = width * 0.75;
    const sunY = height * 0.4 + Math.sin(time * 0.15) * 12;
    const glow = context.createRadialGradient(sunX, sunY, 8, sunX, sunY, height * 0.33);
    glow.addColorStop(0, 'rgba(255,212,155,.85)');
    glow.addColorStop(1, 'rgba(255,127,138,0)');
    context.fillStyle = glow;
    context.fillRect(sunX - height * 0.4, sunY - height * 0.4, height * 0.8, height * 0.8);
    context.fillStyle = '#ffd29d';
    context.beginPath();
    context.arc(sunX, sunY, Math.max(22, height * 0.075), 0, Math.PI * 2);
    context.fill();
  }

  function drawBuildings() {
    const baseY = height * 0.82;
    for (const building of buildings) {
      const drift = Math.sin(time * 0.16 + building.seed * 8) * 3;
      const x = building.x + drift;
      context.fillStyle = building.seed > 0.6 ? '#20243a' : '#29263d';
      context.fillRect(x, baseY - building.height, building.width, building.height);
      drawWindows(x, baseY - building.height, building.width, building.height, building.seed);
      if (building.seed > 0.88) {
        context.fillStyle = '#ff64a2';
        context.fillRect(x + building.width * 0.2, baseY - building.height - 4, building.width * 0.6, 2);
      }
    }
  }

  function drawWindows(x, y, buildingWidth, buildingHeight, seed) {
    const columns = Math.floor(buildingWidth / 7);
    const rows = Math.floor(buildingHeight / 14);
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const lit = (row * 11 + column * 7 + Math.floor(seed * 90)) % 4 !== 0;
        if (lit) {
          context.fillStyle = 'rgba(255,197,133,.72)';
          context.fillRect(x + 3 + column * 7, y + 6 + row * 14, 2, 4);
        }
      }
    }
  }

  function drawWaterline() {
    const waterY = height * 0.82;
    const gradient = context.createLinearGradient(0, waterY, 0, height);
    gradient.addColorStop(0, 'rgba(23,101,119,.56)');
    gradient.addColorStop(1, 'rgba(7,31,54,.92)');
    context.fillStyle = gradient;
    context.fillRect(0, waterY, width, height - waterY);
    context.strokeStyle = 'rgba(130,228,218,.2)';
    context.lineWidth = 1;
    for (let line = 0; line < 8; line += 1) {
      const y = waterY + 7 + line * 8;
      context.beginPath();
      context.moveTo(width * 0.46 + Math.sin(time + line) * 8, y);
      context.lineTo(width * 0.98, y + Math.sin(time * 0.5 + line) * 2);
      context.stroke();
    }
  }

  resize();
  if (globalThis.ResizeObserver) {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(screen);
  } else {
    window.addEventListener('resize', resize);
  }
  animation = requestAnimationFrame(paint);
  return {
    stop() {
      stopped = true;
      cancelAnimationFrame(animation);
      resizeObserver?.disconnect();
    },
  };
}

function makeOutcome(kind) {
  const screen = document.createElement('section');
  screen.className = 'vb-outcome';
  screen.hidden = true;
  const card = document.createElement('div');
  card.className = 'vb-outcome-card';
  const eyebrow = document.createElement('div');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'VISTA BAY COUNTY';
  const title = document.createElement('h2');
  title.textContent = kind === 'wasted' ? 'Wasted' : 'Mission complete';
  title.setAttribute('aria-live', 'polite');
  const detail = document.createElement('p');
  detail.textContent = kind === 'wasted' ? 'The bay will still be here tomorrow.' : 'A little more room to breathe.';
  card.append(eyebrow, title, detail);
  const button = createButton('Return to the City', card);
  screen.append(card);
  document.body.append(screen);
  return { screen, button };
}

/** Builds menu content and links buttons to the game mode callbacks. */
export function createMenus(callbacks, saveState) {
  addStyle();
  const titleScreen = document.getElementById('title');
  const pauseScreen = document.getElementById('pause');
  const bustScreen = document.getElementById('busted');
  const shotMode = new URLSearchParams(window.location.search).has('shot');
  const skyline = shotMode ? { stop() {} } : createSkyline(titleScreen);
  const titleCard = titleScreen.querySelector('.card');
  const titleControls = createControlSheet(titleCard);
  titleControls.hidden = true;
  const titleStart = document.getElementById('start');
  titleStart.removeEventListener('click', callbacks.start);
  const titleActionRow = document.createElement('div');
  titleActionRow.className = 'vb-menu-actions';
  titleStart.replaceWith(titleActionRow);
  titleActionRow.append(titleStart);
  const titleControlButton = createButton('Controls', titleActionRow, 'vb-menu-secondary');
  titleStart.addEventListener('click', callbacks.start);
  titleControlButton.addEventListener('click', () => {
    titleControls.hidden = !titleControls.hidden;
  });
  const pauseCard = pauseScreen.querySelector('.card');
  const oldPauseText = pauseCard.querySelector('.subtitle');
  if (oldPauseText) {
    oldPauseText.textContent = 'The tide can wait.';
  }
  const pauseActions = document.createElement('div');
  pauseActions.className = 'vb-menu-actions';
  const resume = createButton('Back to Vista Bay', pauseActions);
  const restart = createButton('Restart City', pauseActions, 'vb-menu-secondary');
  const toggleControls = createButton('Controls', pauseActions, 'vb-menu-secondary');
  pauseCard.append(pauseActions);
  const pauseControls = createControlSheet(pauseCard);
  pauseControls.hidden = true;
  const saveInfo = document.createElement('div');
  saveInfo.className = 'vb-save-info';
  pauseCard.append(saveInfo);
  resume.addEventListener('click', callbacks.resume);
  restart.addEventListener('click', callbacks.restart);
  toggleControls.addEventListener('click', () => {
    pauseControls.hidden = !pauseControls.hidden;
  });
  document.getElementById('resume')?.remove();
  const bustedButton = bustScreen.querySelector('button');
  bustedButton?.addEventListener('click', callbacks.restart);
  const wasted = makeOutcome('wasted');
  const complete = makeOutcome('complete');
  wasted.button.addEventListener('click', callbacks.restart);
  complete.button.addEventListener('click', callbacks.restart);

  function showOutcome(kind) {
    titleScreen.hidden = true;
    pauseScreen.hidden = true;
    bustScreen.hidden = true;
    wasted.screen.hidden = kind !== 'wasted';
    complete.screen.hidden = kind !== 'complete';
  }

  function hideOutcomes() {
    wasted.screen.hidden = true;
    complete.screen.hidden = true;
  }

  function setSaveInfo(state) {
    const missionCount = state.missions.length;
    const saveDate = state.updatedAt ? new Date(state.updatedAt).toLocaleString() : 'No save yet';
    saveInfo.textContent = 'Saved cash: $' + state.money.toLocaleString() + ' · ' + missionCount + ' missions · ' + saveDate;
  }

  function onPause(state) {
    setSaveInfo(state ?? saveState());
    callbacks.pause();
    focusFirstButton(pauseScreen);
  }

  return {
    skyline,
    showOutcome,
    hideOutcomes,
    setSaveInfo,
    onPause,
    controls: titleControls,
  };
}
