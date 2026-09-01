import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * As mensagens do funil, editáveis sem passar pelo código.
 *
 * Estavam escritas dentro das funções que as enviam. Mudar uma vírgula na mensagem de
 * boas-vindas obrigava a editar um ficheiro, fazer commit e esperar por um deploy — e por isso
 * ninguém as mudava. Uma mensagem de vendas que ninguém pode afinar é uma mensagem que envelhece.
 *
 * O texto do código continua a ser o DEFEITO, não um valor inicial copiado para a base de dados:
 * quem nunca editou recebe sempre a versão nova quando o produto muda, e quem editou fica com a
 * sua. É a diferença entre um defeito e uma cópia — a cópia congela no dia em que foi feita.
 *
 * As variáveis (`{{nome}}`, `{{linkCorretora}}`…) são substituídas na hora. Uma variável que o
 * editor apague simplesmente não aparece; uma que ele invente fica como está, visível, para se
 * ver que está errada em vez de sair um espaço em branco no meio da frase.
 */

const KEY = 'mensagens_funil'

export interface DefinicaoMensagem {
  chave: string
  titulo: string
  /** Quando é que esta mensagem sai. Sem isto, editar é adivinhar. */
  quando: string
  variaveis: string[]
  padrao: string
}

export const PUPRIME_LINK = 'https://www.puprime.com/campaign?cs=morethanmoney'
export const APP_REGISTER_LINK = 'https://www.morethanmoney.pt/register'
export const APP_ANDROID_LINK = 'https://www.morethanmoney.pt/downloads/MoreThanMoney.apk'
export const TRIAL_CODE = '14DayTrial'
// Reexportado, não repetido: duas constantes com o mesmo nome divergem no dia em que alguém
// muda uma delas — foi o que aconteceu com os 300/350.
import { MIN_DEPOSIT } from '@/lib/telegram-broker-gate'
export { MIN_DEPOSIT }

export const MENSAGENS: DefinicaoMensagem[] = [
  {
    chave: 'boas_vindas',
    titulo: 'Boas-vindas ao grupo de leads',
    quando: 'Assim que alguém entra no grupo de leads do Telegram.',
    variaveis: ['{{nome}}'],
    padrao:
      `👋 Olá{{nome}}, bem-vindo à MoreThanMoney!\n\n` +
      `Comunidade PT de trading: sinais acompanhados do início ao fim, medidos em pips e percentagem. ` +
      `Para te ajudar melhor — o que procuras: **sinais para copiar à mão**, ` +
      `**Tap to Trade** (1 toque na app) ou **algo automático**? 🙂\n\n` +
      `🌐 Fala no teu idioma — respondo-te nele. (Para traduzir qualquer mensagem: toque longo → Traduzir.)\n` +
      `Write in your own language — I'll reply in it. (Long-press any message → Translate.)`,
  },
  {
    chave: 'boas_vindas_grupo',
    titulo: 'Boas-vindas no grupo (com botão)',
    quando: 'Quando alguém entra no grupo de leads. É a primeira coisa que um lead lê.',
    variaveis: ['{{nome}}'],
    padrao:
      `👋 Bem-vindo{{nome}}! Fala comigo em privado e ajudo-te a começar — sinais manuais, Tap to Trade ou algo automático. 🙂`,
  },
  {
    chave: 'porta_gratis',
    titulo: 'Porta grátis (14 dias sem depósito)',
    quando: 'Quando o lead hesita no passo da corretora — é a saída sem custo.',
    variaveis: ['{{linkApp}}', '{{linkRegisto}}', '{{codigoTrial}}'],
    padrao:
      `🎁 <b>Começa GRÁTIS — sem depositar nada:</b>\n\n` +
      `1️⃣ Descarrega a app MTM (iOS: App Store "MTM System" · Android: {{linkApp}})\n` +
      `2️⃣ Cria conta em {{linkRegisto}}\n` +
      `3️⃣ Em <b>Mais → Definições → Resgatar código</b>, usa <code>{{codigoTrial}}</code> → <b>14 dias Premium grátis</b> 🚀\n\n` +
      `Vês por dentro os sinais, o Tap-to-Trade e as sessões ao vivo. Quando quiseres os <b>grupos de sinais + copytrading</b>, é só o passo da corretora (escreve /acesso). 💪`,
  },
  {
    chave: 'passo_corretora',
    titulo: 'Passo da corretora (acesso completo)',
    quando: 'Resposta a /acesso e sempre que a IA encaminha para o acesso completo.',
    variaveis: ['{{linkCorretora}}', '{{depositoMinimo}}', '{{linkRegisto}}', '{{codigoTrial}}'],
    padrao:
      `🔓 <b>Duas formas de entrar:</b>\n\n` +
      `🎁 <b>A) Experimenta GRÁTIS já</b> — sem depositar:\n` +
      `Descarrega a app, cria conta em {{linkRegisto}} e usa o código <code>{{codigoTrial}}</code> (Mais → Definições → Resgatar código) → <b>14 dias Premium grátis</b>.\n\n` +
      `💎 <b>B) Grupos de sinais + copytrading</b> (acesso completo):\n` +
      `1️⃣ Abre conta na PU Prime: {{linkCorretora}}\n` +
      `2️⃣ Deposita no mínimo <b>${'$'}{{depositoMinimo}}</b>\n` +
      `3️⃣ Envia-me o teu <b>UID</b> da PU Prime (só o número)\n` +
      `4️⃣ Envia um <b>print screen</b> do depósito\n\n` +
      `Assim que validar, liberto os grupos + cupão Premium. Começa pela A se quiseres testar primeiro. 🚀`,
  },
]

