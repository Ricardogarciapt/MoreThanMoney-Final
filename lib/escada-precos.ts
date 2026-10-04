/**
 * A escada de preços da MoreThanMoney — a ÚNICA fonte dos números que o funil anuncia.
 *
 * Os preços estavam escritos à mão em cinco guiões diferentes (o /premium do bot, o antigo
 * closer do ManyChat — retirado a 04/10/2026 —, o cérebro do funil do Telegram, o closer das DMs
 * do Instagram e o desenhador de
 * funis do admin). Nenhum deles sabia dos outros: o desenhador de funis ainda dizia «300 $»
 * meses depois de o depósito mínimo ter passado a 350 — exactamente o incidente que o
 * `MIN_DEPOSIT` já tinha obrigado a resolver uma vez.
 *
 * Um preço anunciado por um guião e cobrado por outro não dá erro nenhum: dá um lead que se
 * sente enganado no momento em que chega ao pagamento. Por isso o número vive aqui e os textos
 * leem-no; quem quiser mudar o preço muda-o num sítio.
 *
 * O depósito da corretora NÃO se repete aqui — reexporta-se de `telegram-broker-gate`, que é
 * onde a validação o lê. Duas constantes com o mesmo nome divergem no dia em que alguém muda
 * uma delas.
 */
import { MIN_DEPOSIT } from '@/lib/telegram-broker-gate'
export { MIN_DEPOSIT }

/** Formata um valor em euros à portuguesa (vírgula decimal, sem casas quando é redondo). */
function eur(valor: number): string {
  return `${String(valor).replace('.', ',')}€`
}

// ───────────────────────── os degraus, por ordem de subida ─────────────────────────

export const MEMBRO_MENSAL_EUR = 35
export const PREMIUM_MENSAL_EUR = 65
/** Oferta de entrada do Premium: só o 1º mês. Vive no Stripe como INTRO_PREMIUM_1M. */
export const PREMIUM_1O_MES_EUR = 34.99
/** O degrau de cima, anual. planId `elite_annual` (ver {@link NOME_DEGRAU_TOPO}). */
export const TOPO_ANUAL_EUR = 597
/** O bónus que a PU Prime dá sobre o depósito, em percentagem. */
export const BONUS_DEPOSITO_PCT = 100

/**
 * O NOME do degrau de cima, como o cliente o lê.
 *
 * O dono pediu-o a 2026-09-24 como «o fundador anual 597€», e ao ser-lhe mostrada a colisão
 * decidiu: «podes usar o nome existente do pack». Fica <b>Elite</b> — que é como o produto se
 * chama no Stripe («Pack Elite — Anual») desde 4d7a37dc, quando foi renomeado DE «Fundador»
 * PARA «Elite» exactamente por isto: «Fundador» está reservado para os cupões e para o cohort
 * de acesso grátis concedido (a campanha de 31/08 ainda lhe chama isso em
 * `lib/broadcast-emails.ts`), e «estatuto Fundador vitalício» é um PERK dentro do Elite, não o
 * nome do pacote.
 *
 * Dois produtos com o mesmo nome e direitos diferentes é vender uma coisa e entregar outra.
 */
export const NOME_DEGRAU_TOPO = 'Elite'

export const PRECO_MEMBRO = `${eur(MEMBRO_MENSAL_EUR)}/mês`
export const PRECO_PREMIUM = `${eur(PREMIUM_MENSAL_EUR)}/mês`
export const PRECO_PREMIUM_1O_MES = eur(PREMIUM_1O_MES_EUR)
export const PRECO_TOPO = `${eur(TOPO_ANUAL_EUR)}/ano`

/**
 * O bónus da PU Prime, nas palavras do dono (2026-09-24):
 *
 *   «o bónus de 100% acumula, é só para o Fundador ou clientes diretos na pu prime com deposito
 *   minimo de 350$»
 *
 * Três coisas, e só estas três — não há tecto, prazo nem escalões porque ele não os deu:
 *  • ACUMULA: não substitui nem anula nada do que já existe. Quem tem direito às duas coisas
 *    fica com as duas.
 *  • Tem DOIS caminhos, e só dois: ser {@link NOME_DEGRAU_TOPO}, ou ser cliente directo na PU
 *    Prime (conta aberta pelo nosso link) com depósito mínimo de {@link MIN_DEPOSIT} $.
 *  • Fora destes dois casos não há bónus. Escrever «só para quem é do degrau de cima» esconde
 *    metade das pessoas que têm direito; escrever «para toda a gente» promete a quem não tem.
 */
export const BONUS_PUPRIME_PCT = BONUS_DEPOSITO_PCT
export const BONUS_PUPRIME_TITULO = `Bónus PU Prime — ${BONUS_PUPRIME_PCT}% sobre o teu depósito`

/**
 * O plano do degrau de cima no Stripe. O preço EXISTE e está ligado: produto LIVE
 * `prod_UvZtjsvWzgR99U`, preço `price_1Tvik0B0TQE8czM3sKsCDYQR` (597 EUR/ano recorrente), com
 * `STRIPE_PRICE_ELITE_ANNUAL` em Production e Preview na Vercel. Não aparece no `.env.local`,
 * o que faz parecer localmente que falta — não falta.
 */
export const TOPO_PLAN_ID = 'elite_annual'

