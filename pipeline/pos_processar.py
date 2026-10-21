# -*- coding: utf-8 -*-
"""
Pos-processamento (Python do sistema + Pillow), executado apos exportar_web.py.
 - Converte a planta Blender para WebP (leve para web), preservando dimensoes em pixels (calibracao intacta).
 - Copia os renders de evidencia Blender R07 (bases_blender_R07) como "renders de referencia" pre-renderizados,
   vinculados a camera original de mesmo nome. Nao usa nada de DESCARTADOS_20261020_FORA_CONTEXTO.
"""
import json, hashlib
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PUB = ROOT / 'experiencia_web' / 'public'
SRC_RENDERS = ROOT / 'estudo_ep_r00d' / 'bases_blender_R07'

plan_png = PUB / 'plan' / '00_completa.png'
im = Image.open(plan_png).convert('RGBA')
im.save(PUB / 'plan' / 'planta_R07.webp', 'WEBP', quality=90, method=6)
plan_png.unlink()
for p in (PUB / 'plan').glob('[0-9][0-9]_*.png'):
    p.unlink()  # camadas antigas (a planta por camadas e renderizada no navegador a partir do GLB)

out = PUB / 'renders'; out.mkdir(exist_ok=True)
items = []
for p in sorted(SRC_RENDERS.glob('*.png')):
    assert 'DESCARTADOS' not in str(p)
    r = Image.open(p).convert('RGB')
    w = 2400; h = round(r.height * w / r.width)
    r.resize((w, h), Image.LANCZOS).save(out / (p.stem + '.webp'), 'WEBP', quality=88, method=6)
    cam = {'01_OESTE': 'EP_01_OESTE', '02_CENTRAL': 'EP_02_CENTRAL', '03_ESTACAO': 'EP_03_ESTACAO'}.get(p.stem, 'R07_' + p.stem)
    items.append(dict(id=p.stem, file=f'renders/{p.stem}.webp', camera=cam, source=str(p.relative_to(ROOT)),
                      sha256=hashlib.sha256(p.read_bytes()).hexdigest(),
                      label='Imagem pre-renderizada no Blender (evidencia tecnica R07) - nao e tempo real nem imagem IA'))
(PUB / 'data' / 'renders.json').write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding='utf-8')
print('POS_OK', len(items), 'renders; planta', im.size)
