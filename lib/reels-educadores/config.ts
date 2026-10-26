/**
 * OS EDUCADORES DOS REELS DIÁRIOS do @morethanmoney.pt.
 *
 * Cada um aparece com a SUA cara e fala da SUA área. A palavra de comentário tem de ser uma que o
 * funil do Instagram já atende (`mtm_automacoes`): uma palavra nova sem automação faz o reel pedir
 * comentários a que ninguém responde.
 *
 * `publicar: false` → o reel é feito e fica na fila como RASCUNHO, à espera do OK do dono. Muda-se
 * aqui ou em `site_settings.reels_educadores.publicar` (o que lá estiver ganha), sem deploy.
 */

export interface EducadorReel {
  slug: string
  nome: string
  area: string
  marca?: string
  /** URL pública da foto a cores (o gancho abre com a cara). */
  foto: string
  palavra: string
  /** O que a palavra entrega, dito no CTA do reel. */
  depois: string
  publicar: boolean
  /** Os temas de onde o roteiro escolhe; o gerador evita repetir os dos últimos dias. */
  temas: string[]
  /** As demonstrações «assinatura» já desenhadas para este educador. */
  demos: string[]
  hashtags: string
}

const SITE = 'https://www.morethanmoney.pt'
export const AVISO =
  'Conteúdo educativo, não constitui consultoria financeira. Trading e cripto envolvem risco de perda; resultados não garantidos.'

export const EDUCADORES: EducadorReel[] = [
  {
    slug: 'ricardo-garcia',
    nome: 'Ricardo Garcia',
    area: 'Forex e metais',
    marca: 'Regressão de tendências e scanners',
    foto: `${SITE}/reels/educadores/fotos/ricardo-garcia.jpg`,
    palavra: 'QUERO',
    depois: 'e recebes o primeiro passo',
    publicar: true,
    temas: [
      'gestão de risco por trade', 'trading em 15 minutos por dia', 'seguir a tendência em vez de adivinhar topos',
      'stop loss antes de entrar', 'o ouro (XAUUSD) e a volatilidade', 'disciplina e diário de trading',
      'porque é que a maioria perde: lote a mais', 'scanners: alertas em vez de olhar para o ecrã o dia todo',
      'sair da armadilha das 40 horas por semana', 'conta demo antes de conta real',
    ],
    demos: ['risco', 'relogio'],
    hashtags: '#trading #forex #ouro #gestaoderisco #educacaofinanceira #morethanmoney',
  },
  {
    slug: 'maria-costa',
    nome: 'Maria Costa',
    area: 'Faceless Marketing',
    marca: 'She Is Faceless',
    foto: `${SITE}/reels/educadores/fotos/maria-costa.jpg`,
    palavra: 'FACELESS',
    depois: 'e recebes o link por mensagem',
    publicar: true,
    temas: [
      'criar conteúdo sem mostrar a cara', 'She Is Studio: design com IA a partir de um PDF',
      'She Is Daily: o planner de 30 dias', 'consistência vale mais do que perfeição',
      'transformar um conhecimento num produto digital', 'nichos faceless que vendem',
      'um post por dia em 10 minutos', 'vender pelas DMs sem parecer insistente',
    ],
    demos: ['faceless', 'studio', 'daily'],
    hashtags: '#facelessmarketing #marketingdigital #empreendedorismo #sheis #morethanmoney',
  },
  {
    slug: 'ruben-pereira',
    nome: 'Ruben Pereira',
    area: 'Criptomoedas',
    marca: 'DCA · Império Cripto · Live Trading Cripto',
    foto: `${SITE}/reels/educadores/fotos/ruben-pereira.jpg`,
    palavra: 'CRIPTO',
    depois: 'e recebes o acesso às salas',
    publicar: true,
    temas: [
      'DCA: comprar todos os meses', 'alavancagem e liquidação', 'carteira fria vs exchange',
      'ciclos do bitcoin sem promessas', 'o erro de comprar no topo por FOMO', 'perpétuos explicados simples',
      'quanto da carteira pôr em cripto', 'stop e gestão de risco em cripto',
    ],
    demos: ['dca', 'alavancagem'],
    hashtags: '#cripto #bitcoin #dca #criptomoedas #educacaofinanceira #morethanmoney',
  },
  {
    slug: 'rodrigo-jasmins',
    nome: 'Rodrigo Jasmins',
    area: 'Forex e Análise Técnica',
    foto: 'https://iwscxotvmtkphajmasof.supabase.co/storage/v1/object/public/lms-assets/educators/59127909-670a-4222-93ca-31d7faa3d83c/1792434878512-b4a06a9d.jpg',
    palavra: 'QUERO',
    depois: 'e recebes o primeiro passo',
    publicar: false,
    temas: [
      'suportes e resistências', 'ler velas japonesas', 'timeframes: de cima para baixo',
      'o plano de trading antes do gráfico', 'erros do principiante no forex', 'risco-retorno 1:2',
    ],
    demos: ['risco'],
    hashtags: '#forex #analisetecnica #trading #educacaofinanceira #morethanmoney',
  },
  {
    slug: 'luis-pinto',
    nome: 'Luis Pinto',
    area: 'IA e Literacia Financeira',
    foto: 'https://iwscxotvmtkphajmasof.supabase.co/storage/v1/object/public/lms-assets/educators/6972009a-e07c-4367-b2f9-526dcdf57ab1/1792526820168-7ad76893.png',
    palavra: 'QUERO',
    depois: 'e recebes o primeiro passo',
    publicar: false,
    temas: [
      'usar IA para organizar as finanças', 'juros compostos explicados', 'fundo de emergência',
      'orçamento 50/30/20', 'IA no trabalho: ganhar horas por semana', 'inflação e poder de compra',
    ],
    demos: [],
    hashtags: '#inteligenciaartificial #literaciafinanceira #financaspessoais #morethanmoney',
  },
]

/** As demonstrações genéricas que qualquer educador pode usar, preenchidas pelo roteiro. */
export const DEMOS_GENERICAS = ['barras', 'contador', 'lista', 'versus'] as const

/** Horas (UTC; Lisboa = UTC no inverno) dos 3 reels animados e do corte da sessão. */
export const HORAS_ANIMADOS = ['08:30', '12:30', '19:00']
export const HORA_CORTE = '21:00'

export function educador(slug: string): EducadorReel | undefined {
  return EDUCADORES.find((e) => e.slug === slug)
}
