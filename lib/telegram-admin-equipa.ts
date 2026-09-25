/**
 * EQUIPA, PIPELINE, COMISSÕES E MLM — no telemóvel do dono, e só dele.
 *
 * PORQUÊ ISTO EXISTE
 * A partir de hoje há uma equipa a vender (setters, closers, prospectors, afiliados, team leaders),
 * um pipeline de negócios e comissões a nascer sozinhas de cada venda. Quem decide se uma comissão
 * se paga é uma pessoa — o dono — e essa pessoa passa o dia fora do portátil. Enquanto a aprovação
 * só existisse no /admin, o que acontecia era o que já acontecia com os depósitos: dinheiro de
 * gente que trabalhou a ficar semanas parado à espera de alguém abrir um computador.
 *
 * O QUE ESTE FICHEIRO É, E O QUE NÃO É
 * Aqui vivem as LEITURAS e os TEXTOS/TECLADOS — tudo o que se pode provar sem base de dados fica
 * em funções puras, e é isso que a guarda testa. As ESCRITAS vivem em
 * `lib/telegram-admin-equipa-acoes.ts`, para que nenhuma delas possa nascer sem passar pelo
 * envelope `comRegisto` da porta.
 *
 * AS REGRAS, que valem para os dois ficheiros:
 *
 *  1. SÓ O DONO. A autoridade é a de `ehChatDeAdmin` (um chat, vindo de `TELEGRAM_ADMIN_CHAT_ID`)
 *     e nada aqui a alarga. Não há função exportada neste módulo que decida acesso: quem decide é
 *     `abrirPorta`, e todas as escritas exigem uma `Porta` já aberta como primeiro argumento — um
 *     tipo que só se consegue construir do outro lado da porta.
 *
 *  2. NADA PAGA SOZINHO. O bot aprova — acto humano, dois toques — e mais nada. `paga` é um estado
 *     a que só se chega depois de o dono ter transferido o dinheiro com as próprias mãos, e isso
 *     não se faz de um telemóvel. Ver `ESTADOS_QUE_O_BOT_DECIDE`.
 *
 *  3. O SEGUNDO TOQUE DIZ O VALOR E O NOME. Um polegar a passar pelo ecrã não pode aprovar uma
 *     comissão; e uma confirmação que diga só «confirmas?» é tão má como não ter confirmação.
 *
 *  4. NADA DE CREDENCIAIS. Este módulo lê pessoas, papéis, negócios, comissões e nós do MLM.
 *     Nunca lê (nem poderia mostrar) passwords, chaves ou tokens.
 *
 *   npx tsx lib/telegram-admin-equipa.check.ts
 */
import { PAPEIS, PAPEL_NOME, type Papel, ehPapel } from '@/lib/backoffice-papeis'
import { escaparHtml as esc, pedirConfirmacao, type Botao, type Confirmacao } from '@/lib/telegram-admin-porta'
import type { getSupabaseAdmin } from '@/lib/supabase-admin-client'

type Supa = ReturnType<typeof getSupabaseAdmin>

// ═══════════════════════════ O QUE O BOT PODE DECIDIR ═══════════════════════════

/**
 * Os únicos destinos de uma comissão a que um botão do telemóvel chega.
 *
 * `paga` NÃO está aqui, e é de propósito: marcar como paga é dizer «o dinheiro saiu», e o dinheiro
 * sai por transferência, fora do sistema. Deixar o bot escrever `paga` era abrir a porta a um
 * extracto que diz pago sobre dinheiro que nunca saiu — exactamente o buraco que a auditoria de
 * comissões existe para tapar. Quem marca pago é o /admin, com a referência do pagamento à frente.
 */
export const ESTADOS_QUE_O_BOT_DECIDE = ['aprovada', 'cancelada'] as const
export type DecisaoComissao = (typeof ESTADOS_QUE_O_BOT_DECIDE)[number]

/**
 * Códigos de uma letra para os papéis — e a razão é o limite de 64 bytes do `callback_data`.
 *
 * `admin:pp!team_leader:<uuid>` são 59 bytes e ainda cabia; `admin:pl!afiliado_legado_50:<uuid>`
 * dava 64 exactos, e um botão que rebenta por um byte é um botão que o Telegram cala sem erro.
 * Uma letra por papel deixa margem de sobra e é reversível — `codigoDePapel` e `papelDoCodigo` são
 * uma bijecção, e a guarda prova-o.
 */
