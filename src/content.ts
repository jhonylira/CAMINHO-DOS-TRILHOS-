/**
 * Conteudo institucional da apresentacao.
 * REGRA: somente informacoes registradas nos arquivos do projeto (fontes citadas em cada cena).
 * Coordenadas no referencial local Blender/CAD (x = Leste, y = Norte, z = cota), em metros.
 * Camera "autor:" = enquadramento derivado de camera original preservada no R07.
 */
export type V3 = [number, number, number];
export interface Scene {
  id: string;
  kicker: string;
  title: string;
  html: string;
  chips?: [string, 'ok' | 'ep' | 'pend'][];
  sources: string[];
  cam: { pos: V3; target: V3 };
  hotspot?: { label: string; at: V3 };
}

export const SCENES: Scene[] = [
  {
    id: 'intro', kicker: 'Visão geral', title: 'Caminho dos Trilhos',
    html: `<p>Requalificação urbana e paisagística do corredor ferroviário público de Guaramirim/SC, da antiga estação ferroviária ao trecho oeste.</p>
      <p>Esta experiência mostra o <b>modelo 3D do estudo preliminar (R07)</b> em tempo real, na mesma geometria e nas mesmas coordenadas da implantação CAD.</p>`,
    chips: [['Implantação CAD preservada', 'ok'], ['Estudo preliminar', 'ep']],
    sources: ['modelo_integral/FLUXO_HIBRIDO_IA.md', 'estudo_ep_r00d/CAMINHO_DOS_TRILHOS_EP_R00d_R07.blend'],
    cam: { pos: [-170, -590, 400], target: [-250, -40, 0] },
  },
  {
    id: 'contexto', kicker: 'Cena 1 · Contexto urbano', title: 'Área de intervenção',
    html: `<p>O corredor acompanha o eixo ferroviário existente, que é <b>preservado</b>, por cerca de 1,2 km. O entorno aparece como volumetria simplificada, derivada das células cadastrais.</p>
      <p>Compare com a <b>ortofoto de 5 cm</b> no modo Implantação 2D → Comparar.</p>`,
    chips: [['Eixo ferroviário preservado', 'ok'], ['Entorno volumétrico ilustrativo', 'ep']],
    sources: ['modelo_integral/LEIA_ME.md (entorno: volumes representativos, alturas estimadas)', 'TRILHO (GSD 5 cm MDS).tif — SIRGAS 2000 / UTM 22S'],
    cam: { pos: [-320, -1250, 980], target: [-320, -90, 0] },
  },
  {
    id: 'corredor', kicker: 'Cena 2 · Organização geral', title: 'Corredor verde ao longo dos trilhos',
    html: `<p>Faixa ferroviária gramada, passeios em concreto fulget cinza-claro, faixa especial em cimentício vermelho e arborização em canteiros e grelhas.</p>
      <ul><li>Níveis do estudo: via 0,00 · passeio +0,15 m · canteiros −0,05 m.</li>
      <li>Faixa livre de vegetação de <b>3 m para cada lado</b> do eixo ferroviário. A copa inteira fica fora da faixa (decisão do autor, 15/10/2026).</li></ul>`,
    chips: [['Faixa livre 3 m conferida (copa mín. 3,43 m)', 'ok']],
    sources: ['AGENTS.md — arborização / faixa livre', 'estudo_ep_r00d/FISCAL_R06.md (distância mínima de copa 3,4318 m)', 'modelo_integral/LEIA_ME.md (níveis)'],
    cam: { pos: [-382, -112, 45], target: [-345.2, -56.8, 0.2] }, // autor: EP_05_CENTRAL_OBLIQUA
    hotspot: { label: 'Corredor central', at: [-480, -150, 2] },
  },
  {
    id: 'estacao', kicker: 'Cena 3 · Patrimônio ferroviário', title: 'Estação ferroviária histórica',
    html: `<p>A estação histórica é <b>preservada na implantação</b>. Nas duas extremidades ficam <b>anexos envidraçados</b> com cobertura em duas águas, perfis metálicos escuros delgados e base baixa de tijolinho aparente.</p>
      <p>Os anexos abrigam <b>cafés e bistrô</b>. A linguagem de estufa orienta só o fechamento, não o programa.</p>`,
    chips: [['Implantação da estação preservada', 'ok'], ['Altura da base de tijolo: hipótese EP', 'ep'], ['Patamar +0,50 m e rampas: pendente', 'pend']],
    sources: ['AGENTS.md — revisões autorais de 19 e 20/10/2026', 'estudo_ep_r00d/FISCAL_R06.md — ressalvas mantidas', 'modelo_integral/LEIA_ME.md (alturas e fachada estimadas por fotografias)'],
    cam: { pos: [58, 18, 30], target: [108, 65, 2] },
    hotspot: { label: 'Estação e cafés', at: [108, 65.5, 9] },
  },
  {
    id: 'mobilidade', kicker: 'Cena 4 · Circulação e estacionamento', title: 'Floreiras chanfradas no estacionamento',
    html: `<p>As novas floreiras do estacionamento têm laterais <b>chanfradas em planta</b>, afunilando a frente voltada à via para favorecer o balizamento e a manobra.</p>
      <p>Troncos e vagas seguem a posição CAD. As dimensões não cotadas são hipóteses de estudo preliminar.</p>`,
    chips: [['Troncos CAD preservados', 'ok'], ['Dimensões não cotadas: hipótese EP', 'ep']],
    sources: ['AGENTS.md — novas floreiras no estacionamento (21/10/2026)', 'estudo_ep_r00d/modelar_R07.py (vista 14_NOVAS_FLOREIRAS)'],
    cam: { pos: [-20, -8, 38], target: [-37, 38, 0] },
    hotspot: { label: 'Estacionamento', at: [-37, 38, 3] },
  },
  {
    id: 'caminhar', kicker: 'Cena 5 · Caminhabilidade', title: 'Percurso de pedestres e ciclistas',
    html: `<p>Vista na altura do pedestre, no trecho oeste. As árvores em calçada ficam em <b>grelhas metálicas circulares</b> niveladas ao passeio, todas no mesmo módulo: Ø 1,04 m, com colo de Ø 0,60 m.</p>
      <p>As luminárias têm poste metálico escuro quadrado de 120 × 120 mm, com <b>dois braços opostos, a 3 m e a 5 m</b>.</p>
      <p class="muted">Faixas especiais: uso a confirmar. Não equivalem automaticamente à ciclovia.</p>`,
    chips: [['Módulo único de grelha', 'ok'], ['Extensão dos braços: hipótese EP', 'ep']],
    sources: ['AGENTS.md — revisões de 20/10/2026 (grelhas e luminárias)', 'estudo_ep_r00d/FISCAL_R06.md', 'pranchas_intervencoes/R05/MEMORIAL_QUANTITATIVOS_R05.md'],
    cam: { pos: [-709.15, -151.55, 2.25], target: [-681.25, -140.75, 1.65] }, // autor: EP_04_OESTE_PEDESTRE
    hotspot: { label: 'Trecho oeste', at: [-700, -150, 2] },
  },
  {
    id: 'convivencia', kicker: 'Cena 6 · Convivência e paisagismo', title: 'Praça da estação: permanência',
    html: `<p>Floreiras orgânicas com mureta de 30 cm (topo +0,45 m). Em segmentos selecionados, recebem <b>bancos integrados</b>: base de concreto, assento de madeira ripada e encosto onde há espaço.</p>
      <p>Piso de permanência em fulget terroso e quiosques panorâmicos completam a praça junto à estação.</p>`,
    chips: [['Contorno externo dos canteiros preservado', 'ok'], ['Dimensões de conforto: hipótese EP', 'ep']],
    sources: ['AGENTS.md — complementações de 19 e 21/10/2026', 'estudo_ep_r00d/FISCAL_R06.md (muretas R06, bancos R05)'],
    cam: { pos: [79, 57, 1.85], target: [99.75, 70.75, 0.85] }, // autor: R10_VARIANTE_CAFE_APROXIMACAO
    hotspot: { label: 'Praça e bancos', at: [72, 52, 3] },
  },
  {
    id: 'consolidado', kicker: 'Cena 7 · Visão consolidada', title: 'Conjunto das intervenções',
    html: `<p>Estação, praça, corredor verde, passeios, iluminação e arborização formam um percurso público contínuo ao longo dos trilhos.</p>
      <p class="muted">Estudo preliminar. Acessibilidade completa, drenagem, operação ferroviária e arborização local ainda exigem validação técnica posterior.</p>`,
    chips: [['Estudo preliminar', 'ep'], ['Validações executivas pendentes', 'pend']],
    sources: ['estudo_ep_r00d/FISCAL_R06.md — ressalvas mantidas', 'modelo_integral/LEIA_ME.md'],
    cam: { pos: [430, 300, 420], target: [-180, -40, 0] },
  },
];

