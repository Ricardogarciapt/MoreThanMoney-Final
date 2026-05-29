import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Track AI events for analytics and improvement suggestions
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
    const userId = session?.user?.id || null

    const body = await request.json()
    const { 
      event_type, 
      event_data, 
      context,
      ai_feature,
      response_time,
      success,
      error_message 
    } = body

    // Store event in analytics table
    const { error } = await supabase
      .from('ai_events')
      .insert({
        user_id: userId,
        event_type,
        event_data: event_data || {},
        context: context || {},
        ai_feature,
        response_time,
        success: success !== false,
        error_message,
        created_at: new Date().toISOString()
      })

    if (error) {
      console.error('❌ [AI TRACK] Erro ao salvar evento:', error)
      // Don't fail the request if tracking fails
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('❌ [AI TRACK] Erro:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}




