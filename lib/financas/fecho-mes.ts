/**
 * FECHO DO MÊS — Stripe + despesas da MTM, num dossier que o contabilista abre sem perguntas.
 *
 * O que entra: os pagamentos que o Stripe recebeu no mês (com o país do cliente, para o IVA), os
 * movimentos do saldo (taxas, reembolsos, transferências para o banco) e as despesas com
 * `entidade = 'mtm'`. O que NUNCA entra: o IB da PU Prime — é rendimento pessoal do Ricardo
 * (regra de 16/11/2026) — e as despesas pessoais ou «por decidir».
 *
 * Isto só PREPARA. Não emite faturas, não comunica à AT, não paga nada.
 *
 * A parte pura (somar, fazer CSV, escrever o resumo) está separada da leitura do Stripe/Supabase
 * para poder ser guardada por `fecho-mes.check.ts`.
 */
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

export type Venda = {
  data: string
  id: string
  valor: number // em unidades da moeda (não cêntimos)
  reembolsado: number
  moeda: string
  pais: string | null
  cliente: string | null
  descricao: string | null
  fatura: string | null
}

export type Movimento = {
  data: string
  id: string
  tipo: string
  valor: number
  taxa: number
  liquido: number
  moeda: string
  descricao: string | null
}

export type Despesa = {
  data: string
  fornecedor: string
  descricao: string | null
  valor: number
  iva: number | null
  moeda: string
  categoria: string | null
  numero_fatura: string | null
  nif_fornecedor: string | null
}

export type Resumo = {
  mes: string
  vendas: { n: number; porMoeda: Record<string, number>; reembolsado: Record<string, number>; porPais: Record<string, number> }
  stripe: { taxas: Record<string, number>; liquido: Record<string, number>; transferencias: Record<string, number> }
  despesas: { n: number; porMoeda: Record<string, number>; iva: Record<string, number>; porCategoria: Record<string, number> }
  avisos: string[]
}

const soma = (o: Record<string, number>, k: string, v: number) => {
  o[k] = Math.round(((o[k] ?? 0) + v) * 100) / 100
}

/** 'YYYY-MM' → [início, fim) em segundos unix (UTC). */
export function janelaDoMes(mes: string): { de: number; ate: number } {
  const [a, m] = mes.split('-').map(Number)
  return { de: Date.UTC(a, m - 1, 1) / 1000, ate: Date.UTC(a, m, 1) / 1000 }
}

/** O mês anterior a uma data, como 'YYYY-MM'. */
export function mesAnterior(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`
}

export function resumir(mes: string, vendas: Venda[], movimentos: Movimento[], despesas: Despesa[]): Resumo {
  const r: Resumo = {
    mes,
    vendas: { n: vendas.length, porMoeda: {}, reembolsado: {}, porPais: {} },
    stripe: { taxas: {}, liquido: {}, transferencias: {} },
    despesas: { n: despesas.length, porMoeda: {}, iva: {}, porCategoria: {} },
    avisos: [],
  }
  for (const v of vendas) {
    soma(r.vendas.porMoeda, v.moeda, v.valor)
    if (v.reembolsado) soma(r.vendas.reembolsado, v.moeda, v.reembolsado)
    soma(r.vendas.porPais, v.pais ?? '??', 1)
  }
  for (const m of movimentos) {
    if (m.tipo === 'payout') soma(r.stripe.transferencias, m.moeda, -m.valor)
    else {
      soma(r.stripe.taxas, m.moeda, m.taxa)
      soma(r.stripe.liquido, m.moeda, m.liquido)
    }
  }
  for (const d of despesas) {
    soma(r.despesas.porMoeda, d.moeda, d.valor)
    if (d.iva != null) soma(r.despesas.iva, d.moeda, d.iva)
    soma(r.despesas.porCategoria, d.categoria ?? 'sem categoria', d.valor)
  }

  const semPais = vendas.filter((v) => !v.pais).length
  if (semPais) r.avisos.push(`${semPais} venda(s) sem país do cliente — o contabilista precisa dele para o IVA.`)
  const ue = vendas.filter((v) => v.pais && v.pais !== 'PT' && PAISES_UE.has(v.pais)).length
  if (ue) r.avisos.push(`${ue} venda(s) a consumidores de outros países da UE — confirmar com o contabilista o IVA (limite de 10.000 €/ano para o OSS).`)
  const semFatura = despesas.filter((d) => !d.numero_fatura).length
  if (semFatura) r.avisos.push(`${semFatura} despesa(s) sem número de fatura — pedir a fatura ao fornecedor.`)
  const semIva = despesas.filter((d) => d.iva == null).length
  if (semIva) r.avisos.push(`${semIva} despesa(s) sem IVA indicado (fornecedores de fora da UE costumam vir sem IVA — autoliquidação a confirmar).`)
  return r
}

const PAISES_UE = new Set(['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'])

/** CSV com `;` e vírgula decimal — abre bem no Excel português. */
export function csv(linhas: Record<string, unknown>[]): string {
  if (!linhas.length) return ''
  const cols = Object.keys(linhas[0])
  const cel = (v: unknown) => {
    if (v == null) return ''
    const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(';'), ...linhas.map((l) => cols.map((c) => cel(l[c])).join(';'))].join('\n') + '\n'
}

const fmt = (o: Record<string, number>) =>
  Object.entries(o).map(([k, v]) => `${v.toFixed(2).replace('.', ',')} ${k}`).join(' · ') || '0'

export function resumoEmTexto(r: Resumo): string {
  const linhas = [
    `# Fecho MTM ${r.mes}`,
    '',
    '_Preparado automaticamente. Não inclui o IB da PU Prime (rendimento pessoal do Ricardo). Nada foi submetido à AT._',
    '',
    `## Vendas (Stripe)`,
    `- ${r.vendas.n} pagamentos: ${fmt(r.vendas.porMoeda)}`,
    `- Reembolsado: ${fmt(r.vendas.reembolsado)}`,
    `- Por país do cliente: ${Object.entries(r.vendas.porPais).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}`,
    `- Taxas Stripe: ${fmt(r.stripe.taxas)}`,
    `- Líquido no saldo: ${fmt(r.stripe.liquido)}`,
    `- Transferido para o banco: ${fmt(r.stripe.transferencias)}`,
    '',
    `## Despesas MTM`,
    `- ${r.despesas.n} faturas: ${fmt(r.despesas.porMoeda)} (IVA ${fmt(r.despesas.iva)})`,
    ...Object.entries(r.despesas.porCategoria).map(([k, v]) => `- ${k}: ${v.toFixed(2).replace('.', ',')}`),
  ]
  if (r.avisos.length) linhas.push('', '## A rever', ...r.avisos.map((a) => `- ${a}`))
  linhas.push('', '## Ficheiros', '- vendas-stripe.csv · movimentos-stripe.csv · despesas.csv')
  return linhas.join('\n') + '\n'
}

