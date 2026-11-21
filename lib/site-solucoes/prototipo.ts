/**
 * «Receber o protótipo da minha solução» (pedido do Ricardo, 21/11/2026).
 *
 * O fluxo: o negócio pede (na proposta em PDF, no relatório, no /solucoes ou no showroom) → a
 * nossa IA (grátis primeiro, lib/ia/chamar.ts) escreve o protótipo DELE na hora → ele vê-o logo,
 * com a app no telemóvel e em realidade aumentada → marca a reunião (/agendar, Google Meet) → a
 * demo real com a marca dele (kits do Monorepo) segue nas 24 h a seguir à reunião.
 *
 * Tudo aqui é puro, para a guarda (prototipo.check.ts):
 *  · validarPedidoPrototipo: o que entra do formulário, limpo e com limites;
 *  · prototipoBase: o protótipo sem IA (modelo do sector + dados do negócio). Sai SEMPRE;
 *  · promptPrototipo + limparPrototipo: o que a IA acrescenta (slogan, boas-vindas do assistente,
 *    perguntas frequentes, como cada solução funciona para ESTE negócio). A IA não traz números:
 *    frases com algarismos caem, para não inventar preços, prazos nem resultados;
 *  · fichaKit: a ficha no formato do Monorepo (kits/exemplos/*.json) para montar a demo real com
 *    `kits/<kit>/novo-cliente.sh <slug> ficha.json`.
 */
import { KITS, MODELOS, type ModeloSector } from '@/lib/site-solucoes/showroom'
import { instrucaoIdioma, type Idioma } from '@/lib/site-solucoes/i18n/base'

export const LIMITE_PROTOTIPOS_IP_HORA = 3
export const HORAS_DEMO_APOS_REUNIAO = 24
export const SECTOR_OUTRO = 'outro'

/** Soluções que se podem pedir no protótipo (as que têm ecrã e kit). */
export const SOLUCOES_PROTOTIPO = ['pagina-app', 'agenda-lembretes', 'agente-ia', 'orcamento', 'crm', 'faturas', 'redes', 'loja'] as const
export type SolucaoPrototipo = (typeof SOLUCOES_PROTOTIPO)[number]

export interface EntradaPrototipo {
  nome?: unknown
  email?: unknown
  telefone?: unknown
  empresa?: unknown
  sector?: unknown
  sectorLivre?: unknown
  cidade?: unknown
  cor?: unknown
  servicos?: unknown
  solucoes?: unknown
  dores?: unknown
  proposta?: unknown
  consentimento?: unknown
  website?: unknown
}

export interface PedidoPrototipo {
  nome: string
  email: string
  telefone: string
  empresa: string
  /** id de MODELOS ou 'outro' */
  sector: string
  sectorLivre: string | null
  cidade: string | null
  cor: string | null
  servicos: { s: string; p: string }[]
  solucoes: SolucaoPrototipo[]
  dores: string
  proposta: string | null
}

export type ValidacaoPrototipo =
  | { ok: true; pedido: PedidoPrototipo }
  | { ok: false; descartar: true }
  | { ok: false; descartar?: false; erros: Record<string, string> }

const txt = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** «Corte - 12 €» / «Corte: 12€» / «Corte» → { s, p } */
export function lerServicos(v: unknown): { s: string; p: string }[] {
  const linhas = Array.isArray(v) ? v.map(String) : String(v ?? '').split(/\n|;/)
  return linhas
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 2)
    .slice(0, 6)
    .map((l) => {
      const m = l.match(/^(.*?)\s*[-–:|]\s*(.+)$/)
      return m ? { s: m[1].slice(0, 40), p: m[2].slice(0, 24) } : { s: l.slice(0, 40), p: '' }
    })
}

