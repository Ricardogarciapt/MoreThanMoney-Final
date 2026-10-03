/**
 * O caminho de quem só quer o MTM AUTO.
 *
 * Nem toda a gente que chega quer a comunidade. Há quem queira uma coisa só: uma app que copia os
 * sinais para a conta dele e o deixa em paz. Tratar essas duas pessoas da mesma maneira perde as
 * duas — a primeira acha que lhe estão a vender software, a segunda acha que lhe estão a vender
 * um curso.
 *
 * Por isso o funil pergunta cedo e ramifica:
 *
 *   ECOSSISTEMA → comunidade, formação, sessões ao vivo, sinais nos grupos (funil que já existia)
 *   MTM AUTO    → abrir corretora → validar → instalar a app → ligar a conta → seguir estratégia
 *
 * Este ficheiro é o segundo caminho, passo a passo, com a validação de corretora a ser a MESMA do
 * gate (não há dois validadores) e a app a ser explicada como se explica a alguém que nunca abriu
 * uma conta de trading: uma coisa de cada vez, e o que acontece a seguir.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { PUPRIME_LINK, MIN_DEPOSIT } from '@/lib/telegram-broker-gate'

// Domínio da marca: é isto que vai nas mensagens do funil e no que as pessoas reencaminham.
export const MTMAUTO_APP_WEB = 'https://www.morethanmoney.pt/mtmautoapp'
export const MTMAUTO_TESTFLIGHT = 'https://testflight.apple.com/join/JzUY538h'
export const MTMAUTO_PRECO = '24,99 €/mês'

export type Interesse = 'ecossistema' | 'mtmauto' | 'indeciso'
export type PassoMtmAuto = 'corretora' | 'validado' | 'app_instalada' | 'a_operar'

/** A pergunta que separa os dois caminhos. Duas opções, sem rodeios. */
export function perguntaDeCaminho(nome?: string | null): { texto: string; teclado: unknown } {
  const n = nome ? ` ${nome}` : ''
  return {
    texto:
      `👋 Olá${n}! Para não te fazer perder tempo, diz-me só uma coisa:\n\n` +
      `🤖 <b>Quero a app MTM Auto</b> — os sinais entram sozinhos na minha conta, eu não faço nada.\n` +
      `🌍 <b>Quero conhecer a MoreThanMoney</b> — comunidade, formação, sessões ao vivo e os grupos de sinais.\n\n` +
      `Qual das duas? (podes ter as duas depois — começa pela que te interessa hoje)`,
    teclado: {
      inline_keyboard: [
        [{ text: '🤖 Só a app MTM Auto', callback_data: 'caminho:mtmauto' }],
        [{ text: '🌍 Conhecer a MoreThanMoney', callback_data: 'caminho:ecossistema' }],
      ],
    },
  }
}

/** Passo 1 — o que é, quanto custa, e como não custa nada. */
export function mtmAutoIntro(): { texto: string; teclado: unknown } {
  return {
    texto:
      `🤖 <b>MTM Auto — como funciona</b>\n\n` +
      `Escolhes as estratégias que queres seguir. Quando sai um sinal, a app abre a ordem <b>na TUA conta</b>, ` +
      `com o <b>teu risco</b>, e acompanha-a até ao fim: break-even, saídas parciais nos alvos e trailing.\n\n` +
      `Não somos corretora e não tocamos no teu dinheiro — a conta é tua, no teu broker.\n\n` +
      `💳 <b>${MTMAUTO_PRECO}</b> — ou <b>0 €</b>: quem opera numa conta real da PU Prime não paga a mensalidade.\n\n` +
      `Queres o caminho gratuito?`,
    teclado: {
      inline_keyboard: [
        [{ text: '✅ Sim, quero sem pagar mensalidade', callback_data: 'mtmauto:corretora' }],
        [{ text: '💳 Prefiro pagar e usar o meu broker', callback_data: 'mtmauto:app' }],
      ],
    },
  }
}

/** Passo 2 — abrir a conta na corretora parceira e validá-la. */
export function mtmAutoCorretora(): { texto: string; teclado: unknown } {
  return {
    texto:
      `🏦 <b>Abrir a conta (5 minutos)</b>\n\n` +
      `1️⃣ Abre a conta por este link — é o que nos identifica como parceiros e é o que te tira a mensalidade:\n` +
      `${PUPRIME_LINK}\n\n` +
      `2️⃣ Faz um depósito de pelo menos <b>${MIN_DEPOSIT} $</b>. O dinheiro é <b>teu</b> e fica na tua conta — ` +
      `não passa por nós em momento nenhum.\n\n` +
      `3️⃣ Manda-me aqui o teu <b>UID</b> (só o número, aparece no painel da PU Prime).\n` +
      `4️⃣ Manda um <b>print</b> do depósito.\n\n` +
      `Assim que validar, ativo-te o MTM Auto sem mensalidade e explico a instalação. 💪`,
    teclado: {
      inline_keyboard: [
        [{ text: '🏦 Abrir conta na PU Prime', url: PUPRIME_LINK }],
        [{ text: '📲 Já tenho conta — instalar a app', callback_data: 'mtmauto:app' }],
      ],
    },
  }
}

