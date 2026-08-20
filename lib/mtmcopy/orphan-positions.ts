import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { readOpenPositions } from './metaapi'
import { isMtmcopierPosition } from './premium-single'

/**
 * DETETOR DE POSIÇÕES ÓRFÃS — posições abertas na corretora que o motor não conhece.
 *
 * Uma posição fica órfã quando o registo que a acompanhava desaparece (fechado por engano,
 * apagado, ou nunca criado). A ordem continua no mercado sem parciais, sem break-even e sem
 * trailing, e ninguém dá por isso: não há erro, não há alerta, o cliente pensa que está gerido.
 *
 * Só se conta como órfã uma posição com COMENTÁRIO NOSSO (as manuais do cliente não nos dizem
 * respeito) e só quando a leitura da conta foi bem sucedida — se não conseguimos ler, não se
 * conclui nada, pela mesma razão que os monitores deixaram de o fazer.
 */

export interface Orfa {
  accountId: string
  accountLabel: string
  email: string | null
  symbol: string
  volume: number | null
  positionId: string
  comment: string | null
  abertaEm: string | null
}

export interface OrphanScan {
  contas: number
  ilegiveis: number
  geridas: number
  orfas: Orfa[]
}

export async function scanOrphanPositions(): Promise<OrphanScan> {
  const admin = getSupabaseAdmin()
  const out: OrphanScan = { contas: 0, ilegiveis: 0, geridas: 0, orfas: [] }

  const { data: conns } = await admin
    .from('mtmcopy_connections')
    .select('id, account_label, metaapi_account_id, user_id')
    .eq('is_active', true)
    .not('metaapi_account_id', 'is', null)
  if (!conns?.length) return out

  const userIds = [...new Set(conns.map((c) => c.user_id as string))]
  const { data: perfis } = await admin.from('profiles').select('id, email').in('id', userIds)
  const emailPorUser = new Map((perfis ?? []).map((p) => [p.id as string, p.email as string | null]))

  // Registos que o motor considera VIVOS, por conta+símbolo.
  const [{ data: logs }, { data: premium }] = await Promise.all([
    admin
      .from('mtmcopy_signal_log')
      .select('connection_id, symbol')
      .in('status', ['open', 'ok', 'active', 'filled'])
      .gte('created_at', new Date(Date.now() - 30 * 86_400_000).toISOString()),
    admin.from('mtmcopy_premium_active').select('account_id, symbol').eq('status', 'open'),
  ])

  const vivosPorConn = new Set(
    (logs ?? []).map((l) => `${(l as { connection_id: string }).connection_id}|${String((l as { symbol?: string }).symbol ?? '').toUpperCase()}`),
  )
  const vivosPorConta = new Set(
    (premium ?? []).map((r) => `${(r as { account_id: string }).account_id}|${String((r as { symbol?: string }).symbol ?? '').toUpperCase()}`),
  )

  for (const c of conns) {
    const accountId = c.metaapi_account_id as string
    const posicoes = await readOpenPositions(accountId)
    if (posicoes == null) { out.ilegiveis++; continue }
    out.contas++

    for (const p of posicoes) {
      // Posições manuais do cliente não são da nossa conta.
      if (!isMtmcopierPosition(p)) continue
      const sym = (p.symbol ?? '').toUpperCase().replace(/\.[A-Z]+$/, '')
      const conhecida =
        vivosPorConn.has(`${c.id}|${sym}`) ||
        vivosPorConta.has(`${accountId}|${sym}`) ||
        [...vivosPorConn].some((k) => k.startsWith(`${c.id}|`) && k.endsWith(sym)) ||
        [...vivosPorConta].some((k) => k.startsWith(`${accountId}|`) && k.endsWith(sym))
      if (conhecida) { out.geridas++; continue }

      out.orfas.push({
        accountId,
        accountLabel: (c.account_label as string) ?? accountId.slice(0, 8),
        email: emailPorUser.get(c.user_id as string) ?? null,
        symbol: p.symbol ?? sym,
        volume: p.volume ?? null,
        positionId: p.id,
        comment: p.comment ?? null,
        abertaEm: p.time ?? null,
      })
    }
  }

  return out
}

/** Texto do aviso ao admin. Null quando não há nada a dizer. */
export function orphanAlertText(scan: OrphanScan): string | null {
  if (!scan.orfas.length) return null
  const linhas = scan.orfas
    .slice(0, 15)
    .map((o) => `• ${o.accountLabel} — ${o.symbol} ${o.volume ?? '?'} lotes${o.email ? ` (${o.email})` : ''}`)
  const extra = scan.orfas.length > 15 ? `\n… e mais ${scan.orfas.length - 15}` : ''
  return [
    `⚠️ ${scan.orfas.length} posição(ões) SEM GESTÃO`,
    '',
    'Estão abertas na corretora com comentário nosso, mas o motor não tem registo delas:',
    'não levam parciais, nem break-even, nem trailing.',
    '',
    ...linhas,
    extra,
    '',
    `Verificado em ${scan.contas} conta(s)${scan.ilegiveis ? ` · ${scan.ilegiveis} ilegível(eis)` : ''}.`,
  ].filter(Boolean).join('\n')
}
