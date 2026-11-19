// Bootstrap, overlays, deterministic shots and bounded frame loop for Vista Bay — Low Tide.
import { ACTION, createInput } from './input.js';
import { createRng } from './rng.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createVehicle, updateVehicle, applyVehicleCollision } from './vehicles.js';
import { createTraffic } from './traffic.js';
import { createAudio } from './audio.js';

const THREE = globalThis.THREE;
const MAX_FRAME = 0.05;
const params = new URLSearchParams(location.search);
const seedValue = Number.parseInt(params.get('seed') ?? '613', 10);
const rng = createRng(Number.isFinite(seedValue) ? seedValue : 613);
const canvas = document.getElementById('game'), hud = document.getElementById('hud'), title = document.getElementById('title'), pause = document.getElementById('pause'), busted = document.getElementById('busted');
const world = createWorld(rng);
world.renderer.domElement.id = 'game';
world.renderer.domElement.setAttribute('aria-label', 'Vista Bay open world');
canvas.replaceWith(world.renderer.domElement);
const gameCanvas = world.renderer.domElement, input = createInput(gameCanvas);
const { player, move, syncVehicle, enter, exit } = createPlayer(world.scene, world.city.spawnPoints[0], world.city.colliders, world.camera);
const traffic = createTraffic(world.scene, world.city.roadGraph, rng);
const audio = createAudio();
const playerCars = [];
for (const [type, x, z, yaw] of [['sedan', -100, 12, 0], ['sports', -12, 100, Math.PI / 2], ['pickup', 100, -12, -Math.PI / 2]]) { const car = createVehicle(type, x, z, yaw); car.playerOwned = true; world.scene.add(car.root); playerCars.push(car); }

let mode = 'title', elapsed = 0, wanted = 0, wantedFiveTimer = 0, radio = 'Sable FM', dayCycle = true, weapon = 'Unarmed', toastTimer = 0, shotPaints = 0;
const toast = document.getElementById('toast');
const speed = document.getElementById('speed'), district = document.getElementById('district'), weaponLabel = document.getElementById('weapon'), radioLabel = document.getElementById('radio'), stars = document.getElementById('stars');
const weaponNames = ['Sidearm', 'Compact SMG', 'Longarm'];

