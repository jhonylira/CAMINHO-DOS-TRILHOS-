/**
 * Pagina Conceito — comportamento leve, sem bibliotecas.
 * - Revelacao no scroll (IntersectionObserver), respeitando prefers-reduced-motion.
 * - Navegacao: secao ativa, tema escuro sobre secoes escuras e menu compacto no celular.
 * - Hero: imagem que "abre" (escala e cantos) conforme a rolagem.
 * - Comparador manha x entardecer/noite (input range acessivel por teclado).
 * - Barras radiais da grelha (diagrama SVG) geradas a partir de data-attributes.
 */
import './conceito.css';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T | null;
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => Array.from(r.querySelectorAll(s)) as T[];

/* ---------- Revelacao no scroll ---------- */
function setupReveal() {
  const els = $$('[data-reveal]');
  if (reduceMotion || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  els.forEach((e) => io.observe(e));
}

/* ---------- Navegacao ---------- */
function setupNav() {
  const nav = $('#nav')!;
  const menu = $<HTMLButtonElement>('#navMenu')!;
  const list = $('#navLinks')!;
  const links = $$<HTMLAnchorElement>('#navLinks a');
  const close = () => { list.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); };
  menu.addEventListener('click', () => {
    const open = !list.classList.contains('open');
    list.classList.toggle('open', open); menu.setAttribute('aria-expanded', String(open));
  });
  links.forEach((a) => a.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // Secao ativa: a ultima secao cujo topo passou da metade superior da tela.
  const targets = links.map((a) => $(a.hash)).filter(Boolean) as HTMLElement[];
  const darks = $$('.dark');
  let ticking = false;
  const update = () => {
    ticking = false;
    const y = window.innerHeight * 0.35;
    let active: HTMLElement | null = null;
    for (const t of targets) if (t.getBoundingClientRect().top <= y) active = t;
    links.forEach((a) => a.setAttribute('aria-current', String(!!active && a.hash === '#' + active.id)));
    const navH = nav.offsetHeight;
    const overDark = darks.some((d) => { const r = d.getBoundingClientRect(); return r.top <= navH * 0.5 && r.bottom >= navH * 0.5; });
    nav.classList.toggle('nav--dark', overDark);
    heroProgress();
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();
}

/* ---------- Hero: imagem que se abre ---------- */
const heroFrame = $('#heroFrame');
function heroProgress() {
  if (!heroFrame) return;
  if (reduceMotion) { heroFrame.style.setProperty('--hs', '1'); return; }
  const r = heroFrame.getBoundingClientRect();
  const vh = window.innerHeight;
  // 0 quando o topo da imagem esta no rodape da tela; 1 quando chega a 15% do topo.
  const p = Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.85)));
  const e = 1 - Math.pow(1 - p, 2);
  heroFrame.style.setProperty('--hs', (0.9 + 0.1 * e).toFixed(4));
  heroFrame.style.setProperty('--hr', (1 - e).toFixed(4));
}

/* ---------- Comparador dia x noite ---------- */
const TIMES: Record<string, { file: string; label: string; alt: string }> = {
  entardecer: { file: 'rt_estacao_entardecer', label: 'Entardecer', alt: 'A mesma vista da estação ao entardecer, com luz baixa e quente.' },
  noite: { file: 'rt_estacao_noite', label: 'Noite', alt: 'A mesma vista da estação à noite, com a iluminação pública acesa.' },
};
function setupCompare() {
  const box = $('#compare'); const range = $<HTMLInputElement>('#cmpRange');
  const bottom = $<HTMLImageElement>('#cmpBottom'); const lbl = $('#cmpLbl');
  if (!box || !range || !bottom || !lbl) return;
  const set = () => box.style.setProperty('--pos', range.value + '%');
  range.addEventListener('input', set); set();
  // Base de URL resolvida a partir da imagem ja processada pelo Vite (funciona em dev e em dist/ com base relativa).
  const base = bottom.getAttribute('src')!.replace(/rt_estacao_noite-1600\.webp$/, '');
  $$<HTMLButtonElement>('.times button').forEach((b) => b.addEventListener('click', () => {
    const t = TIMES[b.dataset.time!]; if (!t) return;
    $$<HTMLButtonElement>('.times button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    bottom.srcset = `${base}${t.file}-900.webp 900w, ${base}${t.file}-1600.webp 1600w`;
    bottom.src = `${base}${t.file}-1600.webp`;
    bottom.alt = t.alt; lbl.textContent = t.label;
    range.setAttribute('aria-label', `Comparar manhã com ${t.label.toLowerCase()}`);
  }));
}

/* ---------- Grelha radial (SVG) ---------- */
function buildRadial() {
  const g = $<SVGGElement>('#radial'); if (!g) return;
  const cx = +g.dataset.cx!, cy = +g.dataset.cy!, r1 = +g.dataset.r1!, r2 = +g.dataset.r2!, n = +g.dataset.n!;
  const NS = 'http://www.w3.org/2000/svg';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', (cx + Math.cos(a) * r1).toFixed(2)); l.setAttribute('y1', (cy + Math.sin(a) * r1).toFixed(2));
    l.setAttribute('x2', (cx + Math.cos(a) * r2).toFixed(2)); l.setAttribute('y2', (cy + Math.sin(a) * r2).toFixed(2));
    g.appendChild(l);
  }
}

setupReveal();
setupNav();
setupCompare();
buildRadial();
if (reduceMotion) document.documentElement.classList.add('no-motion');
