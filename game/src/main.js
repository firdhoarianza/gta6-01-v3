// Bootstrap and bounded simulation loop for Vista Bay — Low Tide.
import { ACTION, createInput } from './input.js';
import { createRng, parseSeed } from './rng.js';
import { WORLD } from './config.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createVehicle, updateVehicle, applyVehicleCollision } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createMenus } from './menu.js';
import { createSave } from './save.js';
import { createPedestrians } from './pedestrians.js';
import { createShotDirector } from './shots.js';
import { createEffects } from './effects.js';

const THREE = globalThis.THREE;
const MAX_FRAME = 0.05;
const SHOT_READY_FRAME = 60;
const weaponRay = new THREE.Raycaster();
const weaponDirection = new THREE.Vector3();
const weaponOrigin = new THREE.Vector3();
const params = new URLSearchParams(location.search);
const parsedSeed = parseSeed(params.get('seed') ?? '613');
const rng = createRng(parsedSeed);
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
const pedestrians = createPedestrians(world.scene, rng);
const effects = createEffects(world.scene, rng);
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
let damageFlash = 0;
let pursuit = 0;
let shotReady = false;
let activeOutcome = null;
const weaponNames = ['Sidearm', 'Compact SMG', 'Longarm'];
const fallbackToast = document.getElementById('toast');
const missionPoint = { x: 165, z: -5 };
window.__SHOT_READY__ = shotReady;

hud.setMoney(progress.money);
audio.setStation(radioName);
audio.setVolume(progress.settings.volume);
world.setWeather(progress.settings.weather);
hud.setWeather(progress.settings.weather);
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
  if (nextMode === 'paused' && mode === 'playing') {
    const focus = player.inVehicle ? player.inVehicle.root.position : player.position;
    world.camera.fov = 57;
    world.camera.position.y += 1.8;
    world.camera.position.add(new THREE.Vector3(-2.2, 0, 1.3));
    world.camera.lookAt(focus.x, focus.y + 0.5, focus.z);
    world.camera.updateProjectionMatrix();
  }
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
  player.velocity.set(0, 0, 0);
  player.vertical = 0;
  player.grounded = true;
  player.position.set(-100, 0, 0);
  player.cameraYaw = 0;
  player.yaw = 0;
  elapsed = 0;
  wanted = 0;
  wantedDecay = 0;
  pursuit = 0;
  hud.setPursuit(0);
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
  input.clear();
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
  const muzzle = player.position.clone();
  muzzle.y += 1.25;
  muzzle.x += Math.sin(player.yaw) * 0.7;
  muzzle.z -= Math.cos(player.yaw) * 0.7;
  effects.burst(muzzle, { count: 5, speed: 4.5, kind: 'spark' });
  weaponOrigin.copy(player.position);
  weaponOrigin.y += 1.36;
  const pitch = player.cameraPitch;
  weaponDirection.set(
    Math.sin(player.cameraYaw) * Math.cos(pitch),
    -Math.sin(pitch),
    -Math.cos(player.cameraYaw) * Math.cos(pitch),
  ).normalize();
  weaponRay.set(weaponOrigin, weaponDirection);
  weaponRay.far = 105;
  const targets = [
    ...world.city.colliders.map((collider) => collider.mesh),
    ...traffic.traffic.map((car) => car.root),
    ...playerCars.map((car) => car.root),
  ];
  const hit = weaponRay.intersectObjects(targets, true)[0];
  if (hit) {
    effects.burst(hit.point, { count: 10, speed: 6, kind: 'ember' });
    damageFlash = Math.max(damageFlash, 0.24);
    showToast('Impact · ' + Math.round(hit.distance) + ' m', 0.7);
  }
  player.aiming = true;
  world.camera.position.add(new THREE.Vector3((rng() - 0.5) * 0.055, (rng() - 0.5) * 0.04, (rng() - 0.5) * 0.055));
  showToast('Shot fired · ' + ammo + ' rounds left', 0.55);
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
    const magazineCapacity = player.weapon === 1 ? 30 : player.weapon === 2 ? 6 : 12;
    const needed = Math.max(0, magazineCapacity - ammo);
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
    world.setCycleEnabled(dayCycle);
    save.updateSettings({ dayCycle });
  }
  if (pressed.has(ACTION.WEATHER)) {
    const weather = world.toggleWeather();
    hud.setWeather(weather);
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
    heading: current ? current.yaw : player.cameraYaw,
    district,
    districts: world.city.districtZones.map((entry) => ({
      name: entry.name,
      x: (entry.x[0] + entry.x[1]) / 2,
      z: (entry.z[0] + entry.z[1]) / 2,
    })),
    police,
    mission: save.getState().missions.includes('fountain-arrival') ? null : missionPoint,
    wanted: params.get('shot') === 'end' ? 4 : wanted,
    health: player.health,
    armor: player.armor,
    damage: damageFlash,
    weapon,
    ammo,
    reserve: reserveAmmo,
    driving: Boolean(current),
    speed,
    weather: world.weather,
    pursuit: pursuit * 100,
  };
}

