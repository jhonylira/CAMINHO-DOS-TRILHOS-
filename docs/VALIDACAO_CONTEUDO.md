# Validação independente de conteúdo

Data: 22/10/2026. Revisão realizada por agente independente do autor das alterações editoriais, conforme a skill `technical-content-validation` do projeto.

## Escopo e resultado

Revisão documental e estática de README, `src/content.ts`, `conceito.html`, `index.html`, avisos de interface e dados de manifesto, roteiro, galeria e renders. Consulta às decisões autorais, ao fluxo híbrido e aos registros fiscais R06/R07 disponíveis no projeto local.

As correções editoriais examinadas distinguem estudo preliminar, hipóteses, representação ilustrativa e pendências. A distância mínima de copa de 3,43 m foi corretamente qualificada como medição histórica R06, com reconferência da exportação atual pendente. O README deixou de afirmar exportação genericamente “sem perdas”, contagem desatualizada de cenas e ausência da Praça do Expedicionário nos textos.

Este relatório **não aprova integralmente a geometria**, não reabre ou modifica Blender, não certifica atendimento executivo e não confirma publicação ou disponibilidade dos endereços online. Testes visuais em navegador e verificação do deploy pertencem ao registro de publicação.

## Rastreabilidade verificada

O SHA256 atual de `CAMINHO_DOS_TRILHOS_EP_R00d_R07.blend` coincide com `public/data/manifest.json`:

`5a76f0309c3e7ca43129979db18df985a0353290e0c9e4501e8b192d042f7e74`

O manifesto registra exportação em 21/10/2026, 10.714 objetos de origem, 52 nós GLB, 811.456 triângulos e 45.691.036 bytes. São contagens do ativo exportado, não quantitativos de obra nem contagem de toda a cena com humanização.

O parecer R06 é vinculado a `ac096fea02d7b841c117a05b01fe73d43a87bdeea749985c32e2573268ebb4a0`. A auditoria R07 disponível registra `1c0c11a3a17efcb7c3c8a0bc700328b6f44590ceb0efeadb6a2a50550faccf61`. Nenhum desses hashes equivale ao da exportação atual; seus resultados não foram promovidos a certificação desta versão.

O nome R07 pertence à sequência do estudo EP e não permite concluir, isoladamente, regressão às decisões da antiga R13. O script e manifesto R07 documentam movimento de árvore conforme revisão CAD, distinto de deslocamento presumido.

## Imagens

- Comparação SHA256: 178 imagens em `public/` contra 25 arquivos de `DESCARTADOS_20261020_FORA_CONTEXTO`, sem coincidência binária.
- Os seis hashes de `public/data/renders.json` coincidem com os respectivos PNGs originais de `bases_blender_R07`.
- O catálogo declara renders Blender e capturas em tempo real, sem imagem IA declarada. Não foi encontrada aprovação de imagem IA que autorize acrescentar novas transformações.
- A comparação de hashes não detecta recortes, recompressões ou outros derivados de uma imagem descartada. Não foi realizada inspeção visual integral das 178 imagens nesta auditoria.

## Classes e fontes

| Conteúdo | Classe / fonte | Resultado |
| --- | --- | --- |
| Cafés/bistrô, vidro em duas águas e base baixa de tijolo | Decisão autoral, AGENTS.md de 19/20 de outubro | Terminologia consistente |
| Luminárias com dois braços opostos a 3/5 m e poste 120 × 120 mm | Decisão autoral de 20 de outubro | Terminologia consistente |
| Grelha circular única, Ø 1,04 m e colo Ø 0,60 m | Módulo representado e parecer R06/R05 | Descrição do estudo, sem aprovação executiva |
| Floreiras e bancos integrados | Decisões autorais de 19/21 de outubro | Dimensões não fornecidas indicadas como hipóteses EP |
| Faixa livre de 3 m de cada lado do eixo | Regra autoral de 15 de outubro | Regra preservada; medição atual pendente |
| Copa mínima de 3,43 m | Medição histórica fiscal R06 | Ressalva editorial corrigida |
| Pessoas, veículos, vegetação humanizada e iluminação | Representação ilustrativa | Avisos no README e na interface |
| Patamar +0,50 m e rampas longitudinais | Decisão autoral e ressalva fiscal | Pendência explicitada |
| Paradas sugeridas e trechos sem conteúdo | Roteiro JSON | Confirmação autoral indicada como pendente |

Nomes e estrutura informados pelo autor em 22/10 são atribuídos ao autor nos dados; esta auditoria não dispõe da conversa original para comprovação independente. Espécies, custos, prazos e indicadores socioeconômicos não foram acrescentados pela revisão editorial.

## Aviso de humanização e limites

`index.html` contém “Estudo preliminar · humanização ilustrativa” fora dos painéis recolhíveis. A classe `.study-notice` usa posicionamento fixo. A conferência foi estática; visibilidade, sobreposição de lightbox e legibilidade em dispositivos precisam ser confirmadas no navegador pelo responsável pela publicação.

Continuam pendentes compatibilização do patamar/rampas, acessibilidade completa, drenagem, estrutura, arborização local, áreas permeáveis e operação ferroviária. A publicação deve ser apresentada como demonstração de estudo preliminar, preservando essas ressalvas.

## Identificação dos arquivos revisados

Hashes SHA256 no momento da revisão editorial; alterações posteriores exigem nova comparação:

| Arquivo | SHA256 |
| --- | --- |
| README.md | `b8db3d28b21c6a081f92767c5f08bf4f688759d2db9aa4b2953933d935a3bb9b` |
| src/content.ts | `627f58d36015c9af3d6a004c74ea4efa163f7652f1947cc5d2adb1ec68a9ea63` |
| conceito.html | `f48997493512403fd3ce11ba07ca3c9fcca3e4c45d60bdb9b3c6f0c30dec2356` |
| index.html | `b72223bd61bb3f849f5714cfa52de2ed8eeaab816849cdac9d0ccceab4fcf704` |
| public/data/manifest.json | `f57fe18ba12c48d4582c3d0947d357c15f01fdd4bac276272510004d7f2eb845` |
