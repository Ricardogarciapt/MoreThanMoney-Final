/**
 * GUARDA: a gestão automática do WebTrader tem de EXECUTAR nas contas de corretora — e nunca fechar
 * nada por sua iniciativa.
 *
 * 25/09: o Ricardo tinha Auto BE e Auto Trailing ligados em posições da TradeLocker e não acontecia
 * NADA. A causa: os botões das contas de corretora (`GestaoAutoCorretora`) só escreviam no
 * localStorage do browser (`webtrader_gestao_auto_real:<ref>`) e não existia nenhum executor do outro
 * lado — o motor do VPS (services/funded-motor) só trata das contas simuladas, que guardam a gestão
 * em `funded_positions`. A configuração gravava-se e morria ali.
 *
 * Esta guarda tranca as duas metades do problema:
 *  1. o COMPORTAMENTO: a decisão move o SL quando deve, aperta só num sentido, faz o break-even uma
 *     única vez e recusa-se a agir sem preço da corretora (a parte que vale dinheiro);
 *  2. a LIGAÇÃO: continua a existir uma rota que grava e um executor que lê — sem isso voltávamos a
 *     ter botões bonitos e nenhum motor, que foi exactamente o defeito.
 *
 * E tranca o que NUNCA pode acontecer numa conta real: esta camada não fecha, não abre e não cancela.
 *
 *   npx tsx lib/webtrader/__tests__/gestao-auto-real.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type ConfigGestaoReal, CONFIG_VAZIA, configTemGestao, decidirGestaoReal, precoDeGestao,
  simboloDaCorretora, validarConfigPedida,
} from '../gestao-auto-real'
import type { PosicaoWT } from '../corretoras/tipos'

const RAIZ = join(__dirname, '..', '..', '..')
const falhas: string[] = []
const verificar = (nome: string, fn: () => void) => {
  try { fn() } catch (e) { falhas.push(`${nome}: ${e instanceof Error ? e.message : e}`) }
}

// ── 1. comportamento ────────────────────────────────────────────────────────────────────────────

const ouro = simboloDaCorretora('XAUUSD', 2)
const pos = (over: Partial<PosicaoWT> = {}): PosicaoWT => ({
  id: 'p1', symbol: 'XAUUSD', simboloCorretora: 'XAUUSD.s', direcao: 'buy', volume: 0.1,
  precoEntrada: 3000, precoAtual: null, sl: 2990, tp: null, lucro: null, abertaEm: null, ...over,
})
const cfg = (over: Partial<ConfigGestaoReal> = {}): ConfigGestaoReal => ({ ...CONFIG_VAZIA, ...over })

verificar('o ouro usa pips de 0,1 (a convenção da casa), não as casas decimais', () => {
  assert.equal(ouro.pip_size, 0.1)
  // Índices e cripto contam-se em PONTOS: «30» no US30 tem de ser 30 de preço, não 0,30.
  assert.equal(simboloDaCorretora('US30', 1).pip_size, 1)
  assert.equal(simboloDaCorretora('EURUSD', 5).pip_size, 0.0001)
})

verificar('SEM configuração não se faz nada — nem com a posição em grande lucro', () => {
  const d = decidirGestaoReal(pos({ precoAtual: 3100 }), cfg(), ouro, { symbol: 'XAUUSD', bid: 3100, ask: 3100.1 })
  assert.equal(d.agir, false)
})

verificar('SEM preço da corretora não se mexe num SL real', () => {
  // O nosso feed é indicativo: `precoDeGestao` recusa-o de propósito.
  const p = precoDeGestao(pos(), { symbol: 'XAUUSD', bid: 3100, ask: 3100.1, em: '', indicativo: true })
  assert.equal(p, null, 'um preço indicativo não pode servir para mover um SL real')
  const d = decidirGestaoReal(pos(), cfg({ be_gatilho: 3, be_offset: 0.2 }), ouro, p)
  assert.equal(d.agir, false)
  // Já a cotação da própria corretora serve.
  assert.notEqual(precoDeGestao(pos(), { symbol: 'XAUUSD', bid: 3100, ask: 3100.1, em: '', indicativo: false }), null)
  // E o preço que vem colado à posição (o MT5 dá-o) é o preferido.
  assert.deepEqual(precoDeGestao(pos({ precoAtual: 3050 }), null), { symbol: 'XAUUSD', bid: 3050, ask: 3050 })
})

verificar('break-even: dispara no gatilho e leva o SL para a entrada + folga', () => {
  const p = pos({ precoAtual: 3003.5 })
  const d = decidirGestaoReal(p, cfg({ be_gatilho: 3, be_offset: 0.2 }), ouro, precoDeGestao(p, null))
  assert.equal(d.agir, true)
  assert.equal(d.agir && d.motivo, 'break_even')
  assert.equal(d.agir && d.sl, 3000.2)
  assert.equal(d.beFeito, true, 'o break-even tem de ficar marcado como feito')
})

verificar('break-even antes do gatilho não mexe em nada', () => {
  const p = pos({ precoAtual: 3001 })
  const d = decidirGestaoReal(p, cfg({ be_gatilho: 3, be_offset: 0.2 }), ouro, precoDeGestao(p, null))
  assert.equal(d.agir, false)
  assert.equal(d.beFeito, false)
})

verificar('break-even só acontece UMA vez: com be_feito não volta a puxar o SL para trás', () => {
  const p = pos({ precoAtual: 3010, sl: 3005 }) // o trailing já levou o SL acima do BE
  const d = decidirGestaoReal(p, cfg({ be_gatilho: 3, be_offset: 0.2, be_feito: true }), ouro, precoDeGestao(p, null))
  assert.equal(d.agir, false, 'repetir o break-even era alargar o stop de volta à entrada')
})

verificar('trailing: com a ativação atingida põe o SL à distância pedida', () => {
  const p = pos({ precoAtual: 3010, sl: 2990 })
  const d = decidirGestaoReal(p, cfg({ trailing_distancia: 5, trailing_ativacao: 5 }), ouro, precoDeGestao(p, null))
  assert.equal(d.agir, true)
  assert.equal(d.agir && d.motivo, 'trailing')
  assert.equal(d.agir && d.sl, 3005)
})

verificar('trailing antes da ativação fica à espera', () => {
  const p = pos({ precoAtual: 3002, sl: 2990 })
  assert.equal(decidirGestaoReal(p, cfg({ trailing_distancia: 5, trailing_ativacao: 5 }), ouro, precoDeGestao(p, null)).agir, false)
})

verificar('o trailing NUNCA alarga o stop quando o preço volta para trás', () => {
  const p = pos({ precoAtual: 3006, sl: 3005 }) // o SL já está a 3005; 3006-5 = 3001 seria pior
  const d = decidirGestaoReal(p, cfg({ trailing_distancia: 5, trailing_ativacao: 5 }), ouro, precoDeGestao(p, null))
  assert.equal(d.agir, false, 'afrouxar um stop é a única coisa que um trailing não pode fazer')
})

verificar('numa VENDA o trailing desce o SL (a direcção não pode estar invertida)', () => {
  const p = pos({ direcao: 'sell', precoEntrada: 3000, precoAtual: 2990, sl: 3010 })
  const d = decidirGestaoReal(p, cfg({ trailing_distancia: 5, trailing_ativacao: 5 }), ouro, precoDeGestao(p, null))
  assert.equal(d.agir, true)
  assert.equal(d.agir && d.sl, 2995, 'numa venda o SL fica ACIMA do preço, e aperta descendo')
})

verificar('um SL que caísse do lado errado do preço é recusado (fecharia a posição a mercado)', () => {
  // Distância 0,05 com o preço a 3000,02 daria um SL a 2999,97 — do lado certo. Aqui forçamos o
  // absurdo: distância maior do que o próprio preço já não pode passar do lado seguro.
  const p = pos({ precoEntrada: 1, precoAtual: 1.5, sl: null })
  const d = decidirGestaoReal(p, cfg({ trailing_distancia: 5, trailing_ativacao: 0 }), ouro, precoDeGestao(p, null))
  assert.equal(d.agir, false, 'um SL negativo/acima do preço tem de ser recusado, nunca enviado')
})

verificar('validar o pedido do ecrã: folga tem de ser menor que o gatilho', () => {
  assert.equal(validarConfigPedida({ be_gatilho: 3, be_offset: 3 }, ouro).ok, false)
  assert.equal(validarConfigPedida({ trailing_distancia: 0.01 }, ouro).ok, false, 'trailing abaixo de 1 pip não serve')
  const v = validarConfigPedida({ be_gatilho: 3, be_offset: 0.2, trailing_distancia: 5, trailing_ativacao: 0 }, ouro)
  assert.equal(v.ok, true)
  assert.equal(v.ok && v.config.trailing_ativacao, null, 'ativação 0 = trailing a seguir desde já')
})

verificar('uma configuração vazia não vale uma ida à corretora', () => {
  assert.equal(configTemGestao(CONFIG_VAZIA), false)
  assert.equal(configTemGestao(cfg({ be_gatilho: 3, be_feito: true })), false, 'BE já feito e sem trailing: nada a fazer')
  assert.equal(configTemGestao(cfg({ trailing_distancia: 5 })), true)
})

// ── 2. a ligação (isto é o que impede o defeito de voltar) ───────────────────────────────────────

const puro = readFileSync(join(RAIZ, 'lib/webtrader/gestao-auto-real.ts'), 'utf8')
const servidor = readFileSync(join(RAIZ, 'lib/webtrader/gestao-auto-servidor.ts'), 'utf8')
const rota = readFileSync(join(RAIZ, 'app/api/webtrader/[plataforma]/[acao]/route.ts'), 'utf8')
const ecra = readFileSync(join(RAIZ, 'components/funded/gestao-auto.tsx'), 'utf8')
const vercel = readFileSync(join(RAIZ, 'vercel.json'), 'utf8')
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

verificar('a regra continua a ser a do motor das mestres (decidirGestao), não uma cópia', () => {
  assert.match(puro, /from '@\/lib\/mtmfunded\/simulado\/avancadas'/)
  assert.match(puro, /\bdecidirGestao\(/)
})

verificar('há uma rota que GRAVA a gestão das contas de corretora', () => {
  assert.match(rota, /'gestao-auto'/, 'sem acção na rota, os botões não têm onde gravar')
  assert.match(rota, /guardarGestaoAuto/)
})

verificar('há um EXECUTOR ligado — e nos dois ritmos (leitura do ecrã + cron)', () => {
  assert.match(rota, /gestaoAutoAoLerPosicoes/, 'a leitura de posições tem de correr a gestão')
  assert.match(vercel, /\/api\/cron\/webtrader-gestao-auto/, 'sem cron, a gestão morre ao fechar o separador')
  assert.match(servidor, /adaptador\.modificar\(/, 'o executor tem de mexer no SL pelo adaptador da corretora')
})

verificar('o executor passa por QUALQUER plataforma pelo adaptador (não é só MT5 ou só TradeLocker)', () => {
  assert.match(servidor, /AdaptadorCorretora/)
  assert.doesNotMatch(semComentarios(servidor), /tradelocker'\s*\)\s*\{[\s\S]{0,80}modificar/, 'a execução não pode ser especial por plataforma')
})

verificar('o ecrã das contas de corretora deixou de gravar a gestão no localStorage', () => {
  // Sem comentários: o ficheiro EXPLICA o defeito citando a chave antiga, e a guarda apanhava-se a si mesma.
  assert.doesNotMatch(semComentarios(ecra), /webtrader_gestao_auto_real/, 'era ali que a gestão morria: preferência guardada, nada executado')
  assert.match(ecra, /EstadoGestaoCorretora/, 'o estado dos botões tem de vir do servidor')
})

verificar('esta camada NUNCA fecha, abre ou cancela — só move o SL', () => {
  const corpo = semComentarios(puro) + semComentarios(servidor)
  for (const proibido of ['\\.fechar\\(', '\\.enviarOrdem\\(', '\\.cancelar\\(']) {
    assert.doesNotMatch(corpo, new RegExp(proibido), `a gestão automática de uma conta real não pode chamar ${proibido}`)
  }
})

verificar('as contas MTM Funded não passam pelo executor novo (dois motores no mesmo SL)', () => {
  assert.match(rota, /plataforma === 'mtmfunded'\) throw new ErroCorretora\(400, 'A gestão das contas MTM Funded/)
})



// ── o que o primeiro teste real do Ricardo ensinou (25/09) ─────────────────
const executor = readFileSync(join(RAIZ, 'lib/webtrader/gestao-auto-servidor.ts'), 'utf8')
verificar('«nothing to change» conta como aplicado', () => {
  // A TradeLocker responde assim quando o SL JÁ está onde o queremos pôr — acontece sempre que não
  // conseguimos ler o SL actual (na TradeLocker ele vem como ordem ligada e pode não vir na lista).
  // Mostrar isso ao trader como «a corretora recusou» é assustá-lo por nada, a cada passagem.
  if (!/nothing to change/i.test(executor)) throw new Error('a recusa benigna voltou a contar como erro')
})
verificar('não apaga a configuração com uma leitura vazia', () => {
  // Uma lista de posições vazia tanto é «não há nada aberto» como «a corretora respondeu mal».
  // Como aqui se APAGA o que o dono configurou, só se limpa com prova de que a leitura funcionou.
  if (!/const fechadas = posicoes\.length/.test(executor)) {
    throw new Error('voltou a apagar configuração sem provar que a leitura das posições funcionou')
  }
})

if (falhas.length) {
  console.error(`gestao-auto-real: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('gestao-auto-real: BE uma vez, trailing só aperta, sem preço da corretora não age, executor ligado nos dois ritmos ✓')
