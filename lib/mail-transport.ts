import fs from 'fs'
import path from 'path'
import nodemailer from 'nodemailer'
import type { Attachment } from 'nodemailer/lib/mailer'
import { SITE_LOGO_PATH } from '@/lib/site-logo'
import { sanitizeEnv } from '@/lib/env-sanitize'

/** CID inline — logo embutido no email (funciona mesmo com imagens remotas bloqueadas). */
export const EMAIL_LOGO_CID = 'mtm-logo'

export function getSiteUrl(): string {
  return sanitizeEnv(process.env.NEXT_PUBLIC_SITE_URL, 'https://www.morethanmoney.pt').replace(/\/$/, '')
}

/** URL pública do logo (site, previews). */
export function getLogoUrl(): string {
  return `${getSiteUrl()}${SITE_LOGO_PATH}`
}

/** Src para `<img>` em emails HTML — usa anexo inline CID. */
export function getEmailLogoSrc(): string {
  return `cid:${EMAIL_LOGO_CID}`
}

function isValidLogoFile(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false
    const stat = fs.statSync(filePath)
    if (stat.size < 512) return false
    const header = fs.readFileSync(filePath).subarray(0, 8)
    return header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47
  } catch {
    return false
  }
}

/** Caminho absoluto do PNG oficial em `public/`. */
export function resolveEmailLogoFilePath(): string {
  const publicDir = path.join(process.cwd(), 'public')
  const candidates = [
    path.join(publicDir, SITE_LOGO_PATH.replace(/^\//, '')),
    path.join(publicDir, 'logo-mf-gold.png'),
    path.join(publicDir, 'logo-new.png'),
  ]
  for (const candidate of candidates) {
    if (isValidLogoFile(candidate)) return candidate
  }
  return candidates[0]
}

export function getEmailLogoAttachment(): Attachment {
  return {
    filename: 'logo-mtm.png',
    path: resolveEmailLogoFilePath(),
    cid: EMAIL_LOGO_CID,
  }
}

/** Substitui URLs remotas do logo por CID inline antes do envio. */
export function prepareBrandedEmailHtml(html: string): string {
  const site = getSiteUrl()
  const remotePatterns = [
    `${site}${SITE_LOGO_PATH}`,
    `${site}/logo-mf-gold.png`,
    `${site}/logo-new.png`,
    'https://www.morethanmoney.pt/icon-512x512.png',
    'https://www.morethanmoney.pt/logo-mf-gold.png',
    'https://morethanmoney.pt/icon-512x512.png',
    'https://morethanmoney.pt/logo-mf-gold.png',
  ]
  let out = html
  const cidSrc = getEmailLogoSrc()
  for (const pattern of remotePatterns) {
    out = out.split(pattern).join(cidSrc)
  }
  return out
}

export function brandedMailAttachments(): Attachment[] {
  return [getEmailLogoAttachment()]
}

/**
 * A conta de envio, limpa.
 *
 * `sanitizeEnv` não é zelo a mais: o `GMAIL_USER` estava gravado como
 * `"morethanmoneypt@gmail.com\n"` — com a quebra de linha dentro do valor — e ia inteiro para o
 * cabeçalho `From`, que passava a `<morethanmoneypt@gmail.com\n>`. Um endereço com uma quebra de
 * linha lá dentro é um cabeçalho malformado: na melhor das hipóteses cai no spam, na pior o
 * servidor recusa a mensagem. E como isto passa por TODOS os emails do site, falhava em todos ao
 * mesmo tempo, sem ninguém dar por isso.
 */
function contaDeEnvio(): string {
  return sanitizeEnv(process.env.GMAIL_USER, 'morethanmoneypt@gmail.com')
}

export function createMailTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: contaDeEnvio(),
      pass: sanitizeEnv(process.env.GMAIL_APP_PASSWORD),
    },
  })
}

export function mailFrom(): string {
  return `"MoreThanMoney" <${contaDeEnvio()}>`
}
