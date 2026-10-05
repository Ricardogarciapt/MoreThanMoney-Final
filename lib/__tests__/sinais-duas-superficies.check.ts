import { existsSync as existsSync } from 'node:fs'
const RAIZ_SDS = process.cwd()
/**
 * AS DUAS SUPERFÍCIES DE SINAIS CONTAM A MESMA HISTÓRIA.
 *
 * Correr: npx tsx lib/__tests__/sinais-duas-superficies.check.ts
 *
 * O separador Tap to Trade da app-mobile (`components/mobile/tap-to-trade-feed.tsx`) e o /sinais
 * da MTM Auto (`app/(app)/sinais` daquele repositório) mostram os MESMOS sinais às mesmas pessoas.
 * Chegaram lá por caminhos diferentes — um lê as mensagens do chat, o outro lê o acompanhamento
 * do motor — e por isso cada um foi juntando a sua própria versão das regras.
 *
 * O que se prova aqui:
 *   1. a janela de aceitação é UMA (`lib/mtmcopy/t2t-janela-regra`) e decide pela ordem da rota
 *      que abre a ordem — fechado, stop batido, cinco minutos, zona, 24 horas;
 *   2. as FRASES da recusa são as que `app/api/mtmcopy/tap-to-trade` responde, à letra: o ecrã
 *      nunca promete o contrário do que vai acontecer;
 *   3. o ecrã do site já não tem a sua segunda regra de «isto é um sinal de entrada» — é a da
 *      `lib` (`isT2TEntrySignal`), a mesma que o `signal-tracker` usa para admitir;
 *   4. o NOME de um canal vem de uma tabela só, a mesma do admin.
 *
 * ── O caso que isto teria apanhado ───────────────────────────────────────────────────────────
 * A 21/09 a conta mestre do Sensei passou a escrever «Entrada executada» onde antes escrevia
 * «Entrada activada». O separador T2T do site tinha um portão próprio que exigia a palavra
 * «activada» — e sete sinais do Sensei, em três semanas, deixaram de aparecer lá. O motor
 * seguia-os, a conta-espelho abria-os e o /sinais da MTM Auto mostrava-os: só o cliente do site
 * é que não teve como aceitar nenhum.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  JANELA_MERCADO_MS,
  JANELA_PENDENTE_MS,
  MOTIVOS,
  stopJaBatido,
  vereditoDaJanela,
  type LinhaDeAcompanhamento,
} from '@/lib/mtmcopy/t2t-janela-regra'
import { isT2TEntrySignal } from '@/lib/mtmcopy/t2t-source'
import { ROTULOS_CANAIS_T2T } from '@/lib/mtmcopy/rotulos-canais'

const RAIZ = join(__dirname, '..', '..')
const ler = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

const AGORA = Date.now()
const haMinutos = (m: number) => new Date(AGORA - m * 60_000).toISOString()

/** Uma linha de acompanhamento sã: ouro, compra a 4600 com stop a 4590, acabada de publicar. */
function linha(mudanca: Partial<LinhaDeAcompanhamento> = {}): LinhaDeAcompanhamento {
  return {
    created_at: haMinutos(1),
    status: 'active',
    entry_hit_at: null,
    exits_done: 0,
    closed_at: null,
    live_pips: 0,
    entry: 4600,
    sl: 4590,
    symbol: 'XAUUSD',
    ...mudanca,
  }
}

// ── 1. A janela, pela ordem da rota que abre ──────────────────────────────────────────────────
{
  assert.equal(vereditoDaJanela(linha()).aceitavel, true, 'sinal acabado de sair aceita-se')

  const fechado = vereditoDaJanela(linha({ status: 'closed' }))
  assert.equal(fechado.aceitavel, false)
  assert.equal(fechado.code, 'closed')

  // O stop batido fecha o sinal a QUALQUER altura — mesmo dentro dos cinco minutos, mesmo com o
  // estado ainda por escrever. 4600→4590 são 10 pontos = 100 pips de ouro.
  const stop = vereditoDaJanela(linha({ live_pips: -100 }))
  assert.equal(stop.aceitavel, false)
  assert.equal(stop.code, 'stop_hit')
  assert.equal(vereditoDaJanela(linha({ live_pips: -99 })).aceitavel, true, '99 pips ainda não é o stop')

  // Passados os cinco minutos: sem NÍVEL de entrada era uma entrada a mercado, e essa morreu.
  const idoso = { created_at: haMinutos(10) }
  assert.equal(vereditoDaJanela(linha({ ...idoso, entry: null })).code, 'expired')
  assert.equal(vereditoDaJanela(linha(idoso)).aceitavel, true, 'com nível, o setup continua de pé')

  // … mas só enquanto o preço não lá chegou.
  assert.equal(vereditoDaJanela(linha({ ...idoso, entry_hit_at: haMinutos(3) })).code, 'out_of_zone')
  assert.equal(vereditoDaJanela(linha({ ...idoso, exits_done: 1 })).code, 'out_of_zone')

  // … e só dentro de 24h: um setup de ontem não se abre hoje.
  assert.equal(vereditoDaJanela(linha({ created_at: haMinutos(25 * 60) })).code, 'expired')

  assert.equal(JANELA_MERCADO_MS, 5 * 60 * 1000)
  assert.equal(JANELA_PENDENTE_MS, 24 * 60 * 60 * 1000)
}

