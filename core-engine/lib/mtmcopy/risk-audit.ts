/**
 * Auditoria de risco de uma conta MTM Copy / Tap to Trade.
 * Puro (sem I/O) — recebe os dados já lidos (MetaAPI + conexão) e produz um
 * micro-relatório estruturado + o HTML do corpo (partilhado entre a pré-visualização
 * no admin e o email branded enviado ao cliente).
 */

export type RiskLevel = 'baixo' | 'moderado' | 'elevado'

export interface RiskAuditInput {
  profileName: string
  profileEmail: string | null
  sizing: {
    lot_mode: string | null
    lot_value: number | null
    max_risk_percent: number | null
  }
  copy: {
    strategy_label: string | null
    subscribed: boolean
    method: string | null
    copy_sl: boolean
    copy_tp: boolean
  }
  account: {
    broker: string | null
    server: string | null
    login: string | null
    currency: string | null
    leverage: number | null
    state: string | null
    connection_status: string | null
  }
  balance: number | null
  equity: number | null
  credit: number | null
  free_margin: number | null
  margin_level: number | null
  baseline_balance: number | null
  open_positions: { count: number; total_volume: number; symbols: string[] }
}

export interface RiskAudit {
  generated_at: string
  user: { name: string; email: string | null }
  account: RiskAuditInput['account']
  balance: number | null
  equity: number | null
  credit: number | null
  free_margin: number | null
  margin_level: number | null
  drawdown_pct: number | null
  sizing: RiskAuditInput['sizing']
  copy: RiskAuditInput['copy']
  open_positions: RiskAuditInput['open_positions']
  level: RiskLevel
  score: number
  flags: string[]
  recommendations: string[]
}

function maskLogin(login: string | null): string {
  if (!login) return '—'
  const s = String(login)
  return s.length <= 4 ? s : `••••${s.slice(-4)}`
}

/** Calcula a auditoria de risco a partir dos dados já recolhidos. */
export function computeRiskAudit(input: RiskAuditInput, nowIso: string): RiskAudit {
  const flags: string[] = []
  const recommendations: string[] = []
  let score = 0

  const balance = input.balance
  const equity = input.equity
  const credit = input.credit ?? 0
  const hasBonus = credit > 0
  const mode = (input.sizing.lot_mode ?? 'fixed').toLowerCase()
  const lotValue = Number(input.sizing.lot_value ?? 0)
  const riskPct = input.sizing.max_risk_percent != null ? Number(input.sizing.max_risk_percent) : null

  // Drawdown vs baseline
  let drawdown: number | null = null
  if (input.baseline_balance && input.baseline_balance > 0 && equity != null) {
    drawdown = ((input.baseline_balance - equity) / input.baseline_balance) * 100
    if (drawdown < 0) drawdown = 0
  }

  // 1) Risco % sobre conta com bónus infla o sizing
  if (mode === 'risk_percent' && hasBonus) {
    score += 3
    flags.push(
      `Sizing por risco % (${riskPct ?? '?'}%) numa conta com bónus/crédito (${credit.toFixed(2)}) — o bónus infla o tamanho das ordens.`,
    )
    recommendations.push('Passar a lote FIXO nesta conta (o bónus não deve alimentar o sizing).')
  } else if (mode === 'risk_percent' && riskPct != null && riskPct > 1) {
    score += 2
    flags.push(`Risco por trade elevado: ${riskPct}% do saldo.`)
    recommendations.push('Reduzir o risco por trade para ≤1% para preservar o capital.')
  }

  // 2) Conta pequena com lote fixo relativamente grande
  if (mode === 'fixed' && balance != null && balance > 0 && lotValue > 0) {
    const lotPer1k = lotValue / (balance / 1000)
    if (lotPer1k > 0.5) {
      score += 2
      flags.push(`Lote fixo ${lotValue} agressivo para o saldo (${balance.toFixed(0)} ${input.account.currency ?? ''}).`)
      recommendations.push('Considerar 0.01 por cada ~1000 de saldo para amortecer drawdowns.')
    }
  }

  // 3) Margin level / free margin
  if (input.margin_level != null && input.margin_level > 0) {
    if (input.margin_level < 200) {
      score += 3
      flags.push(`Nível de margem baixo (${input.margin_level.toFixed(0)}%) — risco de margin call.`)
      recommendations.push('Fechar/reduzir posições para subir o nível de margem acima de 300%.')
    } else if (input.margin_level < 400) {
      score += 1
      flags.push(`Nível de margem moderado (${input.margin_level.toFixed(0)}%).`)
    }
  }

  // 4) Alavancagem alta
  if (input.account.leverage != null && input.account.leverage >= 500) {
    score += 1
    flags.push(`Alavancagem alta (1:${input.account.leverage}).`)
  }

  // 5) Drawdown
  if (drawdown != null) {
    if (drawdown > 20) {
      score += 3
      flags.push(`Drawdown atual ${drawdown.toFixed(1)}% face à baseline.`)
      recommendations.push('Rever gestão — drawdown acima de 20% pede pausa e revisão do risco.')
    } else if (drawdown > 10) {
      score += 1
      flags.push(`Drawdown ${drawdown.toFixed(1)}% face à baseline.`)
    }
  }

  // 6) Exposição aberta
  if (input.open_positions.count >= 5) {
    score += 1
    flags.push(`${input.open_positions.count} posições abertas em simultâneo (${input.open_positions.total_volume.toFixed(2)} lotes).`)
  }

  // 7) Sem SL a copiar
  if (input.copy.subscribed && !input.copy.copy_sl) {
    score += 2
    flags.push('Stop Loss não está a ser copiado — trades sem proteção automática.')
    recommendations.push('Ativar "copiar Stop Loss" para proteger cada posição.')
  }

  // 8) Conexão não ligada
  if (input.account.connection_status && input.account.connection_status !== 'CONNECTED') {
    score += 1
    flags.push(`Conta ${input.account.connection_status} no MetaAPI — cópia pode não estar a executar.`)
  }

  const level: RiskLevel = score >= 5 ? 'elevado' : score >= 2 ? 'moderado' : 'baixo'

  if (!flags.length) flags.push('Sem riscos relevantes detetados — configuração conservadora.')
  if (!recommendations.length) recommendations.push('Manter a disciplina atual e rever mensalmente.')

  return {
    generated_at: nowIso,
    user: { name: input.profileName, email: input.profileEmail },
    account: { ...input.account, login: maskLogin(input.account.login) },
    balance,
    equity,
    credit: input.credit,
    free_margin: input.free_margin,
    margin_level: input.margin_level,
    drawdown_pct: drawdown,
    sizing: input.sizing,
    copy: input.copy,
    open_positions: input.open_positions,
    level,
    score,
    flags,
    recommendations,
  }
}

