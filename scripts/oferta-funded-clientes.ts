/**
 * OFERTA DE GRATIDÃO 2026-09 — um Desafio MTM Funded 10K · 2 fases a cada cliente com conta.
 *
 *   npx tsx scripts/oferta-funded-clientes.ts                   → SIMULAÇÃO (por defeito): quem, língua,
 *                                                                   saltados, e pré-visualizações em tmp/
 *   … --criar                  → cria as contas (motor sim; NÃO envia email)
 *   … --enviar                 → envia o email às contas JÁ criadas que ainda não o receberam
 *   … --limite=N               → no máximo N pessoas nesta corrida
 *   … --email=x@y              → só esta pessoa (teste)
 *   … --idioma-estrito         → regra de língua à letra (sem língua/país gravados → EN)
 *
 * Idempotente: a conta leva `metricas.oferta = 'gratificacao-2026-09'` (quem já a tem é saltado) e o
 * envio grava `metricas.oferta_email_enviado_em` (quem já recebeu é saltado).
 *
 * Nunca imprime nem envia passwords: o email leva login + servidor + o link seguro «Ver credenciais»
 * (uso único, 24 h, só o dono — lib/mtmfunded/credenciais-link.ts).
 *
 * PRÉ-REQUISITOS para --criar/--enviar: SUPABASE_SERVICE_ROLE_KEY, MTMFUNDED_CRED_KEY (cifra das
 * passwords e assinatura do link), GMAIL_USER/GMAIL_APP_PASSWORD (só --enviar) — em .env.local ou no
 * ambiente. O deploy com a excepção do login (lib/mtmfunded/oferta-acesso-cliente.ts) tem de estar em
 * produção ANTES do --enviar, senão os inactivos não conseguem abrir o link.
 */
