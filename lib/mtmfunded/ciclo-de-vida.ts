import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { camposDeContaSimulada, camposDeContaMt5 } from './simulado/motor'
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
    .select('id, user_id, tipo, mt5_login, servidor, saldo_inicial, metaapi_account_id, metricas, tournament_id, program_id, mt5_password_cifrada')
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
      // A PASSWORD VIAJA COM A TAREFA. A linha da conta é apagada logo a seguir, e é nela que
      // a password vivia — o agente ia buscá-la ao que já não existia. Sem ela não pode
      // TROCAR a password, que é o que torna a conta inútil; apagá-la do terminal sem trocar
      // deixa-a viva para quem tiver as credenciais antigas.
      mt5_password_cifrada: conta.mt5_password_cifrada ?? null,
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

    /**
     * O pedido de apagar sobrevive à conta — e isso é agora garantido pela BASE DE DADOS.
     *
     * Durante um tempo era este `update` que tentava desligá-lo, e falhava em silêncio: a
     * coluna era NOT NULL. A seguir, o `ON DELETE CASCADE` arrastava a tarefa junto com a
     * conta, e o resultado era o pior dos dois mundos — a conta desaparecia do site e ficava
     * VIVA no MetaTrader, com a password original, sem registo nenhum de que existia.
     *
     * A chave estrangeira passou a `ON DELETE SET NULL`. O `update` fica na mesma, à frente:
     * torna a intenção visível aqui, onde se lê, em vez de a deixar escondida num esquema que
     * ninguém abre. O que o agente precisa é do `mt5_login`, e esse fica.
     */
    await db
      .from('mtm_account_requests')
      .update({ account_id: null })
      .eq('account_id', conta.id)
      .eq('tarefa', 'apagar')
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
  /** A conta da fase seguinte, quando o programa tem mais do que uma. */
  proximaFase?: string | null
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

  /**
   * EM QUE FASE ESTÁ ESTA CONTA.
   *
   * O valor por omissão era a ÚLTIMA fase — e isso fazia com que, num programa de duas,
   * passar a primeira fosse tratado como ter acabado o desafio inteiro: certificado a dizer
   * «Desafio Concluído», conta em «aprovada», e a segunda fase a nunca acontecer.
   *
   * A fase lê-se da própria conta: `metricas.fase` é escrita quando ela é emitida. Para as
   * contas antigas, que não a têm, deduz-se contando quantas contas deste programa o trader
   * já teve — a segunda conta do mesmo programa é a segunda fase. Deduzir é pior do que
   * saber, mas é muito melhor do que assumir que é sempre a última.
   */
  let fase = opts?.fase ?? Number((conta.metricas as Record<string, unknown> | null)?.fase ?? 0)
  if (!fase) {
    const { count } = await db
      .from('mtm_trading_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', conta.user_id as string)
      .eq('program_id', conta.program_id as string)
      .eq('tipo', 'desafio')
    fase = Math.min(Math.max(Number(count ?? 1), 1), deFases)
  }
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
      // A conta da fase que acabou fica APROVADA em qualquer caso: passou. Deixá-la «ativa»
      // quando havia fase seguinte punha o trader a negociar duas contas do mesmo desafio ao
      // mesmo tempo, e a medi-las as duas.
      estado: 'aprovada',
      metricas: { ...((conta.metricas ?? {}) as Record<string, unknown>), fase, faseConcluida: fase },
      updated_at: new Date().toISOString(),
    })
    .eq('id', conta.id)

  /**
   * A CONTA DA FASE SEGUINTE, quando há uma.
   *
   * O email já prometia que ela era emitida; ninguém a emitia. Um desafio de duas fases é
   * duas contas ao longo do tempo — passar a primeira e ficar à espera de nada é o sítio onde
   * o produto deixava de cumprir o que a página vende.
   *
   * Best-effort, como tudo o que vem depois de o certificado estar gravado: o que a pessoa
   * conquistou já está guardado, e uma falha na fila deixa trabalho para a passagem seguinte.
   */
  let proximaFase: string | null = null
  if (!ultima) {
    try {
      const r = await emitirFaseSeguinte(conta.id as string, fase + 1)
      proximaFase = r.accountId ?? null
      if (!r.ok) console.log('[MTMFUNDED] fase seguinte não emitida:', r.motivo)
    } catch (e) {
      console.error('[MTMFUNDED] fase seguinte falhou:', e)
    }
  }

  return { ok: true, codigo, emailEnviado, proximaFase }
}

