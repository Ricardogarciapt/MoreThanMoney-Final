/**
 * VIGIA DAS CONTAS PEQUENAS (231, dono 04/11).
 *
 * Contas com `mestres_contas.conta_pequena_ate` copiam no lote mínimo, sem máx. de posições, até
 * a equity chegar ao limiar. Este vigia lê a última equity conhecida e, quando passa o limiar,
 * avisa o admin no Telegram UMA vez (`conta_pequena_lembrete_em`). Não muda o lote sozinho: o
 * risco % que a conta passa a usar é decisão do admin, na ficha da conta (Centro › Contas).
 *
 * Equity: `contas_saldo_lido` pela conta MetaApi da fonte (site/auto); sem leitura, a âncora do
 * dia que o motor grava em `mestres_contas.ancora_dia`.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { contaPequenaPassouLimiar } from '@/lib/copia-contas/ficha-copia-regras'

export interface ContaPequenaVista {
  contaChave: string
  contaRef: string
  ate: number
  equity: number | null
  moeda: string | null
  avisar: boolean
}

const num = (v: unknown) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

async function metaapiDaRef(db: SupabaseClient, ref: string): Promise<string | null> {
  const [tipo, id] = ref.split(':')
  if (!id) return null
  const tabela = tipo === 'site' ? 'mtmcopy_connections' : tipo === 'auto' ? 'mtmauto_accounts' : null
  if (!tabela) return null
  const { data } = await db.from(tabela).select('metaapi_account_id').eq('id', id).maybeSingle()
  const m = (data as { metaapi_account_id?: string | null } | null)?.metaapi_account_id
  return m ? String(m) : null
}

export async function lerContasPequenas(db: SupabaseClient): Promise<ContaPequenaVista[]> {
  const { data, error } = await db.from('mestres_contas')
    .select('conta_chave, conta_ref, conta_pequena_ate, conta_pequena_lembrete_em, ancora_dia')
    .not('conta_pequena_ate', 'is', null)
  if (error) throw new Error(error.message)
  const out: ContaPequenaVista[] = []
  for (const r of (data ?? []) as Array<Record<string, unknown>>) {
    const ref = String(r.conta_ref ?? '')
    let equity: number | null = null
    let moeda: string | null = null
    const mid = await metaapiDaRef(db, ref)
    if (mid) {
      const { data: s } = await db.from('contas_saldo_lido').select('equity, saldo, moeda')
        .eq('chave', mid).order('lido_em', { ascending: false }).limit(1).maybeSingle()
      const x = s as { equity?: unknown; saldo?: unknown; moeda?: unknown } | null
      equity = num(x?.equity) ?? num(x?.saldo)
      moeda = x?.moeda ? String(x.moeda) : null
    }
    if (equity == null) equity = num(r.ancora_dia)
    const ate = Number(r.conta_pequena_ate)
    out.push({
      contaChave: String(r.conta_chave), contaRef: ref, ate, equity, moeda,
      avisar: contaPequenaPassouLimiar({ ate, lembreteEm: r.conta_pequena_lembrete_em ? String(r.conta_pequena_lembrete_em) : null, equity }),
    })
  }
  return out
}

export async function vigiarContasPequenas(
  db: SupabaseClient,
  avisar: (texto: string) => Promise<void>,
  opts: { ensaio?: boolean } = {},
): Promise<{ vistas: number; avisadas: string[] }> {
  const contas = await lerContasPequenas(db)
  const avisadas: string[] = []
  for (const c of contas.filter((x) => x.avisar)) {
    if (opts.ensaio) { avisadas.push(c.contaChave); continue }
    // Marca primeiro: um Telegram em falha não pode virar um aviso por hora.
    const { error } = await db.from('mestres_contas').update({ conta_pequena_lembrete_em: new Date().toISOString() })
      .eq('conta_chave', c.contaChave).is('conta_pequena_lembrete_em', null)
    if (error) continue
    avisadas.push(c.contaChave)
    const link = `https://www.morethanmoney.pt/admin/centro?s=contas (conta ${c.contaChave.replace(/^mt:/, '').split('@')[0]})`
    await avisar(
      `💰 Conta pequena passou o limiar\n${c.contaChave} — equity ${c.equity?.toFixed(2)} ${c.moeda ?? ''} ≥ ${c.ate}.\n` +
      `Continua em lote mínimo 0,01 sem máx. de posições até decidires. Para passar a risco %: ficha da conta → «Passar a risco %» e acerta o risco na fonte.\n${link}`,
    ).catch(() => undefined)
  }
  return { vistas: contas.length, avisadas }
}
