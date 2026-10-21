# Caminho dos Trilhos — Experiência Urbana 2D + 3D

Apresentação web interativa da requalificação urbana do corredor ferroviário de Guaramirim/SC.
Three.js + Vite + TypeScript. O 3D vem do modelo Blender do estudo preliminar **R07**, exportado sem perdas.

**Demo online:** https://jhonylira.github.io/CAMINHO-DOS-TRILHOS-/

## Protótipo v0.1 — o que já funciona

| Modo | Recursos |
|---|---|
| **Masterplan 3D** | Órbita, zoom e pan; céu HDRI tropical; sol calculado para Guaramirim; sombras; materiais PBR procedurais; árvores nas posições e copas do CAD; pessoas ilustrativas |
| **Implantação 2D** | Planta ortográfica do próprio modelo com pan e zoom; **comparação com a ortofoto de 5 cm** (existente × proposta, com cortina deslizante); clique → abrir o ponto em 3D |
| **Caminhar** | 1ª pessoa: WASD + mouse, Shift para correr, ESC; chão e colisões; toque (tablet); controle Xbox |
| **Apresentação** | 8 cenas com textos fundamentados nos arquivos do projeto; avançar, voltar, pausar e sair (←, →, espaço, ESC) |
| Geral | Camadas temáticas; minimapa com posição e direção da câmera; clique num elemento 3D → marca no mapa; qualidade Leve, Padrão ou Alta; tela cheia (F) |

## Rodar localmente
```bash
npm install
npm run dev        # desenvolvimento: http://localhost:5173
npm run build      # gera dist/ (site estático)
npm run preview    # serve dist/ em http://localhost:4173
```
No Windows, basta dar duplo clique em `ABRIR_DEMO.bat`.

> Abrir o `index.html` direto (file://) **não funciona**: o navegador bloqueia o carregamento do modelo 3D. Use sempre um servidor HTTP.

## Pipeline de dados (fonte: `estudo_ep_r00d/CAMINHO_DOS_TRILHOS_EP_R00d_R07.blend`)
- `pipeline/exportar_web.py`: roda no Blender em modo headless e **somente leitura** (nunca salva o .blend). Converte Z-up em Y-up como rotação pura: `three(x,y,z) = blender(x,z,−y)`. Agrupa 10.714 objetos em 52 malhas (camada × material), com 811 mil triângulos e sem simplificação. Gera o manifesto com o SHA256 da fonte, os dados semânticos e a planta calibrada.
- `pipeline/pos_processar.py`: converte a planta e os renders de referência para WebP.
- `pipeline/ortofoto_tiles.py`: transforma o ortomosaico (SIRGAS 2000 / UTM 22S, 5 cm) numa pirâmide de tiles e gera a imagem de conferência de calibração.

Referencial comum: origem local **E 700080 / N 7070350**, em metros.

## Testes
`node tests/e2e.mjs` usa o Playwright com o Edge e verifica: carregamento, WebGL, cenas, sincronização 2D→3D na estação (erro < 1,5 m), caminhada e telas responsivas. As capturas ficam em `tests/capturas/`.

## Limitações conhecidas (v0.1)
- Estudo preliminar: humanização **ilustrativa**; espécies arbóreas não confirmadas; entorno volumétrico estimado.
- O patamar +0,50 m e as rampas da estação estão pendentes no modelo (parecer R06).
- Praça do Expedicionário, rodoviária e parada de ônibus não estão identificadas no R07 e não aparecem nos textos.
- Data do voo da ortofoto não informada.
