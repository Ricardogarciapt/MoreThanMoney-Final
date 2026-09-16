/**
 * PREÇOS DA PLATAFORMA MTM FUNDED — cria os preços em falta no Stripe e guarda os ids.
 *
 * O MT5 mantém os preços e os produtos de sempre (`preco_cents` / `stripe_price_id`): este script
 * NUNCA lhes toca. Só cria preços NOVOS para `preco_cents_mtmfunded` (migração 098) e preenche
 * `stripe_price_id_mtmfunded`.
 *
 *   npx tsx scripts/mtmfunded-precos-plataforma.ts              → SIMULAÇÃO (por defeito)
 *   npx tsx scripts/mtmfunded-precos-plataforma.ts --aplicar    → cria os preços no Stripe e grava
 *   … --programa 3k-1f       → só este programa
 *   … --refazer              → cria preço novo mesmo havendo id (o preço mudou; o antigo fica lá)
 *
 * O QUE ESTE SCRIPT NUNCA FAZ, por decisão:
 *  · não apaga nem arquiva preços (um preço do Stripe usado numa compra tem de continuar a existir);
 *  · não mexe em subscrições, nem em produtos de packs/Premium — só em produtos de programas funded;
 *  · não altera `preco_cents` nem `stripe_price_id` (MT5).
 *
 * A chave é a que estiver em STRIPE_SECRET_KEY (.env.local = LIVE). Em simulação não se chama o
 * Stripe para escrever nada: só se lê o produto do preço MT5, para dizer onde o preço novo ficaria.
 */
import { join } from 'node:path'

const RAIZ = join(__dirname, '..')
try { process.loadEnvFile(join(RAIZ, '.env.local')) } catch { /* usa o ambiente */ }

const argv = process.argv.slice(2)
const tem = (f: string) => argv.includes(f)
const valor = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
const APLICAR = tem('--aplicar')
const REFAZER = tem('--refazer')
const SO_PROGRAMA = valor('--programa')

const euros = (c: number) => (c / 100).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })

async function main() {
  const { getSupabaseAdmin } = await import('../lib/supabase-admin-client')
  const { getStripeClient } = await import('../lib/stripe-client')
  const db = getSupabaseAdmin()

  let consulta = db
    .from('mtm_funded_programs')
    .select('slug, nome, saldo, fases, ativo, moeda, preco_cents, preco_cents_mtmfunded, stripe_price_id, stripe_price_id_mtmfunded')
    .order('ordem', { ascending: true })
  if (SO_PROGRAMA) consulta = consulta.eq('slug', SO_PROGRAMA)
  const { data: programas, error } = await consulta
  if (error) {
    const falta = /preco_cents_mtmfunded/.test(error.message)
    throw new Error(
      falta
        ? 'falta a migração 098 (supabase/migrations/098_mtmfunded_precos_plataforma.sql) — aplica-a primeiro'
        : `não foi possível ler os programas: ${error.message}`,
    )
  }
  if (!programas?.length) { console.log('sem programas'); return }

  const stripe = getStripeClient()
  const chave = String(process.env.STRIPE_SECRET_KEY ?? '')
  console.log(`\nStripe: ${chave.startsWith('sk_live') ? 'LIVE' : chave.startsWith('sk_test') ? 'TESTE' : 'desconhecida'} · modo: ${APLICAR ? 'APLICAR' : 'simulação'}\n`)

  let criados = 0
  let saltados = 0

  for (const p of programas) {
    const alvo = p.preco_cents_mtmfunded == null ? null : Number(p.preco_cents_mtmfunded)
    const etiqueta = `${p.slug.padEnd(14)} MT5 ${euros(Number(p.preco_cents)).padStart(9)}  MTM Funded ${alvo == null ? '—' : euros(alvo)}`

    if (alvo == null) { console.log(`${etiqueta}  → sem preço MTM Funded (plataforma escondida)`); saltados++; continue }
    if (p.stripe_price_id_mtmfunded && !REFAZER) { console.log(`${etiqueta}  → já tem price id (${p.stripe_price_id_mtmfunded})`); saltados++; continue }

    // O preço novo vai para o MESMO produto do preço MT5 — é o mesmo programa, duas formas de o
    // entregar. Sem preço MT5 no Stripe, cria-se um produto próprio.
    let produto: string | null = null
    if (p.stripe_price_id) {
      try {
        const precoMt5 = await stripe.prices.retrieve(String(p.stripe_price_id))
        produto = typeof precoMt5.product === 'string' ? precoMt5.product : precoMt5.product?.id ?? null
      } catch (e) {
        console.log(`${etiqueta}  → não consegui ler o preço MT5 (${e instanceof Error ? e.message : e})`)
      }
    }

    if (!APLICAR) {
      console.log(`${etiqueta}  → criaria preço ${euros(alvo)} ${produto ? `no produto ${produto}` : 'com produto novo'}`)
      criados++
      continue
    }

    if (!produto) {
      const prod = await stripe.products.create({
        name: `MTM Funded · ${p.nome}`,
        description: `Avaliação em conta simulada de ${Number(p.saldo).toLocaleString('pt-PT')} USD · plataforma MTM Funded`,
        metadata: { origem: 'mtmfunded', programa: p.slug },
      })
      produto = prod.id
    }

    const preco = await stripe.prices.create({
      product: produto,
      currency: String(p.moeda ?? 'eur'),
      unit_amount: alvo,
      nickname: `MTM Funded · ${p.slug} · plataforma MTM Funded`,
      metadata: { origem: 'mtmfunded', programa: p.slug, plataforma: 'mtmfunded' },
    })

    const { error: erroGravar } = await db
      .from('mtm_funded_programs')
      .update({ stripe_price_id_mtmfunded: preco.id, updated_at: new Date().toISOString() })
      .eq('slug', p.slug)
    if (erroGravar) {
      // Ler depois de escrever: um preço criado no Stripe sem id gravado é um preço órfão, e a
      // próxima corrida criaria outro. Diz-se qual é, para se poder colar à mão.
      console.error(`${etiqueta}  → preço ${preco.id} CRIADO mas NÃO gravado: ${erroGravar.message}`)
      continue
    }
    console.log(`${etiqueta}  → preço ${preco.id} criado e gravado`)
    criados++
  }

  console.log(`\n${APLICAR ? 'criados' : 'a criar'}: ${criados} · saltados: ${saltados}`)
  if (!APLICAR && criados) console.log('Corre outra vez com --aplicar para criar no Stripe.\n')
}

main().catch((e) => { console.error(e); process.exit(1) })
