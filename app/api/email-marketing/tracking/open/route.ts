import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Tracking pixel transparente (1x1 GIF)
const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

// GET: Tracking de abertura de email
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const emailSendId = searchParams.get('id')
    
    if (!emailSendId) {
      return new NextResponse(TRACKING_PIXEL, {
        status: 200,
        headers: {
          'Content-Type': 'image/gif',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
    }
    
    // Obter informações da requisição
    const userAgent = request.headers.get('user-agent') || undefined
    const forwardedFor = request.headers.get('x-forwarded-for')
    const ipAddress = forwardedFor?.split(',')[0] || request.headers.get('x-real-ip') || undefined
    
    console.log(`👁️ [TRACKING] Email aberto: ${emailSendId}`)
    
    // Marcar como aberto usando a função SQL
    const { error } = await supabase.rpc('mark_email_opened', {
      p_send_id: emailSendId,
      p_user_agent: userAgent,
      p_ip_address: ipAddress
    })
    
    if (error) {
      console.error('❌ [TRACKING] Erro ao marcar abertura:', error)
    }
    
    // Retornar pixel transparente
    return new NextResponse(TRACKING_PIXEL, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
    
  } catch (error) {
    console.error('❌ [TRACKING] Erro geral:', error)
    
    // Retornar pixel mesmo em erro
    return new NextResponse(TRACKING_PIXEL, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      }
    })
  }
}

