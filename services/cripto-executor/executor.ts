/**
 * MTM CRIPTO EXECUTOR — o ÚNICO processo que toca em dinheiro do agente cripto. Só na VPS.
 *
 *  · Utilizador Linux próprio (`mtm-cripto`), unidade systemd própria, env próprio
 *    (/etc/mtm-cripto/executor.env, 0600). O vigia `agente-cripto` NÃO tem estas chaves.
 *  · Cria a carteira Solana na primeira vez (cofre.ts) e publica só o endereço.
 *  · De 10 em 10 s: lê saldos, cumpre pedidos `pendente` que passem os TECTOS DA VPS, fecha o que o
 *    vigia pediu, sincroniza o que a Bybit fechou por SL/TP e envia os lucros das sessões fechadas.
 *  · Sem CRIPTO_REAL=1, ou com o interruptor da base em papel, não executa nada: só publica o
 *    endereço e os saldos (para o dono poder financiar antes de ligar).
 *
 * Build (no Mac ou na cloud):
 *   (cd services/cripto-executor && npm ci) && node_modules/.bin/esbuild services/cripto-executor/executor.ts \
 *     --bundle --platform=node --target=node18 --outfile=/tmp/cripto-executor.js
 *
 * `node cripto-executor.js --exportar-chave` imprime a chave privada UMA vez no terminal, para a
 * cópia de segurança do dono. Nunca é chamado pelo serviço.
 */
import { PublicKey } from '@solana/web3.js'
import { getSupabaseAdmin } from '../../lib/supabase-admin-client'
import { inicioDaSessao } from '../../lib/cripto/papel'
import { abrirPerp, bybitAgenteConfigurada, fecharPerp, levantarUsdtSolana, posicaoPerp, saldoBybit, ultimoFecho } from './bybit-agente'
import { abrirOuCriarCarteira, chaveEmTexto } from './cofre'
import { USDC, enviarUsdc, ligacao, precosJupiter, saldoSol, saldoToken, swapUltra } from './solana'
import { equityBybitDoAgente, lerTectos, parOcupadoNaMestre, valorAEnviar, verificarPendente } from './tectos'

const VERSAO = 'cripto-executor-002'
const CAMINHO_COFRE = process.env.CRIPTO_COFRE || '/var/lib/mtm-cripto/solana.json'
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a)

const tectos = lerTectos(process.env)
const db = getSupabaseAdmin()
const sol = ligacao()
const { carteira, nova } = abrirOuCriarCarteira(CAMINHO_COFRE, process.env.CRIPTO_COFRE_FRASE || '')

if (process.argv.includes('--exportar-chave')) {
  console.log(`Endereço: ${carteira.publicKey.toBase58()}\nChave privada (guarda no gestor de palavras-passe e fecha o terminal):\n${chaveEmTexto(carteira)}`)
  process.exit(0)
}

interface Linha {
  id: string
  ativo: string
  mercado: 'perp' | 'spot'
  id_ativo: string
  lado: 'long' | 'short'
  nocional_usd: number
  alavancagem: number
  entrada: number
  sl: number
  tp: number
  slippage_max_pct: number
  estado: string
  fechar_pedido: string | null
  aberta_em: string
  execucao: Record<string, unknown>
}

async function modoDaBase(): Promise<'papel' | 'real'> {
  const { data } = await db.from('site_settings').select('value').eq('key', 'agente_cripto').maybeSingle()
  const v = (data?.value ?? {}) as { modo?: string; ligado?: boolean }
  return v.ligado === true && v.modo === 'real' ? 'real' : 'papel'
}