function respawnAt(point) {
  respawn(point);
  wanted = 0;
  wantedDecay = 0;
  setMode('playing');
  player.health = 1;
  player.armor = 0.35;
  pursuit = 0;
  hud.setWantedLevel(0);
  hud.setHealth(player.health);
  hud.setArmor(player.armor);
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
      effects.burst(obstacle.root.position, { count: 14, speed: 6, kind: 'spark' });
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
      effects.burst(car.root.position.clone().setY(0.8), { count: 12, speed: 5.5, kind: 'spark' });
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
  syncVehicle(dt, world);
}

function updateWanted(dt) {
  const targetPosition = player.inVehicle ? player.inVehicle.root.position : player.position;
  const policeClose = wanted > 0 && traffic.policeNearby(targetPosition, player.inVehicle ? 22 : 16);
  const exposed = !player.inVehicle && Math.hypot(player.velocity.x, player.velocity.z) < 0.8;
  pursuit = policeClose && exposed
    ? Math.min(1, pursuit + dt / WORLD.pursuitGraceSeconds)
    : Math.max(0, pursuit - dt / 2.4);
  hud.setPursuit(pursuit * 100);
  if (pursuit >= 1 && wanted >= 3) {
    activeOutcome = 'wasted';
    menus.showOutcome('wasted');
    setMode('busted');
    return;
  }
  if (wanted >= 5) {
    wantedDecay += dt;
    if (wantedDecay > 35) {
      player.health = 0;
      activeOutcome = 'wasted';
      menus.showOutcome('wasted');
      setMode('busted');
    }
  } else if (wanted > 0 && !policeClose) {
    wantedDecay += dt;
    if (wantedDecay > 22) {
      wanted -= 1;
      wantedDecay = 0;
      hud.setWantedLevel(wanted);
    }
  } else if (policeClose) {
    wantedDecay = 0;
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
  hud.showDialogue('MARA', 'You made it before the last light. The coast is open.');
  hud.setPursuit(0);
  activeOutcome = 'complete';
  menus.showOutcome('complete');
  setMode('paused');
}

function simulate(dt) {
  elapsed += dt;
  audio.update(dt);
  effects.update(dt);
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
  traffic.update(dt, player.position, player.inVehicle, wanted);
  pedestrians.update(dt, player.position, [player.inVehicle, ...traffic.traffic].filter(Boolean));
  updateWanted(dt);
  if (mode !== 'playing') {
    hud.update(hudState(), dt);
    return;
  }
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
  if (shotDirector.shot) {
    shotDirector.update(1 / 60);
    effects.update(1 / 60);
    if (shotDirector.shot !== 'start') {
      hud.update(hudState(), 1 / 60);
      audio.update(1 / 60);
    }
    world.renderer.render(world.scene, world.camera);
    shotPaints += 1;
    if (shotPaints >= SHOT_READY_FRAME) {
      shotReady = true;
      window.__SHOT_READY__ = true;
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
const shotDirector = createShotDirector({ world, player, enter, playerCars, traffic, pedestrians, hud, rng });

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
if (!shotDirector.shot && progress.selectedWeapon !== 'Unarmed') {
  const restoredWeapon = weaponNames.indexOf(progress.selectedWeapon);
  if (restoredWeapon >= 0) {
    equipWeapon(restoredWeapon);
  }
}
hud.update(hudState(), 0);
if (shotDirector.shot) {
  if (shotDirector.shot !== 'start') {
    begin();
  }
  shotDirector.stage();
  hud.setWeather(world.weather);
  if (shotDirector.shot === 'start') {
    setMode('title');
    titleOverlay.hidden = false;
    hudRoot.hidden = true;
  } else {
    setMode('playing');
    titleOverlay.hidden = true;
    hudRoot.hidden = false;
  }
}
requestAnimationFrame(frame);
