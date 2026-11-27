// Take the four competition screenshots of Sunset Courier with the
// sandboxed Chromium. Usage: node screenshot.mjs
// Shots (first by name is the cover): 1-chase.jpg, 2-cockpit.jpg,
// 3-ring.jpg, 4-landing.jpg. Each is a real render of the game's own code,
// driven by the ?shot= presets in game/src/main.js.
import { chromium } from '/opt/muse/assets/spaces/ts-runtime/dist/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameDir = path.join(here, 'game');
const outDir = path.join(here, 'screenshots');
const policyPath = '/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt';
const policy = fs.readFileSync(policyPath);

const SHOTS = [
  ['1-chase.jpg', 'chase'],
  ['2-cockpit.jpg', 'cockpit'],
  ['3-ring.jpg', 'ring'],
  ['4-landing.jpg', 'landing'],
];

const browser = await chromium.launch({
  headless: true,
  executablePath: '/opt/hatch/bin/hatch-chromium-sandbox',
  chromiumSandbox: true,
  args: [
    '--disable-sync', '--disable-domain-reliability', '--disable-component-update',
    '--disable-http2', '--disable-quic',
    '--webrtc-ip-handling-policy=disable_non_proxied_udp', '--force-webrtc-ip-handling-policy',
    '--disable-features=AcceptCHFrame,AvoidUnnecessaryBeforeUnloadCheckSync,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,OptimizationHints,OptimizationGuideModelDownloading,AutofillServerCommunication,HatchFortress',
    `--hatch-webgl-allowed-domains-file=${policyPath}`,
    `--hatch-webgl-allowed-domains-sha256=${crypto.createHash('sha256').update(policy).digest('hex')}`,
    `--hatch-sandbox-read=${here}`,
    '--enable-unsafe-swiftshader',
  ],
});

const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const errors = [];
for (const [name, shot] of SHOTS) {
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(name + ' pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(name + ' console: ' + m.text());
  });
  const url = 'file://' + path.join(gameDir, 'index.html') + '?shot=' + shot;
  await page.goto(url, { waitUntil: 'load', timeout: 30000 });
  // Let the renderer warm up and the plane settle into the shot.
  await page.waitForTimeout(6000);
  const info = await page.evaluate(() => {
    const s = window.__SF.state;
    return {
      screen: window.__SF.screen,
      alt: Math.round(s.y - window.__SF.terrain.heightAt(s.x, s.z)),
      speed: Math.round(s.speed * 3.6),
      heading: Math.round(window.__SF.flight.headingDegrees()),
    };
  });
  const outPath = path.join(outDir, name);
  await page.screenshot({ path: outPath, type: 'jpeg', quality: 80 });
  console.log(name, JSON.stringify(info), 'bytes:', fs.statSync(outPath).size);
  await page.close();
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
