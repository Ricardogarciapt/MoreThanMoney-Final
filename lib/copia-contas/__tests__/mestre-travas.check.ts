/**
 * AS TRAVAS DA MESTRE — a guarda.
 *
 * Estas cinco travas são as que impedem o prejuízo em cadeia: uma mestre que emite fora de horas,
 * em cima de uma notícia, à sexta à noite, já a perder o dia ou com a margem no fim, manda a ordem
 * para TODAS as contas que a seguem. Por isso não podem depender de um ecrã nem de alguém olhar.
 *
 * O que esta guarda protege, por ordem de dano:
 *  1. NÃO TRAVAR POR FALTA DE DADOS. Uma trava que dispara sem equity, sem margem ou com o jsonb
 *     corrompido pára a estratégia inteira e parece prudência — é uma avaria silenciosa.
 *  2. A janela que PASSA A MEIA-NOITE. `22:00→06:00` é a janela normal do ouro; tratá-la como um
 *     intervalo vazio fechava a estratégia 24 h por dia.
 *  3. O DRAWDOWN medido contra a equity DO DIA, não contra o saldo inicial da conta.
 *  4. SÁBADO E DOMINGO contam como depois do fecho — um relay atrasado entrega sinais de sexta.
 *
 *   npx tsx lib/copia-contas/__tests__/mestre-travas.check.ts
 */
import assert from 'node:assert/strict'
import {
  depoisDoFechoSemanal, drawdownDiarioExcedido, emSombraDeNoticia, escreverTravas, foraDaJanela,
  lerTravas, margemInsuficiente, minutosDaHora, SEM_TRAVAS, temTravas, travasDaMestre,
  type EventoEconomico,
} from '../mestre-travas'
import { GESTAO_VAZIA, lerGestaoMestre, normalizarGestaoMestre, textoDaGestao } from '../mestre-gestao'

const d = (iso: string) => new Date(iso)
let n = 0
const teste = (nome: string, f: () => void) => { f(); n++; console.log(`  ok  ${nome}`) }

console.log('\nTRAVAS DA MESTRE\n')

// ── leitura do jsonb ────────────────────────────────────────────────────────

teste('jsonb vazio, nulo ou lixo → nenhuma trava (nunca travar por configuração corrompida)', () => {
  for (const v of [null, undefined, {}, 'texto', 42, [], { travas: null }, { travas: 'x' }]) {
    assert.deepEqual(lerTravas(v), SEM_TRAVAS, `${JSON.stringify(v)} devia dar SEM_TRAVAS`)
    assert.equal(temTravas(lerTravas(v)), false)
  }
})

teste('as travas vivem em sinais_config.travas e não colidem com a gestão que já lá está', () => {
  // A configuração real do Sensei (29/09) mais as travas: o que já existia tem de ficar intacto.
  const cfg = {
    perfil: 'zona', beGatilhoPips: 35, trailingInicioPips: 40,
    travas: { janela: { de: '07:00', ate: '20:00', dias: [1, 2, 3, 4, 5] }, maxDdDiarioPct: 3 },
  }
  const t = lerTravas(cfg)
  assert.equal(t.janela?.de, '07:00')
  assert.deepEqual(t.janela?.dias, [1, 2, 3, 4, 5])
  assert.equal(t.maxDdDiarioPct, 3)
  assert.equal(t.noticias, null)
  // E o caminho de volta não inventa chaves nem apaga as que estavam desligadas.
  assert.deepEqual(escreverTravas(t), { janela: { de: '07:00', ate: '20:00', dias: [1, 2, 3, 4, 5] }, maxDdDiarioPct: 3 })
})

teste('horas inválidas não criam janela (ler «25:00» como janela fechava a estratégia)', () => {
  assert.equal(minutosDaHora('25:00'), null)
  assert.equal(minutosDaHora('7:00'), null) // sem o zero à frente não é HH:MM
  assert.equal(minutosDaHora('12:60'), null)
  assert.equal(minutosDaHora('00:00'), 0)
  assert.equal(minutosDaHora('23:59'), 1439)
  for (const j of [{ de: '25:00', ate: '20:00' }, { de: '07:00', ate: 'x' }, { de: '07:00', ate: '07:00' }]) {
    assert.equal(lerTravas({ travas: { janela: j } }).janela, null, `${JSON.stringify(j)} não é janela`)
  }
})

