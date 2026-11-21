/**
 * REELS CINEMÁTICOS DIÁRIOS (20/11/2026, ordem do Ricardo): todo o reel do dia, nas duas marcas,
 * sai no molde AnuncioReel aprovado — gémeo HeyGen por baixo, edição completa por cima.
 *
 * Todos os dias o cron da Vercel (05:05 UTC, vercel.json) e o robô (.github/workflows/reels-cinematicos.yml,
 * cujos horários do GitHub chegam a atrasar horas) chamam
 * `pedirDoDia`: escolhe os próximos guiões ainda não feitos de `conteudo_magnetico_pecas` (os que os
 * agentes escrevem e aparecem no /estudio) e pede o clone à HeyGen. Quando a HeyGen acaba nasce o
 * projecto cinemático, o robô monta-o e o reel fica em RASCUNHO à espera do «Publicar» do Ricardo
 * (Telegram / briefing 9h30, lib/estudio/reel-aprovacao.ts). Nada sai sozinho.
 *
 * Interruptor: site_settings.reels_cinematicos = {"ligado": true, "por_dia": {"ricardo-garcia": 1, "morethanmoney": 1}, "reserva": 30}
 * `via` (20/11 23:51, escolha do Ricardo): 'mcp' (omissão) = o pedido fica em 'aguarda_mcp' e a rotina
 * diária das 04:30 UTC gera o gémeo com os créditos do PLANO HeyGen (a chave da API não tem saldo);
 * 'api' = pede direto à API v3 (precisa de saldo de API).
 * Sem linha = ligado com 1 + 1 por dia. `reserva` = créditos HeyGen que nunca se gastam (abaixo
 * disso não se pede nada e o Ricardo sabe pelo «Hoje»).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { heygenConfig } from './heygen'
import { pedirReelDoClone } from './clone-reel'

export const CHAVE_REELS_CINEMATICOS = 'reels_cinematicos'
export const MARCAS = ['ricardo-garcia', 'morethanmoney'] as const
type Marca = (typeof MARCAS)[number]
export type Interruptor = { ligado: boolean; porDia: Record<Marca, number>; reserva: number; via: 'api' | 'mcp'; alternar: boolean }

/**
 * 21/11/2026 (Ricardo, cartão): os gémeos alternam — um dia cada conta (1 gémeo por dia no total,
 * para os 78 créditos chegarem a 19/12). Dia par (dias desde 1970) → @ricardogarciapt; ímpar → MTM.
 */
export function marcaDoGemeo(d = new Date()): Marca {
  return MARCAS[Math.floor(d.getTime() / 86_400_000) % 2]
}

export function lerInterruptor(v: unknown): Interruptor {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, any>
  const pd = (o.por_dia && typeof o.por_dia === 'object' ? o.por_dia : {}) as Record<string, unknown>
  const n = (x: unknown, def: number) => (Number.isFinite(Number(x)) && Number(x) >= 0 ? Math.min(5, Math.floor(Number(x))) : def)
  return {
    ligado: o.ligado !== false,
    porDia: { 'ricardo-garcia': n(pd['ricardo-garcia'], 1), morethanmoney: n(pd.morethanmoney, 1) },
    via: o.via === 'api' ? 'api' : 'mcp',
    alternar: o.alternar === true,
    reserva: o.reserva !== undefined && Number.isFinite(Number(o.reserva)) ? Math.max(0, Number(o.reserva)) : 30,
  }
}

/** Créditos premium que restam na HeyGen (null se a API não disser). */
export async function creditosHeygen(): Promise<number | null> {
  const cfg = heygenConfig()
  if (!cfg) return null
  try {
    const r = await fetch('https://api.heygen.com/v2/user/remaining_quota', { headers: { 'x-api-key': cfg.chave }, signal: AbortSignal.timeout(8000) })
    const j = await r.json().catch(() => ({}))
    const q = Number(j?.data?.details?.premium_credits ?? j?.data?.remaining_quota)
    return Number.isFinite(q) ? q : null
  } catch {
    return null
  }
}

const temFalas = (g: any) => Array.isArray(g?.reel?.segmentos) && g.reel.segmentos.some((s: any) => String(s?.fala ?? '').trim())

/** Pede os reels de hoje (idempotente: conta os pedidos já feitos desde a meia-noite UTC). */
export async function pedirDoDia(db: SupabaseClient): Promise<Record<string, unknown>> {
  const { data: cfgRow } = await db.from('site_settings').select('value').eq('key', CHAVE_REELS_CINEMATICOS).maybeSingle()
  const cfg = lerInterruptor(cfgRow?.value)
  if (!cfg.ligado) return { ok: true, desligado: true }
  if (cfg.via === 'api' && !heygenConfig()) return { ok: false, erro: 'Falta a HEYGEN_API_KEY na Vercel.' }
  const creditos = cfg.via === 'api' ? await creditosHeygen() : null
  if (creditos !== null && creditos <= cfg.reserva) return { ok: true, sem_creditos: true, creditos, reserva: cfg.reserva }

  const hoje = new Date(); hoje.setUTCHours(0, 0, 0, 0)
  const { data: feitos } = await db.from('estudio_geracoes').select('params, criado_em').eq('origem', 'clone-reel').neq('estado', 'erro')
  const usados = new Set((feitos ?? []).map((g: any) => String(g.params?.peca_id || '')))
  const hojePorMarca: Record<string, number> = {}
  for (const g of feitos ?? []) if (new Date((g as any).criado_em) >= hoje) hojePorMarca[(g as any).params?.marca] = (hojePorMarca[(g as any).params?.marca] ?? 0) + 1

  const pedidos: Record<string, unknown>[] = []
  for (const marca of MARCAS) {
    if (cfg.alternar && marca !== marcaDoGemeo()) continue
    const faltam = cfg.porDia[marca] - (hojePorMarca[marca] ?? 0)
    if (faltam <= 0) continue
    const { data: pecas } = await db.from('conteudo_magnetico_pecas').select('id, user_id, guiao')
      .eq('marca', marca).order('criado_em', { ascending: true }).limit(200)
    const livres = (pecas ?? []).filter((p) => !usados.has(p.id) && temFalas(p.guiao)).slice(0, faltam)
    for (const p of livres) {
      const r = await pedirReelDoClone(db, p.id, p.user_id ?? null, cfg.via)
      pedidos.push({ marca, peca: p.id, status: r.status, ...r.corpo })
    }
    if (!livres.length) pedidos.push({ marca, aviso: 'sem guiões novos com falas' })
  }
  return { ok: true, via: cfg.via, creditos, pedidos }
}
