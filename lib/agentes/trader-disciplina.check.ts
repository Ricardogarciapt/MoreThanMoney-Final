/**
 * A GUARDA DA DISCIPLINA DO AGENTE TRADER (método do day-trader-skill).
 *
 *   npx tsx lib/agentes/trader-disciplina.check.ts
 *
 * O que se prova: só se abre onde o histórico real mostra vantagem, a recompensa paga o risco, e o
 * travão do dia fecha a porta. E que sem estes dados o agente se comporta como antes.
 */
import { decidirOperacoes, type SinalDoTrader } from './trader'
import { REGUA_PADRAO, lerRegua, metricasDoAgente, riscoRecompensa, travaoDiario, vantagemPorCombo } from './trader-disciplina'

const falhas: string[] = []
const teste = (nome: string, c: boolean) => { if (!c) falhas.push(nome) }

const AGORA = new Date('2026-10-26T10:00:00Z')
const sinal = (p: Partial<SinalDoTrader> = {}): SinalDoTrader => ({
  chave: 'mtm-scanner:1', estrategia: 'mtm-scanner', symbol: 'EURUSD', direcao: 'buy',
  entrada: 1.1, sl: 1.09, tps: [1.105, 1.115], criadoEm: new Date(AGORA.getTime() - 60_000).toISOString(), ...p,
})

// ── a máquina do tempo ──
{
  const v = vantagemPorCombo([
    { estrategia: 'mtm-scanner', symbol: 'EURUSD', n: 54, ganhos: 27, pnl: 20.13, risco: 175, somaR: 6.2, somaR2: 60 },
    { estrategia: 'mtm-scanner', symbol: 'NZDCHF', n: 79, ganhos: 12, pnl: -84.8, risco: 130, somaR: -51.8, somaR2: 70 },
    { estrategia: 'premium-ouro', symbol: 'XAUUSD', n: 261, ganhos: 206, pnl: -1085, risco: 9000, somaR: 2.6, somaR2: 200 },
    { estrategia: 'mtm-auto-wolf', symbol: 'XAUUSD', n: 10, ganhos: 8, pnl: 35, risco: 90, somaR: 3.9, somaR2: 8 },
  ])
  teste('EURUSD do scanner tem vantagem', v.get('mtm-scanner|EURUSD')?.aprovada === true)
  teste('NZDCHF a perder fica de fora', v.get('mtm-scanner|NZDCHF')?.aprovada === false)
  teste('R médio positivo com dinheiro a descer fica de fora', v.get('premium-ouro|XAUUSD')?.aprovada === false)
  teste('amostra curta fica de fora', v.get('mtm-auto-wolf|XAUUSD')?.aprovada === false)
  teste('a chave ignora maiúsculas da estratégia', vantagemPorCombo([{ estrategia: 'Goldkiller', symbol: 'xauusd', n: 30, ganhos: 20, pnl: 10, risco: 50, somaR: 3, somaR2: 10 }]).has('goldkiller|XAUUSD'))
  const exigente = vantagemPorCombo(
    [{ estrategia: 'mtm-scanner', symbol: 'EURUSD', n: 54, ganhos: 27, pnl: 20.13, risco: 175, somaR: 6.2, somaR2: 60 }],
    { ...REGUA_PADRAO, margemErros: 1 },
  )
  teste('com margem de 1 erro padrão a vantagem fraca cai', exigente.get('mtm-scanner|EURUSD')?.aprovada === false)
}

// ── recompensa face ao risco ──
teste('RR ao último TP', Math.abs((riscoRecompensa(sinal()) ?? 0) - 1.5) < 1e-9)
teste('sell mede ao contrário', Math.abs((riscoRecompensa(sinal({ direcao: 'sell', sl: 1.11, tps: [1.08] })) ?? 0) - 2) < 1e-9)
teste('SL do lado errado não mede', riscoRecompensa(sinal({ sl: 1.11 })) === null)
teste('sem TP não mede', riscoRecompensa(sinal({ tps: [] })) === null)

// ── travão do dia ──
teste('perda de 2% trava', travaoDiario(-20, 1000))
teste('perda de 1% não trava', !travaoDiario(-10, 1000))
teste('sem saldo não trava às cegas', !travaoDiario(-10, 0))

// ── a régua vem da base e não aceita lixo ──
{
  const r = lerRegua({ armado: true, regua: { minAmostra: 40, minRR: '1.5', perdaDiariaMax: -1, lixo: 3 } })
  teste('régua lida', r.minAmostra === 40 && r.minRR === 1.5)
  teste('negativo ignorado', r.perdaDiariaMax === REGUA_PADRAO.perdaDiariaMax)
  teste('sem régua fica a padrão', lerRegua({ armado: true }).minAmostra === REGUA_PADRAO.minAmostra)
}

