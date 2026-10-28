/**
 * AGENTE CRIPTO: CARTEIRAS ESPERTAS — uma passagem (descobrir, seguir, avaliar, dar gatilhos).
 *
 *  1. Descobrir (de 10 em 10 min, 2 pools no máximo, porque a GeckoTerminal corta a ~30/min):
 *     nas memecoins que mais subiram, quem comprou cedo e com dinheiro entra como «candidata».
 *  2. Seguir (até 8 carteiras por passagem, pelo RPC público da Solana): as compras novas de cada
 *     uma ficam registadas ao preço do momento. Só se lê o que aconteceu DEPOIS de começar a seguir.
 *  3. Avaliar: compras seguidas com mais de 1 h ganham o retorno a 1 h; a carteira é re-pontuada e
 *     passa a «esperta», fica «candidata» ou é «descartada» (carteiras.ts).
 *  4. Gatilhos: compra de uma «esperta» num token fora da curva da Pump.fun → `carteira-esperta`.
 *     O filtro de rug e a guarda vêm depois, no ciclo, como para os outros gatilhos.
 *
 * Tudo só leitura de dados públicos: não assina nada, não mexe em dinheiro.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { REGRA_ESPERTA, compradoresCedo, comprasDaTransacao, estadoDaCarteira, pontuar, retornoPct } from './carteiras'
import { assinaturasDe, snapshotsDex, tradesPool, transacaoRpc, type SnapshotMeme } from './fontes'
import { naCurva } from './memes'

const DESCOBRIR_CADA_MS = 10 * 60_000
const MAX_POOLS_DESCOBERTA = 2
const MAX_SEGUIDAS_POR_PASSAGEM = 8
const MAX_TX_POR_CARTEIRA = 3
/** Lista de candidatas cheia: pára de descobrir até a avaliação libertar lugares. */
const MAX_CANDIDATAS = 200

let ultimaDescoberta = 0

export interface PassagemEspertas {
  gatilhos: { snap: SnapshotMeme; carteira: string }[]
  descobertas: number
  compras: number
  avaliadas: number
  erros: string[]
}

