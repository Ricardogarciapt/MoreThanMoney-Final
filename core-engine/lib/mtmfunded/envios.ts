import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import {
  brandedMailAttachments,
  createMailTransporter,
  getEmailLogoSrc,
  getSiteUrl,
  mailFrom,
  prepareBrandedEmailHtml,
} from '@/lib/mail-transport'

/**
 * OS ENVIOS EM MASSA DO MTM FUNDED — a lógica, fora das rotas.
 *
 * Vive aqui e não dentro de `route.ts` por uma razão concreta: estes envios também se disparam
 * à mão, de um script, quando é preciso mandar a prova antes do disparo a sério. Com o texto e
 * as regras dentro da rota, o script tinha de os copiar — e no dia em que a rota mudasse, o
 * disparo manual continuava a mandar o email velho sem ninguém dar por isso.
 *
 * Os TRÊS TRAVÕES são os mesmos nos dois envios, e existem porque um envio em massa não se
 * desfaz:
 *
 * · `confirmar` obrigatório. Sem ele devolve a lista de quem receberia e não sai nada.
 * · Marca quem já recebeu. Correr duas vezes não manda o mesmo email duas vezes à mesma pessoa.
 * · Pausa de meio segundo. Uma rajada de centenas queima a reputação do domínio — e depois nem
 *   os emails das contas chegam a quem espera por eles.
 *
 * `so` limita o envio a endereços concretos, para a prova. Uma prova NÃO gasta a marca: senão
 * quem a recebesse ficava de fora do envio a sério.
 */

export interface OpcoesEnvio {
  /** Tem de ser 'SIM-ENVIAR'. Qualquer outra coisa é ensaio. */
  confirmar?: string
  limite?: number
  /** Enviar só a estes endereços — a prova. */
  so?: string[]
  /** Anúncio: só a quem tem subscrição activa. Por omissão vão também os inactivos. */
  soAtivos?: boolean
}

export interface ResultadoEnvio {
  ok?: boolean
  ensaio?: boolean
  aviso?: string
  error?: string
  total?: number
  enviados?: number
  falhados?: number
  torneio?: string
  jaInscritos?: number
  exemplo?: Array<Record<string, unknown>>
}

/**
 * Endereços de teste ficam de fora.
 *
 * Um bounce não é só um email perdido: bounces a mais fazem os fornecedores marcarem o
 * domínio, e depois nem os emails das contas chegam a quem espera por eles.
 */
function ehTeste(email: string): boolean {
  return /@(test|example|exemplo|invalid|localhost)\.|@test$|^teste?@|\+test@/i.test(email)
}

// ── convite para o torneio ───────────────────────────────────────────────────

