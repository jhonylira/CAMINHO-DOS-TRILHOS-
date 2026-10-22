"""
silhuetas.py - gera o atlas de silhuetas de pessoas (estilo figura de escala SketchUp).

O que faz (passo a passo):
 1. Le folhas-fonte (silhuetas pretas sobre fundo branco) em pipeline/silhuetas_fonte/.
 2. Converte luminancia em transparencia: escuro = opaco, branco = transparente, com
    borda suavizada (anti-aliasing) por rampa de luminancia.
 3. Separa as figuras por componentes conexos; pedacos pequenos (bengala, rodas soltas,
    alca de bolsa) sao unidos a figura grande mais proxima pela caixa envolvente dilatada.
 4. Recorta cada figura justo, reamostra todas para a mesma altura-alvo em pixels e
    empacota em um atlas potencia-de-2 (RGBA: RGB preto, A = cobertura).
 5. Grava public/people/silhuetas.png + silhuetas.json com o retangulo UV de cada
    figura (v medido de baixo para cima, como o three.js com flipY = true), a razao
    largura/altura e o tipo ('walk' | 'stand' | 'bike' | 'child').

Uso:  python pipeline/silhuetas.py
Dependencias: Pillow, numpy, scipy (ndimage).
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

RAIZ = Path(__file__).resolve().parent.parent
FONTE = RAIZ / "pipeline" / "silhuetas_fonte"
SAIDA = RAIZ / "public" / "people"

# Ordem das figuras em cada folha (esquerda -> direita, cima -> baixo) e seu tipo.
FOLHAS = {
    "folha_a.jpg": ["walk", "walk", "walk", "stand", "stand", "walk", "walk", "child"],
    "folha_b.jpg": ["bike", "bike", "walk", "walk", "walk", "stand", "walk", "stand"],
}

ESCALA_FONTE = 2.0      # super-amostragem antes do limiar (bordas mais limpas)
PRETO, BRANCO = 70, 185  # rampa de luminancia -> alfa (0..255)
ALTURA_ALVO = 440        # altura de cada figura no atlas (px)
PAD = 6                  # margem entre figuras (evita "vazamento" no mipmap)
ATLAS_W = 2048


def alfa_da_folha(caminho: Path) -> np.ndarray:
    img = Image.open(caminho).convert("L")
    if ESCALA_FONTE != 1:
        img = img.resize((int(img.width * ESCALA_FONTE), int(img.height * ESCALA_FONTE)), Image.LANCZOS)
    lum = np.asarray(img, dtype=np.float32)
    a = np.clip((BRANCO - lum) / (BRANCO - PRETO), 0.0, 1.0)
    return a


def separar_figuras(a: np.ndarray, esperado: int):
    """Agrupa componentes conexos em figuras.

    Retorna (rotulos, figuras) onde figuras = [(caixa (y0, y1, x0, x1), conjunto de rotulos)],
    ordenadas por linha e coluna.
    """
    mask = a > 0.5
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    if n == 0:
        return lab, []
    areas = ndimage.sum(mask, lab, index=np.arange(1, n + 1))
    caixas = ndimage.find_objects(lab)
    maior = areas.max()
    grandes = [i for i in range(n) if areas[i] >= 0.12 * maior]
    pequenos = [i for i in range(n) if areas[i] < 0.12 * maior and areas[i] >= 30]  # ruido < 30 px some
    box = {i: [caixas[i][0].start, caixas[i][0].stop, caixas[i][1].start, caixas[i][1].stop] for i in grandes}
    rot = {i: {i + 1} for i in grandes}
    # pedaco pequeno -> figura grande cuja caixa (dilatada) o contem / esta mais proxima
    for j in pequenos:
        y0, y1, x0, x1 = caixas[j][0].start, caixas[j][0].stop, caixas[j][1].start, caixas[j][1].stop
        cy, cx = (y0 + y1) / 2, (x0 + x1) / 2
        best, dbest = None, 1e18
        for i, (by0, by1, bx0, bx1) in box.items():
            dil = 0.15 * (by1 - by0)
            dx = max(bx0 - dil - cx, 0, cx - bx1 - dil)
            dy = max(by0 - dil - cy, 0, cy - by1 - dil)
            d = dx * dx + dy * dy + 1e-3 * ((cx - (bx0 + bx1) / 2) ** 2)
            if d < dbest:
                best, dbest = i, d
        if best is not None and dbest < (0.25 * (box[best][1] - box[best][0])) ** 2:
            b = box[best]
            box[best] = [min(b[0], y0), max(b[1], y1), min(b[2], x0), max(b[3], x1)]
            rot[best].add(j + 1)
    lista = [(tuple(box[i]), rot[i]) for i in box]
    if len(lista) != esperado:
        raise SystemExit(f"esperadas {esperado} figuras, encontradas {len(lista)}: {[b for b, _ in lista]}")
    # ordena por linha (base dos pes, tolerancia de meia altura) e depois por x
    hmed = np.median([b[1] - b[0] for b, _ in lista])
    lista.sort(key=lambda t: (round(t[0][1] / hmed), t[0][2]))
    return lab, lista


def figura_isolada(a: np.ndarray, lab: np.ndarray, rotulos: set[int]) -> np.ndarray:
    """Recorta so os pixels da figura: componentes da borda suave (alfa > 0.02) que contem
    algum nucleo opaco desta figura. Pes/maos de vizinhos que invadem a caixa ficam de fora."""
    baixo, _ = ndimage.label(a > 0.02, structure=np.ones((3, 3)))
    nucleo = np.isin(lab, list(rotulos))
    manter = np.unique(baixo[nucleo])
    manter = manter[manter > 0]
    m = np.isin(baixo, manter)
    ys, xs = np.nonzero(m)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    return np.where(m[y0:y1, x0:x1], a[y0:y1, x0:x1], 0.0)


def main() -> None:
    figuras: list[tuple[np.ndarray, str]] = []
    for nome, tipos in FOLHAS.items():
        a = alfa_da_folha(FONTE / nome)
        lab, caixas = separar_figuras(a, len(tipos))
        for (_, rotulos), tipo in zip(caixas, tipos):
            figuras.append((figura_isolada(a, lab, rotulos), tipo))
        print(f"{nome}: {len(caixas)} figuras")

    # reamostra para a altura-alvo (criancas mantem a mesma resolucao; a escala real e no three.js)
    tiles = []
    for sub, tipo in figuras:
        h, w = sub.shape
        nw = max(1, round(w * ALTURA_ALVO / h))
        im = Image.fromarray((sub * 255).astype(np.uint8), "L").resize((nw, ALTURA_ALVO), Image.LANCZOS)
        tiles.append((im, tipo, w / h))

    # empacotamento em prateleiras (todas com a mesma altura)
    x, y, pos = PAD, PAD, []
    for im, _, _ in tiles:
        if x + im.width + PAD > ATLAS_W:
            x, y = PAD, y + ALTURA_ALVO + 2 * PAD
        pos.append((x, y))
        x += im.width + 2 * PAD
    usado = y + ALTURA_ALVO + PAD
    atlas_h = 1 << int(np.ceil(np.log2(usado)))
    alfa = Image.new("L", (ATLAS_W, atlas_h), 0)
    for (im, _, _), (px, py) in zip(tiles, pos):
        alfa.paste(im, (px, py))
    # limpa resquicios de JPEG quase transparentes
    arr = np.asarray(alfa).astype(np.float32)
    arr[arr < 8] = 0
    alfa = Image.fromarray(arr.astype(np.uint8), "L")
    rgba = Image.merge("RGBA", (Image.new("L", alfa.size, 0),) * 3 + (alfa,))

    SAIDA.mkdir(parents=True, exist_ok=True)
    png = SAIDA / "silhuetas.png"
    rgba.save(png, optimize=True)

    W, H = ATLAS_W, atlas_h
    figs = []
    for (im, tipo, asp), (px, py) in zip(tiles, pos):
        figs.append({
            "u0": round(px / W, 6), "v0": round(1 - (py + im.height) / H, 6),
            "u1": round((px + im.width) / W, 6), "v1": round(1 - py / H, 6),
            "aspect": round(asp, 4), "kind": tipo,
        })
    meta = {
        "descricao": "Silhuetas ilustrativas de escala humana (nao representam fluxo/contagem). v a partir da base (flipY=true).",
        "atlas": {"w": W, "h": H, "arquivo": "silhuetas.png"},
        "figures": figs,
    }
    (SAIDA / "silhuetas.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"atlas {W}x{H}, {len(figs)} figuras, {png.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
