import type { SupabaseClient } from '@supabase/supabase-js'
import {
  brandedMailAttachments, createMailTransporter, getEmailLogoSrc, getSiteUrl, mailFrom, prepareBrandedEmailHtml,
} from '@/lib/mail-transport'

/**
 * OS AVISOS QUE O ADMIN MANDA AO DONO DE UMA CONTA — email e push, a partir do modal.
 *
 * Modelos fechados e sem passwords (a regra de sempre: vêem-se no painel, com sessão). O texto
 * livre do admin entra escapado, como parágrafo, nunca como HTML.
 */

export type ModeloAviso = 'pausa' | 'retoma' | 'aviso_regras' | 'conta_revista' | 'livre'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

export function textoDoModelo(modelo: ModeloAviso, login: string, texto: string | null): { titulo: string; corpo: string } {
  const extra = texto ? ` ${texto}` : ''
  switch (modelo) {
    case 'pausa':
      return { titulo: `Conta ${login} em pausa`, corpo: `A tua conta ${login} foi colocada em pausa pelo suporte: não aceita ordens novas, e as posições abertas mantêm o SL/TP.${extra}` }
    case 'retoma':
      return { titulo: `Conta ${login} reactivada`, corpo: `A pausa da tua conta ${login} terminou — já podes voltar a negociar.${extra}` }
    case 'aviso_regras':
      return { titulo: `Atenção às regras da conta ${login}`, corpo: `A tua conta ${login} está perto de um limite do programa. Revê a perda diária e o drawdown no painel antes da próxima trade.${extra}` }
    case 'conta_revista':
      return { titulo: `A conta ${login} foi revista`, corpo: `O suporte reviu a tua conta ${login}. Abre o painel para veres o estado actualizado.${extra}` }
    case 'livre':
      return { titulo: `MTM Funded · conta ${login}`, corpo: texto || `Mensagem do suporte sobre a tua conta ${login}.` }
  }
}

export async function notificarDono(p: {
  db: SupabaseClient
  userId: string
  conta: Record<string, unknown>
  modelo: ModeloAviso
  texto: string | null
  email: boolean
  push: boolean
}): Promise<{ email: 'enviado' | 'falhou' | 'sem_email' | 'nao_pedido'; push: 'enviado' | 'falhou' | 'nao_pedido' }> {
  if (p.modelo === 'livre' && !p.texto) throw Object.assign(new Error('escreve a mensagem'), { status: 400 })
  const login = String(p.conta.mt5_login ?? '—')
  const { titulo, corpo } = textoDoModelo(p.modelo, login, p.texto)
  const { data: perfil } = await p.db.from('profiles').select('full_name, email').eq('id', p.userId).maybeSingle()

  let email: 'enviado' | 'falhou' | 'sem_email' | 'nao_pedido' = 'nao_pedido'
  if (p.email) {
    if (!perfil?.email) email = 'sem_email'
    else {
      const site = getSiteUrl()
      const nome = String(perfil.full_name ?? '').trim().split(/\s+/)[0] || 'Trader'
      const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;">
        <div style="text-align:center;padding:28px 0;"><img src="${getEmailLogoSrc()}" alt="MTM Funded" width="160" style="max-width:160px;" /></div>
        <div style="background:#fff;border-radius:16px;padding:28px;">
          <h1 style="margin:0;font-size:21px;color:#111;">${esc(titulo)}</h1>
          <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#444;">Olá ${esc(nome)},</p>
          <p style="margin:10px 0 18px;font-size:15px;line-height:1.6;color:#444;">${esc(corpo)}</p>
          <a href="${site}/mtmfunded/tradingtournament/dashboard" style="display:inline-block;background:#BB8525;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;">Abrir o painel</a>
          <p style="margin:20px 0 0;font-size:12px;color:#999;">Negociação simulada. As credenciais nunca vão por email.</p>
        </div>
      </div>`
      try {
        await createMailTransporter().sendMail({
          from: mailFrom(), to: perfil.email as string, subject: `${titulo} · MTM Funded`,
          html: prepareBrandedEmailHtml(html), attachments: brandedMailAttachments(),
        })
        email = 'enviado'
      } catch (e) {
        console.error('[mtmfunded/admin] email ao dono falhou:', e)
        email = 'falhou'
      }
    }
  }

  let push: 'enviado' | 'falhou' | 'nao_pedido' = 'nao_pedido'
  if (p.push) {
    try {
      const { getSiteOrigin } = await import('@/lib/site-url')
      const r = await fetch(`${getSiteOrigin()}/api/notifications/send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: p.userId, title: titulo, body: corpo.slice(0, 180),
          url: '/app-mobile?tab=funded', data: { type: 'mtmfunded_admin_aviso', url: '/app-mobile?tab=funded' },
          tag: `mtmfunded-admin-${String(p.conta.id ?? '')}`,
        }),
        signal: AbortSignal.timeout(20_000),
      })
      push = r.ok ? 'enviado' : 'falhou'
    } catch {
      push = 'falhou'
    }
  }
  return { email, push }
}
