import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import PDFDocument from 'pdfkit'

// GET: Exportar plano de trading como PDF
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      }
    )

    // Verificar autenticação
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Não autenticado' },
        { status: 401 }
      )
    }

    // Buscar plano ativo do utilizador
    const { data: plan } = await supabase
      .from('trading_plans')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .single()

    if (!plan) {
      return NextResponse.json(
        { success: false, error: 'Nenhum plano de trading encontrado' },
        { status: 404 }
      )
    }

    // Buscar métricas do utilizador
    const metricsResponse = await fetch(
      `${request.nextUrl.origin}/api/trading-plans/metrics?start_date=2024-01-01&end_date=${new Date().toISOString().split('T')[0]}`,
      {
        headers: {
          Cookie: request.headers.get('cookie') || ''
        }
      }
    )

    const metricsData = await metricsResponse.json()
    const metrics = metricsData.success ? metricsData.metrics : null

    const pdfBuffer = await generatePlanPDF(plan, metrics)

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="plano-trading.pdf"'
      }
    })
  } catch (error: any) {
    console.error('Erro na API:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

type TradingPlan = {
  plan_name: string | null
  trader_name: string | null
  trading_style: string | null
  favorite_pairs?: string | null
  trading_sessions?: string | null
  max_risk_per_trade?: number | null
  max_daily_loss?: number | null
  max_concurrent_positions?: number | null
  min_risk_reward_ratio?: number | null
  max_risk_reward_ratio?: number | null
  daily_profit_target?: number | null
  weekly_profit_target?: number | null
  monthly_profit_target?: number | null
  entry_rules?: string | null
  exit_rules?: string | null
  stop_loss_rules?: string | null
  take_profit_rules?: string | null
  additional_rules?: string | null
}

type TradingMetrics = {
  win_rate: number
  total_trades: number
  profit_factor: number
  avg_rr: number
  total_pnl: number
  total_risk: number
} | null

async function generatePlanPDF(plan: TradingPlan, metrics: TradingMetrics): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `Plano de Trading - ${plan.plan_name ?? 'Meu Plano de Trading'}`,
        Author: plan.trader_name ?? 'MoreThanMoney'
      }
    })

    const chunks: Buffer[] = []
    doc.on('data', chunk => chunks.push(chunk as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const accentColor = '#BB8525'
    const secondaryColor = '#D2A63C'
    const separatorColor = '#CCCCCC'

    const addSectionTitle = (title: string) => {
      doc.moveDown()
      doc
        .fillColor(accentColor)
        .font('Helvetica-Bold')
        .fontSize(18)
        .text(title)
      doc
        .moveTo(doc.x, doc.y + 4)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y + 4)
        .lineWidth(1)
        .strokeColor(separatorColor)
        .stroke()
      doc.moveDown(0.5)
      doc.fillColor('#333333').font('Helvetica').fontSize(12)
    }

    const addKeyValue = (label: string, value?: string | number | null) => {
      if (value === undefined || value === null || value === '') return
      doc
        .font('Helvetica-Bold')
        .fillColor('#111111')
        .text(`${label}: `, { continued: true })
      doc
        .font('Helvetica')
        .fillColor('#333333')
        .text(String(value))
      doc.moveDown(0.2)
    }

    const addMultiline = (text?: string | null) => {
      if (!text) return
      doc
        .font('Helvetica')
        .fillColor('#333333')
        .text(text, {
          paragraphGap: 6,
          lineGap: 2
        })
      doc.moveDown(0.5)
    }

    const tradingStyleLabels: Record<string, string> = {
      scalping: 'Scalping',
      day_trading: 'Day Trading',
      swing: 'Swing Trading',
      position: 'Position Trading',
      algorithmic: 'Algorithmic Trading'
    }

    // Header
    doc
      .rect(doc.page.margins.left - 10, doc.page.margins.top - 30, doc.page.width - doc.page.margins.left - doc.page.margins.right + 20, 90)
      .fill(secondaryColor)

    doc
      .fillColor('white')
      .font('Helvetica-Bold')
      .fontSize(22)
      .text(plan.plan_name ?? 'Meu Plano de Trading', doc.page.margins.left, doc.page.margins.top - 15, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        align: 'center'
      })

    doc
      .font('Helvetica')
      .fontSize(12)
      .text(plan.trader_name ?? 'Trader Profissional', {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        align: 'center'
      })

    doc
      .fontSize(10)
      .text(`Gerado em ${new Date().toLocaleDateString('pt-PT', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}`, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        align: 'center'
      })

    doc.moveDown(2)
    doc.fillColor('#333333').font('Helvetica').fontSize(12)

    addSectionTitle('📋 Informações Básicas')
    addKeyValue('Estilo de Trading', plan.trading_style ? tradingStyleLabels[plan.trading_style] ?? plan.trading_style : null)
    addKeyValue('Trader', plan.trader_name)
    addKeyValue('Pares Favoritos', plan.favorite_pairs)
    addKeyValue('Sessões de Trading', plan.trading_sessions)

    if (metrics) {
      addSectionTitle('📊 Métricas de Desempenho')
      const startX = doc.x
      const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / 3 - 10
      const metricsList: Array<{ label: string; value: string }> = [
        { label: 'Win Rate', value: `${metrics.win_rate.toFixed(2)}%` },
        { label: 'Total Trades', value: String(metrics.total_trades) },
        { label: 'Profit Factor', value: metrics.profit_factor.toFixed(2) },
        { label: 'R:R Médio', value: `${metrics.avg_rr.toFixed(2)}R` },
        { label: 'P&L Total', value: `€${metrics.total_pnl.toFixed(2)}` },
        { label: 'Risco Total', value: `€${metrics.total_risk.toFixed(2)}` }
      ]

      metricsList.forEach((metric, index) => {
        const column = index % 3
        const row = Math.floor(index / 3)
        const x = startX + column * (colWidth + 20)
        const y = doc.y + row * 60

        doc
          .roundedRect(x, y, colWidth, 55, 8)
          .fillOpacity(0.05)
          .fillAndStroke(accentColor, secondaryColor)

        doc
          .fillOpacity(1)
          .fillColor(accentColor)
          .font('Helvetica-Bold')
          .fontSize(12)
          .text(metric.label, x + 12, y + 10)

        doc
          .fillColor('#111111')
          .font('Helvetica-Bold')
          .fontSize(16)
          .text(metric.value, x + 12, y + 28)
      })

      doc.moveDown(Math.ceil(metricsList.length / 3) * 3)
    }

    addSectionTitle('🛡️ Gestão de Risco')
    addKeyValue('Risco Máximo por Trade', plan.max_risk_per_trade !== null && plan.max_risk_per_trade !== undefined ? `${plan.max_risk_per_trade}%` : null)
    addKeyValue('Perda Máxima Diária', plan.max_daily_loss !== null && plan.max_daily_loss !== undefined ? `€${plan.max_daily_loss}` : null)
    addKeyValue('Posições Simultâneas', plan.max_concurrent_positions)
    addKeyValue('R:R Mínimo', plan.min_risk_reward_ratio ? `${plan.min_risk_reward_ratio}:1` : null)
    addKeyValue('R:R Máximo', plan.max_risk_reward_ratio ? `${plan.max_risk_reward_ratio}:1` : null)
    addKeyValue('Target Diário', plan.daily_profit_target ? `€${plan.daily_profit_target}` : null)
    addKeyValue('Target Semanal', plan.weekly_profit_target ? `€${plan.weekly_profit_target}` : null)
    addKeyValue('Target Mensal', plan.monthly_profit_target ? `€${plan.monthly_profit_target}` : null)

    const addRulesSection = (title: string, content?: string | null) => {
      if (!content) return
      addSectionTitle(title)
      addMultiline(content)
    }

    addRulesSection('📈 Regras de Entrada', plan.entry_rules)
    addRulesSection('📉 Regras de Saída', plan.exit_rules)
    addRulesSection('🛑 Regras de Stop Loss', plan.stop_loss_rules)
    addRulesSection('✅ Regras de Take Profit', plan.take_profit_rules)
    addRulesSection('📝 Regras Adicionais', plan.additional_rules)

    doc.moveDown()
    doc
      .fillColor('#666666')
      .font('Helvetica-Oblique')
      .fontSize(10)
      .text('MoreThanMoney - Sistema de Trading Profissional', {
        align: 'center'
      })
    doc
      .text('Confidencial - Uso Exclusivo do Trader', {
        align: 'center'
      })

    doc.end()
  })
}

