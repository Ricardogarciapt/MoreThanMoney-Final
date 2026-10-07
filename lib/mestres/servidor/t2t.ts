/**
 * TAP TO TRADE PELO MOTOR — chamado pela rota /api/mtmcopy/tap-to-trade DEPOIS dos portões de sempre
 * (janela de 5 min / fora da zona, fonte permitida, sinal completo, contas T2T resolvidas pelo
 * fan-out). Nunca lança.
 *
 *  · t2t_modo desligado → não faz nada (o T2T de sempre executa).
 *  · sombra → regista em mestres_ordens o que o motor faria (rota, conta, posição da mestre) e deixa o
 *    T2T de sempre executar. Nada muda para o cliente.
 *  · live   → para cada conta T2T do cliente: rota T2T do motor (criada se faltar, sizing T2T da
 *    ligação), aceite gravado e evento de ABERTURA na outbox. O serviço do VPS abre na conta do
 *    cliente (≤ 1–2 s), com todas as guardas (kill-switch, exposição, duplicado entre caminhos,
 *    atraso) e a gestão da estratégia a partir daí. Essas contas saem do T2T de sempre.
 *    Sem posição da mestre para o sinal → devolve as contas intactas: o T2T de sempre trata.
 *
 * Também: `contasJaExecutadasPeloMotor` — o T2T de sempre não abre numa conta onde o motor já
 * executou o MESMO trade (cópia da estratégia), pelo registo `mestres_execucoes_conta`.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { chaveFisica } from '@/lib/copia-contas/regras'
import type { PlataformaCopia } from '@/lib/copia-contas/tipos'
import { impressaoParaConta } from '../dedupe'
import { loteDaLigacaoSite } from '../lote'
import { pipDe } from '../pips'
import { chaveAberturaAceite, posicaoMestreDoAceite, estrategiaDoSinalT2T, type PosicaoMestreCandidata } from '../t2t'
import { mapaCanalEstrategia } from '../canal-t2t'
import { candidatasDosFactos, origemT2TDoProvider, refDaPosicao, type FactoOrigem, type ProviderParaSeguir } from '../seguir-mestre'
import { lerConfigGlobal, lerEstrategiaMestre, type ModoEstrategia } from '../tipos'

type Ligacao = Record<string, unknown> & { id: string; user_id: string }

export interface PedidoT2TMotor {
  userId: string
  chatMessageId: string
  mensagem: { channel_slug: string | null; content: string | null; created_at: string | null }
  sinal: { symbol: string; direction: 'buy' | 'sell'; entry: number | null }
  contas: Ligacao[]
}

export interface ResultadoT2TMotor {
  modo: ModoEstrategia
  /** contas que o MOTOR vai executar (live) — saem do T2T de sempre */
  tratadas: Array<{ connectionId: string; account: string; ok: boolean; skipped?: boolean; error?: string }>
  motivo?: string
  /** a estratégia do sinal aceite (quando se soube) — para a deduplicação por estratégia */
  estrategia?: string | null
}

const nada = (modo: ModoEstrategia = 'desligado', motivo?: string): ResultadoT2TMotor => ({ modo, tratadas: [], motivo })

function plataformaDa(l: Ligacao): PlataformaCopia | null {
  const p = String(l.mt5_platform ?? 'mt5').toLowerCase()
  if (p === 'mtmfunded' || l.funded_account_id) return null
  if (l.tl_account_id) return 'tradelocker'
  return p === 'mt4' ? 'mt4' : 'mt5'
}

