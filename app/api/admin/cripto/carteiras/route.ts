import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * AS CARTEIRAS DO AGENTE CRIPTO, lidas AO VIVO na blockchain (só leitura, só endereços públicos).
 *
 * Para cada carteira Solana registada: SOL, USDC e cada token que lá esteja (as memecoins compradas
 * na Pump.fun/Jupiter), com preço e valor de agora. Nada aqui assina nem move fundos; a chave
 * privada vive cifrada na VPS e nunca passa por este servidor.
 *
 * Fica numa rota à parte do resto do dashboard porque o RPC público da Solana limita pedidos:
 * o ecrã lê isto de minuto a minuto, não a cada 15 s.
 */
export const dynamic = 'force-dynamic'
export const preferredRegion = 'fra1'

const RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
const SOL = 'So11111111111111111111111111111111111111112'
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const PROGRAMAS = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb']

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  try {
    const r = await fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(6000),
      cache: 'no-store',
    })
    const j = (await r.json()) as { result?: T }
    return j.result ?? null
  } catch {
    return null
  }
}

interface Token { mint: string; quantidade: number; simbolo: string; nome: string; icone: string | null; precoUsd: number | null; valorUsd: number | null }

async function lerCarteira(endereco: string) {
  const [saldo, ...contas] = await Promise.all([
    rpc<{ value: number }>('getBalance', [endereco, { commitment: 'confirmed' }]),
    ...PROGRAMAS.map((programId) =>
      rpc<{ value: { account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number | null } } } } } }[] }>(
        'getTokenAccountsByOwner', [endereco, { programId }, { encoding: 'jsonParsed', commitment: 'confirmed' }],
      ),
    ),
  ])
  const porMint = new Map<string, number>()
  for (const c of contas) for (const a of c?.value ?? []) {
    const info = a.account.data.parsed.info
    const q = Number(info.tokenAmount.uiAmount) || 0
    if (q > 0) porMint.set(info.mint, (porMint.get(info.mint) ?? 0) + q)
  }
  const sol = saldo ? saldo.value / 1e9 : null
  const mints = [SOL, ...porMint.keys()]

  // Preço (Jupiter) e nome/ícone (lista de tokens da Jupiter) numa só ida cada.
  const [precos, meta] = await Promise.all([
    fetch(`https://lite-api.jup.ag/price/v3?ids=${mints.slice(0, 50).join(',')}`, { signal: AbortSignal.timeout(5000), cache: 'no-store' })
      .then((r) => r.json() as Promise<Record<string, { usdPrice?: number }>>).catch(() => ({} as Record<string, { usdPrice?: number }>)),
    porMint.size
      ? fetch(`https://lite-api.jup.ag/tokens/v2/search?query=${[...porMint.keys()].slice(0, 50).join(',')}`, { signal: AbortSignal.timeout(5000), cache: 'no-store' })
          .then((r) => r.json() as Promise<{ id: string; symbol?: string; name?: string; icon?: string }[]>).catch(() => [])
      : Promise.resolve([] as { id: string; symbol?: string; name?: string; icon?: string }[]),
  ])
  const metaDe = new Map((Array.isArray(meta) ? meta : []).map((m) => [m.id, m]))
  const preco = (m: string) => (Number(precos?.[m]?.usdPrice) > 0 ? Number(precos[m].usdPrice) : m === USDC ? 1 : null)

  const tokens: Token[] = [...porMint.entries()].map(([mint, quantidade]) => {
    const m = metaDe.get(mint)
    const p = preco(mint)
    return {
      mint, quantidade,
      simbolo: mint === USDC ? 'USDC' : m?.symbol ?? `${mint.slice(0, 4)}…${mint.slice(-4)}`,
      nome: mint === USDC ? 'USD Coin' : m?.name ?? 'Token sem nome na lista da Jupiter',
      icone: m?.icon ?? null,
      precoUsd: p,
      valorUsd: p == null ? null : quantidade * p,
    }
  }).sort((a, b) => (b.valorUsd ?? 0) - (a.valorUsd ?? 0))

  const precoSol = preco(SOL)
  const valorSol = sol != null && precoSol ? sol * precoSol : null
  const total = (valorSol ?? 0) + tokens.reduce((s, t) => s + (t.valorUsd ?? 0), 0)
  return { endereco, sol, precoSol, valorSol, tokens, totalUsd: total, lidoOk: saldo != null }
}

export async function GET(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado
  const db = getSupabaseAdmin()
  const [{ data: carteiras }, { data: saldo }, { data: envios }] = await Promise.all([
    db.from('cripto_carteiras').select('*').order('criada_em', { ascending: true }),
    db.from('cripto_saldos').select('em, detalhe').order('em', { ascending: false }).limit(1).maybeSingle(),
    db.from('cripto_sessoes').select('modo, inicio, varredura_estado, varredura_usd, varredura_destino, varredura_tx, porque')
      .neq('varredura_estado', 'nada').order('inicio', { ascending: false }).limit(30),
  ])
  const solana = await Promise.all(((carteiras ?? []) as { rede: string; endereco: string; papel: string; criada_em: string }[])
    .filter((c) => c.rede === 'solana')
    .map(async (c) => ({ ...c, ...(await lerCarteira(c.endereco)) })))
  const partes = (saldo?.detalhe as { partes?: Record<string, { equity?: number; livre?: number }> } | null)?.partes
  return NextResponse.json({
    ok: true,
    lidoEm: new Date().toISOString(),
    solana,
    aurum: { equity: partes?.bybit?.equity ?? null, livre: partes?.bybit?.livre ?? null, em: saldo?.em ?? null },
    envios: envios ?? [],
  })
}
