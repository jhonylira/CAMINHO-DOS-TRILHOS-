/**
 * ROTEIRO DA APRESENTACAO + EDITOR (v0.3)
 * ---------------------------------------------------------------------------
 * O roteiro e uma lista ordenada de PARADAS. Cada parada tem:
 *  - code/title  : numeracao hierarquica definida pelo autor ("1", "1.1", "1.2", "2"...)
 *  - cam         : enquadramento (posicao + alvo da camera, coordenadas CAD)
 *  - anchor      : onde a TAG aparece no 3D/2D -> { s } = estaca no EIXO da ferrovia (padrao)
 *                  ou { x, y } = ponto livre. null = parada sem tag (ex.: implantacao geral)
 *  - html/chips/sources : texto da ficha, selos (ok / EP / pendente) e fontes
 *  - galeria     : chave de public/data/galeria.json (imagens cinematograficas do trecho)
 *
 * Fonte padrao: public/data/roteiro.json (versionado no projeto).
 * Edicoes do autor ficam no navegador (localStorage) e podem ser EXPORTADAS em JSON
 * para substituir o arquivo padrao -> assim o roteiro editado vai para o link publicado.
 */
export type V3 = [number, number, number];
export type Chip = [string, 'ok' | 'ep' | 'pend'];
export interface Stop {
  id: string; code: string; title: string; kicker?: string;
  html?: string; chips?: Chip[]; sources?: string[];
  cam?: { pos: V3; target: V3 } | null;
  anchor?: { s: number } | { x: number; y: number } | null;
  galeria?: string; sugerido?: boolean;
}
export interface Roteiro { versao: number; titulo: string; nota?: string; paradas: Stop[] }

const KEY = 'ct_roteiro_v1';
let defaults: Roteiro;
export let roteiro: Roteiro;
export const isLocal = () => !!localStorage.getItem(KEY);

export async function loadRoteiro(base: string): Promise<Roteiro> {
  const r = await fetch(base + 'data/roteiro.json');
  defaults = await r.json();
  try { const loc = localStorage.getItem(KEY); roteiro = loc ? JSON.parse(loc) : structuredClone(defaults); }
  catch { roteiro = structuredClone(defaults); }
  return roteiro;
}
function save() { localStorage.setItem(KEY, JSON.stringify(roteiro)); }
export const depth = (code: string) => code.split('.').length - 1;

// ------------------------------------------------------------------ editor
export interface EditorHost {
  getView(): { pos: V3; target: V3 };          // vista atual em coordenadas CAD
  goStop(i: number): void;                     // voa ate a parada e abre a ficha
  pick(cb: (x: number, y: number) => void): void; // proximo clique no 3D devolve um ponto CAD
  nearestS(x: number, y: number): { s: number; d: number };
  galleryKeys(): string[];
  changed(): void;                             // reconstruir tags, pontos do tour etc.
  toast(msg: string): void;
}
let host: EditorHost; let sel = 0;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
function htmlToText(h = '') { const d = document.createElement('div'); d.innerHTML = h.replace(/<\/p>\s*<p[^>]*>/g, '\n\n').replace(/<br\s*\/?>/g, '\n'); return d.textContent || ''; }
function textToHtml(t: string) { return t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join(''); }
function nextCode(code: string) { const parts = code.split('.'); parts[parts.length - 1] = String((parseInt(parts[parts.length - 1], 10) || 0) + 1); return parts.join('.'); }

