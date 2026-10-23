import { chromium } from 'playwright';
const [,, w = '1440', h = '900', tag = 'd'] = process.argv;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url()}`); });
await page.goto('http://localhost:5173/conceito.html', { waitUntil: 'networkidle' });
await page.addStyleTag({ content: 'html{scroll-behavior:auto!important}' });
const H = await page.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y < H; y += 500) { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(120); }
await page.evaluate(() => document.querySelectorAll('[data-reveal]').forEach((e) => e.classList.add('is-in')));
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForLoadState('networkidle'); await page.waitForTimeout(800);
await page.screenshot({ path: `C:/Users/projetos2/.gemini/antigravity/brain/009142fa-8047-4a61-971d-79192a77406c/scratch/full_${tag}.png`, fullPage: true });
console.log('H', H, 'errors', JSON.stringify(errs));
await browser.close();
