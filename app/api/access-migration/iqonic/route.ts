import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { mergeAccessMigration } from '@/lib/access-migration'
import { notifyAccessValidationPending } from '@/lib/access-migration-notify'

const supabase = getSupabaseAdmin()
const BUCKET = 'access-proofs'

async function authUser(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '')
  const { data: { user } } = await supabase.auth.getUser(token)
  return user
}

export async function POST(request: NextRequest) {
  const user = await authUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 })
  }

  const form = await request.formData()
  const iqonicMemberId = String(form.get('iqonic_member_id') ?? '').trim()
  const file = form.get('proof') as File | null

  if (!iqonicMemberId || iqonicMemberId.length < 3) {
    return NextResponse.json({ error: 'ID IQONIC obrigatório' }, { status: 400 })
  }

  if (!file || !(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: 'Print da subscrição activa é obrigatório' }, { status: 400 })
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Imagem demasiado grande (máx. 5MB)' }, { status: 400 })
  }

  const ext = file.type.includes('png') ? 'png' : file.type.includes('webp') ? 'webp' : 'jpg'
  const path = `${user.id}/iqonic-proof-${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type || 'image/jpeg',
    upsert: true,
  })

  if (uploadError) {
    console.error('[access-migration/iqonic] upload:', uploadError.message)
    return NextResponse.json({ error: 'Falha ao carregar imagem' }, { status: 500 })
  }

  const { data: urlData } = supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 30)

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const profileData = mergeAccessMigration(profile ?? {}, {
    access_payment_channel: 'iqonic',
    iqonic_member_id: iqonicMemberId,
    iqonic_proof_url: urlData?.signedUrl ?? path,
    access_validation_status: 'pending',
    access_validation_requested_at: new Date().toISOString(),
    access_revalidation_required: true,
  })

  await supabase
    .from('profiles')
    .update({
      profile_data: profileData,
      member_category: 'iq',
      onboarding_platform: 'iqonic',
      is_active: false,
      user_type: 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  void notifyAccessValidationPending({
    userId: user.id,
    username: profile?.username,
    fullName: profile?.full_name,
    iqonicMemberId,
    sponsorUsername: profile?.mlm_sponsor_username,
  })

  await supabase.auth.admin.signOut(user.id, 'global')

  return NextResponse.json({
    success: true,
    message:
      'Pedido enviado. A validação será feita nas próximas horas. Só poderás entrar após aprovação no gestor de utilizadores.',
    signed_out: true,
  })
}