export const PAPEL_CODIGO: Record<Papel, string> = {
  afiliado: 'a',
  setter: 's',
  closer: 'c',
  prospector: 'r',
  team_leader: 't',
}

export function papelDoCodigo(codigo: string): Papel | null {
  const achado = PAPEIS.find((p) => PAPEL_CODIGO[p] === codigo)
  return achado ?? null
}

/**
 * Os dois planos de comissão em que o dono mexe pelo telemóvel.
 *
 * `afiliado_legado_50` é o plano de quem já cá estava e a quem foram prometidos 50 % — a lista é
 * dele, não se adivinha (ver migração 129, secção 4.2). `padrao` é o plano geral. Mexer aqui muda
 * o RENDIMENTO de uma pessoa, e por isso pede os mesmos dois toques de uma comissão.
 */
export const PLANO_CODIGO: Record<string, string> = {
  l: 'afiliado_legado_50',
  p: 'padrao',
}

export function planoDoCodigo(codigo: string): string | null {
  return PLANO_CODIGO[codigo] ?? null
}

/** Quantos dias sem mexer fazem de um negócio um negócio PARADO. */
export const DIAS_PARA_NEGOCIO_PARADO = 7

/** Os estados de um negócio que já não esperam nada de ninguém. */
export const ESTADOS_FECHADOS = ['ganho', 'perdido'] as const

// ═══════════════════════════ FORMATAR ═══════════════════════════

/** Cêntimos → «1 234,50 €». Tudo nesta casa guarda cêntimos; mostrar cêntimos é que não. */
export function eur(cents: number, moeda = 'EUR'): string {
  const v = (Number(cents) || 0) / 100
  try {
    return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: moeda || 'EUR' }).format(v)
  } catch {
    return `${v.toFixed(2)} ${moeda}`
  }
}

/** «há 3 dias» / «há 5 h». Um negócio parado mede-se em dias, não em datas. */
export function desde(iso?: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - Date.parse(iso)
  if (!Number.isFinite(ms)) return '—'
  const dias = Math.floor(ms / 86_400_000)
  if (dias >= 1) return `há ${dias} dia${dias === 1 ? '' : 's'}`
  const horas = Math.floor(ms / 3_600_000)
  return horas >= 1 ? `há ${horas} h` : 'agora mesmo'
}

/** O nome de uma pessoa como se mostra numa mensagem: nome, ou o email, ou o id cortado. */
export function nomeMostravel(p?: { full_name?: string | null; username?: string | null; email?: string | null; id?: string } | null): string {
  if (!p) return 'alguém sem perfil'
  return String(p.full_name || p.username || p.email || (p.id ? p.id.slice(0, 8) : '') || 'sem nome')
}

// ═══════════════════════════ AS LEITURAS ═══════════════════════════

export interface PessoaDaEquipa {
  userId: string
  nome: string
  email: string | null
  papeis: Papel[]
  /** Em que plano de comissão está — `padrao` quando não tem linha própria. */
  plano: string
  desdeIso: string | null
}

