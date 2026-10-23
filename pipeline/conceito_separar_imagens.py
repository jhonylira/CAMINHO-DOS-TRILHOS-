"""Separa, em IMAGENS_PARA_RENDER/, todas as imagens que aparecem na pagina Conceito (conceito.html + conceito.ts)
na MAIOR resolucao disponivel, com MANIFESTO.md (uso, origem e SHA-256).

Uso:  python pipeline/conceito_separar_imagens.py
Nao altera nenhum arquivo de origem: so COPIA (a pagina continua usando os WebP de public/conceito/).
"""
import re, shutil, hashlib, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent          # experiencia_web/
REPO = ROOT.parent
OUT = ROOT / "IMAGENS_PARA_RENDER"
html = (ROOT / "conceito.html").read_text(encoding="utf-8")
ts = (ROOT / "src/conceito/conceito.ts").read_text(encoding="utf-8")
usadas = sorted(set(re.findall(r"/conceito/([a-z0-9_]+)-(?:1600|2400|1000)\.webp", html)) | set(re.findall(r"file: '([a-z0-9_]+)'", ts)))

R07 = REPO / "estudo_ep_r00d/bases_blender_R07"
BLENDER = {"r07_oeste": "01_OESTE.png", "r07_central": "02_CENTRAL.png", "r07_estacao": "03_ESTACAO.png",
           "r07_floreiras": "14_NOVAS_FLOREIRAS.png", "r07_berco": "15_BERCO_ESTACIONAMENTO.png", "r07_canteiro": "16_ARVORE_MOVIMENTADA.png"}
FOTOS = {"ex_estacao_hoje": "trecho estação (5).JPG", "ex_estacionamento_prefeitura": "Fundos prefeitura.JPG",
         "ex_caminho_informal": "trecho estação (2).JPG", "ex_praca_subutilizada": "praça subutilizada dos expedicionario  (11).JPG",
         "ex_trilhos_fundos": "Trecho praça central (3).JPG", "ex_prefeitura_trecho": "Trecho fundos prefeitura.JPG",
         "ex_praca_central_trecho": "Trecho praça central (1).JPG", "ex_hotel_entrada": "paralela hotel andardac.JPG",
         "ex_praca_expedicionarios": "praça subutilizada dos expedicionario  (4).JPG"}
CAP = {  # onde cada imagem aparece
 "rt_estacao": "Hero e Trecho 1 (cartao)", "rt_cafe": "Cap. 5 · Estacao", "rt_cafe_noite": "Cap. 5 · Estacao (noite)",
 "r07_estacao": "Cap. 5 · Estacao (imagem larga)", "rt_oeste": "Cap. 6 · Percurso (imagem larga)", "rt_corredor": "Cap. 6 · Respeito a ferrovia",
 "r07_oeste": "Cap. 6 · Grelha e luz", "r07_canteiro": "Cap. 7 · Floreiras (imagem larga)", "r07_floreiras": "Cap. 7 · Estacionamento 45",
 "rt_quiosque_pedestre": "Cap. 7 · Quiosques", "r07_berco": "Cap. 7 · Floreira chanfrada", "rt_geral": "Cap. 8 · Masterplan",
 "rt_estacao_manha": "Experiencia · comparador (manha)", "rt_estacao_noite": "Experiencia · comparador (noite)",
 "rt_estacao_entardecer": "Experiencia · comparador (entardecer)", "planta_r07": "Cap. 3 · Implantacao",
 "ex_estacao_hoje": "Cap. 1 · Origem", "ex_estacionamento_prefeitura": "Cap. 2 · imagem larga", "ex_caminho_informal": "Cap. 2 · trio",
 "ex_praca_subutilizada": "Cap. 2 · trio", "ex_trilhos_fundos": "Cap. 2 · trio", "ex_prefeitura_trecho": "Cap. 4 · Trecho 2",
 "ex_praca_central_trecho": "Cap. 4 · Trecho 3", "ex_hotel_entrada": "Cap. 4 · Trecho 4", "ex_praca_expedicionarios": "Cap. 5 · Praca existente",
}
pastas = {"blender": "01_modelo_blender_R07", "rt": "02_capturas_tempo_real", "planta": "03_planta_implantacao", "foto": "04_fotos_reais_AMVALI_NAO_RENDERIZAR"}
for p in pastas.values(): (OUT / p).mkdir(parents=True, exist_ok=True)
(OUT / "RESULTADOS_RENDER").mkdir(exist_ok=True)

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
linhas = []
for n in usadas:
    if n in BLENDER: src, tipo = R07 / BLENDER[n], "blender"
    elif n.startswith("rt_"): src, tipo = ROOT / "tests/capturas/conceito_raw" / f"{n}.png", "rt"
    elif n.startswith("planta"): src, tipo = ROOT / "public/plan/planta_R07.webp", "planta"
    elif n in FOTOS: src, tipo = ROOT / "Imagens existente do local" / FOTOS[n], "foto"
    else: print("SEM ORIGEM:", n); continue
    if not src.exists(): print("NAO ENCONTRADO:", src); continue
    dst = OUT / pastas[tipo] / f"{n}{src.suffix.lower()}"
    shutil.copy2(src, dst)
    from PIL import Image
    w, h = Image.open(dst).size
    linhas.append((tipo, n, dst.relative_to(OUT).as_posix(), f"{w}x{h}", CAP.get(n, ""), sha(dst), src.name))