// ─────────────────────────────── leitura (Stripe + Supabase) ───────────────────────────────

const dia = (s: number) => new Date(s * 1000).toISOString().slice(0, 10)

export async function lerVendas(stripe: Stripe, mes: string): Promise<Venda[]> {
  const { de, ate } = janelaDoMes(mes)
  const out: Venda[] = []
  for await (const c of stripe.charges.list({ created: { gte: de, lt: ate }, limit: 100 })) {
    if (c.status !== 'succeeded' || !c.paid) continue
    const pais = c.billing_details?.address?.country ?? c.payment_method_details?.card?.country ?? null
    const fatura = (c as unknown as { invoice?: string | { id: string } | null }).invoice
    out.push({
      data: dia(c.created),
      id: c.id,
      valor: c.amount / 100,
      reembolsado: (c.amount_refunded ?? 0) / 100,
      moeda: c.currency.toUpperCase(),
      pais,
      cliente: c.billing_details?.email ?? c.receipt_email ?? null,
      descricao: c.description ?? null,
      fatura: typeof fatura === 'string' ? fatura : fatura?.id ?? null,
    })
  }
  return out
}

export async function lerMovimentos(stripe: Stripe, mes: string): Promise<Movimento[]> {
  const { de, ate } = janelaDoMes(mes)
  const out: Movimento[] = []
  for await (const t of stripe.balanceTransactions.list({ created: { gte: de, lt: ate }, limit: 100 })) {
    out.push({
      data: dia(t.created),
      id: t.id,
      tipo: t.type,
      valor: t.amount / 100,
      taxa: t.fee / 100,
      liquido: t.net / 100,
      moeda: t.currency.toUpperCase(),
      descricao: t.description ?? null,
    })
  }
  return out
}

export async function lerDespesas(db: SupabaseClient, mes: string): Promise<Despesa[]> {
  const [a, m] = mes.split('-').map(Number)
  const fim = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10)
  const { data, error } = await db
    .from('financas_despesas')
    .select('data, fornecedor, descricao, valor, iva, moeda, categoria, numero_fatura, nif_fornecedor')
    .eq('entidade', 'mtm')
    .gte('data', `${mes}-01`)
    .lt('data', fim)
    .order('data')
  if (error) throw new Error(`despesas: ${error.message}`)
  return (data ?? []).map((d) => ({ ...d, valor: Number(d.valor), iva: d.iva == null ? null : Number(d.iva) })) as Despesa[]
}

/** Lê tudo, grava o dossier no bucket privado `financas` e o resumo em `financas_fechos`. */
export async function fecharMes(stripe: Stripe, db: SupabaseClient, mes: string) {
  const [vendas, movimentos, despesas] = await Promise.all([lerVendas(stripe, mes), lerMovimentos(stripe, mes), lerDespesas(db, mes)])
  const resumo = resumir(mes, vendas, movimentos, despesas)
  const ficheiros: [string, string, string][] = [
    ['resumo.md', resumoEmTexto(resumo), 'text/markdown'],
    ['vendas-stripe.csv', csv(vendas), 'text/csv'],
    ['movimentos-stripe.csv', csv(movimentos), 'text/csv'],
    ['despesas.csv', csv(despesas), 'text/csv'],
  ]
  const caminhos: string[] = []
  for (const [nome, corpo, tipo] of ficheiros) {
    const caminho = `fechos/${mes}/${nome}`
    const { error } = await db.storage.from('financas').upload(caminho, new Blob([corpo], { type: `${tipo}; charset=utf-8` }), { upsert: true, contentType: `${tipo}; charset=utf-8` })
    if (error) throw new Error(`upload ${nome}: ${error.message}`)
    caminhos.push(caminho)
  }
  const { error } = await db.from('financas_fechos').upsert({ mes, resumo, ficheiros: caminhos, gerado_em: new Date().toISOString() }, { onConflict: 'mes' })
  if (error) throw new Error(`financas_fechos: ${error.message}`)
  return { resumo, caminhos }
}
