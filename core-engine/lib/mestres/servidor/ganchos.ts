/**
 * OS GANCHOS DO MOTOR DAS MESTRES — ligam o motor da cópia (lib/copia-contas/motor) às regras de
 * lib/mestres e à base: decisão live/sombra, guardas de abertura, registo de cada ordem, falhas e
 * alertas. Usado só pelo serviço do VPS (services/copia-contas/servico.ts) nas rotas `mestres=true`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { aberturaAtrasada, aposResultado, eFalhaTecnica, motivoExposicao, riscoPctDaPosicao, type PosicaoAbertaConta } from '../decisao'
import { conflitoEntreCaminhos, impressaoParaConta, type ExecucaoRecente } from '../dedupe'
import { lerRef } from '../../copia-contas/regras'
import { distanciaDoSl } from '../../copia-contas/calculo'
import type { GanchosMotor, RegistoOrdemMotor } from '../../copia-contas/motor'
import type { EventoCopia } from '../../copia-contas/tipos'
import { travaDaContaDestino } from './trava-tipo-conta'
import type { EstadoMestres, RotaMestres } from './estado'

export interface OpcoesGanchos {
  db: SupabaseClient
  estado: EstadoMestres
  log: (...a: unknown[]) => void
  /** falhas técnicas seguidas numa conta até ao alerta */
  falhasAlerta: number
  /** falhas técnicas seguidas até bloquear as ABERTURAS dessa conta (0 = nunca) */
  falhasBloqueio: number
  /** envio do alerta para fora (Telegram do admin); opcional */
  avisar?: (texto: string) => Promise<void>
}

const agoraIso = () => new Date().toISOString()
const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

// ── pausa do cliente (lida da conta de destino; cache 15 s) ─────────────────
const cachePausa = new Map<string, { motivo: string | null; em: number }>()

export async function pausaDoCliente(db: SupabaseClient, rota: RotaMestres): Promise<string | null> {
  const c = cachePausa.get(rota.id)
  if (c && Date.now() - c.em < 15_000) return c.motivo
  const r = lerRef(rota.destino_ref)
  let motivo: string | null = null
  if (r?.origem === 'site') {
    const { data } = await db.from('mtmcopy_connections').select('is_active, mt5_status').eq('id', r.id).maybeSingle()
    if (!data) motivo = 'ligação apagada'
    else if (data.is_active === false) motivo = 'ligação pausada pelo cliente'
    else if (data.mt5_status === 'disconnected') motivo = 'ligação desligada'
  } else if (r?.origem === 'auto') {
    const { data } = await db.from('mtmauto_accounts').select('copia_ativa, estado').eq('id', r.id).maybeSingle()
    if (!data) motivo = 'conta MTM Auto apagada'
    else if (data.copia_ativa === false) motivo = 'cópia pausada na conta MTM Auto'
    if (!motivo && rota.tipo_rota !== 't2t' && rota.estrategia_slug) {
      const { data: prov } = await db.from('mtmauto_providers').select('id').ilike('slug', rota.estrategia_slug).maybeSingle()
      if (prov) {
        const { data: sub } = await db.from('mtmauto_subscriptions').select('ativo').eq('user_id', rota.user_id).eq('provider_id', prov.id).limit(1).maybeSingle()
        if (!sub || sub.ativo === false) motivo = 'subscrição inactiva'
      }
    }
  }
  cachePausa.set(rota.id, { motivo, em: Date.now() })
  return motivo
}

// ── exposição da conta (todas as rotas do motor para a mesma conta física) ───
async function abertasDaConta(db: SupabaseClient, contaChave: string, sombra: boolean): Promise<PosicaoAbertaConta[]> {
  const { data: rotas } = await db.from('copia_rotas').select('id').eq('destino_chave', contaChave).eq('mestres', true)
  const ids = (rotas ?? []).map((r) => r.id)
  if (!ids.length) return []
  const estados = sombra ? ['sombra'] : ['enviando', 'aberta']
  const { data } = await db.from('copia_posicoes').select('volume_destino_abertura, fechado_pct, risco_pct').in('rota_id', ids).in('estado', estados).limit(500)
  return (data ?? []).map((c) => ({
    volume: Number(c.volume_destino_abertura ?? 0) * (1 - Number(c.fechado_pct ?? 0)),
    riscoPct: num((c as { risco_pct?: unknown }).risco_pct),
  }))
}

