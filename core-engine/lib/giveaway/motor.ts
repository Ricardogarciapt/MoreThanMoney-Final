import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { randomBytes, createHash } from 'node:crypto'

/**
 * O MOTOR DOS GIVEAWAYS — três portas, um prémio.
 *
 * O objectivo não é sortear. É descobrir que mecânica traz mais gente e de que qualidade, para
 * a próxima campanha já não ser um palpite. Por isso o prémio é IGUAL nas três: repartir os dez
 * prémios mudava a oferta em cada porta, e nunca se saberia se a diferença veio da mecânica ou
 * de um prémio ser mais apetecível. Com o prémio constante, a única variável é a porta.
 *
 * Cada acção verificada vale bilhetes, e o peso fica GRAVADO na linha. Mudar o peso a meio da
 * campanha não pode reescrever o que já foi prometido a quem já participou — quem partilhou
 * ontem por três bilhetes não acorda com dois.
 */

export type TipoAccao =
  | 'entrada' | 'comentario' | 'seguir' | 'etiqueta'
  | 'story' | 'partilha' | 'referencia' | 'email' | 'broker'

export interface Mecanica {
  palavra: string
  entrada: { tipo: TipoAccao; bilhetes: number }
  extras: Array<{ tipo: TipoAccao; bilhetes: number; maximo: number }>
  pede_email: boolean
  hipotese: string
}

export interface ResultadoEntrada {
  ok: boolean
  erro?: string
  entryId?: string
  bilhetes?: number
  codigo?: string
  jaEstava?: boolean
}

/**
 * Um código curto, legível ao telefone e sem letras que se confundem.
 *
 * Sem `I`, `O`, `1` e `0`: este código é ditado em stories e escrito à mão por quem o recebe, e
 * um `O` lido como zero manda a referência para o vazio — a pessoa que trouxe o amigo fica sem
 * o bilhete e ninguém percebe porquê.
 */
function gerarCodigo(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(6)
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('')
}

function normalizarHandle(h: string | null | undefined): string | null {
  const s = String(h ?? '').trim().replace(/^@+/, '').toLowerCase()
  return s.length >= 2 ? s : null
}

/**
 * Regista uma entrada. Idempotente: a mesma pessoa na mesma campanha devolve o que já tem.
 *
 * Carregar duas vezes no botão, ou o ManyChat reenviar o mesmo evento, não pode dar dois
 * conjuntos de bilhetes à mesma pessoa — e é isso que a chave única na base de dados garante,
 * não este código. Aqui só se trata o caso com jeito em vez de devolver um erro de duplicado.
 */
