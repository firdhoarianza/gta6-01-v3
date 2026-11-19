// Scene and lighting lifecycle. The city itself is a static procedural scene; only water and sun evolve.
import { COLORS, WORLD, CAMERA } from './config.js';
import { createCity } from './city.js';

const THREE = globalThis.THREE;

export function createWorld(rng) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.sky, WORLD.fogNear, WORLD.fogFar);
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, innerWidth / innerHeight, 0.1, 2600);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7)); renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  const hemi = new THREE.HemisphereLight('#ffe2d0', '#344a53', 1.1); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffd6ac', 3.2); sun.position.set(-360, 420, -520); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -480; sun.shadow.camera.right = 480; sun.shadow.camera.top = 480; sun.shadow.camera.bottom = -480; sun.shadow.camera.far = 1200; sun.shadow.bias = -0.00025; scene.add(sun);
  const fill = new THREE.DirectionalLight('#8dd8e5', 0.65); fill.position.set(280, 100, 360); scene.add(fill);
  const city = createCity(scene, rng);
  const waterBase = city.waterMat.emissiveIntensity;
  let elapsed = 0;
  function update(dt, cycle = true) {
    elapsed += dt;
    const t = cycle ? (elapsed / WORLD.sunCycleSeconds) * Math.PI * 2 : 0.42;
    const wave = Math.sin(t - 0.5);
    sun.position.set(-360 + Math.cos(t) * 300, 130 + (wave + 1) * 250, -520 + Math.sin(t) * 210);
    sun.intensity = 1.15 + Math.max(0, wave) * 2.15;
    hemi.intensity = 0.55 + Math.max(0, wave) * 0.75;
    city.waterMat.emissiveIntensity = waterBase + 0.12 + Math.sin(elapsed * 1.6) * 0.09;
    city.waterMat.roughness = 0.25 + Math.sin(elapsed * 0.8) * 0.04;
    const dusk = new THREE.Color(COLORS.dusk), sunset = new THREE.Color(COLORS.sky), nightColor = new THREE.Color('#111b35');
    const color = wave < -0.35 ? nightColor : dusk.clone().lerp(sunset, Math.max(0, Math.min(1, (wave + 0.35) * 1.6)));
    scene.background.copy(color); scene.fog.color.copy(color); scene.fog.near = WORLD.fogNear; scene.fog.far = WORLD.fogFar;
    sun.visible = true;
  }
  return { scene, camera, renderer, city, sun, update, resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); } };
}