teste('números não positivos desligam a trava (0 % de drawdown travaria tudo para sempre)', () => {
  assert.equal(lerTravas({ travas: { maxDdDiarioPct: 0 } }).maxDdDiarioPct, null)
  assert.equal(lerTravas({ travas: { maxDdDiarioPct: -5 } }).maxDdDiarioPct, null)
  assert.equal(lerTravas({ travas: { maxDdDiarioPct: 'abc' } }).maxDdDiarioPct, null)
  assert.equal(lerTravas({ travas: { margemLivreMinPct: 0 } }).margemLivreMinPct, null)
  assert.equal(lerTravas({ travas: { maxDdDiarioPct: 3.5 } }).maxDdDiarioPct, 3.5)
})

teste('notícias só existem com uma janela de minutos > 0', () => {
  assert.equal(lerTravas({ travas: { noticias: { minutosAntes: 0, minutosDepois: 0 } } }).noticias, null)
  const t = lerTravas({ travas: { noticias: { minutosAntes: 15, minutosDepois: 0 } } })
  assert.equal(t.noticias?.minutosAntes, 15)
  assert.equal(t.noticias?.impacto, 'alto', 'sem impacto declarado, só o alto trava')
})

// ── janela horária ──────────────────────────────────────────────────────────

teste('janela normal 07:00–20:00 UTC', () => {
  const j = { de: '07:00', ate: '20:00', dias: [] }
  assert.equal(foraDaJanela(j, d('2026-09-29T12:00:00Z')), null)
  assert.equal(foraDaJanela(j, d('2026-09-29T07:00:00Z')), null, 'o início é inclusive')
  assert.match(String(foraDaJanela(j, d('2026-09-29T20:00:00Z'))), /fora da janela/, 'o fim é exclusive')
  assert.match(String(foraDaJanela(j, d('2026-09-29T06:59:00Z'))), /07:00–20:00/)
  // A mensagem tem de dizer as horas — «travado» sem número não se depura.
  assert.match(String(foraDaJanela(j, d('2026-09-29T23:30:00Z'))), /agora são 23:30 UTC/)
})

teste('janela que PASSA A MEIA-NOITE (22:00–06:00) — o caso do ouro', () => {
  const j = { de: '22:00', ate: '06:00', dias: [] }
  assert.equal(foraDaJanela(j, d('2026-09-29T23:00:00Z')), null)
  assert.equal(foraDaJanela(j, d('2026-09-29T02:00:00Z')), null)
  assert.equal(foraDaJanela(j, d('2026-09-29T22:00:00Z')), null)
  assert.match(String(foraDaJanela(j, d('2026-09-29T12:00:00Z'))), /fora da janela/)
  assert.match(String(foraDaJanela(j, d('2026-09-29T06:00:00Z'))), /fora da janela/)
})

teste('dias da semana: 2026-09-29 é uma terça (dia 2)', () => {
  assert.equal(d('2026-09-29T12:00:00Z').getUTCDay(), 2)
  assert.equal(foraDaJanela({ de: '00:00', ate: '23:59', dias: [2] }, d('2026-09-29T12:00:00Z')), null)
  assert.match(String(foraDaJanela({ de: '00:00', ate: '23:59', dias: [1] }, d('2026-09-29T12:00:00Z'))), /fora dos dias/)
  assert.equal(foraDaJanela({ de: '00:00', ate: '23:59', dias: [] }, d('2026-09-29T12:00:00Z')), null, 'dias vazio = todos')
})

teste('sem janela configurada não trava nada', () => {
  assert.equal(foraDaJanela(null, d('2026-09-29T03:00:00Z')), null)
})

// ── fecho de fim de semana ──────────────────────────────────────────────────

teste('sexta às 20:00 UTC fecha; e sábado e domingo continuam fechados', () => {
  const f = { dia: 5, hora: '20:00' }
  // 2026-10-02 é sexta (dia 5), 03 sábado, 04 domingo, 05 segunda.
  assert.equal(d('2026-10-02T12:00:00Z').getUTCDay(), 5)
  assert.equal(depoisDoFechoSemanal(f, d('2026-10-02T19:59:00Z')), null, 'antes da hora ainda abre')
  assert.match(String(depoisDoFechoSemanal(f, d('2026-10-02T20:00:00Z'))), /gap de domingo/)
  assert.match(String(depoisDoFechoSemanal(f, d('2026-10-03T09:00:00Z'))), /fecho de fim de semana/, 'sábado')
  assert.match(String(depoisDoFechoSemanal(f, d('2026-10-04T09:00:00Z'))), /fecho de fim de semana/, 'domingo')
  assert.equal(depoisDoFechoSemanal(f, d('2026-10-05T09:00:00Z')), null, 'segunda reabre')
  assert.equal(depoisDoFechoSemanal(f, d('2026-09-30T23:00:00Z')), null, 'quarta à noite abre')
})