const LEVEL_COLOR: Record<RiskLevel, string> = {
  baixo: '#3ecf8e',
  moderado: '#f6c85a',
  elevado: '#f26d6d',
}

const LEVEL_LABEL: Record<RiskLevel, string> = {
  baixo: 'Baixo',
  moderado: 'Moderado',
  elevado: 'Elevado',
}

function num(n: number | null | undefined, suffix = ''): string {
  return n == null ? '—' : `${Number(n).toLocaleString('pt-PT', { maximumFractionDigits: 2 })}${suffix}`
}

/** HTML do CORPO do relatório (sem shell/branding — o chamador embrulha). */
export function renderRiskAuditHtml(a: RiskAudit): string {
  const color = LEVEL_COLOR[a.level]
  const rows: Array<[string, string]> = [
    ['Corretora', a.account.broker ?? a.account.server ?? '—'],
    ['Conta', a.account.login ?? '—'],
    ['Moeda', a.account.currency ?? '—'],
    ['Alavancagem', a.account.leverage ? `1:${a.account.leverage}` : '—'],
    ['Saldo', num(a.balance)],
    ['Equity', num(a.equity)],
    ...(a.credit && a.credit > 0 ? [['Crédito/Bónus', num(a.credit)] as [string, string]] : []),
    ['Margem livre', num(a.free_margin)],
    ['Nível de margem', num(a.margin_level, '%')],
    ...(a.drawdown_pct != null ? [['Drawdown', `${a.drawdown_pct.toFixed(1)}%`] as [string, string]] : []),
    ['Modo de lote', a.sizing.lot_mode === 'risk_percent' ? `Risco ${a.sizing.max_risk_percent ?? '?'}%` : `Fixo ${a.sizing.lot_value ?? '—'}`],
    ['Estratégia', a.copy.strategy_label ?? '—'],
    ['A copiar', a.copy.subscribed ? 'Sim' : 'Não'],
    ['Posições abertas', `${a.open_positions.count}${a.open_positions.total_volume ? ` · ${a.open_positions.total_volume.toFixed(2)} lotes` : ''}`],
  ]

  const rowsHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;font-size:13px;color:#a9a9b8">${k}</td><td style="padding:6px 0;font-size:13px;color:#e9e9ee;text-align:right;font-weight:600">${v}</td></tr>`,
    )
    .join('')

  const flagsHtml = a.flags
    .map((f) => `<li style="margin:0 0 6px;font-size:13px;line-height:1.55;color:#d5d5df">${f}</li>`)
    .join('')
  const recsHtml = a.recommendations
    .map((r) => `<li style="margin:0 0 6px;font-size:13px;line-height:1.55;color:#d5d5df">${r}</li>`)
    .join('')

  const date = new Date(a.generated_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })

  return `
    <h1 style="margin:0 0 4px;font-size:20px;color:#f6c85a">Auditoria de risco da tua conta</h1>
    <p style="margin:0 0 16px;font-size:13px;color:#8a8a9a">${a.user.name} · ${date}</p>

    <div style="display:inline-block;padding:8px 16px;border-radius:999px;background:${color}22;border:1px solid ${color}55;margin-bottom:18px">
      <span style="font-size:12px;color:#a9a9b8">Nível de risco</span>
      <span style="font-size:15px;font-weight:800;color:${color};margin-left:6px">${LEVEL_LABEL[a.level]}</span>
    </div>

    <table style="width:100%;border-collapse:collapse;margin:0 0 18px">
      ${rowsHtml}
    </table>

    <h2 style="margin:0 0 8px;font-size:15px;color:#f6c85a">O que observámos</h2>
    <ul style="margin:0 0 18px;padding-left:18px">${flagsHtml}</ul>

    <h2 style="margin:0 0 8px;font-size:15px;color:#f6c85a">Recomendações</h2>
    <ul style="margin:0 0 6px;padding-left:18px">${recsHtml}</ul>`
}
