import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Cliente admin do Supabase (service role para bypass RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
)

// Cliente normal para autenticação
const getSupabaseClient = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

export async function POST(request: NextRequest) {
  try {
    // Verificar autenticação usando cookie da sessão
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader) {
      console.error('❌ [ADMIN SYNC] Sem header de autorização')
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    // Extrair token do header (formato: "Bearer TOKEN")
    const token = authHeader.replace('Bearer ', '')
    
    // Verificar se é admin usando service role
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !user) {
      console.error('❌ [ADMIN SYNC] Erro de autenticação:', authError)
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('user_type')
      .eq('id', user.id)
      .single()

    if (profile?.user_type !== 'admin') {
      console.error('❌ [ADMIN SYNC] User não é admin:', user.email)
      return NextResponse.json({ error: 'Apenas admin pode sincronizar' }, { status: 403 })
    }
    
    console.log('✅ [ADMIN SYNC] Admin verificado:', user.email)

    // Receber dados
    const body = await request.json()
    const { crypto, etf } = body

    console.log('🔄 [ADMIN SYNC] Sincronizando portfolios...')
    console.log('💰 [ADMIN SYNC] Crypto assets:', crypto?.length || 0)
    console.log('📈 [ADMIN SYNC] ETF assets:', etf?.length || 0)

    // Limpar e inserir crypto
    if (crypto && crypto.length > 0) {
      // Deletar todos os existentes
      await supabaseAdmin.from('admin_crypto_portfolio').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      
      // Inserir novos
      const { error: cryptoError } = await supabaseAdmin
        .from('admin_crypto_portfolio')
        .insert(crypto.map((a: any) => ({
          categoria: a.categoria,
          criptomoeda: a.criptomoeda,
          symbol: a.symbol,
          percentual: a.percentual,
          investimento_inicial: a.investimento_inicial,
          reforco_mensal: a.reforco_mensal,
          reforco_anual: a.reforco_anual,
          potencial_crescimento_percent: a.potencial_crescimento_percent,
          potencial_crescimento_valor: a.potencial_crescimento_valor,
          entry_price: a.entry_price
        })))

      if (cryptoError) {
        console.error('❌ [ADMIN SYNC] Erro crypto:', cryptoError)
        throw cryptoError
      }

      console.log('✅ [ADMIN SYNC] Crypto sincronizado')
    }

    // Limpar e inserir ETF
    if (etf && etf.length > 0) {
      // Deletar todos os existentes
      await supabaseAdmin.from('admin_etf_portfolio').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      
      // Inserir novos
      const { error: etfError } = await supabaseAdmin
        .from('admin_etf_portfolio')
        .insert(etf.map((a: any) => ({
          categoria: a.categoria,
          etf: a.etf,
          symbol: a.symbol,
          percentual: a.percentual,
          investimento_inicial: a.investimento_inicial,
          reforco_semanal: a.reforco_semanal,
          reforco_total_5anos: a.reforco_total_5anos,
          crescimento_esperado_percent: a.crescimento_esperado_percent,
          crescimento_esperado_valor: a.crescimento_esperado_valor,
          entry_price: a.entry_price
        })))

      if (etfError) {
        console.error('❌ [ADMIN SYNC] Erro ETF:', etfError)
        throw etfError
      }

      console.log('✅ [ADMIN SYNC] ETF sincronizado')
    }

    return NextResponse.json({
      success: true,
      message: 'Portfolios sincronizados com sucesso!',
      crypto_count: crypto?.length || 0,
      etf_count: etf?.length || 0,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ [ADMIN SYNC] Erro:', error)
    return NextResponse.json(
      { error: 'Erro ao sincronizar', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    )
  }
}