teste('sem fecho configurado não trava', () => {
  assert.equal(depoisDoFechoSemanal(null, d('2026-10-03T09:00:00Z')), null)
})

// ── notícias ────────────────────────────────────────────────────────────────

const NFP: EventoEconomico = { em: '2026-10-02T12:30:00Z', titulo: 'Non-Farm Payrolls', impacto: 'alto', moeda: 'USD' }
const PMI: EventoEconomico = { em: '2026-10-02T08:00:00Z', titulo: 'PMI', impacto: 'medio', moeda: 'EUR' }

teste('a janela de −30/+30 min em volta do NFP trava; fora dela não', () => {
  const cfg = { minutosAntes: 30, minutosDepois: 30, impacto: 'alto' as const, moedas: [] }
  assert.match(String(emSombraDeNoticia(cfg, [NFP], 'XAUUSD', d('2026-10-02T12:25:00Z'))), /Non-Farm Payrolls/)
  assert.match(String(emSombraDeNoticia(cfg, [NFP], 'XAUUSD', d('2026-10-02T12:30:00Z'))), /Non-Farm/)
  assert.match(String(emSombraDeNoticia(cfg, [NFP], 'XAUUSD', d('2026-10-02T13:00:00Z'))), /Non-Farm/, 'o limite é inclusive')
  assert.equal(emSombraDeNoticia(cfg, [NFP], 'XAUUSD', d('2026-10-02T11:59:00Z')), null)
  assert.equal(emSombraDeNoticia(cfg, [NFP], 'XAUUSD', d('2026-10-02T13:01:00Z')), null)
})

teste('impacto «alto» ignora eventos médios; «medio» apanha os dois', () => {
  const so = { minutosAntes: 30, minutosDepois: 30, impacto: 'alto' as const, moedas: [] }
  const ambos = { ...so, impacto: 'medio' as const }
  assert.equal(emSombraDeNoticia(so, [PMI], 'EURUSD', d('2026-10-02T08:00:00Z')), null)
  assert.match(String(emSombraDeNoticia(ambos, [PMI], 'EURUSD', d('2026-10-02T08:00:00Z'))), /PMI/)
  assert.match(String(emSombraDeNoticia(ambos, [NFP], 'EURUSD', d('2026-10-02T12:30:00Z'))), /Non-Farm/, '«medio» é médio OU acima')
})

teste('moedas vazias travam TUDO (o lado seguro); com filtro, o símbolo tem de conter a moeda', () => {
  const tudo = { minutosAntes: 30, minutosDepois: 30, impacto: 'alto' as const, moedas: [] }
  assert.match(String(emSombraDeNoticia(tudo, [NFP], 'EURGBP', d('2026-10-02T12:30:00Z'))), /Non-Farm/)
  const soUsd = { ...tudo, moedas: ['USD'] }
  assert.match(String(emSombraDeNoticia(soUsd, [NFP], 'XAUUSD', d('2026-10-02T12:30:00Z'))), /Non-Farm/)
  assert.equal(emSombraDeNoticia(soUsd, [NFP], 'EURGBP', d('2026-10-02T12:30:00Z')), null, 'o par não tem USD')
  assert.equal(emSombraDeNoticia({ ...tudo, moedas: ['EUR'] }, [NFP], 'XAUUSD', d('2026-10-02T12:30:00Z')), null, 'o evento é USD')
})

teste('lista de eventos vazia, datas inválidas ou trava desligada não travam', () => {
  const cfg = { minutosAntes: 30, minutosDepois: 30, impacto: 'alto' as const, moedas: [] }
  assert.equal(emSombraDeNoticia(cfg, [], 'XAUUSD', d('2026-10-02T12:30:00Z')), null)
  assert.equal(emSombraDeNoticia(cfg, [{ ...NFP, em: 'ontem' }], 'XAUUSD', d('2026-10-02T12:30:00Z')), null)
  assert.equal(emSombraDeNoticia(null, [NFP], 'XAUUSD', d('2026-10-02T12:30:00Z')), null)
})

// ── drawdown diário ─────────────────────────────────────────────────────────

teste('o drawdown mede-se contra a equity DO INÍCIO DO DIA', () => {
  // Mestre de 10 000 que abriu o dia em 10 250 e está em 9 900: perdeu 3,41% HOJE, embora ainda
  // esteja praticamente na linha de água da conta. Medir contra o saldo inicial dava 1% e não travava.
  const m = drawdownDiarioExcedido(3, { equity: 9_900, equityInicioDoDia: 10_250 })
  assert.match(String(m), /3\.41%/)
  assert.match(String(m), /limite 3%/)
  assert.match(String(m), /cadeia de seguidores/, 'a mensagem tem de dizer o efeito na cadeia')
  assert.equal(drawdownDiarioExcedido(4, { equity: 9_900, equityInicioDoDia: 10_250 }), null)
})

