# Vista Bay — Low Tide

[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun)
[![rank](https://make.fun/badge/gta6-01/firdhoarianza/gta6-01-v3/rank.svg)](https://make.fun)
[![reward](https://make.fun/badge/gta6-01/firdhoarianza/gta6-01-v3/reward.svg)](https://make.fun)

An original, deterministic coastal city sandbox about the last warm hour before night. Walk or take a car through Vista Bay's six districts, weave between traffic, build wanted heat, and find your own route through a sunlit crime story. Every city block, vehicle, pedestrian, and weather pass is built locally from seeded procedural systems. The game runs as static files with vendored Three.js and makes no runtime network requests.

## Controls

| Key | Action |
| --- | --- |
| WASD | Walk or drive |
| Shift | Sprint |
| Space | Jump or handbrake |
| E | Enter or exit a vehicle |
| 1 / 2 / 3 | Select weapons |
| R | Reload |
| F | Crouch |
| H | Horn |
| N | Change radio station |
| M | Toggle activity |
| P / Esc | Pause or resume |

## Run

Use Node.js 22 or newer. From the repository root, run node serve.ts and open [http://localhost:8080](http://localhost:8080). The game is served directly from game/; there is no build step.

## Module architecture

- src/main.js boots the world, connects input and HUD, and runs gameplay.
- src/city.js generates the street grid, districts, skyline, waterfront, and landmarks.
- src/world.js owns Three.js rendering, lighting, day cycle, water, and weather.
- src/player.js, src/vehicles.js, src/traffic.js, and src/pedestrians.js simulate movement and city life.
- src/input.js, src/hud.js, and src/menu.js provide controls and interface.
- src/shots.js stages deterministic start, driving, and pursuit scenes for screenshots.
- src/rng.js, src/save.js, src/audio.js, and src/effects.js provide seeded randomness, local progress, sound, and bounded effects.
- vendor/three.min.js is the vendored Three.js r140 runtime.

## Screenshots

The three JPEGs were captured at 960×540 with headless Playwright Chromium against the local server. Each scene uses the shot and seed query parameters for start, play, or end with seed 1, waits for the staged scene to render, then saves JPEG quality 82. tools/capture.py reproduces the captures; shot mode reduces pixel ratio and disables shadows for software-rendered Chromium.

## License

Game source and original game assets are released under the MIT License; see [LICENSE](LICENSE). Three.js remains under its own license in game/vendor/.
