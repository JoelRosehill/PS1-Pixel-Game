// Headless movement test: drives the character with real key events and measures
// what the controller actually does. Run after touching PlayerController.
//
//   npm run movetest
//
// Prints one line per scenario with measured values and a PASS/FAIL verdict.
import { browserPath, launchArgs, logicQuery } from './browser.mjs';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';

const chrome = browserPath();

const server = await createServer({ logLevel: 'error', server: { port: 5196, strictPort: false } });
await server.listen();
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: launchArgs(),
});
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 540 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${server.resolvedUrls.local[0]}?shot=1&frames=8${logicQuery}`, { waitUntil: 'load' });
await page.waitForFunction('window.__ready === true || !!window.__error');

const read = () =>
  page.evaluate(() => {
    const c = window.__game.player.controller;
    return {
      x: c.position.x, y: c.position.y, z: c.position.z,
      vx: c.velocity.x, vy: c.velocity.y, vz: c.velocity.z,
      speed: c.speed, state: c.state, grounded: c.grounded, dash: c.dashCharges,
      ground: window.__game.level.heightAt(c.position.x, c.position.z),
    };
  });
const setup = (x, y, z, yawDeg) =>
  page.evaluate((x, y, z, yaw) => {
    const g = window.__game;
    g.player.controller.teleport(x, y, z, yaw);
    g.player.camera.setYaw(yaw, -0.1);
    g.player.controller.cameraYaw = yaw;
  }, x, y, z, (yawDeg * Math.PI) / 180);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** Runs `ms` of real time while sampling the controller each frame. */
const sample = async (ms) => {
  const samples = await page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const c = window.__game.player.controller;
        const out = [];
        const t0 = performance.now();
        const tick = () => {
          out.push({ y: c.position.y, x: c.position.x, z: c.position.z, speed: c.speed, vy: c.velocity.y, state: c.state, grounded: c.grounded });
          if (performance.now() - t0 < ms) requestAnimationFrame(tick);
          else resolve(out);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
  return samples;
};

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔ PASS' : '✘ FAIL'}  ${name.padEnd(22)} ${detail}`);
};

// 1. Spawn settles on the ground
await setup(6, 6, 11, 180);
await wait(700);
let s = await read();
check('spawn settles', s.grounded && Math.abs(s.y - s.ground) < 0.15,
  `y=${s.y.toFixed(2)} ground=${s.ground.toFixed(2)} state=${s.state}`);

// 2. Run speed on flat ground
await setup(6, 3, 11, 180);
await wait(300);
const startRun = await read();
await page.keyboard.down('w');
const runSamples = await sample(1500);
await page.keyboard.up('w');
const endRun = await read();
const runDist = Math.hypot(endRun.x - startRun.x, endRun.z - startRun.z);
const topRun = Math.max(...runSamples.map((r) => r.speed));
check('run speed', topRun > 8 && topRun < 10.5 && runDist > 9,
  `top=${topRun.toFixed(2)} m/s dist=${runDist.toFixed(1)} m`);

// 3. Jump height and airtime
await setup(6, 3, 11, 180);
await wait(400);
const beforeJump = await read();
await page.keyboard.down(' ');
const jumpSamples = await sample(1400);
await page.keyboard.up(' ');
const apex = Math.max(...jumpSamples.map((r) => r.y)) - beforeJump.y;
const airFrames = jumpSamples.filter((r) => !r.grounded).length;
check('jump apex (held)', apex > 1.8 && apex < 2.8, `apex=${apex.toFixed(2)} m airborne≈${(airFrames / 60).toFixed(2)} s`);

// 3b. Tapping gives a deliberately shorter hop
await setup(6, 3, 11, 180);
await wait(400);
const beforeTap = await read();
await page.keyboard.press(' ');
const tapSamples = await sample(900);
const tapApex = Math.max(...tapSamples.map((r) => r.y)) - beforeTap.y;
check('jump apex (tapped)', tapApex > 0.8 && tapApex < apex - 0.4, `apex=${tapApex.toFixed(2)} m vs held ${apex.toFixed(2)} m`);

