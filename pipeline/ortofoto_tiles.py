# -*- coding: utf-8 -*-
"""
Ortomosaico existente -> piramide de tiles WebP para o modo 2D "Existente".

Por que tiles? A imagem original tem 47.155 x 11.576 px (2,2 GB descomprimida). Um navegador nao carrega isso.
Dividimos em blocos de 1024 px em 4 niveis (0,8 / 0,4 / 0,2 / 0,1 m/px) e a aplicacao baixa so o que esta na tela.

Georreferencia lida do proprio GeoTIFF (SIRGAS 2000 / UTM 22S):
  tiepoint pixel(0,0) -> E 698526.3717 / N 7070586.3585 ; pixel 0,05 m
Coordenada local do projeto = UTM - (700080, 7070350)  (origem registrada em modelo_integral/LEIA_ME.md)
Tambem gera uma imagem de conferencia: planta do modelo R07 sobreposta a ortofoto no mesmo referencial.
"""
import json, math
from pathlib import Path
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'TRILHO (GSD 5 cm MDS) (1).tif'
PUB = ROOT / 'experiencia_web' / 'public'
OUT = PUB / 'ortho'; OUT.mkdir(parents=True, exist_ok=True)
ORIGIN = (700080.0, 7070350.0)

im = Image.open(SRC)
t = im.tag_v2
scale = t[33550][0]; tie = t[33922]
E0, N0 = tie[3], tie[4]
W, H = im.size
xmin = E0 - ORIGIN[0]; ymax = N0 - ORIGIN[1]
xmax = xmin + W * scale; ymin = ymax - H * scale
print('ortho local extent', xmin, ymin, xmax, ymax)
im.load()
print('loaded')

TILE = 1024
levels = []
for lvl, mpp in enumerate([0.8, 0.4, 0.2, 0.1]):
    f = mpp / scale
    w = math.ceil(W / f); h = math.ceil(H / f)
    img = im.resize((w, h), Image.LANCZOS, reducing_gap=3.0)
    d = OUT / str(lvl); d.mkdir(exist_ok=True)
    tiles = []
    for ty in range(math.ceil(h / TILE)):
        for tx in range(math.ceil(w / TILE)):
            box = (tx * TILE, ty * TILE, min(w, (tx + 1) * TILE), min(h, (ty + 1) * TILE))
            c = img.crop(box)
            a = c.getchannel('A')
            if a.getbbox() is None: continue          # bloco totalmente vazio
            if c.size != (TILE, TILE):
                pad = Image.new('RGBA', (TILE, TILE), (0, 0, 0, 0)); pad.paste(c, (0, 0)); c = pad
            c.save(d / f'{tx}_{ty}.webp', 'WEBP', quality=80, method=5)
            tiles.append([tx, ty])
    levels.append(dict(level=lvl, meters_per_px=mpp, width_px=w, height_px=h, tiles=tiles))
    print('level', lvl, mpp, len(tiles))
    if lvl == 0:
        ov = img  # 0,8 m/px para conferencia

meta = dict(source=SRC.name, crs='SIRGAS 2000 / UTM zone 22S', gsd_m=scale, tiepoint_utm=[E0, N0],
            origin_local_utm=list(ORIGIN), extent_local=dict(xmin=xmin, ymin=ymin, xmax=xmax, ymax=ymax),
            tile_px=TILE, levels=levels,
            note='Condicao existente documentada por ortomosaico. Data do voo nao informada nos metadados.')
(PUB / 'data' / 'ortho.json').write_text(json.dumps(meta, indent=1), encoding='utf-8')

# ---- conferencia: planta R07 (render Blender) sobre a ortofoto, mesmo referencial
man = json.loads((PUB / 'data' / 'manifest.json').read_text(encoding='utf-8'))['plan']
mpp = 0.8
plan = Image.open(PUB / 'plan' / 'planta_R07.webp').convert('RGBA')
pw = round((man['xmax'] - man['xmin']) / mpp); ph = round((man['ymax'] - man['ymin']) / mpp)
plan = plan.resize((pw, ph), Image.LANCZOS)
ox = round((man['xmin'] - xmin) / mpp); oy = round((ymax - man['ymax']) / mpp)
base = ov.copy(); a = plan.getchannel('A').point(lambda v: int(v * 0.55)); plan.putalpha(a)
base.alpha_composite(plan, (ox, oy))
CHK = ROOT / 'experiencia_web' / 'pipeline' / 'conferencia'
CHK.mkdir(exist_ok=True)
base.save(CHK / 'ortho_x_planta_geral.png')
# recorte da estacao (x 85..131, y 59..72) em resolucao 0,1 m/px
f = 0.1 / scale
cx0, cx1, cy0, cy1 = 40, 230, 20, 110
crop = im.crop((round((cx0 - xmin) / scale), round((ymax - cy1) / scale), round((cx1 - xmin) / scale), round((ymax - cy0) / scale)))
crop = crop.resize((round(crop.width / f), round(crop.height / f)), Image.LANCZOS)
pl = Image.open(PUB / 'plan' / 'planta_R07.webp').convert('RGBA')
ppx = man['meters_per_px']
pc = pl.crop((round((cx0 - man['xmin']) / ppx), round((man['ymax'] - cy1) / ppx), round((cx1 - man['xmin']) / ppx), round((man['ymax'] - cy0) / ppx)))
pc = pc.resize(crop.size, Image.LANCZOS)
pc.putalpha(pc.getchannel('A').point(lambda v: int(v * 0.5)))
crop.alpha_composite(pc)
crop.save(CHK / 'ortho_x_planta_estacao.png')
print('ORTHO_OK')
