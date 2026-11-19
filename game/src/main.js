// Bootstrap and bounded simulation loop for Vista Bay — Low Tide.
import { ACTION, createInput } from './input.js';
import { createRng } from './rng.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createVehicle, updateVehicle, applyVehicleCollision } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createMenus } from './menu.js';
import { createSave } from './save.js';

const THREE = globalThis.THREE;
const MAX_FRAME = 0.05;
const params = new URLSearchParams(location.search);
const parsedSeed = Number.parseInt(params.get('seed') ?? '613', 10);
const rng = createRng(Number.isFinite(parsedSeed) ? parsedSeed : 613);
const initialCanvas = document.getElementById('game');
const hudRoot = document.getElementById('hud');
const titleOverlay = document.getElementById('title');
const pauseOverlay = document.getElementById('pause');
const bustedOverlay = document.getElementById('busted');
const save = createSave();
const progress = save.load();
const world = createWorld(rng);
world.renderer.domElement.id = 'game';
world.renderer.domElement.setAttribute('aria-label', 'Vista Bay open world');
initialCanvas.replaceWith(world.renderer.domElement);
const gameCanvas = world.renderer.domElement;
const input = createInput(gameCanvas);
let radioName = progress.settings.radioStation;
const hud = createHud(hudRoot, world.city.roadGraph);
const audio = createAudio((name) => {
  radioName = name;
  hud.setStation(name);
  save.updateSettings({ radioStation: name });
});
const playerController = createPlayer(
  world.scene,
  world.city.spawnPoints[0],
  world.city.colliders,
  world.camera,
  audio,
);
const { player, move, syncVehicle, enter, exit, respawn } = playerController;
const traffic = createTraffic(world.scene, world.city.roadGraph, rng);
const playerCars = [];
const starterCars = [
  ['sedan', -100, 12, 0],
  ['sports', -12, 100, Math.PI / 2],
  ['pickup', 100, -12, -Math.PI / 2],
];
for (const [type, x, z, yaw] of starterCars) {
  const car = createVehicle(type, x, z, yaw);
  car.playerOwned = true;
  world.scene.add(car.root);
  playerCars.push(car);
}

let mode = 'title';
let elapsed = 0;
let wanted = 0;
let wantedDecay = 0;
let toastTimer = 0;
let dayCycle = progress.settings.dayCycle;
let weapon = 'Unarmed';
let ammo = 0;
let reserveAmmo = 0;
let shotPaints = 0;
let lastVehicleSpeed = 0;
let damageFlash = 0;
let activeOutcome = null;
const weaponNames = ['Sidearm', 'Compact SMG', 'Longarm'];
const districtLabel = document.getElementById('district');
const fallbackToast = document.getElementById('toast');
const missionPoint = { x: 165, z: -5 };

hud.setMoney(progress.money);
audio.setStation(radioName);
world.setWeather(progress.settings.weather);
if (progress.missions.includes('fountain-arrival')) {
  hud.setObjective('SUNSET SPRINT', 'Choose a car and follow the coast');
  hud.setMissionBlip(null);
} else {
  hud.setObjective('LOW TIDE', 'Reach the old fountain in Neon Row');
  hud.setMissionBlip(missionPoint);
}

function showToast(message, duration = 2.4) {
  hud.showToast(message, duration);
  fallbackToast.textContent = message;
  fallbackToast.classList.add('visible');
  toastTimer = duration;
}

function setMode(nextMode) {
  mode = nextMode;
  titleOverlay.hidden = nextMode !== 'title' || activeOutcome !== null;
  pauseOverlay.hidden = nextMode !== 'paused' || activeOutcome !== null;
  bustedOverlay.hidden = true;
  hudRoot.hidden = nextMode !== 'playing';
  if (nextMode === 'playing') {
    activeOutcome = null;
    if (menus) {
      menus.hideOutcomes();
    }
  }
  if (nextMode === 'title' || nextMode === 'paused' || nextMode === 'busted') {
    document.exitPointerLock?.();
  }
  if (nextMode === 'paused') {
    const current = save.getState();
    save.checkpointOnPause({
      money: current.money,
      settings: {
        dayCycle,
        radioStation: radioName,
        weather: world.weather,
        volume: current.settings.volume,
      },
    });
  }
}