teste('o limite é inclusive: exactamente no limite, trava', () => {
  assert.notEqual(drawdownDiarioExcedido(3, { equity: 9_700, equityInicioDoDia: 10_000 }), null)
  assert.equal(drawdownDiarioExcedido(3, { equity: 9_701, equityInicioDoDia: 10_000 }), null)
})

teste('mestre em LUCRO no dia nunca trava', () => {
  assert.equal(drawdownDiarioExcedido(1, { equity: 10_500, equityInicioDoDia: 10_000 }), null)
})

teste('FALTA DE DADOS NÃO TRAVA — o defeito mais caro que esta guarda evita', () => {
  for (const x of [
    { equity: null, equityInicioDoDia: 10_000 },
    { equity: 9_000, equityInicioDoDia: null },
    { equity: 9_000, equityInicioDoDia: 0 },
    { equity: 9_000, equityInicioDoDia: -5 },
    { equity: Number.NaN, equityInicioDoDia: 10_000 },
  ]) {
    assert.equal(drawdownDiarioExcedido(3, x), null, `${JSON.stringify(x)} não pode travar`)
  }
  assert.equal(drawdownDiarioExcedido(null, { equity: 1, equityInicioDoDia: 10_000 }), null, 'trava desligada')
})

// ── margem ──────────────────────────────────────────────────────────────────

teste('margem livre abaixo da percentagem de segurança trava', () => {
  assert.match(String(margemInsuficiente(30, { margemLivre: 2_000, equity: 10_000 })), /20\.0%/)
  assert.equal(margemInsuficiente(30, { margemLivre: 3_000, equity: 10_000 }), null, 'no limite passa')
  assert.equal(margemInsuficiente(30, { margemLivre: null, equity: 10_000 }), null, 'sem dados não trava')
  assert.equal(margemInsuficiente(null, { margemLivre: 0, equity: 10_000 }), null, 'desligada')
})

// ── as cinco juntas ─────────────────────────────────────────────────────────

teste('sem travas configuradas, abre sempre', () => {
  const v = travasDaMestre(SEM_TRAVAS, {
    agora: d('2026-10-03T23:00:00Z'), symbol: 'XAUUSD', eventos: [NFP],
    equity: 1, equityInicioDoDia: 10_000, margemLivre: 0,
  })
  assert.equal(v.podeAbrir, true)
  assert.equal(v.motivo, null)
})

teste('o veredicto acumula TODOS os motivos, não só o primeiro', () => {
  const t = lerTravas({
    travas: {
      // `dias` de segunda a sexta — com `dias: []` um sábado às 12:30 estaria DENTRO da janela
      // (que é o comportamento certo: a janela fala de horas, o fecho semanal fala de dias).
      janela: { de: '07:00', ate: '20:00', dias: [1, 2, 3, 4, 5] },
      fimDeSemana: { dia: 5, hora: '20:00' },
      maxDdDiarioPct: 2,
      margemLivreMinPct: 30,
      noticias: { minutosAntes: 30, minutosDepois: 30, impacto: 'alto' },
    },
  })
  // Sábado às 12:30, em cima do NFP, a perder 5% do dia e com a margem no fim: as cinco falham.
  const v = travasDaMestre(t, {
    agora: d('2026-10-03T12:30:00Z'), symbol: 'XAUUSD', eventos: [{ ...NFP, em: '2026-10-03T12:30:00Z' }],
    equity: 9_500, equityInicioDoDia: 10_000, margemLivre: 1_000,
  })
  assert.equal(v.podeAbrir, false)
  assert.equal(v.motivos.length, 5, `esperava 5 motivos, deu ${v.motivos.length}: ${v.motivo}`)
  assert.match(String(v.motivo), / · /, 'os motivos juntam-se num texto legível')
})

teste('uma terça de manhã dentro de tudo abre, com as cinco travas ligadas', () => {
  const t = lerTravas({
    travas: {
      janela: { de: '07:00', ate: '20:00', dias: [1, 2, 3, 4, 5] },
      fimDeSemana: { dia: 5, hora: '20:00' },
      maxDdDiarioPct: 3,
      margemLivreMinPct: 30,
      noticias: { minutosAntes: 30, minutosDepois: 30, impacto: 'alto' },
    },
  })
  const v = travasDaMestre(t, {
    agora: d('2026-09-29T10:00:00Z'), symbol: 'XAUUSD', eventos: [NFP],
    equity: 10_100, equityInicioDoDia: 10_000, margemLivre: 8_000,
  })
  assert.equal(v.podeAbrir, true, v.motivo ?? '')
})

