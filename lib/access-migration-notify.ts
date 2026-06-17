import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getOrganizationUplineUserIds } from '@/lib/mlm-uplines'

const supabase = getSupabaseAdmin()

async function getMessaging(): Promise<import('firebase-admin/messaging').Messaging | null> {
  try {
    const mod = (await import('firebase-admin')) as unknown as { default?: any } & Record<string, any>
    const admin = mod.default ?? mod
    if (!admin.apps?.length) {
      const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim()
      if (key) {
        try {
          admin.initializeApp({ credential: admin.credential.cert(JSON.parse(key)) })
        } catch {
          /* já inicializado */
        }
      }
    }
    return admin.apps?.length ? admin.messaging() : null
  } catch {
    return null
  }
}

async function getAdminIds(): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_type', 'admin')
    .eq('is_active', true)
  return (data ?? []).map((r) => r.id as string)
}

async function getSponsorId(sponsorUsername: string | null | undefined): Promise<string | null> {
  if (!sponsorUsername?.trim()) return null
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', sponsorUsername.trim())
    .maybeSingle()
  return data?.id ?? null
}

async function pushToUsers(userIds: string[], title: string, body: string, data?: Record<string, string>) {
  const unique = [...new Set(userIds.filter(Boolean))]
  if (!unique.length) return

  await supabase.from('notifications').insert(
    unique.map((user_id) => ({
      user_id,
      type: 'access_validation_pending',
      title,
      message: body,
      data: data ?? {},
      read: false,
    })),
  )

  const messaging = await getMessaging()
  if (!messaging) return

  const { data: tokens } = await supabase
    .from('fcm_tokens')
    .select('token')
    .in('user_id', unique)

  const list = (tokens ?? []).map((t) => t.token as string).filter(Boolean)
  if (!list.length) return

  try {
    await messaging.sendEachForMulticast({
      tokens: list,
      notification: { title, body },
      data: data ?? {},
    })
  } catch (err) {
    console.warn('[access-migration-notify] FCM:', err)
  }
}

/** IQONIC pendente — alerta admins + sponsor. */
export async function notifyAccessValidationPending(opts: {
  userId: string
  username?: string | null
  fullName?: string | null
  iqonicMemberId: string
  sponsorUsername?: string | null
}) {
  const label = opts.fullName || opts.username || 'Membro'
  const title = 'Validação IQONIC pendente'
  const body = `${label} (ID IQONIC: ${opts.iqonicMemberId}) aguarda validação manual.`

  const adminIds = await getAdminIds()
  const sponsorId = await getSponsorId(opts.sponsorUsername)
  const uplines = await getOrganizationUplineUserIds(opts.userId).catch(() => [] as string[])

  const recipients = [...new Set([...adminIds, ...(sponsorId ? [sponsorId] : []), ...uplines])]

  await pushToUsers(recipients, title, body, {
    user_id: opts.userId,
    iqonic_member_id: opts.iqonicMemberId,
    link: '/admin?tab=users&filter=iqonic_pending',
  })
}