nomes = {"blender": "Render Blender R07 (geometria do autor)", "rt": "Captura em tempo real do explorador", "planta": "Planta gerada do modelo", "foto": "Foto real AMVALI 16/06/2026"}
md = ["# Imagens da Página Conceito — pasta para render", "",
 "Gerado por `pipeline/conceito_separar_imagens.py`. Arquivos **copiados** na maior resolução disponível; a página continua usando os WebP de `public/conceito/`.", "",
 "## Regras (AGENTS.md)", "",
 "- **Entrada correta:** a IA deve receber **exatamente** o arquivo desta pasta (pastas 01, 02 e 03). Registre o SHA-256 de entrada e de saída.",
 "- **Conferência:** compare cada resultado com a entrada (posição de trilhos, estação, troncos, floreiras, níveis) por **fiscal independente** antes de aprovar.",
 "- **Fotos reais (pasta 04):** são registro do estado atual. **Não renderizar** — usar como estão.",
 "- Pessoas, veículos, vegetação, materiais e luz continuam **ilustrativos**. Não usar nada de `DESCARTADOS_20261020_FORA_CONTEXTO`.",
 "- Os arquivos `rt_*` são capturas do explorador (fundo e entorno simplificados): servem de **guia de enquadramento**; o ideal é renderizar a partir do Blender com a mesma câmera.", "",
 "## Como devolver os resultados", "",
 "1. Salve o resultado aprovado em `RESULTADOS_RENDER/` com o **mesmo nome-base** (ex.: `rt_cafe.png`).",
 "2. Rode `python pipeline/conceito_aplicar_renders.py` — gera os WebP 900/1600 em `public/conceito/` (mantém backup `*.orig`).", "",
 "## Inventário", "", "| Pasta | Arquivo | Pixels | Onde aparece | Origem | SHA-256 |", "|---|---|---|---|---|---|"]
for tipo, n, rel, px, cap, h, orig in sorted(linhas, key=lambda x: (x[0], x[1])):
    md.append(f"| {pastas[tipo]} | `{n}{pathlib.Path(rel).suffix}` | {px} | {cap} | {nomes[tipo]} (`{orig}`) | `{h[:16]}…` |")
(OUT / "MANIFESTO.md").write_text("\n".join(md) + "\n", encoding="utf-8")
print(len(linhas), "imagens copiadas")