function corpoTorneio(nome: string, t: {
  nome: string
  saldo: number
  comeca: string
  fecham: string | null
}): string {
  const site = getSiteUrl()
  const logo = getEmailLogoSrc()
  const d = (v: string) =>
    new Date(v).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' })

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;">
    <div style="text-align:center;padding:28px 0;"><img src="${logo}" alt="MTM Funded" width="170" style="max-width:170px;" /></div>
    <div style="background:#fff;border-radius:16px;padding:28px;">
      <h1 style="margin:0;font-size:23px;line-height:1.3;color:#111;">
        As inscrições do ${t.nome} estão abertas
      </h1>

      <p style="margin:16px 0 0;font-size:15px;line-height:1.65;color:#444;">
        Olá ${nome}, abriu a inscrição no nosso torneio trimestral de trading — e é
        <strong>gratuito</strong>.
      </p>

      <div style="margin:22px 0;padding:18px 20px;background:#faf6ec;border:1px solid #eadcb8;border-radius:12px;">
        <p style="margin:0;font-size:16px;line-height:1.6;color:#222;">
          Conta avaliada de <strong>${Number(t.saldo).toLocaleString('pt-PT')} USD</strong>,
          emitida por nós. Começa a <strong>${d(t.comeca)}</strong>.
        </p>
        ${
          t.fecham
            ? `<p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#666;">
                 As inscrições fecham a ${d(t.fecham)} — depois disso não entra mais ninguém.
               </p>`
            : ''
        }
      </div>

      <p style="margin:0 0 6px;font-size:14px;line-height:1.65;color:#444;">
        Como funciona:
      </p>
      <ul style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.75;color:#555;">
        <li>Inscreves-te e recebes a conta por email, com código QR.</li>
        <li>A conta é <strong>simulada</strong> — dinheiro virtual, não depositas nada.</li>
        <li>A classificação é pública e actualiza de hora a hora.</li>
        <li>Regras publicadas antes de começares. Prémios para o pódio.</li>
      </ul>

      <a href="${site}/mtmfunded/tradingtournament" style="display:inline-block;background:#BB8525;color:#fff;text-decoration:none;padding:13px 26px;border-radius:8px;font-weight:600;font-size:15px;">
        Inscrever-me
      </a>

      <p style="margin:26px 0 0;font-size:12px;line-height:1.6;color:#999;">
        As contas não movimentam dinheiro real e nada disto é aconselhamento financeiro.
        As regras estão em ${site}/mtmfunded/tradingtournament.
      </p>
    </div>
  </div>`
}

export async function enviarConviteTorneio(opcoes: OpcoesEnvio = {}): Promise<ResultadoEnvio> {
  const b = opcoes
  const confirmado = b?.confirmar === 'SIM-ENVIAR'
  const limite = Math.min(Number(b?.limite ?? 500), 2000)
  const so: string[] = Array.isArray(b?.so) ? b.so.map((e: unknown) => String(e).toLowerCase()) : []

  const db = getSupabaseAdmin()

  const { data: torneio } = await db
    .from('mtm_tournaments')
    .select('id, nome, estado, comeca_em, saldo_inicial, inscricoes_fecham_em, publicado')
    .eq('publicado', true)
    .order('comeca_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!torneio) {
    return { error: 'Não há torneio publicado' }
  }
  // Convidar para uma porta fechada ensina as pessoas a ignorar os nossos emails.
  // A porta é a data, não o estado — um torneio a decorrer que ainda aceita gente continua a
  // merecer convite. Ver `lib/mtmfunded/inscricoes`.
  const { inscricoesAbertas } = await import('./inscricoes')
  if (!inscricoesAbertas(torneio)) {
    return { error: `As inscrições não estão abertas (estado: ${torneio.estado})` }
  }

  const CHAVE_MARCA = `convite_torneio_${torneio.id}`

  const { data: pessoas } = await db
    .from('profiles')
    .select('id, full_name, email, is_active, profile_data')
    .not('email', 'is', null)
    .limit(limite)

  /** Endereços de teste ficam de fora: bounces a mais fazem marcar o domínio. */
  const ehTeste = (email: string) =>
    /@(test|example|exemplo|invalid|localhost)\.|@test$|^teste?@|\+test@/i.test(email)

  // Quem já está inscrito não precisa de convite — e receber um convite para uma coisa em que
  // já se inscreveu faz duvidar de que a inscrição tenha ficado registada.
  const { data: inscritos } = await db
    .from('mtm_tournament_participants')
    .select('user_id')
    .eq('tournament_id', torneio.id)
  const jaDentro = new Set((inscritos ?? []).map((i) => String(i.user_id)))

  const alvos = (pessoas ?? []).filter((p) => {
    const email = String(p.email ?? '').trim().toLowerCase()
    if (!email.includes('@') || ehTeste(email)) return false
    if (so.length && !so.includes(email)) return false
    // Quem já está inscrito não precisa de convite — receber um convite para uma coisa em que
    // já se inscreveu faz duvidar de que a inscrição tenha ficado registada. Numa PROVA o
    // filtro não se aplica: quem pede a prova costuma ser a primeira pessoa inscrita, e sem
    // isto o email nunca chegava a ser visto antes de sair para toda a gente.
    if (!so.length && jaDentro.has(String(p.id))) return false
    const dados = (p.profile_data ?? {}) as Record<string, unknown>
    // A prova para um endereço só não gasta a marca: senão a pessoa da prova ficava de fora
    // do envio a sério.
    if (!so.length && dados[CHAVE_MARCA]) return false
    return true
  })

  if (!confirmado) {
    return {
      ensaio: true,
      aviso: 'Nada foi enviado. Repete com { "confirmar": "SIM-ENVIAR" } para enviar a sério.',
      torneio: torneio.nome,
      total: alvos.length,
      jaInscritos: jaDentro.size,
      exemplo: alvos.slice(0, 10).map((p) => ({ email: p.email, nome: p.full_name })),
    }
  }

  const transporter = createMailTransporter()
  const dados = {
    nome: String(torneio.nome),
    saldo: Number(torneio.saldo_inicial),
    comeca: String(torneio.comeca_em),
    fecham: (torneio.inscricoes_fecham_em as string) ?? null,
  }

  let enviados = 0
  let falhados = 0

  for (const p of alvos) {
    const nome = String(p.full_name ?? '').trim().split(/\s+/)[0] || 'Trader'
    try {
      await transporter.sendMail({
        from: mailFrom(),
        to: p.email as string,
        subject: `Inscrições abertas — ${torneio.nome}`,
        html: prepareBrandedEmailHtml(corpoTorneio(nome, dados)),
        attachments: brandedMailAttachments(),
      })
      enviados++

      // Marca-se DEPOIS de enviar: marcar antes e falhar o envio deixava a pessoa de fora do
      // convite sem forma de reparar sem mexer na base à mão.
      if (!so.length) {
        await db
          .from('profiles')
          .update({
            profile_data: {
              ...((p.profile_data ?? {}) as Record<string, unknown>),
              [CHAVE_MARCA]: new Date().toISOString(),
            },
          })
          .eq('id', p.id)
      }
    } catch (e) {
      falhados++
      console.error('[MTMFUNDED convite torneio]', p.email, String(e).slice(0, 120))
    }

    await new Promise((r) => setTimeout(r, 500))
  }

  return { ok: true, torneio: torneio.nome, enviados, falhados, total: alvos.length }
}

// ── anúncio da política de ofertas ───────────────────────────────────────────

function corpoAnuncio(nome: string, premium: boolean): string {
  const site = getSiteUrl()
  const logo = getEmailLogoSrc()
  const desafio = premium ? 'Desafio 10K' : 'Desafio 3K'
  const conta = premium ? '10.000 USD' : '3.000 USD'

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;">
    <div style="text-align:center;padding:28px 0;"><img src="${logo}" alt="MTM Funded" width="170" style="max-width:170px;" /></div>
    <div style="background:#fff;border-radius:16px;padding:28px;">
      <h1 style="margin:0;font-size:23px;line-height:1.3;color:#111;">
        A partir de agora, a tua renovação vale um desafio
      </h1>

      <p style="margin:16px 0 0;font-size:15px;line-height:1.65;color:#444;">
        Olá ${nome}, temos uma novidade que é mesmo para ti.
      </p>

      <p style="margin:14px 0 0;font-size:15px;line-height:1.65;color:#444;">
        Abrimos o <strong>MTM Funded</strong> — avaliação de traders em contas simuladas, com um
        caminho até uma conta financiada pela MTM. E decidimos que quem já está connosco não
        devia começar do zero.
      </p>

      <div style="margin:22px 0;padding:18px 20px;background:#faf6ec;border:1px solid #eadcb8;border-radius:12px;">
        <p style="margin:0;font-size:16px;line-height:1.6;color:#222;">
          <strong>Cada vez que a tua subscrição renovar</strong>, recebes um
          <strong>${desafio} de uma fase</strong> — conta de ${conta}, sem custo nenhum.
        </p>
        <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#666;">
          E repete-se todos os meses, enquanto fores subscritor e ainda não fores trader
          financiado. Falhaste o do mês passado? Recebes outro. É esse o ponto.
        </p>
      </div>

      <p style="margin:0 0 6px;font-size:14px;line-height:1.65;color:#444;">
        Como funciona, sem letra pequena:
      </p>
      <ul style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.75;color:#555;">
        <li>Um desafio de cada vez — o seguinte chega quando este terminar.</li>
        <li>Um por mês, automático. Não tens de pedir nada.</li>
        <li>As contas são <strong>simuladas</strong>, com dinheiro virtual.</li>
        <li>Passando, assinas o contrato e ficas a 75% dos resultados.</li>
      </ul>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#444;">
        Se a tua subscrição está inactiva, reactiva-a e entras logo na próxima renovação.
      </p>

      <a href="${site}/mtmfunded" style="display:inline-block;background:#BB8525;color:#fff;text-decoration:none;padding:13px 26px;border-radius:8px;font-weight:600;font-size:15px;">
        Ver o MTM Funded
      </a>

      <p style="margin:26px 0 0;font-size:12px;line-height:1.6;color:#999;">
        As regras de cada desafio estão publicadas antes de começares, em ${site}/mtmfunded.
        Nada disto é aconselhamento financeiro, e as contas não movimentam dinheiro real.
      </p>
    </div>
  </div>`
}

