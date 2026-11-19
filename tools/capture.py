#!/usr/bin/python3
"""Capture deterministic Vista Bay bounty screenshots with the local static server."""

from pathlib import Path
import glob
import subprocess

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SCREENSHOTS = ROOT / 'screenshots'
PORT = 8123
SHOTS = (
    ('start', '1-start.jpg'),
    ('play', '2-play.jpg'),
    ('end', '3-end.jpg'),
)


def chromium_path():
    candidates = glob.glob(str(Path.home() / '.cache/ms-playwright/chromium-*/chrome-linux/chrome'))
    candidates.extend(glob.glob(str(Path.home() / '.cache/ms-playwright/chromium-*/chrome-linux64/chrome')))
    if not candidates:
        raise FileNotFoundError('Playwright Chromium was not found under ~/.cache/ms-playwright')
    return candidates[-1]


def main():
    SCREENSHOTS.mkdir(parents=True, exist_ok=True)
    server = subprocess.Popen(
        ['node', 'serve.ts', '--port', str(PORT)],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    collected_errors = []

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True,
                executable_path=chromium_path(),
                args=['--use-gl=angle', '--use-angle=swiftshader'],
            )
            page = browser.new_page(viewport={'width': 960, 'height': 540}, device_scale_factor=1)
            page.on('console', lambda message: collected_errors.append('console: ' + message.text) if message.type == 'error' else None)
            page.on('pageerror', lambda error: collected_errors.append('page: ' + str(error)))

            for shot_name, filename in SHOTS:
                url = f'http://127.0.0.1:{PORT}/index.html?shot={shot_name}&seed=1'
                page.goto(url, wait_until='load', timeout=60000)
                page.wait_for_function('window.__SHOT_READY__ === true', timeout=300000)
                page.evaluate('window.requestAnimationFrame = () => 0')
                page.screenshot(path=str(SCREENSHOTS / filename), type='jpeg', quality=82)
                frame_count = page.evaluate('window.__SHOT_FRAME_COUNT__')
                print(f'captured {filename} at {frame_count} frames')

            browser.close()
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()
        if server.stdout:
            server.stdout.close()

    print('Collected browser errors:')
    if collected_errors:
        for error in collected_errors:
            print(error)
    else:
        print('(none)')


if __name__ == '__main__':
    main()
