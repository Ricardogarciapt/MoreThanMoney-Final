import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

const supabaseAdmin = getSupabaseAdmin()

// Função para calcular TP/SL usando a API existente
async function calculateTPSL(symbol: string, entryPrice: number) {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL || 'https://morethanmoney.pt'}/api/portfolio/ai-tp-sl?symbol=${symbol}&entryPrice=${entryPrice}`,
      { next: { revalidate: 0 } }
    )
    
    if (!response.ok) {
      console.error(`❌ Erro ao calcular TP/SL para ${symbol}:`, response.status)
      return null
    }
    
    return await response.json()
  } catch (error) {
    console.error(`❌ Erro ao calcular TP/SL para ${symbol}:`, error)
    return null
  }
}

// POST: Recalcular TP/SL para um ativo específico
export async function POST(request: NextRequest) {
  try {
    const { symbol, type, entry_price } = await request.json()
    
    if (!symbol || !type || !entry_price) {
      return NextResponse.json(
        { error: 'Parâmetros obrigatórios: symbol, type, entry_price' },
        { status: 400 }
      )
    }

    console.log(`🤖 [ADMIN TP/SL] Recalculando ${symbol} (${type})...`)

    // Calcular TP/SL via API
    const tpslData = await calculateTPSL(symbol, entry_price)
    
    if (!tpslData || !tpslData.success) {
      return NextResponse.json(
        { error: 'Erro ao calcular TP/SL' },
        { status: 500 }
      )
    }

    // Preparar dados para atualização
    const updateData = {
      tp1_price: tpslData.take_profit_levels?.tp1?.price || null,
      tp2_price: tpslData.take_profit_levels?.tp2?.price || null,
      tp3_price: tpslData.take_profit_levels?.tp3?.price || null,
      stop_loss_price: tpslData.stop_loss?.price || null,
      ai_validated: tpslData.ai_validated || false,
      ai_last_analysis: new Date().toISOString(),
      tp1_timeframe: tpslData.take_profit_levels?.tp1?.timeframe || null,
      tp2_timeframe: tpslData.take_profit_levels?.tp2?.timeframe || null,
      tp3_timeframe: tpslData.take_profit_levels?.tp3?.timeframe || null,
      ai_recommendation: tpslData.overall_recommendation?.action || null,
      updated_at: new Date().toISOString()
    }

    // Atualizar no Supabase
    const tableName = type === 'crypto' ? 'admin_crypto_portfolio' : 'admin_etf_portfolio'
    
    const { data, error } = await supabaseAdmin
      .from(tableName)
      .update(updateData)
      .eq('symbol', symbol)
      .select()

    if (error) {
      console.error(`❌ [ADMIN TP/SL] Erro ao atualizar ${symbol}:`, error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    console.log(`✅ [ADMIN TP/SL] ${symbol} atualizado com sucesso!`)

    return NextResponse.json({
      success: true,
      symbol,
      data: data[0],
      message: `TP/SL recalculados para ${symbol}`
    })
  } catch (error) {
    console.error('❌ [ADMIN TP/SL] Erro geral:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro desconhecido' },
      { status: 500 }
    )
  }
}

// GET: Recalcular TP/SL para TODOS os ativos
export async function GET(request: NextRequest) {
  try {
    console.log('🤖 [ADMIN TP/SL] Iniciando recálculo em massa...')

    const results = {
      crypto: { success: 0, failed: 0 },
      etf: { success: 0, failed: 0 }
    }

    // Buscar todos os crypto assets
    const { data: cryptoAssets, error: cryptoError } = await supabaseAdmin
      .from('admin_crypto_portfolio')
      .select('symbol, entry_price')

    if (!cryptoError && cryptoAssets) {
      for (const asset of cryptoAssets) {
        const tpslData = await calculateTPSL(asset.symbol, asset.entry_price)
        
        if (tpslData && tpslData.success) {
          const { error } = await supabaseAdmin
            .from('admin_crypto_portfolio')
            .update({
              tp1_price: tpslData.take_profit_levels?.tp1?.price,
              tp2_price: tpslData.take_profit_levels?.tp2?.price,
              tp3_price: tpslData.take_profit_levels?.tp3?.price,
              stop_loss_price: tpslData.stop_loss?.price,
              ai_validated: tpslData.ai_validated,
              ai_last_analysis: new Date().toISOString(),
              tp1_timeframe: tpslData.take_profit_levels?.tp1?.timeframe,
              tp2_timeframe: tpslData.take_profit_levels?.tp2?.timeframe,
              tp3_timeframe: tpslData.take_profit_levels?.tp3?.timeframe,
              ai_recommendation: tpslData.overall_recommendation?.action,
              updated_at: new Date().toISOString()
            })
            .eq('symbol', asset.symbol)

          if (error) {
            console.error(`❌ Erro ao atualizar ${asset.symbol}:`, error)
            results.crypto.failed++
          } else {
            console.log(`✅ ${asset.symbol} atualizado`)
            results.crypto.success++
          }
        } else {
          results.crypto.failed++
        }

        // Delay para evitar rate limiting
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    // Buscar todos os ETF assets
    const { data: etfAssets, error: etfError } = await supabaseAdmin
      .from('admin_etf_portfolio')
      .select('symbol, entry_price')

    if (!etfError && etfAssets) {
      for (const asset of etfAssets) {
        const tpslData = await calculateTPSL(asset.symbol, asset.entry_price)
        
        if (tpslData && tpslData.success) {
          const { error } = await supabaseAdmin
            .from('admin_etf_portfolio')
            .update({
              tp1_price: tpslData.take_profit_levels?.tp1?.price,
              tp2_price: tpslData.take_profit_levels?.tp2?.price,
              tp3_price: tpslData.take_profit_levels?.tp3?.price,
              stop_loss_price: tpslData.stop_loss?.price,
              ai_validated: tpslData.ai_validated,
              ai_last_analysis: new Date().toISOString(),
              tp1_timeframe: tpslData.take_profit_levels?.tp1?.timeframe,
              tp2_timeframe: tpslData.take_profit_levels?.tp2?.timeframe,
              tp3_timeframe: tpslData.take_profit_levels?.tp3?.timeframe,
              ai_recommendation: tpslData.overall_recommendation?.action,
              updated_at: new Date().toISOString()
            })
            .eq('symbol', asset.symbol)

          if (error) {
            console.error(`❌ Erro ao atualizar ${asset.symbol}:`, error)
            results.etf.failed++
          } else {
            console.log(`✅ ${asset.symbol} atualizado`)
            results.etf.success++
          }
        } else {
          results.etf.failed++
        }

        // Delay para evitar rate limiting
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }

    console.log('✅ [ADMIN TP/SL] Recálculo em massa concluído!')
    console.log(`📊 Crypto: ${results.crypto.success} ✅ | ${results.crypto.failed} ❌`)
    console.log(`📊 ETF: ${results.etf.success} ✅ | ${results.etf.failed} ❌`)

    return NextResponse.json({
      success: true,
      results,
      message: `Recalculados: ${results.crypto.success + results.etf.success} ativos`
    })
  } catch (error) {
    console.error('❌ [ADMIN TP/SL] Erro no recálculo em massa:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro desconhecido' },
      { status: 500 }
    )
  }
}

