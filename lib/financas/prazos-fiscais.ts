/**
 * CALENDÁRIO FISCAL DA CASA — os prazos que o dossier e os avisos usam.
 *
 * Regra pura: dada uma data e o regime, devolve os próximos prazos. Não lê nada, não envia nada.
 *
 * Fontes (16/11/2026): SAF-T de faturação até dia 5 do mês seguinte e assinatura qualificada nos
 * PDF a partir de 01/01/2027 confirmados em blogues da InvoiceXpress/Vendus (jan–abr 2026). Os
 * restantes prazos são os gerais da lei portuguesa e estão marcados `confirmar: true` até o
 * contabilista os validar para o regime da MTM — nunca se decide nada a partir deles sem essa
 * confirmação. Prazo que calhe a sábado/domingo passa para segunda-feira (feriados não estão
 * contemplados: o aviso chega sempre com dias de folga).
 */

export type Entidade = 'eni' | 'empresa'
export type RegimeIva = 'mensal' | 'trimestral' | 'isento'

export type Regime = {
  /** null = ainda por confirmar: mostra os prazos das duas hipóteses. */
  entidade: Entidade | null
  iva: RegimeIva | null
}

export type Prazo = {
  id: string
  data: string // YYYY-MM-DD
  titulo: string
  quem: 'mtm' | 'contabilista' | 'ricardo'
  confirmar: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

/** Último dia do mês (m em 1..12). */
const ultimoDia = (ano: number, m: number) => new Date(Date.UTC(ano, m, 0)).getUTCDate()

/** Sábado/domingo passam para segunda. */
export function diaUtil(ano: number, m: number, dia: number): string {
  const d = new Date(Date.UTC(ano, m - 1, Math.min(dia, ultimoDia(ano, m))))
  const dow = d.getUTCDay()
  if (dow === 6) d.setUTCDate(d.getUTCDate() + 2)
  if (dow === 0) d.setUTCDate(d.getUTCDate() + 1)
  return iso(d)
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Todos os prazos de um ano civil para o regime dado. */
export function prazosDoAno(ano: number, regime: Regime): Prazo[] {
  const p: Prazo[] = []
  const eni = regime.entidade !== 'empresa'
  const empresa = regime.entidade !== 'eni'

  for (let m = 1; m <= 12; m++) {
    const anterior = MESES[(m + 10) % 12]
    p.push({ id: `fecho-${ano}-${m}`, data: diaUtil(ano, m, 2), titulo: `Fecho de ${anterior}: dossier Stripe + despesas pronto`, quem: 'mtm', confirmar: false })
    p.push({ id: `saft-${ano}-${m}`, data: diaUtil(ano, m, 5), titulo: `Comunicação das faturas de ${anterior} à AT (SAF-T, e-Fatura)`, quem: 'mtm', confirmar: false })

    if (regime.iva === 'mensal') {
      const ref = MESES[(m + 9) % 12] // 2.º mês anterior
      p.push({ id: `iva-${ano}-${m}`, data: diaUtil(ano, m, 20), titulo: `Declaração periódica de IVA (${ref})`, quem: 'contabilista', confirmar: true })
      p.push({ id: `iva-pag-${ano}-${m}`, data: diaUtil(ano, m, 25), titulo: `Pagamento do IVA (${ref})`, quem: 'ricardo', confirmar: true })
    }
    if (regime.iva === 'trimestral' || regime.iva === null) {
      // 2.º mês a seguir ao trimestre: fev (T4), mai (T1), ago (T2), nov (T3).
      if ([2, 5, 8, 11].includes(m)) {
        const t = m === 2 ? `4.º trimestre de ${ano - 1}` : `${(m - 2) / 3}.º trimestre`
        p.push({ id: `iva-${ano}-${m}`, data: diaUtil(ano, m, 20), titulo: `Declaração periódica de IVA (${t})`, quem: 'contabilista', confirmar: true })
        p.push({ id: `iva-pag-${ano}-${m}`, data: diaUtil(ano, m, 25), titulo: `Pagamento do IVA (${t})`, quem: 'ricardo', confirmar: true })
      }
    }
    if (eni && [1, 4, 7, 10].includes(m)) {
      p.push({ id: `ss-${ano}-${m}`, data: diaUtil(ano, m, ultimoDia(ano, m)), titulo: 'Declaração trimestral à Segurança Social (independente)', quem: 'ricardo', confirmar: true })
    }
  }

  if (regime.iva === 'isento') {
    p.push({ id: `iva-limite-${ano}`, data: diaUtil(ano, 1, 15), titulo: 'Verificar se o volume do ano passou os 15.000 € (fim da isenção do art. 53.º)', quem: 'contabilista', confirmar: true })
  }
  p.push({ id: `mod10-${ano}`, data: diaUtil(ano, 2, 10), titulo: 'Modelo 10 (rendimentos e retenções do ano anterior), se houver', quem: 'contabilista', confirmar: true })
  if (eni) {
    p.push({ id: `irs-ini-${ano}`, data: diaUtil(ano, 4, 1), titulo: 'Abre a entrega do IRS (Modelo 3) — dossier anual pronto', quem: 'mtm', confirmar: true })
    p.push({ id: `irs-${ano}`, data: diaUtil(ano, 6, 30), titulo: 'Fim da entrega do IRS (Modelo 3)', quem: 'ricardo', confirmar: true })
    for (const m of [7, 9, 12]) {
      p.push({ id: `irs-ppc-${ano}-${m}`, data: diaUtil(ano, m, 20), titulo: 'Pagamento por conta de IRS (se a nota de liquidação o pedir)', quem: 'ricardo', confirmar: true })
    }
  }
  if (empresa) {
    p.push({ id: `irc-${ano}`, data: diaUtil(ano, 5, 31), titulo: 'Declaração de IRC (Modelo 22)', quem: 'contabilista', confirmar: true })
    p.push({ id: `ies-${ano}`, data: diaUtil(ano, 7, 15), titulo: 'IES / Declaração Anual', quem: 'contabilista', confirmar: true })
    p.push({ id: `irc-ppc1-${ano}`, data: diaUtil(ano, 7, 31), titulo: '1.º pagamento por conta de IRC', quem: 'ricardo', confirmar: true })
    p.push({ id: `irc-ppc2-${ano}`, data: diaUtil(ano, 9, 30), titulo: '2.º pagamento por conta de IRC', quem: 'ricardo', confirmar: true })
    p.push({ id: `irc-ppc3-${ano}`, data: diaUtil(ano, 12, 15), titulo: '3.º pagamento por conta de IRC', quem: 'ricardo', confirmar: true })
  }
  if (ano === 2027) {
    p.push({ id: 'assinatura-qualificada-2027', data: '2027-01-01', titulo: 'Faturas em PDF passam a exigir assinatura digital qualificada', quem: 'mtm', confirmar: false })
  }
  return p.sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id))
}

/** Dias entre duas datas YYYY-MM-DD (b - a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/** Prazos dos próximos `dias` dias a contar de `hoje` (inclui hoje). */
export function proximosPrazos(hoje: string, regime: Regime, dias = 45): (Prazo & { faltam: number })[] {
  const ano = Number(hoje.slice(0, 4))
  return [...prazosDoAno(ano, regime), ...prazosDoAno(ano + 1, regime)]
    .map((p) => ({ ...p, faltam: diasEntre(hoje, p.data) }))
    .filter((p) => p.faltam >= 0 && p.faltam <= dias)
}

/** Os que merecem aviso hoje: a 7, 3, 1 e 0 dias. */
export function prazosParaAvisar(hoje: string, regime: Regime) {
  return proximosPrazos(hoje, regime, 7).filter((p) => [7, 3, 1, 0].includes(p.faltam))
}