/**
 * Emite a conta da fase seguinte de um desafio de duas fases.
 *
 * Mesmo programa, mesmo tamanho, mesma pessoa — muda a etiqueta («Desafio fase 2») e a fase
 * guardada nas métricas, que é o que faz a conclusão seguinte saber onde está.
 */
async function emitirFaseSeguinte(
  contaAnteriorId: string,
  fase: number,
): Promise<{ ok: boolean; accountId?: string; motivo?: string }> {
  const db = getSupabaseAdmin()

  const { data: anterior } = await db
    .from('mtm_trading_accounts')
    .select('user_id, program_id, saldo_inicial, alavancagem, servidor, motor')
    .eq('id', contaAnteriorId)
    .maybeSingle()
  if (!anterior?.user_id || !anterior.program_id) return { ok: false, motivo: 'conta sem dono ou sem programa' }

  // Idempotência: se a conta desta fase já existe, não se emite outra. O ciclo de leitura
  // corre de hora a hora e uma repetição dava duas contas da mesma fase à mesma pessoa.
  const { data: contas } = await db
    .from('mtm_trading_accounts')
    .select('id, metricas')
    .eq('user_id', anterior.user_id)
    .eq('program_id', anterior.program_id)
    .eq('tipo', 'desafio')
  if ((contas ?? []).some((c) => Number((c.metricas as Record<string, unknown> | null)?.fase ?? 0) === fase)) {
    return { ok: false, motivo: `a conta da fase ${fase} já existe` }
  }

  const { data: perfil } = await db
    .from('profiles')
    .select('full_name, email, phone, birth_date, country')
    .eq('id', anterior.user_id)
    .maybeSingle()
  if (!perfil?.email) return { ok: false, motivo: 'perfil sem email' }

  const { data: programa } = await db
    .from('mtm_funded_programs')
    .select('fases')
    .eq('id', anterior.program_id)
    .maybeSingle()

  const { data: nova, error } = await db
    .from('mtm_trading_accounts')
    .insert({
      user_id: anterior.user_id,
      tipo: 'desafio',
      program_id: anterior.program_id,
      saldo_inicial: anterior.saldo_inicial,
      alavancagem: anterior.alavancagem ?? 100,
      // A fase seguinte herda o motor da anterior: um desafio não muda de casa a meio.
      ...(anterior.motor === 'sim'
        ? await camposDeContaSimulada(Number(anterior.saldo_inicial ?? 0))
        : camposDeContaMt5(anterior.servidor as string | null)),
      metricas: { fase },
    })
    .select('id')
    .single()
  if (error || !nova) return { ok: false, motivo: 'não foi possível criar a conta' }

  const partes = String(perfil.full_name ?? '').trim().split(/\s+/).filter(Boolean)
  const { apelidoComTipo } = await import('./metaapi')

  if (anterior.motor !== 'sim') await db.from('mtm_account_requests').insert({
    account_id: nova.id,
    tarefa: 'criar',
    primeiro_nome: partes[0] || 'Trader',
    sobrenome: apelidoComTipo(partes.length > 1 ? partes[partes.length - 1] : 'MTM', 'desafio', {
      fases: Number(programa?.fases ?? 2),
      fase,
    }),
    email: perfil.email as string,
    telefone: String(perfil.phone ?? '').replace(/^\+\d{1,4}/, '').replace(/\D/g, '') || null,
    indicativo: (String(perfil.phone ?? '').match(/^\+\d{1,4}/) ?? ['+351'])[0],
    pais: (perfil.country as string) || 'PT',
    data_nascimento: (perfil.birth_date as string) || null,
    servidor: anterior.servidor ?? 'TheTradingMaster-Live',
    tipo_conta: 'ECN',
    deposito: Number(anterior.saldo_inicial ?? 0),
    alavancagem: Number(anterior.alavancagem ?? 100),
    estado: 'em_fila',
  })

  return { ok: true, accountId: nova.id }
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
              ? 'Segue em anexo o teu certificado.'
              : 'Segue em anexo o certificado desta fase. A conta da fase seguinte é emitida e recebes os dados por email.'
          }
        </p>
      </div>

      ${
        input.ultima
          ? `
      <div style="margin:22px 0;padding:18px 20px;background:#f4f8f5;border:1px solid #cfe3d6;border-radius:12px;">
        <p style="margin:0;font-size:16px;line-height:1.6;color:#1f3d2e;">
          <strong>Falta um passo: assinar o contrato.</strong>
        </p>
        <p style="margin:10px 0 0;font-size:14px;line-height:1.65;color:#41604f;">
          Passar o desafio dá-te o direito; o contrato é o que te torna trader financiado. É ao
          assiná-lo que a tua <strong>conta financiada</strong> é emitida — e é ele que abre os
          levantamentos.
        </p>
        <p style="margin:10px 0 0;font-size:13px;line-height:1.6;color:#6b8577;">
          Confirmas lá o teu nome completo e a data de nascimento; é preciso ter 18 anos ou mais.
        </p>
        <a href="${site}/mtmfunded/tradingtournament/dashboard?tab=contratos" style="display:inline-block;margin-top:14px;background:#2e7d5b;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;">
          Assinar o contrato
        </a>
      </div>`
          : ''
      }

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

