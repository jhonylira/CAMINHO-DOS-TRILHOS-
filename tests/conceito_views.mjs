import { chromium } from 'playwright';
const D = 'C:/Users/projetos2/.gemini/antigravity/brain/009142fa-8047-4a61-971d-79192a77406c/scratch/';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errs = [];
for (const [tag, w, h, sels] of [
  ['d', 1440, 900, ['#por-que', '#conceito', '#trechos', '#masterplan', '#transparencia']],
  ['m', 390, 844, ['#memoria', '#por-que', '#conceito', '#trechos', '#masterplan', '#transparencia']],
]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.goto('http://localhost:5173/conceito.html', { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
  const H = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 500) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(100); }
  await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((e) => e.classList.add('is-in')));
  let i = 0;
  for (const s of sels) {
    await page.evaluate((q) => { const e = document.querySelector(q); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 60); }, s);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${D}v_${tag}_${i++}.png` });
  }
  console.log(tag, 'H', H);
}
console.log('errors', JSON.stringify(errs));
await browser.close();


