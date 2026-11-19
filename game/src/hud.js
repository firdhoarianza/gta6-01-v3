// Canvas map and compact presentation layer for the open city.
const COLORS = {
  gold: '#ffd078',
  mint: '#62e3dc',
  mapRoad: '#64717d',
  mapEdge: '#27313d',
};

function makeElement(tag, className, parent) {
  const element = document.createElement(tag);
  element.className = className;
  parent.append(element);
  return element;
}

function installStyles() {
  const style = document.createElement('style');
  style.textContent = [
    '#hud{font-family:system-ui,-apple-system,Segoe UI,sans-serif}',
    '.vb-map{position:absolute;left:22px;bottom:22px;width:190px;height:190px;border:1px solid rgba(255,232,204,.46);border-radius:50%;background:rgba(10,15,26,.76);box-shadow:0 8px 30px rgba(0,0,0,.28);overflow:hidden}',
    '.vb-map canvas{width:100%;height:100%;display:block}',
    '.vb-map-label{position:absolute;left:50%;bottom:7px;transform:translateX(-50%);font-size:9px;letter-spacing:.16em;white-space:nowrap}',
    '.vb-map-key{position:absolute;right:7px;top:7px;color:#dce1e6;font-size:8px;line-height:1.45;text-align:right}',
    '.vb-bars{position:absolute;top:22px;left:50%;transform:translateX(-50%);width:min(300px,42vw)}',
    '.vb-bar{height:8px;margin:4px 0;background:rgba(7,10,20,.7);border:1px solid rgba(255,255,255,.2)}',
    '.vb-bar-fill{height:100%;width:100%;transition:width .18s linear}',
    '.vb-health{background:linear-gradient(90deg,#dd514e,#ff9c70)}',
    '.vb-armor{background:linear-gradient(90deg,#4989c4,#75e0e2)}',
    '.vb-currency{position:absolute;right:28px;top:75px;font-size:21px;font-weight:850;color:#a5e1ad}',
    '.vb-money-label{display:block;color:#e9dcca;font-size:8px;letter-spacing:.2em}',
    '.vb-ammo{position:absolute;right:28px;bottom:82px;text-align:right;font-size:19px;font-weight:800}',
    '.vb-ammo small{display:block;font-size:9px;letter-spacing:.16em}',
    '.vb-objective{position:absolute;top:114px;left:50%;transform:translateX(-50%);width:min(390px,70vw);text-align:center}',
    '.vb-objective b{display:block;color:#ffd078;font-size:11px;letter-spacing:.2em;text-transform:uppercase}',
    '.vb-objective span{display:block;margin-top:4px;font-size:13px}',
    '.vb-toast{position:absolute;top:24%;left:50%;transform:translate(-50%,-8px);opacity:0;padding:9px 15px;background:rgba(13,15,27,.84);border:1px solid rgba(255,255,255,.22);transition:opacity .2s,transform .2s;letter-spacing:.09em;font-size:12px}',
    '.vb-toast.visible{opacity:1;transform:translate(-50%,0)}',
    '.vb-district-pop{position:absolute;left:50%;bottom:27%;transform:translate(-50%,8px);opacity:0;font-weight:850;letter-spacing:.22em;font-size:13px;transition:opacity .25s,transform .25s}',
    '.vb-district-pop.visible{opacity:1;transform:translate(-50%,0)}',
    '.vb-damage{position:absolute;inset:0;opacity:0;pointer-events:none;background:radial-gradient(ellipse,transparent 43%,rgba(193,27,49,.64))}',
    '.vb-speed{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);width:170px;text-align:center}',
    '.vb-speed svg{display:block;width:100%;height:66px;overflow:visible}',
    '.vb-speed-value{margin-top:-13px;font-weight:850;font-size:20px}',
    '.vb-speed-label{color:#ded7cf;font-size:9px;letter-spacing:.18em}',
    '.vb-wanted{position:absolute;right:28px;top:24px;color:#ffd078;font-size:21px;letter-spacing:.18em}',
    '@media(max-width:600px){.vb-map{width:130px;height:130px;left:12px;bottom:12px}.vb-bars{top:12px;width:38vw}.vb-speed{bottom:16px;width:130px}.vb-currency{right:14px;top:67px;font-size:16px}.vb-ammo{right:14px;bottom:65px}.vb-wanted{right:14px;top:14px}}',
  ].join('');
  document.head.append(style);
}

function drawArrow(context, x, y, rotation, color, size) {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(0, -size);
  context.lineTo(size * 0.68, size * 0.7);
  context.lineTo(0, size * 0.37);
  context.lineTo(-size * 0.68, size * 0.7);
  context.closePath();
  context.fill();
  context.restore();
}

