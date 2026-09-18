/**
 * MESTRES NOSSAS — corta a CopyFactory de UMA estratégia antes de a pôr em live no motor (senão a
 * mesma trade entra duas vezes: CopyFactory + motor). Trabalha sobre a LISTA DA COPYFACTORY (em todas
 * as chaves: casa + equipas), não sobre mtmcopy_connections — há subscritores sem linha no site.
 *
 *   npx tsx scripts/mestres/cortar-copyfactory.ts --estrategia Goldkiller              # SECO: plano
 *   npx tsx scripts/mestres/cortar-copyfactory.ts --estrategia Goldkiller --aplicar    # corta + relê
 *   ... --aplicar --mtmauto    # também desliga a execução do mtm-auto (mtmauto_providers.espelhar=false)
 *
 * Com --aplicar: PUT de cada subscritor com o `name` que lá está (sem ele a CopyFactory recusa em
 * silêncio), mantendo as subscrições às OUTRAS estratégias; depois RELÊ todos os subscritores e só grava
 * `mestres_estrategias.copyfactory_cortado_em` se nenhum copiar as estratégias da lista. É esse campo
 * que deixa a base aceitar `modo='live'` — e que faz a re-sincronização do site nunca mais as subscrever.
 *
 * Rollback: ver deploy/vps-stream/copia-contas/README.md («Mestres nossas — corte por estratégia»).
 */
import { join } from 'node:path'

const RAIZ = join(__dirname, '..', '..')
try { process.loadEnvFile(join(RAIZ, '.env.local')) } catch { /* usa o ambiente */ }

const args = process.argv.slice(2)
const APLICAR = args.includes('--aplicar')
const MTMAUTO = args.includes('--mtmauto')
const SLUG = (() => { const i = args.indexOf('--estrategia'); return i >= 0 ? args[i + 1] : null })()
const CF = process.env.METAAPI_COPYFACTORY_URL ?? 'https://copyfactory-api-v1.new-york.agiliumtrade.ai'

type Chave = { nome: string; token: string }

