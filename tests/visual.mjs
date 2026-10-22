// Capturas visuais rapidas (Playwright + Edge). Uso: node tests/visual.mjs [url]
// Gera tests/capturas/v_*.png: vista geral, estacao, praca, entardecer, noite e caminhada.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.argv[2] || 'http://localhost:5173/';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'msedge', headless: !process.env.HEADED,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') });
const status = () => page.evaluate(() => document.querySelector('#status').textContent);

await page.goto(APP);
await page.waitForFunction(() => window.__ct?.ready, null, { timeout: 180000 });
await page.evaluate(() => document.querySelector('#layers')?.classList.add('closed'));
await wait(4000); await shot('v_01_geral'); console.log('geral', await status());
const only = process.env.ONLY;
for (const [i, n] of [[2, 'v_02_cena2'], [3, 'v_03_estacao'], [6, 'v_04_praca']]) {
  if (only && !only.includes(n)) continue;
  await page.evaluate((k) => window.__ct.flyToScene(k), i); await wait(5500);
  await page.evaluate(() => document.querySelector('#info').classList.add('hidden'));
  await shot(n); console.log(n, await status());
}
await page.evaluate(() => window.__ct.applySun(18.75)); await wait(1200); await shot('v_05_entardecer');
await page.evaluate(() => window.__ct.applySun(20.25)); await wait(1200); await shot('v_06_noite'); console.log('noite', await status());
await page.evaluate(() => window.__ct.applySun(9.5));
await page.evaluate(() => window.__ct.setMode('walk')); await wait(1500);
await page.evaluate(() => document.querySelector('#walkhint').classList.add('hidden'));
await shot('v_07_caminhada'); console.log('walk', await status(), await page.evaluate(() => window.__ct.camera.position.toArray().map((v) => v.toFixed(1)).join(',')));
console.log('ERROS', JSON.stringify(errors.slice(0, 8)));
await browser.close();