function begin() {
  activeOutcome = null;
  if (player.inVehicle) {
    player.inVehicle.occupied = false;
  }
  player.inVehicle = null;
  player.avatar.visible = true;
  player.position.set(-100, 0, 0);
  player.cameraYaw = 0;
  player.yaw = 0;
  elapsed = 0;
  wanted = 0;
  wantedDecay = 0;
  damageFlash = 0;
  player.health = 1;
  player.armor = 0.35;
  player.weapon = 0;
  weapon = 'Unarmed';
  setMode('playing');
  audio.resume();
  hud.setWantedLevel(wanted);
  hud.setHealth(player.health);
  hud.setArmor(player.armor);
}

function restart() {
  save.load();
  begin();
  hud.setMoney(save.getState().money);
  menus.hideOutcomes();
}

function togglePause() {
  if (mode === 'playing') {
    menus.onPause(save.getState());
  } else if (mode === 'paused') {
    setMode('playing');
    audio.resume();
  }
}

function useInteraction() {
  if (player.inVehicle) {
    exit();
    showToast('On foot');
    return;
  }
  const owned = playerCars
    .filter((car) => !car.occupied)
    .find((car) => car.root.position.distanceToSquared(player.position) < 34);
  const nearbyTraffic = traffic.nearest(player.position, 5.7);
  const vehicle = nearbyTraffic ?? owned;
  if (!vehicle) {
    showToast('No ride nearby');
    return;
  }
  if (vehicle.ai) {
    traffic.remove(vehicle);
  }
  enter(vehicle);
  showToast('Took the ' + vehicle.name);
  wanted = Math.min(5, wanted + (vehicle.type === 'police' ? 2 : 1));
}

function equipWeapon(index) {
  player.weapon = index;
  weapon = weaponNames[index];
  ammo = index === 0 ? 12 : index === 1 ? 30 : 6;
  reserveAmmo = index === 0 ? 48 : index === 1 ? 120 : 24;
  const current = save.getState();
  save.save({
    weapons: [...new Set([...current.weapons, weapon])],
    selectedWeapon: weapon,
  });
  showToast(weapon + ' selected');
}

function fireWeapon() {
  if (weapon === 'Unarmed' || ammo <= 0 || player.inVehicle) {
    return;
  }
  ammo -= 1;
  audio.shot(player.weapon);
  damageFlash = 0.08;
  showToast('Shot fired', 0.55);
  hud.setWeapon(weapon, ammo, reserveAmmo);
}

function handleActions() {
  const pressed = input.takeAll();
  if (pressed.has(ACTION.PAUSE)) {
    if (mode === 'title') {
      begin();
    } else {
      togglePause();
    }
  }
  if (pressed.has(ACTION.CONFIRM)) {
    if (mode === 'title' || mode === 'busted') {
      begin();
    } else if (mode === 'paused') {
      setMode('playing');
    }
  }
  if (pressed.has(ACTION.INTERACT) && mode === 'playing') {
    useInteraction();
  }
  if (pressed.has(ACTION.WEAPON1)) {
    equipWeapon(0);
  }
  if (pressed.has(ACTION.WEAPON2)) {
    equipWeapon(1);
  }
  if (pressed.has(ACTION.WEAPON3)) {
    equipWeapon(2);
  }
  if (pressed.has(ACTION.RELOAD) && mode === 'playing') {
    const needed = Math.max(0, (player.weapon === 1 ? 30 : 12) - ammo);
    const loaded = Math.min(needed, reserveAmmo);
    ammo += loaded;
    reserveAmmo -= loaded;
    hud.setWeapon(weapon, ammo, reserveAmmo);
    showToast('Magazine reloaded');
  }
  if (pressed.has(ACTION.RADIO)) {
    audio.radio();
  }
  if (pressed.has(ACTION.FIRE) && mode === 'playing') {
    fireWeapon();
  }
  if (pressed.has(ACTION.ACTIVITY)) {
    player.activity = player.activity === 'Free roam' ? 'Street race' : 'Free roam';
    showToast(player.activity === 'Street race' ? 'Activity: Sunset Sprint' : 'Activity cleared');
  }
  if (pressed.has(ACTION.DAY)) {
    dayCycle = !dayCycle;
    save.updateSettings({ dayCycle });
  }
  if (pressed.has(ACTION.WEATHER)) {
    const weather = world.toggleWeather();
    save.updateSettings({ weather });
    showToast(weather === 'rain' ? 'Rain moving in' : 'The clouds are clearing');
  }
  if (pressed.has(ACTION.HORN)) {
    if (player.inVehicle) {
      player.inVehicle.setHorn();
      audio.horn();
    }
    showToast('Honk!');
  }
}

