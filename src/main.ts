import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import gsap from 'gsap';
import { b2t, t2b, fmtUTM, worldToUV, uvToWorld, Extent } from './coords';
import { upgradeMaterial } from './materials';
import { buildTrees, buildLightPools } from './humanize';
import { buildSilhouettes } from './people';
import { buildVehicles } from './vehicles';
import { loadSkyBackground } from './sky';
import { loadAxis, pointAt, nearest, RailAxis } from './axis';
import { loadRoteiro, roteiro, depth, initEditor, openEditor, closeEditor, editorOpen, selectStop, Stop } from './roteiro';
import { SCENES, LAYER_COLORS, LAYER_LABELS, V3 } from './content';
import { buildOrthoDrape, applyOrthoDrape, OrthoDrape } from './context';
import { Post } from './post';
import { createFlight } from './flight';

// BVH: acelera raycasts (cliques, chao e colisoes da caminhada) de O(n) para O(log n)
(THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
(THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const BASE = import.meta.env.BASE_URL;
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const canvas = $<HTMLCanvasElement>('#c3d');

// ------------------------------------------------------------------ renderer / cena
// v0.2: sem logarithmicDepthBuffer (incompativel com a oclusao de ambiente GTAO). A precisao de
// profundidade e garantida pelo plano "near" dinamico (proporcional a distancia da camera).
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.info.autoReset = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // r186: PCFSoft foi removido (o PCF ja filtra as bordas)
const scene = new THREE.Scene();
const FOG = new THREE.Color(0xeeeef0);
scene.fog = new THREE.Fog(FOG, 350, 2600);

const camera = new THREE.PerspectiveCamera(42, 1, 0.2, 9000);
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
orthoCam.up.set(0, 0, -1); // norte (+Y do CAD = -Z do three) para cima da tela

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.maxPolarAngle = THREE.MathUtils.degToRad(86);
controls.minDistance = 4; controls.maxDistance = 2600;
controls.zoomToCursor = true;

// sol + ceu
const sun = new THREE.DirectionalLight(0xfff3e2, 3.2);
sun.castShadow = true;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xdfeaf5, 0xc8c8c7, 0.35);
scene.add(hemi);

// plano neutro de fundo (fora do modelo), evita "vazio" no horizonte. Nao faz parte do projeto.
const ground = new THREE.Mesh(new THREE.CircleGeometry(7000, 48).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0xe4e4e3, roughness: 1 }));
ground.position.y = -1.0; ground.receiveShadow = true; scene.add(ground);

// ------------------------------------------------------------------ estado
type Mode = 'orbit' | 'plan' | 'walk' | 'tour';
let mode: Mode = 'orbit';
let manifest: any, semantic: any, orthoMeta: any;
const layerGroups = new Map<string, THREE.Object3D[]>();
const modelMeshes: THREE.Mesh[] = [];
let walkables: THREE.Mesh[] = [], colliders: THREE.Mesh[] = [];
let trees: THREE.Group, people: THREE.Group = new THREE.Group();
let axis: RailAxis;
/** Galeria de imagens por trecho (public/data/galeria.json): onde o autor anexa renders cinematograficos. */
interface GalItem { src: string; legenda: string; tipo: string; fonte?: string }
let gallery: Record<string, GalItem[]> = {};
let pools: THREE.InstancedMesh;
let cars: THREE.Group | null = null;
let drape: OrthoDrape | null = null;
let post: Post | null = null;
let flight: ReturnType<typeof createFlight> | null = null;
const ledMats: THREE.MeshStandardMaterial[] = [];
let nightK = 0;
const proxies: THREE.Object3D[] = [];
let planExtent: Extent;
let quality = localStorage.getItem('ct_quality') || 'padrao';
const pin3d = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xe0492e, depthTest: false }));
pin3d.renderOrder = 10; pin3d.visible = false; scene.add(pin3d);
let pinWorld: { x: number; y: number } | null = null;

// ------------------------------------------------------------------ sol calculado (NOAA simplificado)
function sunDir(hour: number, doy = 349, lat = -26.4729, lon = -48.9923, tz = -3) {
  const d = Math.PI / 180, g = (2 * Math.PI / 365) * (doy - 1 + (hour - 12) / 24);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const tst = hour * 60 + eqt + 4 * lon - 60 * tz;
  const ha = (tst / 4 - 180) * d, la = lat * d;
  const cz = Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.min(1, Math.max(-1, cz)));
  const ac = Math.acos(Math.min(1, Math.max(-1, (Math.sin(la) * cz - Math.sin(decl)) / (Math.cos(la) * Math.sin(zen)))));
  const az = ha > 0 ? (ac / d + 180) % 360 : (540 - ac / d) % 360; // a partir do norte, sentido horario
  const el = Math.PI / 2 - zen, A = az * d;
  return { dir: new THREE.Vector3(Math.sin(A) * Math.cos(el), Math.sin(el), -Math.cos(A) * Math.cos(el)), elevDeg: el / d, azDeg: az };
}
let sunInfo = sunDir(9.5);
const MOON = new THREE.Vector3(0.45, 0.8, -0.4).normalize(); // luz noturna difusa e fria (ilustrativa)
const DAY_FOG = new THREE.Color(0xeeeef0), NIGHT_FOG = new THREE.Color(0x10161f);
/**
 * Ciclo dia -> noite. nightK vai de 0 (dia) a 1 (noite) conforme o sol se aproxima do horizonte:
 * comeca a escurecer com o sol a +4 graus e fica totalmente noite a -6 graus (crepusculo civil).
 */
function applySun(h: number) {
  sunInfo = sunDir(h);
  const e = sunInfo.elevDeg;
  nightK = THREE.MathUtils.clamp((4 - e) / 10, 0, 1);
  const eL = Math.max(e, 2);
  const warm = THREE.MathUtils.clamp((25 - eL) / 25, 0, 1);
  if (nightK < 0.6) {
    // a luz nunca vem "de baixo": limitamos a elevacao usada pela luz a 3 graus
    const el = Math.max(e, 3) * Math.PI / 180, A = sunInfo.azDeg * Math.PI / 180;
    sunInfo.dir.set(Math.sin(A) * Math.cos(el), Math.sin(el), -Math.cos(A) * Math.cos(el));
    sun.color.setRGB(1, 0.95 - 0.3 * warm, 0.88 - 0.5 * warm);
    sun.intensity = 2.7 * THREE.MathUtils.clamp(eL / 18, 0.25, 1) * (1 - nightK);
  } else {
    sunInfo.dir.copy(MOON);
    sun.color.setRGB(0.62, 0.72, 1.0);
    sun.intensity = 0.32 * nightK;
  }
  scene.environmentIntensity = THREE.MathUtils.lerp(0.45 + 0.3 * THREE.MathUtils.clamp(eL / 30, 0, 1), 0.05, nightK);
  scene.background = new THREE.Color(0xeeeef0).lerp(new THREE.Color(0x161b25),nightK);
  hemi.intensity = THREE.MathUtils.lerp(0.5, 0.05, nightK);
  (scene.fog as THREE.Fog).color.copy(DAY_FOG).lerp(NIGHT_FOG, nightK);
  renderer.toneMappingExposure = THREE.MathUtils.lerp(0.8, 1.15, nightK);
  // luminarias: difusores LED acendem e as "pocas" de luz aparecem no piso
  ledMats.forEach((m) => (m.emissiveIntensity = 0.4 + 9 * nightK));
  if (pools) { (pools.material as THREE.MeshBasicMaterial).opacity = 0.42 * nightK; pools.visible = nightK > 0.02; }
  post?.setNight(nightK);
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  const tc = document.getElementById('timeChip'); if (tc) tc.textContent = `${hh}h${String(mm).padStart(2, '0')}`;
  $('#hourLbl').textContent = `${hh}h${String(mm).padStart(2, '0')} · ${e > 0 ? `elevação ${e.toFixed(0)}°` : 'sol abaixo do horizonte'}`;
  const hs = $<HTMLInputElement>('#hour'); if (hs && Math.abs(parseFloat(hs.value) - h) > 0.01) hs.value = String(h);
}