async function cf(token: string, caminho: string, init?: { method?: string; body?: unknown }) {
  const r = await fetch(`${CF}/users/current${caminho}`, {
    method: init?.method ?? 'GET',
    headers: { 'auth-token': token, Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  })
  const texto = await r.text()
  const json = texto ? (() => { try { return JSON.parse(texto) } catch { return { message: texto } } })() : null
  return { ok: r.ok, status: r.status, json }
}

async function listarSubscritores(token: string) {
  const out: Record<string, unknown>[] = []
  for (let offset = 0; offset < 5000; offset += 1000) {
    const r = await cf(token, `/configuration/subscribers?limit=1000&offset=${offset}`)
    if (!r.ok) throw new Error(`listar subscritores: HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`)
    const lista = Array.isArray(r.json) ? r.json : (r.json?.items ?? [])
    out.push(...lista)
    if (lista.length < 1000) break
  }
  return out
}

async function main() {
  if (!SLUG) throw new Error('--estrategia <slug> é obrigatório')
  const { getSupabaseAdmin } = await import('../../lib/supabase-admin-client')
  const { planoDeCorte, corpoDoPut, corteConfirmado } = await import('../../lib/mestres/copyfactory-corte')
  const db = getSupabaseAdmin()

  const { data: est, error } = await db.from('mestres_estrategias').select('*').ilike('slug', SLUG).maybeSingle()
  if (error || !est) throw new Error(`estratégia ${SLUG} não está em mestres_estrategias (${error?.message ?? 'sem linha'})`)
  const ids: string[] = (est.copyfactory_ids ?? []).map(String)
  console.log(`Estratégia ${est.slug} · ids CopyFactory: ${ids.join(', ') || '(nenhum)'}`)

  const chaves: Chave[] = []
  if (process.env.METAAPI_TOKEN) chaves.push({ nome: 'casa', token: process.env.METAAPI_TOKEN })
  const { data: tenants } = await db.from('mtmauto_tenants').select('id, nome, metaapi_token').not('metaapi_token', 'is', null)
  for (const t of tenants ?? []) if (t.metaapi_token && t.metaapi_token !== process.env.METAAPI_TOKEN) chaves.push({ nome: `equipa:${String(t.nome ?? t.id).slice(0, 20)}`, token: String(t.metaapi_token) })

  const verificacao: Record<string, unknown> = { em: new Date().toISOString(), ids, chaves: {} as Record<string, unknown> }
  let tudoCerto = true
  for (const k of chaves) {
    const subs = await listarSubscritores(k.token).catch((e) => { console.log(`  [${k.nome}] ✗ ${e.message}`); tudoCerto = false; return null })
    if (!subs) continue
    const plano = planoDeCorte(subs as never, ids).filter((a): a is Exclude<typeof a, { tipo: 'nada' }> => a.tipo !== 'nada')
    console.log(`\n[${k.nome}] ${subs.length} subscritores · a cortar: ${plano.length}`)
    for (const a of plano) console.log(`  - ${a.conta.slice(0, 8)} «${'nome' in a ? a.nome : ''}» sai de ${'saem' in a ? a.saem.join(',') : ''}${a.tipo === 'manter_outras' ? ` · fica com ${a.ficam.map((x) => x.strategyId).join(',')}` : ' · sem subscrições'}`)
    if (!APLICAR) { (verificacao.chaves as Record<string, unknown>)[k.nome] = { plano: plano.length }; continue }

    for (const a of plano) {
      if (!('nome' in a)) continue
      const r = await cf(k.token, `/configuration/subscribers/${a.conta}`, { method: 'PUT', body: corpoDoPut(a) })
      console.log(r.ok ? `  ✓ PUT ${a.conta.slice(0, 8)}` : `  ✗ PUT ${a.conta.slice(0, 8)}: HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`)
      if (r.ok) {
        const ficou = a.tipo === 'manter_outras'
        await db.from('mtmcopy_connections').update({ copyfactory_subscribed: ficou, updated_at: new Date().toISOString() }).eq('metaapi_account_id', a.conta)
      }
    }
    // A resposta de uma escrita não é prova: RELER tudo.
    const relidos = await listarSubscritores(k.token).catch(() => null)
    const conf = relidos ? corteConfirmado(relidos as never, ids) : { ok: false, ainda: [{ conta: '?', ids: ['releitura falhou'] }] }
    console.log(conf.ok ? `  ✓ releitura: ninguém copia ${ids.join(',')} nesta chave` : `  ✗ ainda a copiar: ${JSON.stringify(conf.ainda)}`)
    ;(verificacao.chaves as Record<string, unknown>)[k.nome] = { cortados: plano.length, confirmado: conf.ok, ainda: conf.ainda }
    if (!conf.ok) tudoCerto = false
  }

  if (!APLICAR) { console.log('\n(SECO — nada escrito. --aplicar para cortar.)'); return }

  if (MTMAUTO) {
    const { error: eUp } = await db.from('mtmauto_providers').update({ espelhar: false }).eq('id', est.provider_id)
    const { data: relido } = await db.from('mtmauto_providers').select('espelhar').eq('id', est.provider_id).maybeSingle()
    const ok = !eUp && relido?.espelhar === false
    console.log(ok ? '✓ mtm-auto deixou de executar esta estratégia (espelhar=false, relido)' : `✗ espelhar: ${eUp?.message ?? 'releitura não confirma'}`)
    if (ok) await db.from('mestres_estrategias').update({ mtmauto_cortado_em: new Date().toISOString() }).eq('provider_id', est.provider_id)
    else tudoCerto = false
  }

  if (tudoCerto) {
    const { error: eFim } = await db.from('mestres_estrategias').update({ copyfactory_cortado_em: new Date().toISOString(), copyfactory_verificacao: verificacao }).eq('provider_id', est.provider_id)
    console.log(eFim ? `✗ gravar corte: ${eFim.message}` : `\n✓ CORTE CONFIRMADO — ${est.slug} pode passar a live (mestres_estrategias.modo)`)
  } else {
    await db.from('mestres_estrategias').update({ copyfactory_verificacao: verificacao }).eq('provider_id', est.provider_id)
    await db.from('mestres_alertas').insert({ tipo: 'corte_copyfactory', estrategia: est.slug, mensagem: `Corte da CopyFactory de ${est.slug} NÃO confirmado: ${JSON.stringify(verificacao).slice(0, 800)}` })
    console.log('\n✗ CORTE NÃO CONFIRMADO — a estratégia continua sem poder ir a live. Ver copyfactory_verificacao.')
    process.exitCode = 2
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