import { join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

const RAIZ = join(__dirname, '..')
try { process.loadEnvFile(join(RAIZ, '.env.local')) } catch { /* usa o ambiente */ }

const argv = process.argv.slice(2)
const flag = (f: string) => argv.includes(f)
const valor = (f: string) => argv.find((a) => a.startsWith(`${f}=`))?.slice(f.length + 1)
const CRIAR = flag('--criar')
const ENVIAR = flag('--enviar')
const ESTRITO = flag('--idioma-estrito')
const LIMITE = Number(valor('--limite') ?? 1000)
const SO_EMAIL = valor('--email')?.trim().toLowerCase()

const PREMIOS_EN: Record<string, string> = {
  'desafio-5k-1f': 'MTM Funded Challenge · 5K · 1 phase',
  'mensalidade-membro': 'MTM Membership · one month',
  'mensalidade-premium': 'MTM Premium · one month',
  'mentoria-vip': 'Personal VIP mentoring',
}

async function main() {
  if (CRIAR && ENVIAR) throw new Error('--criar e --enviar são passos separados: corre um de cada vez')
  const { getSupabaseAdmin } = await import('../lib/supabase-admin-client')
  const O = await import('../lib/mtmfunded/oferta-clientes')
  const { montarEmailOferta } = await import('../lib/mtmfunded/email-oferta-clientes')
  const db = getSupabaseAdmin()

  // ── programa + passatempos ───────────────────────────────────────────────
  const { data: programa, error: eProg } = await db.from('mtm_funded_programs')
    .select('id, slug, nome, saldo, fases, regras, ativo').eq('slug', O.PROGRAMA_OFERTA).maybeSingle()
  if (eProg || !programa) throw new Error(`programa ${O.PROGRAMA_OFERTA} não encontrado`)
  if (Number(programa.fases) !== 2 || Number(programa.saldo) !== 10_000) throw new Error('o programa 10k-2f já não é 10K de 2 fases — rever antes de correr')

  const agora = new Date().toISOString()
  const { data: gws } = await db.from('giveaways').select('slug, mecanica, acaba_em, ig_post_id, ig_permalink, variante')
    .eq('estado', 'a_decorrer').gt('acaba_em', agora).order('variante')
  const postIds = (gws ?? []).map((g) => g.ig_post_id).filter(Boolean) as string[]
  const { data: posts } = postIds.length
    ? await db.from('social_scheduled_posts').select('id, permalink').in('id', postIds)
    : { data: [] as Array<{ id: string; permalink: string | null }> }
  const permalinkDe = new Map((posts ?? []).map((p) => [String(p.id), (p.permalink as string | null) ?? null]))
  const sorteios = (gws ?? []).map((g) => {
    const m = (g.mecanica ?? {}) as { palavra?: string; entrada?: { tipo?: string; bilhetes?: number }; extras?: Array<{ tipo: string; bilhetes: number; maximo: number }> }
    return {
      slug: String(g.slug), palavra: String(m.palavra ?? ''), entrada: String(m.entrada?.tipo ?? 'comentario'),
      bilhetesEntrada: Number(m.entrada?.bilhetes ?? 1), extras: m.extras ?? [],
      permalink: (g.ig_permalink as string | null) ?? permalinkDe.get(String(g.ig_post_id)) ?? null,
      acabaEm: String(g.acaba_em),
    }
  })
  const { data: premiosRows } = await db.from('giveaway_prizes').select('slug, nome, quantidade').order('ordem')
  const premios = (idioma: 'pt' | 'en') => (premiosRows ?? []).map((p) =>
    `${p.quantidade}× ${idioma === 'en' ? PREMIOS_EN[String(p.slug)] ?? p.nome : p.nome}`)

  // ── perfis ───────────────────────────────────────────────────────────────
  const { data: perfis, error: ePerf } = await db.from('profiles')
    .select('id, email, full_name, user_type, is_active, preferred_language, detected_language, country, phone, timezone')
    .order('created_at', { ascending: true })
  if (ePerf) throw new Error(ePerf.message)
  const todos = (perfis ?? []) as Array<import('../lib/mtmfunded/oferta-clientes').PerfilOferta>

  const { data: ofertas } = await db.from('mtm_trading_accounts')
    .select('id, user_id, mt5_login, servidor, saldo_inicial, metricas, estado, created_at').eq('metricas->>oferta', O.MARCA_OFERTA)
    .order('created_at', { ascending: true })
  // A conta da F1 (a primeira): a F2 da oferta herda a marca e não pode receber este email.
  const ofertaDe = new Map<string, NonNullable<typeof ofertas>[number]>()
  for (const c of ofertas ?? []) if (!ofertaDe.has(String(c.user_id))) ofertaDe.set(String(c.user_id), c)

  const saltados: Record<string, string[]> = {}
  const saltar = (m: string, e: string | null) => { (saltados[m] ??= []).push(O.mascararEmail(e)) }
  const elegiveis: typeof todos = []
  for (const p of todos) {
    if (SO_EMAIL && String(p.email ?? '').toLowerCase() !== SO_EMAIL) continue
    const excl = O.motivoExclusao(p)
    if (excl) { saltar(excl, p.email); continue }
    elegiveis.push(p)
  }

  const idioma = (p: (typeof todos)[number]) => O.idiomaDoCliente(p, { estrito: ESTRITO })
  const contar = (lista: typeof todos) => ({
    total: lista.length,
    ativos: lista.filter((p) => p.is_active === true).length,
    inativos: lista.filter((p) => p.is_active !== true).length,
    pt: lista.filter((p) => idioma(p) === 'pt').length,
    en: lista.filter((p) => idioma(p) === 'en').length,
  })

  const modo = CRIAR ? 'CRIAR CONTAS' : ENVIAR ? 'ENVIAR EMAILS' : 'SIMULAÇÃO (nada criado, nada enviado)'
  console.log(`\n=== Oferta ${O.MARCA_OFERTA} · ${modo} ===`)
  console.log(`Programa: ${programa.slug} «${programa.nome}» · ${programa.saldo} USD · ${programa.fases} fases · motor sim`)
  console.log(`Passatempos a decorrer: ${sorteios.map((s) => `${s.palavra} ${s.permalink ?? '(sem link)'}`).join(' · ') || 'nenhum'}`)
  console.log(`Perfis: ${todos.length}${SO_EMAIL ? ` (filtro --email)` : ''}`)
  const c = contar(elegiveis)
  console.log(`Elegíveis: ${c.total} · activos ${c.ativos} · inactivos ${c.inativos} · PT ${c.pt} · EN ${c.en}${ESTRITO ? ' (língua estrita)' : ''}`)
  if (!ESTRITO) {
    const e = elegiveis.filter((p) => O.idiomaDoCliente(p, { estrito: true }) === 'en').length
    console.log(`  (com a regra à letra seriam PT ${c.total - e} · EN ${e} — sem língua/país gravados cai tudo em EN)`)
  }
  for (const [m, l] of Object.entries(saltados)) console.log(`Saltados · ${m}: ${l.length}  ${l.join(', ')}`)

  const jaTem = elegiveis.filter((p) => ofertaDe.has(p.id))
  const porCriar = elegiveis.filter((p) => !ofertaDe.has(p.id))
  const porEnviar = jaTem.filter((p) => !(ofertaDe.get(p.id)?.metricas as Record<string, unknown> | null)?.oferta_email_enviado_em)
  console.log(`Já com a oferta: ${jaTem.length} · por criar: ${porCriar.length} · criadas por enviar: ${porEnviar.length}`)

  console.log('\nAmostra (10):')
  for (const p of elegiveis.slice(0, 10)) {
    console.log(`  ${O.mascararEmail(p.email).padEnd(30)} ${(p.is_active ? 'activo' : 'inactivo').padEnd(9)} ${idioma(p).toUpperCase()}  ${ofertaDe.has(p.id) ? 'já tem' : 'por criar'}`)
  }

  // ── pré-visualizações (sempre; dados fictícios, link fictício) ────────────
  const dir = join(RAIZ, 'tmp')
  mkdirSync(dir, { recursive: true })
  const site = 'https://www.morethanmoney.pt'
  for (const lang of ['pt', 'en'] as const) {
    const e = montarEmailOferta({
      idioma: lang, nome: lang === 'pt' ? 'Joana' : 'Alex', login: '77123456', servidor: 'MTM Funded',
      saldo: Number(programa.saldo), programa: String(programa.nome), fases: Number(programa.fases), fase: 1, regras: (programa.regras ?? {}) as Record<string, number>,
      urlLink: `${site}/mtmfunded/credenciais#t=EXEMPLO`, expiraEm: new Date(Date.now() + O.VALIDADE_LINK_OFERTA_MS).toISOString(),
      siteUrl: site, sorteios, premios: premios(lang), logoSrc: `${site}/icon-512x512.png`,
    })
    writeFileSync(join(dir, `oferta-preview-${lang}.html`), e.html)
    writeFileSync(join(dir, `oferta-preview-${lang}.txt`), `Assunto: ${e.assunto}\n\n${e.texto}`)
  }
  console.log(`\nPré-visualizações: ${join(dir, 'oferta-preview-pt.html')} · ${join(dir, 'oferta-preview-en.html')} (+ .txt)`)

  if (!CRIAR && !ENVIAR) {
    console.log('\nNada criado, nada enviado. Passos: --criar (contas) e depois --enviar (emails).')
    return
  }

  // ── --criar ──────────────────────────────────────────────────────────────
  if (CRIAR) {
    if (!process.env.MTMFUNDED_CRED_KEY) throw new Error('MTMFUNDED_CRED_KEY em falta (as passwords não se cifravam)')
    const { camposDeContaSimulada } = await import('../lib/mtmfunded/simulado/motor')
    let criadas = 0, falhas = 0
    for (const p of porCriar.slice(0, LIMITE)) {
      // Relê antes de escrever: outra corrida pode ter criado entretanto.
      const { data: ja } = await db.from('mtm_trading_accounts').select('id').eq('user_id', p.id).eq('metricas->>oferta', O.MARCA_OFERTA).limit(1)
      if (ja?.length) { console.log(`  ${O.mascararEmail(p.email).padEnd(30)} já tinha`); continue }
      const { data: conta, error } = await db.from('mtm_trading_accounts').insert({
        ...(await camposDeContaSimulada(Number(programa.saldo))),
        ...O.colunasDaContaOferta(p.id, { id: String(programa.id), saldo: Number(programa.saldo) }, new Date().toISOString()),
      }).select('id, mt5_login, motor, estado').single()
      if (error || !conta) { falhas++; console.log(`  ${O.mascararEmail(p.email).padEnd(30)} ERRO ${error?.message}`); continue }
      criadas++
      console.log(`  ${O.mascararEmail(p.email).padEnd(30)} conta ${conta.mt5_login} · ${conta.motor} · ${conta.estado}`)
    }
    console.log(`\n${criadas} contas criadas, ${falhas} falhas. Emails NÃO enviados — corre --enviar.`)
    return
  }

  // ── --enviar ─────────────────────────────────────────────────────────────
  const { emitirLink, repoSupabase, urlDoLink } = await import('../lib/mtmfunded/credenciais-link')
  const { mailFrom, brandedMailAttachments, getSiteUrl } = await import('../lib/mail-transport')
  const { sanitizeEnv } = await import('../lib/env-sanitize')
  const nodemailer = (await import('nodemailer')).default
  // POOLED (uma ligação): um login por mensagem dá «454 Too many login attempts» no Gmail a meio da lista.
  const transporter = nodemailer.createTransport({
    service: 'gmail', pool: true, maxConnections: 1,
    auth: { user: sanitizeEnv(process.env.GMAIL_USER, 'morethanmoneypt@gmail.com'), pass: sanitizeEnv(process.env.GMAIL_APP_PASSWORD) },
  })
  await transporter.verify().catch((e: unknown) => { throw new Error(`SMTP recusou as credenciais: ${e instanceof Error ? e.message : e}`) })
  const siteEnvio = getSiteUrl()
  let enviados = 0, falhados = 0
  for (const p of porEnviar.slice(0, LIMITE)) {
    const conta = ofertaDe.get(p.id)!
    const quem = O.mascararEmail(p.email)
    try {
      if (!conta.mt5_login) throw new Error('conta sem login')
      const lang = idioma(p)
      const link = await emitirLink({ accountId: String(conta.id), userId: p.id, motivo: 'criacao' }, repoSupabase(db), { validadeMs: O.VALIDADE_LINK_OFERTA_MS })
      const e = montarEmailOferta({
        idioma: lang, nome: String(p.full_name ?? '').trim().split(/\s+/)[0] || 'Trader',
        login: String(conta.mt5_login), servidor: String(conta.servidor ?? 'MTM Funded'),
        // O tamanho da CONTA criada (o do programa só se a conta não o tiver).
        saldo: Number((conta as { saldo_inicial?: number | null }).saldo_inicial ?? programa.saldo), programa: String(programa.nome),
        fases: Number(programa.fases), fase: Number((conta.metricas as { fase?: number } | null)?.fase ?? 1), regras: (programa.regras ?? {}) as Record<string, number>,
        urlLink: urlDoLink(siteEnvio, link.token), expiraEm: link.expiraEm, siteUrl: siteEnvio, sorteios, premios: premios(lang),
      })
      await transporter.sendMail({ from: mailFrom(), to: String(p.email), subject: e.assunto, html: e.html, text: e.texto, attachments: brandedMailAttachments() })
      const agoraEnvio = new Date().toISOString()
      await db.from('mtm_funded_credenciais_links').update({ email_enviado_em: agoraEnvio }).eq('id', link.linkId)
      const { data: atual } = await db.from('mtm_trading_accounts').select('metricas').eq('id', conta.id).single()
      await db.from('mtm_trading_accounts').update({
        metricas: { ...((atual?.metricas ?? {}) as Record<string, unknown>), oferta_email_enviado_em: agoraEnvio, oferta_email_idioma: lang },
      }).eq('id', conta.id)
      enviados++
      console.log(`  ${quem.padEnd(30)} ${lang.toUpperCase()} enviado (login ${conta.mt5_login})`)
    } catch (err) {
      falhados++
      console.log(`  ${quem.padEnd(30)} FALHOU: ${(err instanceof Error ? err.message : String(err)).replace(/#t=[^\s"')]+/g, '#t=…')}`)
    }
    await new Promise((ok) => setTimeout(ok, 1500))
  }
  console.log(`\n${enviados} enviados, ${falhados} falhados.`)
}

main().catch((e) => { console.error('ERRO:', e instanceof Error ? e.message : e); process.exit(1) })
