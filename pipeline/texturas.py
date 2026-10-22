"""
Baixa texturas PBR CC0 (Poly Haven + ambientCG) e o ceu de fundo, convertendo para WebP.

Uso (na pasta experiencia_web):  python pipeline/texturas.py
Saida:
  public/textures/<asset>/diff.webp | nor.webp | rough.webp   (1k)
  public/textures/manifest.json      (tamanho real em metros, cor media linear, fonte)
  public/env/ceu_fundo_8k.webp e ceu_fundo_4k.webp (fundo LDR do mesmo HDRI usado na iluminacao)

Didatica: o navegador nao precisa de JPG/PNG de 4k para materiais de urbanismo vistos de longe;
1k em WebP (q~82) mantem o grao fotografico e cabe em poucos MB. A cor semantica do autor e
reaplicada no runtime (materials.ts) dividindo a cor do GLB pela cor media da foto.
"""
import io, json, os, sys, urllib.request, zipfile
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'textures')
ENV = os.path.join(ROOT, 'public', 'env')
UA = {'User-Agent': 'Mozilla/5.0 (caminho-dos-trilhos pipeline)'}

# asset -> uso no projeto
POLYHAVEN = {
    'asphalt_04': 'Asfalto novo (EP_ASFALTO)',
    'asphalt_02': 'Asfalto existente/trincado (Cracked asphalt)',
    'gravel_embedded_concrete': 'Concreto fulget (agregado exposto) cinza e terroso',
    'concrete_wall_008': 'Concreto liso: guias e floreiras',
    'granular_concrete': 'Concreto microagregado claro e faixa especial cimenticia',
    'farm_soil': 'Solo organico / solo aerado',
    'gray_rocks': 'Lastro ferroviario (brita)',
    'red_brick': 'Tijolinho aparente',
    'clay_roof_tiles_02': 'Telha ceramica',
    'oak_veneer_01': 'Madeira de bancos e ripados',
    'painted_plaster_wall': 'Reboco pintado (entorno volumetrico e estacao)',
}
AMBIENTCG = {
    'Grass004': ('Grama de canteiros / vegetacao baixa', 2.0),
    'Grass001': ('Massa de vegetacao baixa (forracao densa)', 2.0),
}
SKY = 'kloofendal_48d_partly_cloudy_puresky'
# rugosidade em mapa so onde a foto tem variacao real de brilho (nas demais, desvio < 2%: usa-se constante)
ROUGH = {'asphalt_02', 'oak_veneer_01'}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()


def mean_linear(im):
    """Cor media em espaco LINEAR (como o shader enxerga), a partir de uma copia reduzida."""
    small = im.convert('RGB').resize((64, 64), Image.BILINEAR)
    acc = [0.0, 0.0, 0.0]
    px = list(small.getdata())
    for p in px:
        for c in range(3):
            v = p[c] / 255.0
            acc[c] += v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return [round(a / len(px), 5) for a in acc]


def save(im, path, q, gray=False):
    im = im.convert('L' if gray else 'RGB')
    if max(im.size) > 1024:
        im = im.resize((1024, 1024), Image.LANCZOS)
    im.save(path, 'WEBP', quality=q, method=6)
    return os.path.getsize(path)


def haze_below_horizon(sky):
    """O HDRI 'puresky' espelha as nuvens abaixo do horizonte. Na vista aerea isso aparece alem do
    chao do modelo; trocamos o hemisferio inferior por uma nevoa de horizonte (cor da propria faixa
    do horizonte de cada coluna) que escurece suavemente para um tom de terreno distante."""
    import numpy as np
    a = np.asarray(sky).astype(np.float32) / 255.0
    H, W = a.shape[:2]
    h0 = H // 2
    band = a[h0 - H // 90:h0].mean(axis=0, keepdims=True)  # faixa logo acima do horizonte
    # suaviza a faixa na horizontal (media movel circular) para nao "escorrer" nuvens em listras
    r = W // 24
    pad = np.concatenate([band[:, -r:], band, band[:, :r]], axis=1)
    cs = np.cumsum(pad, axis=1)
    band = (cs[:, 2 * r:] - cs[:, :-2 * r]) / (2 * r)
    band = band[:, :W]
    t = (np.arange(H - h0, dtype=np.float32) / (H - h0))[:, None, None]
    far = np.array([0.56, 0.60, 0.60], np.float32)[None, None, :]
    k = np.clip(t / 0.25, 0, 1); k = k * k * (3 - 2 * k)
    lower = band * (1 - k) + far * k
    # transicao de alguns pixels sobre o horizonte para nao marcar uma linha
    out = a.copy(); out[h0:] = lower
    blend = H // 400
    for i in range(blend):
        w = (i + 1) / (blend + 1)
        out[h0 - blend + i] = a[h0 - blend + i] * (1 - w) + band[0] * w
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8))


