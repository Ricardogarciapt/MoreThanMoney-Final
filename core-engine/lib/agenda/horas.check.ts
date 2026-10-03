/**
 * A GUARDA DAS HORAS LIVRES.
 *
 *   npx tsx lib/agenda/horas.check.ts
 *
 * Metade destes testes tenta oferecer uma hora que não devia existir: em cima de outra chamada, sem
 * respiro, fora da janela, antes da antecedência mínima, ou no dia em que o relógio muda. Uma
 * agenda que falha em qualquer um deles não dá erro — dá duas pessoas à mesma hora, e isso não se
 * corrige com um deploy.
 */
import {
  chocam, diaNoFuso, escolherAnfitriao, horasLivres, instanteDe, minutosDoRelogio,
  type RegrasDoAnfitriao,
} from './horas'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

const BASE: RegrasDoAnfitriao = {
  fuso: 'Europe/Lisbon',
  janelas: [{ dia: 2, inicio: '15:00', fim: '18:00' }], // terça
  duracaoMin: 30,
  intervaloMin: 15,
  antecedenciaHoras: 2,
  horizonteDias: 21,
  maxPorDia: 6,
}

const iso = (d: Date) => d.toISOString()

// ── Fusos: a conta tem de vir do sistema, não de uma constante ──────────────
{
  // 7 de Janeiro de 2026: Lisboa em UTC+0. 15:00 local = 15:00 UTC.
  const inverno = instanteDe('Europe/Lisbon', 2026, 1, 7, 15, 0)
  teste('Janeiro em Lisboa é UTC+0', iso(inverno) === '2026-01-07T15:00:00.000Z')

  // 8 de Julho de 2026: Lisboa em UTC+1. 15:00 local = 14:00 UTC.
  const verao = instanteDe('Europe/Lisbon', 2026, 7, 8, 15, 0)
  teste('Julho em Lisboa é UTC+1', iso(verao) === '2026-07-08T14:00:00.000Z')

  // O mesmo relógio, outro fuso: São Paulo (UTC−3).
  const sp = instanteDe('America/Sao_Paulo', 2026, 7, 8, 15, 0)
  teste('São Paulo em Julho é UTC−3', iso(sp) === '2026-07-08T18:00:00.000Z')

  teste('o dia da semana sai certo', diaNoFuso('Europe/Lisbon', new Date('2026-09-29T12:00:00Z')).semana === 2)
  // Meia-noite em Lisboa no Verão é 23:00 UTC do dia ANTERIOR — e o dia local tem de ser o certo,
  // senão as janelas do primeiro dia caem todas no dia errado.
  teste('meia-noite local não escorrega para o dia anterior', diaNoFuso('Europe/Lisbon', new Date('2026-07-07T23:30:00Z')).dia === 8)
}

// ── Relógio ─────────────────────────────────────────────────────────────────
teste('15:30 são 930 minutos', minutosDoRelogio('15:30') === 930)
teste('24:00 não é uma hora', minutosDoRelogio('24:00') === null)
teste('texto não é uma hora', minutosDoRelogio('meio-dia') === null)
teste('minutos fora de escala não passam', minutosDoRelogio('12:99') === null)

// ── Choques ─────────────────────────────────────────────────────────────────
{
  const a = { inicio: new Date('2026-10-06T14:00:00Z'), fim: new Date('2026-10-06T14:30:00Z') }
  const encostado = { inicio: new Date('2026-10-06T14:30:00Z'), fim: new Date('2026-10-06T15:00:00Z') }
  const sobreposto = { inicio: new Date('2026-10-06T14:15:00Z'), fim: new Date('2026-10-06T14:45:00Z') }
  teste('encostadas não chocam', !chocam(a, encostado))
  teste('sobrepostas chocam', chocam(a, sobreposto))
  teste('chocar é simétrico', chocam(sobreposto, a) === chocam(a, sobreposto))
}