// ── o mesmo trade por outro caminho ──────────────────────────────────────────
async function execucoesRecentes(db: SupabaseClient, rota: RotaMestres): Promise<ExecucaoRecente[]> {
  const desde = new Date(Date.now() - 30 * 60_000).toISOString()
  const out: ExecucaoRecente[] = []
  const r = lerRef(rota.destino_ref)
  if (r?.origem === 'site') {
    const { data } = await db.from('mtmcopy_signal_log').select('symbol, direction, entry, created_at, status')
      .eq('connection_id', r.id).gte('created_at', desde).in('status', ['open', 'ok', 'pending', 'filled', 'active', 'executed']).limit(50)
    for (const l of data ?? []) {
      if (!l.symbol || (l.direction !== 'buy' && l.direction !== 'sell')) continue
      out.push({ symbol: String(l.symbol), direcao: l.direction, entrada: num(l.entry), em: Date.parse(String(l.created_at)), origem: 'o Tap to Trade do site' })
    }
  }
  return out
}

/** Chave única de uma execução na conta física (o anti-duplicado entre caminhos). false = já existia. */
export async function reclamarExecucao(db: SupabaseClient, p: { contaChave: string; impressao: string; origem: 'estrategia' | 't2t' | 'legado'; ref: string }): Promise<boolean> {
  const { error } = await db.from('mestres_execucoes_conta').insert({ conta_chave: p.contaChave, impressao: p.impressao, origem: p.origem, ref: p.ref })
  if (error?.code === '23505') return false
  if (error) throw new Error(`reclamar execução: ${error.message}`)
  return true
}

// ── registo ──────────────────────────────────────────────────────────────────
function linhaDoRegisto(r: RegistoOrdemMotor, estrategia: string | null) {
  const origem = Date.parse(r.ev.origem_em ?? r.ev.criado_em)
  return {
    chave: r.sufixo ? `${r.ev.chave}:${r.sufixo}` : r.ev.chave,
    evento_id: r.ev.id, rota_id: r.rota.id, estrategia, conta_chave: r.rota.destino_chave, conta_ref: r.rota.destino_ref,
    tipo: r.tipo, modo: r.modo, estado: r.estado, pedido: r.pedido, resposta: r.resposta ?? null,
    erro: r.erro ? String(r.erro).slice(0, 500) : null, latencia_corretora_ms: r.latenciaCorretoraMs ?? null,
    latencia_total_ms: r.estado === 'ok' && Number.isFinite(origem) ? Math.max(0, Date.now() - origem) : null,
    atualizado_em: agoraIso(),
  }
}

