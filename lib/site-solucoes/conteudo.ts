/**
 * O conteúdo do site de apresentação (/solucoes), num só sítio para se rever sem abrir o JSX.
 *
 * REGRAS (Ricardo, 16/11/2026, e docs/mtm-sales-brain.md):
 * - Nenhum número de desempenho nem resultado inventado. Um caso só aparece com dados reais e com
 *   autorização escrita do cliente (`autorizado: true`). Sem casos publicados, a secção diz-o.
 * - Nomes de produtos não se traduzem.
 * - Nunca prometer retornos. Trading é educativo.
 */

export interface Perfil {
  id: string
  titulo: string
  dor: string
  solucao: string
  entregas: string[]
}

export const PERFIS: Perfil[] = [
  {
    id: 'negocios',
    titulo: 'Pequenos negócios',
    dor: 'Respondes a mensagens à noite, marcas à mão e não sabes de onde vêm os clientes.',
    solucao: 'Página com domínio próprio, app para os teus clientes e um agente que responde e marca por ti.',
    entregas: ['Landing page com domínio próprio', 'App para os teus clientes (horários, marcações, avisos)', 'Agente de IA que responde e qualifica', 'Agenda própria, sem subscrições'],
  },
  {
    id: 'trading',
    titulo: 'Empresas de trading',
    dor: 'A tua equipa precisa de ferramentas, sinais organizados e uma app com a tua marca.',
    solucao: 'Scanners licenciados, cópia automática e o sistema MTM em white label.',
    entregas: ['Pack de 4 scanners em licença semestral', 'MTM Auto e app MTM System em white label', 'Estratégias próprias desenvolvidas à medida'],
  },
  {
    id: 'traders',
    titulo: 'Traders e comunidades',
    dor: 'Tens uma comunidade no Telegram ou no YouTube e respondes às mesmas perguntas todos os dias.',
    solucao: 'Um mentor de IA treinado na tua estratégia e na tua comunidade. Isso não se copia.',
    entregas: ['Mentor IA da tua estratégia', 'Plataforma, contas e educação', 'Alertas e execução ligados à tua comunidade'],
  },
  {
    id: 'educadores',
    titulo: 'Educadores e infoprodutores',
    dor: 'Gravar e regravar aulas come-te semanas.',
    solucao: 'Cursos narrados com voz, prontos a publicar, e acesso à rede de clientes MTM.',
    entregas: ['Cursos narrados com voz', 'Legendas noutras línguas', 'Montra na rede MTM'],
  },
  {
    id: 'pessoas',
    titulo: 'Quem quer aprender',
    dor: 'Queres perceber de dinheiro e mercados sem promessas nem gurus.',
    solucao: 'Educação financeira com método, ferramentas e uma comunidade que mostra o que faz.',
    entregas: ['Aulas e comunidade MTM', 'Scanners e alertas', 'Contas simuladas no MTM Funded'],
  },
]

export interface Demo {
  img: string
  titulo: string
  texto: string
}

/** Capturas reais do sistema que a própria MTM usa todos os dias. */
export const DEMOS: Demo[] = [
  { img: '/images/apresentacao/app-chat.jpg', titulo: 'Comunidade e apoio', texto: 'Chat da app com a comunidade e respostas automáticas.' },
  { img: '/images/apresentacao/app-aulas.jpg', titulo: 'Aulas na app', texto: 'Cursos organizados por módulos, no telemóvel.' },
  { img: '/images/apresentacao/app-alertas.jpg', titulo: 'Alertas', texto: 'Avisos que chegam ao telemóvel no momento certo.' },
  { img: '/images/apresentacao/app-scanner.jpg', titulo: 'Scanners', texto: 'Ferramentas de análise ligadas ao TradingView.' },
  { img: '/images/apresentacao/app-webtrader.jpg', titulo: 'WebTrader', texto: 'Plataforma própria de contas simuladas.' },
  { img: '/images/apresentacao/app-feed.jpg', titulo: 'Feed', texto: 'Novidades e conteúdo num só sítio.' },
]

export interface Oferta {
  nome: string
  para: string
  preco: string
  detalhe: string
}