/** Nomes, papéis e plano — para responder a «quem está na equipa e a fazer o quê». */
export async function carregarEquipa(supabase: Supa): Promise<PessoaDaEquipa[]> {
  const { data: linhas } = await supabase
    .from('backoffice_papeis')
    .select('user_id, papel, atribuido_at')
    .is('retirado_at', null)
    .order('atribuido_at', { ascending: true })
    .limit(500)

  const porPessoa = new Map<string, { papeis: Papel[]; desdeIso: string | null }>()
  for (const l of linhas ?? []) {
    const x = l as { user_id?: string; papel?: string; atribuido_at?: string }
    if (!x.user_id || !ehPapel(x.papel)) continue
    const actual = porPessoa.get(x.user_id) ?? { papeis: [], desdeIso: x.atribuido_at ?? null }
    if (!actual.papeis.includes(x.papel)) actual.papeis.push(x.papel)
    porPessoa.set(x.user_id, actual)
  }
  const ids = [...porPessoa.keys()]
  if (!ids.length) return []

  const [{ data: perfis }, { data: planos }] = await Promise.all([
    supabase.from('profiles').select('id, email, username, full_name').in('id', ids),
    supabase.from('vendas_pessoa_plano').select('pessoa_id, plano').in('pessoa_id', ids),
  ])
  const planoDe = new Map((planos ?? []).map((p) => [String((p as { pessoa_id: string }).pessoa_id), String((p as { plano: string }).plano)]))
  const perfilDe = new Map((perfis ?? []).map((p) => [String((p as { id: string }).id), p as Record<string, string | null>]))

  return ids
    .map((id) => {
      const p = perfilDe.get(id)
      const e = porPessoa.get(id)!
      return {
        userId: id,
        nome: nomeMostravel(p ? { ...p, id } : { id }),
        email: (p?.email as string | null) ?? null,
        papeis: e.papeis,
        plano: planoDe.get(id) ?? 'padrao',
        desdeIso: e.desdeIso,
      }
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'))
}

/** Pura: quem está na equipa, agrupado pela pergunta que ele faz («quem faz o quê»). */
export function textoEquipa(equipa: PessoaDaEquipa[]): string {
  if (!equipa.length) {
    return '👔 <b>Equipa</b>\n\nNinguém tem papel activo no backoffice.\n\n<i>Papéis dão-se no /admin ou aqui, em «Dar ou retirar papel».</i>'
  }
  const porPapel = PAPEIS.map((p) => ({ papel: p, gente: equipa.filter((x) => x.papeis.includes(p)) })).filter((x) => x.gente.length)
  const legado = equipa.filter((x) => x.plano !== 'padrao')
  return [
    `👔 <b>Equipa</b> — ${equipa.length} pessoa${equipa.length === 1 ? '' : 's'}`,
    '',
    ...porPapel.flatMap((g) => [
      `<b>${PAPEL_NOME[g.papel]}</b> (${g.gente.length})`,
      ...g.gente.slice(0, 12).map((x) => `   • ${esc(x.nome)}${x.papeis.length > 1 ? ` <i>(+${x.papeis.length - 1})</i>` : ''}`),
      g.gente.length > 12 ? `   <i>… e mais ${g.gente.length - 12}</i>` : '',
    ]),
    legado.length ? `\n💼 <b>Fora do plano padrão (${legado.length}):</b>` : '',
    ...legado.slice(0, 10).map((x) => `   • ${esc(x.nome)} — <code>${esc(x.plano)}</code>`),
  ]
    .filter(Boolean)
    .join('\n')
}

export interface Pipeline {
  porEstado: Record<string, number>
  total: number
  /** Abertos e sem mexer há mais de `DIAS_PARA_NEGOCIO_PARADO` dias. */
  parados: Array<{ id: string; nome: string; estado: string; desdeIso: string | null }>
}

/** O pipeline: quantos em cada estado, e os que estão parados. */
export async function carregarPipeline(supabase: Supa): Promise<Pipeline> {
  const { data } = await supabase
    .from('vendas_negocios')
    .select('id, nome, estado, atualizado_em')
    .order('atualizado_em', { ascending: true })
    .limit(2000)

  const porEstado: Record<string, number> = {}
  const parados: Pipeline['parados'] = []
  const limite = Date.now() - DIAS_PARA_NEGOCIO_PARADO * 86_400_000
  for (const n of data ?? []) {
    const x = n as { id?: string; nome?: string; estado?: string; atualizado_em?: string }
    const estado = String(x.estado ?? 'lead')
    porEstado[estado] = (porEstado[estado] ?? 0) + 1
    const fechado = (ESTADOS_FECHADOS as readonly string[]).includes(estado)
    if (!fechado && x.atualizado_em && Date.parse(x.atualizado_em) < limite) {
      parados.push({
        id: String(x.id ?? ''),
        nome: String(x.nome ?? '?'),
        estado,
        desdeIso: x.atualizado_em ?? null,
      })
    }
  }
  return { porEstado, total: (data ?? []).length, parados }
}

/** Pura: o pipeline em texto. Os parados vêm primeiro porque é o que ele tem de fazer hoje. */
export function textoPipeline(p: Pipeline): string {
  if (!p.total) return '📋 <b>Pipeline</b>\n\nAinda não há negócios registados.'
  const ordem = ['lead', 'contactado', 'qualificado', 'marcado', 'apresentado', 'no_show', 'ganho', 'perdido']
  const chaves = [...new Set([...ordem.filter((k) => p.porEstado[k]), ...Object.keys(p.porEstado)])]
  const abertos = chaves.filter((k) => !(ESTADOS_FECHADOS as readonly string[]).includes(k)).reduce((s, k) => s + (p.porEstado[k] ?? 0), 0)
  return [
    `📋 <b>Pipeline</b> — ${p.total} negócio${p.total === 1 ? '' : 's'} (${abertos} em aberto)`,
    '',
    ...chaves.map((k) => `• ${k.replace('_', ' ')}: <b>${p.porEstado[k] ?? 0}</b>`),
    p.parados.length
      ? `\n🐌 <b>Parados há mais de ${DIAS_PARA_NEGOCIO_PARADO} dias (${p.parados.length}):</b>`
      : `\n✅ Nenhum negócio aberto parado há mais de ${DIAS_PARA_NEGOCIO_PARADO} dias.`,
    ...p.parados.slice(0, 10).map((n) => `   • ${esc(n.nome)} — ${esc(n.estado)}, ${desde(n.desdeIso)}`),
    p.parados.length > 10 ? `   <i>… e mais ${p.parados.length - 10}</i>` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export interface ComissaoPendente {
  id: string
  beneficiarioId: string
  quem: string
  papel: string
  valorCents: number
  moeda: string
  pct: number | null
  pack: string | null
  referencia: string | null
  criadoIso: string | null
}

/** As comissões à espera de decisão, e o total que está em jogo. */
export async function carregarComissoesPendentes(
  supabase: Supa,
  limite = 10,
): Promise<{ fila: ComissaoPendente[]; quantas: number; totalCents: number }> {
  const { data } = await supabase
    .from('vendas_comissoes')
    .select('id, beneficiario_id, papel, valor_cents, moeda, pct, criado_em, venda_id')
    .eq('estado', 'pendente')
    .order('criado_em', { ascending: true })
    .limit(200)

  const linhas = (data ?? []) as Array<Record<string, unknown>>
  const totalCents = linhas.reduce((s, l) => s + (Number(l.valor_cents) || 0), 0)
  const recorte = linhas.slice(0, limite)
  const ids = [...new Set(recorte.map((l) => String(l.beneficiario_id)).filter(Boolean))]
  const vendaIds = [...new Set(recorte.map((l) => String(l.venda_id)).filter(Boolean))]

  const [{ data: perfis }, { data: vendas }] = await Promise.all([
    ids.length ? supabase.from('profiles').select('id, email, username, full_name').in('id', ids) : Promise.resolve({ data: [] }),
    vendaIds.length ? supabase.from('vendas_vendas').select('id, pack, referencia').in('id', vendaIds) : Promise.resolve({ data: [] }),
  ])
  const perfilDe = new Map((perfis ?? []).map((p) => [String((p as { id: string }).id), p as Record<string, string | null>]))
  const vendaDe = new Map((vendas ?? []).map((v) => [String((v as { id: string }).id), v as Record<string, string | null>]))

  return {
    quantas: linhas.length,
    totalCents,
    fila: recorte.map((l) => {
      const bid = String(l.beneficiario_id ?? '')
      const v = vendaDe.get(String(l.venda_id ?? ''))
      return {
        id: String(l.id ?? ''),
        beneficiarioId: bid,
        quem: nomeMostravel(perfilDe.get(bid) ? { ...perfilDe.get(bid), id: bid } : { id: bid }),
        papel: String(l.papel ?? '—'),
        valorCents: Number(l.valor_cents) || 0,
        moeda: String(l.moeda ?? 'EUR'),
        pct: l.pct == null ? null : Number(l.pct),
        pack: (v?.pack as string | null) ?? null,
        referencia: (v?.referencia as string | null) ?? null,
        criadoIso: (l.criado_em as string | null) ?? null,
      }
    }),
  }
}

/** Pura: o cabeçalho da fila de comissões — o total a pagar é a frase que ele quer ler. */
export function textoComissoesResumo(r: { quantas: number; totalCents: number }): string {
  if (!r.quantas) return '💸 <b>Comissões</b>\n\nNada por aprovar. ✅'
  return (
    `💸 <b>Comissões por aprovar: ${r.quantas}</b>\n` +
    `Total em jogo: <b>${eur(r.totalCents)}</b>\n\n` +
    '<i>Aprovar NÃO paga: só autoriza. O pagamento fazes tu, e marca-se pago no /admin com a referência.</i>'
  )
}

/** Pura: uma comissão, com tudo o que decide a decisão. */
export function textoComissao(c: ComissaoPendente): string {
  return [
    `<b>${esc(c.quem)}</b> — ${esc(c.papel)}`,
    `Valor: <b>${eur(c.valorCents, c.moeda)}</b>${c.pct != null ? ` (${c.pct}%)` : ''}`,
    c.pack ? `Pack: ${esc(c.pack)}` : '',
    c.referencia ? `Venda: <code>${esc(String(c.referencia).slice(0, 40))}</code>` : '',
    `Nasceu ${desde(c.criadoIso)}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Pura: os botões de uma comissão. O primeiro toque é sempre `?` — perguntar. */
export function tecladoComissao(c: ComissaoPendente, voltar: Botao[]) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Aprovar', callback_data: `admin:cm?a:${c.id}` },
        { text: '❌ Recusar', callback_data: `admin:cm?c:${c.id}` },
      ],
      voltar,
    ],
  }
}

/**
 * Pura: a pergunta de uma comissão — e diz SEMPRE o valor e o nome de quem recebe.
 *
 * É a regra que o dono escreveu por palavras dele: «um botão que mexe em dinheiro pergunta duas
 * vezes, e a segunda mensagem diz o valor e o nome de quem recebe». Está aqui, e a guarda prova-o.
 */
export function confirmacaoComissao(p: { decisao: DecisaoComissao; c: ComissaoPendente }): Confirmacao {
  const aprovar = p.decisao === 'aprovada'
  return pedirConfirmacao({
    titulo: `${aprovar ? 'Aprovar' : 'Recusar'} ${eur(p.c.valorCents, p.c.moeda)} a ${p.c.quem}`,
    vaiAcontecer: aprovar
      ? [
          `A comissão de ${p.c.quem} (${p.c.papel}) fica APROVADA: ${eur(p.c.valorCents, p.c.moeda)}.`,
          'Passa a contar no extracto dela como autorizada.',
          'Fica registado em teu nome, com data.',
        ]
      : [
          `A comissão de ${p.c.quem} (${p.c.papel}) fica CANCELADA: ${eur(p.c.valorCents, p.c.moeda)}.`,
          'Sai do extracto dela e deixa de contar para pagamento.',
          'Fica registado em teu nome, com data.',
        ],
    naoVaiAcontecer: aprovar
      ? [
          'NÃO paga nada. Não há transferência, não há Stripe, não sai um cêntimo.',
          'Marcar como paga faz-se no /admin, com a referência do pagamento.',
        ]
      : ['Não apaga a linha nem o histórico — fica cancelada e visível.'],
    fazer: `admin:cm!${aprovar ? 'a' : 'c'}:${p.c.id}`,
    voltar: 'admin:eq_com',
    rotuloSim: aprovar ? '✅ Sim, aprovar' : '❌ Sim, recusar',
  })
}

export interface EstadoMlm {
  nos: number
  porRank: Array<{ nome: string; slug: string; quantos: number; residualPct: number; bonusUnico: number }>
  porPlano: Record<string, number>
  comissoesPorEstado: Record<string, number>
  pendentesCents: number
}

/** O estado do MLM: quantos nós, em que ranks, em que escada, e o que está pendente. */
export async function carregarEstadoMlm(supabase: Supa): Promise<EstadoMlm> {
  const [{ data: nos }, { data: ranks }, { data: coms }] = await Promise.all([
    supabase.from('mlm_nodes').select('rank_id, plano_rank').limit(5000),
    supabase.from('mlm_ranks').select('id, name, slug, residual_pct, bonus_unico, sort_order').order('sort_order'),
    supabase.from('mlm_commissions').select('status, amount').limit(5000),
  ])

  const contaRank = new Map<number, number>()
  const porPlano: Record<string, number> = {}
  for (const n of nos ?? []) {
    const x = n as { rank_id?: number | null; plano_rank?: string | null }
    const r = Number(x.rank_id ?? 0)
    contaRank.set(r, (contaRank.get(r) ?? 0) + 1)
    const plano = String(x.plano_rank ?? 'escada_pct_2026_09')
    porPlano[plano] = (porPlano[plano] ?? 0) + 1
  }

  const comissoesPorEstado: Record<string, number> = {}
  let pendentesCents = 0
  for (const c of coms ?? []) {
    const x = c as { status?: string | null; amount?: number | null }
    const e = String(x.status ?? 'pending')
    comissoesPorEstado[e] = (comissoesPorEstado[e] ?? 0) + 1
    if (e === 'pending') pendentesCents += Math.round((Number(x.amount) || 0) * 100)
  }

  return {
    nos: (nos ?? []).length,
    porRank: (ranks ?? []).map((r) => {
      const x = r as { id?: number; name?: string; slug?: string; residual_pct?: number; bonus_unico?: number }
      return {
        nome: String(x.name ?? x.slug ?? '?'),
        slug: String(x.slug ?? '?'),
        quantos: contaRank.get(Number(x.id ?? -1)) ?? 0,
        residualPct: Number(x.residual_pct ?? 0),
        bonusUnico: Number(x.bonus_unico ?? 0),
      }
    }),
    porPlano,
    comissoesPorEstado,
    pendentesCents,
  }
}

/** Pura: o estado do MLM em texto. */
export function textoMlm(e: EstadoMlm): string {
  return [
    `🌳 <b>MLM</b> — ${e.nos} nó${e.nos === 1 ? '' : 's'} na árvore`,
    '',
    '<b>Por rank:</b>',
    ...e.porRank.map(
      (r) => `• ${esc(r.nome)}: <b>${r.quantos}</b>${r.residualPct > 0 ? ` <i>(${r.residualPct}% residual)</i>` : ''}`,
    ),
    '',
    '<b>Por escada:</b>',
    ...Object.entries(e.porPlano)
      .sort((a, b) => b[1] - a[1])
      .map(([plano, n]) => `• <code>${esc(plano)}</code>: <b>${n}</b>`),
    '',
    `Comissões MLM pendentes: <b>${eur(e.pendentesCents)}</b>` +
      (e.comissoesPorEstado.pending ? ` (${e.comissoesPorEstado.pending} linha(s))` : ''),
    ...Object.entries(e.comissoesPorEstado)
      .filter(([k]) => k !== 'pending')
      .map(([k, n]) => `• ${esc(k)}: ${n}`),
  ]
    .filter(Boolean)
    .join('\n')
}

// ═══════════════════════════ PAPÉIS E PLANOS: AS PERGUNTAS ═══════════════════════════

/**
 * Pura: a pergunta de um papel.
 *
 * Um papel não é dinheiro directo, mas é a porta do backoffice e a chave das comissões que vão
 * nascer em nome dessa pessoa — por isso pergunta duas vezes pelas mesmas razões.
 */
export function confirmacaoPapel(p: { dar: boolean; papel: Papel; quem: string; userId: string }): Confirmacao {
  return pedirConfirmacao({
    titulo: `${p.dar ? 'Dar' : 'Retirar'} o papel de ${PAPEL_NOME[p.papel]} a ${p.quem}`,
    vaiAcontecer: p.dar
      ? [
          `${p.quem} passa a ser ${PAPEL_NOME[p.papel]} e entra no backoffice com esse papel.`,
          'Passa a poder nascer comissão em nome dela nesse papel.',
          'Fica registado em teu nome, com data.',
        ]
      : [
          `${p.quem} deixa de ser ${PAPEL_NOME[p.papel]}, e o efeito é imediato.`,
          'O histórico fica: a linha é marcada como retirada, não apagada.',
          'Fica registado em teu nome, com data.',
        ],
    naoVaiAcontecer: p.dar
      ? ['Não mexe nas comissões que já existem, nem paga nada.']
      : ['Não apaga comissões já ganhas — o que ela ganhou continua a ser dela.'],
    fazer: `admin:pp!${p.dar ? 'd' : 'r'}${PAPEL_CODIGO[p.papel]}:${p.userId}`,
    voltar: 'admin:eq_papeis',
    rotuloSim: p.dar ? '✅ Sim, dar' : '🚫 Sim, retirar',
  })
}

/** Pura: a pergunta de um plano de comissão. Muda quanto uma pessoa ganha — logo, dois toques. */
export function confirmacaoPlano(p: { plano: string; quem: string; userId: string; planoActual: string }): Confirmacao {
  const codigo = Object.entries(PLANO_CODIGO).find(([, v]) => v === p.plano)?.[0]
  return pedirConfirmacao({
    titulo: `Pôr ${p.quem} no plano ${p.plano}`,
    vaiAcontecer: [
      `${p.quem} passa de <code>${p.planoActual}</code> para <code>${p.plano}</code>.`,
      p.plano === 'afiliado_legado_50'
        ? 'Volta a ganhar à percentagem antiga (50%) nas vendas NOVAS.'
        : 'Passa a ganhar pelas percentagens do plano geral nas vendas NOVAS.',
      'Fica registado em teu nome, com data.',
    ],
    naoVaiAcontecer: [
      'Não recalcula comissões antigas: o que já foi calculado fica como está.',
      'Não paga nada.',
    ],
    fazer: `admin:pl!${codigo ?? '?'}:${p.userId}`,
    voltar: 'admin:eq_papeis',
    rotuloSim: '✅ Sim, mudar o plano',
  })
}

// ═══════════════════════════ OS TECLADOS DO SUBMENU ═══════════════════════════

/** O submenu. Ver primeiro, agir depois — é a ordem em que ele usa isto. */
export function tecladoEquipa(voltar: Botao[]) {
  return {
    inline_keyboard: [
      [
        { text: '👔 Equipa e papéis', callback_data: 'admin:eq_equipa' },
        { text: '📋 Pipeline', callback_data: 'admin:eq_pipe' },
      ],
      [
        { text: '💸 Comissões por aprovar', callback_data: 'admin:eq_com' },
        { text: '🌳 Estado do MLM', callback_data: 'admin:eq_mlm' },
      ],
      [{ text: '🎚️ Dar/retirar papel · mudar plano', callback_data: 'admin:eq_papeis' }],
      voltar,
    ],
  }
}

/**
 * Pura: os botões de uma pessoa da equipa — papéis que tem, papéis que pode ter, e o plano.
 *
 * Mostra-se o que ela TEM com 🚫 (retirar) e o que não tem com ➕ (dar): um teclado que mostrasse
 * os cinco papéis iguais obrigava a ler a mensagem para saber o que já está dado.
 */
export function tecladoPessoa(p: PessoaDaEquipa, voltar: Botao[]) {
  const linhas: Botao[][] = []
  for (let i = 0; i < PAPEIS.length; i += 2) {
    linhas.push(
      PAPEIS.slice(i, i + 2).map((papel) => {
        const tem = p.papeis.includes(papel)
        return {
          text: `${tem ? '🚫' : '➕'} ${PAPEL_NOME[papel]}`,
          callback_data: `admin:pp?${tem ? 'r' : 'd'}${PAPEL_CODIGO[papel]}:${p.userId}`,
        }
      }),
    )
  }
  const outro = p.plano === 'afiliado_legado_50' ? 'p' : 'l'
  linhas.push([
    {
      text: `💼 Plano → ${PLANO_CODIGO[outro]}`,
      callback_data: `admin:pl?${outro}:${p.userId}`,
    },
  ])
  linhas.push(voltar)
  return { inline_keyboard: linhas }
}

/** Pura: a folha de uma pessoa da equipa. */
export function textoPessoa(p: PessoaDaEquipa): string {
  return [
    `👤 <b>${esc(p.nome)}</b>`,
    p.email ? `<code>${esc(p.email)}</code>` : '',
    '',
    `Papéis: ${p.papeis.length ? p.papeis.map((x) => PAPEL_NOME[x]).join(', ') : '<i>nenhum</i>'}`,
    `Plano de comissão: <code>${esc(p.plano)}</code>`,
    p.desdeIso ? `Na equipa ${desde(p.desdeIso)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Pura: a lista de pessoas como botões, para escolher em quem mexer. */
export function tecladoEscolherPessoa(equipa: PessoaDaEquipa[], voltar: Botao[]) {
  const linhas: Botao[][] = equipa
    .slice(0, 24)
    .map((p) => [{ text: `${p.nome}${p.papeis.length ? ` · ${p.papeis.map((x) => PAPEL_NOME[x]).join('/')}` : ''}`.slice(0, 60), callback_data: `admin:eq_p:${p.userId}` }])
  linhas.push([{ text: '🌐 Papéis no /admin', url: `${process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.morethanmoney.pt'}/admin/backoffice` }])
  linhas.push(voltar)
  return { inline_keyboard: linhas }
}