def main():
    os.makedirs(OUT, exist_ok=True)
    man = {}
    if '--so-ceu' in sys.argv:
        POLYHAVEN.clear(); AMBIENTCG.clear()
    for a, uso in POLYHAVEN.items():
        files = json.loads(get(f'https://api.polyhaven.com/files/{a}'))
        info = json.loads(get(f'https://api.polyhaven.com/info/{a}'))
        d = os.path.join(OUT, a); os.makedirs(d, exist_ok=True)
        urls = {
            'diff': files['Diffuse']['1k']['jpg']['url'],
            'nor': files['nor_gl']['1k']['jpg']['url'],
            'rough': files['Rough']['1k']['jpg']['url'],
        }
        size, mean = 0, None
        for k, u in urls.items():
            if k == 'rough' and a not in ROUGH: continue
            im = Image.open(io.BytesIO(get(u)))
            if k == 'diff': mean = mean_linear(im)
            size += save(im, os.path.join(d, k + '.webp'), 82 if k != 'nor' else 88, gray=(k == 'rough'))
        dims = info.get('dimensions') or [2000, 2000]
        man[a] = {'uso': uso, 'fonte': 'Poly Haven', 'url': f'https://polyhaven.com/a/{a}',
                  'autores': list((info.get('authors') or {}).keys()), 'licenca': 'CC0',
                  'tamanho_m': round(dims[0] / 1000, 3), 'media_linear': mean, 'bytes': size}
        print(a, size, mean)
    for a, (uso, meters) in AMBIENTCG.items():
        z = zipfile.ZipFile(io.BytesIO(get(f'https://ambientcg.com/get?file={a}_1K-JPG.zip')))
        names = z.namelist()
        pick = lambda key: next(n for n in names if key in n and n.lower().endswith('.jpg'))
        d = os.path.join(OUT, a); os.makedirs(d, exist_ok=True)
        size, mean = 0, None
        for k, key in (('diff', '_Color'), ('nor', '_NormalGL')):
            im = Image.open(io.BytesIO(z.read(pick(key))))
            if k == 'diff': mean = mean_linear(im)
            size += save(im, os.path.join(d, k + '.webp'), 82 if k != 'nor' else 88, gray=(k == 'rough'))
        man[a] = {'uso': uso, 'fonte': 'ambientCG', 'url': f'https://ambientcg.com/a/{a}', 'autores': ['Lennart Demes (ambientCG)'],
                  'licenca': 'CC0', 'tamanho_m': meters, 'media_linear': mean, 'bytes': size}
        print(a, size, mean)
    if man:
        with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
            json.dump(man, f, ensure_ascii=False, indent=1)

    # Ceu de fundo: JPG "tonemapped" oficial do mesmo HDRI da iluminacao (8192 x 4096)
    if '--sem-ceu' not in sys.argv:
        sky = Image.open(io.BytesIO(get(f'https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/{SKY}.jpg'))).convert('RGB')
        sky = haze_below_horizon(sky)
        for w, q in ((8192, 80), (4096, 84)):
            im = sky if sky.size[0] == w else sky.resize((w, w // 2), Image.LANCZOS)
            p = os.path.join(ENV, f'ceu_fundo_{w // 1024}k.webp')
            im.save(p, 'WEBP', quality=q, method=6)
            print(p, os.path.getsize(p))


if __name__ == '__main__':
    main()
