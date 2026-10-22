// Capturas da Pagina Conceito (Playwright + Edge). Uso: node tests/conceito_screens.mjs [url]
// Gera tests/capturas/conceito_*.png em 1600x900 (desktop) e 390x844 (celular) e lista erros do console.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const URL = process.argv[2] || 'http://localhost:5173/conceito.html';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
const browser = await chromium.launch({ channel: 'msedge', headless: true });

async function run(tag, viewport, dpr) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: dpr });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${tag} ${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`${tag} reqfail: ${r.url()}`));
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${tag} HTTP ${r.status()}: ${r.url()}`); });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, `conceito_${tag}_01_hero.png`) });
  // Percorre a pagina para disparar revelacoes e carregamento preguicoso.
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += Math.round(viewport.height * 0.6)) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(160); }
  await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200);
  const shots = ['#percurso', '.route', '#implantacao', '#estacao', '#calcadao', '#quiosques', '#estacionamento', '#floreiras', '#trechos', '#experiencia', '#transparencia'];
  let i = 2;
  for (const s of shots) {
    await page.evaluate((sel) => { const el = document.querySelector(sel); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 52); }, s);
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, `conceito_${tag}_${String(i++).padStart(2, '0')}_${s.slice(1)}.png`) });
  }
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(600);
  await page.close();
}
// Recarregamentos do Vite (HMR de outros arquivos) podem interromper a captura: tenta de novo ate 3 vezes.
async function retry(tag, viewport, dpr) {
  for (let k = 0; k < 3; k++) { try { return await run(tag, viewport, dpr); } catch (e) { console.log('retry', tag, e.message.split('\n')[0]); } }
}
const only = process.argv[3];
if (!only || only === 'desktop') await retry('desktop', { width: 1600, height: 900 }, 1);
if (!only || only === 'mobile') await retry('mobile', { width: 390, height: 844 }, 2);
console.log('ERROS', JSON.stringify(errors, null, 1));
await browser.close();
