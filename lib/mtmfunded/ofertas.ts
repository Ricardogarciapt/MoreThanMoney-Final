import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  brandedMailAttachments,
  createMailTransporter,
  getEmailLogoSrc,
  getSiteUrl,
  mailFrom,
  prepareBrandedEmailHtml,
} from '@/lib/mail-transport'
import { tamanhoCurto, tamanhoLongo } from './email-tipo-conta'

/**
 * DESAFIO OFERECIDO A CADA RENOVAÇÃO DE SUBSCRIÇÃO.
 *
 * A ideia é simples: quem paga todos os meses ganha, todos os meses, uma oportunidade de
 * chegar a trader financiado. Premium leva um 10K de uma fase; a subscrição de 35 € leva um
 * 3K de uma fase.
 *
 * TRÊS REGRAS, e cada uma existe por uma razão concreta:
 *
 * 1. UM DE CADA VEZ. Se o desafio anterior ainda está a decorrer, não sai outro. Sem isto,
 *    doze meses de subscrição dariam doze contas abertas ao mesmo tempo à mesma pessoa — e
 *    cada conta aberta custa dinheiro na MetaApi e um lugar na fila do agente.
 *
 * 2. FALHOU, RECEBE OUTRO. É o ponto todo da política: dar outra tentativa a quem continua a
 *    pagar. Quem quebrou a conta no mês passado começa o mês novo com uma conta nova.
 *
 * 3. JÁ É FINANCIADO, PÁRA. A oferta é um caminho para lá chegar, não um subsídio perpétuo.
 *
 * Não se dá a ninguém retroactivamente: conta a partir da data em que a política entrou em
 * vigor. Oferecer doze desafios a quem já era cliente há um ano seria abrir mil contas numa
 * tarde.
 */

/** Desde quando é que as renovações contam. Antes disto, nada é oferecido. */
export const POLITICA_DESDE = '2026-09-11'

export interface RegraOferta {
  /** Slugs aceites, por ordem de preferência. */
  programas: string[]
  nome: string
}

/**
 * Que plano dá que desafio.
 *
 * A leitura é por INCLUSÃO e em minúsculas porque o campo `subscription_plan` tem histórico:
 * `premium`, `premium_monthly`, `app_member`, `membro`… Exigir igualdade exacta deixava de
 * fora metade dos clientes por causa de um sufixo.
 */
export function regraDoPlano(plano: string | null | undefined, categoria?: string | null): RegraOferta | null {
  const p = String(plano ?? '').toLowerCase()
  const c = String(categoria ?? '').toLowerCase()

  if (p.includes('premium') || c === 'premium' || c === 'vip' || p.includes('vip')) {
    return { programas: ['10k-1f'], nome: 'Desafio 10K · 1 fase' }
  }
  // A subscrição de 35 € — «membro» / «app_member» no histórico do site.
  if (p.includes('member') || p.includes('membro') || c === 'standard') {
    return { programas: ['3k-1f'], nome: 'Desafio 3K · 1 fase' }
  }
  return null
}

export interface ResultadoOferta {
  ok: boolean
  motivo?: string
  accountId?: string
  programa?: string
}

/**
 * Atribui o desafio da renovação, se as regras deixarem.
 *
 * Devolve sempre uma explicação quando NÃO atribui — este código corre dentro de um webhook,
 * e um `false` sem motivo transforma cada queixa de «não recebi o meu desafio» numa
 * investigação.
 */
