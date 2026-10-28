/**
 * O COFRE: a carteira Solana do agente, criada e guardada SÓ na VPS.
 *
 *  · Gera-se aqui (Keypair.generate), na primeira vez que o executor arranca. A chave nunca sai
 *    deste processo: não vai para a Supabase, para o Vercel, para logs nem para nenhuma IA.
 *  · Fica cifrada em disco (scrypt + AES-256-GCM) com a frase de CRIPTO_COFRE_FRASE, em ficheiro
 *    0600 do utilizador `mtm-cripto`. Roubar só o ficheiro não chega; roubar só o env também não.
 *  · Cá fora só sai o endereço PÚBLICO (para o dono financiar e para o dashboard).
 *
 * A cópia de segurança é decisão do dono: `node executor.js --exportar-chave` imprime a chave UMA
 * vez no terminal da VPS, para ele a guardar no gestor de palavras-passe. Sem isso, se a VPS morrer,
 * o saldo da carteira perde-se.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'

interface Ficheiro {
  v: 1
  publica: string
  sal: string
  iv: string
  tag: string
  cifra: string
  criadaEm: string
}

function chaveDaFrase(frase: string, sal: Buffer): Buffer {
  if (!frase || frase.length < 16) throw new Error('CRIPTO_COFRE_FRASE em falta ou com menos de 16 caracteres.')
  return scryptSync(frase, sal, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
}

export function cifrar(segredo: Uint8Array, frase: string, publica: string): Ficheiro {
  const sal = randomBytes(16)
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', chaveDaFrase(frase, sal), iv)
  const cifra = Buffer.concat([c.update(Buffer.from(segredo)), c.final()])
  return { v: 1, publica, sal: sal.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), cifra: cifra.toString('base64'), criadaEm: new Date().toISOString() }
}

export function decifrar(f: Ficheiro, frase: string): Uint8Array {
  const d = createDecipheriv('aes-256-gcm', chaveDaFrase(frase, Buffer.from(f.sal, 'base64')), Buffer.from(f.iv, 'base64'))
  d.setAuthTag(Buffer.from(f.tag, 'base64'))
  return new Uint8Array(Buffer.concat([d.update(Buffer.from(f.cifra, 'base64')), d.final()]))
}

/** Abre a carteira; cria-a se ainda não existir. Devolve o Keypair e se acabou de ser criada. */
export function abrirOuCriarCarteira(caminho: string, frase: string): { carteira: Keypair; nova: boolean } {
  if (existsSync(caminho)) {
    const f = JSON.parse(readFileSync(caminho, 'utf8')) as Ficheiro
    const carteira = Keypair.fromSecretKey(decifrar(f, frase))
    if (carteira.publicKey.toBase58() !== f.publica) throw new Error('Cofre corrompido: a chave não corresponde ao endereço guardado.')
    return { carteira, nova: false }
  }
  const carteira = Keypair.generate()
  mkdirSync(dirname(caminho), { recursive: true, mode: 0o700 })
  writeFileSync(caminho, JSON.stringify(cifrar(carteira.secretKey, frase, carteira.publicKey.toBase58())), { mode: 0o600, flag: 'wx' })
  chmodSync(caminho, 0o600)
  return { carteira, nova: true }
}

/** Só para o `--exportar-chave`, corrido à mão pelo dono no terminal da VPS. */
export function chaveEmTexto(carteira: Keypair): string {
  return bs58.encode(carteira.secretKey)
}
