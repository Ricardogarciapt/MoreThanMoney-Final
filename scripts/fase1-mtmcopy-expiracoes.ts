/**
 * FASE 1 (MTM Copy → MTM Auto): ACERTAR AS DATAS DO ADDON MTM COPY COM O STRIPE.
 *
 *   npx tsx scripts/fase1-mtmcopy-expiracoes.ts            → DRY-RUN: só mostra a tabela do que mudaria
 *   npx tsx scripts/fase1-mtmcopy-expiracoes.ts --aplicar  → escreve em profiles
 *
 * Porquê: o acesso legado do MTM Copy passa a exigir um período PAGO e DATADO
 * (mtmcopy_subscription_expires_at > agora). Até aqui o webhook gravava a data a null, e 8 dos
 * 9 perfis marcados como activos não tinham data nenhuma — com a regra nova perderiam o acesso
 * mesmo a pagar, e quem deixou de pagar continuaria com ele para sempre.
 *
 * O que faz, perfil a perfil (todos os que têm mtmcopy_subscription_active = true, mais os
 * clientes com uma subscrição Stripe do addon):
 *   • subscrição do addon no Stripe com estado active/trialing → active = true,
 *     expires_at = current_period_end dessa subscrição;
 *   • sem subscrição do addon paga e activa (cancelada, past_due, inexistente) → active = false
 *     (a data fica como está — é histórico).
 *
 * O Stripe é só LIDO. O addon reconhece-se pelo price id (STRIPE_PRICE_MTMCOPY_ADDON_MONTHLY) ou
 * pela metadata plan = 'mtmcopy_addon_monthly'. Nada é apagado.
 *
 * Ordem: aplicar ANTES do deploy da fase 1 (senão os subscritores pagos perdem o acesso até ao
 * próximo evento do Stripe).
 */
import { join } from 'node:path'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { fimDoPeriodo, subscricaoEhAddon } from '../lib/mtmcopy/addon-stripe'

const RAIZ = join(__dirname, '..')
try {
  process.loadEnvFile(join(RAIZ, '.env.local'))
} catch {
  /* sem .env.local, usa o ambiente */
}

const APLICAR = process.argv.includes('--aplicar')
const ESTADOS_PAGOS = new Set(['active', 'trialing'])

const limpar = (v?: string) => (v ?? '').replace(/\\n$/, '').trim()

