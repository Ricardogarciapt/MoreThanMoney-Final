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
 * O QUE ACONTECE A UMA CONTA QUANDO ELA ACABA — por incumprimento ou por mérito.
 *
 * Os dois desfechos partilham a mesma exigência: a pessoa tem de saber, por escrito, o que
 * aconteceu e porquê. Uma conta que deixa de contar sem explicação é indistinguível de uma
 * avaria, e quem a recebe assume o pior.
 *
 * E partilham a ordem das operações. AVISA-SE PRIMEIRO, apaga-se depois. Pela ordem inversa,
 * um erro no envio deixava a pessoa com a conta apagada e sem nunca saber porquê — e já não
 * há de onde tirar os dados para lhe explicar.
 */

const MOTIVOS: Record<string, string> = {
  perda_diaria: 'foi atingido o limite de perda diária',
  perda_maxima: 'foi atingida a perda máxima total',
  consistencia: 'um único dia passou o limite de concentração de lucro',
  dias_minimos: 'o prazo terminou sem os dias mínimos de negociação',
  tempo_minimo: 'foram abertas e fechadas operações abaixo do tempo mínimo',
  risco_maximo: 'foi excedido o risco máximo por operação',
  posicoes_maximas: 'foram abertas mais posições do que o permitido no mesmo par e direcção',
  hedge: 'foram detectadas posições opostas no mesmo instrumento',
  prazo: 'o prazo da conta terminou',
}

export function explicarMotivo(motivo: string | null | undefined): string {
  const chave = String(motivo ?? '').toLowerCase()
  return MOTIVOS[chave] ?? String(motivo ?? 'foi quebrada uma regra do programa')
}

// ── quebra ───────────────────────────────────────────────────────────────────

export interface ResultadoQuebra {
  ok: boolean
  emailEnviado: boolean
  metaapiApagada: boolean
  vpsAgendado: boolean
  erro?: string
}

/**
 * Conta quebrada: avisa, tira-a da MetaApi, manda apagá-la no MT5 e remove-a da base.
 *
 * A ordem não é arbitrária:
 *  1. email — enquanto ainda há dados para explicar o que aconteceu;
 *  2. MetaApi — enquanto ainda se sabe o id, e para deixar de pagar por uma conta morta;
 *  3. fila do VPS — para o agente lhe trocar a password e a apagar do terminal;
 *  4. base de dados — por último, porque é o que torna tudo o resto irreversível.
 */