function findDistrict(x, z) {
  const district = world.city.districtZones.find((entry) => (
    x >= entry.x[0]
    && x <= entry.x[1]
    && z >= entry.z[0]
    && z <= entry.z[1]
  ));
  return district?.name ?? 'Vista Bay';
}

function hudState() {
  const current = player.inVehicle;
  const position = current ? current.root.position : player.position;
  const speed = current ? Math.abs(current.speed) * 3.6 : 0;
  const district = findDistrict(position.x, position.z);
  const police = traffic.traffic
    .filter((car) => car.type === 'police')
    .map((car) => ({ x: car.root.position.x, z: car.root.position.z }));
  return {
    position,
    heading: player.cameraYaw,
    district,
    districts: world.city.districtZones.map((entry) => ({
      name: entry.name,
      x: (entry.x[0] + entry.x[1]) / 2,
      z: (entry.z[0] + entry.z[1]) / 2,
    })),
    police,
    mission: save.getState().missions.includes('fountain-arrival') ? null : missionPoint,
    wanted,
    health: player.health,
    armor: player.armor,
    damage: damageFlash,
    weapon,
    ammo,
    reserve: reserveAmmo,
    driving: Boolean(current),
    speed,
  };
}

function respawnAt(point) {
  respawn(point);
  wanted = 0;
  wantedDecay = 0;
  setMode('playing');
  player.health = 1;
  player.armor = 0.35;
}

function updateVehicleSimulation(dt) {
  if (!player.inVehicle) {
    return;
  }
  const car = player.inVehicle;
  updateVehicle(car, input, dt);
  const vehicleSpeed = Math.abs(car.speed);
  const throttle = input.held('KeyW') || input.held('ArrowUp') ? 1 : 0;
  audio.engine(Math.min(1, vehicleSpeed / car.spec.speed), throttle, vehicleSpeed > 0.4);
  const skidAmount = input.held('Space') && vehicleSpeed > 5
    ? Math.min(1, vehicleSpeed / 28)
    : 0;
  audio.skid(skidAmount);
  for (const obstacle of traffic.traffic) {
    const distance = car.root.position.distanceToSquared(obstacle.root.position);
    if (distance < 8 && applyVehicleCollision(car, vehicleSpeed)) {
      obstacle.speed *= 0.45;
      wanted = Math.min(5, wanted + 1);
      damageFlash = 0.42;
      audio.crash(Math.max(0.4, vehicleSpeed / 20));
    }
  }
  for (const collider of world.city.colliders) {
    const insideX = car.root.position.x > collider.minX - 1;
    const withinX = car.root.position.x < collider.maxX + 1;
    const insideZ = car.root.position.z > collider.minZ - 1;
    const withinZ = car.root.position.z < collider.maxZ + 1;
    if (insideX && withinX && insideZ && withinZ && applyVehicleCollision(car, vehicleSpeed)) {
      const sides = [
        [Math.abs(car.root.position.x - (collider.minX - 1.3)), 'x', collider.minX - 1.3],
        [Math.abs(car.root.position.x - (collider.maxX + 1.3)), 'x', collider.maxX + 1.3],
        [Math.abs(car.root.position.z - (collider.minZ - 1.3)), 'z', collider.minZ - 1.3],
        [Math.abs(car.root.position.z - (collider.maxZ + 1.3)), 'z', collider.maxZ + 1.3],
      ].sort((left, right) => left[0] - right[0]);
      car.root.position[sides[0][1]] = sides[0][2];
      wanted = Math.min(5, wanted + 1);
      damageFlash = 0.55;
      audio.crash(Math.max(0.35, vehicleSpeed / 24));
    }
  }
  car.root.position.x = THREE.MathUtils.clamp(car.root.position.x, -590, 590);
  car.root.position.z = THREE.MathUtils.clamp(car.root.position.z, -590, 590);
  if (car.type === 'police' && Math.floor(elapsed * 4) % 2 === 0) {
    audio.siren(true, Math.sin(car.root.position.x * 0.01));
  }
  lastVehicleSpeed = vehicleSpeed;
  syncVehicle(dt, world);
}

