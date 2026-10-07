/**
 * AUTO-APROVAR A FILA DO SITE — o toggle «Auto-aprovar pedidos dos agentes» do AIOS, aplicado aos
 * rascunhos `envio:*` de `aios_tasks` (07/10).
 *
 * ═══ PORQUE EXISTE ═════════════════════════════════════════════════════════════════════════════
 *
 * O toggle (`envios.auto_aprovar` no config do AIOS) só varria a fila LOCAL do AIOS
 * (`estado/fila.json`). Os rascunhos que os crons e os agentes deixam na fila do SITE ficavam
 * pendentes até o dono clicar um a um — 49 de reactivação a 06/10, nenhum aprovado num dia.
 *
 * ═══ A REGRA — NÃO HÁ UMA SEGUNDA ═════════════════════════════════════════════════════════════
 *
 * Um rascunho só sai sozinho quando `decidirContacto` (lib/agentes/contacto-inicial.ts) o marca
 * «sai», com a evidência lida da base por `juntarEvidencia` — exclusão global, consentimento,
 * compras reais. Saem pelo MESMO caminho do clique do dono: `aprovarEnvio` (lib/envios-fila.ts),
 * com a transição condicional e o transporte de email do site. Antes de aprovar, a decisão fica
 * em `agentes_envios` com a base legal; sem esse registo, não sai.
 *
 *  · «bloqueado» ou «fila» → o rascunho FICA pendente, com o motivo escrito em `erro` para o dono ler;
 *  · só os kinds de MENSAGEM entram (email de recuperação, follow-up de Telegram). A chamada
 *    (`envio:contacto_imediato`) é do setter; dinheiro, trading, apagar e merge nem são envios —
 *    e um texto que fale disso também não é aprovado sozinho;
 *  · tectos: os de `decidirContacto` (por agente e por canal, de site_settings.agentes_motor) E o
 *    do AIOS (`limite` total e por agente, que o AIOS manda com o que já aprovou hoje).
 *
 * PURO em cima (`pedidoDoEnvio`, `decidirLote` — guarda em envios-auto-aprovar.check.ts), base de
 * dados em baixo.
 */
import { lerConfigOs, tectosContactoDb } from '@/lib/agentes/os/os-db'
import { KIND_ENVIO, type PayloadEmailRecuperacao, type PayloadFollowupTelegram } from '@/lib/envios-aprovacao'
import {
  contarHoje, decidirContacto, juntarEvidencia, registarEnvio, TECTOS_PADRAO,
  type Decisao, type Evidencia, type Familia, type PedidoContacto, type Tectos,
} from '@/lib/agentes/contacto-inicial'

/** Os únicos kinds que podem sair sozinhos, e o canal de cada um. */
export const KINDS_AUTO: Record<string, 'email' | 'telegram'> = {
  [KIND_ENVIO.EMAIL_RECUPERACAO]: 'email',
  [KIND_ENVIO.FOLLOWUP_TELEGRAM]: 'telegram',
}

/** Assuntos que nunca se aprovam sozinhos, mesmo dentro de uma mensagem com base legal. */
const NUNCA_SOZINHO = /\b(reembols|refund|estorn|transfer[eê]ncia|iban|levantamento|saque|ordem de (compra|venda)|abrir posi|fechar posi|apagar (a )?conta|eliminar (a )?conta|merge)\b/i

const FAMILIAS: Array<[Familia, RegExp]> = [
  ['formacao', /\b(pack\s+)?membro\b|\bforma[cç][aã]o\b|\bbootcamp\b|\bfundador\b/i],
  ['sinais', /\bpremium\b|\bvip\b|\bsinais\b|\bmtm alerts\b/i],
  ['copy', /\bmtm\s*copy\b|\bcopytrading\b|\bcopy trading\b/i],
  ['auto_t2t', /\bmtm\s*auto\b|\bt2t\b|\btap to trade\b/i],
  ['funded', /\bfunded\b|\bchallenge\b|\btorneio\b/i],
  ['software', /\bsensei ea\b|\blicen[cç]a\b|\bsaas\b/i],
]

