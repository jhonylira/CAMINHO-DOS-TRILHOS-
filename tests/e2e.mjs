// Teste ponta a ponta (Playwright + Edge/Chrome do sistema).
// Abre a aplicacao, espera o modelo carregar, percorre os modos e salva capturas em tests/capturas/.
// Uso: node tests/e2e.mjs [url]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.argv[2] || 'http://localhost:5173/';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const errors = [], logs = [];
const results = [];
const ok = (name, pass, extra = '') => { results.push({ name, pass, extra }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL || 'msedge', headless: process.env.HEADED ? false : true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); else logs.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.png') });
const wait = (ms) => page.waitForTimeout(ms);

const t0 = Date.now();
await page.goto(APP);
await page.waitForFunction(() => window.__ct?.ready, null, { timeout: 180000 });
ok('carregamento do modelo GLB', true, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
await wait(4500);
const info = await page.evaluate(() => ({ calls: window.__ct.info().render.calls, tris: window.__ct.info().render.triangles, gl: !!window.__ct.renderer.getContext() }));
ok('WebGL ativo e renderizando', info.gl && info.calls > 0, `${info.calls} draw calls, ${info.tris} triângulos`);
await shot('01_masterplan_vista_geral');

// apresentacao: cenas
await page.click('#modes button[data-mode="tour"]'); await wait(5500); await shot('02_tour_intro');
await page.click('#tPlay'); // pausa auto
for (const i of [3, 5, 6]) {
  await page.evaluate((k) => document.querySelectorAll('#tDots span')[k].click(), i); await wait(5200);
  await shot(`03_tour_cena_${i}`);
}
const tgt = await page.evaluate(() => { const t = window.__ct.controls.target; return [t.x, -t.z]; });
ok('cena 6 (praça) posiciona câmera no alvo correto', Math.hypot(tgt[0] - 99.75, tgt[1] - 70.75) < 1, JSON.stringify(tgt.map((v) => v.toFixed(2))));
await page.click('#tExit'); await wait(400);

// planta 2D + sincronizacao
await page.click('#modes button[data-mode="plan"]'); await wait(1500);
await page.click('#btnHome'); await wait(2500); await shot('04_planta_proposta');
await page.click('#planbar button[data-pv="comparar"]'); await wait(3500); await shot('05_planta_comparar_ortofoto');
await page.click('#planbar button[data-pv="existente"]'); await wait(2500); await shot('06_planta_existente');
await page.click('#planbar button[data-pv="proposta"]');
// clique no hotspot da estacao na planta -> abrir em 3D
await page.click('#infoClose');
const hs = page.locator('.hs').nth(1); // hotspot 2 = estacao (ordem de content.ts)
await hs.click(); await wait(1500); await shot('07_planta_estacao_zoom');
await page.locator('#info .go').click(); await wait(5000);
const t2 = await page.evaluate(() => { const t = window.__ct.controls.target; return [t.x, -t.z]; });
ok('sincronização 2D→3D: estação', Math.hypot(t2[0] - 108, t2[1] - 65) < 1.5, JSON.stringify(t2.map((v) => v.toFixed(1))));
await shot('08_estacao_3d');

// caminhada (sem pointer lock em headless: simula teclas)
await page.click('#modes button[data-mode="walk"]'); await wait(800);
const p0 = await page.evaluate(() => window.__ct.camera.position.toArray());
await page.evaluate(() => document.querySelector('#walkhint').classList.add('hidden'));
await page.keyboard.down('KeyW'); await wait(2500); await page.keyboard.up('KeyW');
const p1 = await page.evaluate(() => window.__ct.camera.position.toArray());
const moved = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
ok('caminhada: WASD desloca a câmera', moved > 1, `${moved.toFixed(2)} m · altura olho ${p1[1].toFixed(2)} m`);
await shot('09_caminhada');

// vista geral
await page.click('#btnHome'); await wait(4000); await shot('10_vista_geral_retorno');

// responsivo
await page.setViewportSize({ width: 820, height: 1180 }); await wait(2500); await shot('11_tablet');
await page.setViewportSize({ width: 390, height: 844 }); await wait(2500); await shot('12_celular');

const fps = await page.evaluate(() => document.querySelector('#status').textContent);
ok('sem erros de JavaScript/WebGL', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log('STATUS', fps);
fs.writeFileSync(path.join(OUT, 'resultado.json'), JSON.stringify({ url: APP, results, errors, status: fps }, null, 1));
await browser.close();
process.exit(results.every((r) => r.pass) ? 0 : 1);