export async function enviarAnuncioPolitica(opcoes: OpcoesEnvio = {}): Promise<ResultadoEnvio> {
  /** A marca de quem já recebeu. Muda quando o anúncio mudar. */
  const CHAVE_MARCA = 'anuncio_desafios_2026_09'
  const b = opcoes
  const confirmado = b?.confirmar === 'SIM-ENVIAR'
  const limite = Math.min(Number(b?.limite ?? 500), 2000)
  /** Enviar só para estes emails — para a prova antes do disparo a sério. */
  const so: string[] = Array.isArray(b?.so) ? b.so.map((e: unknown) => String(e).toLowerCase()) : []
  /** Só os que têm subscrição activa. Por omissão vão também os inactivos: para eles o email
   *  é um convite a reactivar, que é metade do objectivo da política. */
  const soAtivos = b?.soAtivos === true

  const db = getSupabaseAdmin()

  // Quem recebe: toda a gente com email e um plano que dá direito a desafio — incluindo quem
  // está inactivo, porque o email é justamente um convite a reactivar.
  const { data: pessoas } = await db
    .from('profiles')
    .select('id, full_name, email, subscription_plan, member_category, user_type, is_active, profile_data')
    .not('email', 'is', null)
    .limit(limite)

  const { regraDoPlano } = await import('@/lib/mtmfunded/ofertas')

  /**
   * Endereços de teste ficam de fora.
   *
   * Um bounce não é só um email perdido: bounces a mais fazem os fornecedores marcarem o
   * domínio, e depois nem os emails das contas chegam a quem espera por eles.
   */
  const ehTeste = (email: string) =>
    /@(test|example|exemplo|invalid|localhost)\.|@test$|^teste?@|\+test@/i.test(email)

  const alvos = (pessoas ?? []).filter((p) => {
    const email = String(p.email ?? '').trim().toLowerCase()
    if (!email.includes('@') || ehTeste(email)) return false
    if (so.length && !so.includes(email)) return false
    if (soAtivos && !p.is_active) return false
    const dados = (p.profile_data ?? {}) as Record<string, unknown>
    // A prova para um endereço só não gasta a marca: senão a pessoa da prova ficava de fora
    // do envio a sério.
    if (!so.length && dados[CHAVE_MARCA]) return false
    return regraDoPlano(p.subscription_plan as string, p.member_category as string) !== null
  })

  if (!confirmado) {
    // ENSAIO: diz quem receberia, e não manda nada.
    return {
      ensaio: true,
      aviso: 'Nada foi enviado. Repete com { "confirmar": "SIM-ENVIAR" } para enviar a sério.',
      total: alvos.length,
      exemplo: alvos.slice(0, 10).map((p) => ({
        email: p.email,
        nome: p.full_name,
        desafio: regraDoPlano(p.subscription_plan as string, p.member_category as string)?.nome,
      })),
    }
  }

  const transporter = createMailTransporter()
  let enviados = 0
  let falhados = 0

  for (const p of alvos) {
    const regra = regraDoPlano(p.subscription_plan as string, p.member_category as string)
    const premium = regra?.programas?.[0] === '10k-1f'
    const nome = String(p.full_name ?? '').trim().split(/\s+/)[0] || 'Trader'

    try {
      await transporter.sendMail({
        from: mailFrom(),
        to: p.email as string,
        subject: 'A tua renovação passa a valer um desafio MTM Funded',
        html: prepareBrandedEmailHtml(corpoAnuncio(nome, premium)),
        attachments: brandedMailAttachments(),
      })
      enviados++

      // Marca-se DEPOIS de enviar. Marcar antes e falhar o envio deixava a pessoa fora do
      // anúncio para sempre, sem forma de reparar sem mexer na base à mão.
      // Numa prova (`so`) não se marca: essa pessoa tem de receber o envio a sério também.
      if (!so.length) {
        await db
          .from('profiles')
          .update({
            profile_data: {
              ...((p.profile_data ?? {}) as Record<string, unknown>),
              [CHAVE_MARCA]: new Date().toISOString(),
            },
          })
          .eq('id', p.id)
      }
    } catch (e) {
      falhados++
      console.error('[MTMFUNDED anúncio]', p.email, String(e).slice(0, 120))
    }

    // Meio segundo entre emails: uma rajada de centenas queima a reputação do domínio, e
    // depois nem os emails das contas chegam.
    await new Promise((r) => setTimeout(r, 500))
  }

  return { ok: true, enviados, falhados, total: alvos.length }
}

