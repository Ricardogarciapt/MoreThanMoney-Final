import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/** Evita correr o mesmo cron DCA mais do que uma vez por dia (UTC). */
export async function hasDcaCronRunToday(cronKey: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('notifications')
    .select('id')
    .eq('type', 'cron_marker')
    .eq('message', cronKey)
    .gte('created_at', `${today}T00:00:00.000Z`)
    .limit(1)
    .maybeSingle()
  return Boolean(data?.id)
}

export async function markDcaCronRun(cronKey: string, systemUserId: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  await supabase.from('notifications').insert({
    user_id: systemUserId,
    type: 'cron_marker',
    title: 'Cron',
    message: cronKey,
    data: { cron_key: cronKey },
    read: true,
  }).then(undefined, () => {})
}