/** Equity = USDC + SOL + memecoins em carteira + Bybit. Grava em cripto_saldos. */
async function lerSaldos(spotAbertos: Linha[]) {
  const dono = carteira.publicKey
  const [usdc, solQt, contaBybit, agenteBybit] = await Promise.all([
    saldoToken(sol, dono, USDC), saldoSol(sol, dono), bybitAgenteConfigurada() ? saldoBybit() : Promise.resolve(null), contasDoAgenteNaBybit(),
  ])
  const bybit = bybitAgenteConfigurada() ? equityBybitDoAgente(tectos, contaBybit, agenteBybit.pnlRealizado, agenteBybit.margemAberta) : null
  const mints = [...new Set(spotAbertos.map((p) => p.id_ativo))]
  const precos = await precosJupiter(['So11111111111111111111111111111111111111112', ...mints])
  let memes = 0
  for (const m of mints) memes += (await saldoToken(sol, dono, m)).ui * (precos[m] ?? 0)
  const solUsd = solQt * (precos['So11111111111111111111111111111111111111112'] ?? 0)
  const equity = usdc.ui + solUsd + memes + (bybit?.equity ?? 0)
  const livre = usdc.ui + (bybit?.livre ?? 0)
  await db.from('cripto_saldos').insert({ equity_usd: Math.round(equity * 100) / 100, livre_usd: Math.round(livre * 100) / 100, detalhe: { usdc: usdc.ui, sol: solQt, memesUsd: memes, bybit, bybitMestre: tectos.bybitMestre, versao: VERSAO } })
  return { equity, usdcLivre: usdc.ui, bybitLivre: bybit?.livre ?? 0 }
}

/** PnL realizado e margem aberta das trades perp REAIS do agente (para o modo mestre). */
async function contasDoAgenteNaBybit(): Promise<{ pnlRealizado: number; margemAberta: number }> {
  if (!tectos.bybitMestre) return { pnlRealizado: 0, margemAberta: 0 }
  const { data } = await db.from('cripto_posicoes').select('estado, pnl_usd, nocional_usd, alavancagem').eq('modo', 'real').eq('mercado', 'perp').in('estado', ['aberta', 'fechada'])
  let pnlRealizado = 0
  let margemAberta = 0
  for (const x of (data ?? []) as { estado: string; pnl_usd: number | null; nocional_usd: number; alavancagem: number }[]) {
    if (x.estado === 'fechada') pnlRealizado += Number(x.pnl_usd) || 0
    else margemAberta += Number(x.nocional_usd) / Math.max(1, Number(x.alavancagem) || 1)
  }
  return { pnlRealizado, margemAberta }
}

async function perdaDeHoje(agora: Date): Promise<number> {
  const { data } = await db.from('cripto_posicoes').select('pnl_usd').eq('modo', 'real').eq('estado', 'fechada').gte('fechada_em', inicioDaSessao(agora).toISOString())
  const pnl = (data ?? []).reduce((s: number, x: { pnl_usd: number }) => s + (Number(x.pnl_usd) || 0), 0)
  return Math.max(0, -pnl)
}

async function cumprirPendente(p: Linha, exposicao: number, agora: Date) {
  const motivo = verificarPendente(p, tectos, { exposicaoAbertaUsd: exposicao, perdaHojeUsd: await perdaDeHoje(agora), agora })
  if (motivo) {
    await db.from('cripto_posicoes').update({ estado: 'falhada', motivo_fecho: `executor: ${motivo}`, fechada_em: agora.toISOString() }).eq('id', p.id).eq('estado', 'pendente')
    log('[recusa]', p.ativo, motivo)
    return
  }
  // Reserva antes de executar: se dois ciclos se cruzarem, só um passa daqui.
  const { data: reservada } = await db.from('cripto_posicoes').update({ execucao: { reservadaEm: agora.toISOString(), versao: VERSAO } }).eq('id', p.id).eq('estado', 'pendente').is('execucao->>reservadaEm', null).select('id')
  if (!reservada?.length) return

  if (p.mercado === 'perp') {
    if (!bybitAgenteConfigurada()) return falhar(p, 'Conta Bybit do agente sem chave.')
    if (tectos.bybitMestre) {
      const naConta = await posicaoPerp(p.id_ativo)
      const ocupado = parOcupadoNaMestre(tectos, naConta ? naConta.tamanho : null)
      if (ocupado) return falhar(p, ocupado)
    }
    const r = await abrirPerp({ symbol: p.id_ativo, lado: p.lado, nocionalUsd: Number(p.nocional_usd), preco: Number(p.entrada), alavancagem: p.alavancagem, sl: Number(p.sl), tp: Number(p.tp), idOrdem: p.id })
    if (!r.ok) return falhar(p, `Bybit: ${r.erro}`)
    const pos = await posicaoPerp(p.id_ativo)
    await db.from('cripto_posicoes').update({ estado: 'aberta', entrada: pos?.precoMedio || p.entrada, execucao: { ...p.execucao, bybitOrderId: r.orderId, qty: r.qty } }).eq('id', p.id)
    log('[aberta]', p.ativo, p.lado, p.nocional_usd)
    return
  }
  const raw = String(Math.floor(Number(p.nocional_usd) * 1e6))
  const r = await swapUltra(carteira, USDC, p.id_ativo, raw, Number(p.slippage_max_pct) * 100)
  if (!r.ok) return falhar(p, `Jupiter: ${r.erro}`)
  const tokens = Number(r.saidaRaw)
  const dec = (await saldoToken(sol, carteira.publicKey, p.id_ativo)).decimais
  const entrada = tokens > 0 ? Number(p.nocional_usd) / (tokens / Math.pow(10, dec)) : Number(p.entrada)
  await db.from('cripto_posicoes').update({ estado: 'aberta', entrada, execucao: { ...p.execucao, compraTx: r.assinatura, tokensRaw: r.saidaRaw, usdcRaw: r.entradaRaw } }).eq('id', p.id)
  log('[aberta]', p.ativo, 'spot', p.nocional_usd, r.assinatura)
}

