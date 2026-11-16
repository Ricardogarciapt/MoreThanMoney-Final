/**
 * QUEM FECHA O QUÊ — as regras de fecho que o dono definiu a 16/11/2026.
 *
 * ═══ A DECISÃO ═════════════════════════════════════════════════════════════════════════════
 *
 * «As chamadas de fecho podem ficar diretamente para um agente fechar sozinho. É barato e dá para
 * fechar o máximo de packs de 35 € e mesmo os 65 €. Os casos acima sobem para mim.» E: «os packs
 * anuais tu consegues fechar com agentes normais». Mais tarde, setters e closers humanos fecham os
 * 65 € e os closers humanos o high-ticket (vendas a partir de 1.200 €).
 *
 * Três destinos, e só três:
 *  · `agente`  — o agente fecha sozinho na DM, com o link de checkout do site. Packs mensais
 *                (Membro, Premium), o anual Elite, e a Rota Corretora (abrir conta + depósito
 *                mínimo — o dinheiro fica na conta do cliente, a MTM não cobra nada).
 *  · `ricardo` — high-ticket: valor a partir de {@link ALTO_VALOR_EUR} ou qualquer oferta à medida
 *                (mentoria individual, pacote fechado à mão). O agente marca a chamada de fecho de
 *                alto valor no /agendar e não fecha.
 *  · `parar`   — sem fecho: quem não tem capital próprio vai para o MTM Funded (conta simulada),
 *                que não é uma venda.
 *
 * ═══ PORQUE É PURO ═════════════════════════════════════════════════════════════════════════
 *
 * Um agente que fecha uma venda que devia subir não dá erro: dá um cliente de 1.500 € tratado como
 * um de 35 €. A guarda (`regras-fecho.check.ts`) prova os limites sem rede e sem base.
 */
import { MEMBRO_MENSAL_EUR, PREMIUM_MENSAL_EUR, TOPO_ANUAL_EUR, NOME_DEGRAU_TOPO, MIN_DEPOSIT } from '@/lib/escada-precos'

/** A partir deste valor (uma venda, em euros) o fecho é do Ricardo, e um dia dos closers humanos. */
export const ALTO_VALOR_EUR = 1200

export type QuemFecha = 'agente' | 'ricardo' | 'parar'

export type OfertaFecho =
  | { tipo: 'membro' }
  | { tipo: 'premium' }
  | { tipo: 'anual' } // o degrau de cima (Elite) e qualquer pack anual da escada
  | { tipo: 'rota_corretora' }
  | { tipo: 'funded' }
  /** Tudo o que não está na escada: mentoria individual, pacote à medida, proposta. */
  | { tipo: 'outro'; valorEur: number | null }

/**
 * Quem fecha esta oferta.
 *
 * Uma oferta «outro» sem valor conhecido sobe para o Ricardo: na dúvida, um humano. Um valor abaixo
 * do alto valor fora da escada também sobe — o agente só fecha o que tem preço e checkout no site.
 */
export function quemFecha(o: OfertaFecho): QuemFecha {
  switch (o.tipo) {
    case 'membro':
    case 'premium':
    case 'anual':
    case 'rota_corretora':
      return 'agente'
    case 'funded':
      return 'parar'
    case 'outro':
      return 'ricardo'
  }
}

/** Uma venda deste valor é high-ticket? */
export function ehAltoValor(valorEur: number | null | undefined): boolean {
  return typeof valorEur === 'number' && Number.isFinite(valorEur) && valorEur >= ALTO_VALOR_EUR
}

/** O slug do tipo de chamada de fecho de alto valor no /agendar (migração 252). */
export const TIPO_FECHO_ALTO_VALOR = 'fecho-alto-valor'

/**
 * As regras de fecho escritas para o prompt do closer. Os números vêm da escada, nunca à mão.
 *
 * A ordem é a do dono a 16/11: a Rota Corretora é o produto nº 1 (o mais rentável para a casa e o
 * que dá ao aluno a conta dele, com o dinheiro dele). Não se lidera com «grátis»: lidera-se com
 * «o teu capital fica na tua conta, em teu nome, em vez de pagares uma mensalidade».
 */
export function regrasDeFechoParaPrompt(linkAgendarAltoValor: string): string {
  return [
    'QUEM FECHA (regra do Ricardo, 16/11):',
    `· TU fechas sozinho, com o link do site: Membro ${MEMBRO_MENSAL_EUR}€/mês, Premium ${PREMIUM_MENSAL_EUR}€/mês, ${NOME_DEGRAU_TOPO} ${TOPO_ANUAL_EUR}€/ano, e a Rota Corretora (abrir conta PU Prime pelo nosso link e depositar a partir de ${MIN_DEPOSIT}$; o dinheiro é do cliente e fica na conta dele).`,
    `· SOBE para o Ricardo tudo o que for a partir de ${ALTO_VALOR_EUR}€ ou feito à medida (mentoria individual, pacote fechado à mão, proposta): não fechas, não dás preço; marcas a chamada de fecho em ${linkAgendarAltoValor}.`,
    '· Quem não tem capital próprio não compra nada: vai para o MTM Funded (conta simulada).',
    'ORDEM DO FECHO:',
    `1. Rota Corretora primeiro, para quem tem pelo menos ${MIN_DEPOSIT}$ que pode pôr a trabalhar sem lhe fazer falta e quer o acesso completo: com a conta validada, o Premium e os grupos ficam incluídos enquanto a conta estiver financiada.`,
    '2. Quem prefere ficar na corretora que já tem, ou não quer depositar agora: Membro (entrada) ou Premium (completo).',
    `3. Quem quer o ano inteiro: ${NOME_DEGRAU_TOPO}.`,
    'FECHO ÉTICO (obrigatório):',
    '· Confirma que a pessoa percebeu o preço, o que recebe e que cancela quando quiser antes de mandar o link.',
    '· Nada de pressão, prazos inventados, «últimas vagas» ou culpa. Urgência só se houver uma campanha real em vigor.',
    '· Diz sempre que trading tem risco de perda do capital e que o depósito só deve ser dinheiro que a pessoa pode arriscar.',
    '· Se a pessoa hesita, dá-lhe tempo e uma coisa útil; não insistas na mesma mensagem.',
    '· Se pedir para falar com uma pessoa, ou o caso for sensível (dívidas, reclamação, reembolso), passa ao Ricardo.',
  ].join('\n')
}
