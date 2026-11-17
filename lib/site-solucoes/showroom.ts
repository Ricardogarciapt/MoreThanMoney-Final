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

export type EstadoKit = 'pronto' | 'a-montar' | 'por-fazer'

export interface KitShowroom {
  kit: string
  solucao: string
  estado: EstadoKit
  /** O que o negócio nos manda para o kit ficar com a marca dele. */
  ficha: string[]
  /** slug da demo diária que mostra esta solução, se houver. */
  demo: string | null
}

export const KITS: KitShowroom[] = [
  { kit: 'pagina-app', solucao: 'Página + app', estado: 'pronto', demo: 'linktree-para-app', ficha: ['nome', 'serviços e preços', 'horário', 'WhatsApp', 'morada', 'logótipo', 'cores'] },
  { kit: 'agenda-lembretes', solucao: 'Agenda com lembretes', estado: 'pronto', demo: 'marcacoes-whatsapp', ficha: ['serviços e durações', 'horário', 'equipa', 'número WhatsApp Business'] },
  { kit: 'scanners', solucao: 'Scanners em licença', estado: 'pronto', demo: 'mentor-ia-comunidade', ficha: ['contas TradingView'] },
  { kit: 'agente-ia', solucao: 'Agente de IA', estado: 'a-montar', demo: 'marcacoes-whatsapp', ficha: ['perguntas frequentes', 'preços', 'o que passa para o dono', 'canais'] },
  { kit: 'orcamento', solucao: 'Simulador ou orçamento no site', estado: 'a-montar', demo: 'orcamento-automatico', ficha: ['tabela de preços', 'perguntas do pedido', 'logótipo para o PDF'] },
  { kit: 'crm', solucao: 'Seguimento e CRM', estado: 'a-montar', demo: 'crm-por-voz', ficha: ['etapas do cliente', 'mensagens de seguimento'] },
  { kit: 'app-equipa', solucao: 'App da equipa', estado: 'a-montar', demo: null, ficha: ['equipa e papéis', 'escalas', 'relatórios de serviço'] },
  { kit: 'faturas', solucao: 'Faturas e contabilidade', estado: 'por-fazer', demo: 'faturas-por-email', ficha: ['email das faturas', 'pasta do Drive', 'email do contabilista'] },
  { kit: 'relatorios', solucao: 'Relatórios automáticos', estado: 'por-fazer', demo: null, ficha: ['fontes dos números', 'destinatários', 'dia e hora'] },
  { kit: 'redes', solucao: 'Redes em piloto automático', estado: 'por-fazer', demo: 'avaliacoes-google', ficha: ['contas', 'temas', 'tom', 'fotos'] },
  { kit: 'loja', solucao: 'Loja online', estado: 'por-fazer', demo: null, ficha: ['produtos', 'portes', 'conta Stripe'] },
  { kit: 'cursos', solucao: 'Cursos narrados', estado: 'por-fazer', demo: null, ficha: ['guiões', 'voz', 'línguas'] },
  { kit: 'mentor-ia', solucao: 'Mentor de IA', estado: 'por-fazer', demo: 'mentor-ia-comunidade', ficha: ['método', 'regras de risco', 'canal'] },
  { kit: 'white-label', solucao: 'White label', estado: 'por-fazer', demo: null, ficha: ['marca', 'domínio', 'corretora'] },
]

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
  /** Demo diária mais próxima deste sector. */
  demo: string
}

export const MODELOS: ModeloSector[] = [
  { id: 'restaurante', sector: 'Restaurante', marca: 'Tasca do Largo', slogan: 'Cozinha portuguesa de sempre', corPrincipal: '#A4402B', corFundo: '#FFF9F1', corTexto: '#2A1A12', demo: 'avaliacoes-google',
    servicos: [{ s: 'Mesa para almoço', p: 'menu desde 12 €' }, { s: 'Mesa para jantar', p: 'carta' }, { s: 'Grupo (8+ pessoas)', p: 'sob consulta' }] },
  { id: 'barbearia', sector: 'Barbearia', marca: 'Barbearia Norte', slogan: 'Corte clássico, barba feita', corPrincipal: '#C8893B', corFundo: '#141210', corTexto: '#F2EDE6', demo: 'marcacoes-whatsapp',
    servicos: [{ s: 'Corte', p: '12 €' }, { s: 'Barba', p: '8 €' }, { s: 'Corte e barba', p: '18 €' }] },
  { id: 'beleza', sector: 'Cabeleireiro e estética', marca: 'Estúdio Rosa', slogan: 'Cabelo e unhas sem esperas', corPrincipal: '#A4496B', corFundo: '#FBF6F4', corTexto: '#2B1D22', demo: 'marcacoes-whatsapp',
    servicos: [{ s: 'Corte e brushing', p: '20 €' }, { s: 'Manicure gel', p: '25 €' }, { s: 'Coloração', p: 'desde 40 €' }] },
  { id: 'clinica', sector: 'Fisioterapia', marca: 'Clínica Viva', slogan: 'Fisioterapia perto de ti', corPrincipal: '#0E7C86', corFundo: '#F5FAFA', corTexto: '#10292C', demo: 'marcacoes-whatsapp',
    servicos: [{ s: 'Primeira consulta', p: '45 €' }, { s: 'Sessão de fisioterapia', p: '35 €' }, { s: 'Massagem terapêutica', p: '40 €' }] },
  { id: 'ginasio', sector: 'Ginásio e treino pessoal', marca: 'Box Treino', slogan: 'Treina com quem te acompanha', corPrincipal: '#E4572E', corFundo: '#0F1113', corTexto: '#F5F5F5', demo: 'linktree-para-app',
    servicos: [{ s: 'Aula experimental', p: 'grátis' }, { s: 'Treino pessoal', p: '30 €' }, { s: 'Avaliação física', p: '15 €' }] },
  { id: 'imobiliaria', sector: 'Imobiliária', marca: 'Casa Certa', slogan: 'Encontra a casa sem perder tardes', corPrincipal: '#1E3A5F', corFundo: '#FFFFFF', corTexto: '#111827', demo: 'crm-por-voz',
    servicos: [{ s: 'Visita a imóvel', p: 'sem custo' }, { s: 'Avaliação do teu imóvel', p: 'sem custo' }, { s: 'Reunião de crédito', p: 'sem custo' }] },
  { id: 'profissional', sector: 'Contabilidade', marca: 'Contas em Dia', slogan: 'Contabilidade sem papéis perdidos', corPrincipal: '#2F4B7C', corFundo: '#FAFAF7', corTexto: '#1C1F26', demo: 'faturas-por-email',
    servicos: [{ s: 'Reunião inicial', p: 'sem custo' }, { s: 'Apoio IRS', p: 'desde 40 €' }, { s: 'Abertura de atividade', p: 'desde 50 €' }] },
  { id: 'tecnico', sector: 'Climatização e energia', marca: 'ClimaLar', slogan: 'Ar condicionado instalado sem dores de cabeça', corPrincipal: '#F2A900', corFundo: '#101826', corTexto: '#F1F5F9', demo: 'orcamento-automatico',
    servicos: [{ s: 'Visita técnica', p: 'sem custo' }, { s: 'Manutenção anual', p: 'desde 60 €' }, { s: 'Diagnóstico de avaria', p: '35 €' }] },
]

export const ROTULO_ESTADO: Record<EstadoKit, string> = {
  pronto: 'Pronto a entregar',
  'a-montar': 'Em montagem',
  'por-fazer': 'Em breve',
}

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