/**
 * As famílias de produto de que a mensagem FALA. Explícita no payload ganha; senão lê-se no
 * assunto e no texto. Todas têm de estar cobertas pelo soft opt-in — uma oferta de Premium a um
 * ex-Membro não é «produto semelhante» só porque o email também fala do Membro.
 */
export function familiasDaOferta(payload: Record<string, unknown>): Familia[] {
  const explicita = String(payload.familia_oferta ?? '').trim() as Familia
  if (explicita && FAMILIAS.some(([f]) => f === explicita)) return [explicita]
  const texto = `${payload.assunto ?? ''}\n${payload.texto ?? ''}`
  return FAMILIAS.filter(([, re]) => re.test(texto)).map(([f]) => f)
}

/**
 * A natureza declarada por quem redigiu: `natureza: 'servico'` explícito, ou o segmento que o cron
 * de recuperação escreve para falhas de pagamento. Só declara — quem decide se é MESMO serviço é
 * `decidirContacto` (contrato real, mesma família, só email).
 */
export function naturezaDoEnvio(payload: Record<string, unknown>): 'servico' | null {
  if (String(payload.natureza ?? '') === 'servico') return 'servico'
  return /pagamento falhado|falha de pagamento|pagamentos? recusados?/i.test(String(payload.segmento ?? '')) ? 'servico' : null
}

export interface LinhaFila {
  id: string
  kind: string
  status: string
  title?: string | null
  payload: unknown
  erro?: string | null
}

export type Preparado =
  | { saltar: false; id: string; canal: 'email' | 'telegram'; pedido: PedidoContacto; familias: Familia[]; agenteCodigo: string }
  | { saltar: true; id: string; porque: string }

/** Do rascunho da fila ao pedido de contacto que a regra decide. Puro. */
export function pedidoDoEnvio(t: LinhaFila): Preparado {
  const canal = KINDS_AUTO[String(t.kind)]
  if (!canal) return { saltar: true, id: t.id, porque: `«${t.kind}» não é mensagem que saia sozinha (chamada, ou fora do catálogo).` }
  if (t.status !== 'pendente') return { saltar: true, id: t.id, porque: `Estado «${t.status}»: só um pendente se aprova.` }
  const p = (t.payload ?? {}) as Record<string, unknown>
  const texto = String(p.texto ?? '')
  if (NUNCA_SOZINHO.test(`${p.assunto ?? ''} ${texto}`)) {
    return { saltar: true, id: t.id, porque: 'Fala de dinheiro, trading, apagar ou merge — isso é sempre do dono.' }
  }
  const agenteCodigo = String(p.agente ?? p.codigo ?? '').trim()
  if (!agenteCodigo) return { saltar: true, id: t.id, porque: 'Sem agente atribuído: sem agente não há tecto, e sem tecto não sai.' }
  const destino = canal === 'email' ? String((p as unknown as PayloadEmailRecuperacao).email ?? '') : String((p as unknown as PayloadFollowupTelegram).chat_id ?? '')
  return {
    saltar: false,
    id: t.id,
    canal,
    agenteCodigo,
    familias: familiasDaOferta(p),
    pedido: { canal, destino, texto, familiaOferta: null, tipoResposta: null, natureza: naturezaDoEnvio(p) },
  }
}

/**
 * Uma mensagem com várias famílias sai só se TODAS saírem. Sem família nenhuma decide-se com
 * `familiaOferta: null` (consentimento e B2B não precisam dela; o soft opt-in recusa). Puro.
 */
export function decidirComFamilias(
  pedido: PedidoContacto,
  familias: Familia[],
  ev: Evidencia,
  usados: { agenteHoje: number; canalHoje: number },
  tectos: Tectos,
): Decisao {
  const lista: Array<Familia | null> = familias.length ? familias : [null]
  let ultima: Decisao | null = null
  for (const f of lista) {
    const d = decidirContacto({ ...pedido, familiaOferta: f }, ev, usados, tectos)
    if (d.destino !== 'sai') return d
    ultima = d
  }
  return ultima as Decisao
}

