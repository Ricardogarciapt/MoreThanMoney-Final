/**
 * A OFERTA CERTA PARA ESTA PESSOA — e o botão que lha manda.
 *
 * O painel já dizia quem está pronto a fechar (`telegram-admin-extra.textoFecho`). Faltava o
 * passo seguinte, que é o que ele faz a seguir de qualquer maneira: decidir O QUÊ é que lhe
 * oferece, e mandar. Fazê-lo à mão significa lembrar-se dos preços de cabeça — e foi assim que
 * cinco guiões diferentes acabaram a anunciar números diferentes.
 *
 * ── DUAS REGRAS, E SÃO AS DO CÉREBRO DE VENDAS ────────────────────────────────────────────────
 *
 *  1. OS PREÇOS NÃO SE ESCREVEM AQUI. Vêm todos de `lib/escada-precos.ts`, que é a única fonte.
 *     Não há neste ficheiro um único número em euros, e o teste garante que continua assim.
 *
 *  2. NÃO SE LIDERA COM O GRÁTIS. A escada sobe-se pela ordem em que se vende: Membro, Premium,
 *     o anual no topo — e a rota da corretora é o FECHO, não o isco. Quem já tem conta validada
 *     na corretora não precisa de ouvir falar de mensalidade nenhuma; quem ainda não escolheu
 *     caminho não precisa de ouvir falar do degrau de cima.
 *
 * E uma coisa que o bot não faz: falar primeiro a quem nunca lhe escreveu. O Telegram não deixa,
 * e ainda bem — a abordagem a frio é dele, não de uma máquina.
 *
 *   npx tsx lib/__tests__/telegram-admin-oferta.check.ts
 */
import {
  MIN_DEPOSIT,
  NOME_DEGRAU_TOPO,
  PRECO_MEMBRO,
  PRECO_PREMIUM,
  PRECO_PREMIUM_1O_MES,
  PRECO_TOPO,
  TOPO_LINK_PAGAMENTO,
  bonusEmLinhas,
  escadaEmLinhas,
} from '@/lib/escada-precos'
import { escaparHtml as esc } from '@/lib/telegram-admin-porta'

export type DegrauSugerido = 'membro' | 'premium' | 'topo' | 'corretora' | 'nada'

export interface EstadoDaPessoa {
  /** Já paga alguma coisa? */
  pagante: boolean
  /** Categoria/plano actual, como está no perfil. */
  plano: string | null
  /** O acesso pela corretora já foi libertado? */
  acessoCorretora: boolean
  /** Deu UID e ele bate certo com a lista da corretora? */
  uidConfirmado: boolean
  /** Já tem conta no site? */
  temConta: boolean
  /** Escreveu ao bot em privado? Sem isto, o bot não lhe pode mandar nada. */
  falouEmPrivado: boolean
  /** O cupão que já lhe foi emitido, se houver. Não se emite um segundo por cima do primeiro. */
  cupaoEmitido: string | null
}

export interface Oferta {
  degrau: DegrauSugerido
  titulo: string
  /** Porque é ESTE degrau e não outro — para ele poder discordar com fundamento. */
  porque: string
  /** O que o bot pode mandar agora, se ele tocar. `null` = não há nada a mandar. */
  mensagem: string | null
  /** Porque não se pode mandar (não escreveu ao bot, já paga, etc.). */
  impedimento: string | null
}

/**
 * Pura: que degrau é que esta pessoa deve ouvir a seguir?
 *
 * A ordem das perguntas é a ordem da escada, ao contrário: primeiro tira-se de cima quem já não
 * precisa de ouvir nada, depois quem está a um passo do fecho, e só no fim quem está na base.
 */