/** Passo 3 — instalar e entrar. */
export function mtmAutoInstalar(): { texto: string; teclado: unknown } {
  return {
    texto:
      `📲 <b>Instalar o MTM Auto</b>\n\n` +
      `<b>iPhone / iPad</b> — pelo TestFlight (a app está em revisão na App Store):\n${MTMAUTO_TESTFLIGHT}\n` +
      `Instala o TestFlight, abre o link, toca em <b>Install</b>.\n\n` +
      `<b>Android ou computador</b> — abre direto no browser e instala no ecrã principal:\n${MTMAUTO_APP_WEB}\n\n` +
      `Depois: <b>Create account</b> com o teu email → confirma → entra.\n\n` +
      `Diz-me quando estiveres dentro que eu explico o passo seguinte, que é ligar a tua conta de trading. 👇`,
    teclado: {
      inline_keyboard: [
        [{ text: '📲 Abrir a app', url: MTMAUTO_APP_WEB }],
        [{ text: '✅ Já entrei — e agora?', callback_data: 'mtmauto:ligar' }],
        // Perguntar isto ANTES de a pessoa desistir é a diferença entre um cliente e um silêncio.
        [{ text: '🔐 Não consigo entrar', callback_data: 'mtmauto:login' }],
      ],
    },
  }
}

/**
 * Passo 3b — o primeiro login não correu bem.
 *
 * É aqui que se perde gente sem ninguém dar por isso: a conta é criada, o email de confirmação
 * cai no spam, a pessoa tenta entrar, não consegue, e desiste em silêncio. O funil tem de
 * perguntar e resolver, não esperar que ela volte.
 */
export function mtmAutoPrimeiroLogin(): { texto: string; teclado: unknown } {
  return {
    texto:
      `🔐 <b>Conseguiste entrar?</b>\n\n` +
      `Se criaste a conta e não entras, é quase sempre uma destas três:\n\n` +
      `1️⃣ <b>Email de confirmação no spam</b> — procura por &laquo;MTM Auto&raquo; ou &laquo;Supabase&raquo;. Confirma e volta a entrar.\n` +
      `2️⃣ <b>Palavra-passe</b> — tem de ter 8 caracteres ou mais. Se te enganaste, usa &laquo;Forgot your password?&raquo; no ecrã de entrada.\n` +
      `3️⃣ <b>Email trocado</b> — acontece. Diz-me qual escreveste que eu vejo se a conta existe.\n\n` +
      `Diz-me em que ponto estás e eu desbloqueio contigo. 👇`,
    teclado: {
      inline_keyboard: [
        [{ text: '📧 Não recebi o email', callback_data: 'mtmauto:sememail' }],
        [{ text: '✅ Já entrei — e agora?', callback_data: 'mtmauto:ligar' }],
      ],
    },
  }
}

/** Quando o email de confirmação não chega. */
export function mtmAutoSemEmail(): { texto: string; teclado: unknown } {
  return {
    texto:
      `📧 <b>Sem email de confirmação</b>\n\n` +
      `Faz por esta ordem:\n` +
      `1️⃣ Procura no <b>spam</b> e no <b>lixo</b> por &laquo;MTM Auto&raquo;.\n` +
      `2️⃣ No ecrã de entrada, escreve o teu email e toca em <b>Forgot your password?</b> — esse email costuma chegar mesmo quando o outro não chega, e serve para entrar.\n` +
      `3️⃣ Se continuar sem chegar, escreve-me aqui o email que usaste. Eu confirmo a conta do nosso lado e digo-te quando podes entrar.\n\n` +
      `Não fiques à espera — escreve-me e eu resolvo. 🙂`,
    teclado: { inline_keyboard: [[{ text: '✅ Consegui entrar', callback_data: 'mtmauto:ligar' }]] },
  }
}

/** Passo 4 — ligar a conta de trading e escolher estratégias. */
export function mtmAutoLigar(): { texto: string; teclado: unknown } {
  return {
    texto:
      `🔗 <b>Ligar a tua conta (o passo que faz tudo funcionar)</b>\n\n` +
      `Na app, separador <b>Connection</b> → <b>Connect account</b>:\n` +
      `• <b>Login</b> — o número da conta MT5 (vem no email da corretora)\n` +
      `• <b>Password</b> — a de <i>trading</i> (não é a do site da corretora)\n` +
      `• <b>Server</b> — escolhe da lista (PU Prime aparece lá)\n\n` +
      `Depois, separador <b>Strategies</b>: liga as que queres seguir e define o risco por trade. ` +
      `Sugestão para começar: <b>0,5% a 1%</b> por trade.\n\n` +
      `A partir daí, cada sinal aparece em <b>Signals</b> — aceitas com um toque, ou deixas a cópia automática ligada.\n\n` +
      `Se alguma coisa não bater certo, escreve-me aqui e eu vejo contigo. 🙂`,
    teclado: { inline_keyboard: [[{ text: '🏦 Validar a corretora e tirar a mensalidade', callback_data: 'mtmauto:corretora' }]] },
  }
}