export async function passarCarteiras(db: SupabaseClient, memes: SnapshotMeme[], agora = new Date()): Promise<PassagemEspertas> {
  const res: PassagemEspertas = { gatilhos: [], descobertas: 0, compras: 0, avaliadas: 0, erros: [] }
  const erro = (onde: string, e: unknown) => res.erros.push(`espertas ${onde}: ${String((e as Error)?.message ?? e).slice(0, 120)}`)

  /* ── 1. Descobrir ── */
  if (agora.getTime() - ultimaDescoberta >= DESCOBRIR_CADA_MS) {
    ultimaDescoberta = agora.getTime()
    try {
      const { count } = await db.from('cripto_carteiras_seguidas').select('endereco', { count: 'exact', head: true }).eq('estado', 'candidata')
      if ((count ?? 0) < MAX_CANDIDATAS) {
        const subidas = memes
          .filter((m) => !naCurva(m) && (m.var24hPct ?? 0) >= 50 && (m.liquidezUsd ?? 0) >= 30_000)
          .sort((a, b) => (b.var24hPct ?? 0) - (a.var24hPct ?? 0))
          .slice(0, MAX_POOLS_DESCOBERTA)
        for (const m of subidas) {
          const cedo = compradoresCedo(await tradesPool(m.pool), m.precoUsd).slice(0, 15)
          if (!cedo.length) continue
          await db.from('cripto_carteiras_seguidas').upsert(cedo.map((c) => ({ endereco: c.carteira, origem: `pool ${m.simbolo}` })), { onConflict: 'endereco', ignoreDuplicates: true })
          await db.from('cripto_carteira_compras').insert(cedo.map((c) => ({ carteira: c.carteira, mint: m.mint, simbolo: m.simbolo, preco_usd: c.precoUsd, em: c.em || agora.toISOString(), fonte: 'descoberta' })))
          res.descobertas += cedo.length
        }
      }
    } catch (e) {
      erro('descobrir', e)
    }
  }

  /* ── 2. Seguir ── */
  const { data: seguidas } = await db
    .from('cripto_carteiras_seguidas').select('endereco, estado, ultima_assinatura')
    .in('estado', ['esperta', 'candidata'])
    .order('estado', { ascending: false }) // 'esperta' antes de 'candidata'
    .order('vista_em', { ascending: true, nullsFirst: true })
    .limit(MAX_SEGUIDAS_POR_PASSAGEM)
  const novas: { carteira: string; esperta: boolean; mint: string; assinatura: string }[] = []
  for (const c of (seguidas ?? []) as { endereco: string; estado: string; ultima_assinatura: string | null }[]) {
    try {
      const sigs = await assinaturasDe(c.endereco, c.ultima_assinatura)
      // Primeira vez: marca onde se começa e não lê o passado (o passado é o que a descoberta já viu).
      if (c.ultima_assinatura) {
        for (const s of sigs.filter((x) => !x.falhou).slice(0, MAX_TX_POR_CARTEIRA)) {
          for (const compra of comprasDaTransacao(await transacaoRpc(s.assinatura), c.endereco)) {
            novas.push({ carteira: c.endereco, esperta: c.estado === 'esperta', mint: compra.mint, assinatura: s.assinatura })
          }
        }
      }
      await db.from('cripto_carteiras_seguidas').update({ ultima_assinatura: sigs[0]?.assinatura ?? c.ultima_assinatura, vista_em: agora.toISOString() }).eq('endereco', c.endereco)
    } catch (e) {
      erro(`seguir ${c.endereco.slice(0, 6)}`, e)
    }
  }
  if (novas.length) {
    const snaps = await snapshotsDex(novas.map((x) => x.mint), agora)
    const linhas = novas
      .filter((x) => snaps.has(x.mint))
      .map((x) => ({ carteira: x.carteira, mint: x.mint, simbolo: snaps.get(x.mint)!.simbolo, preco_usd: snaps.get(x.mint)!.precoUsd, em: agora.toISOString(), fonte: 'seguida', assinatura: `${x.assinatura}:${x.mint}` }))
    if (linhas.length) {
      const { error } = await db.from('cripto_carteira_compras').upsert(linhas, { onConflict: 'assinatura', ignoreDuplicates: true })
      if (error) erro('registar', error)
      res.compras = linhas.length
    }
    const vistos = new Set<string>()
    for (const x of novas) {
      const s = snaps.get(x.mint)
      if (!x.esperta || !s || naCurva(s) || vistos.has(x.mint)) continue
      vistos.add(x.mint)
      res.gatilhos.push({ snap: s, carteira: x.carteira })
    }
  }

  /* ── 3. Avaliar a 1 h e re-pontuar ── */
  try {
    const { data: porAvaliar } = await db
      .from('cripto_carteira_compras').select('id, carteira, mint, preco_usd')
      .eq('fonte', 'seguida').is('avaliada_em', null)
      .lte('em', new Date(agora.getTime() - 3600_000).toISOString())
      .order('em').limit(60)
    const lista = (porAvaliar ?? []) as { id: string; carteira: string; mint: string; preco_usd: number }[]
    if (lista.length) {
      const snaps = await snapshotsDex(lista.map((x) => x.mint), agora)
      const afectadas = new Set<string>()
      for (const x of lista) {
        // Token desaparecido da DexScreener ao fim de 1 h: conta como perda total (é o que acontece num rug).
        const r = retornoPct(Number(x.preco_usd), snaps.get(x.mint)?.precoUsd ?? 0)
        await db.from('cripto_carteira_compras').update({ retorno_1h_pct: r, avaliada_em: agora.toISOString() }).eq('id', x.id)
        afectadas.add(x.carteira)
        res.avaliadas++
      }
      for (const carteira of afectadas) {
        const { data: rs } = await db.from('cripto_carteira_compras').select('retorno_1h_pct').eq('carteira', carteira).eq('fonte', 'seguida').not('retorno_1h_pct', 'is', null)
        const p = pontuar(((rs ?? []) as { retorno_1h_pct: number }[]).map((x) => Number(x.retorno_1h_pct)))
        await db.from('cripto_carteiras_seguidas').update({ n: p.n, ganhos: p.ganhos, soma_retorno_pct: p.somaRetornoPct, estado: estadoDaCarteira(p, REGRA_ESPERTA), atualizada_em: agora.toISOString() }).eq('endereco', carteira)
      }
    }
  } catch (e) {
    erro('avaliar', e)
  }
  return res
}
