// Bounded procedural impact effects for shots, crashes, and vehicle fire.
const THREE = globalThis.THREE;

const MAX_PARTICLES = 72;
const PARTICLE_LIFETIME = 1.15;
const SMOKE_LIFETIME = 1.8;
const MAX_BURST_COUNT = 28;

function makeParticleMaterial() {
  return new THREE.PointsMaterial({
    color: '#ffca84',
    size: 0.24,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
}

function createParticlePool(scene) {
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setDrawRange(0, 0);
  const material = makeParticleMaterial();
  material.vertexColors = true;
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  return { positions, colors, geometry, material, points };
}

/** Emits finite bursts into a single reusable point cloud. */
export function createEffects(scene, rng) {
  const pool = createParticlePool(scene);
  const particles = [];
  const sparkColor = new THREE.Color('#ffd18e');
  const emberColor = new THREE.Color('#ef755e');
  const smokeColor = new THREE.Color('#76818a');

  function burst(position, options = {}) {
    const count = Math.max(1, Math.min(MAX_BURST_COUNT, Math.floor(options.count ?? 12)));
    const speed = Math.max(1, options.speed ?? 5);
    const kind = options.kind ?? 'spark';
    const color = kind === 'smoke' ? smokeColor : kind === 'ember' ? emberColor : sparkColor;
    for (let index = 0; index < count; index += 1) {
      if (particles.length >= MAX_PARTICLES) {
        particles.shift();
      }
      const theta = rng.range(0, Math.PI * 2);
      const vertical = rng.range(-0.35, 1.15);
      const direction = new THREE.Vector3(Math.cos(theta), vertical, Math.sin(theta)).normalize();
      particles.push({
        position: new THREE.Vector3(position.x, position.y, position.z),
        velocity: direction.multiplyScalar(rng.range(speed * 0.35, speed)),
        age: 0,
        life: rng.range(0.38, kind === 'smoke' ? SMOKE_LIFETIME : PARTICLE_LIFETIME),
        drag: kind === 'smoke' ? 0.76 : 0.9,
        gravity: kind === 'smoke' ? 0.2 : -8.6,
        color: color.clone().multiplyScalar(rng.range(0.72, 1.18)),
      });
    }
  }

  function explosion(position, scale = 1) {
    burst(position, { count: Math.floor(18 * scale), speed: 9 * scale, kind: 'ember' });
    burst(position, { count: Math.floor(12 * scale), speed: 3.2 * scale, kind: 'smoke' });
  }

  function smokePool(position, radius = 1) {
    burst(position, { count: Math.floor(16 * Math.max(0.35, radius)), speed: Math.max(1.1, radius * 2.4), kind: 'smoke' });
  }

  function update(dt) {
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.age += dt;
      if (particle.age >= particle.life) {
        particles.splice(index, 1);
        continue;
      }
      particle.velocity.multiplyScalar(Math.exp(-particle.drag * dt));
      particle.velocity.y += particle.gravity * dt;
      particle.position.addScaledVector(particle.velocity, dt);
    }
    const positions = pool.positions;
    const colors = pool.colors;
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      const offset = index * 3;
      positions[offset] = particle.position.x;
      positions[offset + 1] = particle.position.y;
      positions[offset + 2] = particle.position.z;
      const fade = 1 - particle.age / particle.life;
      const growth = particle.life > 0.8 ? 0.72 + (1 - fade) * 0.28 : 1;
      colors[offset] = particle.color.r * fade * growth;
      colors[offset + 1] = particle.color.g * fade * growth;
      colors[offset + 2] = particle.color.b * fade * growth;
    }
    pool.geometry.setDrawRange(0, particles.length);
    pool.geometry.attributes.position.needsUpdate = true;
    pool.geometry.attributes.color.needsUpdate = true;
    pool.material.opacity = particles.length ? Math.min(0.92, particles.length / 14) : 0;
    pool.material.size = particles.length ? 0.19 + Math.min(0.1, particles.length * 0.001) : 0.19;
  }

  function dispose() {
    scene.remove(pool.points);
    pool.geometry.dispose();
    pool.material.dispose();
    particles.length = 0;
  }

  return { burst, explosion, smokePool, update, dispose, particles };
}
