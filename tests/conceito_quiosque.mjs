// Captura limpa do explorador no enquadramento da camera original R10_VARIANTE_PEDESTRE_QUIOSQUE (cameras.json, coords three).
// Uso: node tests/conceito_quiosque.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'capturas', 'conceito_raw');
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.25 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const APP = process.argv[2] || 'http://localhost:5173/';
await page.goto(APP);
await page.waitForFunction(() => window.__ct?.ready, null, { timeout: 240000 });
await page.addStyleTag({ content: `#topbar,#layers,#minimap,#status,#info,#labels,#tourbar,#walkhint,#planbar,#settings,#splitter,#touchpad,#loader,.study-notice{display:none!important}` });
await page.waitForTimeout(3000);
const views = [
  ['rt_quiosque_pedestre', [153, 1.85, -61.5], [153 + 0.852 * 20, 1.85 - 0.046 * 20, -61.5 + 0.522 * 20]],
  ['rt_quiosque_aereo', [128, 26, -24], [168, 0, -54]],
];
for (const [n, p, t] of views) {
  await page.evaluate(([p, t]) => { const c = window.__ct; c.applySun(9.5); c.camera.position.set(...p); c.controls.target.set(...t); c.controls.update(); }, [p, t]);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, n + '.png') }); console.log('ok', n);
}
console.log('ERROS', JSON.stringify(errors));
await browser.close();
