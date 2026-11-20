/**
 * O mapa do Centro Social. Uma só fonte para o menu, os atalhos da visão geral e o `?s=` do URL —
 * para que um cartão nunca aponte para uma secção que o menu já não tem.
 *
 * Antes eram 11 separadores soltos lado a lado. Agora seguem o caminho de uma pessoa:
 * publicar → captar quem reage → converter → (e as ligações que fazem tudo funcionar).
 */
export type Secao =
  | "inicio"
  | "fila"
  | "cartoes"
  | "factos"
  | "radar"
  | "leads"
  | "prospecao"
  | "funil"
  | "mapa"
  | "mensagens"
  | "automacoes"
  | "conversas"
  | "ligacoes"
  | "leadgen"

export type GrupoSocial = {
  id: "inicio" | "publicar" | "captar" | "converter" | "ligacoes"
  nome: string
  resumo: string
  soDono?: boolean
  secoes: Array<{ id: Secao; nome: string; nota: string }>
}

export const GRUPOS_SOCIAL: readonly GrupoSocial[] = [
  {
    id: "inicio",
    nome: "Visão geral",
    resumo: "O estado de tudo num ecrã.",
    secoes: [{ id: "inicio", nome: "Visão geral", nota: "Números do dia, agentes e atalhos." }],
  },
  {
    id: "publicar",
    nome: "Publicar",
    resumo: "O que sai nas duas contas e com que factos.",
    secoes: [
      { id: "fila", nome: "Publicações", nota: "Rascunhos, aprovados, publicados e falhados." },
      { id: "cartoes", nome: "Estúdio de cartões", nota: "Cartões e carrosséis com a marca." },
      { id: "factos", nome: "Factos nos cartões", nota: "Os números que entram nas imagens." },
    ],
  },
  {
    id: "captar",
    nome: "Captar",
    resumo: "Quem reage, comenta ou pode vir a ser lead.",
    secoes: [
      { id: "radar", nome: "Radar de leads", nota: "Publicações de fora onde vale a pena aparecer." },
      { id: "leads", nome: "Leads & engagement", nota: "Comentários, DMs e envios por aprovar." },
      { id: "prospecao", nome: "Prospeção Telegram", nota: "Pessoas e grupos a trabalhar no Telegram." },
    ],
  },
  {
    id: "converter",
    nome: "Converter",
    resumo: "Do lead ao membro: funis, mensagens e automações.",
    secoes: [
      { id: "funil", nome: "Funil", nota: "Quantas pessoas em cada degrau." },
      { id: "mapa", nome: "Mapa dos funis", nota: "Os caminhos desenhados, passo a passo." },
      { id: "mensagens", nome: "Mensagens", nota: "Os textos que o funil envia." },
      { id: "automacoes", nome: "Automações", nota: "Palavra-chave → resposta → seguimento." },
      { id: "conversas", nome: "Conversas do bot", nota: "O que o bot respondeu e a quem." },
    ],
  },
  {
    id: "ligacoes",
    nome: "Ligações",
    resumo: "Tokens e webhooks da Meta. Só o dono.",
    soDono: true,
    secoes: [
      { id: "ligacoes", nome: "Instagram", nota: "Tokens de Página e segredo da app." },
      { id: "leadgen", nome: "Leads da Meta", nota: "O webhook dos formulários instantâneos." },
    ],
  },
] as const

export const TODAS_SECOES: readonly Secao[] = GRUPOS_SOCIAL.flatMap((g) => g.secoes.map((s) => s.id))

export function grupoDa(secao: Secao): GrupoSocial {
  return GRUPOS_SOCIAL.find((g) => g.secoes.some((s) => s.id === secao)) ?? GRUPOS_SOCIAL[0]
}

/**
 * Os módulos do back-office a que o Centro Social está ligado. `/backoffice/gestao/<slug>` serve
 * tanto em www como no subdomínio do backoffice. Quem vê cada um decide-se em Gestão → Acessos.
 */
export const LIGACOES_BACKOFFICE = [
  { slug: "leads", nome: "Leads sociais (CRM)", nota: "Os mesmos leads, na área Clientes & CRM." },
  { slug: "conversao", nome: "Conversão", nota: "Leads quentes à espera e tempo até ao 1.º contacto." },
  { slug: "formularios", nome: "Formulários", nota: "Cada submissão entra no pipeline." },
  { slug: "trafego", nome: "Tráfego", nota: "Campanhas Meta ao lado do que entrou no CRM." },
  { slug: "marketing", nome: "Marketing", nota: "Assistente, estúdio de anúncios e rascunhos." },
  { slug: "acessos", nome: "Acessos da equipa", nota: "Quem abre o Centro Social (área Social & conteúdo).", soDono: true },
] as const

export const hrefBackoffice = (slug: string) => `/backoffice/gestao/${slug}`
