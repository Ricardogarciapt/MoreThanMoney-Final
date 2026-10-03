/**
 * O COFRE DAS FICHAS DE SESSÃO DA TRADELOCKER — para não fazer login novo a cada execução.
 *
 * PORQUE EXISTE (25/09). O Ricardo foi expulso da sua própria TradeLocker. A cache de fichas do
 * `client.ts` vive na memória do processo, e na Vercel cada execução pode cair numa instância nova:
 * o cron da gestão automática fazia, de minuto a minuto, um LOGIN COMPLETO com as credenciais do
 * dono. A TradeLocker admite uma sessão por utilizador — cada login nosso deitava abaixo a dele.
 *
 * COMO RESOLVE. A ficha passa a ser guardada (cifrada) e partilhada entre execuções. O
 * `obterToken` do cliente já preferia renovar pelo `refreshToken` a autenticar de novo; faltava-lhe
 * era encontrar uma ficha de onde partir. Com o cofre, o login completo passa a acontecer uma vez
 * e depois só quando o refresh também caduca.
 *
 * O QUE ISTO GUARDA, E PORQUÊ NÃO É PIOR DO QUE JÁ HAVIA. Guarda o `accessToken` e o `refreshToken`
 * — cifrados com a MESMA chave das passwords (lib/mtmfunded/credenciais.ts), numa tabela sem
 * políticas de RLS, só alcançável pela chave de serviço. A password da corretora já lá estava
 * guardada da mesma maneira, e dela sai um login a qualquer momento; uma ficha caduca sozinha.
 *
 * REGRA: isto NUNCA trava uma sessão. Um cofre em baixo, uma linha ilegível ou uma chave trocada
 * fazem voltar ao comportamento de antes (login completo) em vez de deixar o trader sem corretora.
 */
import { createHash } from 'node:crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { cifrar, decifrar } from '@/lib/mtmfunded/credenciais'
import { definirCofreTradeLocker, semearTokensTradeLocker, type TLTokens, type TLCredenciais } from './client'

const TABELA = 'tradelocker_sessoes'
type Cred = Pick<TLCredenciais, 'email' | 'server' | 'env'>

/**
 * A chave da linha é o HASH de `env|servidor|email`, não o email em claro.
 *
 * É a mesma chave que o `client.ts` usa para a cache (por isso uma ficha guardada serve exactamente
 * a mesma sessão), mas guardada em digest: quem vier a olhar para esta tabela não precisa de ver a
 * lista de emails de quem tem corretora ligada para perceber o que ela faz.
 */
function chaveDe(c: Cred): string {
  return createHash('sha256').update(`${c.env}|${c.server.toLowerCase()}|${c.email.toLowerCase()}`).digest('hex')
}

/** Sem tabela (migração ainda não aplicada) não é erro: é só «não há cofre». */
function semTabela(e: { code?: string; message?: string } | null): boolean {
  return !!e && (e.code === '42P01' || /does not exist|schema cache/i.test(e.message ?? ''))
}

/** Põe no cofre a ficha que acabou de ser obtida. Falhar aqui não pode estragar o pedido em curso. */
export async function guardarTokens(c: Cred, t: TLTokens): Promise<void> {
  if (!t?.refreshToken && !t?.accessToken) return
  try {
    const { error } = await getSupabaseAdmin().from(TABELA).upsert({
      chave: chaveDe(c),
      tokens_cifrados: cifrar(JSON.stringify(t)),
      expira_em: t.expireDate ?? null,
      atualizado_em: new Date().toISOString(),
    }, { onConflict: 'chave' })
    if (error && !semTabela(error)) console.error('[tl-cofre] guardar:', error.message)
  } catch (e) {
    console.error('[tl-cofre] guardar:', e instanceof Error ? e.message : e)
  }
}

/**
 * Semeia a cache do processo com a ficha guardada, ANTES de a sessão ser usada. Chamar isto é o que
 * evita o login completo; sem ele o cofre só guarda e nunca poupa nada.
 */
export async function semearDoCofre(c: Cred): Promise<void> {
  try {
    const { data, error } = await getSupabaseAdmin().from(TABELA)
      .select('tokens_cifrados').eq('chave', chaveDe(c)).maybeSingle()
    if (error || !data?.tokens_cifrados) {
      if (error && !semTabela(error)) console.error('[tl-cofre] ler:', error.message)
      return
    }
    const claro = decifrar(data.tokens_cifrados as string)
    if (!claro) return // chave trocada ou linha adulterada → login completo, como antes
    const t = JSON.parse(claro) as TLTokens
    // `semearTokensTradeLocker` não pisa uma ficha que o processo já tenha: a da memória é sempre
    // igual ou mais nova do que a guardada.
    if (t?.accessToken || t?.refreshToken) semearTokensTradeLocker(c, t)
  } catch (e) {
    console.error('[tl-cofre] ler:', e instanceof Error ? e.message : e)
  }
}

/**
 * Liga o cofre ao cliente. Idempotente — chamar à vontade de cada vez que se abre uma sessão.
 * A escrita vai sem `await` de propósito: guardar a ficha não pode atrasar o pedido do trader.
 */
export function ligarCofreTradeLocker(): void {
  definirCofreTradeLocker((c, t) => { void guardarTokens(c, t) })
}