export const LAYER_COLORS: Record<string, string> = {
  viario: '#4b4b4b', passeios: '#cfcac0', canteiros: '#8fae6f', ciclovia: '#b8574a', ferrovia: '#7b6a58',
  floreiras: '#e6e2d8', mobiliario: '#9c6b3f', iluminacao: '#2d2d2d', quiosques: '#a8b59a', conceitual: '#9a5a32',
  cafes: '#9fc6d8', estacao: '#c27a4e', vegetacao: '#4f7d3a', entorno: '#e8e6e2', outros: '#aaa',
};
export const LAYER_LABELS: Record<string, string> = {
  viario: 'Sistema viário e sinalização', passeios: 'Passeios, praças e guias', canteiros: 'Canteiros e vegetação baixa',
  ciclovia: 'Faixas especiais (uso a confirmar)', ferrovia: 'Patrimônio ferroviário: trilhos', floreiras: 'Floreiras, muretas e grelhas',
  mobiliario: 'Mobiliário urbano', iluminacao: 'Iluminação pública', quiosques: 'Quiosques panorâmicos', conceitual: 'Elementos conceituais (R10)',
  cafes: 'Anexos de vidro: cafés e bistrô', estacao: 'Estação ferroviária histórica', vegetacao: 'Arborização (proxies CAD)',
  entorno: 'Entorno volumétrico simplificado', outros: 'Outros elementos',
};
