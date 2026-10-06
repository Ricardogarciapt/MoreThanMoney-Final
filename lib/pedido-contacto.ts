/**
 * «QUERO QUE ME LIGUEM» — o pedido, o consentimento por canal e o lead do Meta. PURO.
 *
 * ═══ PORQUÊ (06/10/2026) ════════════════════════════════════════════════════════════════════
 *
 * O dono quer encher a lista de pessoas que os agentes podem contactar SOZINHOS por chamada,
 * WhatsApp ou email. A regra do motor (`lib/agentes/contacto-inicial.ts`) só deixa um agente
 * escrever ou ligar primeiro a um particular com CONSENTIMENTO GRAVADO PARA AQUELE CANAL. Este
 * ficheiro é a porta por onde esse consentimento entra — e é puro para as guardas
 * (`pedido-contacto.check.ts`) provarem o caso mau sem base de dados:
 *
 *  · sem caixa marcada não há consentimento (nem um `'on'`, nem um `1`: só `true`);
 *  · só o canal marcado é autorizado — marcar «chamada» não dá WhatsApp nem email;
 *  · o honeypot preenchido é descartado em silêncio;
 *  · a assinatura do webhook do Meta é verificada antes de se ler o corpo.
 *
 * O texto de cada caixa é a PROVA: é exactamente essa frase que fica gravada na linha do livro.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { normalizar as normalizarAg } from '@/lib/agentes/atribuicao'
import { emailUtilizavel, ehEmailDeMentira, normalizarEmail } from '@/lib/captacao-consentimento'
import {
  CANAIS, INTERESSES, MELHORES_HORAS, QUEM_CONTACTA, provaDoCanal,
  type CanalContacto, type Interesse, type MelhorHora,
} from '@/lib/pedido-contacto-textos'

export * from '@/lib/pedido-contacto-textos'

// ── Telefone ─────────────────────────────────────────────────────────────────────────────────

/**
 * Telefone em E.164 (`+351912345678`) ou `null`. Aceita o número com o indicativo separado ou já
 * colado; um número sem indicativo nenhum é recusado — adivinhar o país é ligar para outra pessoa.
 */
export function normalizarTelefone(indicativo: unknown, numero: unknown): string | null {
  let n = String(numero ?? '').replace(/[\s().-]/g, '')
  if (n.startsWith('00')) n = `+${n.slice(2)}`
  if (!n.startsWith('+')) {
    const ind = String(indicativo ?? '').replace(/[\s()-]/g, '')
    if (!/^\+\d{1,4}$/.test(ind)) return null
    n = `${ind}${n.replace(/^0+/, '')}`
  }
  return /^\+[1-9]\d{7,14}$/.test(n) ? n : null
}

// ── O pedido do formulário ───────────────────────────────────────────────────────────────────

export interface EntradaFormulario {
  nome?: unknown
  indicativo?: unknown
  telefone?: unknown
  email?: unknown
  interesse?: unknown
  melhorHora?: unknown
  consentimentos?: { chamada?: unknown; whatsapp?: unknown; email?: unknown } | null
  origem?: unknown
  ag?: unknown
  /** O honeypot. Uma pessoa nunca o vê; um robô preenche tudo. */
  site?: unknown
}

export interface LinhaConsentimento {
  canal: CanalContacto
  base_legal: 'consentimento'
  prova: string
  telefone: string | null
  email: string | null
  origem: string | null
  ag: string | null
  origem_url: string | null
}

export interface PedidoValido {
  nome: string
  telefone: string
  email: string | null
  interesse: Interesse
  melhorHora: MelhorHora
  canais: CanalContacto[]
  origem: string | null
  ag: string | null
}

export type Validacao =
  | { ok: true; pedido: PedidoValido; linhas: LinhaConsentimento[] }
  | { ok: false; descartar: true; motivo: string }
  | { ok: false; descartar?: false; erros: Record<string, string> }

export function honeypotPreenchido(valor: unknown): boolean {
  return String(valor ?? '').trim().length > 0
}

