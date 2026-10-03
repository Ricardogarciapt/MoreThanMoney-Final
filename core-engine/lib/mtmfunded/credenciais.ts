import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

/**
 * Cifra das credenciais MT5.
 *
 * A conta é demo, mas a password é de alguém e vai por email: guardá-la em claro numa
 * tabela que meia dúzia de rotas lê é oferecer, num só sítio, a chave de todas as contas
 * do torneio. Cifra-se com AES-256-GCM, chave em `MTMFUNDED_CRED_KEY` (só na Vercel).
 *
 * GCM e não CBC de propósito: traz autenticação. Um valor adulterado na base de dados
 * falha a decifrar em vez de devolver lixo que alguém tentaria usar como password.
 */

function chave(): Buffer {
  const bruta = process.env.MTMFUNDED_CRED_KEY
  if (!bruta || bruta.length < 32) {
    throw new Error('MTMFUNDED_CRED_KEY em falta ou curta (mínimo 32 caracteres)')
  }
  // Normaliza para 32 bytes sem exigir que o segredo tenha exactamente esse tamanho.
  return createHash('sha256').update(bruta).digest()
}

/** Devolve `v1.<iv>.<tag>.<cifra>`, tudo em base64url. */
export function cifrar(texto: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', chave(), iv)
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  const tag = c.getAuthTag()
  const b64 = (b: Buffer) => b.toString('base64url')
  return `v1.${b64(iv)}.${b64(tag)}.${b64(dados)}`
}

/** Decifra. Devolve null se o valor estiver adulterado, truncado ou for de outra chave. */
export function decifrar(guardado: string | null | undefined): string | null {
  if (!guardado) return null
  const partes = guardado.split('.')
  if (partes.length !== 4 || partes[0] !== 'v1') return null
  try {
    const [, iv, tag, dados] = partes
    const d = createDecipheriv('aes-256-gcm', chave(), Buffer.from(iv, 'base64url'))
    d.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([d.update(Buffer.from(dados, 'base64url')), d.final()]).toString('utf8')
  } catch {
    return null
  }
}

/** Está configurado? (para as rotas falharem cedo e com uma mensagem útil) */
export function cifraDisponivel(): boolean {
  try {
    chave()
    return true
  } catch {
    return false
  }
}