export function ofertaParaPessoa(e: EstadoDaPessoa): Oferta {
  const base = { impedimento: null as string | null }

  if (e.acessoCorretora) {
    return {
      ...base,
      degrau: 'nada',
      titulo: 'Nada a oferecer — já tem tudo pela corretora',
      porque: `Tem acesso libertado pela rota PU Prime: Premium e grupos enquanto mantiver ${MIN_DEPOSIT}$. Oferecer-lhe mensalidade agora é vender-lhe o que já tem.`,
      mensagem: null,
      impedimento: 'Já tem o acesso libertado. O passo dela agora é usar, não comprar.',
    }
  }

  if (e.pagante) {
    return {
      ...base,
      degrau: 'topo',
      titulo: `Subir ao ${NOME_DEGRAU_TOPO} — ${PRECO_TOPO}`,
      porque: `Já paga (${e.plano ?? 'plano activo'}). O degrau de cima é de SUBIDA, e é o único que lhe falta.`,
      mensagem:
        `🏆 <b>${esc(NOME_DEGRAU_TOPO)} · ${esc(PRECO_TOPO)}</b>\n\n` +
        `Um ano inteiro de Premium, com estatuto VIP — e sem voltares a pensar na mensalidade.\n\n` +
        (TOPO_LINK_PAGAMENTO ? `👉 ${esc(TOPO_LINK_PAGAMENTO)}\n\n` : '') +
        bonusEmLinhas(),
    }
  }

  if (e.uidConfirmado) {
    return {
      ...base,
      degrau: 'corretora',
      titulo: 'Fechar pela corretora — é o passo mais curto',
      porque: `O UID já bate certo com a lista. Falta confirmar o depósito de ${MIN_DEPOSIT}$ e o acesso abre — sem cobrar mensalidade nenhuma.`,
      mensagem:
        `🏦 Estás a um passo.\n\n` +
        `Assim que confirmar o depósito de <b>${MIN_DEPOSIT}$</b> na tua conta, liberto os grupos de sinais ` +
        `e o Premium da app — sem mensalidade, enquanto mantiveres a conta financiada.\n\n` +
        `Manda-me o print do depósito e trato do resto. 📸`,
    }
  }

  if (e.temConta) {
    return {
      ...base,
      degrau: 'premium',
      titulo: `Premium — ${PRECO_PREMIUM} (1º mês ${PRECO_PREMIUM_1O_MES})`,
      porque: 'Já tem conta no site e não paga. O Premium é o degrau que lhe abre o que ela já está a ver fechado.',
      mensagem:
        `👑 <b>Premium · ${esc(PRECO_PREMIUM)}</b> — o 1º mês fica por ${esc(PRECO_PREMIUM_1O_MES)}.\n\n` +
        `Scanner, Trading Alerts, Tap to Trade, salas Premium e aulas.\n\n👉 /upgrade`,
    }
  }

  return {
    ...base,
    degrau: 'membro',
    titulo: `Membro — ${PRECO_MEMBRO}`,
    porque: 'Ainda não tem conta nem pagou nada. Membro é a porta de entrada; não se lidera com o grátis nem com o topo.',
    mensagem: `${escadaEmLinhas()}\n\n${bonusEmLinhas()}`,
  }
}

/** Pura: a oferta já com o impedimento aplicado — é isto que o ecrã mostra. */
export function ofertaMostravel(e: EstadoDaPessoa): Oferta {
  const o = ofertaParaPessoa(e)
  if (o.impedimento) return o
  if (!e.falouEmPrivado) {
    return {
      ...o,
      mensagem: null,
      impedimento: 'Esta pessoa nunca escreveu ao bot em privado — o Telegram não me deixa falar primeiro. A abordagem tem de ser tua.',
    }
  }
  return o
}

/** Pura: o ecrã da oferta, com o que já lhe foi prometido à vista. */
export function textoOferta(nome: string, e: EstadoDaPessoa, o: Oferta): string {
  return [
    `🧲 <b>Oferta para ${esc(nome)}</b>`,
    '',
    `<b>${esc(o.titulo)}</b>`,
    `<i>${esc(o.porque)}</i>`,
    e.cupaoEmitido ? `\n🎟️ Já tem cupão emitido: <code>${esc(e.cupaoEmitido)}</code> — não emitas outro por cima.` : '',
    o.impedimento ? `\n🚫 ${esc(o.impedimento)}` : '',
    o.mensagem ? `\n<b>O que lhe mando, se confirmares:</b>\n\n${o.mensagem}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Pura: os botões. Sem mensagem para mandar, não há botão de mandar — e diz-se porquê. */
export function tecladoOferta(chatId: string, o: Oferta, voltar: Array<{ text: string; callback_data?: string; url?: string }>) {
  const linhas: Array<Array<{ text: string; callback_data?: string; url?: string }>> = []
  if (o.mensagem) linhas.push([{ text: '📨 Mandar-lhe isto', callback_data: `admin:of?${chatId}` }])
  linhas.push([{ text: '🔎 A folha desta pessoa', callback_data: `admin:quem:${chatId}` }])
  linhas.push(voltar)
  return { inline_keyboard: linhas }
}