// ── a conta financiada ───────────────────────────────────────────────────────

export interface ResultadoFinanciada {
  ok: boolean
  accountId?: string
  motivo?: string
}

/**
 * A CONTA FINANCIADA, emitida quando o contrato é assinado — e só então.
 *
 * A ordem importa e é esta de propósito: passar o desafio dá direito a ser trader financiado,
 * assinar o contrato é o que o torna um. Emitir a conta antes da assinatura era entregar uma
 * conta de capital real da MTM a alguém que ainda não se vinculou a regra nenhuma sobre o que
 * pode fazer com ela — e depois pedir a assinatura com a conta já na mão não é pedir nada.
 *
 * O TAMANHO vem do desafio que a pessoa passou. Não se pergunta: uma conta financiada maior do
 * que aquilo que foi provado é risco que ninguém decidiu correr.
 *
 * É idempotente. Assinar duas vezes o mesmo contrato — recarregar a página, carregar duas
 * vezes no botão — não pode dar duas contas financiadas à mesma pessoa.
 */
export async function emitirContaFinanciada(userId: string): Promise<ResultadoFinanciada> {
  const db = getSupabaseAdmin()

  const { data: jaTem } = await db
    .from('mtm_trading_accounts')
    .select('id')
    .eq('user_id', userId)
    .in('tipo', ['financiada', 'funded'])
    .not('estado', 'in', '("quebrada","cancelada")')
    .limit(1)
    .maybeSingle()
  if (jaTem) return { ok: false, motivo: 'já tem conta financiada' }

  // O desafio que foi passado — `aprovada` é o estado que `concluirDesafio` deixa na última
  // fase. Sem um desafio aprovado não há nada a financiar.
  const { data: aprovado } = await db
    .from('mtm_trading_accounts')
    .select('id, saldo_inicial, program_id, motor')
    .eq('user_id', userId)
    .eq('tipo', 'desafio')
    .eq('estado', 'aprovada')
    .order('saldo_inicial', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!aprovado) return { ok: false, motivo: 'não há desafio concluído' }

  const { data: perfil } = await db
    .from('profiles')
    .select('full_name, email, phone, birth_date, country')
    .eq('id', userId)
    .maybeSingle()
  if (!perfil?.email) return { ok: false, motivo: 'perfil sem email' }

  const saldo = Number(aprovado.saldo_inicial ?? 0)

  const { data: conta, error } = await db
    .from('mtm_trading_accounts')
    .insert({
      user_id: userId,
      tipo: 'financiada',
      program_id: aprovado.program_id,
      saldo_inicial: saldo,
      alavancagem: 100,
      ...(aprovado.motor === 'sim' ? await camposDeContaSimulada(saldo) : camposDeContaMt5()),
    })
    .select('id')
    .single()
  if (error || !conta) return { ok: false, motivo: 'não foi possível criar a conta' }

  const partes = String(perfil.full_name ?? '').trim().split(/\s+/).filter(Boolean)
  const { apelidoComTipo } = await import('./metaapi')

  if (aprovado.motor !== 'sim') await db.from('mtm_account_requests').insert({
    account_id: conta.id,
    tarefa: 'criar',
    primeiro_nome: partes[0] || 'Trader',
    sobrenome: apelidoComTipo(partes.length > 1 ? partes[partes.length - 1] : 'MTM', 'financiada'),
    email: perfil.email as string,
    telefone: String(perfil.phone ?? '').replace(/^\+\d{1,4}/, '').replace(/\D/g, '') || null,
    indicativo: (String(perfil.phone ?? '').match(/^\+\d{1,4}/) ?? ['+351'])[0],
    pais: (perfil.country as string) || 'PT',
    data_nascimento: (perfil.birth_date as string) || null,
    servidor: 'TheTradingMaster-Live',
    tipo_conta: 'ECN',
    deposito: saldo,
    alavancagem: 100,
    estado: 'em_fila',
  })

  return { ok: true, accountId: conta.id }
}

