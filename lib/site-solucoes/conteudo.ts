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
  /** Captura real do projecto. */
  img?: string
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
    url: 'https://plurinstal.vercel.app',
    img: '/images/solucoes/caso-plurinstal.jpg',
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
    img: '/images/solucoes/caso-liliana.jpg',
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
    // Screenshot real do protótipo com o nome e o emblema desfocados (o caso aqui é anónimo).
    img: '/images/solucoes/caso-clube.jpg',
  },
]

export const FAQ: { p: string; r: string }[] = [
  { p: 'Preciso de perceber de tecnologia?', r: 'Não. Fazemos o diagnóstico contigo, construímos e entregamos a funcionar. Tu usas.' },
  { p: 'Fico preso a subscrições?', r: 'Não. Construímos sobre o nosso próprio sistema. O alojamento pode ficar do nosso lado ou do teu, pelo mesmo preço.' },
  { p: 'Quanto tempo demora?', r: 'Depende do projecto. A página com app é o mais rápido. Damos o prazo depois do diagnóstico.' },
  { p: 'Trabalham fora de Portugal?', r: 'Sim. Trabalhamos em português e em inglês.' },
  { p: 'Prometem resultados no trading?', r: 'Não. O que fazemos no trading é educação e ferramentas. Resultados passados não garantem resultados futuros.' },
]

/**
 * Próximos projectos: trabalhos reais em proposta ou em construção, sem nome do cliente até ele
 * autorizar. Nunca inventar projectos que não estejam em cima da mesa.
 */
export interface Proximo {
  setor: string
  desafio: string
  vamosConstruir: string[]
  estado: 'Em proposta' | 'Em construção' | 'Em estudo'
}

export const PROXIMOS: Proximo[] = [
  {
    setor: 'Cinema regional',
    desafio: 'Sessões, estreias e bilhetes anunciados à mão em várias redes.',
    vamosConstruir: ['Site com sessões sempre actualizadas', 'Avisos de estreias para quem segue', 'Agente que responde a horários e preços'],
    estado: 'Em proposta',
  },
  {
    setor: 'Empresa de trading',
    desafio: 'Equipa e clientes a pedir ferramentas com a marca da casa.',
    vamosConstruir: ['App e cópia automática em white label', 'Scanners em licença', 'Mentor de IA para a comunidade'],
    estado: 'Em construção',
  },
  {
    setor: 'Marca de artesanato',
    desafio: 'Peças vendidas por mensagem, sem catálogo nem encomendas organizadas.',
    vamosConstruir: ['Loja online com catálogo', 'Encomendas e pagamentos num só sítio', 'Lista de lojas parceiras para prospeção'],
    estado: 'Em estudo',
  },
  {
    setor: 'Comércio local',
    desafio: 'Negócios que só têm uma página de links e respondem a tudo à mão.',
    vamosConstruir: ['Página com domínio próprio', 'App para os clientes', 'Respostas automáticas e marcações'],
    estado: 'Em proposta',
  },
]

/** O menu de trabalhos: o que a MTM vende, agrupado. Preço só onde está decidido. */
export interface Trabalho {
  grupo: 'Presença' | 'Atendimento e vendas' | 'Operação' | 'Conteúdo' | 'Trading'
  nome: string
  inclui: string[]
  preco: string
  destaque?: boolean
}

export const MENU: Trabalho[] = [
  { grupo: 'Presença', nome: 'Página + app', inclui: ['Página com domínio próprio', 'App para os teus clientes', 'Alojamento e base de dados incluídos'], preco: '125 a 150 € + 50 €/ano', destaque: true },
  { grupo: 'Presença', nome: 'Simulador ou orçamento no site', inclui: ['O cliente monta o pedido e vê o preço', 'Pedido entra na hora na tua equipa', 'Estimativa em PDF ou email'], preco: 'Sob proposta' },
  { grupo: 'Presença', nome: 'Loja online', inclui: ['Catálogo e encomendas', 'Pagamentos e avisos de envio', 'Stock ligado às vendas'], preco: 'Sob proposta' },
  { grupo: 'Atendimento e vendas', nome: 'Agente de IA', inclui: ['WhatsApp, Instagram e site', 'Treinado no teu negócio', 'Passa-te só o que precisa de ti'], preco: 'Sob proposta', destaque: true },
  { grupo: 'Atendimento e vendas', nome: 'Agenda com lembretes', inclui: ['Marcação online', 'Lembretes e reagendamento', 'Lista de espera'], preco: 'Sob proposta' },
  { grupo: 'Atendimento e vendas', nome: 'Seguimento e CRM', inclui: ['Qualificação de contactos', 'Seguimento automático', 'Estado de cada cliente'], preco: 'Sob proposta' },
  { grupo: 'Operação', nome: 'Faturas e contabilidade', inclui: ['Lembretes de pagamento', 'Faturas do email arrumadas', 'Pasta mensal para o contabilista'], preco: 'Sob proposta' },
  { grupo: 'Operação', nome: 'App da equipa', inclui: ['Escalas e trocas', 'Relatórios de serviço com fotos', 'Alertas de stock'], preco: 'Sob proposta' },
  { grupo: 'Operação', nome: 'Relatórios automáticos', inclui: ['Números da semana no email', 'Leitura de documentos com IA', 'Fim das folhas copiadas à mão'], preco: 'Sob proposta' },
  { grupo: 'Conteúdo', nome: 'Cursos narrados', inclui: ['Do guião ao vídeo', 'Voz e legendas noutras línguas', 'Área de membros'], preco: 'Sob proposta' },
  { grupo: 'Conteúdo', nome: 'Mentor de IA', inclui: ['Treinado no teu método', 'Responde à tua comunidade', 'Não se copia como um curso'], preco: 'Sob proposta' },
  { grupo: 'Conteúdo', nome: 'Redes em piloto automático', inclui: ['Calendário de publicações', 'Respostas a comentários', 'Pedido de avaliações'], preco: 'Sob proposta' },
  { grupo: 'Trading', nome: 'Scanners em licença', inclui: ['Pack de 4 scanners', 'Licença semestral', 'Estratégias próprias à parte'], preco: 'Sob proposta' },
  { grupo: 'Trading', nome: 'White label', inclui: ['MTM Auto com a tua marca', 'App MTM System', 'Sistema MTM completo'], preco: 'Sob proposta' },
]
