/**
 * O FOLLOW-UP DO TELEGRAM EMPURRA SEMPRE O PRÓXIMO PASSO PAGO — nunca o grátis.
 *
 * Decisão do dono (06/10, F4), pela escada da casa (memória «funil escada»): NÃO se lidera com
 * grátis. Membro 35€/mês → abrir conta PU Prime e depositar → aí o Premium e os grupos de sinais
 * ficam incluídos. O teste grátis da app deixou de ser o que o follow-up oferece: era o isco que
 * matava a venda.
 *
 * Cada lead recebe o próximo degrau PAGO que ainda não deu. O `?ag=` é o do agente dono dessa
 * oferta: AG-FORMACAO para o Membro (a Vendedora vende os packs). Para a corretora não há agente
 * próprio em `lib/agentes/codigos.ts`, por isso fica também AG-FORMACAO — quando houver, troca-se
 * a linha em `AGENTE_DO_PASSO` e a guarda continua a provar o resto.
 *
 * Puro: a guarda (`escada-followup.check.ts`) prova que nenhum texto oferece algo grátis como
 * passo principal.
 */
import { AG, linkAssinado } from '@/lib/agentes/codigos'
import { MIN_DEPOSIT, PRECO_MEMBRO } from '@/lib/escada-precos'

export type PassoPago = 'membro' | 'corretora'

export interface EstadoDoLead {
  /** Tem pack Membro (ou acima) activo, pelo perfil ligado ao email do lead. */
  ehMembro: boolean
  /** Já mandou o UID da corretora (abriu conta). */
  temContaCorretora: boolean
  /** O depósito já foi validado (Premium concedido pelo broker-gate). */
  depositoValidado: boolean
}

/** O próximo degrau pago, ou `null` quando já subiu a escada toda (não há follow-up a fazer). */
export function proximoPassoPago(e: EstadoDoLead): PassoPago | null {
  if (e.depositoValidado) return null
  if (!e.ehMembro && !e.temContaCorretora) return 'membro'
  return 'corretora'
}

export const AGENTE_DO_PASSO: Readonly<Record<PassoPago, string>> = Object.freeze({
  membro: AG.FORMACAO,
  corretora: AG.FORMACAO,
})

/** O link do passo, já assinado. `/register?plano=membro` abre directamente o pack pago. */
export function linkDoPasso(passo: PassoPago): string {
  return passo === 'membro'
    ? linkAssinado('/register?plano=membro', AGENTE_DO_PASSO.membro)
    : linkAssinado('/abrir-conta', AGENTE_DO_PASSO.corretora)
}

/**
 * O texto de cada toque. Três toques, sem pressão inventada, sem lucro prometido, sem euros de
 * resultado. O preço do Membro diz-se (é o que se vende); o Premium aparece como o que o
 * depósito DESBLOQUEIA, nunca como oferta grátis.
 */
export function textoDoToque(passo: PassoPago, toque: number, primeiroNome?: string | null): string {
  const ola = primeiroNome ? `${primeiroNome}, ` : ''
  const link = linkDoPasso(passo)
  if (passo === 'membro') {
    if (toque <= 1) {
      return `Ei ${primeiroNome || ''} 👋 fiquei a pensar na tua mensagem. O próximo passo é entrar como Membro (${PRECO_MEMBRO}): formação, sessões ao vivo e a comunidade, com cada sinal mostrado do início ao fim em pips e percentagem. Entras aqui 👉 ${link}`.replace('Ei  👋', 'Ei 👋')
    }
    if (toque === 2) {
      return `${ola}quem entra como Membro começa logo pelas sessões desta semana. São ${PRECO_MEMBRO} e cancelas quando quiseres. Queres que te guie no registo? 👉 ${link}`
    }
    return `${ola}não te volto a chatear com isto 🙏 Se quiseres avançar, o pack Membro está aqui: ${link}. Fico por aqui para qualquer dúvida.`
  }
  if (toque <= 1) {
    return `${ola}o passo seguinte é abrir a tua conta na PU Prime e depositar a partir de $${MIN_DEPOSIT} — com a conta validada, o Premium e os grupos de sinais ficam incluídos. Abres aqui 👉 ${link}`
  }
  if (toque === 2) {
    return `${ola}ficou a faltar a conta na corretora. É o que desbloqueia o Premium e os sinais. Abres em 2 minutos 👉 ${link} e depois mandas-me o UID aqui.`
  }
  return `${ola}vou deixar-te à vontade 🙏 Quando quiseres desbloquear o Premium, abre a conta aqui: ${link} e manda-me o UID.`
}

/** Palavras que fariam de um follow-up uma oferta grátis. A guarda proíbe-as. */
export const PALAVRAS_DE_GRATIS = /gr[áa]tis|gratuit|\btrial\b|\bfree\b|teste\b|sem cart[ãa]o|0\s*€/i
