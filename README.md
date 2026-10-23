# Caminho dos Trilhos

Experiência web interativa do estudo preliminar de requalificação urbana e paisagística do corredor ferroviário de **Guaramirim, Santa Catarina**. Reúne exploração 3D, implantação 2D, comparação com ortofoto e apresentação do conceito.

**[Abrir experiência 2D + 3D](https://jhonylira.github.io/CAMINHO-DOS-TRILHOS-/)** · **[Abrir página Conceito](https://jhonylira.github.io/CAMINHO-DOS-TRILHOS-/conceito.html)**

> Estudo preliminar em desenvolvimento. Pessoas, veículos, vegetação humanizada, materiais e iluminação são ilustrativos. A publicação não constitui aprovação executiva ou certificação de acessibilidade, estruturas, drenagem ou operação ferroviária.

## O que explorar

| Recurso | Descrição |
| --- | --- |
| Masterplan 3D | Órbita, aproximação e camadas temáticas |
| Implantação 2D | Planta e comparação existente × proposta com ortofoto |
| Caminhada | Navegação em primeira pessoa |
| Apresentação | Roteiro de paradas, textos, vistas e galeria |
| Página Conceito | Narrativa do projeto, imagens e informações do estudo |
| Ajustes | Perfis de qualidade, humanização, iluminação e tela cheia |

Na caminhada, use **WASD**, mouse, **Shift** para correr e **Esc** para liberar o cursor. Em celulares, prefira o perfil **Leve**. O desempenho depende do aparelho e da conexão; a página Conceito oferece apresentação sem navegação 3D.

## Executar localmente

Requisitos: **Node.js 22.14 ou superior compatível**, npm e navegador com WebGL. Blender não é necessário para executar os ativos já exportados.

```bash
git clone https://github.com/jhonylira/CAMINHO-DOS-TRILHOS-.git
cd CAMINHO-DOS-TRILHOS-
npm ci
npm run dev
```

Abra o endereço informado pelo Vite, normalmente `http://localhost:5173/`. Para conferir a produção:

```bash
npm run build
npm run preview
```

O build gera `dist/`. O preview usa normalmente `http://localhost:4173/`; a página Conceito está em `/conceito.html`. Não abra o HTML diretamente por `file://`: o modelo requer um servidor HTTP.

## Publicação e atualizações

O [workflow de publicação](.github/workflows/pages.yml) executa `npm ci`, valida TypeScript, gera o build e publica `dist/` a cada envio para `main`. Também pode ser iniciado manualmente pela [aba Actions](https://github.com/jhonylira/CAMINHO-DOS-TRILHOS-/actions).

Na configuração inicial, selecione **Settings → Pages → Build and deployment → GitHub Actions**. O site fica disponível após a primeira execução bem-sucedida.

Para atualizar, revise os arquivos e execute:

```bash
npm run build
git status
git add <arquivos-revisados>
git commit -m "Descreva a atualização"
git push origin main
```

Os ativos de `public/` devem acompanhar o código. Não envie `node_modules/`, `dist/`, credenciais ou capturas temporárias. A configuração `base: './'` permite servir os recursos na subpasta do GitHub Pages.

## Organização

```text
index.html            Explorador 2D + 3D
conceito.html         Página de apresentação
src/                  Aplicação TypeScript, estilos e conteúdo
src/conceito/         Comportamento e estilos da página Conceito
public/models/        Modelo GLB
public/data/          Manifesto, câmeras, roteiro, eixo e galeria
public/plan/          Planta e calibração
public/renders/       Imagens de referência do modelo
public/conceito/      Imagens da página Conceito
public/textures/      Texturas e atribuições
pipeline/             Preparação dos ativos
tests/               Verificações em navegador
.github/workflows/    Build e publicação
```

Tecnologias: **Three.js, TypeScript, Vite, GSAP, three-mesh-bvh e Playwright**. As versões reproduzíveis estão em `package-lock.json`.

## Fonte e rastreabilidade

O [manifesto](public/data/manifest.json) identifica `CAMINHO_DOS_TRILHOS_EP_R00d_R08.blend`, seu SHA256 (`be0d71785e7e643651850561a404699ff492878ca4f99760ec1d2adc9b604263`) e a exportação de 23/10/2026. Essa identificação não implica aprovação executiva.

Segundo o manifesto: **12.931 objetos de origem**, **56 nós GLB** e **713.972 triângulos**. O GLB ocupa **40.227.292 bytes (aproximadamente 40 MB)**; o primeiro acesso pode demorar em redes lentas. Esses números descrevem o ativo, não a cena completa com humanização.

Conversão: `three(x, y, z) = blender(x, z, -y)`. Origem local: **E 700080 / N 7070350**, em metros. Os scripts do pipeline dependem de arquivos autorais e ferramentas locais externos ao repositório; não são executados na publicação. Não regenere ativos de versões anteriores sem conferir as decisões autorais e a vegetação arquivada.

## Limitações

- Patamar da estação a +0,50 m e rampas longitudinais estão modelados na R08 em nível de estudo preliminar (EP), sem certificação executiva de acessibilidade.
- Copa mínima de 3,43 m é medição histórica do parecer R06; a exportação atual exige reconferência independente. A regra autoral é manter toda a copa fora da faixa de 3 m de cada lado do eixo.
- Paradas marcadas como sugeridas no roteiro aguardam confirmação do autor.
- Espécies e dimensões construtivas não confirmadas permanecem hipóteses EP; entorno e humanização são ilustrativos.
- A data do voo da ortofoto não está informada na documentação consultada.
- Compatibilidade e desempenho em todos os aparelhos não são garantidos. Veja o [registro de publicação](docs/PUBLICACAO.md).

## Testes

Com o servidor aberto, execute o teste existente com Playwright e Microsoft Edge:

```bash
npm run testar -- http://localhost:4173/
```

O teste verifica carregamento, WebGL, apresentação, sincronização 2D/3D, caminhada e tamanhos de tela. Os resultados ficam em `tests/capturas/`. Alterações no roteiro podem exigir atualização dos alvos de teste; verificações de interface não substituem aprovação geométrica.

## Créditos e uso

Projeto Caminho dos Trilhos, Guaramirim/SC. Fontes técnicas constam nos dados e legendas. As atribuições das texturas estão no [manifesto de texturas](public/textures/manifest.json). Dependências mantêm suas próprias licenças.

Este repositório não concede licença geral de reutilização do projeto urbanístico, modelo, ortofoto ou imagens autorais. Consulte o responsável antes de reutilizá-los.
