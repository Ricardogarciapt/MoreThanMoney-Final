import { NextResponse } from "next/server"
import { createClient } from '@supabase/supabase-js'

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase configuration is missing")
  }
  
  return createClient(supabaseUrl, supabaseKey)
}

// API para obter estatísticas gerais
export async function GET() {
  try {
    const supabase = getSupabaseClient()
    const { count: users } = await supabase.from('users').select('*', { count: 'exact', head: true })
    const { count: products } = await supabase.from('products').select('*', { count: 'exact', head: true })
    return NextResponse.json({ users, products })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