function drawRoads(context, graph, centerX, centerZ, scale) {
  context.strokeStyle = COLORS.mapEdge;
  context.lineWidth = 4.6;
  context.beginPath();
  for (const edge of graph.edges) {
    const start = graph.nodes[edge.a];
    const end = graph.nodes[edge.b];
    context.moveTo((start.x - centerX) * scale, (start.z - centerZ) * scale);
    context.lineTo((end.x - centerX) * scale, (end.z - centerZ) * scale);
  }
  context.stroke();
  context.strokeStyle = COLORS.mapRoad;
  context.lineWidth = 2.5;
  context.beginPath();
  for (const edge of graph.edges) {
    const start = graph.nodes[edge.a];
    const end = graph.nodes[edge.b];
    context.moveTo((start.x - centerX) * scale, (start.z - centerZ) * scale);
    context.lineTo((end.x - centerX) * scale, (end.z - centerZ) * scale);
  }
  context.stroke();
}

/** Creates the HUD elements and exposes presentation updates. */
export function createHud(root, roadGraph) {
  installStyles();
  const minimap = makeElement('div', 'vb-map', root);
  const mapCanvas = makeElement('canvas', '', minimap);
  const mapLabel = makeElement('div', 'vb-map-label', minimap);
  const mapKey = makeElement('div', 'vb-map-key', minimap);
  const mapContext = mapCanvas.getContext('2d');
  const bars = makeElement('div', 'vb-bars', root);
  const healthFill = makeElement('div', 'vb-bar-fill vb-health', makeElement('div', 'vb-bar', bars));
  const armorFill = makeElement('div', 'vb-bar-fill vb-armor', makeElement('div', 'vb-bar', bars));
  const money = makeElement('div', 'vb-currency', root);
  const moneyLabel = makeElement('small', 'vb-money-label', money);
  const moneyValue = document.createTextNode('$0');
  money.append(moneyValue);
  const ammo = makeElement('div', 'vb-ammo', root);
  const ammoIcon = makeElement('small', '', ammo);
  const ammoCount = makeElement('span', '', ammo);
  const objective = makeElement('div', 'vb-objective', root);
  const missionTitle = makeElement('b', '', objective);
  const missionLine = makeElement('span', '', objective);
  const toast = makeElement('div', 'vb-toast', root);
  const districtPopup = makeElement('div', 'vb-district-pop', root);
  const damage = makeElement('div', 'vb-damage', root);
  const wanted = makeElement('div', 'vb-wanted', root);
  const speedometer = makeElement('div', 'vb-speed', root);
  const speedMarkup = makeElement('div', '', speedometer);
  const speedValue = makeElement('div', 'vb-speed-value', speedometer);
  const speedLabel = makeElement('div', 'vb-speed-label', speedometer);
  speedMarkup.innerHTML = '<svg viewBox="0 0 170 70" aria-hidden="true"><path d="M18 62 A67 67 0 0 1 152 62" fill="none" stroke="rgba(255,255,255,.26)" stroke-width="5"/><path data-arc d="M18 62 A67 67 0 0 1 152 62" fill="none" stroke="#62e3dc" stroke-width="5" stroke-dasharray="210" stroke-dashoffset="210" stroke-linecap="round"/></svg>';
  const speedArc = speedMarkup.querySelector('[data-arc]');
  let moneyCurrent = 0;
  let moneyTarget = 0;
  let toastTimer = 0;
  let popupTimer = 0;
  let wantedFlash = 0;
  let currentDistrict = '';
  let previousWanted = 0;
  let elapsed = 0;

  moneyLabel.textContent = 'CARRYING';
  ammoIcon.textContent = '◇';
  speedLabel.textContent = 'KM/H';
  missionTitle.textContent = 'LOW TIDE';
  missionLine.textContent = 'Find your way through Vista Bay';
  mapKey.textContent = '● COUNTY  ● GOAL';

  function resizeMap() {
    const bounds = mapCanvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    mapCanvas.width = Math.max(1, Math.floor(bounds.width * ratio));
    mapCanvas.height = Math.max(1, Math.floor(bounds.height * ratio));
  }

  function showToast(message, seconds = 2.4) {
    toast.textContent = message;
    toast.classList.add('visible');
    toastTimer = seconds;
  }

  function setObjective(title, line) {
    missionTitle.textContent = title;
    missionLine.textContent = line;
  }

  function setMoney(value) {
    moneyTarget = Math.max(0, value);
  }

  function paintMap(state) {
    if (mapCanvas.width <= 1 || mapCanvas.height <= 1) {
      resizeMap();
    }
    const width = mapCanvas.width;
    const height = mapCanvas.height;
    const centerX = state.position.x;
    const centerZ = state.position.z;
    const scale = Math.min(width, height) / 330;
    mapContext.setTransform(1, 0, 0, 1, width / 2, height / 2);
    mapContext.clearRect(-width / 2, -height / 2, width, height);
    mapContext.save();
    mapContext.rotate(-state.heading);
    mapContext.fillStyle = 'rgba(35, 46, 56, 0.18)';
    mapContext.fillRect(-width / 2, -height / 2, width, height);
    drawRoads(mapContext, roadGraph, centerX, centerZ, scale);
    for (const district of state.districts) {
      const dx = (district.x - centerX) * scale;
      const dz = (district.z - centerZ) * scale;
      if (Math.abs(dx) > width * 0.42 || Math.abs(dz) > height * 0.42) {
        continue;
      }
      mapContext.fillStyle = 'rgba(244,229,207,.46)';
      mapContext.font = '8px system-ui';
      mapContext.fillText(district.name, dx + 4, dz - 4);
    }
    for (const police of state.police) {
      const dx = (police.x - centerX) * scale;
      const dz = (police.z - centerZ) * scale;
      if (Math.hypot(dx, dz) < width * 0.44) {
        mapContext.strokeStyle = 'rgba(255,79,88,.38)';
        mapContext.lineWidth = 1;
        mapContext.beginPath();
        mapContext.arc(dx, dz, 7, 0, Math.PI * 2);
        mapContext.stroke();
        mapContext.fillStyle = '#ff4f58';
        mapContext.beginPath();
        mapContext.arc(dx, dz, 4, 0, Math.PI * 2);
        mapContext.fill();
      }
    }
    if (state.mission) {
      const dx = (state.mission.x - centerX) * scale;
      const dz = (state.mission.z - centerZ) * scale;
      mapContext.fillStyle = COLORS.gold;
      mapContext.globalAlpha = 0.65 + Math.sin(elapsed * 5) * 0.25;
      mapContext.beginPath();
      mapContext.arc(dx, dz, 4.5, 0, Math.PI * 2);
      mapContext.fill();
      mapContext.globalAlpha = 1;
    }
    mapContext.restore();
    mapContext.strokeStyle = 'rgba(255,255,255,.15)';
    mapContext.lineWidth = 1;
    mapContext.beginPath();
    mapContext.arc(0, 0, Math.min(width, height) * 0.47, 0, Math.PI * 2);
    mapContext.stroke();
    drawArrow(mapContext, 0, 0, 0, COLORS.mint, 8);
    mapLabel.textContent = state.district;
  }

  function update(state, dt) {
    elapsed += dt;
    toastTimer = Math.max(0, toastTimer - dt);
    popupTimer = Math.max(0, popupTimer - dt);
    wantedFlash = Math.max(0, wantedFlash - dt);
    toast.classList.toggle('visible', toastTimer > 0);
    districtPopup.classList.toggle('visible', popupTimer > 0);
    if (state.wanted > previousWanted) {
      wantedFlash = 0.7;
      wanted.textContent = '★'.repeat(state.wanted) + '☆'.repeat(5 - state.wanted);
    }
    previousWanted = state.wanted;
    wanted.style.opacity = wantedFlash > 0 && Math.floor(elapsed * 12) % 2 === 0 ? '0.38' : '1';
    healthFill.style.width = String(Math.max(0, Math.min(1, state.health)) * 100) + '%';
    armorFill.style.width = String(Math.max(0, Math.min(1, state.armor)) * 100) + '%';
    moneyCurrent += (moneyTarget - moneyCurrent) * Math.min(1, dt * 6);
    moneyValue.textContent = '$' + Math.round(moneyCurrent).toLocaleString();
    ammoIcon.textContent = state.weapon === 'Unarmed' ? '✦' : '▰';
    ammoCount.textContent = state.weapon === 'Unarmed' ? state.weapon : state.ammo + ' / ' + state.reserve;
    speedValue.textContent = state.driving ? Math.round(state.speed) : '';
    speedLabel.textContent = state.driving ? 'KM/H' : '';
    const ratio = Math.max(0, Math.min(1, state.speed / 220));
    speedArc.style.strokeDashoffset = String(210 - ratio * 210);
    speedometer.style.opacity = state.driving ? '1' : '0';
    const pulse = state.health < 0.25 ? 0.12 + Math.sin(elapsed * 5) * 0.08 : 0;
    damage.style.opacity = String(Math.max(state.damage, pulse));
    if (state.district !== currentDistrict) {
      currentDistrict = state.district;
      districtPopup.textContent = currentDistrict;
      popupTimer = 2.1;
    }
    paintMap(state);
  }

  function setHealth(value) {
    healthFill.style.width = String(Math.max(0, Math.min(1, value)) * 100) + '%';
  }

  function setArmor(value) {
    armorFill.style.width = String(Math.max(0, Math.min(1, value)) * 100) + '%';
  }

  function setWantedLevel(level) {
    const clamped = Math.max(0, Math.min(5, level));
    wanted.textContent = '★'.repeat(clamped) + '☆'.repeat(5 - clamped);
  }

  function setWeapon(name, currentAmmo, reserveAmmo) {
    ammoIcon.textContent = name === 'Unarmed' ? '✦' : '▰';
    ammoCount.textContent = name === 'Unarmed' ? name : currentAmmo + ' / ' + reserveAmmo;
  }

  function setDamage(amount) {
    damage.style.opacity = String(Math.max(0, Math.min(1, amount)));
  }

  function setMissionBlip(point) {
    missionTitle.dataset.x = point ? String(point.x) : '';
    missionTitle.dataset.z = point ? String(point.z) : '';
  }

  resizeMap();
  window.addEventListener('resize', resizeMap);
  return {
    update,
    showToast,
    setObjective,
    setMoney,
    setHealth,
    setArmor,
    setWantedLevel,
    setWeapon,
    setDamage,
    setMissionBlip,
    setStation(name) {
      showToast('Now playing: ' + name, 3.2);
    },
  };
}