export function criarGanchosMestres(o: OpcoesGanchos, rota: RotaMestres, ev: EventoCopia): GanchosMotor {
  const { db, estado, log } = o
  const est = estado.estrategiaDaRota(rota)
  // risco da abertura calculado na guarda, gravado na cópia depois (para a exposição seguinte)
  let riscoDaAbertura: number | null = null

  const contarResultado = async (sucesso: boolean, erro: string | null) => {
    if (!sucesso && !eFalhaTecnica(erro)) return
    const conta = estado.contaDaRota(rota)
    const r = aposResultado(conta.falhasSeguidas, sucesso, o.falhasAlerta, o.falhasBloqueio)
    if (sucesso && conta.falhasSeguidas === 0) return
    conta.falhasSeguidas = r.falhasSeguidas
    estado.contas.set(conta.contaChave, conta)
    const patch: Record<string, unknown> = { conta_chave: conta.contaChave, conta_ref: rota.destino_ref, user_id: rota.user_id, falhas_seguidas: r.falhasSeguidas }
    if (!sucesso) { patch.ultima_falha_em = agoraIso(); patch.ultima_falha = String(erro ?? '').slice(0, 300) }
    if (r.alertar) patch.alerta_em = agoraIso()
    if (r.bloquear) { patch.bloqueada_em = agoraIso(); patch.bloqueio_motivo = `${r.falhasSeguidas} falhas seguidas: ${String(erro ?? '').slice(0, 200)}` }
    await db.from('mestres_contas').upsert(patch, { onConflict: 'conta_chave' })
    if (r.alertar || r.bloquear) {
      const msg = `${r.bloquear ? 'BLOQUEADA (não abre)' : 'ALERTA'} · conta ${conta.contaChave} (${rota.destino_ref}) · ${r.falhasSeguidas} falhas seguidas · estratégia ${est?.slug ?? '?'} · última: ${String(erro ?? '').slice(0, 200)}`
      await db.from('mestres_alertas').insert({ tipo: r.bloquear ? 'conta_bloqueada' : 'falhas_conta', conta_chave: conta.contaChave, estrategia: est?.slug ?? null, mensagem: msg })
      log(`[mestres] ${msg}`)
      if (o.avisar) await o.avisar(`🚨 Motor das mestres\n${msg}`).catch(() => undefined)
    }
  }

  return {
    modo: () => estado.modo(rota).modo,
    podeEscrever: () => estado.podeEscrever(),
    gerirAbertasEmLive: () => estado.podeEscrever(),
    reancorar: true,

    async bloqueioAbertura({ acao, ctx, modo }) {
      const p = ev.payload
      // T2T: a rota só abre o que o cliente aceitou (a abertura do trigger é ignorada, sem rasto)
      if (rota.tipo_rota === 't2t') {
        const { data } = await db.from('mestres_t2t_aceites').select('aceite_em').eq('rota_id', rota.id).eq('origem_posicao_id', ev.origem_posicao_id).maybeSingle()
        if (!data) return { motivo: 'T2T: sinal não aceite por este cliente', gravarRecusa: false }
      }
      const atraso = aberturaAtrasada(ev.origem_em, ev.criado_em, Date.now(), est?.maxAtrasoAberturaS ?? 30)
      if (atraso) return { motivo: atraso, gravarRecusa: true }
      if (rota.pausada_motivo) return { motivo: `pausada: ${rota.pausada_motivo}`, gravarRecusa: true }
      const pausa = await pausaDoCliente(db, rota)
      if (pausa) return { motivo: `pausada: ${pausa}`, gravarRecusa: true }
      const conta = estado.contaDaRota(rota)
      if (conta.bloqueada) return { motivo: `conta bloqueada: ${conta.bloqueioMotivo ?? 'falhas seguidas'}`, gravarRecusa: true }

      riscoDaAbertura = riscoPctDaPosicao({
        volume: acao.volume, distanciaSl: distanciaDoSl(acao.direcao, num(p.preco), num(p.sl)),
        valorPorPrecoPorLote: ctx?.valorPorPrecoPorLote ?? null, equity: ctx?.equity ?? null,
      })
      const abertas = await abertasDaConta(db, rota.destino_chave, modo === 'sombra')
      const exp = motivoExposicao(abertas, { volume: acao.volume, riscoPct: riscoDaAbertura }, conta)
      if (exp) return { motivo: exp, gravarRecusa: true }

      /**
       * A trava do TIPO da conta de destino (financiada 3 %/6 %, real 30 %) — ../trava-tipo-conta.ts.
       * Aqui e em mais sítio nenhum: é a guarda de ABERTURA. `registar` e os caminhos de saída não a
       * chamam, para que uma conta travada continue a receber parciais, BE, trailing e fechos.
       */
      const travaTipo = await travaDaContaDestino(db, rota, { equity: ctx?.equity ?? null })
      if (travaTipo) return { motivo: travaTipo, gravarRecusa: true }

      const conflito = conflitoEntreCaminhos(
        { symbol: acao.simbolo, direcao: acao.direcao, entrada: num(p.preco), agora: Date.now() },
        await execucoesRecentes(db, rota),
      )
      if (conflito) return { motivo: conflito, gravarRecusa: true }
      if (modo === 'live') {
        const impressao = impressaoParaConta({ symbol: String(p.symbol ?? acao.simbolo), direcao: acao.direcao, entrada: num(p.preco), em: ev.origem_em ?? ev.criado_em })
        const ok = await reclamarExecucao(db, { contaChave: rota.destino_chave, impressao, origem: rota.tipo_rota === 't2t' ? 't2t' : 'estrategia', ref: `${rota.id}:${ev.origem_posicao_id}` })
        if (!ok) return { motivo: 'duplicado: o mesmo trade já foi executado nesta conta por outro caminho do motor', gravarRecusa: true }
      }
      return null
    },

    async registar(r) {
      const linha = linhaDoRegisto(r, est?.slug ?? rota.estrategia_slug ?? null)
      if (r.modo === 'live' && r.estado !== 'enviando') {
        // a linha 'enviando' foi gravada antes da ordem: actualiza-a (unique chave em live)
        const { data } = await db.from('mestres_ordens').update(linha).eq('chave', linha.chave).eq('modo', 'live').select('id')
        if (!data?.length) await db.from('mestres_ordens').insert(linha)
      } else {
        const { error } = await db.from('mestres_ordens').insert(linha)
        // 23505 em live = esta ordem (evento × conta) já foi registada como enviada: nunca a segunda
        if (error?.code === '23505') throw new Error('ordem já registada para este evento nesta conta')
        if (error) log('[mestres] registo falhou', error.message)
      }
      if (r.tipo === 'abrir' && (r.estado === 'ok' || r.estado === 'sombra') && riscoDaAbertura != null) {
        await db.from('copia_posicoes').update({ risco_pct: Number(riscoDaAbertura.toFixed(4)) }).eq('rota_id', rota.id).eq('origem_posicao_id', ev.origem_posicao_id)
      }
      if (r.modo === 'live' && (r.estado === 'ok' || r.estado === 'erro' || r.estado === 'recusado') && !r.sufixo) {
        await contarResultado(r.estado === 'ok', r.erro ?? null)
      }
    },
  }
}
