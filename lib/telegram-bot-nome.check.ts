/**
 * A GUARDA DO NOME DO BOT — pergunta ao Telegram se o nome que a casa publica existe.
 *
 *   npx tsx lib/telegram-bot-nome.check.ts
 *   TELEGRAM_BOT_USERNAME=outro npx tsx lib/telegram-bot-nome.check.ts
 *
 * ═══ PORQUE É QUE ISTO EXISTE ══════════════════════════════════════════════════════════════
 *
 * Porque a 01/10/2026 o nome por omissão em `lib/mtmcopy/telegram-bot.ts` era
 * `morethanmoneypt_bot`, que NÃO EXISTE — é o nome a MOSTRAR do bot, e alguém o tomou pelo
 * username. O username vivo é `MoreThanMoney_aibot`.
 *
 * Nada disto dá erro. O valor viaja para dentro de links que a casa publica a quem está a decidir
 * falar connosco — a resposta pública do funil do Instagram (`lib/instagram/funnel.ts`), o botão
 * de acolhimento de quem entra num grupo (`lib/telegram-grupo-entradas.ts`), o closer, o CTA da
 * curadoria. Um nome errado dá uma página do Telegram a dizer que o utilizador não existe: a
 * pessoa carrega no link que lhe demos e bate numa porta fechada, no passo exacto em que decidiu
 * vir. Nenhum log, nenhuma excepção, nenhum contador a descer — só leads que não aparecem.
 *
 * Um typecheck não apanha isto. Uma leitura do código não apanha isto: as duas formas do nome são
 * igualmente plausíveis à vista. Só o Telegram sabe, e por isso esta guarda PERGUNTA-LHE.
 *
 * ═══ COMO É QUE SE DISTINGUE UM BOT QUE EXISTE DE UM QUE NÃO ═══════════════════════════════
 *
 * O t.me devolve 200 para tudo, por isso o código HTTP não serve. O que distingue é o HTML:
 *
 *   existe      → `<title>Telegram: Launch @…` e um bloco `tgme_page_title` com o nome a mostrar
 *   não existe  → `<title>Telegram: Contact @…` e NENHUM `tgme_page_title`
 *
 * A guarda mede os dois sinais e, para não confiar numa heurística sozinha, confirma-a contra um
 * handle de controlo que seguramente não existe. Se o controlo passar por «existe», a heurística
 * deixou de valer — e aí a guarda diz isso em vez de dar um veredicto em que não se pode confiar.
 *
 * ═══ SEM REDE, FALHA ALTO ══════════════════════════════════════════════════════════════════
 *
 * Sem rede não bloqueia (código 0) — mas escreve NÃO VERIFICADO em maiúsculas. Uma guarda que se
 * cala quando não consegue verificar é uma guarda que dá falsa confiança.
 */
import { MTMCOPY_BOT_USERNAME, MTMCOPY_BOT_USERNAME_DEFAULT } from './mtmcopy/telegram-bot'

/** Um handle que não pode existir. Serve para provar que a leitura do HTML ainda distingue. */
const CONTROLO = 'zz_este_bot_nao_existe_mtm_9183'

type Veredicto = 'existe' | 'nao_existe' | 'nao_verificado'

async function olhar(handle: string): Promise<{ veredicto: Veredicto; porque: string }> {
  try {
    const r = await fetch(`https://t.me/${handle}`, { redirect: 'follow' })
    const html = await r.text()
    // O bloco do perfil só aparece quando há perfil. É o sinal forte.
    const temPerfil = html.includes('tgme_page_title')
    // E o título diz «Launch» para um bot que existe, «Contact» para um handle sem ninguém.
    const temLaunch = /<title>Telegram: Launch /i.test(html)
    if (temPerfil || temLaunch) {
      return { veredicto: 'existe', porque: `t.me/${handle} tem perfil${temLaunch ? ' e diz «Launch»' : ''}` }
    }
    return { veredicto: 'nao_existe', porque: `t.me/${handle} não tem perfil — é a página de um handle sem ninguém` }
  } catch (e) {
    return { veredicto: 'nao_verificado', porque: e instanceof Error ? e.message : String(e) }
  }
}

async function main() {
  const configurado = MTMCOPY_BOT_USERNAME()

  const controlo = await olhar(CONTROLO)
  if (controlo.veredicto === 'nao_verificado') {
    console.warn(`nome-do-bot: NÃO VERIFICADO — sem rede para falar com o t.me (${controlo.porque})`)
    return
  }
  if (controlo.veredicto !== 'nao_existe') {
    // A forma do HTML mudou e a leitura deixou de distinguir. Dizer «passou» aqui era pior do que
    // não ter guarda: era passar a confiar num sinal que já não significa nada.
    console.error(
      'nome-do-bot: NÃO VERIFICADO — o handle de controlo apareceu como existente, ou seja o HTML ' +
        'do t.me mudou e esta leitura já não distingue um bot de um handle vazio. Corrige a leitura ' +
        'antes de voltar a confiar nela.',
    )
    process.exit(1)
  }

  const r = await olhar(configurado)
  if (r.veredicto === 'nao_verificado') {
    console.warn(`nome-do-bot: NÃO VERIFICADO — ${r.porque}`)
    return
  }
  if (r.veredicto === 'nao_existe') {
    console.error(
      `nome-do-bot: @${configurado} NÃO EXISTE no Telegram — ${r.porque}.\n` +
        '  Este nome vai dentro dos links que a casa publica (resposta pública do funil do Instagram,\n' +
        '  botão de acolhimento dos grupos, closer, curadoria). Quem carregar neles bate numa porta\n' +
        '  fechada, sem erro em sítio nenhum. Corrige TELEGRAM_BOT_USERNAME no ambiente, ou\n' +
        '  MTMCOPY_BOT_USERNAME_DEFAULT em lib/mtmcopy/telegram-bot.ts.',
    )
    process.exit(1)
  }

  // O valor por omissão verifica-se SEMPRE, mesmo quando o ambiente manda outro: é o que fica no
  // código, e é o que vai a correr no dia em que a variável desaparecer de um ambiente qualquer.
  const porOmissao = await olhar(MTMCOPY_BOT_USERNAME_DEFAULT)
  if (porOmissao.veredicto === 'nao_existe') {
    console.error(
      `nome-do-bot: o configurado (@${configurado}) existe, mas o valor POR OMISSÃO no código ` +
        `(@${MTMCOPY_BOT_USERNAME_DEFAULT}) NÃO existe. É uma bomba com temporizador: funciona até ` +
        'alguém publicar sem TELEGRAM_BOT_USERNAME definido.',
    )
    process.exit(1)
  }

  console.log(
    `nome-do-bot: @${configurado} existe ✓` +
      (configurado === MTMCOPY_BOT_USERNAME_DEFAULT
        ? ' (é o valor por omissão)'
        : ` · por omissão @${MTMCOPY_BOT_USERNAME_DEFAULT} também ✓`),
  )
}

void main()
