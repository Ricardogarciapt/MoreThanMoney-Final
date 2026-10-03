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
import { chaveAberturaAceite, escolherPosicaoMestre, estrategiaDoSinalT2T, type PosicaoMestreCandidata } from '../t2t'
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
    const slug = estrategiaDoSinalT2T(p.mensagem.channel_slug, p.mensagem.content)
    if (!slug) return nada()
    const db = getSupabaseAdmin()
    const [{ data: linha, error }, { data: cfg }] = await Promise.all([
      db.from('mestres_estrategias').select('*').ilike('slug', slug).maybeSingle(),
      db.from('site_settings').select('value').eq('key', 'mestres_motor').maybeSingle(),
    ])
    if (error || !linha) return nada()
    const est = lerEstrategiaMestre(linha)
    if (est.t2tModo === 'desligado') return nada()
    const global = lerConfigGlobal(cfg?.value)
    if (!global.ligado) return nada(est.t2tModo, 'motor das mestres desligado')
    // Kill: em live o motor não aceita nada; o T2T de sempre também não deve abrir às cegas — mas
    // o kill do motor não é o interruptor do T2T legado, por isso devolve-se e o legado decide.
    if (global.kill) return nada(est.t2tModo, 'kill-switch accionado')

    // posição da mestre que corresponde ao sinal
    const { data: cands } = await db.from('funded_positions').select('id, symbol, direcao, preco_entrada, aberta_em, estado, volume, sl, tp')
      .eq('account_id', est.contaMestreId).eq('estado', 'aberta').limit(50)
    const pos = escolherPosicaoMestre((cands ?? []) as PosicaoMestreCandidata[], {
      symbol: p.sinal.symbol, direcao: p.sinal.direction, entrada: p.sinal.entry,
      mensagemEm: p.mensagem.created_at ?? new Date().toISOString(), pip: pipDe(p.sinal.symbol),
    })
    if (!pos) return nada(est.t2tModo, 'sem posição aberta da mestre para este sinal — T2T de sempre')
    const posCompleta = (cands ?? []).find((c) => c.id === pos.id) as Record<string, unknown>

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
          pedido: { t2t: true, chat_message_id: p.chatMessageId, posicao_mestre: pos.id, symbol: p.sinal.symbol, direcao: p.sinal.direction, lote: lote.lote },
        })
        continue
      }

      // live: rota T2T (mestre SIM → esta conta), aceite, evento de abertura
      const base = {
        user_id: l.user_id, origem_tipo: 'mtmfunded', origem_ref: `prov:${est.providerId}`, origem_chave: `mtmfunded:${est.contaMestreId.toLowerCase()}`,
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
        payload: { symbol: posCompleta.symbol, direcao: posCompleta.direcao, volume: Number(posCompleta.volume), preco: Number(posCompleta.preco_entrada), sl: posCompleta.sl, tp: posCompleta.tp, origem: 't2t', chat_message_id: p.chatMessageId },
      })
      if (eEv && eEv.code !== '23505') { tratadas.push({ connectionId: l.id, account, ok: false, error: eEv.message }); continue }
      tratadas.push({ connectionId: l.id, account, ok: true })
    }
    return { modo: est.t2tModo, tratadas }
  } catch (e) {
    return nada('desligado', `erro: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** Contas onde o motor JÁ executou este trade (cópia da estratégia) — o T2T de sempre não repete. */
export async function contasJaExecutadasPeloMotor(contas: Ligacao[], sinal: { symbol: string; direction: 'buy' | 'sell'; entry: number | null }): Promise<Set<string>> {
  const out = new Set<string>()
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
    const impressoes = [agora, agora - 3600_000].flatMap((t) => entradas.map((e) => impressaoParaConta({ symbol: sinal.symbol, direcao: sinal.direction, entrada: e, em: t })))
    const { data, error } = await getSupabaseAdmin().from('mestres_execucoes_conta').select('conta_chave, impressao')
      .in('conta_chave', [...chaves.keys()]).in('impressao', impressoes)
    if (error) return out
    for (const r of data ?? []) { const id = chaves.get(String(r.conta_chave)); if (id) out.add(id) }
  } catch { /* sem a 116: nada */ }
  return out
}
