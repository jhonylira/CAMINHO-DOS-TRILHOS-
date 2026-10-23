# -*- coding: utf-8 -*-
"""
Atualiza todas as imagens da Pagina Conceito (public/conceito/) e da galeria Blender (public/renders/)
com os ativos gerados a partir do modelo R08:
  1. Capturas em tempo real (tests/capturas/conceito_raw/rt_*.png) -> -900.webp e -1600.webp
  2. Planta ortografica (public/plan/planta_R08.webp sobre fundo neutro RGB 149,151,148) -> -1200.webp e -2400.webp
  3. Renders Eevee R08 (estudo_ep_r00d/R08/eevee_previas/) -> r07_*-900.webp / -1600.webp e public/renders/*.webp
"""
import json, hashlib
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]          # experiencia_web/
REPO = ROOT.parent
RAW_RT = ROOT / 'tests' / 'capturas' / 'conceito_raw'
EEVEE = REPO / 'estudo_ep_r00d' / 'R08' / 'eevee_previas'
CONCEITO = ROOT / 'public' / 'conceito'
RENDERS = ROOT / 'public' / 'renders'

def save_pair(im: Image.Image, stem: str, widths=(900, 1600), quality=84):
    im = im.convert('RGB')
    for w in widths:
        h = round(im.height * w / im.width)
        im.resize((w, h), Image.LANCZOS).save(CONCEITO / f'{stem}-{w}.webp', 'WEBP', quality=quality, method=6)

# 1. Capturas em tempo real (rt_*)
rt_names = [
    'rt_cafe', 'rt_cafe_noite', 'rt_consolidado', 'rt_corredor',
    'rt_estacao', 'rt_estacao_entardecer', 'rt_estacao_manha', 'rt_estacao_noite',
    'rt_estacionamento', 'rt_geral', 'rt_oeste', 'rt_quiosque_aereo', 'rt_quiosque_pedestre'
]
for name in rt_names:
    src = RAW_RT / f'{name}.png'
    assert src.exists(), f'Faltando captura: {src}'
    save_pair(Image.open(src), name)
print('RT atualizadas:', len(rt_names))

# 2. Planta ortografica sobre fundo neutro (149, 151, 148)
plan_src = ROOT / 'public' / 'plan' / 'planta_R08.webp'
plan_rgba = Image.open(plan_src).convert('RGBA')
bg = Image.new('RGBA', plan_rgba.size, (149, 151, 148, 255))
plan_comp = Image.alpha_composite(bg, plan_rgba).convert('RGB')
save_pair(plan_comp, 'planta_r07', widths=(1200, 2400), quality=86)
print('Planta Conceito atualizada:', plan_comp.size)

# 3. Renders Eevee R08 -> Pagina Conceito e Galeria de Referencia
blender_map = [
    ('r07_oeste',     '01_OESTE.png',                  '01_OESTE',                 'EP_01_OESTE',                  None),
    ('r07_central',   '02_CENTRAL.png',                '02_CENTRAL',               'EP_02_CENTRAL',                None),
    ('r07_estacao',   '03_ESTACAO.png',                '03_ESTACAO',               'EP_03_ESTACAO',                None),
    ('r07_floreiras', '12_CHANFROS_ESTACIONAMENTO.png','14_NOVAS_FLOREIRAS',       'R08_12_CHANFROS_ESTACIONAMENTO',(0, 165, 1600, 768)),
    ('r07_berco',     '15_BERCO_ESTACIONAMENTO.png',   '15_BERCO_ESTACIONAMENTO',  'R07_15_BERCO_ESTACIONAMENTO',  None),
    ('r07_canteiro',  '16_ARVORE_MOVIMENTADA.png',     '16_ARVORE_MOVIMENTADA',    'R07_16_ARVORE_MOVIMENTADA',    None),
]
items = []
for c_stem, src_name, r_id, cam, crop_box in blender_map:
    p = EEVEE / src_name
    assert p.exists(), f'Faltando render Eevee R08: {p}'
    im = Image.open(p).convert('RGB')
    im_conceito = im.crop(crop_box) if crop_box else im
    save_pair(im_conceito, c_stem, widths=(900, 1600), quality=85)
    # Galeria public/renders/
    im.save(RENDERS / f'{r_id}.webp', 'WEBP', quality=88, method=6)
    items.append(dict(
        id=r_id, file=f'renders/{r_id}.webp', camera=cam,
        source=str(p.relative_to(REPO)).replace('\\', '/'),
        sha256=hashlib.sha256(p.read_bytes()).hexdigest(),
        label='Imagem pre-renderizada no Blender (evidencia tecnica R08) - nao e tempo real nem imagem IA'
    ))

(ROOT / 'public' / 'data' / 'renders.json').write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding='utf-8')
print('Renders Blender atualizados:', len(items))
