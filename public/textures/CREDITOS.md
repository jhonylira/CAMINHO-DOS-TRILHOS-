# Créditos das texturas e do céu

Todos os arquivos desta pasta e de `public/env/ceu_fundo_*.webp` são **CC0 (domínio público)** —
uso livre, inclusive comercial, sem obrigação de atribuição. Mesmo assim registramos a origem para rastreabilidade.
Gerados por `pipeline/texturas.py`: download em 1k (JPG), conversão para WebP (cor q82, normal q88, rugosidade q82 em tons de cinza).
O arquivo `manifest.json` traz para cada textura o tamanho real fotografado (m), a cor média linear e o peso em bytes.

| Pasta | Uso no projeto | Fonte | Autores | Licença |
|---|---|---|---|---|
| `asphalt_04` | Asfalto novo (EP_ASFALTO) | https://polyhaven.com/a/asphalt_04 | Jenelle van Heerden, Sergej Majboroda | CC0 |
| `asphalt_02` | Asfalto existente (Cracked asphalt) | https://polyhaven.com/a/asphalt_02 | Rob Tuytel | CC0 |
| `gravel_embedded_concrete` | Concreto fulget cinza e terroso | https://polyhaven.com/a/gravel_embedded_concrete | Charlotte Baglioni | CC0 |
| `concrete_wall_008` | Concreto liso: guias, floreiras, mureta | https://polyhaven.com/a/concrete_wall_008 | Dario Barresi, Charlotte Baglioni | CC0 |
| `granular_concrete` | Concreto microagregado, faixa especial cimentícia, balcão | https://polyhaven.com/a/granular_concrete | Dario Barresi, Michael Jenkins | CC0 |
| `farm_soil` | Solo orgânico / aerado / lote vizinho | https://polyhaven.com/a/farm_soil | Amal Kumar | CC0 |
| `gray_rocks` | Lastro ferroviário (brita) | https://polyhaven.com/a/gray_rocks | Dimitrios Savva | CC0 |
| `red_brick` | Tijolinho aparente (base dos cafés/bistrô) | https://polyhaven.com/a/red_brick | Rob Tuytel | CC0 |
| `clay_roof_tiles_02` | Telha cerâmica | https://polyhaven.com/a/clay_roof_tiles_02 | Amal Kumar | CC0 |
| `oak_veneer_01` | Madeira de bancos e ripados | https://polyhaven.com/a/oak_veneer_01 | Jenelle van Heerden | CC0 |
| `painted_plaster_wall` | Reboco pintado (entorno, estação, fechamentos) | https://polyhaven.com/a/painted_plaster_wall | Amal Kumar | CC0 |
| `Grass004` | Grama dos canteiros / vegetação baixa | https://ambientcg.com/a/Grass004 | ambientCG (Lennart Demes) | CC0 |
| `Grass001` | Massa de vegetação baixa (forração densa) | https://ambientcg.com/a/Grass001 | ambientCG (Lennart Demes) | CC0 |

A Poly Haven não possui gramado fotográfico denso; por isso as duas gramas vêm da ambientCG, também CC0.

## Céu

| Arquivo | Uso | Fonte | Licença |
|---|---|---|---|
| `public/env/ceu_parcialmente_nublado_2k.hdr` | Iluminação (IBL) e reflexos | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky (Greg Zaal — original; Jarod Guest — edição do céu / Poly Haven) | CC0 |
| `public/env/ceu_fundo_8k.webp`, `ceu_fundo_4k.webp` | Fundo visível em alta resolução | Mesmo HDRI, versão “Tonemapped JPG” oficial (8192 × 4096) | CC0 |

No fundo, o hemisfério inferior (que no “puresky” espelhava as nuvens) foi trocado por névoa neutra de horizonte.