/** As variáveis que o sistema sabe preencher, e o que valem hoje. */
export function valoresPadrao(): Record<string, string> {
  return {
    linkCorretora: PUPRIME_LINK,
    linkApp: APP_ANDROID_LINK,
    linkRegisto: APP_REGISTER_LINK,
    codigoTrial: TRIAL_CODE,
    depositoMinimo: String(MIN_DEPOSIT),
    nome: '',
  }
}

/**
 * Troca `{{variavel}}` pelo valor.
 *
 * Uma variável desconhecida fica COMO ESTÁ, à vista. Apagá-la deixaria um buraco no meio da
 * frase que ninguém percebia de onde vinha; deixá-la visível faz o erro aparecer na primeira
 * pré-visualização, que é onde custa barato.
 */
export function substituir(texto: string, valores: Record<string, string>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (todo, chave: string) =>
    chave in valores ? valores[chave] : todo,
  )
}

async function lerOverrides(): Promise<Record<string, string>> {
  try {
    const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', KEY).maybeSingle()
    const v = data?.value
    // `site_settings.value` tanto vem como objeto como string JSON, conforme quem o escreveu.
    const obj = typeof v === 'string' ? JSON.parse(v) : v
    return obj && typeof obj === 'object' ? (obj as Record<string, string>) : {}
  } catch {
    return {}
  }
}

/** O texto que vai mesmo sair: o editado, se existir; senão o do código. */
export async function lerMensagem(chave: string, valores: Record<string, string> = {}): Promise<string> {
  const def = MENSAGENS.find((m) => m.chave === chave)
  if (!def) return ''
  const overrides = await lerOverrides()
  const bruto = overrides[chave]?.trim() || def.padrao
  return substituir(bruto, { ...valoresPadrao(), ...valores })
}

/** Todas as mensagens com o estado de edição, para o painel do admin. */
export async function listarMensagens() {
  const overrides = await lerOverrides()
  return MENSAGENS.map((m) => ({
    ...m,
    editado: Boolean(overrides[m.chave]?.trim()),
    texto: overrides[m.chave]?.trim() || m.padrao,
    // A pré-visualização com as variáveis já trocadas — é o que o lead vai receber.
    previsao: substituir(overrides[m.chave]?.trim() || m.padrao, {
      ...valoresPadrao(),
      nome: ' Ricardo',
    }),
  }))
}

/** Grava uma edição. Texto vazio = voltar ao defeito do código, não guardar vazio. */
export async function guardarMensagem(chave: string, texto: string): Promise<{ ok: boolean; erro?: string }> {
  if (!MENSAGENS.some((m) => m.chave === chave)) return { ok: false, erro: 'Mensagem desconhecida' }
  const overrides = await lerOverrides()
  const limpo = texto.trim()
  if (limpo) overrides[chave] = limpo.slice(0, 4000)
  else delete overrides[chave]

  const { error } = await getSupabaseAdmin()
    .from('site_settings')
    .upsert({ key: KEY, value: overrides, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  return error ? { ok: false, erro: error.message } : { ok: true }
}