async function falhar(p: Linha, motivo: string) {
  await db.from('cripto_posicoes').update({ estado: 'falhada', motivo_fecho: motivo, fechada_em: new Date().toISOString() }).eq('id', p.id)
  log('[falhada]', p.ativo, motivo)
}

async function fecharPedido(p: Linha) {
  const agora = new Date().toISOString()
  if (p.mercado === 'perp') {
    const r = await fecharPerp(p.id_ativo, p.lado, tectos.bybitMestre ? Number(p.execucao?.qty) || undefined : undefined)
    if (!r.ok) return log('[fecho falhou]', p.ativo, r.erro)
    const f = await ultimoFecho(p.id_ativo)
    await db.from('cripto_posicoes').update({ estado: 'fechada', motivo_fecho: p.fechar_pedido, saida: f?.saida ?? null, pnl_usd: f?.pnl ?? null, fechada_em: agora }).eq('id', p.id)
    return
  }
  const saldo = await saldoToken(sol, carteira.publicKey, p.id_ativo)
  if (saldo.raw <= BigInt(0)) {
    await db.from('cripto_posicoes').update({ estado: 'fechada', motivo_fecho: `${p.fechar_pedido} (sem saldo)`, pnl_usd: -Number(p.nocional_usd), fechada_em: agora }).eq('id', p.id)
    return
  }
  // Na saída aceita-se mais escorregamento: preso numa memecoin a cair é pior do que vender mal.
  const r = await swapUltra(carteira, p.id_ativo, USDC, saldo.raw.toString(), Math.max(Number(p.slippage_max_pct) * 100, 500))
  if (!r.ok) return log('[venda falhou]', p.ativo, r.erro)
  const usdc = Number(r.saidaRaw) / 1e6
  await db.from('cripto_posicoes').update({
    estado: 'fechada', motivo_fecho: p.fechar_pedido, saida: saldo.ui > 0 ? usdc / saldo.ui : null, pnl_usd: Math.round((usdc - Number(p.nocional_usd)) * 100) / 100,
    fechada_em: agora, execucao: { ...p.execucao, vendaTx: r.assinatura },
  }).eq('id', p.id)
  log('[fechada]', p.ativo, usdc)
}

/** A Bybit fechou por SL/TP sozinha: acerta a base. */
async function sincronizarPerp(p: Linha) {
  const pos = await posicaoPerp(p.id_ativo)
  if (!pos || pos.tamanho > 0) return
  // Na mestre o SL/TP é da posição inteira; como o agente só entra em par vazio, posição a zero = fechou a dele.
  const f = await ultimoFecho(p.id_ativo)
  await db.from('cripto_posicoes').update({ estado: 'fechada', motivo_fecho: 'exchange (SL/TP)', saida: f?.saida ?? null, pnl_usd: f?.pnl ?? null, fechada_em: new Date().toISOString() }).eq('id', p.id).eq('estado', 'aberta')
}

