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
  /**
   * `false` → as aulas deste educador NÃO entram no cortador (nem as playlists são lidas, nem se
   * pedem cortes). Decisão do dono a 1/11/2026 para o Luis Pinto e o Rodrigo Jasmins.
   */
  cortes?: boolean
  /** Os temas de onde o roteiro escolhe; o gerador evita repetir os dos últimos dias. */
  temas: string[]
  /** As demonstrações «assinatura» já desenhadas para este educador. */
  demos: string[]
  hashtags: string
  /** Só nas linhas da marca (LINHAS_REELS): o que este reel tem de conseguir, dito à IA. */
  objetivo?: string
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
    cortes: false,
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
    cortes: false,
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

/**
 * AS LINHAS DA MARCA (ordem do Ricardo, 17/11/2026): os reels dos educadores deixam o ciclo
 * automático e entram 6 reels por dia com a marca MoreThanMoney:
 *   · um por funil (Educação, Rota Corretora, MTM Funded), cada um com a palavra que leva à página
 *     do funil (/f/educacao, /f/corretora, /f/funded) pelas automações do Instagram;
 *   · dois para ganhar seguidores (valor puro, para guardar e partilhar);
 *   · um de CTA (começar hoje).
 * O slot é a posição nesta lista (1 a 6) e a hora sai de HORAS_MTM.
 * Voltar aos educadores: `site_settings.reels_educadores.modo = "educadores"`.
 */
const SEGUE = '#morethanmoney #educacaofinanceira #trading #literaciafinanceira #investimento'
export const LINHAS_REELS: EducadorReel[] = [
  {
    slug: 'mtm-funil-educacao', nome: 'MoreThanMoney', area: 'Educação MTM',
    foto: `${SITE}/images/apresentacao/app-aulas.jpg`,
    palavra: 'APRENDER', depois: 'e recebes o caminho para começar', publicar: true, cortes: false,
    objetivo: 'Funil Educação: mostrar que aprender trading e finanças com método, aulas organizadas e comunidade é o primeiro passo. Nada de promessas.',
    temas: [
      'o que aprender primeiro no trading', 'aprender sozinho vs com método', 'estudar mercados 15 minutos por dia',
      'conta demo antes de conta real', 'os 3 erros de quem começa', 'literacia financeira que a escola não ensina',
      'ler um gráfico pela primeira vez',
    ],
    demos: [], hashtags: SEGUE,
  },
  {
    slug: 'mtm-funil-corretora', nome: 'MoreThanMoney', area: 'Rota Corretora',
    foto: `${SITE}/videos/stories/corretora-pt-capa.jpg`,
    palavra: 'CORRETORA', depois: 'e recebes o passo a passo', publicar: true, cortes: false,
    objetivo: 'Funil Rota Corretora: o dinheiro fica numa conta EM TEU NOME numa corretora regulada (a MTM recomenda a PU Prime como parceira). A MTM nunca gere o teu dinheiro nem a tua carteira; é só uma recomendação.',
    temas: [
      'o teu dinheiro numa conta em teu nome', 'como ver se uma corretora é regulada', 'nunca entregues o teu dinheiro a ninguém para gerir',
      'spread, comissão e swap explicados', 'abrir conta numa corretora passo a passo', 'da conta demo à conta real',
    ],
    demos: [], hashtags: '#corretora #forex #trading #contapropria #morethanmoney',
  },
  {
    slug: 'mtm-funil-funded', nome: 'MoreThanMoney', area: 'MTM Funded',
    foto: `${SITE}/images/apresentacao/app-webtrader.jpg`,
    palavra: 'FUNDED', depois: 'e recebes como funciona', publicar: true, cortes: false,
    objetivo: 'Funil MTM Funded: desafios em contas SIMULADAS com regras claras (perda diária, perda máxima, consistência); quem cumpre pode receber o Patrocínio de Desempenho MTM para abrir a sua própria conta. NÃO é prop firm, ninguém opera dinheiro de terceiros.',
    temas: [
      'as regras de um desafio em conta simulada', 'porque um desafio treina a disciplina', 'o Patrocínio de Desempenho MTM explicado',
      'porque se chumba num desafio', 'um plano para passar um desafio sem pressa', 'treinar numa conta simulada como se fosse a sério',
    ],
    demos: [], hashtags: '#desafio #trading #disciplina #mtmfunded #morethanmoney',
  },
  {
    slug: 'mtm-seguidores', nome: 'MoreThanMoney', area: 'Dinheiro e mercados',
    foto: `${SITE}/images/apresentacao/app-scanner.jpg`,
    palavra: 'GUIA', depois: 'e segue para não perderes o próximo', publicar: true, cortes: false,
    objetivo: 'Ganhar SEGUIDORES: um reel de valor puro que dá vontade de guardar e enviar a um amigo, com um gancho forte e uma ideia só. Nada de venda.',
    temas: [
      'mitos do trading', 'juros compostos com um exemplo (ilustração)', 'hábitos de dinheiro aos 20 e aos 30',
      'fundo de emergência antes de investir', 'como reconhecer um esquema de dinheiro fácil', 'FOMO e trading de vingança',
      'a checklist antes de qualquer operação', 'inflação e o teu poder de compra', 'o lote certo para o teu risco',
    ],
    demos: [], hashtags: SEGUE,
  },
  {
    slug: 'mtm-cta', nome: 'MoreThanMoney', area: 'Começa hoje',
    foto: `${SITE}/images/apresentacao/app-feed.jpg`,
    palavra: 'COMEÇAR', depois: 'e recebes o link para entrar', publicar: true, cortes: false,
    objetivo: 'CTA directo: convidar a começar hoje (conta gratuita, aulas, app, Premium com experiência de 3 dias sem cartão). Honesto, sem urgência falsa nem promessas.',
    temas: [
      'começa hoje: aulas, app e comunidade', 'experimenta o Premium 3 dias sem cartão', 'três caminhos: aprender, abrir conta ou treinar num desafio',
      'não aprendas sozinho', 'a app MTM no telemóvel',
    ],
    demos: [], hashtags: SEGUE,
  },
]

/**
 * Os 6 slots do dia da marca: linha + hora (UTC; Lisboa = UTC no inverno). O de seguidores sai
 * duas vezes, de manhã e ao fim da tarde.
 */
export const SLOTS_MTM: Array<{ linha: string; hora: string }> = [
  { linha: 'mtm-funil-educacao', hora: '08:30' },
  { linha: 'mtm-seguidores', hora: '10:30' },
  { linha: 'mtm-funil-corretora', hora: '13:30' },
  { linha: 'mtm-seguidores', hora: '17:00' },
  { linha: 'mtm-funil-funded', hora: '19:00' },
  { linha: 'mtm-cta', hora: '21:30' },
]

/** As demonstrações genéricas que qualquer educador pode usar, preenchidas pelo roteiro. */
export const DEMOS_GENERICAS = ['barras', 'contador', 'lista', 'versus'] as const

/** Horas (UTC; Lisboa = UTC no inverno) dos 3 reels animados e do corte da sessão. */
export const HORAS_ANIMADOS = ['08:30', '12:30', '19:00']
export const HORA_CORTE = '21:00'

export function educador(slug: string): EducadorReel | undefined {
  return EDUCADORES.find((e) => e.slug === slug) ?? LINHAS_REELS.find((e) => e.slug === slug)
}