// ── confirmação de inscrição ─────────────────────────────────────────────────

/**
 * O EMAIL QUE FALTAVA: «estás inscrito».
 *
 * Entre carregar no botão e receber as credenciais passam dias — as contas são criadas uma a
 * uma por um agente a conduzir o MetaTrader, e as credenciais só abrem na véspera, de propósito,
 * para que quem se inscreve cedo não leve semanas de treino na própria conta do torneio.
 *
 * Durante esses dias não chegava nada. O participante ficava sem saber se a inscrição tinha
 * sequer passado, e a pergunta «recebeste?» chegava por mensagem em vez de estar respondida.
 *
 * Este email diz três coisas e só três: estás dentro, começa neste dia, as credenciais chegam na
 * véspera. Não leva login nem password — não existem ainda, e prometê-los para «já» era repetir
 * o problema noutro sítio.
 *
 * NÃO é em massa e não tem os travões dos outros: dispara um a um, quando alguém se inscreve.
 */
export async function enviarConfirmacaoInscricao(participanteId: string): Promise<ResultadoEnvio> {
  const db = getSupabaseAdmin()

  const { data: p } = await db
    .from('mtm_tournament_participants')
    .select('id, nome_publico, email, confirmacao_enviada_em, tournament_id')
    .eq('id', participanteId)
    .maybeSingle()
  if (!p) return { error: 'participante não encontrado' }
  if (!p.email) return { error: 'participante sem email' }

  // Reenviar o mesmo «estás inscrito» faz duvidar da primeira inscrição, não tranquiliza.
  if (p.confirmacao_enviada_em) {
    return { ok: true, aviso: 'confirmação já tinha sido enviada', enviados: 0 }
  }

  const { data: t } = await db
    .from('mtm_tournaments')
    .select('slug, nome, comeca_em, acaba_em, saldo_inicial, alavancagem, inscricoes_fecham_em')
    .eq('id', p.tournament_id as string)
    .maybeSingle()
  if (!t) return { error: 'torneio não encontrado' }

  const site = getSiteUrl()
  const logo = getEmailLogoSrc()
  const primeiro = String(p.nome_publico ?? '').trim().split(/\s+/)[0] || 'Trader'
  const comeca = new Date(t.comeca_em as string)
  const dia = comeca.toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long' })
  const vesperaData = new Date(comeca.getTime() - 24 * 3600 * 1000)
  const vespera = vesperaData.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' })

  /**
   * PÔR AS DATAS NO CALENDÁRIO DELE.
   *
   * Um email que diz «começa segunda» obriga a pessoa a ir escrever isso algures — e a maioria
   * não escreve. Entre a inscrição e o arranque passam dias, e o dia chega sem aviso nenhum.
   *
   * Dois caminhos porque não há um que sirva toda a gente: o Google abre no browser e resolve
   * quem vive no Gmail; o ficheiro `.ics` é o que o iPhone, o Outlook e tudo o resto entendem.
   * Escolher só um deixava metade das pessoas de fora.
   *
   * O formato do Google é `AAAAMMDD/AAAAMMDD` para dia inteiro, e o fim é EXCLUSIVO — daí o dia
   * a mais, senão o último dia do torneio não aparece na agenda.
   */
  const diaGoogle = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
  const fimExclusivo = new Date(new Date(t.acaba_em as string).getTime() + 24 * 3600 * 1000)
  const linkGoogle =
    'https://calendar.google.com/calendar/render?action=TEMPLATE' +
    `&text=${encodeURIComponent(t.nome as string)}` +
    `&dates=${diaGoogle(comeca)}/${diaGoogle(fimExclusivo)}` +
    `&details=${encodeURIComponent(
      `Conta simulada de ${Number(t.saldo_inicial).toLocaleString('pt-PT')} USD. As credenciais chegam a ${vespera}.\n\nRegras e classificação: ${site}/mtmfunded/tradingtournament`,
    )}` +
    `&location=${encodeURIComponent(`${site}/mtmfunded/tradingtournament`)}`
  const linkIcs = `${site}/api/mtmfunded/tournament/calendario?t=${encodeURIComponent(t.slug as string)}`

  /**
   * Quem entra a meio não pode receber «começa segunda».
   *
   * Neste primeiro torneio as inscrições ficam abertas um mês depois do arranque, por isso o
   * mesmo email serve duas situações diferentes: quem se inscreveu antes e espera pela véspera,
   * e quem entrou com o torneio já a correr e cuja conta é emitida já a seguir. Dizer a segunda
   * pessoa que «as credenciais chegam na véspera» era mandá-la esperar por um dia que já passou.
   */
  const arrancou = comeca <= new Date()
  const fimLegivel = new Date(t.acaba_em as string).toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: 'long',
  })
  const fechamLegivel = t.inscricoes_fecham_em
    ? new Date(t.inscricoes_fecham_em as string).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' })
    : null

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;">
    <div style="text-align:center;padding:28px 0;"><img src="${logo}" alt="MTM Funded" width="170" style="max-width:170px;" /></div>
    <div style="background:#fff;border-radius:16px;padding:28px;">
      <h1 style="margin:0;font-size:23px;line-height:1.3;color:#111;">Estás inscrito, ${primeiro}</h1>

      <p style="margin:16px 0 0;font-size:15px;line-height:1.65;color:#444;">
        A tua inscrição no <strong>${t.nome}</strong> está registada.
        ${arrancou ? `Já vai a meio — começou <strong>${dia}</strong> e acaba <strong>${fimLegivel}</strong>.` : `Começa <strong>${dia}</strong>.`}
      </p>

      <div style="margin:22px 0;padding:18px 20px;background:#faf6ec;border:1px solid #eadcb8;border-radius:12px;">
        ${
          arrancou
            ? `<p style="margin:0;font-size:15px;line-height:1.65;color:#222;">
                 <strong>A tua conta está a ser emitida.</strong> Recebes o login, o servidor e o
                 código QR por email assim que estiver pronta.
               </p>
               <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#666;">
                 As contas são criadas uma a uma, por isso não é imediato. Como o torneio já
                 arrancou, começas com menos dias do que quem entrou no início — e a classificação
                 é a mesma para todos.
               </p>`
            : `<p style="margin:0;font-size:15px;line-height:1.65;color:#222;">
                 <strong>As credenciais chegam a ${vespera}</strong>, na véspera do arranque — a ti
                 e a toda a gente ao mesmo tempo.
               </p>
               <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#666;">
                 É de propósito: as contas são emitidas uma a uma e ao longo de dias, e abrir as
                 credenciais no momento da inscrição dava a quem entrasse mais cedo semanas de
                 treino na própria conta do torneio. Todos começam no mesmo ponto.
               </p>`
        }
      </div>

      <p style="margin:0 0 6px;font-size:14px;line-height:1.65;color:#444;">Até lá, o que há a saber:</p>
      <ul style="margin:0 0 20px;padding-left:20px;font-size:14px;line-height:1.75;color:#555;">
        <li>Conta de <strong>${Number(t.saldo_inicial).toLocaleString('pt-PT')} USD</strong>, alavancagem ${t.alavancagem ?? 100}.</li>
        <li>É <strong>simulada</strong>: dinheiro virtual, não depositas nada.</li>
        <li>Recebes login, servidor e código QR por email, e ficam também na tua área.</li>
        ${fechamLegivel ? `<li>As inscrições ficam abertas até <strong>${fechamLegivel}</strong> — ainda dá para trazer alguém.</li>` : ''}
        <li>A classificação é pública e actualiza de hora a hora.</li>
      </ul>

      <a href="${site}/mtmfunded/tradingtournament/dashboard" style="display:inline-block;background:#BB8525;color:#fff;text-decoration:none;padding:13px 26px;border-radius:8px;font-weight:600;font-size:15px;">
        Abrir a minha área
      </a>

      <div style="margin:26px 0 0;padding-top:20px;border-top:1px solid #eee;">
        <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#444;">
          <strong>Põe as datas no teu calendário</strong> — leva o arranque do torneio e o dia em
          que as credenciais chegam.
        </p>
        <a href="${linkGoogle}" style="display:inline-block;margin:0 8px 8px 0;border:1px solid #ddd;border-radius:8px;padding:10px 16px;color:#333;text-decoration:none;font-size:13.5px;font-weight:600;">
          Google Calendar
        </a>
        <a href="${linkIcs}" style="display:inline-block;margin:0 0 8px 0;border:1px solid #ddd;border-radius:8px;padding:10px 16px;color:#333;text-decoration:none;font-size:13.5px;font-weight:600;">
          Apple · Outlook (.ics)
        </a>
      </div>

      <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#999;">
        As contas não movimentam dinheiro real e nada disto é aconselhamento financeiro.
        As regras estão em ${site}/mtmfunded/tradingtournament.
      </p>
    </div>
  </div>`

  try {
    const transporter = createMailTransporter()
    await transporter.sendMail({
      from: mailFrom(),
      to: p.email as string,
      subject: arrancou ? `Estás dentro do ${t.nome}` : `Estás inscrito no ${t.nome}`,
      html: prepareBrandedEmailHtml(html),
      attachments: brandedMailAttachments(),
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'falha no envio' }
  }

  await db
    .from('mtm_tournament_participants')
    .update({ confirmacao_enviada_em: new Date().toISOString() })
    .eq('id', p.id)

  return { ok: true, enviados: 1, torneio: t.nome as string }
}
