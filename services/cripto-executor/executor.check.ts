/**
 * AS FECHADURAS DO EXECUTOR REAL.
 *
 *   (cd services/cripto-executor && npm ci) && npx tsx services/cripto-executor/executor.check.ts
 *
 * Cofre: a carteira cifrada abre com a frase certa e não abre com outra. Tectos: o executor recusa
 * o que a Supabase lhe mandar acima dos limites da VPS, e só envia lucro acima da base.
 */
import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { abrirOuCriarCarteira } from './cofre'
import { enderecoValido } from './solana'
import { lerTectos, valorAEnviar, verificarPendente } from './tectos'

const falhas: string[] = []
const teste = (nome: string, c: boolean) => { if (!c) falhas.push(nome) }

const dir = mkdtempSync(join(tmpdir(), 'cofre-'))
const caminho = join(dir, 'solana.json')
const FRASE = 'uma frase comprida de teste 123'
const a = abrirOuCriarCarteira(caminho, FRASE)
const b = abrirOuCriarCarteira(caminho, FRASE)
teste('cofre: cria à primeira', a.nova && !b.nova)
teste('cofre: reabre a mesma carteira', a.carteira.publicKey.toBase58() === b.carteira.publicKey.toBase58())
teste('cofre: ficheiro 0600', (statSync(caminho).mode & 0o777) === 0o600)
let abriuComOutra = true
try { abrirOuCriarCarteira(caminho, 'outra frase qualquer comprida') } catch { abriuComOutra = false }
teste('cofre: frase errada não abre', !abriuComOutra)
let frasesCurtas = true
try { abrirOuCriarCarteira(join(dir, 'x.json'), 'curta') } catch { frasesCurtas = false }
teste('cofre: frase curta recusada', !frasesCurtas)

teste('endereço: carteira válida', enderecoValido(a.carteira.publicKey.toBase58()))
teste('endereço: lixo inválido', !enderecoValido('nao-e-um-endereco'))

const agora = new Date('2026-10-28T12:00:00Z')
const t = lerTectos({ CRIPTO_REAL: '1', CRIPTO_ORDEM_MAX_USD: '25', CRIPTO_EXPOSICAO_MAX_USD: '100', CRIPTO_PERDA_DIA_MAX_USD: '10', CRIPTO_CAPITAL_BASE_USD: '200', CRIPTO_DESTINO_LUCROS: 'Dest111' })
const p = { nocional_usd: 20, alavancagem: 3, aberta_em: new Date(agora.getTime() - 30_000).toISOString() }
const ctx = { exposicaoAbertaUsd: 0, perdaHojeUsd: 0, agora }
teste('tectos: pedido normal passa', verificarPendente(p, t, ctx) === null)
teste('tectos: sem CRIPTO_REAL recusa', verificarPendente(p, lerTectos({}), ctx) !== null)
teste('tectos: 50 000 $ vindos da base recusa', verificarPendente({ ...p, nocional_usd: 50_000 }, t, ctx) !== null)
teste('tectos: exposição acima recusa', verificarPendente(p, t, { ...ctx, exposicaoAbertaUsd: 90 }) !== null)
teste('tectos: perda do dia no tecto recusa', verificarPendente(p, t, { ...ctx, perdaHojeUsd: 10 }) !== null)
teste('tectos: pedido velho recusa', verificarPendente({ ...p, aberta_em: new Date(agora.getTime() - 10 * 60_000).toISOString() }, t, ctx) !== null)
teste('tectos: alavancagem 5 com tecto 3 recusa', verificarPendente({ ...p, alavancagem: 5 }, t, ctx) !== null)
teste('tectos: alavancagem nunca acima de 5 por env', lerTectos({ CRIPTO_ALAVANCAGEM_MAX: '50' }).alavancagemMax === 5)
teste('lucros: sem destino não envia', valorAEnviar(lerTectos({ CRIPTO_CAPITAL_BASE_USD: '200' }), 300, 300, 10).usd === 0)
teste('lucros: conta a perder não envia', valorAEnviar(t, 180, 180, 10).usd === 0)
teste('lucros: envia só acima da base', valorAEnviar(t, 260, 500, 10).usd === 60)
teste('lucros: tecto de envio respeitado', valorAEnviar({ ...t, varreduraMaxUsd: 30 }, 260, 500, 10).usd === 30)

if (falhas.length) {
  console.error(`✗ ${falhas.length} falha(s):\n  - ${falhas.join('\n  - ')}`)
  process.exit(1)
}
console.log('✓ executor: cofre, endereços, tectos e envio de lucros')