export async function registarEntrada(input: {
  giveawaySlug: string
  email?: string | null
  instagramHandle?: string | null
  telegramId?: string | null
  nome?: string | null
  userId?: string | null
  /** O código de quem a trouxe. */
  referencia?: string | null
}): Promise<ResultadoEntrada> {
  const db = getSupabaseAdmin()

  const { data: g } = await db
    .from('giveaways')
    .select('id, slug, estado, mecanica, acaba_em')
    .eq('slug', input.giveawaySlug)
    .maybeSingle()
  if (!g) return { ok: false, erro: 'campanha não encontrada' }
  if (g.estado !== 'a_decorrer') return { ok: false, erro: 'a campanha não está a decorrer' }
  if (new Date(g.acaba_em as string) < new Date()) return { ok: false, erro: 'a campanha já fechou' }

  const mecanica = g.mecanica as unknown as Mecanica
  const email = String(input.email ?? '').trim().toLowerCase() || null
  const handle = normalizarHandle(input.instagramHandle)

  if (mecanica.pede_email && !email) return { ok: false, erro: 'email obrigatório nesta campanha' }
  if (!email && !handle && !input.telegramId) return { ok: false, erro: 'sem forma de te identificar' }

  // ── já entrou? ────────────────────────────────────────────────────────────
  interface EntradaExistente { id: string; bilhetes: number; codigo_referencia: string }
  let existente: EntradaExistente | null = null
  if (email) {
    const { data } = await db.from('giveaway_entries')
      .select('id, bilhetes, codigo_referencia')
      .eq('giveaway_id', g.id).ilike('email', email).maybeSingle()
    existente = (data as EntradaExistente | null) ?? null
  }
  if (!existente && handle) {
    const { data } = await db.from('giveaway_entries')
      .select('id, bilhetes, codigo_referencia')
      .eq('giveaway_id', g.id).ilike('instagram_handle', handle).maybeSingle()
    existente = (data as EntradaExistente | null) ?? null
  }
  if (existente) {
    return {
      ok: true, jaEstava: true,
      entryId: existente.id, bilhetes: existente.bilhetes, codigo: existente.codigo_referencia,
    }
  }

  // ── quem a trouxe ─────────────────────────────────────────────────────────
  let trazidaPor: string | null = null
  if (input.referencia) {
    const { data: padrinho } = await db.from('giveaway_entries')
      .select('id').eq('giveaway_id', g.id)
      .eq('codigo_referencia', String(input.referencia).trim().toUpperCase())
      .maybeSingle()
    trazidaPor = (padrinho?.id as string) ?? null
  }

  const bilhetesIniciais = Math.max(1, Number(mecanica.entrada?.bilhetes ?? 1))
  const codigo = gerarCodigo()

  const { data: entrada, error } = await db.from('giveaway_entries').insert({
    giveaway_id: g.id,
    email, instagram_handle: handle,
    telegram_id: input.telegramId ?? null,
    user_id: input.userId ?? null,
    nome: input.nome ?? null,
    codigo_referencia: codigo,
    trazida_por: trazidaPor,
    bilhetes: bilhetesIniciais,
  }).select('id').single()

  if (error || !entrada) {
    // Corrida: alguém entrou entre a verificação e a escrita. Devolve-se o que existe.
    if (email || handle) {
      const q = db.from('giveaway_entries').select('id, bilhetes, codigo_referencia').eq('giveaway_id', g.id)
      const { data } = email ? await q.ilike('email', email).maybeSingle() : await q.ilike('instagram_handle', handle!).maybeSingle()
      if (data) return { ok: true, jaEstava: true, entryId: data.id, bilhetes: data.bilhetes, codigo: data.codigo_referencia }
    }
    return { ok: false, erro: error?.message ?? 'não foi possível registar' }
  }

  await db.from('giveaway_actions').insert({
    giveaway_id: g.id, entry_id: entrada.id,
    tipo: mecanica.entrada?.tipo ?? 'entrada',
    bilhetes: bilhetesIniciais, referencia: null,
  })

  // Quem trouxe ganha os bilhetes da referência — é o motor da variante C.
  if (trazidaPor) {
    await registarAccao({
      giveawaySlug: g.slug as string,
      entryId: trazidaPor,
      tipo: 'referencia',
      referencia: entrada.id,
    }).catch(() => undefined)
  }

  return { ok: true, entryId: entrada.id, bilhetes: bilhetesIniciais, codigo }
}

/**
 * Acrescenta uma acção a quem já entrou, e soma os bilhetes.
 *
 * O tecto de cada tipo vive na mecânica: etiquetar trinta amigos não pode valer trinta bilhetes,
 * ou a campanha passa a premiar quem faz spam em vez de quem traz gente.
 */
export async function registarAccao(input: {
  giveawaySlug: string
  entryId: string
  tipo: TipoAccao
  referencia?: string | null
}): Promise<{ ok: boolean; erro?: string; bilhetes?: number; ganhou?: number }> {
  const db = getSupabaseAdmin()

  const { data: g } = await db.from('giveaways')
    .select('id, estado, mecanica, acaba_em').eq('slug', input.giveawaySlug).maybeSingle()
  if (!g) return { ok: false, erro: 'campanha não encontrada' }
  if (g.estado !== 'a_decorrer') return { ok: false, erro: 'a campanha não está a decorrer' }

  const mecanica = g.mecanica as unknown as Mecanica
  const regra = (mecanica.extras ?? []).find((e) => e.tipo === input.tipo)
  if (!regra) return { ok: false, erro: `a acção «${input.tipo}» não conta nesta campanha` }

  const { count: jaTem } = await db.from('giveaway_actions')
    .select('id', { count: 'exact', head: true })
    .eq('entry_id', input.entryId).eq('tipo', input.tipo)
  if ((jaTem ?? 0) >= regra.maximo) {
    return { ok: true, ganhou: 0, erro: `já atingiste o máximo de ${regra.maximo}` }
  }

  const { error } = await db.from('giveaway_actions').insert({
    giveaway_id: g.id,
    entry_id: input.entryId,
    tipo: input.tipo,
    bilhetes: regra.bilhetes,
    referencia: input.referencia ?? null,
  })
  // Chave única: esta acção já tinha sido contada. Não é erro, é a defesa a funcionar.
  if (error) return { ok: true, ganhou: 0, erro: 'essa acção já tinha sido contada' }

  const { data: total } = await db.from('giveaway_actions')
    .select('bilhetes').eq('entry_id', input.entryId)
  const soma = (total ?? []).reduce((a, l) => a + Number(l.bilhetes ?? 0), 0)

  await db.from('giveaway_entries')
    .update({ bilhetes: soma, updated_at: new Date().toISOString() })
    .eq('id', input.entryId)

  return { ok: true, ganhou: regra.bilhetes, bilhetes: soma }
}

