import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { getSupabaseAdmin, requireAdmin } from '@/lib/admin-api-helpers'
import { mailFrom, prepareBrandedEmailHtml, brandedMailAttachments } from '@/lib/mail-transport'
import { riskAuditEmail } from '@/lib/broadcast-emails'
import { computeRiskAudit, type RiskAuditInput } from '@/lib/mtmcopy/risk-audit'
import { mtmStrategyPublicLabel } from '@/lib/mtmcopy/provider-constants'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PROVISIONING_BASE =
  process.env.METAAPI_PROVISIONING_URL ??
  'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai'

const supabase = getSupabaseAdmin()

async function metaGet(url: string): Promise<{ ok: boolean; status: number; data: any }> {
  const token = process.env.METAAPI_TOKEN
  if (!token) return { ok: false, status: 0, data: null }
  try {
    const res = await fetch(url, { headers: { 'auth-token': token, Accept: 'application/json' } })
    const data = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

/** Recolhe os dados de risco da conta MetaAPI (região → account-information + posições). */
async function gatherAccountData(accountId: string) {
  // Conta inexistente na MetaApi (registo de 15/09): não se pergunta nada — cada 404 conta para o
  // estrangulamento do token inteiro.
  const { contaInexistente, marcarContaInexistente } = await import('@/lib/mtmcopy/metaapi-inexistentes')
  if (await contaInexistente(accountId)) return null
  const prov = await metaGet(`${PROVISIONING_BASE}/users/current/accounts/${accountId}`)
  if (prov.status === 404) {
    await marcarContaInexistente(accountId, Object.assign(new Error('HTTP 404'), { status: 404 }), { nivelConta: true, origem: 'risk-audit' })
    return null
  }
  const region = prov.data?.region ?? 'new-york'
  const clientBase = `https://mt-client-api-v1.${region}.agiliumtrade.ai`

  const [info, positions] = await Promise.all([
    metaGet(`${clientBase}/users/current/accounts/${accountId}/account-information`),
    metaGet(`${clientBase}/users/current/accounts/${accountId}/positions`),
  ])

  const posArr: any[] = Array.isArray(positions.data) ? positions.data : []
  const totalVolume = posArr.reduce((s, p) => s + (Number(p?.volume) || 0), 0)
  const symbols = [...new Set(posArr.map((p) => String(p?.symbol ?? '')).filter(Boolean))]

  return {
    provState: prov.data?.state ?? null,
    connectionStatus: prov.data?.connectionStatus ?? null,
    server: prov.data?.server ?? null,
    login: prov.data?.login != null ? String(prov.data.login) : null,
    broker: info.data?.broker ?? null,
    currency: info.data?.currency ?? null,
    leverage: info.data?.leverage != null ? Number(info.data.leverage) : null,
    balance: info.data?.balance != null ? Number(info.data.balance) : null,
    equity: info.data?.equity != null ? Number(info.data.equity) : null,
    credit: info.data?.credit != null ? Number(info.data.credit) : null,
    freeMargin: info.data?.freeMargin != null ? Number(info.data.freeMargin) : null,
    marginLevel: info.data?.marginLevel != null ? Number(info.data.marginLevel) : null,
    openPositions: { count: posArr.length, total_volume: totalVolume, symbols },
  }
}

/**
 * POST /api/admin/mtmcopy/risk-audit
 * Body: { connection_id: string, send_email?: boolean }
 * Gera a auditoria de risco de uma conta. Com send_email envia ao cliente (branded).
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request)
  if (denied) return denied

  const body = await request.json().catch(() => ({}))
  const connectionId = String(body.connection_id ?? '').trim()
  const sendEmail = body.send_email === true
  if (!connectionId) {
    return NextResponse.json({ error: 'connection_id obrigatório' }, { status: 400 })
  }

  const { data: conn, error } = await supabase
    .from('mtmcopy_connections')
    .select(
      'id, user_id, metaapi_account_id, mt5_server, mt5_login, lot_mode, lot_value, max_risk_percent, copy_sl, copy_tp, copyfactory_subscribed, copyfactory_strategy_pick, copy_method, account_label, baseline_balance',
    )
    .eq('id', connectionId)
    .maybeSingle()
  if (error || !conn) {
    return NextResponse.json({ error: 'Conexão não encontrada' }, { status: 404 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, username, email')
    .eq('id', conn.user_id)
    .maybeSingle()

  const profileName = profile?.full_name || profile?.username || 'Cliente MTM'
  const profileEmail = profile?.email ?? null

  const acc = conn.metaapi_account_id ? await gatherAccountData(conn.metaapi_account_id) : null

  const input: RiskAuditInput = {
    profileName,
    profileEmail,
    sizing: {
      lot_mode: conn.lot_mode ?? null,
      lot_value: conn.lot_value != null ? Number(conn.lot_value) : null,
      max_risk_percent: conn.max_risk_percent != null ? Number(conn.max_risk_percent) : null,
    },
    copy: {
      strategy_label: conn.copyfactory_strategy_pick
        ? mtmStrategyPublicLabel(conn.copyfactory_strategy_pick)
        : null,
      subscribed: !!conn.copyfactory_subscribed,
      method: conn.copy_method ?? null,
      copy_sl: conn.copy_sl !== false,
      copy_tp: conn.copy_tp !== false,
    },
    account: {
      broker: acc?.broker ?? null,
      server: acc?.server ?? conn.mt5_server ?? null,
      login: acc?.login ?? (conn.mt5_login != null ? String(conn.mt5_login) : null),
      currency: acc?.currency ?? null,
      leverage: acc?.leverage ?? null,
      state: acc?.provState ?? null,
      connection_status: acc?.connectionStatus ?? null,
    },
    balance: acc?.balance ?? null,
    equity: acc?.equity ?? null,
    credit: acc?.credit ?? null,
    free_margin: acc?.freeMargin ?? null,
    margin_level: acc?.marginLevel ?? null,
    baseline_balance: conn.baseline_balance != null ? Number(conn.baseline_balance) : null,
    open_positions: acc?.openPositions ?? { count: 0, total_volume: 0, symbols: [] },
  }

  const audit = computeRiskAudit(input, new Date().toISOString())

  let emailResult: { sent: boolean; to?: string; error?: string } | undefined
  if (sendEmail) {
    if (!profileEmail || !/@/.test(profileEmail)) {
      emailResult = { sent: false, error: 'Cliente sem email válido' }
    } else if (!process.env.GMAIL_APP_PASSWORD) {
      emailResult = { sent: false, error: 'GMAIL_APP_PASSWORD não configurada' }
    } else {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER || 'morethanmoneypt@gmail.com',
          pass: process.env.GMAIL_APP_PASSWORD || '',
        },
      })
      try {
        const mail = riskAuditEmail(profileName, audit)
        await transporter.sendMail({
          from: mailFrom(),
          to: profileEmail,
          subject: mail.subject,
          html: prepareBrandedEmailHtml(mail.html),
          text: mail.text,
          attachments: brandedMailAttachments(),
        })
        emailResult = { sent: true, to: profileEmail }
      } catch (e: any) {
        emailResult = { sent: false, error: e?.message || 'Falha no envio' }
      } finally {
        transporter.close()
      }
    }
  }

  return NextResponse.json({ success: true, audit, email: emailResult })
}