/**
 * Cria o cupão do MTM AUTO para quem acabou de validar a corretora.
 *
 * A validação da corretora acontece no Telegram, mas o acesso tem de ser resgatado DENTRO da app —
 * são dois sistemas e ninguém liga um ao outro por magia. O cupão é essa ponte: um código de uso
 * único, gerado no momento em que o depósito é aprovado, que o cliente escreve na app e que lhe
 * tira a mensalidade.
 *
 * Uso único de propósito: um código que circula é um código que acaba num grupo de WhatsApp.
 */
export async function criarCupaoMtmAuto(chatId: string | number, uid?: string | null): Promise<string | null> {
  try {
    const db = getSupabaseAdmin()
    const { data: casa } = await db.from('mtmauto_tenants').select('id').eq('slug', 'mtm').maybeSingle()
    for (let i = 0; i < 12; i++) {
      const codigo = `MTM-AUTO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
      const { data, error } = await db
        .from('mtmauto_coupons')
        .insert({
          codigo,
          tipo: 'acesso',
          valor: 12, // meses de acesso concedidos ao resgatar
          usos_max: 1,
          nota: `corretora validada no Telegram${uid ? ` · UID ${uid}` : ''} · chat ${chatId}`,
          tenant_id: casa?.id ?? null,
        })
        .select('codigo')
        .maybeSingle()
      if (!error && data?.codigo) return data.codigo as string
    }
    return null
  } catch {
    return null
  }
}

/** A mensagem que fecha o círculo: valida a corretora → ativa na app. */
export function mtmAutoCupaoValidado(cupao: string): { texto: string; teclado: unknown } {
  return {
    texto:
      `✅ <b>Corretora validada — e a mensalidade fica a zero.</b>\n\n` +
      `Falta só ativar do lado da app. É rápido:\n\n` +
      `1️⃣ Abre o <b>MTM Auto</b> e entra com a tua conta (se ainda não a criaste, cria agora).\n` +
      `2️⃣ Vai a <b>Definições → Activate your access</b>.\n` +
      `3️⃣ Em <b>&laquo;Have a coupon?&raquo;</b> escreve este código e toca em <b>Redeem</b>:\n\n` +
      `<code>${cupao}</code>\n\n` +
      `É de uso único e é teu. Assim que o resgatares, ficas com o acesso ativo sem pagar mensalidade — ` +
      `depois é só ligar a tua conta MT5 e escolher as estratégias. 💪`,
    teclado: {
      inline_keyboard: [
        [{ text: '📲 Abrir o MTM Auto', url: MTMAUTO_APP_WEB }],
        [{ text: '🔗 Como ligo a minha conta?', callback_data: 'mtmauto:ligar' }],
        [{ text: '🔐 Não consigo entrar', callback_data: 'mtmauto:login' }],
      ],
    },
  }
}

/** Guarda o caminho escolhido. Serve para retomar a conversa dias depois sem repetir tudo. */
export async function marcarInteresse(chatId: string | number, interesse: Interesse): Promise<void> {
  try {
    await getSupabaseAdmin()
      .from('telegram_leads')
      .upsert(
        { chat_id: String(chatId), interesse, updated_at: new Date().toISOString() },
        { onConflict: 'chat_id' },
      )
  } catch {
    /* o funil continua — isto é memória, não é o caminho */
  }
}

export async function marcarPassoMtmAuto(chatId: string | number, passo: PassoMtmAuto): Promise<void> {
  try {
    await getSupabaseAdmin()
      .from('telegram_leads')
      .upsert(
        { chat_id: String(chatId), interesse: 'mtmauto', mtmauto_passo: passo, updated_at: new Date().toISOString() },
        { onConflict: 'chat_id' },
      )
  } catch {
    /* idem */
  }
}

/**
 * Responde a um toque nos botões do caminho. Devolve null quando o callback não é deste funil.
 */
export function respostaDeCallback(data: string): { texto: string; teclado: unknown } | null {
  switch (data) {
    case 'caminho:mtmauto':
      return mtmAutoIntro()
    case 'mtmauto:corretora':
      return mtmAutoCorretora()
    case 'mtmauto:app':
      return mtmAutoInstalar()
    case 'mtmauto:ligar':
      return mtmAutoLigar()
    case 'mtmauto:login':
      return mtmAutoPrimeiroLogin()
    case 'mtmauto:sememail':
      return mtmAutoSemEmail()
    default:
      return null
  }
}