export function validarPedidoPrototipo(e: EntradaPrototipo): ValidacaoPrototipo {
  if (String(e.website ?? '').trim()) return { ok: false, descartar: true }
  const erros: Record<string, string> = {}
  const nome = txt(e.nome, 80)
  if (nome.length < 2) erros.nome = 'Diz-nos o teu nome.'
  const email = txt(e.email, 120).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) erros.email = 'Precisamos de um email válido para te enviar o protótipo.'
  const telefone = String(e.telefone ?? '').replace(/[^\d+]/g, '').slice(0, 16)
  if (telefone.replace(/\D/g, '').length < 9) erros.telefone = 'Deixa o teu telemóvel para combinarmos a reunião.'
  const empresa = txt(e.empresa, 60)
  if (empresa.length < 2) erros.empresa = 'Como se chama o negócio?'
  const sectorLivre = txt(e.sectorLivre, 60) || null
  const sector = MODELOS.some((m) => m.id === e.sector) ? String(e.sector) : SECTOR_OUTRO
  if (sector === SECTOR_OUTRO && (!sectorLivre || sectorLivre.length < 3)) erros.sectorLivre = 'Diz-nos que negócio é.'
  const corCrua = txt(e.cor, 7)
  const cor = /^#[0-9a-fA-F]{6}$/.test(corCrua) ? corCrua.toUpperCase() : null
  const lista = Array.isArray(e.solucoes) ? e.solucoes : String(e.solucoes ?? '').split(',')
  const solucoes = [...new Set(lista.map(String).filter((x): x is SolucaoPrototipo => (SOLUCOES_PROTOTIPO as readonly string[]).includes(x)))].slice(0, 3)
  if (!solucoes.length) erros.solucoes = 'Escolhe pelo menos uma solução.'
  const dores = String(e.dores ?? '').trim().slice(0, 1200)
  if (e.consentimento !== true) erros.consentimento = 'Precisamos da tua autorização para preparar o protótipo.'
  const propostaCrua = txt(e.proposta, 24)
  const proposta = /^MTM-\d{6}-[0-9A-Z]{1,4}$/.test(propostaCrua) ? propostaCrua : null
  if (Object.keys(erros).length) return { ok: false, erros }
  return {
    ok: true,
    pedido: { nome, email, telefone, empresa, sector, sectorLivre, cidade: txt(e.cidade, 40) || null, cor, servicos: lerServicos(e.servicos), solucoes, dores, proposta },
  }
}

export interface PassoFluxo {
  titulo: string
  texto: string
}

export interface SolucaoNoPrototipo {
  kit: SolucaoPrototipo
  nome: string
  promessa: string
  /** Como funciona para ESTE negócio (IA) — vazio usa a promessa. */
  paraTi: string
  fluxo: PassoFluxo[]
  /** O que o negócio nos manda para a demo real. */
  ficha: string[]
}

export interface PrototipoSpec {
  versao: 1
  empresa: string
  sector: string
  /** id do modelo do showroom usado como base visual. */
  modelo: string
  cidade: string | null
  cor: string
  slogan: string
  servicos: { s: string; p: string }[]
  solucoes: SolucaoNoPrototipo[]
  assistente: { boasVindas: string; faq: { p: string; r: string }[] }
  /** true se a IA escreveu as partes de texto. */
  ia: boolean
}

/** Fluxo de 3 passos por solução: o que o cliente do negócio vive. */
export const FLUXOS: Record<SolucaoPrototipo, PassoFluxo[]> = {
  'pagina-app': [
    { titulo: 'Encontra-te', texto: 'O cliente abre a tua página pelo Instagram, Google ou um QR no balcão.' },
    { titulo: 'Instala', texto: 'Fica com a tua app no telemóvel, sem lojas de apps.' },
    { titulo: 'Volta', texto: 'Serviços, preços e contacto sempre à mão, com a tua marca.' },
  ],
  'agenda-lembretes': [
    { titulo: 'Marca', texto: 'Escolhe o serviço e vê só as horas livres.' },
    { titulo: 'Recebe lembrete', texto: 'Lembrete na véspera, com confirmar ou remarcar num toque.' },
    { titulo: 'Vaga libertada', texto: 'Se alguém desmarca, a vaga é oferecida a quem espera.' },
  ],
  'agente-ia': [
    { titulo: 'Pergunta', texto: 'O cliente escreve a qualquer hora, no site ou no WhatsApp.' },
    { titulo: 'Resposta na hora', texto: 'O assistente responde com as tuas regras e o teu tom.' },
    { titulo: 'Passa-te o que importa', texto: 'Só chega a ti o que precisa mesmo de ti.' },
  ],
  orcamento: [
    { titulo: 'Responde', texto: 'O cliente responde a umas perguntas e junta fotos.' },
    { titulo: 'Recebe o PDF', texto: 'Orçamento com a tua tabela e o teu logótipo, na hora.' },
    { titulo: 'Aceita', texto: 'Aceita com um toque e o pedido cai na tua agenda.' },
  ],
  crm: [
    { titulo: 'Entra o contacto', texto: 'Cada pedido entra com a etapa certa, venha de onde vier.' },
    { titulo: 'Seguimento sozinho', texto: 'As mensagens de seguimento saem no dia certo.' },
    { titulo: 'Vês tudo', texto: 'Um quadro com quem está quente e quem precisa de ti.' },
  ],
  faturas: [
    { titulo: 'Chega a fatura', texto: 'As faturas que recebes por email são apanhadas sozinhas.' },
    { titulo: 'Arrumada', texto: 'Vão para a pasta certa com o nome certo.' },
    { titulo: 'Contabilista', texto: 'Seguem para o contabilista sem tu reencaminhares nada.' },
  ],
  redes: [
    { titulo: 'Temas da semana', texto: 'Escolhes os temas, a IA escreve com o teu tom.' },
    { titulo: 'Aprovas', texto: 'Aprovas no telemóvel antes de sair.' },
    { titulo: 'Avaliações', texto: 'As avaliações do Google têm resposta educada e rápida.' },
  ],
  loja: [
    { titulo: 'Escolhe', texto: 'O cliente escolhe os produtos no telemóvel.' },
    { titulo: 'Paga', texto: 'Paga com cartão ou MB WAY e os portes calculam-se sozinhos.' },
    { titulo: 'Encomenda', texto: 'A encomenda cai-te no telemóvel, pronta a preparar.' },
  ],
}

