/**
 * Templates do WhatsApp da MTM submetidos à Meta para aprovação (19/11/2026).
 *
 * Regras: pt_PT, «tu», sem promessas de rendimento, categoria honesta (Utility só sobre algo que a
 * pessoa pediu ou já tem; Marketing exige opt-in e leva sempre forma de sair). Os nomes são os que se
 * passam a `enviarWhatsApp({ template: { nome, idioma: 'pt_PT' } })`.
 *
 * Submetidos por `/api/cron/whatsapp-diagnostico?acao=templates`, que salta os que já existem.
 */
export const TEMPLATES_MTM = [
  {
    name: 'mtm_boas_vindas',
    language: 'pt_PT',
    category: 'UTILITY',
    allow_category_change: true,
    components: [
      {
        type: 'BODY',
        text:
          'Olá {{1}}, a tua conta na MoreThanMoney está criada. ✅\n\n' +
          'Entras na tua área em morethanmoney.pt com o email com que te registaste. ' +
          'Se tiveres alguma dúvida sobre o acesso, responde a esta mensagem.',
        example: { body_text: [['Ana']] },
      },
      { type: 'FOOTER', text: 'MoreThanMoney · educação financeira' },
    ],
  },
  {
    name: 'mtm_resposta_lead',
    language: 'pt_PT',
    category: 'UTILITY',
    allow_category_change: true,
    components: [
      {
        type: 'BODY',
        text:
          'Olá {{1}}, recebemos o teu pedido de informação sobre {{2}}.\n\n' +
          'Queres que te expliquemos aqui por mensagem ou preferes marcar uma conversa curta? ' +
          'Responde com a opção que te der mais jeito.',
        example: { body_text: [['Ana', 'o Scanner GoldKiller']] },
      },
      { type: 'FOOTER', text: 'Conteúdo educativo, não é aconselhamento financeiro' },
    ],
  },
  {
    name: 'mtm_seguimento',
    language: 'pt_PT',
    category: 'MARKETING',
    components: [
      {
        type: 'BODY',
        text:
          'Olá {{1}}, ficou alguma dúvida sobre {{2}}? 🙂\n\n' +
          'Estamos por aqui se quiseres continuar a conversa. ' +
          'Se não quiseres receber mais mensagens nossas, responde SAIR.',
        example: { body_text: [['Ana', 'a mentoria Premium']] },
      },
      { type: 'FOOTER', text: 'Conteúdo educativo, não é aconselhamento financeiro' },
    ],
  },
] as const
