// Capturas LIMPAS (sem interface) do explorador em tempo real, para a Pagina Conceito.
// Uso: node tests/conceito_capturas.mjs [url] [pastaSaida]
// Esconde barra, camadas, minimapa e rotulos; voa para as cenas do tour e fotografa.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.argv[2] || 'http://localhost:5173/';
const OUT = process.argv[3] || path.join(path.dirname(fileURLToPath(import.meta.url)), 'capturas', 'conceito_raw');
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.25 });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') });

await page.goto(APP);
try { await page.waitForFunction(() => window.__ct?.ready, null, { timeout: 240000 }); }
catch (e) {
  console.log('TIMEOUT', await page.evaluate(() => document.querySelector('#lmsg')?.textContent), JSON.stringify(errors.slice(0, 10)));
  await page.screenshot({ path: path.join(OUT, '_timeout.png') }); await browser.close(); process.exit(1);
}
await page.addStyleTag({ content: `#topbar,#layers,#minimap,#status,#info,#labels,#tourbar,#walkhint,#planbar,#settings,#splitter,#touchpad,#loader{display:none!important}` });
await wait(3000);
const plan = [[0, 'rt_geral'], [2, 'rt_corredor'], [3, 'rt_estacao'], [4, 'rt_estacionamento'], [5, 'rt_oeste'], [6, 'rt_cafe'], [7, 'rt_consolidado']];
for (const [i, n] of plan) {
  await page.evaluate((k) => window.__ct.flyToScene(k), i); await wait(5500);
  await page.evaluate(() => document.querySelector('#info')?.classList.add('hidden'));
  await shot(n); console.log('ok', n);
}
// Dia e noite no enquadramento da estacao (cena 3)
await page.evaluate(() => window.__ct.flyToScene(3)); await wait(5500);
for (const [h, n] of [[9.5, 'rt_estacao_manha'], [18.75, 'rt_estacao_entardecer'], [20.25, 'rt_estacao_noite']]) {
  await page.evaluate((x) => window.__ct.applySun(x), h); await wait(1800); await shot(n); console.log('ok', n);
}
await page.evaluate(() => window.__ct.flyToScene(6)); await wait(5500);
await page.evaluate(() => window.__ct.applySun(20.25)); await wait(1800); await shot('rt_cafe_noite');
await page.evaluate(() => window.__ct.applySun(9.5));
await page.evaluate(() => window.__ct.setMode('walk')); await wait(1800);
await page.addStyleTag({ content: `#walkhint{display:none!important}` });
await shot('rt_caminhada');
console.log('ERROS', JSON.stringify(errors.slice(0, 8)));
await browser.close();