async function main() {
  const chave = limpar(process.env.STRIPE_SECRET_KEY)
  const url = limpar(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const service = limpar(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!chave || !url || !service) throw new Error('Faltam STRIPE_SECRET_KEY / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  if (!limpar(process.env.STRIPE_PRICE_MTMCOPY_ADDON_MONTHLY)) {
    console.warn('⚠️  STRIPE_PRICE_MTMCOPY_ADDON_MONTHLY vazio — só a metadata identifica o addon.')
  }

  const stripe = new Stripe(chave)
  const db = createClient(url, service, { auth: { persistSession: false } })

  // 1. Subscrições do addon no Stripe, por cliente. Fica a MELHOR de cada cliente (paga e com o
  //    fim mais tarde) — um cliente pode ter uma antiga cancelada e uma nova activa.
  //    Indexa-se também pelo EMAIL do cliente Stripe: há perfis cujo stripe_customer_id aponta
  //    para outro cliente (o do plano principal) e o addon foi pago com um cliente diferente.
  type SubAddon = { sub: string; estado: string; fim: string | null; pago: boolean }
  const porCliente = new Map<string, SubAddon>()
  const porEmail = new Map<string, SubAddon>()
  const guardar = (mapa: Map<string, SubAddon>, chave: string, atual: SubAddon) => {
    const antes = mapa.get(chave)
    const melhor =
      !antes ||
      (atual.pago && !antes.pago) ||
      (atual.pago === antes.pago && (atual.fim ?? '') > (antes.fim ?? ''))
    if (melhor) mapa.set(chave, atual)
  }
  for await (const sub of stripe.subscriptions.list({ status: 'all', limit: 100, expand: ['data.customer'] })) {
    if (!subscricaoEhAddon(sub as unknown as Parameters<typeof subscricaoEhAddon>[0])) continue
    const cliente = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
    const emailCliente =
      typeof sub.customer === 'object' && sub.customer && !('deleted' in sub.customer && sub.customer.deleted)
        ? String((sub.customer as Stripe.Customer).email ?? '').toLowerCase()
        : ''
    const atual = {
      sub: sub.id,
      estado: sub.status,
      fim: fimDoPeriodo(sub as unknown as Parameters<typeof fimDoPeriodo>[0]),
      pago: ESTADOS_PAGOS.has(sub.status),
    }
    guardar(porCliente, cliente, atual)
    if (emailCliente) guardar(porEmail, emailCliente, atual)
  }

  // 2. Perfis envolvidos: os marcados activos + os clientes Stripe com addon.
  const clientes = [...porCliente.keys()]
  const emails = [...porEmail.keys()]
  const [{ data: marcados, error: e1 }, { data: comAddon, error: e2 }, { data: porMail, error: e3 }] = await Promise.all([
    db
      .from('profiles')
      .select('id, email, user_type, subscription_plan, stripe_customer_id, mtmcopy_subscription_active, mtmcopy_subscription_expires_at')
      .eq('mtmcopy_subscription_active', true),
    clientes.length
      ? db
          .from('profiles')
          .select('id, email, user_type, subscription_plan, stripe_customer_id, mtmcopy_subscription_active, mtmcopy_subscription_expires_at')
          .in('stripe_customer_id', clientes)
      : Promise.resolve({ data: [], error: null }),
    emails.length
      ? db
          .from('profiles')
          .select('id, email, user_type, subscription_plan, stripe_customer_id, mtmcopy_subscription_active, mtmcopy_subscription_expires_at')
          .in('email', emails)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (e1 || e2 || e3) throw e1 || e2 || e3
  const perfis = new Map<string, Record<string, unknown>>()
  for (const p of [...(marcados ?? []), ...(comAddon ?? []), ...(porMail ?? [])]) perfis.set(String(p.id), p)

  // 3. Plano de mudanças.
  type Linha = {
    id: string
    email: string
    tipo: string
    plano: string
    stripe: string
    ativoAntes: boolean
    expiraAntes: string | null
    ativoDepois: boolean
    expiraDepois: string | null
    muda: boolean
  }
  const linhas: Linha[] = []
  for (const p of perfis.values()) {
    const pelaConta = p.stripe_customer_id ? porCliente.get(String(p.stripe_customer_id)) : undefined
    const peloEmail = p.email ? porEmail.get(String(p.email).toLowerCase()) : undefined
    // A que estiver paga ganha; entre iguais, a do cliente Stripe do perfil.
    const s = pelaConta?.pago ? pelaConta : peloEmail?.pago ? peloEmail : pelaConta ?? peloEmail
    const ativoAntes = Boolean(p.mtmcopy_subscription_active)
    const expiraAntes = (p.mtmcopy_subscription_expires_at as string | null) ?? null
    const pagoAtivo = Boolean(s?.pago && s.fim)
    const ativoDepois = pagoAtivo
    const expiraDepois = pagoAtivo ? s!.fim : expiraAntes
    const igual = (a: string | null, b: string | null) => (a ? Date.parse(a) : 0) === (b ? Date.parse(b) : 0)
    linhas.push({
      id: String(p.id),
      email: String(p.email ?? ''),
      tipo: String(p.user_type ?? ''),
      plano: String(p.subscription_plan ?? ''),
      stripe: s ? `${s.estado} até ${s.fim?.slice(0, 10) ?? '?'}` : 'sem addon',
      ativoAntes,
      expiraAntes,
      ativoDepois,
      expiraDepois,
      muda: ativoAntes !== ativoDepois || !igual(expiraAntes, expiraDepois),
    })
  }
  linhas.sort((a, b) => Number(b.ativoDepois) - Number(a.ativoDepois) || a.email.localeCompare(b.email))

  console.log(APLICAR ? '\n== APLICAR ==' : '\n== DRY-RUN (nada é escrito; --aplicar para escrever) ==')
  console.table(
    linhas.map((l) => ({
      id: l.id.slice(0, 8),
      email: l.email,
      tipo: l.tipo,
      plano: l.plano,
      stripe: l.stripe,
      antes: `${l.ativoAntes ? 'ON ' : 'off'} ${l.expiraAntes?.slice(0, 10) ?? 'null'}`,
      depois: `${l.ativoDepois ? 'ON ' : 'off'} ${l.expiraDepois?.slice(0, 10) ?? 'null'}`,
      muda: l.muda ? 'SIM' : '',
    })),
  )
  const aMudar = linhas.filter((l) => l.muda)
  console.log(`${aMudar.length} perfis a mudar · ${linhas.filter((l) => l.ativoDepois).length} ficam com addon pago e datado`)

  if (!APLICAR) return
  for (const l of aMudar) {
    const patch: Record<string, unknown> = {
      mtmcopy_subscription_active: l.ativoDepois,
      updated_at: new Date().toISOString(),
    }
    if (l.ativoDepois) patch.mtmcopy_subscription_expires_at = l.expiraDepois
    const { error } = await db.from('profiles').update(patch).eq('id', l.id)
    console.log(error ? `✗ ${l.email}: ${error.message}` : `✓ ${l.email}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
