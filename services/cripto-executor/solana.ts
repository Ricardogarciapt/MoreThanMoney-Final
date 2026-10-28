/**
 * Solana: saldos, swaps pela Jupiter Ultra e o ENVIO DOS LUCROS (só para um endereço).
 *
 * A Jupiter Ultra devolve a transação já montada (rota, taxas, prioridade); aqui só se ASSINA e se
 * devolve. Antes de assinar confirma-se que a transação é mesmo nossa (o pagador é a carteira do
 * agente) — se a API alguma vez devolvesse outra coisa, não se assina.
 */
import { getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount, createTransferCheckedInstruction } from '@solana/spl-token'
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js'

export const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const ULTRA = process.env.JUPITER_ULTRA_URL || 'https://lite-api.jup.ag/ultra/v1'

export function ligacao(): Connection {
  return new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed')
}

export function enderecoValido(s: string | undefined): s is string {
  if (!s) return false
  try {
    // Uma carteira normal está na curva; um PDA (endereço de programa) não tem dono humano.
    const k = new PublicKey(s)
    return k.toBase58() === s && PublicKey.isOnCurve(k.toBytes())
  } catch {
    return false
  }
}

/** Saldo de um token (unidades inteiras e decimais). 0 se a conta de token não existir. */
export async function saldoToken(c: Connection, dono: PublicKey, mint: string): Promise<{ raw: bigint; decimais: number; ui: number }> {
  const r = await c.getParsedTokenAccountsByOwner(dono, { mint: new PublicKey(mint) })
  let raw = BigInt(0)
  let decimais = 0
  for (const a of r.value) {
    const info = (a.account.data as { parsed?: { info?: { tokenAmount?: { amount?: string; decimals?: number } } } }).parsed?.info?.tokenAmount
    raw += BigInt(info?.amount ?? '0')
    decimais = info?.decimals ?? decimais
  }
  return { raw, decimais, ui: Number(raw) / Math.pow(10, decimais) }
}

export async function saldoSol(c: Connection, dono: PublicKey): Promise<number> {
  return (await c.getBalance(dono)) / LAMPORTS_PER_SOL
}

/** Preços USD pela Jupiter (para avaliar memecoins em carteira). */
export async function precosJupiter(mints: string[]): Promise<Record<string, number>> {
  if (!mints.length) return {}
  const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${mints.join(',')}`)
  if (!r.ok) return {}
  const j = (await r.json()) as Record<string, { usdPrice?: number }>
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(j)) if (Number.isFinite(Number(v?.usdPrice))) out[k] = Number(v.usdPrice)
  return out
}

export interface ResultadoSwap {
  ok: boolean
  assinatura?: string
  entradaRaw?: string
  saidaRaw?: string
  erro?: string
}

/**
 * Troca `amountRaw` de `inputMint` por `outputMint`. `slippageBps` é o tecto (a Ultra escolhe o
 * melhor até lá). Recusa assinar se a transação não tiver a carteira do agente como pagador.
 */
export async function swapUltra(carteira: Keypair, inputMint: string, outputMint: string, amountRaw: string, slippageBps: number): Promise<ResultadoSwap> {
  const taker = carteira.publicKey.toBase58()
  const q = new URLSearchParams({ inputMint, outputMint, amount: amountRaw, taker, slippageBps: String(Math.round(slippageBps)) })
  const o = await fetch(`${ULTRA}/order?${q}`)
  if (!o.ok) return { ok: false, erro: `order HTTP ${o.status}` }
  const ordem = (await o.json()) as { transaction?: string | null; requestId?: string; errorMessage?: string }
  if (!ordem.transaction || !ordem.requestId) return { ok: false, erro: ordem.errorMessage || 'Ultra sem transação' }

  const tx = VersionedTransaction.deserialize(Buffer.from(ordem.transaction, 'base64'))
  const pagador = tx.message.staticAccountKeys[0]?.toBase58()
  const assinantes = tx.message.header.numRequiredSignatures
  const nossaPosicao = tx.message.staticAccountKeys.slice(0, assinantes).findIndex((k) => k.toBase58() === taker)
  if (nossaPosicao < 0) return { ok: false, erro: `Transação não pede a assinatura do agente (pagador ${pagador}).` }
  tx.sign([carteira])

  const e = await fetch(`${ULTRA}/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ signedTransaction: Buffer.from(tx.serialize()).toString('base64'), requestId: ordem.requestId }),
  })
  const r = (await e.json().catch(() => ({}))) as { status?: string; signature?: string; error?: string; inputAmountResult?: string; outputAmountResult?: string }
  if (r.status !== 'Success') return { ok: false, assinatura: r.signature, erro: r.error || `execute ${r.status ?? e.status}` }
  return { ok: true, assinatura: r.signature, entradaRaw: r.inputAmountResult, saidaRaw: r.outputAmountResult }
}

/**
 * O ENVIO DOS LUCROS. O destino vem SÓ do argumento, que o executor lê de CRIPTO_DESTINO_LUCROS
 * (env da VPS). Nenhum campo da base de dados chega aqui: quem conseguisse escrever na Supabase não
 * conseguiria mudar para onde vai o dinheiro.
 */
export async function enviarUsdc(c: Connection, carteira: Keypair, destino: string, usd: number): Promise<string> {
  if (!enderecoValido(destino)) throw new Error('Destino dos lucros inválido.')
  if (destino === carteira.publicKey.toBase58()) throw new Error('O destino dos lucros não pode ser a própria carteira do agente.')
  if (!(usd > 0)) throw new Error('Valor a enviar inválido.')
  const mint = new PublicKey(USDC)
  const origem = await getAssociatedTokenAddress(mint, carteira.publicKey)
  const ataDestino = await getOrCreateAssociatedTokenAccount(c, carteira, mint, new PublicKey(destino))
  const raw = BigInt(Math.floor(usd * 1e6))
  const tx = new Transaction().add(createTransferCheckedInstruction(origem, mint, ataDestino.address, carteira.publicKey, raw, 6))
  tx.feePayer = carteira.publicKey
  tx.recentBlockhash = (await c.getLatestBlockhash()).blockhash
  tx.sign(carteira)
  const sig = await c.sendRawTransaction(tx.serialize())
  await c.confirmTransaction(sig, 'confirmed')
  return sig
}