const COR_OURO = '#D2A63C'

function modeloBase(p: Pick<PedidoPrototipo, 'sector'>): ModeloSector {
  return MODELOS.find((m) => m.id === p.sector) ?? MODELOS.find((m) => m.id === 'profissional')!
}

export function prototipoBase(p: PedidoPrototipo): PrototipoSpec {
  const m = modeloBase(p)
  const sectorNome = p.sector === SECTOR_OUTRO ? p.sectorLivre ?? 'Negócio local' : m.sector
  return {
    versao: 1,
    empresa: p.empresa,
    sector: sectorNome,
    modelo: m.id,
    cidade: p.cidade,
    cor: p.cor ?? (p.sector === SECTOR_OUTRO ? COR_OURO : m.corPrincipal),
    slogan: p.sector === SECTOR_OUTRO ? `${sectorNome}, sem esperas` : m.slogan,
    servicos: p.servicos.length ? p.servicos : m.servicos,
    solucoes: p.solucoes.map((k) => {
      const kit = KITS.find((x) => x.kit === k)!
      return { kit: k, nome: kit.solucao, promessa: kit.promessa, paraTi: '', fluxo: FLUXOS[k], ficha: kit.ficha }
    }),
    assistente: {
      boasVindas: `Olá! Sou o assistente de ${p.empresa}. Posso ajudar-te a marcar, ver preços ou tirar dúvidas.`,
      faq: [],
    },
    ia: false,
  }
}

/** O ModeloSector que o telemóvel do showroom desenha com os dados deste protótipo. */
export function modeloDoPrototipo(s: PrototipoSpec): ModeloSector {
  const m = MODELOS.find((x) => x.id === s.modelo) ?? MODELOS[0]
  return { ...m, sector: s.sector, marca: s.empresa, slogan: s.slogan, servicos: s.servicos.slice(0, 4).map((x) => ({ s: x.s, p: x.p || '—' })) }
}

export function promptPrototipo(p: PedidoPrototipo, base: PrototipoSpec, idioma: Idioma = 'pt'): { sistema: string; mensagem: string } {
  const sistema = [
    'És o designer de produto da MoreThanMoney, que monta páginas, apps e agentes de IA para pequenos negócios.',
    instrucaoIdioma(idioma),
    'Escreve o protótipo para ESTE negócio, com frases curtas, tom próximo e informal (tu).',
    'NUNCA escrevas números, preços, percentagens, prazos nem resultados. Não inventes clientes, prémios nem anos de experiência.',
    'Responde só com JSON: {"slogan": "até 7 palavras", "boasVindas": "1 frase do assistente a cumprimentar o cliente deste negócio", "faq": [{"p": "pergunta típica de um cliente deste negócio", "r": "resposta curta e prudente"}] (3 a 4), "paraTi": {"<kit>": "1 frase sobre como esta solução funciona neste negócio"}}.',
  ].join(' ')
  const mensagem = [
    `Negócio: ${p.empresa} (${base.sector})${p.cidade ? `, em ${p.cidade}` : ''}.`,
    base.servicos.length ? `Serviços: ${base.servicos.map((x) => x.s).join(', ')}.` : '',
    p.dores ? `O que mais lhe rouba tempo, nas palavras do dono: «${p.dores}».` : '',
    `Soluções pedidas (chaves de paraTi): ${base.solucoes.map((x) => `${x.kit} = ${x.nome}`).join('; ')}.`,
  ]
    .filter(Boolean)
    .join('\n')
  return { sistema, mensagem }
}