export const OFERTAS: Oferta[] = [
  { nome: 'Página + app', para: 'Pequenos negócios', preco: '125 a 150 € + 50 €/ano', detalhe: 'Criação da página com domínio próprio e da app. O valor anual cobre alojamento e base de dados.' },
  { nome: 'Agente de IA', para: 'Negócios e comunidades', preco: 'Sob proposta', detalhe: 'Responde, qualifica e marca. Começa por um diagnóstico.' },
  { nome: 'Scanners em licença', para: 'Empresas de trading', preco: 'Sob proposta', detalhe: 'Pack de 4 scanners em licença semestral. Estratégias próprias orçadas à parte.' },
  { nome: 'White label', para: 'Empresas de trading', preco: 'Sob proposta', detalhe: 'MTM Auto, app MTM System e o sistema MTM com a tua marca.' },
  { nome: 'Cursos narrados', para: 'Educadores', preco: 'Sob proposta', detalhe: 'Do guião ao vídeo narrado, com legendas.' },
]

export interface Caso {
  cliente: string
  setor: string
  problema: string
  /** O que construímos, em factos. */
  feito: string[]
  /** Em que ponto está. Sem números de resultado até o cliente os medir e autorizar. */
  estado: 'Entregue' | 'Em curso' | 'Protótipo apresentado'
  /** Publicação autorizada pelo Ricardo (16/11/2026). Anónimo = sem nome do cliente. */
  autorizado: boolean
  anonimo?: boolean
  url?: string
}

/**
 * Projectos reais. Nomes publicados por indicação do Ricardo (16/11/2026); a autorização escrita
 * de cada cliente fica com ele (DL 57/2008). Projectos anónimos: reais, sem nome do cliente.
 * Nada de números de resultado até o cliente os ter medidos.
 */
export const CASOS: Caso[] = [
  {
    cliente: 'Plurinstal',
    setor: 'Climatização e energia solar · Leiria',
    problema: 'Orçamentos que levavam semanas, e cada cliente a perguntar o mesmo antes de decidir.',
    feito: [
      'Site novo com simulador da casa em planta 2D e vista 3D, com preço na hora',
      'Simulador de painéis solares e de poupança, com os pressupostos à vista',
      'Diagnóstico com fotos e área de cliente com faturas e certificados',
      'Back-office para a equipa receber cada pedido no momento',
    ],
    estado: 'Entregue',
    autorizado: true,
  },
  {
    cliente: 'Liliana Faria',
    setor: 'Venda directa e artesanato · Alpiarça',
    problema: 'Equipa, encomendas, conteúdos e contactos espalhados pelo telemóvel e por grupos.',
    feito: [
      'Site com domínio próprio e app da equipa',
      'Painel com encomendas, contactos, equipa e catálogo de produtos',
      'Estúdio de vídeos, textos e flyers com QR gerados com IA',
      'Lista de lojas para prospeção recolhida automaticamente',
    ],
    estado: 'Entregue',
    autorizado: true,
    url: 'https://www.lilianafaria.pt',
  },
  {
    cliente: 'Next Evolution',
    setor: 'Ginásios',
    problema: 'Sócios, horários e renovações geridos à mão, em cada ginásio.',
    feito: ['Diagnóstico das tarefas repetidas da receção', 'App do sócio com horários e reservas', 'Agente que responde a preços e horários'],
    estado: 'Em curso',
    autorizado: true,
  },
  {
    cliente: 'Clube desportivo',
    setor: 'Associação desportiva',
    problema: 'Quotas cobradas à porta e avisos espalhados por vários grupos.',
    feito: ['Site do clube', 'App do sócio com quotas, avisos e eventos', 'Vídeo de apresentação narrado com voz de IA'],
    estado: 'Protótipo apresentado',
    autorizado: true,
    anonimo: true,
  },
]

export const FAQ: { p: string; r: string }[] = [
  { p: 'Preciso de perceber de tecnologia?', r: 'Não. Fazemos o diagnóstico contigo, construímos e entregamos a funcionar. Tu usas.' },
  { p: 'Fico preso a subscrições?', r: 'Não. Construímos sobre o nosso próprio sistema. O alojamento pode ficar do nosso lado ou do teu, pelo mesmo preço.' },
  { p: 'Quanto tempo demora?', r: 'Depende do projecto. A página com app é o mais rápido. Damos o prazo depois do diagnóstico.' },
  { p: 'Trabalham fora de Portugal?', r: 'Sim. Trabalhamos em português e em inglês.' },
  { p: 'Prometem resultados no trading?', r: 'Não. O que fazemos no trading é educação e ferramentas. Resultados passados não garantem resultados futuros.' },
]