// ── As horas de um dia normal ───────────────────────────────────────────────
{
  // Segunda, 5 de Outubro de 2026. A terça é dia 6. Lisboa ainda em horário de Verão (UTC+1).
  const agora = new Date('2026-10-05T09:00:00Z')
  const livres = horasLivres({
    regras: BASE,
    agora,
    de: new Date('2026-10-06T00:00:00Z'),
    ate: new Date('2026-10-07T00:00:00Z'),
    ocupado: [],
  })
  // Janela 15:00–18:00 local, chamadas de 30 min de 15 em 15: 15:00, 15:15 … 17:30. São 11.
  teste('uma terça vazia dá 11 horas', livres.length === 11)
  teste('a primeira é às 15:00 locais (14:00 UTC)', iso(livres[0]) === '2026-10-06T14:00:00.000Z')
  teste('a última cabe inteira na janela', iso(livres[livres.length - 1]) === '2026-10-06T16:30:00.000Z')
  teste('nenhuma hora passa das 18:00 locais', livres.every((d) => d.getTime() + 30 * 60_000 <= new Date('2026-10-06T17:00:00Z').getTime()))
}

// ── Uma chamada marcada tira as horas dela E o respiro ──────────────────────
{
  const agora = new Date('2026-10-05T09:00:00Z')
  const jaMarcada = { inicio: new Date('2026-10-06T15:00:00Z'), fim: new Date('2026-10-06T15:30:00Z') } // 16:00 local
  const livres = horasLivres({
    regras: BASE, agora,
    de: new Date('2026-10-06T00:00:00Z'), ate: new Date('2026-10-07T00:00:00Z'),
    ocupado: [jaMarcada],
  })
  const horas = livres.map(iso)
  teste('a hora marcada desaparece', !horas.includes('2026-10-06T15:00:00.000Z'))
  teste('a que acabaria em cima dela também', !horas.includes('2026-10-06T14:45:00.000Z'))
  // O respiro é DEPOIS: uma chamada às 15:30 UTC começaria antes de os 15 minutos de folga passarem.
  teste('o respiro a seguir é respeitado', !horas.includes('2026-10-06T15:30:00.000Z'))
  teste('mas as 15:45 já são livres', horas.includes('2026-10-06T15:45:00.000Z'))
  teste('e o resto do dia continua a existir', horas.length > 5)
}

// ── A antecedência mínima ───────────────────────────────────────────────────
{
  // Já é terça às 14:10 UTC (15:10 local). Com 2 h de antecedência, nada antes das 16:10 UTC.
  const agora = new Date('2026-10-06T14:10:00Z')
  const livres = horasLivres({
    regras: BASE, agora,
    de: new Date('2026-10-06T00:00:00Z'), ate: new Date('2026-10-07T00:00:00Z'),
    ocupado: [],
  })
  teste('não se marca dentro das 2 horas seguintes', livres.every((d) => d.getTime() >= agora.getTime() + 2 * 3_600_000))
  teste('mas ainda sobra hora nesse dia', livres.length > 0)
  teste('a primeira livre é às 16:15 UTC', iso(livres[0]) === '2026-10-06T16:15:00.000Z')
}

// ── O tecto diário ──────────────────────────────────────────────────────────
{
  const agora = new Date('2026-10-05T09:00:00Z')
  const cheio = Array.from({ length: 2 }, (_, i) => ({
    inicio: new Date(2026, 9, 6, 20 + i, 0, 0), // longe da janela, só para contar
    fim: new Date(2026, 9, 6, 20 + i, 30, 0),
  }))
  const livres = horasLivres({
    regras: { ...BASE, maxPorDia: 2 }, agora,
    de: new Date('2026-10-06T00:00:00Z'), ate: new Date('2026-10-07T00:00:00Z'),
    ocupado: cheio,
  })
  teste('com o tecto do dia atingido, não sobra nada', livres.length === 0)
}