export async function quebrarConta(
  accountId: string,
  motivo: string,
  opts?: { apagar?: boolean },
): Promise<ResultadoQuebra> {
  const db = getSupabaseAdmin()
  const out: ResultadoQuebra = { ok: false, emailEnviado: false, metaapiApagada: false, vpsAgendado: false }

  const { data: conta } = await db
    .from('mtm_trading_accounts')
    .select('id, user_id, tipo, mt5_login, servidor, saldo_inicial, metaapi_account_id, metricas, tournament_id, program_id')
    .eq('id', accountId)
    .maybeSingle()
  if (!conta) return { ...out, erro: 'conta não encontrada' }

  const { data: perfil } = conta.user_id
    ? await db.from('profiles').select('full_name, email').eq('id', conta.user_id).maybeSingle()
    : { data: null }

  const m = (conta.metricas ?? {}) as Record<string, unknown>
  const resultadoPct = typeof m.resultadoPct === 'number' ? m.resultadoPct : null

  // ── 1. o email, primeiro ──────────────────────────────────────────────────
  if (perfil?.email) {
    out.emailEnviado = await enviarEmailDeQuebra({
      para: perfil.email as string,
      nome: (perfil.full_name as string) || 'Trader',
      login: (conta.mt5_login as string) ?? '—',
      tipo: conta.tipo as string,
      saldo: Number(conta.saldo_inicial ?? 0),
      motivo,
      resultadoPct,
    }).catch(() => false)
  }

  // ── 2. fora da MetaApi ────────────────────────────────────────────────────
  if (conta.metaapi_account_id) {
    try {
      const { undeployMetaApiAccount, deleteMetaApiAccount } = await import('@/lib/mtmcopy/metaapi-provision')
      // Undeploy antes de apagar: a MetaApi recusa apagar uma conta ainda implantada.
      await undeployMetaApiAccount(conta.metaapi_account_id as string).catch(() => undefined)
      out.metaapiApagada = await deleteMetaApiAccount(conta.metaapi_account_id as string)
    } catch (e) {
      console.error('[MTMFUNDED] falhou a apagar da MetaApi:', e)
    }
  }

  // ── 3. o agente do VPS trata do MetaTrader ────────────────────────────────
  /**
   * Trocar a password e apagar a conta do terminal, no VPS.
   *
   * Trocar a password é o que garante que a conta deixa de ser usada, mesmo que alguém ainda
   * tenha as credenciais antigas no telemóvel. Apagá-la da lista do terminal é o que impede a
   * árvore do Navegador de crescer sem fim — e essa árvore é por onde o próprio agente se
   * orienta para criar as contas seguintes.
   */
  if (conta.mt5_login) {
    const { error } = await db.from('mtm_account_requests').insert({
      account_id: conta.id,
      tarefa: 'apagar',
      mt5_login: conta.mt5_login,
      primeiro_nome: 'Conta',
      sobrenome: 'Quebrada',
      email: (perfil?.email as string) ?? 'sem-email@morethanmoney.pt',
      servidor: (conta.servidor as string) ?? 'TheTradingMaster-Live',
      tipo_conta: 'ECN',
      deposito: Number(conta.saldo_inicial ?? 0),
      estado: 'em_fila',
    })
    out.vpsAgendado = !error
  }

  // ── 4. a base de dados, por último ────────────────────────────────────────
  if (opts?.apagar !== false) {
    // O participante do torneio fica, com a conta desligada: apagá-lo faria desaparecer da
    // classificação alguém que competiu — e a classificação tem de mostrar quem quebrou.
    await db
      .from('mtm_tournament_participants')
      .update({ estado: 'quebrado', account_id: null, updated_at: new Date().toISOString() })
      .eq('account_id', conta.id)

    // O pedido de apagar sobrevive à conta: se a linha desaparecesse com ela, o agente
    // ficaria sem a tarefa e a conta continuaria viva no MetaTrader para sempre.
    await db.from('mtm_account_requests').update({ account_id: null }).eq('account_id', conta.id).eq('tarefa', 'apagar')
    await db.from('mtm_account_requests').delete().eq('account_id', conta.id).neq('tarefa', 'apagar')
    await db.from('mtm_trading_accounts').delete().eq('id', conta.id)
  } else {
    await db
      .from('mtm_trading_accounts')
      .update({ estado: 'quebrada', quebrou_regra: motivo, quebrada_em: new Date().toISOString() })
      .eq('id', conta.id)
  }

  out.ok = true
  return out
}

