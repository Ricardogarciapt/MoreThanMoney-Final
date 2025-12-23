import { NextResponse } from "next/server"
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// API para obter estatísticas gerais
export async function GET() {
  try {
    const { count: users } = await supabase.from('users').select('*', { count: 'exact', head: true })
    const { count: products } = await supabase.from('products').select('*', { count: 'exact', head: true })
    return NextResponse.json({ users, products })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