// ── Dias sem janela ─────────────────────────────────────────────────────────
{
  const livres = horasLivres({
    regras: BASE, agora: new Date('2026-10-05T09:00:00Z'),
    de: new Date('2026-10-07T00:00:00Z'), ate: new Date('2026-10-08T00:00:00Z'), // quarta
    ocupado: [],
  })
  teste('uma quarta sem janela não tem horas', livres.length === 0)
}

// ── O dia em que o relógio muda ─────────────────────────────────────────────
{
  // 25 de Outubro de 2026 é um domingo: em Portugal o relógio atrasa uma hora de madrugada.
  // A janela de domingo 15:00–18:00 tem de continuar a ser 15:00–18:00 LOCAIS, ou seja já em UTC+0.
  const regras: RegrasDoAnfitriao = { ...BASE, janelas: [{ dia: 0, inicio: '15:00', fim: '18:00' }] }
  const livres = horasLivres({
    regras, agora: new Date('2026-10-23T09:00:00Z'),
    de: new Date('2026-10-25T00:00:00Z'), ate: new Date('2026-10-26T00:00:00Z'),
    ocupado: [],
  })
  teste('no dia da mudança da hora a janela não escorrega', iso(livres[0]) === '2026-10-25T15:00:00.000Z')
  teste('e continua a dar as mesmas 11 horas', livres.length === 11)
}

// ── Duas janelas no mesmo dia, sem repetir horas ────────────────────────────
{
  const regras: RegrasDoAnfitriao = {
    ...BASE,
    janelas: [
      { dia: 2, inicio: '10:00', fim: '12:00' },
      { dia: 2, inicio: '15:00', fim: '18:00' },
    ],
  }
  const livres = horasLivres({
    regras, agora: new Date('2026-10-05T09:00:00Z'),
    de: new Date('2026-10-06T00:00:00Z'), ate: new Date('2026-10-07T00:00:00Z'),
    ocupado: [],
  })
  const unicos = new Set(livres.map((d) => d.getTime()))
  teste('duas janelas somam-se', livres.length === 7 + 11)
  teste('e não há horas repetidas', unicos.size === livres.length)
  teste('a lista vem ordenada', livres.every((d, i) => i === 0 || d.getTime() > livres[i - 1].getTime()))
}

// ── Janelas inválidas não rebentam nem inventam horas ───────────────────────
{
  const regras: RegrasDoAnfitriao = {
    ...BASE,
    janelas: [
      { dia: 2, inicio: '18:00', fim: '15:00' },   // ao contrário
      { dia: 2, inicio: 'tarde', fim: '18:00' },   // não é uma hora
      { dia: 9, inicio: '15:00', fim: '18:00' },   // dia que não existe
    ],
  }
  const livres = horasLivres({
    regras, agora: new Date('2026-10-05T09:00:00Z'),
    de: new Date('2026-10-06T00:00:00Z'), ate: new Date('2026-10-07T00:00:00Z'),
    ocupado: [],
  })
  teste('janelas impossíveis não dão horas nenhumas', livres.length === 0)
}

// ── Quem atende ─────────────────────────────────────────────────────────────
{
  const equipa = [{ id: 'a', ordem: 1 }, { id: 'b', ordem: 2 }, { id: 'c', ordem: 3 }]
  teste('com tudo igual, manda a ordem', escolherAnfitriao(equipa, new Map())?.id === 'a')
  teste('quem tem menos marcado atende', escolherAnfitriao(equipa, new Map([['a', 4], ['b', 1], ['c', 9]]))?.id === 'b')
  teste('empate desfaz-se pela ordem', escolherAnfitriao(equipa, new Map([['a', 2], ['b', 2], ['c', 5]]))?.id === 'a')
  teste('quem não aparece no mapa tem zero e ganha', escolherAnfitriao(equipa, new Map([['a', 2], ['b', 2]]))?.id === 'c')
  teste('sem ninguém, não se inventa', escolherAnfitriao([], new Map()) === null)
}

if (falhas.length) {
  console.error(`agenda/horas: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('agenda/horas: fusos, mudança da hora, choques, respiro, antecedência e tecto diário ✓')
