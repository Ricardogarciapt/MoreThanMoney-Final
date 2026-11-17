/**
 * Showroom de demos (morethanmoney.pt/demos).
 *
 * Resumo do que está no Monorepo (repo à parte): kits/catalogo.json (um kit por solução) e
 * kits/exemplos + kits/temas (um negócio FICTÍCIO por sector, com o tema de cores do sector).
 * Os negócios daqui são inventados para mostrar o kit com uma marca: nunca são clientes
 * (DL 57/2008). A página diz isso em cada cartão.
 *
 * Campos `marca`, `cor*` e `kit` não se traduzem (ver NAO_TEXTO em i18n/textos.ts).
 */

/** Estado interno do kit no Monorepo. NÃO se mostra ao público (ordem do Ricardo 17/11: entregamos todos). */
export type EstadoKit = 'pronto' | 'a-montar' | 'por-fazer'

export interface KitShowroom {
  kit: string
  solucao: string
  /** O que o negócio ganha, numa frase. */
  promessa: string
  estado: EstadoKit
  /** O que o negócio nos manda para o kit ficar com a marca dele. */
  ficha: string[]
  /** slug da demo diária que mostra esta solução, se houver. */
  demo: string | null
}

export const KITS: KitShowroom[] = [
  { kit: 'pagina-app', promessa: 'Uma página com a tua marca que se instala como app, com serviços, preços e contacto.', solucao: 'Página + app', estado: 'pronto', demo: 'linktree-para-app', ficha: ['nome', 'serviços e preços', 'horário', 'WhatsApp', 'morada', 'logótipo', 'cores'] },
  { kit: 'agenda-lembretes', promessa: 'Marcações pelo WhatsApp com as horas livres e lembretes automáticos.', solucao: 'Agenda com lembretes', estado: 'pronto', demo: 'marcacoes-whatsapp', ficha: ['serviços e durações', 'horário', 'equipa', 'número WhatsApp Business'] },
  { kit: 'scanners', promessa: 'Os scanners da casa na tua conta TradingView, com licença e suporte.', solucao: 'Scanners em licença', estado: 'pronto', demo: 'mentor-ia-comunidade', ficha: ['contas TradingView'] },
  { kit: 'agente-ia', promessa: 'Um assistente que responde aos clientes a qualquer hora e passa-te o que importa.', solucao: 'Agente de IA', estado: 'pronto', demo: 'marcacoes-whatsapp', ficha: ['perguntas frequentes', 'preços', 'o que passa para o dono', 'canais'] },
  { kit: 'orcamento', promessa: 'O cliente responde a umas perguntas e recebe o orçamento em PDF na hora.', solucao: 'Simulador ou orçamento no site', estado: 'a-montar', demo: 'orcamento-automatico', ficha: ['tabela de preços', 'perguntas do pedido', 'logótipo para o PDF'] },
  { kit: 'crm', promessa: 'Cada contacto com a sua etapa e as mensagens de seguimento a sair sozinhas.', solucao: 'Seguimento e CRM', estado: 'a-montar', demo: 'crm-por-voz', ficha: ['etapas do cliente', 'mensagens de seguimento'] },
  { kit: 'app-equipa', promessa: 'Escalas, tarefas e relatórios de serviço da equipa numa só app.', solucao: 'App da equipa', estado: 'a-montar', demo: null, ficha: ['equipa e papéis', 'escalas', 'relatórios de serviço'] },
  { kit: 'faturas', promessa: 'As faturas do email vão sozinhas para a pasta certa e para o contabilista.', solucao: 'Faturas e contabilidade', estado: 'por-fazer', demo: 'faturas-por-email', ficha: ['email das faturas', 'pasta do Drive', 'email do contabilista'] },
  { kit: 'relatorios', promessa: 'Os números do negócio chegam-te ao telemóvel no dia e hora que escolheres.', solucao: 'Relatórios automáticos', estado: 'por-fazer', demo: null, ficha: ['fontes dos números', 'destinatários', 'dia e hora'] },
  { kit: 'redes', promessa: 'Publicações e respostas às avaliações com o teu tom, sem abrires as redes.', solucao: 'Redes em piloto automático', estado: 'por-fazer', demo: 'avaliacoes-google', ficha: ['contas', 'temas', 'tom', 'fotos'] },
  { kit: 'loja', promessa: 'Loja online com pagamentos, portes e encomendas a cair no telemóvel.', solucao: 'Loja online', estado: 'por-fazer', demo: null, ficha: ['produtos', 'portes', 'conta Stripe'] },
  { kit: 'cursos', promessa: 'Os teus cursos narrados e traduzidos, prontos a vender.', solucao: 'Cursos narrados', estado: 'por-fazer', demo: null, ficha: ['guiões', 'voz', 'línguas'] },
  { kit: 'mentor-ia', promessa: 'Um mentor de IA com o teu método, disponível para a tua comunidade.', solucao: 'Mentor de IA', estado: 'por-fazer', demo: 'mentor-ia-comunidade', ficha: ['método', 'regras de risco', 'canal'] },
  { kit: 'white-label', promessa: 'A plataforma com a tua marca, o teu domínio e a tua corretora.', solucao: 'White label', estado: 'por-fazer', demo: null, ficha: ['marca', 'domínio', 'corretora'] },
]

