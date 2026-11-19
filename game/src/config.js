// Shared world scale and tuning. Distances are metres; Y is up.
export const CITY = { size: 1200, half: 600, block: 100, road: 12, avenue: 22, sidewalk: 4, ocean: 4200 };
export const PLAYER = { walk: 6.2, sprint: 10.8, jump: 7.2, gravity: 20, radius: 0.62, height: 1.8, crouchHeight: 1.15, avoidanceRadius: 1.15 };
export const CAMERA = { distance: 8.4, height: 3.1, lookHeight: 1.2, sensitivity: 0.0022, smooth: 9.2, fov: 68, collisionRadius: 0.32 };
export const VEHICLE = { accel: 19, brake: 28, maxSpeed: 34, reverseSpeed: 10, steer: 1.92, grip: 6.8, driftGrip: 2.1, collision: 0.65 };
export const WORLD = { fogNear: 260, fogFar: 1450, sunCycleSeconds: 240, rainParticleCount: 280, particleLimit: 72, pursuitGraceSeconds: 4.2 };
export const COLORS = {
  sky: '#ef8c79', dusk: '#402b57', ocean: '#086f82', water: '#22b4b2', sand: '#ddbd8d',
  asphalt: '#303540', lane: '#d7b675', sidewalk: '#77777a', grass: '#3d6652',
  neonPink: '#ff4e9b', neonCyan: '#50e2e2', gold: '#ffc56c', white: '#fff2d9', ink: '#12131c',
  panel: 'rgba(9,12,22,.82)',
};
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const SHOT_SCENES = ['start', 'play', 'end'];
