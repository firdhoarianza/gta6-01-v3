// Vista Bay — Low Tide is an original, static Three.js open-world crime sandbox.
// This Node 22 entry preflights the offline game and screenshots, then hands them in.
// It copies game/ and screenshots/ beside this file to the selected output directory and
// writes dossier.json with the byte-identical make.fun game library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

// Offline entry preflight and local URL.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const requiredFiles = [
  'game/index.html',
  'game/vendor/three.min.js',
  'screenshots/1-start.jpg',
  'screenshots/2-play.jpg',
  'screenshots/3-end.jpg',
];
const portIndex = process.argv.indexOf('--port');
const requestedPort = portIndex < 0 ? 8080 : Number(process.argv[portIndex + 1]);
const port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort < 65536 ? requestedPort : 8080;
const missingFiles = requiredFiles.filter((path) => !existsSync(join(here, path)));

console.log(`Vista Bay is served at http://localhost:${port}`);
if (missingFiles.length > 0) {
  console.error(`Cannot build dossier; required files are missing: ${missingFiles.join(', ')}`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