/**
 * O SORTEIO, reproduzível.
 *
 * Cada bilhete é um bilhete: quem tem dez tem dez hipóteses. A semente fica gravada com o
 * resultado, e a mesma semente sobre a mesma lista devolve os mesmos vencedores — um sorteio
 * que ninguém pode reconstruir é um sorteio em que é preciso acreditar, e nós pedimos às pessoas
 * o email e a partilha, não fé.
 *
 * Ninguém ganha duas vezes: sai da urna quando é sorteado.
 */
export async function sortear(opts: {
  /** Sortear entre estas campanhas — as três, por omissão. */
  slugs?: string[]
  semente?: string
  confirmar?: string
}): Promise<{ ok?: boolean; ensaio?: boolean; erro?: string; vencedores?: Array<Record<string, unknown>> }> {
  const db = getSupabaseAdmin()
  const semente = opts.semente ?? new Date().toISOString().slice(0, 10)

  const { data: gs } = await db.from('giveaways')
    .select('id, slug, nome, estado')
    .in('slug', opts.slugs ?? ['lancamento-porta-larga', 'lancamento-porta-estreita', 'lancamento-amplificacao'])
  if (!gs?.length) return { erro: 'campanhas não encontradas' }

  const { data: entradas } = await db.from('giveaway_entries')
    .select('id, nome, email, instagram_handle, bilhetes, giveaway_id')
    .in('giveaway_id', gs.map((g) => g.id))
    .eq('validada', true)
  if (!entradas?.length) return { erro: 'não há entradas válidas' }

  const { data: premios } = await db.from('giveaway_prizes')
    .select('id, slug, nome, quantidade').order('ordem')

  // A urna: uma pessoa com N bilhetes aparece N vezes.
  let urna: string[] = []
  for (const e of entradas) urna.push(...Array(Math.max(1, Number(e.bilhetes))).fill(e.id as string))

  /** Aleatório determinístico: mesma semente, mesma sequência. */
  let contador = 0
  const proximo = (limite: number): number => {
    const h = createHash('sha256').update(`${semente}:${contador++}`).digest()
    return h.readUInt32BE(0) % limite
  }

  const vencedores: Array<Record<string, unknown>> = []
  const jaGanharam = new Set<string>()

  for (const p of premios ?? []) {
    for (let i = 0; i < Number(p.quantidade); i++) {
      const disponivel = urna.filter((id) => !jaGanharam.has(id))
      if (!disponivel.length) break
      const escolhido = disponivel[proximo(disponivel.length)]
      jaGanharam.add(escolhido)
      const e = entradas.find((x) => x.id === escolhido)!
      vencedores.push({
        premio: p.nome, premioId: p.id, entryId: e.id,
        nome: e.nome, email: e.email, instagram: e.instagram_handle,
        bilhetes: e.bilhetes,
        campanha: gs.find((g) => g.id === e.giveaway_id)?.slug,
      })
    }
  }

  if (opts.confirmar !== 'SIM-SORTEAR') {
    return { ensaio: true, vencedores }
  }

  for (const v of vencedores) {
    await db.from('giveaway_winners').insert({
      prize_id: v.premioId, entry_id: v.entryId,
      giveaway_id: entradas.find((x) => x.id === v.entryId)!.giveaway_id,
      semente,
    })
  }
  await db.from('giveaways').update({ estado: 'sorteado', updated_at: new Date().toISOString() })
    .in('id', gs.map((g) => g.id))

  return { ok: true, vencedores }
}
