import type { SupabaseClient } from '@supabase/supabase-js'

/** Utilizador sistema para posts automáticos no chat (DCA, boas-vindas, etc.) */
export async function resolveSystemUserId(
  supabase: SupabaseClient,
): Promise<string> {
  const { data: bot } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', 'sistema@morethanmoney.pt')
    .maybeSingle()
  if (bot?.id) return bot.id

  const { data: admin } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_type', 'admin')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (admin?.id) return admin.id

  throw new Error('Nenhum utilizador sistema/admin encontrado para posts no chat')
}