function updateShadowFrustum(center: THREE.Vector3, half: number) {
  const s = sun.shadow.camera as THREE.OrthographicCamera;
  half = THREE.MathUtils.clamp(half, 30, 700);
  // ancora em passos de texel para evitar "tremulacao" das sombras em movimento
  const step = (half * 2) / sun.shadow.mapSize.x;
  const c = center.clone(); c.x = Math.round(c.x / step) * step; c.z = Math.round(c.z / step) * step;
  sun.target.position.copy(c);
  sun.position.copy(c).addScaledVector(sunInfo.dir, 900);
  if (s.right !== half) { s.left = -half; s.right = half; s.top = half; s.bottom = -half; s.near = 1; s.far = 2000; s.updateProjectionMatrix(); }
}

// ------------------------------------------------------------------ qualidade
function applyQuality(q: string) {
  quality = q; localStorage.setItem('ct_quality', q);
  const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(q === 'leve' ? 1 : q === 'padrao' ? Math.min(dpr, 1.5) : Math.min(dpr, 2));
  renderer.shadowMap.enabled = q !== 'leve';
  const ms = q === 'alta' ? 4096 : 2048;
  if (sun.shadow.mapSize.x !== ms) { sun.shadow.mapSize.set(ms, ms); sun.shadow.map?.dispose(); (sun.shadow as any).map = null; }
  scene.traverse((o: any) => { if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: any) => (m.needsUpdate = true)); } });
  post?.setQuality(q);
  resize();
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  post?.resize();
  updateOrtho();
}