/**
 * A página onde o cliente compra o degrau de cima.
 *
 * A coluna do Elite tinha saído do /upgrade em f36aeeb8 (20/08, «Elite retirado da oferta») e,
 * enquanto esteve fora, este valor era `null` de propósito: dar um link para uma página onde o
 * pacote não está é perder o lead no único momento em que ele já tinha decidido pagar. **Voltou a
 * 24/09** (pedido do dono), com o preço a vir daqui em vez de escrito no JSX — que foi o que fez
 * a página anunciar 50€/mês para um pacote de 597€/ano até 21/07.
 *
 * O checkout é o mesmo dos outros packs: POST /api/stripe/create-checkout-session com
 * `planId: 'elite_annual'`. Exige sessão iniciada, por isso o /upgrade trata do resto.
 *
 * Se `STRIPE_PRICE_ELITE_ANNUAL` faltar, a coluna não se desenha e este link leva a uma página
 * sem ela — mas essa variável está em Production e em Preview, e a página é `force-dynamic` para
 * a ler a cada pedido em vez de a congelar no build.
 */
export const TOPO_LINK_PAGAMENTO: string | null = '/upgrade'

// ───────────────────────── a escada escrita, para os guiões ─────────────────────────

/**
 * A escada numa linha, para os prompts dos closers (IA).
 *
 * A ordem é a ordem de venda (docs/mtm-sales-brain.md): Membro primeiro, o degrau anual no topo,
 * e a rota da corretora no fim — nunca a abrir, porque não se lidera com o grátis.
 */
export function escadaNumaLinha(): string {
  return (
    `Membro ${PRECO_MEMBRO} (entrada) · Premium ${PRECO_PREMIUM} (1º mês ${PRECO_PREMIUM_1O_MES}) · ` +
    `${NOME_DEGRAU_TOPO} ${PRECO_TOPO} (o topo, anual) · ` +
    `rota PU Prime ${MIN_DEPOSIT}$ = Premium + grupos grátis enquanto financiado`
  )
}

/** A regra do bónus numa linha, para os prompts dos closers (IA). */
export function bonusNumaLinha(): string {
  return (
    `${BONUS_PUPRIME_TITULO}: ACUMULA com tudo o resto (não substitui nada) e tem dois caminhos, ` +
    `e SÓ estes dois — ser ${NOME_DEGRAU_TOPO}, ou ser cliente directo na PU Prime (conta aberta ` +
    `pelo nosso link) com depósito mínimo de ${MIN_DEPOSIT}$. Fora destes dois casos não há bónus: ` +
    `não digas «só para quem é ${NOME_DEGRAU_TOPO}» nem «para toda a gente».`
  )
}

/**
 * A escada em HTML, um degrau por linha — é o corpo do /premium do bot.
 *
 * Fica aqui, e não no comando, para o texto do funil e o dos closers não poderem divergir.
 */
export function escadaEmLinhas(): string {
  return (
    `🥉 <b>Membro · ${PRECO_MEMBRO}</b> — comunidade, sinais base e formação. É a porta de entrada.\n` +
    `👑 <b>Premium · ${PRECO_PREMIUM}</b> (1º mês ${PRECO_PREMIUM_1O_MES}) — Scanner, Trading Alerts, Tap to Trade, salas Premium e aulas.\n` +
    `🏆 <b>${NOME_DEGRAU_TOPO} · ${PRECO_TOPO}</b> — o topo da escada: um ano inteiro de Premium, com estatuto VIP.`
  )
}

/**
 * O bónus em HTML, para as mensagens do funil.
 *
 * Fica numa linha SÓ SUA, a seguir aos degraus e à rota da corretora, de propósito: colado ao
 * degrau de cima lia-se como perk exclusivo dele, e colado à rota dos {@link MIN_DEPOSIT}$ lia-se
 * como se bastasse depositar. São dois caminhos para a mesma coisa, e é assim que tem de sair.
 */
export function bonusEmLinhas(): string {
  return (
    `🎁 <b>${BONUS_PUPRIME_TITULO}</b> — acumula com o resto. É para dois casos, e só estes: seres ` +
    `<b>${NOME_DEGRAU_TOPO}</b>, ou seres cliente directo na PU Prime (conta aberta pelo nosso ` +
    `link) com <b>depósito mínimo de ${MIN_DEPOSIT}$</b>.`
  )
}

/**
 * A frase que um closer diz sobre ONDE se compra o degrau de cima.
 *
 * Existe por causa de um desencontro que durou até 25/09: o closer das DMs do Instagram e o do
 * funil do Telegram traziam os preços daqui, mas escreviam à mão a parte que decide a venda — e
 * escreviam-na ao contrário um do outro. O do Telegram ainda dizia «não dês link de pagamento:
 * esse fecho é com o Ricardo», herdado dos 35 dias (20/08→24/09) em que o pacote esteve mesmo
 * fora do /upgrade. Recusar fechar uma venda que já se pode fechar não dá erro nenhum: dá um
 * lead que já tinha decidido pagar e fica à espera de um humano que pode nunca aparecer.
 *
 * Por isso a frase vive aqui, ao lado do {@link TOPO_LINK_PAGAMENTO} que a decide. Quando o link
 * é `null` — o pacote está fora de venda, como esteve — a frase diz-se sozinha ao contrário, e
 * os dois guiões mudam juntos em vez de um deles ficar para trás.
 */
export function ondeComprarTopoNumaLinha(): string {
  return TOPO_LINK_PAGAMENTO
    ? `JÁ se compra no site, em ${TOPO_LINK_PAGAMENTO} — manda esse link quando a pessoa quiser fechar, e não inventes outro.`
    : `NÃO se compra sozinho no site neste momento: esse fecho é com o Ricardo. Não inventes link de pagamento.`
}