export function initEditor(h: EditorHost) {
  host = h;
  const el = document.getElementById('editor')!;
  el.querySelector<HTMLButtonElement>('#edClose')!.onclick = () => closeEditor();
  el.querySelector<HTMLButtonElement>('#edAdd')!.onclick = () => {
    const cur = roteiro.paradas[sel];
    const st: Stop = { id: 'p' + Date.now().toString(36), code: cur ? nextCode(cur.code) : String(roteiro.paradas.length + 1), title: 'Nova parada', kicker: '', html: '', chips: [], sources: ['Roteiro editado pelo autor'], cam: host.getView(), anchor: null };
    roteiro.paradas.splice(sel + 1, 0, st); sel = sel + 1; commit(); host.toast('Parada criada com a vista atual. Posicione a tag no eixo.');
  };
  el.querySelector<HTMLButtonElement>('#edExport')!.onclick = () => {
    const blob = new Blob([JSON.stringify(roteiro, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'roteiro.json'; a.click();
    host.toast('roteiro.json exportado. Para publicar, substitua public/data/roteiro.json.');
  };
  el.querySelector<HTMLInputElement>('#edImport')!.onchange = async (e: any) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { const j = JSON.parse(await f.text()); if (!Array.isArray(j.paradas)) throw new Error('arquivo sem "paradas"'); roteiro = j; sel = 0; commit(); host.toast('Roteiro importado.'); }
    catch (err: any) { host.toast('Não foi possível importar: ' + err.message); }
    e.target.value = '';
  };
  el.querySelector<HTMLButtonElement>('#edReset')!.onclick = () => {
    if (!confirm('Descartar as edições locais e voltar ao roteiro padrão do projeto?')) return;
    localStorage.removeItem(KEY); roteiro = structuredClone(defaults); sel = 0; host.changed(); render();
  };
}
export function openEditor(i = 0) { sel = Math.max(0, Math.min(i, roteiro.paradas.length - 1)); document.getElementById('editor')!.classList.remove('hidden'); render(); }
export function closeEditor() { document.getElementById('editor')!.classList.add('hidden'); }
export function editorOpen() { return !document.getElementById('editor')!.classList.contains('hidden'); }
export function selectStop(i: number) { sel = i; if (editorOpen()) render(); }
function commit() { save(); host.changed(); render(); }

function render() {
  const el = document.getElementById('editor')!;
  el.querySelector('#edLocal')!.classList.toggle('hidden', !isLocal());
  const list = el.querySelector<HTMLElement>('#edList')!;
  list.innerHTML = roteiro.paradas.map((p, i) => {
    const st = !p.cam ? 'pend' : !p.anchor ? (depth(p.code) === 0 && i === 0 ? 'ok' : 'none') : p.sugerido ? 'ep' : 'ok';
    const tip = { pend: 'Sem enquadramento', none: 'Sem tag', ep: 'Tag sugerida — confirmar', ok: 'Pronta' }[st];
    return `<li draggable="true" data-i="${i}" class="d${Math.min(depth(p.code), 2)} ${i === sel ? 'on' : ''}">
      <span class="grip" aria-hidden="true">⋮⋮</span><b>${esc(p.code)}</b><span class="t">${esc(p.title)}</span><i class="st ${st}" title="${tip}"></i>
      <span class="mv"><button data-up="${i}" aria-label="Subir">▲</button><button data-dn="${i}" aria-label="Descer">▼</button></span></li>`;
  }).join('');
  list.querySelectorAll<HTMLLIElement>('li').forEach((li) => {
    const i = +li.dataset.i!;
    li.onclick = (e) => { const t = e.target as HTMLElement; if (t.dataset.up || t.dataset.dn) return; sel = i; render(); host.goStop(i); };
    li.ondragstart = (e) => { e.dataTransfer!.setData('text/plain', String(i)); li.classList.add('drag'); };
    li.ondragend = () => li.classList.remove('drag');
    li.ondragover = (e) => { e.preventDefault(); li.classList.add('over'); };
    li.ondragleave = () => li.classList.remove('over');
    li.ondrop = (e) => { e.preventDefault(); const from = +e.dataTransfer!.getData('text/plain'); move(from, i); };
  });
  list.querySelectorAll<HTMLButtonElement>('[data-up]').forEach((b) => (b.onclick = () => move(+b.dataset.up!, +b.dataset.up! - 1)));
  list.querySelectorAll<HTMLButtonElement>('[data-dn]').forEach((b) => (b.onclick = () => move(+b.dataset.dn!, +b.dataset.dn! + 1)));
  renderForm();
}
function move(from: number, to: number) {
  if (to < 0 || to >= roteiro.paradas.length || from === to) return;
  const [it] = roteiro.paradas.splice(from, 1); roteiro.paradas.splice(to, 0, it); sel = to; commit();
}
function renderForm() {
  const f = document.querySelector<HTMLElement>('#edForm')!;
  const p = roteiro.paradas[sel]; if (!p) { f.innerHTML = ''; return; }
  const keys = host.galleryKeys();
  const anc = !p.anchor ? 'Sem tag' : 's' in p.anchor ? `No eixo · estaca ${Math.round(p.anchor.s)} m` : `Ponto livre · x ${p.anchor.x.toFixed(1)} · y ${p.anchor.y.toFixed(1)}`;
  f.innerHTML = `
    <div class="frow"><label>Nº<input id="fCode" value="${esc(p.code)}" maxlength="8"></label><label class="grow">Título<input id="fTitle" value="${esc(p.title)}"></label></div>
    <label>Subtítulo<input id="fKicker" value="${esc(p.kicker || '')}" placeholder="Ex.: Trecho 2 · Mobilidade"></label>
    <label>Texto da ficha <small>(linha em branco separa parágrafos)</small><textarea id="fText" rows="5">${esc(htmlToText(p.html))}</textarea></label>
    <label>Imagens do popup<select id="fGal"><option value="">— nenhuma —</option>${keys.map((k) => `<option ${p.galeria === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
    <div class="fbox"><div><b>Enquadramento</b><span>${p.cam ? 'Definido' : 'Não definido'}</span></div><button id="fCam" class="pill">Usar vista atual</button></div>
    <div class="fbox"><div><b>Tag</b><span>${anc}${p.sugerido ? ' · sugerida' : ''}</span></div>
      <div class="fbtns"><button id="fAxis" class="pill">Posicionar no eixo</button><button id="fFree" class="pill" title="Clique em qualquer ponto">Ponto livre</button>${p.anchor ? '<button id="fNoTag" class="pill">Remover</button>' : ''}${p.sugerido ? '<button id="fOk" class="pill dark">Confirmar</button>' : ''}</div></div>
    <button id="fDel" class="danger">Excluir parada</button>`;
  const upd = () => {
    p.code = (f.querySelector<HTMLInputElement>('#fCode')!.value || p.code).trim();
    p.title = f.querySelector<HTMLInputElement>('#fTitle')!.value.trim() || 'Sem título';
    p.kicker = f.querySelector<HTMLInputElement>('#fKicker')!.value.trim();
    const txt = f.querySelector<HTMLTextAreaElement>('#fText')!.value;
    if (txt !== htmlToText(p.html)) p.html = textToHtml(txt);
    p.galeria = f.querySelector<HTMLSelectElement>('#fGal')!.value || undefined;
    save(); host.changed();
    const li = document.querySelector(`#edList li[data-i="${sel}"]`); if (li) { li.querySelector('b')!.textContent = p.code; li.querySelector('.t')!.textContent = p.title; }
  };
  f.querySelectorAll('input,textarea,select').forEach((i) => i.addEventListener('change', upd));
  f.querySelector<HTMLButtonElement>('#fCam')!.onclick = () => { p.cam = host.getView(); commit(); host.toast('Enquadramento salvo.'); };
  const pick = (axis: boolean) => {
    host.toast(axis ? 'Clique no 3D perto do trecho: a tag será fixada no eixo da ferrovia.' : 'Clique no 3D no ponto exato da tag.');
    host.pick((x, y) => {
      if (axis) { const n = host.nearestS(x, y); p.anchor = { s: Math.round(n.s) }; host.toast(`Tag fixada no eixo · estaca ${Math.round(n.s)} m`); }
      else { p.anchor = { x: +x.toFixed(2), y: +y.toFixed(2) }; host.toast('Tag posicionada no ponto escolhido.'); }
      p.sugerido = false; p.chips = (p.chips || []).filter((c) => !/sugerida|Aguardando posicionamento/.test(c[0])); commit();
    });
  };
  f.querySelector<HTMLButtonElement>('#fAxis')!.onclick = () => pick(true);
  f.querySelector<HTMLButtonElement>('#fFree')!.onclick = () => pick(false);
  f.querySelector<HTMLButtonElement>('#fNoTag')?.addEventListener('click', () => { p.anchor = null; commit(); });
  f.querySelector<HTMLButtonElement>('#fOk')?.addEventListener('click', () => { p.sugerido = false; p.chips = (p.chips || []).filter((c) => !/sugerida/.test(c[0])); commit(); host.toast('Posição confirmada pelo autor.'); });
  f.querySelector<HTMLButtonElement>('#fDel')!.onclick = () => { if (!confirm(`Excluir "${p.code} ${p.title}"?`)) return; roteiro.paradas.splice(sel, 1); sel = Math.max(0, sel - 1); commit(); };
}
