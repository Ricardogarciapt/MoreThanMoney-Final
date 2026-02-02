import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Mentores disponíveis
const MENTORS = {
  warren_buffett: {
    name: 'Warren Buffett',
    style: 'Focado em investimentos de valor de longo prazo, paciência e disciplina financeira. Fala de forma sábia e conservadora.',
    expertise: ['investimentos', 'valor', 'longo prazo', 'disciplina']
  },
  eric_worre: {
    name: 'Eric Worre',
    style: 'Especialista em Network Marketing e construção de negócios. Motivacional, prático e focado em resultados.',
    expertise: ['network marketing', 'negócios', 'liderança', 'vendas']
  },
  grant_cardone: {
    name: 'Grant Cardone',
    style: 'Energético e direto. Focado em vendas, crescimento de negócios e mentalidade de abundância.',
    expertise: ['vendas', 'crescimento', 'abundância', 'expansão']
  },
  daniel_g: {
    name: 'Daniel G',
    style: 'Especialista em desenvolvimento pessoal e mentalidade de sucesso. Inspirador e prático.',
    expertise: ['desenvolvimento pessoal', 'mentalidade', 'sucesso', 'produtividade']
  },
  rich_dad_poor_dad: {
    name: 'Pai Rico Pai Pobre',
    style: 'Focado em educação financeira, ativos vs passivos e independência financeira. Ensina através de histórias.',
    expertise: ['educação financeira', 'ativos', 'independência financeira', 'libertação']
  }
}

// GET: Obter histórico de sessões de mindset
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const mentorType = searchParams.get('mentor')
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabase
      .from('mindset_sessions')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (mentorType) {
      query = query.eq('mentor_type', mentorType)
    }

    const { data, error } = await query

    if (error) {
      console.error('❌ [MINDSET API] Erro ao buscar sessões:', error)
      return NextResponse.json({ error: 'Erro ao buscar sessões' }, { status: 500 })
    }

    return NextResponse.json({ sessions: data || [] })
  } catch (error: any) {
    console.error('❌ [MINDSET API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

// POST: Criar nova sessão de mindset com IA
export async function POST(request: NextRequest) {
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
    const { message, mentor_type, session_type, context } = body

    if (!message || !mentor_type) {
      return NextResponse.json(
        { error: 'Mensagem e tipo de mentor são obrigatórios' },
        { status: 400 }
      )
    }

    const mentor = MENTORS[mentor_type as keyof typeof MENTORS]
    if (!mentor) {
      return NextResponse.json({ error: 'Mentor inválido' }, { status: 400 })
    }

    // Buscar objetivos do user para contexto
    const { data: mindsetGoals } = await supabase
      .from('mindset_goals')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .limit(5)

    // Buscar histórico recente
    const { data: recentSessions } = await supabase
      .from('mindset_sessions')
      .select('user_message, ai_response')
      .eq('user_id', session.user.id)
      .eq('mentor_type', mentor_type)
      .order('created_at', { ascending: false })
      .limit(3)

    // Construir prompt para OpenAI
    const goalsContext = mindsetGoals && mindsetGoals.length > 0
      ? `\n\nObjetivos ativos do utilizador:\n${JSON.stringify(mindsetGoals.map(g => ({
          type: g.goal_type,
          target: g.target_value,
          current: g.current_value,
          description: g.description
        })), null, 2)}`
      : ''

    const historyContext = recentSessions && recentSessions.length > 0
      ? `\n\nHistórico recente de conversas:\n${recentSessions.map(s => `User: ${s.user_message}\nMentor: ${s.ai_response}`).join('\n\n')}`
      : ''

    const systemPrompt = `Você é ${mentor.name}, ${mentor.style}

${mentor.expertise.map(e => `- Especialista em ${e}`).join('\n')}

${goalsContext}
${historyContext}

${context ? `\nContexto adicional: ${JSON.stringify(context)}` : ''}

Responda como ${mentor.name} responderia, mantendo o estilo e expertise. Seja inspirador, prático e focado em ajudar o utilizador a alcançar seus objetivos. Seja conciso mas completo.`

    const openaiKey = process.env.OPENAI_API_KEY
    if (!openaiKey) {
      return NextResponse.json({ error: 'OpenAI API não configurada' }, { status: 500 })
    }

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
        max_tokens: 800
      })
    })

    if (!response.ok) {
      const errorData = await response.text()
      console.error('❌ [MINDSET API] OpenAI error:', errorData)
      return NextResponse.json({ error: 'Erro ao processar com IA' }, { status: 500 })
    }

    const data = await response.json()
    const aiResponse = data.choices[0]?.message?.content || 'Desculpe, não consegui processar sua mensagem.'

    // Salvar sessão no banco
    const { data: sessionData, error: insertError } = await supabase
      .from('mindset_sessions')
      .insert({
        user_id: session.user.id,
        mentor_type,
        session_type: session_type || 'mindset',
        user_message: message,
        ai_response: aiResponse,
        context: context || {}
      })
      .select()
      .single()

    if (insertError) {
      console.error('❌ [MINDSET API] Erro ao salvar sessão:', insertError)
      // Retornar resposta mesmo se falhar ao salvar
    }

    return NextResponse.json({
      success: true,
      response: aiResponse,
      session: sessionData
    })
  } catch (error: any) {
    console.error('❌ [MINDSET API] Erro:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

