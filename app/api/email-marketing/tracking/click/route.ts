import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

const supabase = getSupabaseAdmin()

// GET: Tracking de clique em links
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const emailSendId = searchParams.get('id')
    const targetUrl = searchParams.get('url')
    
    if (!targetUrl) {
      return NextResponse.redirect(process.env.NEXT_PUBLIC_SITE_URL || 'https://morethanmoney.pt')
    }
    
    if (emailSendId) {
      console.log(`🖱️ [TRACKING] Link clicado: ${emailSendId} -> ${targetUrl}`)
      
      // Marcar como clicado usando a função SQL
      const { error } = await supabase.rpc('mark_email_clicked', {
        p_send_id: emailSendId,
        p_url: targetUrl
      })
      
      if (error) {
        console.error('❌ [TRACKING] Erro ao marcar clique:', error)
      }
    }
    
    // Redirecionar para URL de destino
    return NextResponse.redirect(targetUrl)
    
  } catch (error) {
    console.error('❌ [TRACKING] Erro geral:', error)
    
    // Redirecionar para site principal em caso de erro
    return NextResponse.redirect(process.env.NEXT_PUBLIC_SITE_URL || 'https://morethanmoney.pt')
  }
}