async function enviarLucros(saldos: { equity: number; usdcLivre: number; bybitLivre: number }) {
  const { data: sessoes } = await db.from('cripto_sessoes').select('inicio').eq('modo', 'real').eq('varredura_estado', 'pedida').order('inicio').limit(1)
  const s = sessoes?.[0]
  if (!s) return
  const plano = valorAEnviar(tectos, saldos.equity, saldos.usdcLivre + (tectos.varrerBybit ? saldos.bybitLivre : 0), 10)
  if (plano.usd <= 0) {
    await db.from('cripto_sessoes').update({ varredura_estado: 'nada', varredura_usd: 0, porque: `executor: ${plano.porque}` }).eq('modo', 'real').eq('inicio', s.inicio)
    return
  }
  const doSolana = Math.min(plano.usd, Math.floor(saldos.usdcLivre * 100) / 100)
  const daBybit = Math.round((plano.usd - doSolana) * 100) / 100
  const txs: string[] = []
  try {
    if (doSolana >= 1) txs.push(await enviarUsdc(sol, carteira, tectos.destinoLucros!, doSolana))
    if (daBybit >= 10 && tectos.varrerBybit) {
      const w = await levantarUsdtSolana(tectos.destinoLucros!, daBybit)
      if (!w.ok) throw new Error(w.erro)
      txs.push(`bybit:${w.id}`)
    }
    await db.from('cripto_sessoes').update({ varredura_estado: 'enviada', varredura_usd: plano.usd, varredura_destino: tectos.destinoLucros, varredura_tx: txs.join(' '), porque: plano.porque }).eq('modo', 'real').eq('inicio', s.inicio)
    log('[lucros enviados]', plano.usd, txs.join(' '))
  } catch (e) {
    await db.from('cripto_sessoes').update({ varredura_estado: 'falhada', varredura_tx: txs.join(' ') || null, porque: `executor: ${String((e as Error)?.message ?? e).slice(0, 200)}` }).eq('modo', 'real').eq('inicio', s.inicio)
  }
}

let ultimoSaldo = 0
let saldos = { equity: 0, usdcLivre: 0, bybitLivre: 0 }

async function passagem() {
  const agora = new Date()
  const { data } = await db.from('cripto_posicoes').select('*').eq('modo', 'real').in('estado', ['pendente', 'aberta'])
  const linhas = (data ?? []) as Linha[]
  if (agora.getTime() - ultimoSaldo > 60_000) {
    saldos = await lerSaldos(linhas.filter((p) => p.mercado === 'spot' && p.estado === 'aberta'))
    ultimoSaldo = agora.getTime()
  }
  const modo = await modoDaBase()
  if (!tectos.real || modo !== 'real') return
  let exposicao = linhas.filter((p) => p.estado === 'aberta').reduce((s, p) => s + Number(p.nocional_usd), 0)
  for (const p of linhas.filter((x) => x.estado === 'pendente')) {
    await cumprirPendente(p, exposicao, agora)
    exposicao += Number(p.nocional_usd)
  }
  for (const p of linhas.filter((x) => x.estado === 'aberta')) {
    if (p.fechar_pedido) await fecharPedido(p)
    else if (p.mercado === 'perp') await sincronizarPerp(p)
  }
  await enviarLucros(saldos)
}

async function main() {
  const endereco = carteira.publicKey.toBase58()
  new PublicKey(endereco) // valida
  await db.from('cripto_carteiras').upsert({ rede: 'solana', endereco, papel: 'trading' }, { onConflict: 'rede,endereco', ignoreDuplicates: true })
  log(`[executor] ${VERSAO} · carteira ${endereco}${nova ? ' (NOVA: financia com USDC + ~0,05 SOL)' : ''} · real=${tectos.real} · bybit=${bybitAgenteConfigurada() ? (tectos.bybitMestre ? 'MESTRE do Copy Trading (seguidores copiam)' : 'subconta') : 'não'} · destino=${tectos.destinoLucros ? 'definido' : 'EM FALTA'}`)
  let ocupado = false
  setInterval(async () => {
    if (ocupado) return
    ocupado = true
    try {
      await passagem()
    } catch (e) {
      log('[erro]', String((e as Error)?.message ?? e).slice(0, 300))
    } finally {
      ocupado = false
    }
  }, 10_000)
}

main().catch((e) => {
  log('[arranque falhou]', e)
  process.exit(1)
})