export async function ofertarDesafioDaRenovacao(
  userId: string,
  opts?: { origem?: string; em?: string | number | Date },
): Promise<ResultadoOferta> {
  const db = getSupabaseAdmin()

  /**
   * A política não é retroactiva, e este é o sítio onde isso se faz cumprir.
   *
   * O Stripe reenvia eventos que falharam — dias depois, às vezes — e há sempre a hipótese de
   * alguém reprocessar faturas antigas para corrigir outra coisa. Sem esta verificação, uma
   * tarde de reprocessamento abria uma conta por cada renovação do último ano: cada uma custa
   * dinheiro na MetaApi e um lugar na fila do agente.
   *
   * Sem data, assume-se agora — quem chama sem dizer quando está a falar do presente.
   */
  const quando = opts?.em ? new Date(opts.em) : new Date()
  if (Number.isFinite(quando.getTime()) && quando < new Date(POLITICA_DESDE)) {
    return { ok: false, motivo: `renovação anterior a ${POLITICA_DESDE}` }
  }

  const { data: perfil } = await db
    .from('profiles')
    .select('id, full_name, email, subscription_plan, member_category, user_type, phone, birth_date, country')
    .eq('id', userId)
    .maybeSingle()
  if (!perfil) return { ok: false, motivo: 'perfil não encontrado' }

  const regra = regraDoPlano(perfil.subscription_plan as string, perfil.member_category as string)
  if (!regra) return { ok: false, motivo: 'o plano não dá direito a desafio' }

  // ── regra 3: já é trader financiado ───────────────────────────────────────
  const { data: financiada } = await db
    .from('mtm_trading_accounts')
    .select('id')
    .eq('user_id', userId)
    .in('tipo', ['funded', 'financiada'])
    .limit(1)
    .maybeSingle()
  if (financiada) return { ok: false, motivo: 'já é trader financiado' }

  const { data: contratoAssinado } = await db
    .from('mtm_funded_contracts')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (contratoAssinado) return { ok: false, motivo: 'já assinou o contrato de trader financiado' }

  // ── regra 1: um desafio activo de cada vez ────────────────────────────────
  // As contas OFERECIDAS (metricas.oferta, ex.: gratificacao-2026-09) não contam: a oferta convive
  // com o desafio da renovação — ./oferta-clientes.ts desafiosQueBloqueiam.
  const { data: emCursoTodos } = await db
    .from('mtm_trading_accounts')
    .select('id, estado, metricas')
    .eq('user_id', userId)
    .eq('tipo', 'desafio')
    .in('estado', ['pedida', 'ativa'])
  const { desafiosQueBloqueiam } = await import('./oferta-clientes')
  const emCurso = desafiosQueBloqueiam((emCursoTodos ?? []) as Array<{ metricas?: Record<string, unknown> | null }>)[0]
  if (emCurso) return { ok: false, motivo: 'ainda tem um desafio a decorrer' }

  // ── um por mês ────────────────────────────────────────────────────────────
  // Duas renovações no mesmo mês (uma correcção de pagamento, uma mudança de plano) não podem
  // dar dois desafios.
  const inicioDoMes = new Date()
  inicioDoMes.setDate(1)
  inicioDoMes.setHours(0, 0, 0, 0)
  const { count: esteMes } = await db
    .from('mtm_funded_purchases')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('estado', 'oferta')
    .gte('created_at', inicioDoMes.toISOString())
  if ((esteMes ?? 0) > 0) return { ok: false, motivo: 'já recebeu a oferta deste mês' }

  // ── o programa ────────────────────────────────────────────────────────────
  const { data: programa } = await db
    .from('mtm_funded_programs')
    .select('id, slug, nome, saldo, fases')
    .in('slug', regra.programas)
    .limit(1)
    .maybeSingle()
  if (!programa) return { ok: false, motivo: `programa ${regra.programas[0]} não existe` }

  // ── a conta ───────────────────────────────────────────────────────────────
  const { motorDeNovasContas, camposDeContaSimulada, camposDeContaMt5 } = await import('./simulado/motor')
  const motor = await motorDeNovasContas()

  const { data: conta, error: erroConta } = await db
    .from('mtm_trading_accounts')
    .insert({
      user_id: userId,
      tipo: 'desafio',
      program_id: programa.id,
      saldo_inicial: programa.saldo,
      alavancagem: 100,
      ...(motor === 'sim' ? await camposDeContaSimulada(Number(programa.saldo)) : camposDeContaMt5()),
    })
    .select('id')
    .single()
  if (erroConta || !conta) return { ok: false, motivo: 'não foi possível criar a conta' }

  await db.from('mtm_funded_purchases').insert({
    user_id: userId,
    program_id: programa.id,
    account_id: conta.id,
    valor_cents: 0,
    estado: 'oferta',
    email: perfil.email as string,
    pago_em: new Date().toISOString(),
  })

  // ── a fila ────────────────────────────────────────────────────────────────
  const nomeCompleto = String(perfil.full_name ?? '').trim()
  const partes = nomeCompleto.split(/\s+/).filter(Boolean)
  const { apelidoComTipo } = await import('./metaapi')

  if (motor === 'mt5') await db.from('mtm_account_requests').insert({
    account_id: conta.id,
    primeiro_nome: partes[0] || 'Trader',
    sobrenome: apelidoComTipo(partes.length > 1 ? partes[partes.length - 1] : 'MTM', 'desafio', {
      fases: Number(programa.fases ?? 0),
      fase: 1,
    }),
    email: perfil.email as string,
    // O telefone vem com indicativo (+351912…); aqui separa-se outra vez, porque o formulário
    // da corretora tem os dois em campos diferentes.
    telefone: String(perfil.phone ?? '').replace(/^\+\d{1,4}/, '').replace(/\D/g, '') || null,
    indicativo: (String(perfil.phone ?? '').match(/^\+\d{1,4}/) ?? ['+351'])[0],
    pais: (perfil.country as string) || 'PT',
    data_nascimento: (perfil.birth_date as string) || null,
    servidor: 'TheTradingMaster-Live',
    tipo_conta: 'ECN',
    deposito: programa.saldo,
    alavancagem: 100,
    estado: 'em_fila',
  })

  // Só nas contas da CORRETORA (que demoram a emitir): numa conta simulada a conta já está activa e o
  // email das credenciais, logo abaixo, já a anuncia como oferta — este dizia «está a ser emitida…
  // recebes o código QR», o contrário do que acontecia, e a pessoa recebia dois emails.
  if (perfil.email && motor === 'mt5') {
    await enviarEmailDaOferta({
      para: perfil.email as string,
      nome: partes[0] || 'Trader',
      programa: programa.nome as string,
      saldo: Number(programa.saldo),
      origem: opts?.origem ?? 'renovação',
    }).catch(() => undefined)
  }

  // Conta simulada: credenciais por email (login + link seguro, nunca a password) — lib/mtmfunded/credenciais-servico.ts
  if (motor === 'sim') {
    const { enviarCredenciaisDaConta } = await import('./credenciais-servico')
    await enviarCredenciaisDaConta(conta.id, 'criacao')
  }

  return { ok: true, accountId: conta.id, programa: programa.slug as string }
}

