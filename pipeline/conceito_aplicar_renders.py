"""Aplica os renders aprovados (IMAGENS_PARA_RENDER/RESULTADOS_RENDER/<nome>.png|jpg|webp) na Pagina Conceito.
Gera public/conceito/<nome>-900.webp e -1600.webp (guarda copia *.orig do WebP anterior).
Uso: python pipeline/conceito_aplicar_renders.py
"""
import pathlib, shutil
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
RES = ROOT / "IMAGENS_PARA_RENDER/RESULTADOS_RENDER"
DST = ROOT / "public/conceito"
n = 0
for f in sorted(RES.iterdir()):
    if f.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"} or f.name.upper().startswith("LEIA"): continue
    if not list(DST.glob(f"{f.stem}-1600.webp")): print("ignorado (nome nao existe na pagina):", f.name); continue
    im = Image.open(f).convert("RGB")
    for w in (900, 1600):
        alvo = DST / f"{f.stem}-{w}.webp"
        if alvo.exists() and not alvo.with_suffix(".webp.orig").exists(): shutil.copy2(alvo, alvo.with_suffix(".webp.orig"))
        im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).save(alvo, "WEBP", quality=82, method=6)
    print("aplicado:", f.name); n += 1
print(n, "imagem(ns) aplicada(s)")