const semNumeros = (s: string) =>
  s
    .split(/(?<=[.!?])\s+/)
    .filter((f) => !/\d/.test(f))
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/—/g, ',')
    .trim()

/** Junta o que a IA escreveu ao protótipo base. O que vier mal fica com o texto base. */
export function limparPrototipo(base: PrototipoSpec, bruto: unknown): PrototipoSpec {
  let o: { slogan?: unknown; boasVindas?: unknown; faq?: unknown; paraTi?: unknown } = {}
  if (typeof bruto === 'string') {
    try {
      o = JSON.parse(bruto)
    } catch {
      return base
    }
  } else if (bruto && typeof bruto === 'object') o = bruto as typeof o
  const slogan = semNumeros(String(o.slogan ?? '')).replace(/[«»"]/g, '').slice(0, 60)
  const boasVindas = semNumeros(String(o.boasVindas ?? '')).slice(0, 220)
  const faq = (Array.isArray(o.faq) ? o.faq : [])
    .map((x) => ({ p: semNumeros(String((x as { p?: unknown })?.p ?? '')).slice(0, 120), r: semNumeros(String((x as { r?: unknown })?.r ?? '')).slice(0, 260) }))
    .filter((x) => x.p.length >= 6 && x.r.length >= 6)
    .slice(0, 4)
  const paraTi = o.paraTi && typeof o.paraTi === 'object' ? (o.paraTi as Record<string, unknown>) : {}
  const usouIA = Boolean(slogan.length >= 4 || boasVindas.length >= 10 || faq.length)
  return {
    ...base,
    slogan: slogan.length >= 4 ? slogan : base.slogan,
    assistente: { boasVindas: boasVindas.length >= 10 ? boasVindas : base.assistente.boasVindas, faq },
    solucoes: base.solucoes.map((s) => {
      const f = semNumeros(String(paraTi[s.kit] ?? '')).slice(0, 220)
      return f.length >= 10 ? { ...s, paraTi: f } : s
    }),
    ia: usouIA,
  }
}

/** Ficha no formato dos kits do Monorepo (kits/exemplos/*.json), a completar na reunião. */
export function fichaKit(s: PrototipoSpec, p: { email: string; telefone: string }): Record<string, unknown> {
  const tel = p.telefone.replace(/\D/g, '')
  const whatsapp = tel.length === 9 ? `351${tel}` : tel
  const temas = new Set(['beleza', 'barbearia', 'clinica', 'ginasio', 'restaurante', 'imobiliaria', 'tecnico', 'profissional'])
  return {
    nome: s.empresa,
    slogan: s.slogan,
    sector: s.sector,
    cidade: s.cidade ?? '',
    logotipo: 'logo.png',
    contactos: { whatsapp, telefone: p.telefone, email: p.email, morada: '', mapa: '', instagram: '' },
    servicos: s.servicos.map((x) => ({ nome: x.s, duracao: '30 min', minutos: 30, preco: x.p })),
    horario: { seg: '09:00-19:00', ter: '09:00-19:00', qua: '09:00-19:00', qui: '09:00-19:00', sex: '09:00-19:00', sab: '', dom: '' },
    faq: s.assistente.faq,
    marcacao: {
      canal: 'whatsapp',
      intervaloMin: 30,
      diasAFrente: 14,
      antecedenciaMin: 60,
      mensagem: 'Olá! Queria marcar {servico} ({duracao}) para {dia} às {hora}. Nome: {nome}. Telemóvel: {telefone}.',
    },
    legal: { empresa: s.empresa, nif: '', livroReclamacoes: 'https://www.livroreclamacoes.pt' },
    tema: temas.has(s.modelo) ? s.modelo : 'mtm',
    cores: { principal: s.cor },
    kits: s.solucoes.map((x) => x.kit),
    _prototipo: 'Ficha gerada pelo protótipo do /solucoes. Confirmar horário, morada, NIF e logótipo na reunião.',
  }
}

/** Slug público difícil de adivinhar (o protótipo tem o nome e serviços do negócio). */
export function novoSlug(empresa: string, aleatorio: () => number = Math.random): string {
  const base = empresa
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28) || 'negocio'
  let r = ''
  for (let i = 0; i < 8; i++) r += '23456789abcdefghjkmnpqrstuvwxyz'[Math.floor(aleatorio() * 31)]
  return `${base}-${r}`
}

/** Prazo da demo real: 24 h depois do FIM da reunião. */
export function prazoDemo(fimReuniao: Date): Date {
  return new Date(fimReuniao.getTime() + HORAS_DEMO_APOS_REUNIAO * 3600_000)
}