async function enviarEmailDaOferta(input: {
  para: string
  nome: string
  programa: string
  saldo: number
  origem: string
}): Promise<void> {
  const site = getSiteUrl()
  const logo = getEmailLogoSrc()

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;">
    <div style="text-align:center;padding:28px 0;"><img src="${logo}" alt="MTM Funded" width="160" style="max-width:160px;" /></div>
    <div style="background:#fff;border-radius:16px;padding:28px;">
      <h1 style="margin:0;font-size:22px;color:#111;">O teu desafio deste mês está a caminho</h1>
      <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#444;">
        Olá ${input.nome}, a tua subscrição renovou — e com ela vem um
        <strong>${input.programa}</strong>${tamanhoLongo(input.saldo > 0 ? input.saldo : null, 'pt') ? `, conta de ${tamanhoLongo(input.saldo, 'pt')}` : ''}, sem custo nenhum.
      </p>

      <div style="margin:22px 0;padding:16px 18px;background:#faf6ec;border:1px solid #eadcb8;border-radius:10px;">
        <p style="margin:0;font-size:15px;color:#333;line-height:1.6;">
          A conta está a ser emitida. Recebes as credenciais e o código QR por email assim que
          estiver pronta — são criadas uma a uma, por isso não é imediato.
        </p>
      </div>

      <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#444;">
        Enquanto és subscritor e não chegas a trader financiado, recebes um destes todos os
        meses. Um de cada vez: o próximo chega quando este terminar — passes ou não.
      </p>

      <a href="${site}/mtmfunded/tradingtournament/dashboard" style="display:inline-block;background:#BB8525;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;">
        Abrir a minha área
      </a>

      <p style="margin:22px 0 0;font-size:12px;color:#999;line-height:1.5;">
        A conta é simulada, com dinheiro virtual. As regras do desafio estão publicadas em
        ${site}/mtmfunded — vale a pena lê-las antes de começar.
      </p>
    </div>
  </div>`

  const transporter = createMailTransporter()
  await transporter.sendMail({
    from: mailFrom(),
    to: input.para,
    subject: `Oferta da renovação: o teu Desafio MTM Funded ${tamanhoCurto(input.saldo > 0 ? input.saldo : null) ?? input.programa} está a ser emitido`,
    html: prepareBrandedEmailHtml(html),
    attachments: brandedMailAttachments(),
  })
}
