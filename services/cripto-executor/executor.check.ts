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
import { TIPOS_SNIPER, equityBybitDoAgente, juntarPartes, lerTectos, tectosDaVercel, parOcupadoNaMestre, planoRebalanco, valorAEnviar, verificarMovimento, verificarPendente } from '../../lib/cripto/tectos'

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

// Movimentos: só entre carteiras do agente (as do cofre) e lucros só para o destino do env.
const P = a.carteira.publicKey.toBase58()
const S = abrirOuCriarCarteira(join(dir, 'sniper.json'), FRASE).carteira.publicKey.toBase58()
const proprias = new Set([P, S])
const tm = lerTectos({ CRIPTO_REAL: '1', CRIPTO_DESTINO_LUCROS: 'Dest111', CRIPTO_SNIPER: '1', CRIPTO_SNIPER_CAPITAL_USD: '40' })
const mov = (x: Partial<Parameters<typeof verificarMovimento>[0]>, hoje = 0) => verificarMovimento({ de: P, para: S, valorUsd: 20, motivo: 'rebalanço', ...x }, tm, { proprias, movidoHojeUsd: hoje })
teste('movimento: principal → sniper passa', mov({}) === null)
teste('movimento: para endereço de fora recusa', mov({ para: 'Ladrao1111111111111111111111111111111111111' }) !== null)
teste('movimento: de carteira que não é do agente recusa', mov({ de: 'Outra111' }) !== null)
teste('movimento: acima do tecto por movimento (50) recusa', mov({ valorUsd: 51 }) !== null)
teste('movimento: acima do tecto do dia (200) recusa', mov({ valorUsd: 20 }, 190) !== null)
teste('movimento: sem CRIPTO_REAL recusa', verificarMovimento({ de: P, para: S, valorUsd: 20, motivo: 'rebalanço' }, lerTectos({}), { proprias, movidoHojeUsd: 0 }) !== null)
teste('lucros: só para o destino do env', mov({ para: 'Dest111', motivo: 'lucros' }) === null && mov({ para: S, motivo: 'lucros' }) !== null)
teste('lucros: o rebalanço não pode ir para o destino dos lucros', mov({ para: 'Dest111' }) !== null)
teste('lucros: acima do tecto da varredura recusa', mov({ para: 'Dest111', motivo: 'lucros', valorUsd: 501 }) !== null)
teste('rebalanço: sniper abaixo de metade do alvo recebe o que falta', planoRebalanco(tm, 100, 10) === 30)
teste('rebalanço: sniper acima de metade não mexe', planoRebalanco(tm, 100, 25) === 0)
teste('rebalanço: sem sniper não mexe', planoRebalanco(t, 100, 0) === 0)
teste('rebalanço: limitado ao que a principal tem', planoRebalanco(tm, 5, 0) === 5)
teste('sniper: Pump.fun e carteiras espertas vão para a sniper', TIPOS_SNIPER.has('pump-graduado') && TIPOS_SNIPER.has('carteira-esperta') && !TIPOS_SNIPER.has('meme-fluxo'))
teste('cofre: sniper é outra carteira', S !== P)

const m = lerTectos({ CRIPTO_BYBIT_MESTRE: '1', CRIPTO_CAPITAL_BYBIT_USD: '300', CRIPTO_VARRER_BYBIT: '1' })
teste('mestre: nunca levanta da Bybit', m.bybitMestre && !m.varrerBybit)
teste('mestre: par com posição do Aurum fica de fora', parOcupadoNaMestre(m, 0.5) !== null)
teste('mestre: posição ilegível fica de fora', parOcupadoNaMestre(m, null) !== null)
teste('mestre: par vazio passa', parOcupadoNaMestre(m, 0) === null)
teste('subconta: não verifica par', parOcupadoNaMestre(t, 0.5) === null)
const em = equityBybitDoAgente(m, { equity: 50_000, livre: 40_000 }, -20, 50)
teste('mestre: equity é o capital atribuído + PnL, não o saldo da mestre', em.equity === 280 && em.livre === 230)
teste('mestre: perda maior que o capital dá 0', equityBybitDoAgente(m, { equity: 50_000, livre: 40_000 }, -400, 0).equity === 0)
teste('subconta: equity é o saldo da conta', equityBybitDoAgente(t, { equity: 500, livre: 400 }, -20, 50).equity === 500)
const tv = tectosDaVercel({})
teste('vercel: sem CRIPTO_REAL não executa', !tv.real)
teste('vercel: sempre mestre e sem levantamentos', tv.bybitMestre && !lerTectos({}).varrerBybit && !tectosDaVercel({ CRIPTO_VARRER_BYBIT: '1' }).varrerBybit)
teste('vercel: capital do agente 100 $ por omissão', tv.capitalBybitUsd === 100 && tectosDaVercel({ CRIPTO_CAPITAL_BYBIT_USD: '250' }).capitalBybitUsd === 250)
teste('vercel: tectos pequenos por omissão', tv.ordemMaxUsd === 25 && tv.perdaDiaMaxUsd === 10 && tv.alavancagemMax === 3)
teste('só memecoins: CRIPTO_SO_SPOT=1', lerTectos({ CRIPTO_SO_SPOT: '1' }).soSpot && !lerTectos({}).soSpot)
const j = juntarPartes({ bybit: { equity: 110, livre: 90 } }, { solana: { equity: 50, livre: 20 }, bybit: { equity: 100, livre: 100 } })
teste('saldo: junta a parte nova com a última do outro executor', j.equity === 160 && j.livre === 110 && j.solana.equity === 50)
teste('saldo: sem linha anterior conta só a parte nova', juntarPartes({ solana: { equity: 40, livre: 40 } }, null).equity === 40)

if (falhas.length) {
  console.error(`✗ ${falhas.length} falha(s):\n  - ${falhas.join('\n  - ')}`)
  process.exit(1)
}
console.log('✓ executor: cofre, endereços, tectos, envio de lucros e modo mestre')