async function enviarEmailDeQuebra(input: {
  para: string
  nome: string
  login: string
  tipo: string
  saldo: number
  motivo: string
  resultadoPct: number | null
}): Promise<boolean> {
  const site = getSiteUrl()
  const logo = getEmailLogoSrc()
  const explicacao = explicarMotivo(input.motivo)
  const oQueEra =
    input.tipo === 'torneio' ? 'de torneio' : input.tipo === 'desafio' ? 'de avaliação' : 'financiada'

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;">
    <div style="text-align:center;padding:28px 0;"><img src="${logo}" alt="MTM Funded" width="160" style="max-width:160px;" /></div>
    <div style="background:#fff;border-radius:16px;padding:28px;">
      <h1 style="margin:0;font-size:22px;color:#111;">A tua conta ${oQueEra} foi encerrada</h1>
      <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#444;">
        Olá ${input.nome}, a conta <strong>${input.login}</strong>, de
        ${Number(input.saldo).toLocaleString('pt-PT')} USD, deixou de cumprir as regras do programa.
      </p>

      <div style="margin:20px 0;padding:16px 18px;background:#fdf3f3;border:1px solid #f0d5d5;border-radius:10px;">
        <p style="margin:0;font-size:13px;color:#8a3b3b;text-transform:uppercase;letter-spacing:1px;">Motivo</p>
        <p style="margin:6px 0 0;font-size:15px;color:#333;line-height:1.5;">${explicacao}.</p>
      </div>

      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#444;">
        A partir de agora, <strong>a estatística desta conta deixa de ser cotada</strong>: sai da
        classificação e não conta para nenhum resultado. A conta foi desactivada no MetaTrader,
        e as credenciais antigas deixam de servir.
      </p>

      ${input.resultadoPct != null ? `
      <p style="margin:0 0 16px;font-size:14px;color:#666;">
        Resultado no momento em que foi encerrada:
        <strong style="color:${input.resultadoPct >= 0 ? '#2e7d5b' : '#b3392f'};">
          ${input.resultadoPct > 0 ? '+' : ''}${input.resultadoPct.toFixed(2)}%
        </strong>
      </p>` : ''}

      <div style="margin:22px 0;padding:16px 18px;background:#faf6ec;border:1px solid #eadcb8;border-radius:10px;">
        <p style="margin:0;font-size:15px;color:#333;line-height:1.6;">
          Quebrar uma conta faz parte de aprender a geri-la, e não te impede de voltar. Podes
          inscrever-te no próximo torneio ou começar um desafio novo quando quiseres.
        </p>
      </div>

      <a href="${site}/mtmfunded" style="display:inline-block;background:#BB8525;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;">
        Ver os programas
      </a>

      <p style="margin:22px 0 0;font-size:12px;color:#999;line-height:1.5;">
        Se achas que houve um engano, responde a este email — as métricas ficam guardadas e
        podemos rever o que aconteceu.
      </p>
    </div>
  </div>`

  try {
    const transporter = createMailTransporter()
    await transporter.sendMail({
      from: mailFrom(),
      to: input.para,
      subject: `A tua conta ${input.login} foi encerrada · MTM Funded`,
      html: prepareBrandedEmailHtml(html),
      attachments: brandedMailAttachments(),
    })
    return true
  } catch (e) {
    console.error('[MTMFUNDED] email de quebra falhou:', e)
    return false
  }
}

// ── conclusão ────────────────────────────────────────────────────────────────

export interface ResultadoConclusao {
  ok: boolean
  codigo?: string
  emailEnviado: boolean
  erro?: string
}

/**
 * Desafio concluído: emite o certificado e manda-o, com o nome do desafio no documento.
 *
 * A `fase` distingue «passaste a primeira fase» de «acabaste o desafio». São coisas
 * diferentes, e um email que trate uma como a outra é um email que promete o que não tem.
 */
export async function concluirDesafio(
  accountId: string,
  opts?: { fase?: number; deFases?: number; resultadoPct?: number | null },
): Promise<ResultadoConclusao> {
  const db = getSupabaseAdmin()
  const { data: conta } = await db
    .from('mtm_trading_accounts')
    .select('id, user_id, tipo, saldo_inicial, program_id, metricas')
    .eq('id', accountId)
    .maybeSingle()
  if (!conta) return { ok: false, emailEnviado: false, erro: 'conta não encontrada' }

  const { data: programa } = conta.program_id
    ? await db.from('mtm_funded_programs').select('nome, fases').eq('id', conta.program_id).maybeSingle()
    : { data: null }

  const { data: perfil } = conta.user_id
    ? await db.from('profiles').select('full_name, email').eq('id', conta.user_id).maybeSingle()
    : { data: null }

  const nome = (perfil?.full_name as string) || 'Trader'
  const deFases = opts?.deFases ?? Number(programa?.fases ?? 1)
  const fase = opts?.fase ?? deFases
  const ultima = fase >= deFases

  // O nome do desafio entra no certificado. «Desafio concluído» sozinho não diz QUAL.
  const nomeDesafio = (programa?.nome as string)
    || `Desafio ${Number(conta.saldo_inicial ?? 0).toLocaleString('pt-PT')} USD`
  // O TÍTULO diz o que aconteceu; a linha de baixo diz em QUE desafio. Juntar as duas coisas
  // na mesma frase dava «concluiu Desafio 10K — desafio concluído».
  const titulo = ultima ? 'Desafio Concluído' : `Fase ${fase} de ${deFases} concluída`
  const prova = nomeDesafio

  const { gerarCertificadoPdf, gerarCodigo } = await import('./certificado')
  const codigo = gerarCodigo('desafio')
  const resultadoPct = opts?.resultadoPct ?? null

  let pdf: Buffer
  try {
    pdf = await gerarCertificadoPdf({
      tipo: 'desafio',
      nome,
      prova,
      titulo,
      resultadoPct,
      codigo,
    })
  } catch (e) {
    return { ok: false, emailEnviado: false, erro: `PDF falhou: ${String(e).slice(0, 120)}` }
  }

  // Grava-se ANTES de enviar: um certificado que existe e não foi enviado reenvia-se; um que
  // foi enviado e não existe não se valida, e é o pior dos dois mundos.
  const { error } = await db.from('mtm_certificates').insert({
    user_id: conta.user_id,
    account_id: conta.id,
    tipo: 'desafio',
    codigo,
    nome,
    detalhe: { desafio: nomeDesafio, fase, deFases, resultadoPct, saldo: conta.saldo_inicial },
  })
  if (error) return { ok: false, emailEnviado: false, erro: error.message }

  let emailEnviado = false
  if (perfil?.email) {
    emailEnviado = await enviarEmailDeConclusao({
      para: perfil.email as string,
      nome,
      desafio: nomeDesafio,
      fase,
      deFases,
      ultima,
      resultadoPct,
      codigo,
      pdf,
    }).catch(() => false)
  }

  await db
    .from('mtm_trading_accounts')
    .update({
      estado: ultima ? 'aprovada' : 'ativa',
      metricas: { ...((conta.metricas ?? {}) as Record<string, unknown>), faseConcluida: fase },
      updated_at: new Date().toISOString(),
    })
    .eq('id', conta.id)

  return { ok: true, codigo, emailEnviado }
}

async function enviarEmailDeConclusao(input: {
  para: string
  nome: string
  desafio: string
  fase: number
  deFases: number
  ultima: boolean
  resultadoPct: number | null
  codigo: string
  pdf: Buffer
}): Promise<boolean> {
  const site = getSiteUrl()
  const logo = getEmailLogoSrc()

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;">
    <div style="text-align:center;padding:28px 0;"><img src="${logo}" alt="MTM Funded" width="160" style="max-width:160px;" /></div>
    <div style="background:#fff;border-radius:16px;padding:28px;">
      <h1 style="margin:0;font-size:22px;color:#111;">
        ${input.ultima ? 'Desafio concluído' : `Fase ${input.fase} concluída`}
      </h1>
      <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#444;">
        Parabéns, ${input.nome}. ${
          input.ultima
            ? `Concluíste o <strong>${input.desafio}</strong> dentro das regras publicadas.`
            : `Passaste a fase ${input.fase} de ${input.deFases} do <strong>${input.desafio}</strong>.`
        }
      </p>

      ${input.resultadoPct != null ? `
      <p style="margin:16px 0 0;font-size:15px;color:#444;">
        Resultado: <strong style="color:#2e7d5b;">+${input.resultadoPct.toFixed(2)}%</strong>
      </p>` : ''}

      <div style="margin:22px 0;padding:16px 18px;background:#faf6ec;border:1px solid #eadcb8;border-radius:10px;">
        <p style="margin:0;font-size:15px;color:#333;line-height:1.6;">
          ${
            input.ultima
              ? 'Segue em anexo o teu certificado. O passo seguinte é o contrato de trader financiado, na tua área — é o que abre os levantamentos.'
              : 'Segue em anexo o certificado desta fase. A conta da fase seguinte é emitida e recebes os dados por email.'
          }
        </p>
      </div>

      <p style="margin:0 0 18px;font-size:13px;color:#666;">
        Código do certificado: <strong style="font-family:monospace;">${input.codigo}</strong> ·
        <a href="${site}/mtmfunded/certificates/${input.codigo}" style="color:#BB8525;">verificar</a>
      </p>

      <a href="${site}/mtmfunded/tradingtournament/dashboard" style="display:inline-block;background:#BB8525;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;">
        Abrir a minha área
      </a>
    </div>
  </div>`

  try {
    const transporter = createMailTransporter()
    await transporter.sendMail({
      from: mailFrom(),
      to: input.para,
      subject: input.ultima
        ? `Concluíste o ${input.desafio} · MTM Funded`
        : `Fase ${input.fase} concluída · ${input.desafio}`,
      html: prepareBrandedEmailHtml(html),
      attachments: [
        ...brandedMailAttachments(),
        { filename: `${input.codigo}.pdf`, content: input.pdf },
      ],
    })
    return true
  } catch (e) {
    console.error('[MTMFUNDED] email de conclusão falhou:', e)
    return false
  }
}