// ── o ciclo do levantamento ──────────────────────────────────────────────────

export interface ResultadoRenovacao {
  ok: boolean
  contaAntiga?: string
  contaNova?: string
  motivo?: string
}

/**
 * O CICLO FECHA-SE A CADA LEVANTAMENTO: paga-se, e a conta é substituída por uma igual.
 *
 * Porquê substituir em vez de continuar na mesma conta: o levantamento tira o lucro, e uma
 * conta que fica com o saldo inicial depois de ter estado acima dele tem um histórico que já
 * não corresponde ao que ela é. O drawdown máximo passa a ser medido contra um pico que foi
 * levantado, a consistência conta dias de um ciclo que acabou, e a almofada de 3% teria de ser
 * recalculada a partir de um ponto que não é o início. Uma conta nova começa limpa, e é isso
 * que faz o ciclo seguinte ser medível pelas mesmas regras que o primeiro.
 *
 * A ORDEM importa e é a mesma da desactivação: PAUSA, troca a password, apaga do MetaTrader,
 * e só então emite a nova. Trocar a password antes de apagar é o que garante que a conta
 * antiga deixa de servir mesmo que alguém tenha as credenciais no telemóvel — apagar sem
 * trocar deixa-a viva para quem as tiver.
 *
 * A conta nova é IDÊNTICA: mesmo tamanho, mesmo programa. Não é uma promoção nem um castigo —
 * é o mesmo acordo a recomeçar.
 */
