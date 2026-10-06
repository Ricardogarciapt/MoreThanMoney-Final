/**
 * Grava o consentimento dado na caixa do checkout ou do marketplace (06/10, F4).
 *
 * A decisão é pura (`consentimentoDaCompra` em `lib/captacao-consentimento.ts`): sem a caixa
 * marcada pela pessoa não se grava nada. Isto só escreve a linha no livro
 * (`captacao_consentimento`), que é a fonte que a vista `captacao_permissao_email` e a
 * recuperação de checkouts já lêem. Nunca lança: um consentimento que não gravou não pode
 * impedir uma compra.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { consentimentoDaCompra, type CanalDeCompra } from '@/lib/captacao-consentimento'

export async function registarConsentimentoDaCompra(p: {
  aceitou: unknown
  email: string | null | undefined
  canal: CanalDeCompra
  origemUrl?: string | null
}): Promise<boolean> {
  const linha = consentimentoDaCompra(p)
  if (!linha) return false
  try {
    const db = getSupabaseAdmin()
    // Já consentiu e não retirou? Não se duplica a linha — o livro diz o mesmo.
    const { data: ja } = await db
      .from('captacao_consentimento')
      .select('id')
      .eq('email', linha.email)
      .eq('base_legal', 'consentimento')
      .is('retirado_em', null)
      .limit(1)
    if (ja && ja.length) return true
    const { error } = await db.from('captacao_consentimento').insert(linha)
    if (error) console.error('[consentimento] não gravou:', error.message)
    return !error
  } catch (e) {
    console.error('[consentimento] não gravou:', e instanceof Error ? e.message : e)
    return false
  }
}
