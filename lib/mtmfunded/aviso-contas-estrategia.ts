import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  brandedMailAttachments, createMailTransporter, getEmailLogoSrc, getSiteUrl, mailFrom, prepareBrandedEmailHtml,
} from '@/lib/mail-transport'
import type { ResultadoUtilizador } from './contas-estrategia'

/**
 * O AVISO DAS CONTAS DE ACOMPANHAMENTO — email + notificação (push e sino), uma vez por conta.
 *
 * Só corre quando o admin o pede (`notificar: true` na rota). Idempotente: cada conta guarda
 * `metricas.notificado_em`; correr outra vez não repete o aviso das contas já avisadas.
 *
 * O que o texto diz e não diz, por decisão:
 *  · diz que é SIMULADO e educativo, que acompanha cada estratégia em tempo real, onde se vê o
 *    desempenho (Web trader → Conta) e que resultados passados não garantem resultados futuros;
 *  · NÃO leva passwords (a regra de sempre: vêem-se no painel, com sessão), nem euros, nem
 *    promessas de lucro.
 */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

export async function enviarEmailContasEstrategia(p: {
  para: string
  nome: string
  saldo: number
  contas: Array<{ nomeEstrategia: string; login: string | null }>
}): Promise<{ success: boolean }> {
  const site = getSiteUrl()
  const linkApp = 'https://www.morethanmoney.pt/app-mobile?tab=scanner&sub=webtrader'
  const linkWeb = 'https://www.morethanmoney.pt/webtrader'
  const linhas = p.contas.map((c) => `
      <tr>
        <td style="padding:8px 0;border-top:1px solid #eee;"><span style="background:#D2A63C;color:#000;font-weight:700;font-size:11px;padding:2px 6px;border-radius:4px;">Funded</span></td>
        <td style="padding:8px 6px;border-top:1px solid #eee;color:#111;">segue <strong>${esc(c.nomeEstrategia)}</strong></td>
        <td style="padding:8px 0;border-top:1px solid #eee;text-align:right;font-family:monospace;color:#111;">${esc(c.login ?? '—')}</td>
      </tr>`).join('')

  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f9fa;padding:20px;">
    <div style="text-align:center;background:linear-gradient(135deg,#D2A63C,#BB8525);padding:24px;border-radius:12px 12px 0 0;">
      <img src="${getEmailLogoSrc()}" alt="MoreThanMoney" width="140" />
    </div>
    <div style="background:#ffffff;padding:28px;border-radius:0 0 12px 12px;">
      <h2 style="color:#BB8525;margin:0 0 12px;">Contas atribuídas, ${esc(p.nome)}</h2>
      <p style="font-size:15px;color:#333;line-height:1.6;margin:0;">
        Atribuímos-te contas para <strong>acompanhamento das estratégias em tempo real e da sua performance</strong>.
        Cada conta segue uma estratégia do MTM Auto e abre, gere e fecha as posições como a estratégia as abre, gere e fecha.
      </p>

      <table style="width:100%;margin:20px 0;border-collapse:collapse;font-size:14px;">
        <tr>
          <td style="padding:6px 0;color:#666;font-size:12px;">Conta</td>
          <td style="padding:6px;color:#666;font-size:12px;">Estratégia</td>
          <td style="padding:6px 0;color:#666;font-size:12px;text-align:right;">Login</td>
        </tr>
        ${linhas}
      </table>
      <p style="margin:0;font-size:13px;color:#555;line-height:1.6;">
        Servidor <strong>MTM Funded</strong> · saldo inicial <strong>${Number(p.saldo).toLocaleString('pt-PT')} USD simulados</strong> por conta.
        Estas contas também aceitam as ideias que confirmares no Tap to Trade.
      </p>

      <div style="margin:20px 0;padding:14px 16px;background:#faf6ec;border:1px solid #eadcb8;border-radius:10px;">
        <p style="margin:0;font-size:14px;color:#333;line-height:1.6;">
          Abre o Web trader e escolhe a conta no topo. Em <strong>Conta</strong> vês o desempenho de cada estratégia:
          trades terminadas, taxa de acerto, pips, retorno em % e drawdown máximo.
        </p>
        <a href="${linkApp}" style="display:inline-block;margin-top:12px;background:#BB8525;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;">Abrir na app</a>
        <a href="${linkWeb}" style="display:inline-block;margin:12px 0 0 8px;color:#BB8525;text-decoration:none;padding:10px 4px;font-weight:600;font-size:14px;">ou no browser →</a>
      </div>

      <p style="margin:0 0 8px;font-size:13px;color:#666;line-height:1.6;">
        A palavra-passe não vai por email: está no painel, protegida pela tua conta MTM.
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#888;line-height:1.6;">
        Negociação <strong>simulada</strong>, com fins educativos — não há dinheiro real nestas contas.
        Resultados passados não garantem resultados futuros.
      </p>
      <p style="font-size:13px;color:#999;margin-top:24px;">
        Boas análises. — Equipa MoreThanMoney<br />
        <a href="${site}" style="color:#BB8525;">${site.replace(/^https?:\/\//, '')}</a>
      </p>
    </div>
  </div>`

  try {
    await createMailTransporter().sendMail({
      from: mailFrom(),
      to: p.para,
      subject: 'Contas atribuídas para acompanhamento das estratégias em tempo real',
      html: prepareBrandedEmailHtml(html),
      attachments: brandedMailAttachments(),
    })
    return { success: true }
  } catch (e) {
    console.error('[mtmfunded] aviso de contas de estratégia falhou:', e)
    return { success: false }
  }
}

export type EstadoAviso = { email: 'enviado' | 'ja_enviado' | 'falhou' | 'sem_email'; push: 'enviado' | 'ja_enviado' | 'falhou' }

export async function avisarContasDeEstrategia(r: ResultadoUtilizador, saldo: number): Promise<EstadoAviso> {
  const db = getSupabaseAdmin()
  const contas = r.contas.filter((c) => c.accountId)
  if (!contas.length) return { email: 'ja_enviado', push: 'ja_enviado' }
  const { data: linhas } = await db.from('mtm_trading_accounts').select('id, metricas').in('id', contas.map((c) => c.accountId))
  const metricasDe = new Map((linhas ?? []).map((l) => [String(l.id), (l.metricas ?? {}) as Record<string, unknown>]))
  const porAvisar = contas.filter((c) => !metricasDe.get(c.accountId)?.notificado_em)
  if (!porAvisar.length) return { email: 'ja_enviado', push: 'ja_enviado' }

  const email: EstadoAviso['email'] = r.email
    ? ((await enviarEmailContasEstrategia({ para: r.email, nome: r.primeiroNome, saldo, contas: porAvisar })).success ? 'enviado' : 'falhou')
    : 'sem_email'

  // Push + sino pela rota central (a mesma que o resto do site usa), só para este utilizador.
  let push: EstadoAviso['push'] = 'falhou'
  try {
    const { getSiteOrigin } = await import('@/lib/site-url')
    const n = porAvisar.length
    const resp = await fetch(`${getSiteOrigin()}/api/notifications/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: r.userId,
        title: 'Contas de acompanhamento atribuídas',
        body: `${n} ${n === 1 ? 'conta' : 'contas'} MTM Funded a seguir as estratégias MTM Auto em tempo real. Abre o Web trader.`,
        url: '/app-mobile?tab=funded',
        data: { type: 'mtmfunded_contas_estrategia', url: '/app-mobile?tab=funded' },
        tag: 'mtmfunded-contas-estrategia',
      }),
      signal: AbortSignal.timeout(20_000),
    })
    push = resp.ok ? 'enviado' : 'falhou'
  } catch {
    push = 'falhou'
  }

  if (email === 'enviado' || push === 'enviado') {
    const agora = new Date().toISOString()
    for (const c of porAvisar) {
      await db.from('mtm_trading_accounts')
        .update({ metricas: { ...(metricasDe.get(c.accountId) ?? {}), notificado_em: agora, notificado_email: email, notificado_push: push } })
        .eq('id', c.accountId)
    }
  }
  return { email, push }
}
