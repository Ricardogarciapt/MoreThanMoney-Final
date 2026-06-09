import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"

// API para obter estatísticas gerais
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const { count: users } = await supabase.from('users').select('*', { count: 'exact', head: true })
    const { count: products } = await supabase.from('products').select('*', { count: 'exact', head: true })
    return NextResponse.json({ users, products })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