// ── 2. As frases são as da rota que recusa ────────────────────────────────────────────────────
{
  const rota = ler('app/api/mtmcopy/tap-to-trade/route.ts')
  for (const code of ['closed', 'out_of_zone', 'expired'] as const) {
    assert.ok(
      rota.includes(MOTIVOS[code]),
      `a frase de «${code}» tem de ser a que a rota responde — está «${MOTIVOS[code]}»`,
    )
  }
}

// ── 3. O stop batido conta-se numa fonte só ───────────────────────────────────────────────────
{
  assert.equal(stopJaBatido({ live_pips: -100, entry: 4600, sl: 4590, symbol: 'XAUUSD' }), true)
  // EURUSD: 4 casas. 1.1000→1.0980 são 20 pips (a fronteira exacta é vírgula flutuante — o motor
  // escreve `live_pips` arredondado, por isso o que interessa provar é o de cada lado dela).
  assert.equal(stopJaBatido({ live_pips: -21, entry: 1.1, sl: 1.098, symbol: 'EURUSD' }), true)
  assert.equal(stopJaBatido({ live_pips: -19, entry: 1.1, sl: 1.098, symbol: 'EURUSD' }), false)
  // Sem números não se inventa um stop batido.
  assert.equal(stopJaBatido({ live_pips: null, entry: 4600, sl: 4590, symbol: 'XAUUSD' }), false)

  const rotaViva = ler('app/api/mtmcopy/signal-live/route.ts')
  assert.ok(rotaViva.includes('stopJaBatido(r)'), 'a rota do resultado ao vivo usa a regra, não uma cópia')
}

// ── 4. O ecrã T2T da app-mobile saiu (05/10/2026): o T2T vive só na MTM Auto ───────────────
{
  assert.ok(!existsSync(join(RAIZ_SDS, 'components/mobile/tap-to-trade-feed.tsx')), 'o ecrã T2T antigo da app-mobile não volta')
  // O caso real: «Entrada executada» é o que a mestre do Sensei escreve desde 21/09.
  const senseiNovo =
    '🔴 XAUUSD · VENDA\n📌 MTM Auto Sensei · Entrada executada\n🎯 Entrada: 4281.01\n🛑 SL: 4290.00\n🎯 TP1: 4260.00'
  assert.equal(isT2TEntrySignal('sensei-scanner', senseiNovo), true, 'a palavra da mestre mudou e o sinal tem de continuar a existir')
  assert.equal(isT2TEntrySignal('sensei-scanner', '🎯 Alvo 1 · XAUUSD 🔵 COMPRA · +75 pips'), false)
  assert.equal(isT2TEntrySignal('premium-ideas', 'Performance do dia: total 120 pips, TP1 4600'), false)
}

// ── 5. O nome de um canal é um só ─────────────────────────────────────────────────────────────
{
  // O admin e o chat chamam-lhe assim; as apps tinham outro nome («Premium · Ouro»).
  assert.equal(ROTULOS_CANAIS_T2T['premium-ideas'], 'MTM Auto Premium')
  assert.equal(ROTULOS_CANAIS_T2T['sensei-scanner'], 'MTM Auto Sensei')
  // Os slugs da cripto dizem todos a mesma coisa: o canal é um só, «Ideias de Cripto».
  assert.equal(ROTULOS_CANAIS_T2T['aurum-flow'], 'Ideias de Cripto')
  assert.equal(ROTULOS_CANAIS_T2T['cripto-perps'], ROTULOS_CANAIS_T2T['aurum-flow'])
  assert.equal(ROTULOS_CANAIS_T2T['golden-moves'], ROTULOS_CANAIS_T2T['aurum-flow'])
}

console.log('sinais nas duas superfícies: as mesmas regras, as mesmas palavras — OK')
