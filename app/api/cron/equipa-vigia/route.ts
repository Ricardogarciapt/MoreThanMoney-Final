import { NextRequest, NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { sendTelegramChannelMessage } from '@/lib/mtmcopy/telegram-bot'
import { chatDeAdminDoAmbiente } from '@/lib/telegram-admin-menu'
import {
  chaveComissao,
  chaveNegocioParado,
  chaveRank,
  decidirAvisos,
  semanasParadas,
  textoComissoesNovas,
  textoNegociosParados,
  textoRanksSubidos,
  type Candidato,
} from '@/lib/telegram-admin-equipa-avisos'
import { nomeMostravel } from '@/lib/telegram-admin-equipa'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * O VIGIA DA EQUIPA — o que o dono tem de saber sem ir procurar.
 *
 * Três avisos, e não mais: comissão nova (alguém trabalhou e está à espera de um sim), negócio
 * parado (dinheiro a evaporar-se em silêncio), subida de rank (boa notícia, e uma mudança no que
 * se lhe paga). Todos vão para o chat dele e para mais nenhum.
 *
 * O QUE ISTO NÃO FAZ, e é o mais importante: não decide nada. Não aprova uma comissão, não move um
 * negócio, não paga. Um cron que agisse sobre dinheiro sem ninguém confirmar era exactamente o
 * contrário da regra da casa — e é por isso que este pode correr sozinho: só diz frases.
 *
 * A memória de «já disse isto» está em `bot_avisos_enviados` (migração 132). Se a tabela ainda não
 * existir, o vigia CALA-SE em vez de avisar: sem memória, avisar é repetir para sempre, e um aviso
 * repetido treina a pessoa a ignorar avisos.
 *
 * A primeira corrida de cada família SEMEIA em silêncio — ver `decidirAvisos`. Um vigia novo
 * encontra o mundo inteiro por avisar, e a primeira coisa que o dono veria era uma parede de
 * mensagens sobre coisas antigas.
 */
const TABELA = 'bot_avisos_enviados'

/** Uma folga antes de gritar por uma comissão: uma venda a ser processada gera linhas em rajada. */
const MINUTOS_DE_FOLGA = 10

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = getSupabaseAdmin()
  const chat = chatDeAdminDoAmbiente()
  const agora = Date.now()

  // Sem memória não se avisa. Uma leitura falhada aqui é indistinguível de «a tabela não existe»,
  // e nos dois casos a resposta certa é calar — não é repetir.
  const memoria = await db.from(TABELA).select('chave, tipo').limit(5000)
  if (memoria.error) {
    return NextResponse.json(
      { ok: false, calado: true, porque: 'sem a tabela dos avisos (migração 132 por aplicar?)', erro: memoria.error.message },
      { status: 200 },
    )
  }
  const jaAvisadas = new Set((memoria.data ?? []).map((l) => String((l as { chave: string }).chave)))
  const tiposVistos = new Set((memoria.data ?? []).map((l) => String((l as { tipo: string }).tipo)))

  const marcar: Array<{ chave: string; tipo: string; alvo: string }> = []
  const enviados: string[] = []
  const semeados: string[] = []

  /**
   * Decide, manda, e só depois aponta na memória.
   *
   * A ordem é a única que não perde avisos: se a memória fosse marcada antes do envio, uma falha
   * do Telegram calava aquele aviso PARA SEMPRE — ele ficava «já dado» sem nunca ter chegado.
   * Assim, um envio falhado deixa as chaves por marcar e a corrida seguinte tenta outra vez.
   */
  const tratar = async (tipo: string, candidatos: Candidato[], texto: (cs: Candidato[]) => string) => {
    const d = decidirAvisos({ candidatos, jaAvisadas, jaVistoAlgumaVez: tiposVistos.has(tipo) })
    if (d.aAvisar.length) {
      const r = await sendTelegramChannelMessage(chat, texto(d.aAvisar), { parseMode: 'HTML' })
      if (!r.ok) {
        console.error(`[equipa-vigia] ${tipo}: o aviso não saiu —`, r.error ?? 'sem razão')
        return
      }
      enviados.push(`${tipo}:${d.aAvisar.length}`)
    } else if (d.semeou && d.aMarcar.length) {
      semeados.push(`${tipo}:${d.aMarcar.length}`)
    }
    for (const chave of d.aMarcar) marcar.push({ chave, tipo, alvo: chave.split(':')[1] ?? '' })
  }

  // ── 1. COMISSÕES NOVAS ────────────────────────────────────────────────────────────────────────
  {
    const { data } = await db
      .from('vendas_comissoes')
      .select('id, beneficiario_id, papel, valor_cents, criado_em')
      .eq('estado', 'pendente')
      .order('criado_em', { ascending: false })
      .limit(200)
    const linhas = (data ?? []).filter((l) => {
      const t = Date.parse(String((l as { criado_em?: string }).criado_em ?? ''))
      return !Number.isFinite(t) || agora - t > MINUTOS_DE_FOLGA * 60_000
    })
    const ids = [...new Set(linhas.map((l) => String((l as { beneficiario_id?: string }).beneficiario_id)).filter(Boolean))]
    const { data: perfis } = ids.length
      ? await db.from('profiles').select('id, email, username, full_name').in('id', ids)
      : { data: [] }
    const perfilDe = new Map((perfis ?? []).map((p) => [String((p as { id: string }).id), p as Record<string, string | null>]))

    const candidatos: Candidato[] = linhas.map((l) => {
      const x = l as { id: string; beneficiario_id: string; papel: string; valor_cents: number }
      const p = perfilDe.get(String(x.beneficiario_id))
      const quem = nomeMostravel(p ? { ...p, id: String(x.beneficiario_id) } : { id: String(x.beneficiario_id) })
      const v = (Number(x.valor_cents) || 0) / 100
      return {
        chave: chaveComissao(String(x.id)),
        linha: `${quem} — ${v.toFixed(2)} € (${x.papel})`,
        valorCents: Number(x.valor_cents) || 0,
      }
    })
    await tratar('comissao_nova', candidatos, textoComissoesNovas)
  }

  // ── 2. NEGÓCIOS PARADOS ───────────────────────────────────────────────────────────────────────
  {
    const { data } = await db
      .from('vendas_negocios')
      .select('id, nome, estado, atualizado_em')
      .not('estado', 'in', '("ganho","perdido")')
      .order('atualizado_em', { ascending: true })
      .limit(500)
    const candidatos: Candidato[] = []
    for (const n of data ?? []) {
      const x = n as { id: string; nome: string; estado: string; atualizado_em?: string }
      const semanas = semanasParadas(x.atualizado_em, agora)
      if (semanas < 1) continue
      candidatos.push({
        chave: chaveNegocioParado(String(x.id), semanas),
        linha: `${x.nome} — ${x.estado}, parado há ${semanas} semana${semanas === 1 ? '' : 's'}`,
      })
    }
    await tratar('negocio_parado', candidatos, textoNegociosParados)
  }

  // ── 3. SUBIDAS DE RANK ────────────────────────────────────────────────────────────────────────
  //
  // A subida deduz-se da AUSÊNCIA de aviso para o rank actual, e não de uma comparação com um
  // valor anterior guardado à parte: um segundo sítio a guardar «o rank de ontem» era um segundo
  // sítio a poder divergir do `mlm_nodes`, que é onde o rank vive.
  {
    const [{ data: nos }, { data: ranks }] = await Promise.all([
      db.from('mlm_nodes').select('user_id, rank_id').gt('rank_id', 1).limit(2000),
      db.from('mlm_ranks').select('id, name'),
    ])
    const nomeDoRank = new Map((ranks ?? []).map((r) => [Number((r as { id: number }).id), String((r as { name?: string }).name ?? '?')]))
    const ids = [...new Set((nos ?? []).map((n) => String((n as { user_id?: string }).user_id)).filter(Boolean))]
    const { data: perfis } = ids.length
      ? await db.from('profiles').select('id, email, username, full_name').in('id', ids)
      : { data: [] }
    const perfilDe = new Map((perfis ?? []).map((p) => [String((p as { id: string }).id), p as Record<string, string | null>]))

    const candidatos: Candidato[] = (nos ?? []).map((n) => {
      const x = n as { user_id: string; rank_id: number }
      const p = perfilDe.get(String(x.user_id))
      const quem = nomeMostravel(p ? { ...p, id: String(x.user_id) } : { id: String(x.user_id) })
      return {
        chave: chaveRank(String(x.user_id), Number(x.rank_id)),
        linha: `${quem} → ${nomeDoRank.get(Number(x.rank_id)) ?? `rank ${x.rank_id}`}`,
      }
    })
    await tratar('rank_subiu', candidatos, textoRanksSubidos)
  }

  // A memória grava-se DEPOIS de a mensagem sair, e com `ignoreDuplicates`: duas corridas ao mesmo
  // tempo (a da Vercel e um toque do painel) não podem rebentar uma na outra.
  if (marcar.length) {
    const { error } = await db.from(TABELA).upsert(marcar, { onConflict: 'chave', ignoreDuplicates: true })
    if (error) console.error('[equipa-vigia] não gravei a memória dos avisos:', error.message)
  }

  return NextResponse.json({ ok: true, enviados, semeados, marcadas: marcar.length })
}
