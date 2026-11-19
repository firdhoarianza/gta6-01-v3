// Procedural scene lifecycle, day cycle, rain particles, and coastal water.
import { COLORS, WORLD, CAMERA } from './config.js';
import { createCity } from './city.js';

const THREE = globalThis.THREE;

function createRain(scene, rng) {
  const count = 420;
  const positions = new Float32Array(count * 6);
  const velocities = new Float32Array(count);
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.LineBasicMaterial({
    color: '#a8dded',
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  for (let index = 0; index < count; index += 1) {
    const offset = index * 6;
    const x = rng.range(-150, 150);
    const y = rng.range(8, 68);
    const z = rng.range(-150, 150);
    positions[offset] = x;
    positions[offset + 1] = y;
    positions[offset + 2] = z;
    positions[offset + 3] = x - 0.4;
    positions[offset + 4] = y - 2.4;
    positions[offset + 5] = z;
    velocities[index] = rng.range(18, 34);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const rain = new THREE.LineSegments(geometry, material);
  rain.visible = false;
  rain.frustumCulled = false;
  scene.add(rain);
  return { rain, positions, velocities, material, count };
}

function gatherWindowMaterials(city) {
  const materials = new Set();
  for (const collider of city.colliders) {
    const material = collider.mesh?.material;
    if (material?.emissive) {
      materials.add(material);
    }
  }
  return [...materials];
}

/** Creates the renderer, city, lighting, and evolving weather state. */
export function createWorld(rng) {
  const scene = new THREE.Scene();
  const skyDay = new THREE.Color(COLORS.sky);
  const skyDusk = new THREE.Color(COLORS.dusk);
  const skyNight = new THREE.Color('#111b35');
  scene.background = skyDay.clone();
  scene.fog = new THREE.Fog(skyDay, WORLD.fogNear, WORLD.fogFar);
  const camera = new THREE.PerspectiveCamera(CAMERA.fov, innerWidth / innerHeight, 0.1, 2600);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  const hemi = new THREE.HemisphereLight('#ffe2d0', '#344a53', 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffd6ac', 3.2);
  sun.position.set(-360, 420, -520);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -480;
  sun.shadow.camera.right = 480;
  sun.shadow.camera.top = 480;
  sun.shadow.camera.bottom = -480;
  sun.shadow.camera.far = 1200;
  sun.shadow.bias = -0.00025;
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#8dd8e5', 0.65);
  fill.position.set(280, 100, 360);
  scene.add(fill);
  const city = createCity(scene, rng);
  const baseWaterEmissive = city.waterMat.emissiveIntensity;
  const baseWaterRoughness = city.waterMat.roughness;
  const baseRoadColor = city.roadMaterial.color.clone();
  const baseLampIntensity = city.lampMaterial.emissiveIntensity;
  const windowMaterials = gatherWindowMaterials(city);
  const rain = createRain(scene, rng);
  let elapsed = 0;
  let weather = 'clear';
  let nightFactor = 0;
  let fixedTime = null;
  let wetRoads = false;

  function setWeather(nextWeather) {
    weather = nextWeather === 'rain' ? 'rain' : 'clear';
    rain.rain.visible = weather === 'rain';
    wetRoads = weather === 'rain';
    city.waterMat.roughness = wetRoads ? 0.12 : baseWaterRoughness;
    city.roadMaterial.color.set(wetRoads ? '#202c39' : baseRoadColor);
  }

  function toggleWeather() {
    setWeather(weather === 'rain' ? 'clear' : 'rain');
    return weather;
  }

  function cycleFraction(cycle) {
    if (fixedTime !== null) {
      return fixedTime;
    }
    if (!cycle) {
      return 0.42;
    }
    return (elapsed / WORLD.sunCycleSeconds) % 1;
  }

  function updateRain(dt, position) {
    if (!rain.rain.visible) {
      return;
    }
    const values = rain.positions;
    for (let index = 0; index < rain.count; index += 1) {
      const offset = index * 6;
      values[offset + 1] -= rain.velocities[index] * dt;
      values[offset + 4] -= rain.velocities[index] * dt;
      if (values[offset + 1] < 0) {
        values[offset] = position.x + rng.range(-150, 150);
        values[offset + 1] = rng.range(38, 72);
        values[offset + 2] = position.z + rng.range(-150, 150);
        values[offset + 3] = values[offset] - 0.4;
        values[offset + 4] = values[offset + 1] - 2.4;
        values[offset + 5] = values[offset + 2];
      }
    }
    rain.rain.position.set(position.x, 0, position.z);
    rain.rain.geometry.attributes.position.needsUpdate = true;
  }

  function update(dt, cycle = true, followedPosition = { x: 0, z: 0 }) {
    elapsed += dt;
    const fraction = cycleFraction(cycle);
    const angle = fraction * Math.PI * 2 - Math.PI / 2;
    const daylight = Math.max(0, Math.sin(angle));
    const duskAmount = Math.max(0, 1 - Math.abs(daylight) * 2.5);
    const targetNight = daylight < 0.08 ? 1 : 0;
    nightFactor += (targetNight - nightFactor) * (1 - Math.exp(-dt * 0.4));
    sun.position.set(-360 + Math.cos(angle) * 330, 60 + daylight * 500, -520 + Math.sin(angle) * 230);
    sun.intensity = 0.18 + daylight * 3.05;
    hemi.intensity = 0.38 + daylight * 0.9;
    fill.intensity = 0.25 + nightFactor * 0.35;
    const sunset = skyDusk.clone().lerp(skyDay, Math.max(0, daylight));
    const sky = skyNight.clone().lerp(sunset, Math.max(0.18, daylight + duskAmount * 0.42));
    scene.background.copy(sky);
    scene.fog.color.copy(sky);
    scene.fog.near = weather === 'rain' ? WORLD.fogNear * 0.55 : WORLD.fogNear;
    scene.fog.far = weather === 'rain' ? WORLD.fogFar * 0.62 : WORLD.fogFar;
    for (const material of windowMaterials) {
      material.emissiveIntensity = 0.14 + nightFactor * 0.72;
    }
    city.lampMaterial.emissiveIntensity = baseLampIntensity + nightFactor * 1.4;
    city.lampMaterial.emissive.set('#ff9f63');
    city.waterMat.emissiveIntensity = baseWaterEmissive + 0.12 + Math.sin(elapsed * 1.6) * 0.09;
    city.waterMat.roughness = wetRoads ? 0.12 : baseWaterRoughness + Math.sin(elapsed * 0.8) * 0.04;
    city.waterMat.emissive.set('#063d50');
    updateRain(dt, followedPosition);
  }

  function setTimeOfDay(fraction) {
    fixedTime = THREE.MathUtils.euclideanModulo(fraction, 1);
  }

  function resumeCycle() {
    fixedTime = null;
  }

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  }

  return {
    scene,
    camera,
    renderer,
    city,
    sun,
    update,
    setWeather,
    toggleWeather,
    setTimeOfDay,
    resumeCycle,
    get weather() { return weather; },
    get nightFactor() { return nightFactor; },
    resize,
  };
}
