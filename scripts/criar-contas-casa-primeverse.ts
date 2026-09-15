/**
 * CONTAS DA CASA DAS ESTRATÉGIAS MTM Auto Edge / King / Wolf (092) — a conta-mestre de cada uma.
 *
 * Uma conta MTM Funded simulada de 10 000 USD por estratégia (tipo provider, conta_casa, sem regras),
 * ligada em mtmauto_providers.funded_account_id. Dono = utilizador da casa (por defeito o mesmo das
 * contas provider MT5: ricardogarciapt@proton.me; --dono=<email> muda).
 *
 *   npx tsx scripts/criar-contas-casa-primeverse.ts                  → plano (não escreve)
 *   npx tsx scripts/criar-contas-casa-primeverse.ts --escrever       → cria e liga (MTMFUNDED_CRED_KEY local)
 *   npx tsx scripts/criar-contas-casa-primeverse.ts --rotas          → plano das rotas de cópia em SOMBRA
 *                                                                      para os subscritores com conta real
 *   npx tsx scripts/criar-contas-casa-primeverse.ts --rotas --escrever [--ativar]
 *                                                                    → grava as rotas (precisa da 083)
 *
 * Nunca imprime passwords. Não liga as estratégias: isso é `ativo = true` no admin (ou SQL).
 */
import { join } from 'node:path'

const RAIZ = join(__dirname, '..')
try { process.loadEnvFile(join(RAIZ, '.env.local')) } catch { /* usa o ambiente */ }

const args = process.argv.slice(2)
const escrever = args.includes('--escrever')
const rotas = args.includes('--rotas')
const ativar = args.includes('--ativar')
const DONO = (args.find((a) => a.startsWith('--dono=')) ?? '--dono=ricardogarciapt@proton.me').slice('--dono='.length).toLowerCase()

async function main() {
  const { getSupabaseAdmin } = await import('../lib/supabase-admin-client')
  const { planoContasCasa, criarContaPlaneada } = await import('../lib/mtmfunded/estrategias-sinais/contas')
  const { ESTRATEGIAS_PRIMEVERSE } = await import('../lib/mtmfunded/estrategias-sinais/calculo')
  const { planearRotasSombra } = await import('../lib/mtmfunded/estrategias-sinais/rotas')
  const db = getSupabaseAdmin()

  const { data: provs, error } = await db.from('mtmauto_providers').select('id, slug, nome, ativo, funded_account_id')
    .in('slug', ESTRATEGIAS_PRIMEVERSE.map((e) => e.slug))
  if (error) { console.error(`leitura falhou (092 por aplicar?): ${error.message}`); process.exit(2) }
  if ((provs ?? []).length < ESTRATEGIAS_PRIMEVERSE.length) console.log('⚠ nem todas as estratégias existem — aplicar a 092 primeiro')
  const ligadas = Object.fromEntries((provs ?? []).map((p) => [String(p.slug), (p.funded_account_id as string) ?? null]))
  for (const p of provs ?? []) console.log(`${String(p.slug).padEnd(15)} ${p.ativo ? 'LIGADA   ' : 'desligada'} mestre ${p.funded_account_id ? String(p.funded_account_id).slice(0, 8) + '…' : '— (por criar)'}`)

  if (!rotas) {
    const plano = planoContasCasa(ligadas).filter((c) => (provs ?? []).some((p) => p.slug === c.slug))
    for (const c of plano) console.log(`  CRIAR ${c.rotulo} · ${c.saldo} USD · provider ${c.slug} · conta da casa · sem regras`)
    if (!escrever) { console.log('\nsó leitura. --escrever para criar.'); return }
    if (!(process.env.MTMFUNDED_CRED_KEY && process.env.MTMFUNDED_CRED_KEY.length >= 32)) { console.error('falta a MTMFUNDED_CRED_KEY local'); process.exit(2) }
    const { data: dono } = await db.from('profiles').select('id').ilike('email', DONO).maybeSingle()
    if (!dono) { console.error(`dono ${DONO} não encontrado`); process.exit(2) }
    for (const c of plano) {
      const r = await criarContaPlaneada(String(dono.id), c, 'script:criar-contas-casa-primeverse')
      console.log(`  ${r.erro ? 'ERRO' : 'ok  '} ${c.rotulo} login ${r.login ?? '—'}${r.erro ? ` · ${r.erro}` : ''}`)
    }
    return
  }

  // ── rotas em sombra para subscritores com conta real ──
  for (const p of provs ?? []) {
    if (!p.funded_account_id) { console.log(`${p.slug}: sem mestre — criar primeiro`); continue }
    const { data: subs } = await db.from('mtmauto_subscriptions').select('user_id, conta_id').eq('provider_id', p.id).eq('ativo', true).not('conta_id', 'is', null)
    const ids = (subs ?? []).map((s) => String(s.conta_id))
    const { data: contas } = ids.length
      ? await db.from('mtmauto_accounts').select('id, user_id, plataforma, login, servidor, tl_env, tl_account_id').in('id', ids)
      : { data: [] as Record<string, unknown>[] }
    const plano = planearRotasSombra({
      providerId: String(p.id), slug: String(p.slug), nome: String(p.nome), contaMestreId: String(p.funded_account_id), ativar,
      subscritores: (contas ?? []).map((c) => ({ userId: String(c.user_id), mtmautoAccountId: String(c.id), plataforma: String(c.plataforma ?? 'mt5'), login: c.login as string, servidor: c.servidor as string, tlEnv: c.tl_env as string, tlAccountId: c.tl_account_id as string })),
    })
    console.log(`\n${p.slug}: ${plano.rotas.length} rota(s) em sombra${ativar ? ' (activas)' : ''}, ${plano.ignorados.length} ignorada(s)`)
    for (const i of plano.ignorados) console.log(`  ignorada ${i.mtmautoAccountId.slice(0, 8)}… ${i.motivo}`)
    if (!escrever || !plano.rotas.length) continue
    const { data: ja } = await db.from('copia_rotas').select('destino_chave').eq('origem_chave', `mtmfunded:${String(p.funded_account_id).toLowerCase()}`).neq('estado', 'recusada')
    const existentes = new Set((ja ?? []).map((x) => String(x.destino_chave)))
    for (const r of plano.rotas.filter((x) => !existentes.has(x.destino_chave))) {
      const { error: e } = await db.from('copia_rotas').insert(r)
      console.log(`  ${e ? 'ERRO' : 'ok  '} ${r.destino_ref}${e ? ` · ${e.message}` : ''}`)
    }
  }
  if (!escrever) console.log('\nsó leitura. --escrever para gravar as rotas.')
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