export type LayoutModelo = 'ementa' | 'agenda' | 'aulas' | 'imoveis' | 'documentos' | 'orcamento'

export interface ModeloSector {
  id: string
  sector: string
  /** Nome inventado, para a demo ter cara de negócio. Não é um cliente. */
  marca: string
  slogan: string
  servicos: { s: string; p: string }[]
  corPrincipal: string
  corFundo: string
  corTexto: string
  /** Família de letra do tema (kits/temas): serifada, condensada ou sem serifa. */
  letra: 'serif' | 'condensada' | 'sans'
  /** O ecrã de entrada muda por sector: é isto que os distingue. */
  layout: LayoutModelo
  /** Bloco de destaque do ecrã de entrada. a = texto principal, b = detalhe, c = etiqueta. */
  destaque: { titulo: string; itens: { a: string; b?: string; c?: string }[] }
  /** Porque é que este modelo vende neste sector (sem números). */
  vende: string[]
  /** Demo diária mais próxima deste sector. */
  demo: string
}

export const MODELOS: ModeloSector[] = [
  {
    id: 'restaurante', sector: 'Restaurante', marca: 'Tasca do Largo', slogan: 'Cozinha portuguesa de sempre',
    corPrincipal: '#A4402B', corFundo: '#FFF9F1', corTexto: '#2A1A12', letra: 'serif', layout: 'ementa', demo: 'avaliacoes-google',
    servicos: [{ s: 'Mesa para almoço', p: 'menu desde 12 €' }, { s: 'Mesa para jantar', p: 'carta' }, { s: 'Grupo (8+ pessoas)', p: 'sob consulta' }],
    destaque: { titulo: 'Hoje na cozinha', itens: [
      { a: 'Bacalhau à Brás', b: 'Prato do dia', c: '12 €' },
      { a: 'Polvo à lagareiro', b: 'Ao jantar', c: '18 €' },
      { a: 'Arroz doce da casa', b: 'Sobremesa', c: '4 €' },
    ] },
    vende: ['A ementa do dia sai no telemóvel sem imprimir nada', 'Reservas a qualquer hora, mesmo com a cozinha cheia', 'Grupos pedem por escrito e ficam registados'],
  },
  {
    id: 'barbearia', sector: 'Barbearia', marca: 'Barbearia Norte', slogan: 'Corte clássico, barba feita',
    corPrincipal: '#C8893B', corFundo: '#141210', corTexto: '#F2EDE6', letra: 'condensada', layout: 'agenda', demo: 'marcacoes-whatsapp',
    servicos: [{ s: 'Corte', p: '12 €' }, { s: 'Barba', p: '8 €' }, { s: 'Corte e barba', p: '18 €' }],
    destaque: { titulo: 'Vagas de hoje', itens: [{ a: '11:30' }, { a: '14:00' }, { a: '15:30' }, { a: '17:00' }, { a: '18:30' }] },
    vende: ['O cliente vê as vagas e marca sem ligar', 'Lembrete automático na véspera e duas horas antes', 'A cadeira não fica vazia por esquecimento'],
  },
  {
    id: 'beleza', sector: 'Cabeleireiro e estética', marca: 'Estúdio Rosa', slogan: 'Cabelo e unhas sem esperas',
    corPrincipal: '#A4496B', corFundo: '#FBF6F4', corTexto: '#2B1D22', letra: 'serif', layout: 'agenda', demo: 'marcacoes-whatsapp',
    servicos: [{ s: 'Corte e brushing', p: '20 €' }, { s: 'Manicure gel', p: '25 €' }, { s: 'Coloração', p: 'desde 40 €' }],
    destaque: { titulo: 'Vagas de amanhã', itens: [{ a: '09:30' }, { a: '10:30' }, { a: '13:00' }, { a: '16:00' }] },
    vende: ['Cada serviço com a sua duração: a agenda não se sobrepõe', 'Marcação pelo WhatsApp que a cliente já usa', 'Página bonita para pôr na bio do Instagram'],
  },
  {
    id: 'clinica', sector: 'Fisioterapia', marca: 'Clínica Viva', slogan: 'Fisioterapia perto de ti',
    corPrincipal: '#0E7C86', corFundo: '#F5FAFA', corTexto: '#10292C', letra: 'sans', layout: 'agenda', demo: 'marcacoes-whatsapp',
    servicos: [{ s: 'Primeira consulta', p: '45 €' }, { s: 'Sessão de fisioterapia', p: '35 €' }, { s: 'Massagem terapêutica', p: '40 €' }],
    destaque: { titulo: 'Próximas vagas', itens: [{ a: '08:30' }, { a: '12:00' }, { a: '17:30' }, { a: '19:00' }] },
    vende: ['Primeira consulta marcada sem esperar pela receção', 'Lembretes que reduzem faltas', 'Perguntas frequentes respondidas na própria página'],
  },
  {
    id: 'ginasio', sector: 'Ginásio e treino pessoal', marca: 'Box Treino', slogan: 'Treina com quem te acompanha',
    corPrincipal: '#E4572E', corFundo: '#0F1113', corTexto: '#F5F5F5', letra: 'condensada', layout: 'aulas', demo: 'linktree-para-app',
    servicos: [{ s: 'Aula experimental', p: 'grátis' }, { s: 'Treino pessoal', p: '30 €' }, { s: 'Avaliação física', p: '15 €' }],
    destaque: { titulo: 'Aulas de hoje', itens: [
      { a: 'Cross training', b: '07:00', c: 'lugares livres' },
      { a: 'Boxe', b: '12:30', c: 'lugares livres' },
      { a: 'Mobilidade', b: '19:00', c: 'lista de espera' },
    ] },
    vende: ['Aula experimental marcada num toque', 'Horário das aulas sempre atualizado', 'Instala-se no telemóvel como a app do ginásio'],
  },
  {
    id: 'imobiliaria', sector: 'Imobiliária', marca: 'Casa Certa', slogan: 'Encontra a casa sem perder tardes',
    corPrincipal: '#1E3A5F', corFundo: '#FFFFFF', corTexto: '#111827', letra: 'sans', layout: 'imoveis', demo: 'crm-por-voz',
    servicos: [{ s: 'Visita a imóvel', p: 'sem custo' }, { s: 'Avaliação do teu imóvel', p: 'sem custo' }, { s: 'Reunião de crédito', p: 'sem custo' }],
    destaque: { titulo: 'Em destaque', itens: [
      { a: 'T2 com varanda', b: 'Centro', c: '185 000 €' },
      { a: 'Moradia T3', b: 'Arredores', c: '320 000 €' },
    ] },
    vende: ['Visitas pedidas com dia e hora, sem trocas de mensagens', 'Cada contacto entra no CRM com o imóvel certo', 'Proprietários pedem avaliação na mesma página'],
  },
  {
    id: 'profissional', sector: 'Contabilidade', marca: 'Contas em Dia', slogan: 'Contabilidade sem papéis perdidos',
    corPrincipal: '#2F4B7C', corFundo: '#FAFAF7', corTexto: '#1C1F26', letra: 'serif', layout: 'documentos', demo: 'faturas-por-email',
    servicos: [{ s: 'Reunião inicial', p: 'sem custo' }, { s: 'Apoio IRS', p: 'desde 40 €' }, { s: 'Abertura de atividade', p: 'desde 50 €' }],
    destaque: { titulo: 'Para o teu IRS', itens: [
      { a: 'Recibos de renda', c: 'Enviar foto' },
      { a: 'Despesas de saúde', c: 'Enviar foto' },
      { a: 'Faturas de educação', c: 'Enviar foto' },
    ] },
    vende: ['Os clientes mandam os papéis pelo telemóvel', 'Nada se perde entre emails e WhatsApp', 'Reuniões marcadas sem ir e vir de mensagens'],
  },
  {
    id: 'tecnico', sector: 'Climatização e energia', marca: 'ClimaLar', slogan: 'Ar condicionado instalado sem dores de cabeça',
    corPrincipal: '#F2A900', corFundo: '#101826', corTexto: '#F1F5F9', letra: 'condensada', layout: 'orcamento', demo: 'orcamento-automatico',
    servicos: [{ s: 'Visita técnica', p: 'sem custo' }, { s: 'Manutenção anual', p: 'desde 60 €' }, { s: 'Diagnóstico de avaria', p: '35 €' }],
    destaque: { titulo: 'Qual é a divisão?', itens: [
      { a: 'Quarto', b: 'até 15 m²' },
      { a: 'Sala', b: '15 a 30 m²' },
      { a: 'Espaço aberto', b: 'mais de 30 m²' },
    ] },
    vende: ['O cliente diz o que precisa antes de ligares', 'Pedidos chegam com fotos e morada', 'Visitas técnicas marcadas na agenda da equipa'],
  },
]