export async function encaminharT2TParaMotor(p: PedidoT2TMotor): Promise<ResultadoT2TMotor> {
  try {
    const db = getSupabaseAdmin()
    // canal → estratégia derivado dos providers (um provider novo entra sem mexer no código)
    const { data: provs } = await db.from('mtmauto_providers').select('slug, canal_chat, fonte_mtm, apagado_em').is('apagado_em', null).limit(500)
    const slug = estrategiaDoSinalT2T(p.mensagem.channel_slug, p.mensagem.content, mapaCanalEstrategia((provs ?? []) as never))
    if (!slug) return nada()
    const [{ data: linha, error }, { data: cfg }] = await Promise.all([
      db.from('mestres_estrategias').select('*').ilike('slug', slug).maybeSingle(),
      db.from('site_settings').select('value').eq('key', 'mestres_motor').maybeSingle(),
    ])
    if (error || !linha) return nada()
    const est = lerEstrategiaMestre(linha)
    if (est.t2tModo === 'desligado') return { ...nada(), estrategia: est.slug }
    const global = lerConfigGlobal(cfg?.value)
    if (!global.ligado) return { ...nada(est.t2tModo, 'motor das mestres desligado'), estrategia: est.slug }
    // Kill: em live o motor não aceita nada; o T2T de sempre também não deve abrir às cegas — mas
    // o kill do motor não é o interruptor do T2T legado, por isso devolve-se e o legado decide.
    if (global.kill) return { ...nada(est.t2tModo, 'kill-switch accionado'), estrategia: est.slug }

    // F4: a ORIGEM é a conta que opera — mestre SIM (fpos:), conta MT do educador (pos:) ou TL (tlpos:)
    const { data: provLinha } = await db.from('mtmauto_providers')
      .select('id, tipo, plataforma, login, servidor, metaapi_account_id, tl_env, tl_account_id, funded_account_id, fonte_execucao, espelho_funded_account_id')
      .eq('id', est.providerId).maybeSingle()
    const origem = origemT2TDoProvider((provLinha ?? { id: est.providerId, tipo: 'mtmfunded' }) as ProviderParaSeguir, est.contaMestreId)

    // posição da mestre que corresponde ao sinal
    let cands: Array<Record<string, unknown>> = []
    if (origem.fonte === 'funded') {
      const { data } = await db.from('funded_positions').select('id, symbol, direcao, preco_entrada, aberta_em, estado, volume, sl, tp')
        .eq('account_id', origem.contaFunded!).eq('estado', 'aberta').limit(50)
      cands = (data ?? []) as Array<Record<string, unknown>>
    } else {
      // conta MT/TL: as posições vêm dos factos que o streaming do VPS já publicou para esta origem
      const { data: rotasOrigem } = await db.from('copia_rotas').select('id').eq('origem_chave', origem.origem_chave).limit(50)
      const ids = (rotasOrigem ?? []).map((r) => String(r.id))
      const { data: factos } = ids.length
        ? await db.from('copia_eventos').select('origem_posicao_id, tipo, payload, origem_em, criado_em').in('rota_id', ids)
          .gte('criado_em', new Date(Date.now() - 24 * 3600_000).toISOString()).order('id', { ascending: false }).limit(2000)
        : { data: [] as FactoOrigem[] }
      cands = candidatasDosFactos((factos ?? []) as FactoOrigem[]) as unknown as Array<Record<string, unknown>>
    }
    // POR ID primeiro: a ponte do sinal (a mensagem aceite) diz qual é a posição da mestre (199).
    let posicaoPorId: string | null = null
    if (origem.fonte === 'funded' && p.chatMessageId) {
      const { data: ponte } = await db.from('funded_sinal_posicoes').select('funded_position_id')
        .eq('account_id', origem.contaFunded!).eq('chat_message_id', p.chatMessageId).not('funded_position_id', 'is', null).limit(2)
      if ((ponte ?? []).length === 1) posicaoPorId = String(ponte![0].funded_position_id)
    }
    const escolha = posicaoMestreDoAceite(cands as unknown as PosicaoMestreCandidata[], {
      symbol: p.sinal.symbol, direcao: p.sinal.direction, entrada: p.sinal.entry,
      mensagemEm: p.mensagem.created_at ?? new Date().toISOString(), pip: pipDe(p.sinal.symbol),
    }, posicaoPorId)
    const pos = escolha.pos
    if (!pos && escolha.motivo && !posicaoPorId) {
      // AMBÍGUO (várias posições servem): as contas saem do T2T de sempre SEM abrir — abrir às
      // cegas ao lado da mestre era a mesma mistura por outro caminho. Fica o motivo.
      return {
        modo: est.t2tModo,
        estrategia: est.slug,
        motivo: escolha.motivo,
        tratadas: p.contas.map((l) => ({ connectionId: String(l.id), account: String(l.account_label ?? l.id).slice(0, 40), ok: false, skipped: true, error: escolha.motivo! })),
      }
    }
    if (!pos) return { ...nada(est.t2tModo, escolha.motivo ?? `sem posição aberta da origem (${origem.fonte}) para este sinal — T2T de sempre`), estrategia: est.slug }
    const posCompleta = cands.find((c) => c.id === pos.id) as Record<string, unknown>
    const refPos = refDaPosicao(origem, pos.id)

    const tratadas: ResultadoT2TMotor['tratadas'] = []
    for (const l of p.contas) {
      const account = String(l.account_label ?? l.id).slice(0, 40)
      const plataforma = plataformaDa(l)
      const ref = `site:${l.id}`
      const chave = plataforma ? chaveFisica({ plataforma, login: l.mt5_login as string, servidor: l.mt5_server as string, tlEnv: l.tl_env as string, tlAccountId: l.tl_account_id as string, ref }) : null
      if (!plataforma || !chave) continue
      const lote = loteDaLigacaoSite(l as never, { t2t: true, fonteT2T: p.mensagem.channel_slug })
      if (!lote.ok) continue

      if (est.t2tModo === 'sombra') {
        await db.from('mestres_ordens').insert({
          chave: `t2t:${p.chatMessageId}:${l.id}`, rota_id: null, estrategia: est.slug, conta_chave: chave, conta_ref: ref,
          tipo: 'abrir', modo: 'sombra', estado: 'sombra',
          pedido: { t2t: true, chat_message_id: p.chatMessageId, posicao_mestre: pos.id, ref_posicao: refPos, origem: origem.origem_chave, symbol: p.sinal.symbol, direcao: p.sinal.direction, lote: lote.lote },
        })
        continue
      }

      // live: rota T2T (mestre SIM → esta conta), aceite, evento de abertura
      const base = {
        user_id: l.user_id, origem_tipo: origem.origem_tipo, origem_ref: `prov:${est.providerId}`, origem_chave: origem.origem_chave,
        destino_tipo: plataforma, destino_ref: ref, destino_chave: chave, rotulo: `T2T ${est.slug} → ${account}`,
        modo_lote: lote.lote.modo_lote, valor: lote.lote.valor, lote_max: lote.lote.lote_max, copiar_sl: lote.lote.copiar_sl, copiar_tp: lote.lote.copiar_tp,
        filtro_simbolos: [], mestres: true, tipo_rota: 't2t', estrategia_slug: est.slug, ativa: true, estado: 'aprovada', modo: 'shadow',
        aprovada_em: new Date().toISOString(), notas: 'mestres 116 · T2T pelo motor',
      }
      let { data: rota } = await db.from('copia_rotas').select('id').eq('origem_chave', base.origem_chave).eq('destino_chave', chave).eq('tipo_rota', 't2t').neq('estado', 'recusada').maybeSingle()
      if (!rota) {
        const ins = await db.from('copia_rotas').insert(base).select('id').single()
        rota = ins.data
        if (ins.error) { tratadas.push({ connectionId: l.id, account, ok: false, error: `rota T2T: ${ins.error.message}` }); continue }
      } else {
        await db.from('copia_rotas').update({ modo_lote: base.modo_lote, valor: base.valor, copiar_sl: base.copiar_sl, copiar_tp: base.copiar_tp, ativa: true, pausada_motivo: null }).eq('id', rota.id)
      }
      const rotaId = String(rota!.id)
      const { error: eAceite } = await db.from('mestres_t2t_aceites').insert({ rota_id: rotaId, origem_posicao_id: pos.id, user_id: p.userId, chat_message_id: p.chatMessageId })
      if (eAceite?.code === '23505') { tratadas.push({ connectionId: l.id, account, ok: false, skipped: true, error: 'já aceite' }); continue }
      if (eAceite) { tratadas.push({ connectionId: l.id, account, ok: false, error: eAceite.message }); continue }
      const agora = new Date().toISOString()
      const { error: eEv } = await db.from('copia_eventos').insert({
        rota_id: rotaId, origem_posicao_id: pos.id, tipo: 'open', chave: chaveAberturaAceite(rotaId, pos.id), origem_em: agora,
        payload: { symbol: posCompleta.symbol, direcao: posCompleta.direcao, volume: Number(posCompleta.volume), preco: Number(posCompleta.preco_entrada), sl: posCompleta.sl, tp: posCompleta.tp, origem: 't2t', chat_message_id: p.chatMessageId, ref_posicao: refPos },
      })
      if (eEv && eEv.code !== '23505') { tratadas.push({ connectionId: l.id, account, ok: false, error: eEv.message }); continue }
      tratadas.push({ connectionId: l.id, account, ok: true })
    }
    return { modo: est.t2tModo, tratadas, estrategia: est.slug }
  } catch (e) {
    return nada('desligado', `erro: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** Contas onde o motor JÁ executou este trade (cópia da estratégia) — o T2T de sempre não repete. */
export async function contasJaExecutadasPeloMotor(
  contas: Ligacao[],
  sinal: { symbol: string; direction: 'buy' | 'sell'; entry: number | null },
  /**
   * A estratégia do sinal aceite (07/10). Só se recusa o T2T se o motor já executou o mesmo trade
   * DESTA estratégia na conta; o de outra estratégia é outra trade. Sem estratégia conhecida não há
   * execução do motor que seja «a mesma» — não se recusa.
   */
  estrategia: string | null,
): Promise<Set<string>> {
  const out = new Set<string>()
  if (!estrategia) return out
  try {
    const chaves = new Map<string, string>()
    for (const l of contas) {
      const plataforma = plataformaDa(l)
      const c = plataforma ? chaveFisica({ plataforma, login: l.mt5_login as string, servidor: l.mt5_server as string, tlEnv: l.tl_env as string, tlAccountId: l.tl_account_id as string, ref: `site:${l.id}` }) : null
      if (c) chaves.set(c, l.id)
    }
    if (!chaves.size) return out
    // a impressão é por HORA: verifica-se a hora actual e a anterior (sinal perto da viragem)
    const agora = Date.now()
    // e a entrada da mestre difere da do sinal pelo deslize: baldes vizinhos (±10 pips) também contam
    const pip = pipDe(sinal.symbol)
    const entradas = sinal.entry != null && sinal.entry > 0 ? [sinal.entry, sinal.entry - 10 * pip, sinal.entry + 10 * pip] : [null]
    const impressoes = [agora, agora - 3600_000].flatMap((t) => entradas.flatMap((e) => [
      impressaoParaConta({ symbol: sinal.symbol, direcao: sinal.direction, entrada: e, em: t, estrategia }),
      // TRANSIÇÃO: o serviço copia-contas do VPS (bundle de 24/09) ainda grava a impressão SEM
      // estratégia. Até ser reconstruído, essas linhas contam como «pode ser a mesma» (regra antiga,
      // do lado seguro). Depois do redeploy deixam de aparecer e isto não muda nada.
      impressaoParaConta({ symbol: sinal.symbol, direcao: sinal.direction, entrada: e, em: t }),
    ]))
    const { data, error } = await getSupabaseAdmin().from('mestres_execucoes_conta').select('conta_chave, impressao')
      .in('conta_chave', [...chaves.keys()]).in('impressao', impressoes)
    if (error) return out
    for (const r of data ?? []) { const id = chaves.get(String(r.conta_chave)); if (id) out.add(id) }
  } catch { /* sem a 116: nada */ }
  return out
}