export interface ItemLote {
  prep: Preparado
  /** Id do agente na equipa (null = código desconhecido). */
  agenteId: string | null
  /** `null` = não se conseguiu juntar a evidência (conta como não sair). */
  evidencia: Evidencia | null
}

export interface DecisaoItem {
  id: string
  agenteId: string | null
  destino: 'sai' | 'fila' | 'bloqueado' | 'saltado'
  base: string | null
  porque: string
  canal?: string
  familias?: Familia[]
}

/**
 * A DECISÃO DO LOTE — pura. Os contadores andam item a item: o tecto do agente e do canal conta os
 * que JÁ SAÍRAM hoje (`usadosIniciais`) mais os que este lote vai mandar; `limite` é o tecto do
 * AIOS (total), `limitePorAgente` o do AIOS por agente.
 */
export function decidirLote(
  itens: ItemLote[],
  usadosIniciais: Record<string, { total: number; porCanal: Record<string, number> }>,
  tectos: Tectos,
  limite: number,
  limitePorAgente: Record<string, number> = {},
): DecisaoItem[] {
  const usados: Record<string, { total: number; porCanal: Record<string, number> }> = {}
  for (const [k, v] of Object.entries(usadosIniciais)) usados[k] = { total: v.total, porCanal: { ...v.porCanal } }
  let saem = 0
  const lote: Record<string, number> = {}
  const out: DecisaoItem[] = []
  for (const it of itens) {
    const { prep } = it
    if (prep.saltar) { out.push({ id: prep.id, agenteId: it.agenteId, destino: 'saltado', base: null, porque: prep.porque }); continue }
    if (!it.agenteId) { out.push({ id: prep.id, agenteId: null, destino: 'saltado', base: null, porque: `Agente «${prep.agenteCodigo}» não existe na equipa — sem tecto, não sai.` }); continue }
    if (!it.evidencia) { out.push({ id: prep.id, agenteId: it.agenteId, destino: 'fila', base: null, porque: 'Evidência ilegível (exclusão/consentimento/compras) — na dúvida, não sai.', canal: prep.canal }); continue }
    if (!(it.agenteId in usados)) {
      out.push({ id: prep.id, agenteId: it.agenteId, destino: 'fila', base: null, porque: 'Não se leu o registo de envios de hoje — o tecto não se pode verificar.', canal: prep.canal })
      continue
    }
    const u = usados[it.agenteId]
    const d = decidirComFamilias(prep.pedido, prep.familias, it.evidencia, { agenteHoje: u.total, canalHoje: u.porCanal[prep.canal] ?? 0 }, tectos)
    if (d.destino === 'sai') {
      const capAg = limitePorAgente[it.agenteId]
      if (saem >= Math.max(0, limite)) {
        out.push({ id: prep.id, agenteId: it.agenteId, destino: 'fila', base: null, porque: `Tecto diário do auto-aprovar do AIOS atingido (${limite}).`, canal: prep.canal, familias: prep.familias })
        continue
      }
      if (capAg !== undefined && (lote[it.agenteId] ?? 0) >= Math.max(0, capAg)) {
        out.push({ id: prep.id, agenteId: it.agenteId, destino: 'fila', base: null, porque: 'Tecto diário por agente do auto-aprovar do AIOS atingido.', canal: prep.canal, familias: prep.familias })
        continue
      }
      saem += 1
      lote[it.agenteId] = (lote[it.agenteId] ?? 0) + 1
      u.total += 1
      u.porCanal[prep.canal] = (u.porCanal[prep.canal] ?? 0) + 1
    }
    out.push({ id: prep.id, agenteId: it.agenteId, destino: d.destino, base: d.base, porque: d.porque, canal: prep.canal, familias: prep.familias })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Base de dados.
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Db = { from: (tabela: string) => any }

export interface ResultadoAuto {
  ok: boolean
  ensaio: boolean
  total: number
  sairiam: number
  enviados: number
  falhados: number
  ficam: number
  porDestino: Record<string, number>
  itens: Array<DecisaoItem & { titulo?: string | null; codigo?: string | null; enviado?: boolean; erro?: string }>
  erros: string[]
}

export async function autoAprovarFilaSite(
  db: Db,
  opcoes: {
    ensaio?: boolean
    /** Quantos o AIOS ainda deixa sair hoje (o seu `tecto_dia` menos o que já aprovou). */
    limite?: number
    /** Tecto por agente do AIOS, e quantos cada código já levou hoje pelo AIOS. */
    tectoPorAgente?: number
    usadosAiosPorCodigo?: Record<string, number>
    quem?: string
  } = {},
): Promise<ResultadoAuto> {
  const vazio = (e: string): ResultadoAuto => ({ ok: false, ensaio: opcoes.ensaio === true, total: 0, sairiam: 0, enviados: 0, falhados: 0, ficam: 0, porDestino: {}, itens: [], erros: [e] })
  const { data: linhas, error } = await db
    .from('aios_tasks')
    .select('id, kind, status, title, payload, erro')
    .like('kind', 'envio:%')
    .eq('status', 'pendente')
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) return vazio(error.message)
  return processarLinhas(db, (linhas ?? []) as LinhaFila[], opcoes)
}

/**
 * O corpo da passagem, sobre linhas já lidas. Separado para o ensaio poder correr a regra sobre um
 * lote histórico (ex.: os 49 de 06/10) sem tocar em nada — com `ensaio: true` não há escritas.
 */
export async function processarLinhas(
  db: Db,
  fila: LinhaFila[],
  opcoes: Parameters<typeof autoAprovarFilaSite>[1] = {},
): Promise<ResultadoAuto> {
  const ensaio = opcoes.ensaio === true
  const erros: string[] = []
  const vazio = (e: string): ResultadoAuto => ({ ok: false, ensaio, total: 0, sairiam: 0, enviados: 0, falhados: 0, ficam: 0, porDestino: {}, itens: [], erros: [e] })

  const { data: equipa, error: eEq } = await db.from('agentes_equipa').select('id, chave_receita, estado')
  if (eEq) return vazio(eEq.message)
  const porCodigo = new Map<string, string>()
  for (const a of (equipa ?? []) as Array<{ id: string; chave_receita: string | null; estado: string }>) {
    if (a.chave_receita && ['vivo', 'em_risco'].includes(String(a.estado))) porCodigo.set(String(a.chave_receita).toUpperCase(), a.id)
  }

  const { data: cfg } = await db.from('site_settings').select('value').eq('key', 'agentes_motor').maybeSingle()
  const ct = ((cfg?.value ?? {}) as { contacto_tectos?: { por_agente_dia?: number; por_canal_dia?: Tectos['porCanalDia'] } }).contacto_tectos
  let tectos: Tectos = ct
    ? { porAgenteDia: Number(ct.por_agente_dia ?? TECTOS_PADRAO.porAgenteDia), porCanalDia: ct.por_canal_dia ?? TECTOS_PADRAO.porCanalDia }
    : TECTOS_PADRAO
  // OS v2 (07/10): tectos dinâmicos (chão = fixos antigos; nunca acima dos tectos duros externos).
  if ((await lerConfigOs(db)).ligado) {
    const t = await tectosContactoDb(db, null)
    tectos = { porAgenteDia: t.porAgenteDia, porCanalDia: t.porCanalDia }
  }

  const itens: ItemLote[] = []
  const usados: Record<string, { total: number; porCanal: Record<string, number> }> = {}
  for (const t of fila) {
    const prep = pedidoDoEnvio(t)
    if (prep.saltar) { itens.push({ prep, agenteId: null, evidencia: null }); continue }
    const agenteId = porCodigo.get(prep.agenteCodigo.toUpperCase()) ?? null
    let evidencia: Evidencia | null = null
    if (agenteId) {
      try { evidencia = await juntarEvidencia(db, prep.pedido) } catch { evidencia = null }
      if (!(agenteId in usados)) {
        const [e, tg] = await Promise.all([contarHoje(db, agenteId, 'email'), contarHoje(db, agenteId, 'telegram')])
        if (e && tg) usados[agenteId] = { total: e.agenteHoje, porCanal: { email: e.canalHoje, telegram: tg.canalHoje } }
      }
    }
    itens.push({ prep, agenteId, evidencia })
  }

  // O tecto por agente do AIOS chega por código; aqui passa a id.
  const limitePorAgente: Record<string, number> = {}
  if (Number.isFinite(Number(opcoes.tectoPorAgente))) {
    for (const [codigo, id] of porCodigo) {
      limitePorAgente[id] = Math.max(0, Number(opcoes.tectoPorAgente) - Number(opcoes.usadosAiosPorCodigo?.[codigo] ?? 0))
    }
  }
  const limite = Number.isFinite(Number(opcoes.limite)) ? Number(opcoes.limite) : 0
  const decisoes = decidirLote(itens, usados, tectos, limite, limitePorAgente)

  const res: ResultadoAuto = { ok: true, ensaio, total: fila.length, sairiam: 0, enviados: 0, falhados: 0, ficam: 0, porDestino: {}, itens: [], erros }
  const titulo = new Map(fila.map((t) => [t.id, t.title ?? null]))
  const erroAtual = new Map(fila.map((t) => [t.id, t.erro ?? null]))
  const quem = opcoes.quem ?? 'regra:auto-aprovar'
  const { aprovarEnvio } = await import('@/lib/envios-fila')

  for (let i = 0; i < decisoes.length; i++) {
    const d = decisoes[i]
    const it = itens[i]
    res.porDestino[d.destino] = (res.porDestino[d.destino] ?? 0) + 1
    const linha: ResultadoAuto['itens'][number] = { ...d, titulo: titulo.get(d.id), codigo: it.prep.saltar ? null : it.prep.agenteCodigo }
    if (d.destino !== 'sai') {
      res.ficam += 1
      // Uma chamada ou outro kind fora do catálogo não é assunto do auto-aprovar: nem nota leva.
      if (!ensaio && KINDS_AUTO[String(fila[i].kind)]) {
        const nota = `auto-aprovar: ${d.destino} — ${d.porque}`.slice(0, 500)
        if (erroAtual.get(d.id) !== nota) {
          await db.from('aios_tasks').update({ erro: nota }).eq('id', d.id).eq('status', 'pendente')
          // O registo da base legal guarda a decisão, saia ou não (uma vez por motivo novo).
          if (!it.prep.saltar && d.agenteId && d.destino !== 'saltado') {
            await registarEnvio(db, d.agenteId, { ...it.prep.pedido, familiaOferta: it.prep.familias[0] ?? null },
              { pode: false, base: null, porque: d.porque, destino: d.destino as 'fila' | 'bloqueado' })
          }
        }
      }
      res.itens.push(linha)
      continue
    }
    res.sairiam += 1
    if (ensaio || it.prep.saltar || !d.agenteId) { res.itens.push(linha); continue }
    // Sem registo da base legal, não sai.
    const reg = await registarEnvio(db, d.agenteId, { ...it.prep.pedido, familiaOferta: it.prep.familias[0] ?? null },
      { pode: true, base: d.base as Decisao['base'], porque: d.porque, destino: 'sai' })
    if (!reg.ok) {
      res.falhados += 1
      res.itens.push({ ...linha, enviado: false, erro: `registo da base legal falhou: ${reg.erro}` })
      continue
    }
    const r = await aprovarEnvio(d.id, `${quem}:${d.base}`)
    if (r.ok && r.enviado) res.enviados += 1
    else res.falhados += 1
    res.itens.push({ ...linha, enviado: !!(r.ok && r.enviado), ...(r.erro ? { erro: r.erro } : {}) })
  }
  return res
}