export interface Prototipo {
  id: string
  /** Nome real do negócio para quem o protótipo foi feito (OK do Ricardo a 17/11). */
  marca: string
  sector: string
  resumo: string
  partes: string[]
  url: string
  /** Código do back-office de demonstração, se houver. */
  codigo?: string
}

/**
 * Protótipos completos feitos para apresentar a um negócio concreto (Monorepo clientes/<slug>).
 * São PROPOSTAS: o negócio ainda não é cliente, e a página diz isso em cada cartão (DL 57/2008).
 */
export const PROTOTIPOS: Prototipo[] = [
  {
    id: 'o-vitor', marca: 'O Vítor', sector: 'Restaurante e churrasqueira',
    resumo: 'Site e app de reservas com a ementa à vista e pré-pedido, e back-office onde o dono dita a ementa por voz.',
    partes: ['Reserva de mesa com pré-pedido', 'Ementa ditada por voz', 'Planta das mesas em tempo real', 'Da reserva ao serviço num toque'],
    url: 'https://o-vitor-santarem.vercel.app/#/apresentacao', codigo: '1234',
  },
  {
    id: 'aguias-alpiarca', marca: 'C.D. Os Águias de Alpiarça', sector: 'Clube desportivo',
    resumo: 'Site novo e app do sócio, com canais por modalidade, escape rooms do clube e back-office da direcção.',
    partes: ['App do sócio e dos pais', 'Canais e notícias por modalidade', 'Escape rooms com QR', 'Back-office com papéis'],
    url: 'https://aguias-alpiarca.vercel.app',
  },
]