/** A origem (página ou post): curta, só caracteres de caminho/identificador. */
export function limparOrigem(o: unknown): string | null {
  const s = String(o ?? '').trim().slice(0, 120)
  if (!s) return null
  return /^[\w\-/.:#?=&%@]+$/.test(s) ? s : null
}

/**
 * Uma caixa só conta se for EXACTAMENTE `true`. É o centro de tudo isto: um formulário que
 * manda `'on'`, um cliente que manda `1`, ou um campo que não veio, não são consentimento.
 */
export function canaisConsentidos(c: EntradaFormulario['consentimentos']): CanalContacto[] {
  if (!c || typeof c !== 'object') return []
  return CANAIS.filter((k) => (c as Record<string, unknown>)[k] === true)
}

/**
 * As linhas a gravar no livro. Uma por canal marcado e mais nenhuma. O email só entra na linha
 * do canal email: pô-lo na linha da chamada fazia a vista das campanhas ler «sim a email».
 */
export function linhasDeConsentimento(p: {
  canais: CanalContacto[]
  telefone: string | null
  email: string | null
  origem: string | null
  ag: string | null
  origemUrl?: string | null
  prova?: Partial<Record<CanalContacto, string>>
}): LinhaConsentimento[] {
  const out: LinhaConsentimento[] = []
  for (const canal of CANAIS) {
    if (!p.canais.includes(canal)) continue
    const ehEmail = canal === 'email'
    if (ehEmail && !p.email) continue
    if (!ehEmail && !p.telefone) continue
    out.push({
      canal,
      base_legal: 'consentimento',
      prova: (p.prova?.[canal] || provaDoCanal(canal)).slice(0, 2000),
      telefone: ehEmail ? null : p.telefone,
      email: ehEmail ? p.email : null,
      origem: p.origem,
      ag: p.ag,
      origem_url: p.origemUrl ? String(p.origemUrl).slice(0, 500) : null,
    })
  }
  return out
}

export function validarPedido(e: EntradaFormulario, origemUrl?: string | null): Validacao {
  if (honeypotPreenchido(e.site)) return { ok: false, descartar: true, motivo: 'honeypot' }

  const erros: Record<string, string> = {}
  const nome = String(e.nome ?? '').trim().replace(/\s+/g, ' ').slice(0, 80)
  if (nome.length < 2) erros.nome = 'Escreve o teu nome.'

  const telefone = normalizarTelefone(e.indicativo, e.telefone)
  if (!telefone) erros.telefone = 'Número inválido. Confirma o indicativo e o número.'

  const emailBruto = normalizarEmail(e.email as string)
  let email: string | null = null
  if (emailBruto) {
    if (!emailUtilizavel(emailBruto) || ehEmailDeMentira(emailBruto)) erros.email = 'Este email não parece válido.'
    else email = emailBruto
  }

  const interesse = String(e.interesse ?? '') as Interesse
  if (!(interesse in INTERESSES)) erros.interesse = 'Escolhe o que te interessa.'
  const melhorHora = (String(e.melhorHora ?? '') || 'qualquer') as MelhorHora
  if (!(melhorHora in MELHORES_HORAS)) erros.melhorHora = 'Escolhe a melhor hora.'

  const canais = canaisConsentidos(e.consentimentos)
  if (canais.length === 0) erros.consentimentos = 'Marca pelo menos uma forma de contacto. Sem isso não te podemos contactar.'
  if (canais.includes('email') && !email) erros.email = erros.email || 'Para aceitares email, escreve o teu email.'

  if (Object.keys(erros).length) return { ok: false, erros }

  const origem = limparOrigem(e.origem)
  const ag = normalizarAg(e.ag)
  const pedido: PedidoValido = { nome, telefone: telefone!, email, interesse, melhorHora, canais, origem, ag }
  return { ok: true, pedido, linhas: linhasDeConsentimento({ canais, telefone, email, origem, ag, origemUrl }) }
}

// ── O limite por IP ─────────────────────────────────────────────────────────────────────────

export const LIMITE_POR_IP_HORA = 5
export const LIMITE_POR_TELEFONE_DIA = 3

export function excedeLimite(p: { ipUltimaHora: number; telefoneUltimoDia: number }): boolean {
  return p.ipUltimaHora >= LIMITE_POR_IP_HORA || p.telefoneUltimoDia >= LIMITE_POR_TELEFONE_DIA
}

/** Hash do IP com sal do servidor: chega para contar pedidos, não serve para identificar ninguém. */
export function hashIp(ip: string, sal: string): string {
  return createHmac('sha256', sal || 'mtm-pedido-contacto').update(String(ip ?? '')).digest('hex').slice(0, 32)
}

// ── A tarefa para o setter ───────────────────────────────────────────────────────────────────

/** Por que canal se começa: a chamada que a pessoa pediu, depois WhatsApp, depois email. */
export function canalPreferido(canais: CanalContacto[]): CanalContacto | null {
  return CANAIS.find((c) => canais.includes(c)) ?? null
}

/** O primeiro toque. Identifica a MTM e leva a forma de sair, que a regra do motor exige. */
export function textoPrimeiroContacto(p: { nome: string; interesse: Interesse; canal: CanalContacto }): string {
  const primeiro = p.nome.split(' ')[0] || p.nome
  const tema = INTERESSES[p.interesse] ?? 'o que pediste'
  if (p.canal === 'chamada') {
    return (
      `Chamada a ${primeiro}: pediu que a MoreThanMoney lhe ligasse sobre ${tema}. ` +
      'Abrir com quem somos e porque ligamos; se não quiser ser contactado, registar a saída (sair de todos os canais).'
    )
  }
  return (
    `Olá ${primeiro}, aqui é a MoreThanMoney. Pediste que te contactássemos sobre ${tema}. ` +
    'Quando te dá jeito falarmos? Se não quiseres receber mais mensagens, responde SAIR.'
  )
}

// ── Meta Lead Ads ───────────────────────────────────────────────────────────────────────────

/**
 * Verifica `X-Hub-Signature-256` (`sha256=<hex>` = HMAC-SHA256 do corpo CRU com o segredo da app).
 * Sem segredo, sem cabeçalho, ou com qualquer diferença: false. Comparação em tempo constante.
 */
export function assinaturaMetaValida(corpoCru: string, cabecalho: string | null | undefined, segredo: string | null | undefined): boolean {
  if (!segredo || !cabecalho) return false
  const m = /^sha256=([0-9a-f]{64})$/i.exec(cabecalho.trim())
  if (!m) return false
  const esperado = createHmac('sha256', segredo).update(corpoCru, 'utf8').digest()
  const recebido = Buffer.from(m[1], 'hex')
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado)
}