// 4. Dash burst + charge spend
await setup(6, 3, 11, 180);
await wait(300);
await page.keyboard.down('w');
await wait(200);
await page.keyboard.down('Shift');
const dashSamples = await sample(400);
await page.keyboard.up('Shift');
await page.keyboard.up('w');
const dashPeak = Math.max(...dashSamples.map((r) => r.speed));
const afterDash = await read();
check('dash burst', dashPeak > 20 && afterDash.dash === 2, `peak=${dashPeak.toFixed(1)} m/s charges=${afterDash.dash}`);

// 5. Slide boost from a run
await setup(6, 3, 11, 180);
await wait(300);
await page.keyboard.down('w');
await wait(900);
await page.keyboard.down('Control');
const slideSamples = await sample(500);
await page.keyboard.up('Control');
await page.keyboard.up('w');
const slidePeak = Math.max(...slideSamples.map((r) => r.speed));
const slid = slideSamples.some((r) => r.state === 'slide');
check('slide boost', slid && slidePeak > 10.5, `peak=${slidePeak.toFixed(1)} m/s entered=${slid}`);

// 6. Wall-jump inside the trial shaft (walls at x≈69, z=±2.5 of course centre 64,10)
await setup(69, 6, 12.0, 180);
await wait(400);
await page.keyboard.down('w'); // push toward the +z wall
await wait(250);
let wallState = await read();
await page.keyboard.down(' ');
const wallSamples = await sample(700);
await page.keyboard.up(' ');
await page.keyboard.up('w');
const wallGain = Math.max(...wallSamples.map((r) => r.y)) - wallState.y;
const sawWall = wallState.state === 'wall' || wallSamples.some((r) => r.state === 'wall');
check('wall jump', sawWall && wallGain > 1.2, `contact=${sawWall} rise=${wallGain.toFixed(2)} m`);

// 7. Step up a curb (plaza edge) instead of stopping
await setup(15.5, 3, 0, 270);
await wait(300);
const beforeStep = await read();
await page.keyboard.down('w');
await sample(1200);
await page.keyboard.up('w');
const afterStep = await read();
check('step up curb', Math.hypot(afterStep.x - beforeStep.x, afterStep.z - beforeStep.z) > 5,
  `moved=${Math.hypot(afterStep.x - beforeStep.x, afterStep.z - beforeStep.z).toFixed(1)} m y=${afterStep.y.toFixed(2)}`);

// 8. Slide down the trial ramp gains speed (ramp runs from x≈52 down to x≈45)
await setup(56, 12, 10, 90);
await wait(600);
const rampTop = await read();
await page.keyboard.down('w');
await wait(250);
await page.keyboard.down('Control');
const rampSamples = await sample(1400);
await page.keyboard.up('Control');
await page.keyboard.up('w');
const rampPeak = Math.max(...rampSamples.map((r) => r.speed));
check('ramp slide gains', rampPeak > 13, `peak=${rampPeak.toFixed(1)} m/s from y=${rampTop.y.toFixed(1)}`);

// 9. Deep water switches to swimming and floats the player to the surface
await setup(0, 4, -26, 0);
await wait(1600);
const swimState = await read();
check('swims in the canal', swimState.state === 'swim' && swimState.y > -1.6 && swimState.y < 0.4,
  `state=${swimState.state} y=${swimState.y.toFixed(2)}`);

// 10. Nothing fell through the world or went NaN
s = await read();
const sane = Number.isFinite(s.x) && Number.isFinite(s.y) && s.y > -20;
check('no NaN / fall-through', sane, `pos=(${s.x.toFixed(1)}, ${s.y.toFixed(1)}, ${s.z.toFixed(1)})`);
if (errors.length) console.log('page errors:', errors.join(' | '));

await browser.close();
await server.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed || errors.length ? 1 : 0);
