import nodemailer from 'nodemailer'

export function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '') ||
    'https://www.morethanmoney.pt'
  )
}

export function getLogoUrl(): string {
  return `${getSiteUrl()}/logo-mf-gold.png`
}

export function createMailTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER || 'morethanmoneypt@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD || '',
    },
  })
}

export function mailFrom(): string {
  const user = process.env.GMAIL_USER || 'morethanmoneypt@gmail.com'
  return `"MoreThanMoney" <${user}>`
}