export interface EventoLeadgen {
  leadgenId: string
  pageId: string | null
  formId: string | null
  adId: string | null
}

/** Os eventos `leadgen` dentro de um webhook `page`. Tudo o resto é ignorado. */
export function eventosLeadgen(corpo: unknown): EventoLeadgen[] {
  const b = corpo as { object?: string; entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: Record<string, unknown> }> }> }
  if (!b || b.object !== 'page' || !Array.isArray(b.entry)) return []
  const out: EventoLeadgen[] = []
  for (const e of b.entry) {
    for (const c of e.changes ?? []) {
      if (c.field !== 'leadgen' || !c.value) continue
      const id = String(c.value.leadgen_id ?? '').trim()
      if (!/^\d{5,30}$/.test(id)) continue
      out.push({
        leadgenId: id,
        pageId: c.value.page_id ? String(c.value.page_id) : e.id ? String(e.id) : null,
        formId: c.value.form_id ? String(c.value.form_id) : null,
        adId: c.value.ad_id ? String(c.value.ad_id) : null,
      })
    }
  }
  return out
}

export interface LeadMeta {
  field_data?: Array<{ name?: string; values?: string[] }>
  custom_disclaimer_responses?: Array<{ checkbox_key?: string; is_checked?: string | boolean }>
}

export interface CaixaDoFormulario {
  key: string
  text: string
  /** Caixa que o formulário já mostra marcada. Não é consentimento — é ignorada. */
  preMarcada?: boolean
}

/** Classifica uma caixa do formulário Meta pelo canal: pela chave recomendada, senão pelo texto. */
export function canalDaCaixa(c: CaixaDoFormulario): CanalContacto | null {
  const k = String(c.key ?? '').toLowerCase()
  for (const canal of CANAIS) if (k === `consent_${canal}` || k === canal) return canal
  const t = String(c.text ?? '').toLowerCase()
  if (/whats\s*app/.test(t)) return 'whatsapp'
  if (/\be-?mail\b/.test(t)) return 'email'
  if (/telefon|lig(ue|ar|uem)|chamada/.test(t)) return 'chamada'
  return null
}

