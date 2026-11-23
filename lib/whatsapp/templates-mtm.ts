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
  {
    name: 'mtm_funil_educacao',
    language: 'pt_PT',
    category: 'UTILITY',
    allow_category_change: true,
    components: [
      {
        type: 'BODY',
        text:
          'Olá {{1}}, aqui é a equipa MoreThanMoney. Pediste para te contactarmos sobre a formação em trading.\n\n' +
          'Para te orientarmos bem: já operaste alguma vez ou estás a começar do zero?',
        example: { body_text: [['Ana']] },
      },
      { type: 'FOOTER', text: 'Conteúdo educativo, não é aconselhamento financeiro' },
    ],
  },
  {
    name: 'mtm_funil_corretora',
    language: 'pt_PT',
    category: 'UTILITY',
    allow_category_change: true,
    components: [
      {
        type: 'BODY',
        text:
          'Olá {{1}}, aqui é a equipa MoreThanMoney. Pediste ajuda para abrir conta na corretora regulada que recomendamos.\n\n' +
          'Já tens conta aberta ou queres que te acompanhemos desde o primeiro passo?',
        example: { body_text: [['Ana']] },
      },
      { type: 'FOOTER', text: 'Trading envolve risco de perda de capital' },
    ],
  },
  {
    name: 'mtm_funil_funded',
    language: 'pt_PT',
    category: 'UTILITY',
    allow_category_change: true,
    components: [
      {
        type: 'BODY',
        text:
          'Olá {{1}}, aqui é a equipa MoreThanMoney. Pediste informação sobre o MTM Funded, os desafios em conta simulada.\n\n' +
          'Queres que te expliquemos as regras e como começar?',
        example: { body_text: [['Ana']] },
      },
      { type: 'FOOTER', text: 'Conta simulada. Não é prop firm.' },
    ],
  },
  {
    name: 'mtm_aviso_marcacao',
    language: 'pt_PT',
    category: 'UTILITY',
    allow_category_change: true,
    components: [
      {
        type: 'BODY',
        text:
          'Olá {{1}}, novidade sobre a tua chamada «{{2}}» com a MoreThanMoney: {{3}}.\n\n' +
          'Os detalhes estão no email que te enviámos. Se precisares de ajuda, responde a esta mensagem.',
        example: { body_text: [['Ana', 'Onboarding de novos membros', 'fica marcada para quinta-feira, 20 de novembro, às 10:00']] },
      },
    ],
  },
  {
    name: 'mtm_reativar',
    language: 'pt_PT',
    category: 'MARKETING',
    components: [
      {
        type: 'BODY',
        text:
          'Olá {{1}}, há algum tempo que não falamos. 🙂 Esta semana temos {{2}} na MoreThanMoney.\n\n' +
          'Queres saber mais? Responde SIM. Se não quiseres receber mais mensagens nossas, responde SAIR.',
        example: { body_text: [['Ana', 'uma aula ao vivo sobre gestão de risco']] },
      },
      { type: 'FOOTER', text: 'Conteúdo educativo, não é aconselhamento financeiro' },
    ],
  },
  {
    /**
     * Reencontro (19/11): 1.ª mensagem a contactos que o Ricardo já conhece. Pede licença; o toque em
     * «Sim, manda» é o opt-in com prova (`lib/whatsapp/fluxo.ts`). Os textos dos botões têm de bater
     * com BOTAO_* em `lib/vendas/guiao-whatsapp.ts`.
     */
    name: 'mtm_reencontro',
    language: 'pt_PT',
    category: 'MARKETING',
    components: [
      {
        type: 'BODY',
        text:
          'Olá {{1}}, é o Ricardo Garcia, da MoreThanMoney. 👋\n\n' +
          'Há algum tempo que não falamos. Estou a preparar uma coisa nova e lembrei-me de ti. ' +
          'Posso mandar-te um áudio curto a explicar?',
        example: { body_text: [['Ana']] },
      },
      { type: 'FOOTER', text: 'Podes deixar de receber a qualquer momento' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Sim, manda' },
          { type: 'QUICK_REPLY', text: 'Agora não' },
          { type: 'QUICK_REPLY', text: 'Não quero receber' },
        ],
      },
    ],
  },
  {
    /**
     * Reencontro v2 (23/11): o mesmo pedido de licença, mas a apresentar o número. Quem recebe tem o
     * Ricardo guardado com o número pessoal, não este; sem isto a 1.ª mensagem chega de um desconhecido.
     * Mesmos botões (BOTAO_* em `lib/vendas/guiao-whatsapp.ts`).
     */
    name: 'mtm_reencontro_v2',
    language: 'pt_PT',
    category: 'MARKETING',
    components: [
      {
        type: 'BODY',
        text:
          'Olá {{1}}, é o Ricardo Garcia 👋\n\n' +
          'Este é o número oficial da MoreThanMoney, o meu número de trabalho (guarda-o, se quiseres). ' +
          'Tinha o teu contacto e lembrei-me de ti: estou a abrir uma coisa nova e queria saber se te interessa.\n\n' +
          'Posso mandar-te um áudio curto, de 1 minuto, a explicar?',
        example: { body_text: [['Ana']] },
      },
      { type: 'FOOTER', text: 'Podes deixar de receber a qualquer momento' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Sim, manda' },
          { type: 'QUICK_REPLY', text: 'Agora não' },
          { type: 'QUICK_REPLY', text: 'Não quero receber' },
        ],
      },
    ],
  },
] as const

/** Template de primeiro contacto para cada interesse do formulário «Quero que me liguem». */
export function templateDoInteresse(interesse: string): { nome: string; comTema: boolean } {
  if (interesse === 'formacao') return { nome: 'mtm_funil_educacao', comTema: false }
  if (interesse === 'rota_corretora') return { nome: 'mtm_funil_corretora', comTema: false }
  if (interesse === 'mtm_funded') return { nome: 'mtm_funil_funded', comTema: false }
  return { nome: 'mtm_resposta_lead', comTema: true }
}

/** Primeiro nome, para o {{1}}. A Meta recusa parâmetros vazios. */
export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] || '👋'
}
