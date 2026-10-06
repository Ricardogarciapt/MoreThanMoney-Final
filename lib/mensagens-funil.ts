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

/**
 * Reexportados, não repetidos: duas constantes com o mesmo nome divergem no dia em que alguém
 * muda uma delas — foi o que aconteceu com os 300/350.
 *
 * O código de teste e os links da app estavam escritos NOS DOIS ficheiros, com os mesmos nomes e
 * os mesmos valores: exactamente a armadilha que este comentário já avisava, e a dois metros
 * dele. Mudar o código do teste num deles deixava o outro a anunciar o antigo.
 */
import { MIN_DEPOSIT, APP_REGISTER_LINK, APP_ANDROID_LINK, TRIAL_CODE, PUPRIME_LINK } from '@/lib/telegram-broker-gate'
import { AG } from '@/lib/agentes/codigos'
import { prepararMensagem } from '@/lib/agentes/mensagem-saida'
export { MIN_DEPOSIT, APP_REGISTER_LINK, APP_ANDROID_LINK, TRIAL_CODE, PUPRIME_LINK }
/** Os preços dos degraus vivem em `lib/escada-precos.ts` — aqui só se leem. */
import { escadaEmLinhas, bonusEmLinhas, NOME_DEGRAU_TOPO } from '@/lib/escada-precos'

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
  {
    chave: 'escada_precos',
    titulo: 'A escada de preços (packs)',
    quando: 'Resposta a /premium no bot, e sempre que alguém pergunta quanto custa.',
    variaveis: ['{{degraus}}', '{{bonusPuPrime}}', '{{nomeTopo}}', '{{depositoMinimo}}', '{{linkCorretora}}'],
    /*
     * Os degraus e o bónus entram por variável, não escritos aqui.
     *
     * O texto é editável no /admin/social, e um preço escrito à mão dentro dele voltava a ser
     * uma segunda fonte — a mesma armadilha dos 300/350, agora com a agravante de viver na base
     * de dados, onde nem uma pesquisa no código a encontra. Assim, mudar o preço num sítio
     * chega, mesmo para quem já editou esta mensagem.
     *
     * A ORDEM é a da venda: os degraus pagos primeiro, a rota sem mensalidade depois e o bónus
     * no fim. Abrir com o grátis é a regra que se perdeu uma vez e custou o funil todo.
     */
    padrao:
      `👑 <b>MoreThanMoney — como se entra</b>\n\n` +
      `{{degraus}}\n\n` +
      `💎 <b>Ou sem mensalidade:</b> conta na PU Prime com ≥ {{depositoMinimo}}$ e o Premium + todos os grupos ficam sem custo enquanto mantiveres o saldo. O dinheiro fica na TUA conta.\n\n` +
      `{{bonusPuPrime}}\n\n` +
      `▶️ <a href='https://www.morethanmoney.pt/upgrade'>Subscrever</a>\n` +
      `🏦 <a href='{{linkCorretora}}'>Abrir conta na corretora</a> — depois escreve /acesso\n` +
      // O «Subscrever» acima já leva ao /upgrade, onde o degrau de cima voltou a ter coluna
      // (24/09). Aqui só se diz que também se fecha por aqui, para quem prefere falar — o que
      // não se faz é obrigar ao fecho à mão um pacote que já se compra sozinho.
      `🏆 Para o <b>{{nomeTopo}}</b>: está no link acima, ou responde-me aqui que trato disso contigo.\n` +
      `🆓 Ou experimenta a app primeiro: /app`,
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
    degraus: escadaEmLinhas(),
    bonusPuPrime: bonusEmLinhas(),
    nomeTopo: NOME_DEGRAU_TOPO,
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
export async function lerMensagem(
  chave: string,
  valores: Record<string, string> = {},
  /**
   * Quem assina os links desta mensagem. 06/10: nenhum link da máquina sai sem `?ag=` — estas
   * mensagens são as do bot do Telegram, por isso o AG-FORMACAO por omissão. Os links do site
   * levam `?ag=`, os deep-links do bot levam a carga `_ag_` (ver lib/agentes/mensagem-saida.ts).
   */
  codigo: string = AG.FORMACAO,
): Promise<string> {
  const def = MENSAGENS.find((m) => m.chave === chave)
  if (!def) return ''
  const overrides = await lerOverrides()
  const bruto = overrides[chave]?.trim() || def.padrao
  const texto = substituir(bruto, { ...valoresPadrao(), ...valores })
  return prepararMensagem({ canal: 'telegram', texto, codigoExplicito: codigo }).texto
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