// ── a exploração (26/10: scalping na conta de papel) ──
{
  const vantagens = vantagemPorCombo([
    { estrategia: 'mtm-scanner', symbol: 'NZDCHF', n: 79, ganhos: 12, pnl: -84.8, risco: 130, somaR: -51.8, somaR2: 70 },
    { estrategia: 'sensei', symbol: 'XAUUSD', n: 5, ganhos: 2, pnl: -3, risco: 50, somaR: -0.3, somaR2: 4 },
  ])
  const regua = { ...REGUA_PADRAO, exploracao: 1 }
  const base = { abertas: [], agora: AGORA, vantagens, regua }
  const rr2 = { tps: [1.105, 1.12] } // RR 2 ao último TP
  const [a] = decidirOperacoes({ ...base, sinais: [sinal({ estrategia: 'goldkiller', symbol: 'XAUUSD', chave: 'g:1', ...rr2 })] })
  teste('sem histórico explora', a.abrir && a.exploracao === true)
  const [b] = decidirOperacoes({ ...base, sinais: [sinal({ estrategia: 'sensei', symbol: 'XAUUSD', chave: 's:1', ...rr2 })] })
  teste('amostra curta explora', b.abrir && b.exploracao === true)
  const [c] = decidirOperacoes({ ...base, sinais: [sinal({ symbol: 'NZDCHF', chave: 'n:1', ...rr2 })] })
  teste('medido a perder não explora', !c.abrir && c.motivo === 'sem_vantagem')
  const [d] = decidirOperacoes({ ...base, sinais: [sinal({ estrategia: 'goldkiller', symbol: 'XAUUSD', chave: 'g:2' })] })
  teste('exploração pede RR 1,5', !d.abrir && d.motivo === 'sem_vantagem')
  const cheias = [
    { symbol: 'EURJPY', direcao: 'buy' as const, chave: 'agente-trader:explora:a:1' },
    { symbol: 'GBPJPY', direcao: 'buy' as const, chave: 'agente-trader:explora:a:2' },
  ]
  const [e] = decidirOperacoes({ ...base, abertas: cheias, sinais: [sinal({ estrategia: 'goldkiller', symbol: 'XAUUSD', chave: 'g:3', ...rr2 })] })
  teste('máximo de explorações respeitado', !e.abrir)
  const [f] = decidirOperacoes({ ...base, abertas: cheias, sinais: [sinal({ estrategia: 'a', chave: 'a:1', symbol: 'USDCAD', ...rr2 })] })
  teste('exploração aberta conta como já aberta', !f.abrir && f.motivo === 'ja_aberto')
  const [g] = decidirOperacoes({ ...base, regua: { ...REGUA_PADRAO }, sinais: [sinal({ estrategia: 'goldkiller', symbol: 'XAUUSD', chave: 'g:4', ...rr2 })] })
  teste('exploração desligada por omissão', !g.abrir)
}

// ── a decisão com disciplina ──
{
  const vantagens = vantagemPorCombo([
    { estrategia: 'mtm-scanner', symbol: 'EURUSD', n: 54, ganhos: 27, pnl: 20.13, risco: 175, somaR: 6.2, somaR2: 60 },
  ])
  const base = { abertas: [], agora: AGORA, vantagens }
  const [a] = decidirOperacoes({ ...base, sinais: [sinal()] })
  teste('com vantagem e RR bom abre', a.abrir)
  const [b] = decidirOperacoes({ ...base, sinais: [sinal({ symbol: 'NZDCHF', chave: 'x:2' })] })
  teste('sem histórico não abre', !b.abrir && b.motivo === 'sem_vantagem')
  const [c] = decidirOperacoes({ ...base, sinais: [sinal({ tps: [1.105] })] })
  teste('RR 0,5 não abre', !c.abrir && c.motivo === 'rr_baixo')
  const [d] = decidirOperacoes({ ...base, sinais: [sinal()], travado: true })
  teste('travão do dia não abre', !d.abrir && d.motivo === 'travao_diario')
  const [e] = decidirOperacoes({ sinais: [sinal({ symbol: 'NZDCHF' })], abertas: [], agora: AGORA })
  teste('sem dados de disciplina comporta-se como antes', e.abrir)
}

// ── métricas: só factos ──
{
  const m = metricasDoAgente([
    { estado: 'fechada', pnl: 10, risco_inicial: 5, fechada_em: '2026-10-26T08:00:00Z' },
    { estado: 'fechada', pnl: -5, risco_inicial: 5, fechada_em: '2026-10-25T08:00:00Z' },
    { estado: 'aberta', pnl: 3, risco_inicial: 5 },
  ], AGORA)
  teste('métricas: 2 fechadas, 50%, +5, 0,5R, hoje +10', m.fechadas === 2 && m.acerto === 0.5 && m.pnl === 5 && m.rTotal === 0.5 && m.pnlHoje === 10)
  teste('sem posições não inventa acerto', metricasDoAgente([]).acerto === null)
}

if (falhas.length) {
  for (const f of falhas) console.error('✗', f)
  console.error(`agentes/trader-disciplina: ${falhas.length} falha(s)`)
  process.exit(1)
}
console.log('agentes/trader-disciplina: só abre com vantagem medida, RR que paga o risco e dentro do travão do dia ✓')
