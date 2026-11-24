import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

// Guarda a ligação OAuth de uma conta social em redes_contas (só service role).
export async function guardarContaRede(conta: {
  rede: 'tiktok' | 'linkedin'
  externalId: string
  handle?: string | null
  accessToken: string
  refreshToken?: string | null
  expiresInSeg?: number | null
  refreshExpiresInSeg?: number | null
  scopes?: string[]
}): Promise<void> {
  const agora = Date.now()
  const { error } = await getSupabaseAdmin()
    .from('redes_contas')
    .upsert(
      {
        rede: conta.rede,
        external_id: conta.externalId,
        handle: conta.handle ?? null,
        access_token: conta.accessToken,
        refresh_token: conta.refreshToken ?? null,
        expires_at: conta.expiresInSeg ? new Date(agora + conta.expiresInSeg * 1000).toISOString() : null,
        refresh_expires_at: conta.refreshExpiresInSeg
          ? new Date(agora + conta.refreshExpiresInSeg * 1000).toISOString()
          : null,
        scopes: conta.scopes ?? [],
        updated_at: new Date(agora).toISOString(),
      },
      { onConflict: 'rede,external_id' },
    )
  if (error) throw new Error(`redes_contas: ${error.message}`)
}