// ------------------------------------------------------------------ carregamento
async function loadJSON(p: string) { const r = await fetch(BASE + p); if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`); return r.json(); }
function setLoad(p: number, msg?: string) { $('#lbar').style.width = `${Math.round(p * 100)}%`; if (msg) $('#lmsg').textContent = msg; }

async function boot() {
  try {
    [manifest, semantic, orthoMeta] = await Promise.all([loadJSON('data/manifest.json'), loadJSON('data/semantic.json'), loadJSON('data/ortho.json')]);
    planExtent = manifest.plan;
    // eixo central da ferrovia (extraido dos trilhos do R07) -> ancora exata das tags dos trechos
    axis = await loadAxis(BASE);
    for (const s of SCENES) if (s.hotspot) { const p = pointAt(axis, s.hotspot.s); s.hotspot.at = [p.x, p.y, 0.2]; }
    try { gallery = (await loadJSON('data/galeria.json')).trechos || {}; } catch { gallery = {}; }
    await loadRoteiro(BASE);
    setLoad(0.03, 'Carregando céu e iluminação…');
    const hdr = await new HDRLoader().loadAsync(BASE + 'env/ceu_parcialmente_nublado_2k.hdr');
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    scene.background = new THREE.Color(0xeeeef0); scene.backgroundIntensity = 1;
    pmrem.dispose();
    // Minimal neutral horizon: no invented hills or heavyweight panorama.

    // revisao do modelo vem do manifesto gerado pelo pipeline (ex.: 'R08') -> nomes dos ativos
    const rev: string = manifest.revision || 'R07';
    setLoad(0.06, `Carregando modelo 3D ${rev} (${(manifest.stats.glb_bytes / 1e6).toFixed(0)} MB, geometria sem perdas)…`);
    const gltf = await new GLTFLoader().loadAsync(BASE + `models/caminho_dos_trilhos_${rev}.glb`, (e) => {
      const tot = e.total || manifest.stats.glb_bytes; setLoad(0.06 + 0.84 * (e.loaded / tot));
    });
    setLoad(0.92, 'Preparando materiais, colisões e humanização…');
    await new Promise((r) => setTimeout(r, 30));
    setupModel(gltf.scene);
    setLoad(0.95, 'Aplicando ortofoto real ao entorno…');
    await setupContext();
    setLoad(0.97, 'Humanização: pessoas e veículos ilustrativos…');
    people = await buildSilhouettes(semantic.people, BASE); scene.add(people);
    const asphalt = modelMeshes.filter((m) => { const n = (m.material as THREE.Material).name; return n === 'EP_ASFALTO' || n === 'Cracked asphalt'; });
    const blockers = modelMeshes.filter((m) => m.userData.layer !== 'vegetacao' && !asphalt.includes(m));
    cars = buildVehicles(asphalt, blockers, axis); scene.add(cars);
    post = new Post(renderer, scene, camera, () => [...trees.children.filter((o: any) => o.material?.alphaTest > 0), pools]);
    buildUI();
    flight=createFlight(scene,camera,controls,axis,()=>{setMode('orbit');pauseTour();flying?.kill();flying=null;$('#info').classList.add('hidden');});
    applyQuality(quality);
    applySun(9.5);
    goHome(0);
    setLoad(1, 'Pronto');
    const L = $('#loader'); L.style.opacity = '0'; setTimeout(() => L.remove(), 800);
    (window as any).__ct = { ready: true, scene, camera, controls, setMode, flyToScene, manifest, renderer, applySun, post: () => post, flight: () => flight, info: () => renderer.info };
  } catch (err: any) {
    console.error(err);
    $('#loader').classList.add('err');
    $('#lmsg').innerHTML = `Não foi possível carregar: ${err?.message || err}.<br>Execute por um servidor HTTP (<code>npm run dev</code> ou <code>npm run preview</code>) e confira a pasta <code>public/models</code>. <button onclick="location.reload()">Tentar novamente</button>`;
  }
}

function setupModel(root: THREE.Object3D) {
  const aniso = renderer.capabilities.getMaxAnisotropy();
  root.updateMatrixWorld(true);
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    const layer = o.userData.layer || (o.parent?.userData?.layer) || o.name.split('__')[0];
    o.userData.layer = layer;
    const matName = (o.material as THREE.Material).name;
    upgradeMaterial(o, aniso);
    const flat = ['viario', 'passeios', 'canteiros', 'ciclovia', 'ferrovia'].includes(layer);
    o.receiveShadow = true;
    o.castShadow = !flat && !matName.includes('VIDRO');
    o.matrixAutoUpdate = false;
    (o.geometry as any).computeBoundsTree();
    modelMeshes.push(o);
    if (!layerGroups.has(layer)) layerGroups.set(layer, []);
    layerGroups.get(layer)!.push(o);
    if (matName === 'EP_COPA_PROXY' || matName === 'EP_TRONCO') proxies.push(o);
    if ((o.material as THREE.Material).name.includes('LED')) ledMats.push(o.material);
    if (layer !== 'vegetacao' && !matName.includes('VIDRO') && !matName.includes('LED')) walkables.push(o);
    if (['estacao', 'cafes', 'quiosques', 'conceitual', 'entorno', 'mobiliario', 'iluminacao', 'floreiras'].includes(layer)) colliders.push(o);
  });
  scene.add(root);
  trees = buildTrees(semantic.trees); scene.add(trees);
  // pessoas: silhuetas reais estilo SketchUp (billboards) carregadas em boot() -> buildSilhouettes
  pools = buildLightPools(semantic.lamps); scene.add(pools);
  proxies.forEach((p) => (p.visible = false));
}

/** Ortofoto real nas faces horizontais do entorno (chao, quadras, telhados) e no chao de fundo. */
async function setupContext() {
  for (const object of layerGroups.get('entorno') || []) {
    const mesh=object as THREE.Mesh;
    const mat=new THREE.MeshStandardMaterial({color:0xf0efeb,roughness:.92,metalness:0});
    mat.name='Entorno off-white';mesh.material=mat;
  }
}

// ------------------------------------------------------------------ UI: camadas, ajustes
function buildUI() {
  const list = $('#layerList');
  for (const l of manifest.layers) {
    if (!layerGroups.has(l.id)) continue;
    const lab = document.createElement('label');
    lab.innerHTML = `<input type="checkbox" checked data-layer="${l.id}"><i style="background:${LAYER_COLORS[l.id] || '#999'}"></i><span>${LAYER_LABELS[l.id] || l.label}</span>`;
    list.appendChild(lab);
  }
  list.addEventListener('change', (e: any) => {
    const id = e.target.dataset.layer; if (!id) return;
    const on = e.target.checked;
    layerGroups.get(id)!.forEach((m) => (m.visible = on && !(proxies.includes(m) && trees.visible)));
    if (id === 'vegetacao') { trees.visible = on && ($('#tTrees') as HTMLInputElement).checked; }
    if (id === 'viario' && cars) cars.visible = on && $<HTMLInputElement>('#tCars').checked;
  });
  if (innerWidth < 760) $('#layers').classList.add('closed');
  $('#layersToggle').onclick = () => $('#layers').classList.toggle('closed');
  const toggleSettings = () => { const s = $('#settings'); s.classList.toggle('hidden'); $('#btnSettings').setAttribute('aria-expanded', String(!s.classList.contains('hidden'))); };
  $('#btnSettings').onclick = toggleSettings;
  $('#btnTime').onclick = toggleSettings;
  $<HTMLSelectElement>('#quality').value = quality;
  const syncQ = () => document.querySelectorAll<HTMLButtonElement>('#qualitySeg button').forEach((b) => b.classList.toggle('active', b.dataset.q === quality));
  document.querySelectorAll<HTMLButtonElement>('#qualitySeg button').forEach((b) => (b.onclick = () => { applyQuality(b.dataset.q!); syncQ(); }));
  syncQ();
  $<HTMLInputElement>('#hour').oninput = (e: any) => { hourTween?.kill(); applySun(parseFloat(e.target.value)); };
  document.querySelectorAll<HTMLButtonElement>('#hourPresets button').forEach((b) => (b.onclick = () => animateHour(parseFloat(b.dataset.h!))));
  $<HTMLInputElement>('#tOrtho').onchange = (e: any) => { if (drape) drape.uniforms.uOrthoOn.value = e.target.checked ? 1 : 0; };
  $<HTMLInputElement>('#tTrees').onchange = (e: any) => { trees.visible = e.target.checked; proxies.forEach((p) => (p.visible = !e.target.checked)); };
  $<HTMLInputElement>('#tPeople').onchange = (e: any) => (people.visible = e.target.checked);
  $<HTMLInputElement>('#tCars').onchange = (e: any) => { if (cars) cars.visible = e.target.checked; };
  $<HTMLInputElement>('#tHotspots').onchange = (e: any) => ($('#labels').style.display = e.target.checked ? '' : 'none');
  $('#btnFull').onclick = toggleFull;
  $('#btnHome').onclick = () => { if (mode === 'plan') planHome(); else { setMode('orbit'); goHome(); } };
  $('#infoClose').onclick = () => { $('#info').classList.add('hidden'); hotspots.forEach((h) => h.el.classList.remove('active')); };
  document.querySelectorAll<HTMLButtonElement>('#modes button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode as Mode)));
  document.querySelectorAll<HTMLButtonElement>('#planbar button').forEach((b) => (b.onclick = () => setPlanView(b.dataset.pv!)));
  addEventListener('resize', () => moveThumb());
  document.fonts?.ready.then(() => moveThumb());
  moveThumb();
  setupLightbox();
  buildHotspots();
  buildTourBar();
  setupEditor();
  setupMinimap();
  setupPlanInput();
  setupWalkInput();
  setupPicking();
  addEventListener('keydown', onKey);
}

function toggleFull() { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }

/** Transicao suave de horario (o sol "anda" em ~2,5 s em vez de pular). */
let hourTween: gsap.core.Tween | null = null;
function animateHour(h: number) {
  const o = { h: parseFloat($<HTMLInputElement>('#hour').value) };
  hourTween?.kill();
  hourTween = gsap.to(o, { h, duration: 2.5, ease: 'power1.inOut', onUpdate: () => applySun(o.h) });
}

function onKey(e: KeyboardEvent) {
  if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
  if (e.key === 'f' || e.key === 'F') toggleFull();
  if (mode !== 'walk') {
    if (e.key === '1') setMode('orbit'); if (e.key === '2') setMode('plan'); if (e.key === '3') setMode('walk'); if (e.key === '4') setMode('tour');
    if (e.key === 'h' || e.key === 'H') { setMode('orbit'); goHome(); }
  }
  if (mode === 'tour') {
    if (e.key === 'ArrowRight') tourStep(1); if (e.key === 'ArrowLeft') tourStep(-1);
    if (e.key === ' ') { e.preventDefault(); toggleTourPlay(); } if (e.key === 'Escape') setMode('orbit');
  }
}

// ------------------------------------------------------------------ info + galeria cinematografica
function showInfo(html: string) {
  $('#infoBody').innerHTML = html; const el = $('#info'); el.classList.remove('hidden'); el.scrollTop = 0;
  // reinicia a animacao de entrada do painel
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  wireGallery();
}
const TIPO: Record<string, string> = { blender: 'Render de estudo · versão indicada na fonte', tempo_real: 'Captura em tempo real', autor: 'Imagem do autor', ia: 'Humanização diurna · IA', ia_noite: 'Humanização noturna · IA' };
let lbList: GalItem[] = [], lbIdx = 0;
function galleryHTML(id: string) {
  const g = gallery[id];
  if (!g?.length) return '';
  const h = g[0];
  const compare = h.tipo === 'ia' && g[1] ? g[1] : null;
  return `<div class="gal" data-gal="${id}">
    <button class="hero" data-i="0" aria-label="Ampliar imagem"><img src="${BASE}${h.src}" alt="${h.legenda}" loading="lazy" decoding="async">${compare ? `<img class="compare-base" src="${BASE}${compare.src}" alt="Base original para comparação" style="clip-path:inset(0 100% 0 0)">` : ''}</button>
    ${compare ? '<label class="render-compare">Humanizada <input type="range" min="0" max="100" value="0" aria-label="Comparar humanização com base original"> Base original</label>' : ''}
    <span class="tag">${TIPO[h.tipo] || h.tipo}</span>
    <div class="cap"><b>${h.legenda}</b>${h.fonte || ''}</div>
    ${g.length > 1 ? `<div class="thumbs">${g.map((it, k) => `<button data-t="${k}" class="${k === 0 ? 'on' : ''}" aria-label="${it.legenda}"><img src="${BASE}${it.src}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
    ${g.length>1 ? '<div class="gallery-nav"><button type="button" data-gallery-prev aria-label="Imagem anterior">←</button><span data-gallery-count>1 / '+g.length+'</span><button type="button" data-gallery-next aria-label="Próxima imagem">→</button></div>' : ''}
  </div>`;
}
function wireGallery() {
  const gal = document.querySelector<HTMLElement>('#info .gal'); if (!gal) return;
  const list = gallery[gal.dataset.gal!] || [];
  let cur = 0;
  const compareRange=gal.querySelector<HTMLInputElement>('.render-compare input');
  const compareBase=gal.querySelector<HTMLImageElement>('.compare-base');
  compareRange?.addEventListener('input',()=>{if(compareBase)compareBase.style.clipPath=`inset(0 ${100-Number(compareRange.value)}% 0 0)`});
  const show = (k: number) => {
    k=(k+list.length)%list.length;cur = k; const it = list[k];
    const counter=gal.querySelector('[data-gallery-count]');if(counter)counter.textContent=`${k+1} / ${list.length}`;
    const compareLabel=gal.querySelector<HTMLElement>('.render-compare');if(compareLabel)compareLabel.hidden=k!==0;
    if(compareBase)compareBase.hidden=k!==0;
    const img = gal.querySelector<HTMLImageElement>('.hero img')!;
    img.style.opacity = '0';
    setTimeout(() => { img.onload = () => (img.style.opacity = '1'); img.src = BASE + it.src; img.alt = it.legenda; if(img.complete)img.style.opacity='1'; }, 180);
    gal.querySelector('.tag')!.textContent = TIPO[it.tipo] || it.tipo;
    gal.querySelector('.cap')!.innerHTML = `<b>${it.legenda}</b>${it.fonte || ''}`;
    gal.querySelectorAll('.thumbs button').forEach((b, j) => b.classList.toggle('on', j === k));
  };
  gal.querySelectorAll<HTMLButtonElement>('.thumbs button').forEach((b) => (b.onclick = () => show(+b.dataset.t!)));
  gal.querySelector<HTMLButtonElement>('[data-gallery-prev]')?.addEventListener('click',()=>show(cur-1));
  gal.querySelector<HTMLButtonElement>('[data-gallery-next]')?.addEventListener('click',()=>show(cur+1));
  gal.querySelector<HTMLButtonElement>('.hero')!.onclick = () => openLightbox(list, cur);
}
function openLightbox(list: GalItem[], i: number) { lbList = list; lbIdx = i; renderLightbox(); $('#lightbox').classList.remove('hidden'); }
function renderLightbox() {
  const it = lbList[lbIdx]; if (!it) return;
  $<HTMLImageElement>('#lbImg').src = BASE + it.src; $<HTMLImageElement>('#lbImg').alt = it.legenda;
  $('#lbCap').innerHTML = `<b>${it.legenda}</b> · ${TIPO[it.tipo] || it.tipo}${it.fonte ? ` · ${it.fonte}` : ''}`;
  $('#lbPrev').classList.toggle('hidden', lbList.length < 2); $('#lbNext').classList.toggle('hidden', lbList.length < 2);
}
function setupLightbox() {
  const lb = $('#lightbox');
  const close = () => lb.classList.add('hidden');
  $('#lbClose').onclick = close;
  lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
  $('#lbPrev').onclick = () => { lbIdx = (lbIdx - 1 + lbList.length) % lbList.length; renderLightbox(); };
  $('#lbNext').onclick = () => { lbIdx = (lbIdx + 1) % lbList.length; renderLightbox(); };
  addEventListener('keydown', (e) => {
    if (lb.classList.contains('hidden')) return;
    if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') $('#lbNext').click(); if (e.key === 'ArrowLeft') $('#lbPrev').click();
    e.stopPropagation();
  }, true);
}
function sceneInfoHTML(i: number) {
  const s = SCENES[i];
  return `${galleryHTML(s.id)}<div class="kicker">${s.kicker}</div><h2>${s.title}</h2>
  ${s.chips?.length ? `<div class="chips">${s.chips.map(([t, k]) => `<span class="chip ${k}">${t}</span>`).join('')}</div>` : ''}${s.html}
  <div class="src"><b>Fontes no projeto</b><br>${s.sources.join('<br>')}</div>`;
}

/** Desliza o "thumb" branco do controle segmentado ate o modo ativo (animacao estilo iOS). */
function moveThumb() {
  const nav = $('#modes'), th = nav.querySelector<HTMLElement>('.thumb'), act = nav.querySelector<HTMLElement>('button.active');
  if (!th || !act) return;
  th.style.width = `${act.offsetWidth}px`; th.style.transform = `translateX(${act.offsetLeft}px)`;
}

// ------------------------------------------------------------------ voos de camera
let flying: gsap.core.Tween | null = null;
function flyTo(posB: V3, tgtB: V3, dur = 2.6) {
  const p1 = b2t(...posB), t1 = b2t(...tgtB);
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  const dist = p0.distanceTo(p1);
  const arc = Math.min(dist * 0.25, 260);
  if (dur === 0) { camera.position.copy(p1); controls.target.copy(t1); controls.update(); return; }
  flying?.kill();
  const o = { k: 0 }; controls.enabled = false;
  flying = gsap.to(o, {
    k: 1, duration: Math.min(4.5, dur * (0.6 + Math.min(dist / 900, 1))), ease: 'power2.inOut',
    onUpdate: () => {
      camera.position.lerpVectors(p0, p1, o.k); camera.position.y += Math.sin(o.k * Math.PI) * arc;
      controls.target.lerpVectors(t0, t1, o.k); camera.lookAt(controls.target);
    },
    onComplete: () => { controls.enabled = true; controls.update(); flying = null; },
  });
}
function goHome(dur = 2.6) { if(flight?.active)flight.stop(); const s = SCENES[0]; flyTo(s.cam.pos, s.cam.target, dur); }
function flyToScene(i: number) { const s = SCENES[i]; flyTo(s.cam.pos, s.cam.target); showInfo(sceneInfoHTML(i)); }

// ------------------------------------------------------------------ paradas do roteiro (tour + tags)
function stopAnchor(p: Stop): V3 | null {
  if (!p.anchor) return null;
  if ('s' in p.anchor) { const q = pointAt(axis, p.anchor.s); return [q.x, q.y, 0.2]; }
  return [p.anchor.x, p.anchor.y, 0.2];
}
function stopInfoHTML(i: number) {
  const p = roteiro.paradas[i];
  return `${p.galeria ? galleryHTML(p.galeria) : ''}<div class="kicker">${p.code} · ${p.kicker || ''}</div><h2>${p.title}</h2>
  ${p.chips?.length ? `<div class="chips">${p.chips.map(([t, k]) => `<span class="chip ${k}">${t}</span>`).join('')}</div>` : ''}${p.html || ''}
  ${p.sources?.length ? `<details class="src"><summary>Base do estudo</summary>${p.sources.join('<br>')}</details>` : ''}`;
}
function flyToStop(i: number) {
  if(flight?.active)flight.stop();
  const p = roteiro.paradas[i]; if (!p) return;
  if (p.cam) flyTo(p.cam.pos, p.cam.target); else toast('Esta parada ainda não tem enquadramento: defina no editor do roteiro.');
  showInfo(stopInfoHTML(i));
  hotspots.forEach((h) => h.el.classList.toggle('active', h.idx === i));
  selectStop(i);
}
let toastT: any = null;
function toast(msg: string) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 3800); }
let pickCb: ((x: number, y: number) => void) | null = null;
function setupEditor() {
  initEditor({
    getView: () => { const p = t2b(camera.position), t = t2b(controls.target); const r = (v: number) => +v.toFixed(2); return { pos: [r(p.x), r(p.y), r(p.z)], target: [r(t.x), r(t.y), r(t.z)] }; },
    goStop: (i) => { if (mode !== 'tour') setMode('tour'); pauseTour(); tourIdx = i; markTour(); flyToStop(i); },
    pick: (cb) => { pickCb = cb; document.body.classList.add('picking'); },
    nearestS: (x, y) => nearest(axis, x, y),
    galleryKeys: () => Object.keys(gallery),
    changed: () => { rebuildHotspots(); buildTourDots(); markTour(); },
    toast,
  });
  $('#tEdit').onclick = () => { if (editorOpen()) closeEditor(); else { pauseTour(); openEditor(tourIdx); } };
}

// ------------------------------------------------------------------ tags do roteiro (ancoradas no eixo da ferrovia)
const hotspots: { el: HTMLElement; p: THREE.Vector3; idx: number }[] = [];
let hsInfoWired = false;
/** Uma tag para cada parada do roteiro que tenha ancora. Numero = codigo do autor (1, 1.1, 1.2...). */
function buildHotspots() {
  roteiro.paradas.forEach((p, idx) => {
    const at = stopAnchor(p); if (!at) return;
    const el = document.createElement('div'); el.className = `hs${depth(p.code) > 0 ? ' sub' : ''}${p.sugerido ? ' sugg' : ''}`;
    const g = p.galeria ? gallery[p.galeria]?.[0] : undefined;
    const where = p.anchor && 's' in p.anchor ? `Eixo da ferrovia · estaca ${Math.round(p.anchor.s)} m` : 'Ponto definido pelo autor';
    el.innerHTML = `<i class="stem"></i><span class="dot" title="${where}${p.sugerido ? ' · posição sugerida' : ''}"></span>
      <button class="lab" aria-label="${p.code} ${p.title}"><span class="n">${p.code}</span>${p.title}</button>
      ${g ? `<div class="prev"><img src="${BASE}${g.src}" alt="" loading="lazy"><span>${g.legenda}</span></div>` : ''}`;
    el.querySelector<HTMLButtonElement>('.lab')!.onclick = () => {
      if (pickCb) return;
      if (mode === 'plan') { planFocus(at[0], at[1]); showInfo(stopInfoHTML(idx) + `<button class="go" data-go="${idx}">Ver em 3D</button>`); hotspots.forEach((h) => h.el.classList.toggle('active', h.el === el)); }
      else { if (mode === 'walk') setMode('orbit'); tourIdx = idx; markTour(); flyToStop(idx); }
    };
    $('#labels').appendChild(el);
    hotspots.push({ el, p: b2t(...at), idx });
  });
  if (!hsInfoWired) { hsInfoWired = true; $('#info').addEventListener('click', (e: any) => { const g = e.target.dataset?.go; if (g !== undefined) { setMode('orbit'); flyToStop(+g); } }); }
}
function rebuildHotspots() { hotspots.length = 0; $('#labels').innerHTML = ''; buildHotspots(); }
const _v = new THREE.Vector3();
/**
 * Projeta a ancora (ponto exato do eixo) na tela. O ponto azul fica SEMPRE sobre o eixo;
 * quando duas etiquetas colidem, so a HASTE cresce (a etiqueta sobe na mesma vertical),
 * entao o alinhamento ancora -> haste -> etiqueta nunca se perde.
 */
function updateHotspots(cam: THREE.Camera) {
  const w = innerWidth, h = innerHeight, BASE_STEM = 46;
  const placed: { x: number; top: number; w: number }[] = [];
  const items: { hs: typeof hotspots[0]; x: number; y: number }[] = [];
  for (const hs of hotspots) {
    _v.copy(hs.p).project(cam);
    const vis = _v.z < 1 && _v.z > -1 && Math.abs(_v.x) < 1.02 && Math.abs(_v.y) < 1.02 && mode !== 'walk' && !flight?.active;
    const far = cam === camera && camera.position.distanceTo(hs.p) > 2200;
    hs.el.style.display = vis && !far ? '' : 'none';
    if (vis && !far) items.push({ hs, x: Math.round((_v.x * 0.5 + 0.5) * w), y: Math.round((-_v.y * 0.5 + 0.5) * h) });
  }
  items.sort((a, b) => b.y - a.y);
  for (const it of items) {
    const lab = it.hs.el.querySelector<HTMLElement>('.lab')!;
    const bw = lab.offsetWidth || 140;
    let stem = BASE_STEM;
    const top = () => it.y - stem - 32;
    for (let k = 0; k < 10 && placed.some((p) => Math.abs(p.x - it.x) < (p.w + bw) / 2 + 8 && Math.abs(p.top - top()) < 36); k++) stem += 38;
    placed.push({ x: it.x, top: top(), w: bw });
    it.hs.el.style.transform = `translate3d(${it.x}px, ${it.y}px, 0)`;
    it.hs.el.style.setProperty('--stem', `${stem}px`);
  }
}

// ------------------------------------------------------------------ apresentacao guiada (segue a ordem do roteiro)
const TOUR_MS = 11000;
let tourIdx = 0, tourPlaying = false, tourTimer: any = null;
function buildTourBar() {
  buildTourDots();
  $('#tDots').style.setProperty('--dur', `${TOUR_MS / 1000}s`);
  $('#tPrev').onclick = () => tourStep(-1); $('#tNext').onclick = () => tourStep(1);
  $('#tPlay').onclick = toggleTourPlay; $('#tExit').onclick = () => setMode('orbit');
}
function buildTourDots() {
  const d = $('#tDots'); d.innerHTML = '';
  roteiro.paradas.forEach((p, i) => { const sp = document.createElement('span'); sp.title = `${p.code} ${p.title}`; sp.onclick = () => tourGo(i); d.appendChild(sp); });
}
/** Atualiza titulo e barra de progresso sem mover a camera. */
function markTour() {
  const n = roteiro.paradas.length; if (!n) return;
  tourIdx = Math.min(tourIdx, n - 1); const p = roteiro.paradas[tourIdx];
  $('#tTitle').textContent = `${p.code} · ${p.title}`;
  document.querySelectorAll('#tDots span').forEach((s, k) => { s.classList.remove('on'); s.classList.toggle('done', k < tourIdx); });
  const cur = document.querySelectorAll('#tDots span')[tourIdx] as HTMLElement | undefined; if (cur) { void cur.offsetWidth; cur.classList.add('on'); }
}
function tourGo(i: number) {
  const n = roteiro.paradas.length; if (!n) return;
  tourIdx = (i + n) % n; flyToStop(tourIdx); markTour();
  if (tourPlaying) { clearTimeout(tourTimer); tourTimer = setTimeout(() => tourStep(1), roteiro.paradas[tourIdx].cam ? TOUR_MS : 2500); }
}
function tourStep(d: number) { tourGo(tourIdx + d); }
function pauseTour() { if (tourPlaying) toggleTourPlay(); }
function toggleTourPlay() {
  tourPlaying = !tourPlaying; $('#tPlay').textContent = tourPlaying ? '❚❚' : '▶';
  $('#tourbar').classList.toggle('paused', !tourPlaying);
  clearTimeout(tourTimer);
  if (tourPlaying) { tourTimer = setTimeout(() => tourStep(1), TOUR_MS); markTour(); }
}

// ------------------------------------------------------------------ modos
function focusPoint(): { x: number; y: number } {
  if (mode === 'plan') { const b = t2b(new THREE.Vector3(plan.cx, 0, plan.cz)); return { x: b.x, y: b.y }; }
  if (mode === 'walk') { const d = new THREE.Vector3(); camera.getWorldDirection(d); d.y = 0; d.normalize(); const p = camera.position.clone().addScaledVector(d, 15); const b = t2b(p); return { x: b.x, y: b.y }; }
  const b = t2b(controls.target); return { x: b.x, y: b.y };
}

function setMode(m: Mode) {
  if(flight?.active)flight.stop();
  if (m === mode && m !== 'tour') return;
  const f = focusPoint();
  const prev = mode;
  if (prev === 'walk') exitWalk();
  if (prev === 'tour') { tourPlaying = false; clearTimeout(tourTimer); closeEditor(); }
  mode = m;
  document.querySelectorAll('#modes button').forEach((b: any) => b.classList.toggle('active', b.dataset.mode === m));
  moveThumb();
  $('#planbar').classList.toggle('hidden', m !== 'plan');
  $('#splitter').classList.toggle('hidden', !(m === 'plan' && planView === 'comparar'));
  $('#tourbar').classList.toggle('hidden', m !== 'tour');
  $('#layers').classList.toggle('hidden', m === 'walk');
  controls.enabled = m === 'orbit' || m === 'tour';
  if (m === 'orbit' && prev === 'plan') {
    const half = plan.half; const t = b2t(f.x, f.y, 0);
    const off = camera.position.clone().sub(controls.target).normalize().multiplyScalar(Math.max(half * 1.3, 40));
    if (off.y < 10) off.set(0, 1, 1).normalize().multiplyScalar(half * 1.3);
    flyTo([f.x - off.x * 0 + off.x, f.y - off.z, off.y] as V3, [f.x, f.y, 0], 1.6);
  } else if (m === 'orbit' && prev === 'walk') {
    const d = new THREE.Vector3(); camera.getWorldDirection(d); d.y = 0; d.normalize();
    const p = t2b(camera.position.clone().addScaledVector(d, -35)); flyTo([p.x, p.y, 28], [f.x, f.y, 0], 1.6);
  } else if (m === 'plan') {
    const dist = camera.position.distanceTo(controls.target);
    planFocus(f.x, f.y, THREE.MathUtils.clamp(dist * 0.55, 25, 700));
  } else if (m === 'walk') {
    enterWalk(f.x, f.y);
  } else if (m === 'tour') {
    tourPlaying = true; $('#tPlay').textContent = '❚❚'; $('#tourbar').classList.remove('paused'); tourGo(0);
  }
}

// ------------------------------------------------------------------ planta 2D (ortografica) + ortofoto
const plan = { cx: 0, cz: 0, half: 300 };
let planView = 'proposta';
let splitX = 0.5;
const orthoScene = new THREE.Scene(); orthoScene.background = new THREE.Color(0xe9e4dc);
const tileCache = new Map<string, THREE.Mesh>();
const texLoader = new THREE.TextureLoader();

function updateOrtho() {
  const a = innerWidth / innerHeight;
  orthoCam.left = -plan.half; orthoCam.right = plan.half; orthoCam.top = plan.half / a; orthoCam.bottom = -plan.half / a;
  orthoCam.position.set(plan.cx, 1500, plan.cz); orthoCam.lookAt(plan.cx, 0, plan.cz);
  orthoCam.updateProjectionMatrix(); orthoCam.updateMatrixWorld();
  const mpp = (2 * plan.half) / innerWidth;
  const sb = $('#scalebar'); if (sb) {
    const nice = [5, 10, 20, 50, 100, 200, 500][[5, 10, 20, 50, 100, 200, 500].findIndex((v) => v / mpp > 70)] || 500;
    (sb.querySelector('i') as HTMLElement).style.width = `${nice / mpp}px`; (sb.querySelector('b') as HTMLElement).textContent = `${nice} m`;
  }
}
function planFocus(x: number, y: number, half?: number) {
  const t = b2t(x, y); plan.cx = t.x; plan.cz = t.z; if (half) plan.half = half; updateOrtho();
}
function planHome() {
  const e = planExtent; planFocus((e.xmin + e.xmax) / 2, (e.ymin + e.ymax) / 2, (e.xmax - e.xmin) / 2 * 1.02);
}
function setPlanView(v: string) {
  planView = v;
  document.querySelectorAll('#planbar button').forEach((b: any) => b.classList.toggle('active', b.dataset.pv === v));
  $('#splitter').classList.toggle('hidden', v !== 'comparar');
  if (v === 'existente' || v === 'comparar') showInfo(`<div class="kicker">Condição existente</div><h2>Ortofoto de 5 cm</h2>
    <p>Ortomosaico georreferenciado em <b>SIRGAS 2000 / UTM 22S</b>, no mesmo referencial do CAD e do modelo R07. Origem local: E 700080 / N 7070350.</p>
    <p>Conferência na estação: o contorno da estação existente coincide com o modelo, com diferença da ordem de 1 m.</p>
    <span class="chip ok">Documentação real (não simulada)</span><span class="chip ep">Data do voo não informada</span>
    <div class="src">TRILHO (GSD 5 cm MDS).tif · pipeline/ortofoto_tiles.py</div>`);
}
function ensureTiles() {
  if (!orthoMeta) return;
  const e = orthoMeta.extent_local;
  const mpp = (2 * plan.half) / (innerWidth * renderer.getPixelRatio());
  let L = 0; orthoMeta.levels.forEach((lv: any, i: number) => { if (lv.meters_per_px >= mpp * 0.6) L = i; });
  const want = new Set<number>([0, L]);
  const vb = { x0: plan.cx - plan.half, x1: plan.cx + plan.half, y0: -plan.cz - plan.half, y1: -plan.cz + plan.half };
  for (const li of want) {
    const lv = orthoMeta.levels[li]; const s = orthoMeta.tile_px * lv.meters_per_px;
    for (const [tx, ty] of lv.tiles) {
      const x0 = e.xmin + tx * s, ytop = e.ymax - ty * s;
      if (li > 0 && (x0 > vb.x1 || x0 + s < vb.x0 || ytop < vb.y0 || ytop - s > vb.y1)) continue;
      const key = `${li}/${tx}_${ty}`; if (tileCache.has(key)) continue;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s, s).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false }));
      const c = b2t(x0 + s / 2, ytop - s / 2, li * 0.01); mesh.position.copy(c); mesh.renderOrder = li; mesh.visible = false;
      tileCache.set(key, mesh); orthoScene.add(mesh);
      texLoader.load(`${BASE}ortho/${li}/${tx}_${ty}.webp`, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; (mesh.material as any).map = t; (mesh.material as any).needsUpdate = true; mesh.visible = true; });
    }
  }
}
function setupPlanInput() {
  let drag: { x: number; y: number; moved: boolean } | null = null;
  const pts = new Map<number, PointerEvent>(); let pinch0 = 0, half0 = 0;
  canvas.addEventListener('pointerdown', (e) => { if (mode !== 'plan') return; pts.set(e.pointerId, e); drag = { x: e.clientX, y: e.clientY, moved: false }; canvas.setPointerCapture(e.pointerId);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); half0 = plan.half; } });
  canvas.addEventListener('pointermove', (e) => {
    if (mode !== 'plan' || !drag) return;
    if (pts.size === 2) { pts.set(e.pointerId, e); const [a, b] = [...pts.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); plan.half = THREE.MathUtils.clamp(half0 * pinch0 / d, 8, 1400); updateOrtho(); return; }
    const wpp = (2 * plan.half) / innerWidth; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    plan.cx -= dx * wpp; plan.cz -= dy * wpp; drag.x = e.clientX; drag.y = e.clientY; updateOrtho();
  });
  canvas.addEventListener('pointerup', (e) => {
    pts.delete(e.pointerId);
    if (mode === 'plan' && drag && !drag.moved) {
      const wpp = (2 * plan.half) / innerWidth;
      const tx = plan.cx + (e.clientX - innerWidth / 2) * wpp, tz = plan.cz + (e.clientY - innerHeight / 2) * wpp;
      const b = t2b(new THREE.Vector3(tx, 0, tz)); setPin(b.x, b.y);
      showInfo(`<div class="kicker">Ponto selecionado na implantação</div><h2>${fmtUTM(b.x, b.y)}</h2>
        <p class="muted">Local x ${b.x.toFixed(1)} m · y ${b.y.toFixed(1)} m (referencial do CAD)</p><button class="go" id="goPt">Abrir este local em 3D →</button>`);
      $('#goPt').onclick = () => { setMode('orbit'); flyTo([b.x - 30, b.y - 45, 35], [b.x, b.y, 0], 2); };
    }
    drag = null;
  });
  canvas.addEventListener('wheel', (e) => {
    if (mode !== 'plan') return; e.preventDefault();
    const wpp = (2 * plan.half) / innerWidth; const px = e.clientX - innerWidth / 2, py = e.clientY - innerHeight / 2;
    const wx = plan.cx + px * wpp, wz = plan.cz + py * wpp;
    plan.half = THREE.MathUtils.clamp(plan.half * Math.pow(1.0015, e.deltaY), 8, 1400);
    const w2 = (2 * plan.half) / innerWidth; plan.cx = wx - px * w2; plan.cz = wz - py * w2; updateOrtho();
  }, { passive: false });
  const sp = $('#splitter');
  sp.addEventListener('pointerdown', (e) => { sp.setPointerCapture(e.pointerId); const mv = (ev: PointerEvent) => { splitX = THREE.MathUtils.clamp(ev.clientX / innerWidth, 0.02, 0.98); sp.style.left = `${splitX * 100}%`; }; sp.onpointermove = mv as any; sp.onpointerup = () => (sp.onpointermove = null); });
  sp.style.left = '50%';
}
function setPin(x: number, y: number) { pinWorld = { x, y }; pin3d.position.copy(b2t(x, y, 1.2)); pin3d.visible = true; }

// ------------------------------------------------------------------ selecao 3D -> destaque no mapa
function setupPicking() {
  const ray = new THREE.Raycaster(); (ray as any).firstHitOnly = true;
  let down: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || (mode !== 'orbit' && mode !== 'tour') || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
    ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
    const hit = ray.intersectObjects(modelMeshes.filter((m) => m.visible), false)[0];
    if (!hit) return;
    const b = t2b(hit.point); const layer = hit.object.userData.layer;
    if (pickCb) { const cb = pickCb; pickCb = null; document.body.classList.remove('picking'); cb(b.x, b.y); return; }
    setPin(b.x, b.y);
    showInfo(`<div class="kicker">Elemento selecionado</div><h2>${LAYER_LABELS[layer] || layer}</h2>
      <p>Material no modelo: <code>${(hit.object as THREE.Mesh).name.split('__')[1] || ''}</code></p>
      <p>${fmtUTM(b.x, b.y)} · cota ${b.z.toFixed(2)} m</p>
      <p class="muted">O ponto também foi marcado no minimapa e na implantação 2D.</p><button class="go" id="goPlan">Ver na implantação 2D →</button>`);
    $('#goPlan').onclick = () => { controls.target.copy(b2t(b.x, b.y)); setMode('plan'); };
  });
}

// ------------------------------------------------------------------ minimapa
let miniImg: HTMLImageElement, miniCtx: CanvasRenderingContext2D;
function setupMinimap() {
  const c = $<HTMLCanvasElement>('#mini'); const e = planExtent;
  c.width = 600; c.height = Math.round(600 * (e.ymax - e.ymin) / (e.xmax - e.xmin));
  miniCtx = c.getContext('2d')!;
  miniImg = new Image(); miniImg.src = BASE + `plan/planta_${manifest.revision || 'R07'}.webp`;
  c.addEventListener('click', (ev) => {
    const r = c.getBoundingClientRect(); const w = uvToWorld((ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height, e);
    if (mode === 'plan') planFocus(w.x, w.y);
    else if (mode === 'walk') enterWalk(w.x, w.y);
    else { const off = camera.position.clone().sub(controls.target); const t = b2t(w.x, w.y); const p = t2b(t.clone().add(off)); flyTo([p.x, p.y, Math.max(off.y, 20)], [w.x, w.y, 0], 1.8); }
  });
}
function drawMinimap() {
  if (!miniCtx) return; // ainda carregando (a UI e montada depois da ortofoto)
  const c = miniCtx.canvas, e = planExtent;
  miniCtx.clearRect(0, 0, c.width, c.height);
  if (miniImg.complete) miniCtx.drawImage(miniImg, 0, 0, c.width, c.height);
  const cam = mode === 'plan' ? null : camera;
  const toPx = (x: number, y: number) => { const uv = worldToUV(x, y, e); return [uv.u * c.width, uv.v * c.height]; };
  if (mode === 'plan') {
    const a = innerWidth / innerHeight; const b = t2b(new THREE.Vector3(plan.cx, 0, plan.cz));
    const [x0, y0] = toPx(b.x - plan.half, b.y + plan.half / a), [x1, y1] = toPx(b.x + plan.half, b.y - plan.half / a);
    miniCtx.strokeStyle = '#1f5f9e'; miniCtx.lineWidth = 3; miniCtx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  } else if (cam) {
    const p = t2b(cam.position); const d = new THREE.Vector3(); cam.getWorldDirection(d);
    const ang = Math.atan2(-d.z, d.x); // direcao no plano (x leste, y norte)
    const [px, py] = toPx(p.x, p.y);
    miniCtx.save(); miniCtx.translate(px, py); miniCtx.rotate(-ang);
    miniCtx.fillStyle = 'rgba(31,95,158,0.28)'; miniCtx.beginPath(); miniCtx.moveTo(0, 0); miniCtx.arc(0, 0, 60, -0.45, 0.45); miniCtx.closePath(); miniCtx.fill();
    miniCtx.fillStyle = '#1f5f9e'; miniCtx.beginPath(); miniCtx.arc(0, 0, 7, 0, 6.283); miniCtx.fill();
    miniCtx.strokeStyle = '#fff'; miniCtx.lineWidth = 2.5; miniCtx.stroke(); miniCtx.restore();
  }
  if (pinWorld) { const [x, y] = toPx(pinWorld.x, pinWorld.y); miniCtx.fillStyle = '#e0492e'; miniCtx.strokeStyle = '#fff'; miniCtx.lineWidth = 3; miniCtx.beginPath(); miniCtx.arc(x, y, 8, 0, 6.283); miniCtx.fill(); miniCtx.stroke(); }
}

// ------------------------------------------------------------------ caminhada 1a pessoa
const EYE = 1.65;
const plc = new PointerLockControls(camera, document.body);
const keys: Record<string, boolean> = {};
let feetY = 0.15; const look = { yaw: 0, pitch: 0 };
const isTouch = matchMedia('(pointer: coarse)').matches;
const touchMove = { x: 0, y: 0 };
const downRay = new THREE.Raycaster(); (downRay as any).firstHitOnly = true;
const sideRay = new THREE.Raycaster(); (sideRay as any).firstHitOnly = true;

function groundAt(x: number, z: number, fromY: number): number | null {
  downRay.set(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0)); downRay.far = Math.max(6, fromY + 5);
  const h = downRay.intersectObjects(walkables, false)[0];
  return h ? h.point.y : null;
}
/** Procura, em espiral, o ponto de calcada livre mais proximo (fora de edificios, quiosques e mobiliario). */
function findSpawn(x: number, z: number) {
  const dirs = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => new THREE.Vector3(Math.cos(k * 0.785), 0, Math.sin(k * 0.785)));
  for (let r = 0; r <= 80; r += 2) {
    const n = r === 0 ? 1 : Math.ceil((2 * Math.PI * r) / 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const g = groundAt(px, pz, 40);
      if (g === null || g > 0.8 || g < -0.3) continue;      // telhado / fora do modelo
      // v0.2: nao nascer DENTRO de edificios (piso interno da estacao tambem e "chao"):
      // se houver cobertura acima da cabeca, o ponto e descartado
      sideRay.set(new THREE.Vector3(px, g + 0.5, pz), new THREE.Vector3(0, 1, 0)); sideRay.far = 25;
      if (sideRay.intersectObjects(colliders, false).length) continue;
      let free = true;
      for (const d of dirs) { sideRay.set(new THREE.Vector3(px, g + 0.6, pz), d); sideRay.far = 2.0; if (sideRay.intersectObjects(colliders, false).length) { free = false; break; } }
      if (free) return { x: px, z: pz, g };
    }
  }
  return { x, z, g: 0.15 };
}
/** Direcao de visada inicial: para o ponto de interesse se estiver livre; senao, a direcao mais aberta. */
function bestHeading(px: number, g: number, pz: number, fx: number, fz: number) {
  let best = new THREE.Vector3(1, 0, 0), bestScore = -1;
  const toF = new THREE.Vector3(fx - px, 0, fz - pz); const hasF = toF.length() > 3; toF.normalize();
  for (let k = 0; k < 16; k++) {
    const d = new THREE.Vector3(Math.cos(k * 0.3927), 0, Math.sin(k * 0.3927));
    sideRay.set(new THREE.Vector3(px, g + 1.5, pz), d); sideRay.far = 40;
    const h = sideRay.intersectObjects(colliders, false)[0];
    const free = h ? h.distance : 40;
    const score = free * (hasF ? 1 + Math.max(0, d.dot(toF)) * 1.5 : 1);
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}
function enterWalk(x: number, y: number) {
  mode = 'walk';
  const t = b2t(x, y); const s = findSpawn(t.x, t.z);
  feetY = s.g;
  const d = bestHeading(s.x, s.g, s.z, t.x, t.z);
  camera.position.set(s.x, feetY + EYE, s.z); camera.lookAt(s.x + d.x, feetY + EYE, s.z + d.z);
  camera.near = 0.1; camera.updateProjectionMatrix();
  $('#walkhint').classList.toggle('hidden', isTouch);
  $('#touchpad').classList.toggle('hidden', !isTouch);
  $('#info').classList.add('hidden');
}
function exitWalk() { plc.unlock(); $('#walkhint').classList.add('hidden'); $('#touchpad').classList.add('hidden'); }
function setupWalkInput() {
  $('#walkhint').addEventListener('click', () => plc.lock());
  plc.addEventListener('lock', () => $('#walkhint').classList.add('hidden'));
  plc.addEventListener('unlock', () => { if (mode === 'walk' && !isTouch) $('#walkhint').classList.remove('hidden'); });
  addEventListener('keydown', (e) => (keys[e.code] = true));
  addEventListener('keyup', (e) => (keys[e.code] = false));
  // toque: joystick a esquerda, olhar arrastando a direita
  const pad = $('#touchpad'), stick = $('#stick'), knob = stick.querySelector('i') as HTMLElement;
  let sid = -1, lid = -1, lx = 0, ly = 0;
  pad.addEventListener('pointerdown', (e) => {
    if (e.clientX < innerWidth / 2) { sid = e.pointerId; stick.style.left = `${e.clientX - 60}px`; stick.style.top = `${e.clientY - 60}px`; stick.style.bottom = 'auto'; }
    else { lid = e.pointerId; lx = e.clientX; ly = e.clientY; }
    pad.setPointerCapture(e.pointerId);
  });
  pad.addEventListener('pointermove', (e) => {
    if (e.pointerId === sid) { const r = stick.getBoundingClientRect(); const dx = e.clientX - (r.left + 60), dy = e.clientY - (r.top + 60); const l = Math.min(1, Math.hypot(dx, dy) / 55); const a = Math.atan2(dy, dx); touchMove.x = Math.cos(a) * l; touchMove.y = Math.sin(a) * l; knob.style.transform = `translate(${touchMove.x * 40}px, ${touchMove.y * 40}px)`; }
    if (e.pointerId === lid) { rotateLook((e.clientX - lx) * 0.004, (e.clientY - ly) * 0.004); lx = e.clientX; ly = e.clientY; }
  });
  const end = (e: PointerEvent) => { if (e.pointerId === sid) { sid = -1; touchMove.x = touchMove.y = 0; knob.style.transform = ''; } if (e.pointerId === lid) lid = -1; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
}
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
function rotateLook(dx: number, dy: number) {
  _e.setFromQuaternion(camera.quaternion); _e.y -= dx; _e.x = THREE.MathUtils.clamp(_e.x - dy, -1.4, 1.4); camera.quaternion.setFromEuler(_e);
}
function walkUpdate(dt: number) {
  let fx = 0, fz = 0, run = keys.ShiftLeft || keys.ShiftRight;
  if (keys.KeyW || keys.ArrowUp) fz += 1; if (keys.KeyS || keys.ArrowDown) fz -= 1;
  if (keys.KeyD || keys.ArrowRight) fx += 1; if (keys.KeyA || keys.ArrowLeft) fx -= 1;
  fx += touchMove.x; fz -= touchMove.y;
  const gp = navigator.getGamepads?.()[0];
  if (gp) {
    const dz = (v: number) => (Math.abs(v) > 0.15 ? v : 0);
    fx += dz(gp.axes[0]); fz -= dz(gp.axes[1]); rotateLook(dz(gp.axes[2]) * dt * 2.2, dz(gp.axes[3]) * dt * 1.8);
    if (gp.buttons[7]?.pressed || gp.buttons[10]?.pressed) run = true;
  }
  const len = Math.hypot(fx, fz); if (len < 0.01) return;
  if (len > 1) { fx /= len; fz /= len; }
  const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
  const step = new THREE.Vector3().addScaledVector(fwd, fz).addScaledVector(right, fx).multiplyScalar((run ? 5.5 : 2.0) * dt);
  const tryMove = (mv: THREE.Vector3) => {
    const dist = mv.length(); if (dist < 1e-5) return false; const dir = mv.clone().normalize();
    for (const hgt of [0.42, 1.2]) {
      sideRay.set(new THREE.Vector3(camera.position.x, feetY + hgt, camera.position.z), dir); sideRay.far = dist + 0.35;
      const h = sideRay.intersectObjects(colliders, false)[0];
      if (h) return h;
    }
    const nx = camera.position.x + mv.x, nz = camera.position.z + mv.z;
    const g = groundAt(nx, nz, feetY + 0.5);
    if (g === null || g - feetY > 0.4) return false;
    camera.position.x = nx; camera.position.z = nz; feetY += (g - feetY) * Math.min(1, dt * 12);
    return true;
  };
  const r = tryMove(step);
  if (r !== true && r && (r as any).face) { // deslizar ao longo da parede
    const n = (r as any).face.normal.clone().transformDirection((r as any).object.matrixWorld); n.y = 0; n.normalize();
    tryMove(step.clone().addScaledVector(n, -step.dot(n)));
  }
  camera.position.y = feetY + EYE;
}

// ------------------------------------------------------------------ loop
const timer = new THREE.Timer(); timer.connect(document); let fpsAcc = 0, fpsN = 0, fps = 0, miniT = 0;
const statusEl = $('#status');
function frame() {
  requestAnimationFrame(frame);
  renderer.info.reset(); // contagem de draw calls do quadro inteiro (todas as passadas)
  timer.update(); const dt = Math.min(timer.getDelta(), 0.1);
  if (!manifest || !modelMeshes.length) { renderer.render(scene, camera); return; }
  if (flight?.active) flight.update(dt);
  else if (mode === 'walk') walkUpdate(dt);
  else if (mode !== 'plan' && controls.enabled) controls.update();
  if (mode !== 'walk' && mode !== 'plan') { const d = camera.position.distanceTo(controls.target); camera.near = THREE.MathUtils.clamp(d * 0.003, 0.2, 5); camera.updateProjectionMatrix(); }
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (mode === 'plan') {
    updateShadowFrustum(new THREE.Vector3(plan.cx, 0, plan.cz), plan.half * 1.1);
    ensureTiles();
    renderer.setScissorTest(false);
    const fog = scene.fog; scene.fog = null; // a camera de planta fica a 1.500 m: sem nevoa atmosferica no 2D
    const pv = people.visible; people.visible = false; // silhuetas verticais viram tracos vistas de cima
    if (planView === 'existente') renderer.render(orthoScene, orthoCam);
    else {
      renderer.render(scene, orthoCam);
      if (planView === 'comparar') { renderer.setScissorTest(true); renderer.setScissor(0, 0, w * splitX, h); renderer.render(orthoScene, orthoCam); renderer.setScissorTest(false); }
    }
    scene.fog = fog; people.visible = pv;
    updateHotspots(orthoCam);
  } else {
    const tgt = mode === 'walk' ? camera.position : controls.target;
    const half = mode === 'walk' ? 45 : camera.position.distanceTo(controls.target) * 0.75;
    updateShadowFrustum(tgt, half);
    if (post?.enabled) { post.setScale(mode === 'walk' ? 40 : camera.position.distanceTo(controls.target)); post.render(); }
    else renderer.render(scene, camera);
    updateHotspots(camera);
  }
  miniT += dt; if (miniT > 0.1) { miniT = 0; drawMinimap(); }
  fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; const f = focusPoint(); statusEl.textContent = `${fps.toFixed(0)} FPS · ${renderer.info.render.calls} draw calls · ${fmtUTM(f.x, f.y)}`; }
}

addEventListener('resize', resize);
resize();
frame();
boot();