function showToast(message) { toast.textContent = message; toast.classList.add('visible'); toastTimer = 2.4; }
function setMode(next) {
  mode = next; title.hidden = next !== 'title'; pause.hidden = next !== 'paused'; busted.hidden = next !== 'busted'; hud.hidden = next !== 'playing';
  if (next === 'title' || next === 'paused' || next === 'busted') document.exitPointerLock?.();
}
function begin() { if (player.inVehicle) player.inVehicle.occupied = false; player.inVehicle = null; player.avatar.visible = true; player.position.set(-100, 0, 0); player.cameraYaw = 0; player.yaw = 0; elapsed = 0; wanted = 0; wantedFiveTimer = 0; setMode('playing'); }
function togglePause() { if (mode === 'playing') setMode('paused'); else if (mode === 'paused') setMode('playing'); }
function useInteraction() {
  if (player.inVehicle) { exit(); showToast('On foot'); return; }
  const owned = playerCars.filter((car) => !car.occupied).map((car) => car.root.position.distanceToSquared(player.position) < 34 ? car : null).find(Boolean);
  const near = traffic.nearest(player.position, 5.7) ?? owned;
  if (!near) { showToast('No ride nearby'); return; }
  if (near.ai) traffic.remove(near);
  enter(near); showToast('Stole ' + near.name); wanted = Math.min(5, wanted + (near.type === 'police' ? 2 : 1));
}
function actions() {
  const pressed = input.takeAll();
  if (pressed.has(ACTION.PAUSE)) { if (mode === 'title') begin(); else togglePause(); }
  if (pressed.has(ACTION.CONFIRM)) { if (mode === 'title' || mode === 'busted') begin(); else if (mode === 'paused') setMode('playing'); }
  if (pressed.has(ACTION.INTERACT) && mode === 'playing') useInteraction();
  if (pressed.has(ACTION.WEAPON1)) { player.weapon = 0; weapon = weaponNames[0]; showToast('Sidearm selected'); }
  if (pressed.has(ACTION.WEAPON2)) { player.weapon = 1; weapon = weaponNames[1]; showToast('Compact SMG selected'); }
  if (pressed.has(ACTION.WEAPON3)) { player.weapon = 2; weapon = weaponNames[2]; showToast('Longarm selected'); }
  if (pressed.has(ACTION.RELOAD)) showToast('Magazine checked');
  if (pressed.has(ACTION.RADIO)) { radio = radio === 'Sable FM' ? 'Citrus AM' : 'Sable FM'; audio.radio(); showToast('Radio: ' + radio); }
  if (pressed.has(ACTION.ACTIVITY)) { player.activity = player.activity === 'Free roam' ? 'Street race' : 'Free roam'; showToast(player.activity === 'Street race' ? 'Activity: Sunset Sprint' : 'Activity cleared'); }
  if (pressed.has(ACTION.DAY)) dayCycle = !dayCycle;
  if (pressed.has(ACTION.HORN)) { if (player.inVehicle) { player.inVehicle.setHorn(); audio.horn(); } showToast('Honk!'); }
}
function updateHud() {
  const current = player.inVehicle;
  speed.textContent = current ? Math.round(Math.abs(current.speed) * 3.6) + ' KM/H' : 'ON FOOT';
  const x = player.position.x, z = player.position.z;
  const zone = world.city.districtZones.find((d) => x >= d.x[0] && x <= d.x[1] && z >= d.z[0] && z <= d.z[1]);
  district.textContent = zone?.name ?? 'Vista Bay'; weaponLabel.textContent = weapon; radioLabel.textContent = radio; stars.textContent = '★'.repeat(wanted) + '☆'.repeat(5 - wanted);
}
function simulate(dt) {
  elapsed += dt; world.update(dt, dayCycle); actions();
  if (mode !== 'playing') return;
  if (player.inVehicle) {
    const car = player.inVehicle; updateVehicle(car, input, dt);
    for (const obstacle of traffic.traffic) if (car.root.position.distanceToSquared(obstacle.root.position) < 8 && applyVehicleCollision(car, Math.abs(car.speed))) { obstacle.speed *= 0.45; wanted = Math.min(5, wanted + 1); }
    for (const collider of world.city.colliders) {
      if (car.root.position.x > collider.minX - 1 && car.root.position.x < collider.maxX + 1 && car.root.position.z > collider.minZ - 1 && car.root.position.z < collider.maxZ + 1 && applyVehicleCollision(car, Math.abs(car.speed))) {
        const sides = [
          [Math.abs(car.root.position.x - (collider.minX - 1.3)), 'x', collider.minX - 1.3],
          [Math.abs(car.root.position.x - (collider.maxX + 1.3)), 'x', collider.maxX + 1.3],
          [Math.abs(car.root.position.z - (collider.minZ - 1.3)), 'z', collider.minZ - 1.3],
          [Math.abs(car.root.position.z - (collider.maxZ + 1.3)), 'z', collider.maxZ + 1.3],
        ].sort((a, b) => a[0] - b[0]);
        car.root.position[sides[0][1]] = sides[0][2];
      }
    }
    car.root.position.x = THREE.MathUtils.clamp(car.root.position.x, -590, 590); car.root.position.z = THREE.MathUtils.clamp(car.root.position.z, -590, 590); syncVehicle(dt, world);
  } else move(dt, input, world);
  traffic.update(dt, player.position, player.inVehicle);
  if (wanted > 0 && Math.floor(elapsed / 18) > Math.floor((elapsed - dt) / 18)) wanted = Math.max(0, wanted - 1);
  wantedFiveTimer = wanted === 5 ? wantedFiveTimer + dt : 0;
  if (wantedFiveTimer > 14) { wanted = 0; player.inVehicle = null; respawn(world.city.spawnPoints[0]); setMode('busted'); }
  toastTimer = Math.max(0, toastTimer - dt); toast.classList.toggle('visible', toastTimer > 0); updateHud();
}

function frame(now) {
  requestAnimationFrame(frame); const dt = Math.min(Math.max(0, (now - frame.last) / 1000 || 0), MAX_FRAME); frame.last = now;
  if (params.has('shot')) {
    if (shotPaints === 0) { begin(); player.position.set(0, 0, 0); player.cameraYaw = 0.8; for (let i = 0; i < 8; i++) simulate(1 / 60); }
    if (params.get('shot') === 'drive') { enter(playerCars[0]); playerCars[0].root.position.set(-17, 0, -20); playerCars[0].yaw = -0.5; playerCars[0].root.rotation.y = -0.5; playerCars[0].speed = 18; }
    world.renderer.render(world.scene, world.camera); shotPaints++; if (shotPaints >= 2) window.__shotReady = true; return;
  }
  if (mode === 'title' || mode === 'playing') simulate(dt); else actions();
  world.renderer.render(world.scene, world.camera);
}
frame.last = performance.now();
document.getElementById('start').addEventListener('click', begin);
document.getElementById('resume').addEventListener('click', () => setMode('playing'));
document.getElementById('restart').addEventListener('click', begin);
window.addEventListener('resize', () => world.resize());
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'playing') setMode('paused'); });
setMode('title'); updateHud(); requestAnimationFrame(frame);