// ── automações de saída (mestre-gestao.ts) ──────────────────────────────────

console.log('\nAUTOMAÇÕES DE SAÍDA DA MESTRE\n')

teste('lê a configuração real do GoldKiller (29/09) sem mexer nela', () => {
  const g = lerGestaoMestre({
    perfil: 'risco', semTrailing: false, beFracaoDoRisco: 0.3,
    beOffsetFracaoDoRisco: 0.05, trailingFracaoDoRisco: 0.5, trailingInicioFracaoDoRisco: 1,
  })
  assert.equal(g.beFracaoDoRisco, 0.3)
  assert.equal(g.beOffsetFracaoDoRisco, 0.05)
  assert.equal(g.trailingInicioFracaoDoRisco, 1)
  assert.equal(g.semTrailing, false)
  assert.match(textoDaGestao(g), /BE a 0,3×/)
})

teste('«semTrailing» aparece no texto como o alvo fixo, não como um campo vazio', () => {
  assert.match(textoDaGestao(lerGestaoMestre({ semTrailing: true, beFracaoDoRisco: 1 })), /SEM trailing: fecha no alvo fixo/)
})

teste('valores FORA dos limites lêem-se como ausentes (o ecrã não promete o que o motor arredonda)', () => {
  assert.equal(lerGestaoMestre({ beFracaoDoRisco: 0.01 }).beFracaoDoRisco, null, 'abaixo do mínimo')
  assert.equal(lerGestaoMestre({ beFracaoDoRisco: 99 }).beFracaoDoRisco, null, 'acima do máximo')
  assert.equal(lerGestaoMestre({ beFracaoDoRisco: 'abc' }).beFracaoDoRisco, null)
  assert.deepEqual(lerGestaoMestre(null), GESTAO_VAZIA)
  assert.deepEqual(lerGestaoMestre('texto'), GESTAO_VAZIA)
})

teste('um campo NÃO ENVIADO mantém o que estava — nunca apaga por omissão', () => {
  const antes = { perfil: 'risco', beFracaoDoRisco: 0.3, trailingFracaoDoRisco: 0.5 }
  const r = normalizarGestaoMestre({ trailingFracaoDoRisco: 0.8 }, antes)
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.chaves.beFracaoDoRisco, 0.3, 'o BE que não foi tocado tem de sobreviver')
  assert.equal(r.chaves.trailingFracaoDoRisco, 0.8)
  assert.equal('perfil' in r.chaves, false, 'esta função só devolve as suas cinco chaves; o merge é de quem grava')
})

teste('enviar vazio APAGA aquela chave (é o único modo de desligar uma regra)', () => {
  const r = normalizarGestaoMestre({ beFracaoDoRisco: '' }, { beFracaoDoRisco: 0.3 })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal('beFracaoDoRisco' in r.chaves, false)
})

teste('A FOLGA DO BE TEM DE SER MENOR DO QUE O GATILHO', () => {
  const r = normalizarGestaoMestre({ beFracaoDoRisco: 0.3, beOffsetFracaoDoRisco: 0.5 }, {})
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.erros[0].erro, /menor do que o gatilho/)
  // E o caso certo passa.
  assert.equal(normalizarGestaoMestre({ beFracaoDoRisco: 0.3, beOffsetFracaoDoRisco: 0.05 }, {}).ok, true)
})

teste('O TRAILING NÃO ARRANCA ANTES DO BREAK-EVEN (apertar um stop ainda no prejuízo)', () => {
  const r = normalizarGestaoMestre({ beFracaoDoRisco: 1.25, trailingInicioFracaoDoRisco: 0.5 }, {})
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.erros[0].erro, /antes do break-even/)
  // O Aurum Flow real (BE 1,25 · trailing arranca a 2) passa.
  assert.equal(normalizarGestaoMestre({ beFracaoDoRisco: 1.25, trailingInicioFracaoDoRisco: 2 }, {}).ok, true)
})

teste('fora dos limites é recusado com o intervalo dito por extenso', () => {
  const r = normalizarGestaoMestre({ beFracaoDoRisco: 50 }, {})
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.erros[0].erro, /entre 0\.1 e 10/)
})

console.log(`\n${n} verificações ok\n`)