function campo(lead: LeadMeta, ...nomes: string[]): string {
  for (const f of lead.field_data ?? []) {
    if (nomes.includes(String(f.name ?? '').toLowerCase())) return String(f.values?.[0] ?? '').trim()
  }
  return ''
}

function mapearInteresse(v: string): Interesse {
  const s = v.toLowerCase()
  if (/funded|desafio|financiad/.test(s)) return 'mtm_funded'
  if (/sensei|\bea\b|rob[oô]|expert/.test(s)) return 'ea_sensei'
  if (/sina|copy|c[oó]pia/.test(s)) return 'sinais_copy'
  if (/forma|curso|aprend|escola/.test(s)) return 'formacao'
  return (s in INTERESSES ? s : 'outro') as Interesse
}

function mapearHora(v: string): MelhorHora {
  const s = v.toLowerCase()
  if (/manh/.test(s)) return 'manha'
  if (/almo/.test(s)) return 'almoco'
  if (/tarde/.test(s)) return 'tarde'
  if (/noite/.test(s)) return 'noite'
  return 'qualquer'
}

/**
 * O lead do Meta convertido no MESMO pedido do formulário do site. O consentimento só existe
 * para as caixas com `is_checked` verdadeiro, e a prova é o texto da caixa tal como estava no
 * formulário. Sem caixa marcada devolve um pedido com `canais: []` e zero linhas.
 */
export function pedidoDoLeadMeta(
  lead: LeadMeta,
  caixas: CaixaDoFormulario[],
  extra: { origem: string | null; ag: string | null; avisoLegal?: string | null },
): { pedido: PedidoValido | null; linhas: LinhaConsentimento[]; motivo?: string } {
  const nome = (campo(lead, 'full_name', 'nome', 'first_name') || 'Lead Meta').slice(0, 80)
  const telefone = normalizarTelefone(null, campo(lead, 'phone_number', 'telefone', 'phone'))
  const emailBruto = normalizarEmail(campo(lead, 'email'))
  const email = emailUtilizavel(emailBruto) && !ehEmailDeMentira(emailBruto) ? emailBruto : null

  const marcadas = new Set(
    (lead.custom_disclaimer_responses ?? [])
      .filter((r) => r.is_checked === true || String(r.is_checked).toLowerCase() === 'true' || r.is_checked === '1')
      .map((r) => String(r.checkbox_key ?? '')),
  )
  const prova: Partial<Record<CanalContacto, string>> = {}
  const canais: CanalContacto[] = []
  for (const c of caixas) {
    if (!marcadas.has(c.key) || c.preMarcada === true) continue
    const canal = canalDaCaixa(c)
    if (!canal || canais.includes(canal)) continue
    canais.push(canal)
    prova[canal] = [c.text, extra.avisoLegal, QUEM_CONTACTA].filter(Boolean).join(' ')
  }
  if (!telefone && !email) return { pedido: null, linhas: [], motivo: 'lead sem telefone nem email' }

  const pedido: PedidoValido = {
    nome,
    telefone: telefone ?? '',
    email,
    interesse: mapearInteresse(campo(lead, 'interesse', 'o_que_te_interessa', 'interest')),
    melhorHora: mapearHora(campo(lead, 'melhor_hora', 'hora', 'best_time')),
    canais,
    origem: extra.origem,
    ag: normalizarAg(extra.ag),
  }
  const linhas = linhasDeConsentimento({ canais, telefone, email, origem: extra.origem, ag: pedido.ag, prova })
  return { pedido, linhas }
}

// ── O link curto ────────────────────────────────────────────────────────────────────────────

/** O link de /ligar para posts e bio. Leva SEMPRE `?ag=` (por omissão o AG-SOCIAL) e, se houver, a origem. */
export function linkLigar(raiz: string, ag: string = 'AG-SOCIAL', origem?: string | null): string {
  const base = String(raiz ?? '').replace(/\/+$/, '')
  const c = normalizarAg(ag) ?? 'AG-SOCIAL'
  const o = limparOrigem(origem)
  return `${base}/ligar?ag=${encodeURIComponent(c)}${o ? `&o=${encodeURIComponent(o)}` : ''}`
}