function updateWanted(dt) {
  if (wanted > 0) {
    wantedDecay += dt;
    if (wantedDecay > 22) {
      wanted -= 1;
      wantedDecay = 0;
    }
  }
  if (wanted >= 5) {
    wantedDecay += dt;
    if (wantedDecay > 35) {
      player.health = 0;
      activeOutcome = 'wasted';
      menus.showOutcome('wasted');
      setMode('busted');
    }
  }
}

function checkMissionProgress() {
  const distance = Math.hypot(player.position.x - missionPoint.x, player.position.z - missionPoint.z);
  if (distance > 11 || save.getState().missions.includes('fountain-arrival')) {
    return;
  }
  save.checkpointOnMissionComplete('fountain-arrival', 500);
  hud.setMoney(save.getState().money);
  hud.setObjective('MISSION COMPLETE', 'Sunset Sprint is waiting on the coast');
  hud.setMissionBlip(null);
  hud.showToast('Fountain reached · $500', 4);
  activeOutcome = 'complete';
  menus.showOutcome('complete');
  setMode('paused');
}

function simulate(dt) {
  elapsed += dt;
  audio.update(dt);
  world.update(dt, dayCycle, player.position);
  handleActions();
  if (mode !== 'playing') {
    return;
  }
  updateVehicleSimulation(dt);
  if (!player.inVehicle) {
    move(dt, input, world);
    audio.engine(0, 0, false);
  }
  traffic.update(dt, player.position, player.inVehicle);
  updateWanted(dt);
  checkMissionProgress();
  damageFlash = Math.max(0, damageFlash - dt * 1.8);
  toastTimer = Math.max(0, toastTimer - dt);
  hud.update(hudState(), dt);
  fallbackToast.classList.toggle('visible', toastTimer > 0);
  syncOutcomeVisibility();
}

function syncOutcomeVisibility() {
  if (mode === 'playing' || mode === 'title') {
    activeOutcome = null;
    menus.hideOutcomes();
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(Math.max(0, (now - frame.last) / 1000 || 0), MAX_FRAME);
  frame.last = now;
  if (params.has('shot')) {
    if (shotPaints === 0) {
      begin();
      player.position.set(0, 0, 0);
      player.cameraYaw = 0.8;
      for (let count = 0; count < 8; count += 1) {
        simulate(1 / 60);
      }
    }
    if (params.get('shot') === 'drive') {
      enter(playerCars[0]);
      playerCars[0].root.position.set(-17, 0, -20);
      playerCars[0].yaw = -0.5;
      playerCars[0].root.rotation.y = -0.5;
      playerCars[0].speed = 18;
    }
    world.renderer.render(world.scene, world.camera);
    shotPaints += 1;
    if (shotPaints >= 2) {
      window.__shotReady = true;
    }
    return;
  }
  if (mode === 'title' || mode === 'playing') {
    simulate(dt);
  } else {
    handleActions();
    audio.update(dt);
  }
  world.renderer.render(world.scene, world.camera);
}

const menus = createMenus({
  start: begin,
  resume() {
    setMode('playing');
    audio.resume();
  },
  restart,
  pause() {
    setMode('paused');
  },
}, () => save.getState());

document.getElementById('start').addEventListener('click', audio.resume, { once: true });
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === gameCanvas) {
    audio.resume();
  }
});
window.addEventListener('resize', () => world.resize());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'playing') {
    togglePause();
  }
});
window.addEventListener('vista-bay-mission-complete', (event) => {
  const missionId = event.detail?.id ?? 'fountain-arrival';
  const reward = event.detail?.reward ?? 500;
  save.checkpointOnMissionComplete(missionId, reward);
  hud.setMoney(save.getState().money);
  activeOutcome = 'complete';
  menus.showOutcome('complete');
  setMode('paused');
});

setMode('title');
hud.setMoney(save.getState().money);
hud.setWantedLevel(wanted);
if (progress.selectedWeapon !== 'Unarmed') {
  const restoredWeapon = weaponNames.indexOf(progress.selectedWeapon);
  if (restoredWeapon >= 0) {
    equipWeapon(restoredWeapon);
  }
}
hud.update(hudState(), 0);
requestAnimationFrame(frame);