export async function renovarContaAposLevantamento(
  accountId: string,
  opts?: { levantamentoId?: string; valorUsd?: number },
): Promise<ResultadoRenovacao> {
  const db = getSupabaseAdmin()

  const { data: conta } = await db
    .from('mtm_trading_accounts')
    .select('id, user_id, tipo, mt5_login, servidor, saldo_inicial, alavancagem, program_id, metaapi_account_id, mt5_password_cifrada, metricas, motor')
    .eq('id', accountId)
    .maybeSingle()
  if (!conta) return { ok: false, motivo: 'conta não encontrada' }
  if (conta.tipo !== 'financiada' && conta.tipo !== 'funded') {
    return { ok: false, motivo: 'só contas financiadas entram neste ciclo' }
  }

  const { data: perfil } = conta.user_id
    ? await db
        .from('profiles')
        .select('full_name, email, phone, birth_date, country')
        .eq('id', conta.user_id)
        .maybeSingle()
    : { data: null }
  if (!perfil?.email) return { ok: false, motivo: 'perfil sem email' }

  const saldo = Number(conta.saldo_inicial ?? 0)
  const nome = String(perfil.full_name ?? '').trim()
  const partes = nome.split(/\s+/).filter(Boolean)

  /**
   * 1. PAUSA. Antes de tudo o resto.
   *
   * Entre pagar e a conta antiga sair do MetaTrader passam minutos — o agente trabalha uma
   * conta de cada vez. Nesses minutos a conta continuaria a negociar, e o que negociasse
   * ficava num ciclo que já foi pago e num histórico que vai ser apagado.
   */
  await db
    .from('mtm_trading_accounts')
    .update({
      estado: 'expirada',
      metricas: {
        ...((conta.metricas ?? {}) as Record<string, unknown>),
        pausadaEm: new Date().toISOString(),
        pausadaPorque: 'levantamento pago — ciclo terminado',
        levantamentoId: opts?.levantamentoId ?? null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', conta.id)

  // 2. A nova, ANTES de destruir a antiga.
  //
  // Se a emissão falhar, o trader fica com a conta antiga pausada — recuperável — em vez de
  // ficar sem conta nenhuma. A ordem inversa transformava uma falha de fila numa pessoa sem
  // conta e sem forma de negociar o ciclo que acabou de conquistar.
  const { data: nova, error: erroNova } = await db
    .from('mtm_trading_accounts')
    .insert({
      user_id: conta.user_id,
      tipo: 'financiada',
      program_id: conta.program_id,
      saldo_inicial: saldo,
      alavancagem: conta.alavancagem ?? 100,
      ...(conta.motor === 'sim' ? await camposDeContaSimulada(saldo) : camposDeContaMt5(conta.servidor as string | null)),
      metricas: {
        cicloAnterior: conta.mt5_login ?? null,
        renovadaEm: new Date().toISOString(),
      },
    })
    .select('id')
    .single()
  if (erroNova || !nova) {
    // Desfaz a pausa: sem conta nova, a antiga é a única que ele tem.
    await db.from('mtm_trading_accounts').update({ estado: 'ativa' }).eq('id', conta.id)
    return { ok: false, motivo: `não foi possível criar a conta nova: ${erroNova?.message}` }
  }

  const { apelidoComTipo } = await import('./metaapi')
  if (conta.motor !== 'sim') await db.from('mtm_account_requests').insert({
    account_id: nova.id,
    tarefa: 'criar',
    primeiro_nome: partes[0] || 'Trader',
    sobrenome: apelidoComTipo(partes.length > 1 ? partes[partes.length - 1] : 'MTM', 'financiada'),
    email: perfil.email as string,
    telefone: String(perfil.phone ?? '').replace(/^\+\d{1,4}/, '').replace(/\D/g, '') || null,
    indicativo: (String(perfil.phone ?? '').match(/^\+\d{1,4}/) ?? ['+351'])[0],
    pais: (perfil.country as string) || 'PT',
    data_nascimento: (perfil.birth_date as string) || null,
    servidor: conta.servidor ?? 'TheTradingMaster-Live',
    tipo_conta: 'ECN',
    deposito: saldo,
    alavancagem: Number(conta.alavancagem ?? 100),
    estado: 'em_fila',
  })

  // 3. E agora a antiga sai: MetaApi, depois password trocada e removida do MetaTrader.
  if (conta.metaapi_account_id) {
    try {
      const { undeployMetaApiAccount, deleteMetaApiAccount } = await import('@/lib/mtmcopy/metaapi-provision')
      await undeployMetaApiAccount(conta.metaapi_account_id as string).catch(() => undefined)
      await deleteMetaApiAccount(conta.metaapi_account_id as string)
    } catch (e) {
      console.error('[MTMFUNDED] renovação: MetaApi não libertou a conta antiga:', e)
    }
  }

  if (conta.mt5_login) {
    await db.from('mtm_account_requests').insert({
      account_id: conta.id,
      tarefa: 'apagar',
      mt5_login: conta.mt5_login,
      // A password viaja com a tarefa: a linha da conta é apagada a seguir, e sem ela o agente
      // não pode trocar a password — que é o que torna a conta antiga inútil.
      mt5_password_cifrada: conta.mt5_password_cifrada ?? null,
      primeiro_nome: 'Ciclo',
      sobrenome: 'Terminado',
      email: perfil.email as string,
      servidor: conta.servidor ?? 'TheTradingMaster-Live',
      tipo_conta: 'ECN',
      deposito: saldo,
      alavancagem: Number(conta.alavancagem ?? 100),
      estado: 'em_fila',
    })
  }

  await enviarEmailDeRenovacao({
    para: perfil.email as string,
    nome: partes[0] || 'Trader',
    saldo,
    loginAntigo: (conta.mt5_login as string) ?? '—',
    valorUsd: opts?.valorUsd ?? null,
  }).catch(() => undefined)

  return { ok: true, contaAntiga: (conta.mt5_login as string) ?? undefined, contaNova: nova.id }
}

async function enviarEmailDeRenovacao(input: {
  para: string
  nome: string
  saldo: number
  loginAntigo: string
  valorUsd: number | null
}): Promise<void> {
  const site = getSiteUrl()
  const logo = getEmailLogoSrc()

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;">
    <div style="text-align:center;padding:28px 0;"><img src="${logo}" alt="MTM Funded" width="160" style="max-width:160px;" /></div>
    <div style="background:#fff;border-radius:16px;padding:28px;">
      <h1 style="margin:0;font-size:22px;color:#111;">Levantamento feito. Ciclo novo a caminho.</h1>

      <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#444;">
        Olá ${input.nome}, ${
          input.valorUsd
            ? `o teu levantamento de <strong>${input.valorUsd.toLocaleString('pt-PT')} USD</strong> foi pago para a tua conta da PU Prime.`
            : 'o teu levantamento foi pago para a tua conta da PU Prime.'
        }
      </p>

      <div style="margin:22px 0;padding:18px 20px;background:#faf6ec;border:1px solid #eadcb8;border-radius:12px;">
        <p style="margin:0;font-size:15px;line-height:1.6;color:#333;">
          A conta <strong>${input.loginAntigo}</strong> fecha aqui, e estamos a emitir-te uma
          conta financiada <strong>nova e igual</strong> — ${input.saldo.toLocaleString('pt-PT')} USD,
          as mesmas regras. Recebes as credenciais por email assim que estiver pronta.
        </p>
      </div>

      <p style="margin:0 0 18px;font-size:14px;line-height:1.65;color:#555;">
        Porque é que não continuas na mesma conta: o levantamento tira o lucro, e uma conta que
        volta ao saldo inicial fica com um histórico que já não a descreve — o drawdown passaria
        a ser medido contra um pico que já levantaste. A conta nova começa limpa, e o ciclo
        seguinte é avaliado pelas mesmas regras que este.
      </p>

      <p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:#666;">
        Não negoceies na conta antiga a partir de agora — ela é encerrada e a palavra-passe
        muda. O que lá acontecer depois deste email não conta para nada.
      </p>

      <a href="${site}/mtmfunded/tradingtournament/dashboard" style="display:inline-block;background:#BB8525;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;">
        Abrir a minha área
      </a>
    </div>
  </div>`

  const transporter = createMailTransporter()
  await transporter.sendMail({
    from: mailFrom(),
    to: input.para,
    subject: 'Levantamento pago — a tua conta nova está a caminho',
    html: prepareBrandedEmailHtml(html),
    attachments: brandedMailAttachments(),
  })
}
