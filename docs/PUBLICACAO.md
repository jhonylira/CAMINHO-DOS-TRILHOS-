# Registro de preparação para publicação — 22/10/2026

## Escopo

Publicação da pasta experiencia_web no repositório jhonylira/CAMINHO-DOS-TRILHOS-, preservando as alterações locais existentes. Nenhum modelo Blender foi alterado. README, descrição e tópicos organizados; workflow de GitHub Pages adicionado; capturas temporárias e memorando interno excluídos de novos commits por .gitignore.

## Verificações

- Build TypeScript + Vite concluído sem erros em Node 22.14.0 / Windows.
- Ativos públicos: aproximadamente 75,6 MB; maior arquivo: GLB de 45.691.036 bytes.
- Página Conceito: capturas desktop 1600×900 e móvel 390×844 com Edge/Playwright; script reportou zero erros HTTP, de console ou requisição. Hero móvel inspecionado visualmente.
- Explorador: modelo carregado em aproximadamente 5–8 s no servidor local, WebGL ativo, 230 draw calls e 2.498.736 triângulos no quadro inicial com humanização. Essas medições não simulam rede móvel.
- Testes antigos tinham alvos fixos de um roteiro anterior; atualizados para selecionar estação por nome e usar coordenadas do roteiro versionado, preservando as tolerâncias originais.
- Aviso permanente de estudo preliminar/humanização adicionado; medição histórica R06 de 3,43 m qualificada como pendente de reconferência atual.
- Auditoria independente: [VALIDACAO_CONTEUDO.md](VALIDACAO_CONTEUDO.md).

## Limites da verificação

Não foi realizada certificação de desempenho em múltiplos aparelhos físicos. FPS observado não equivale a benchmark médio/p5; não foram concluídos ensaios de rede de 25 Mbps, CPU móvel 4×, estabilidade de memória em 20 ciclos, Firefox/WebKit ou comparação pixel a pixel de todas as câmeras. A aprovação geométrica integral não integra esta publicação. O teste 2D/3D usa tolerância métrica e não comprova erro inferior a 1 px.

## Operação

Publicação automática por .github/workflows/pages.yml ao enviar commits para main. O resultado efetivo deve ser conferido na aba Actions e nos links públicos. Alterações feitas no editor de roteiro ficam somente no navegador até exportar o JSON e versioná-lo em public/data/roteiro.json.

Documentação de referência: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
