import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// AI Chat endpoint with DCA context awareness
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  let success = true
  let errorMessage = null

  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const { message, context } = body

    if (!message) {
      return NextResponse.json({ error: 'Mensagem é obrigatória' }, { status: 400 })
    }

    const openaiKey = process.env.OPENAI_API_KEY
    if (!openaiKey) {
      return NextResponse.json({ error: 'OpenAI API não configurada' }, { status: 500 })
    }

    // Get user's DCA data if available
    let dcaContext = ''
    if (context?.include_dca) {
      try {
        const { data: dcaData } = await supabase
          .from('dca_plans')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(5)

        if (dcaData && dcaData.length > 0) {
          dcaContext = `\n\nContexto DCA do utilizador:\n${JSON.stringify(dcaData, null, 2)}`
        }
      } catch (dcaError) {
        console.warn('⚠️ [AI CHAT] Erro ao buscar contexto DCA:', dcaError)
      }
    }

    const systemPrompt = `Você é um assistente de trading especializado em ajudar utilizadores com estratégias DCA (Dollar Cost Averaging), análise de portfólio e gestão de risco.

${dcaContext}

Seja conciso, útil e focado em ajudar o utilizador a tomar decisões informadas. Use dados reais quando disponíveis.`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    })

    if (!response.ok) {
      success = false
      errorMessage = `OpenAI API error: ${response.status}`
      const errorData = await response.text()
      console.error('❌ [AI CHAT] OpenAI error:', errorData)
      
      // Track error
      try {
        await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/ai/track-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_type: 'ai_chat_error',
            event_data: { message_length: message.length },
            context: { user_id: session.user.id },
            ai_feature: 'chat_assistant',
            response_time: Date.now() - startTime,
            success: false,
            error_message: errorMessage
          })
        })
      } catch (trackError) {
        console.warn('⚠️ [AI CHAT] Erro ao trackear evento de erro:', trackError)
      }
      
      return NextResponse.json({ error: 'Erro ao processar mensagem' }, { status: 500 })
    }

    const data = await response.json()
    const aiMessage = data.choices[0]?.message?.content || 'Desculpe, não consegui processar sua mensagem.'

    const responseTime = Date.now() - startTime
    success = true

    // Track event
    try {
      await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/ai/track-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'ai_chat_response',
          event_data: { 
            message_length: message.length, 
            response_length: aiMessage.length,
            has_dca_context: !!dcaContext 
          },
          context: { user_id: session.user.id },
          ai_feature: 'chat_assistant',
          response_time: responseTime,
          success: true
        })
      })
    } catch (trackError) {
      console.warn('⚠️ [AI CHAT] Erro ao trackear evento:', trackError)
    }

    return NextResponse.json({
      success: true,
      message: aiMessage,
      response: aiMessage, // Also include as 'response' for compatibility
      response_time: responseTime
    })
  } catch (error: any) {
    success = false
    errorMessage = error.message
    console.error('❌ [AI CHAT] Erro:', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

