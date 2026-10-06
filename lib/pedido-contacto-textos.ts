/**
 * Os textos e as listas do «Quero que me liguem» — sem nada de servidor, para o formulário (cliente)
 * mostrar EXACTAMENTE as frases que o servidor grava como prova. A lógica está em
 * `lib/pedido-contacto.ts`, que reexporta isto.
 */
export type CanalContacto = 'chamada' | 'whatsapp' | 'email'
export const CANAIS: readonly CanalContacto[] = ['chamada', 'whatsapp', 'email'] as const

export const INTERESSES = {
  formacao: 'Formação',
  sinais_copy: 'Sinais / copy',
  mtm_funded: 'MTM Funded',
  ea_sensei: 'EA Sensei',
  outro: 'Outro',
} as const
export type Interesse = keyof typeof INTERESSES

export const MELHORES_HORAS = {
  manha: 'Manhã (9h-12h)',
  almoco: 'Hora de almoço (12h-14h)',
  tarde: 'Tarde (14h-19h)',
  noite: 'Noite (19h-21h)',
  qualquer: 'Qualquer hora',
} as const
export type MelhorHora = keyof typeof MELHORES_HORAS

/** Quem contacta e como se sai. Aparece por cima das caixas e vai também para a prova. */
export const QUEM_CONTACTA =
  'Quem te contacta é a MoreThanMoney (morethanmoney.pt), por uma pessoa da equipa ou por um assistente automático em nosso nome.'
export const COMO_SAIR =
  'Para sair basta dizeres «não quero ser contactado» na chamada, responderes SAIR a qualquer mensagem ou usares a ligação de saída em qualquer email. Sais de todos os canais de uma vez.'

/**
 * O texto de cada caixa. Curto, diz quem, por onde, sobre o quê, e que se sai quando se quiser.
 * Nenhuma caixa nasce marcada (`CAIXA_PRE_MARCADA = false` em `captacao-consentimento.ts`).
 */
export const TEXTO_CAIXA: Readonly<Record<CanalContacto, string>> = {
  chamada:
    'Aceito que a MoreThanMoney me telefone para o número indicado, sobre o tema que escolhi. Posso pedir para não voltarem a ligar a qualquer momento.',
  whatsapp:
    'Aceito que a MoreThanMoney me envie mensagens por WhatsApp para o número indicado. Saio quando quiser, respondendo SAIR.',
  email:
    'Aceito receber emails da MoreThanMoney sobre o tema que escolhi e novidades relacionadas. Saio quando quiser, pela ligação em cada email.',
}

/** A prova completa que fica no livro: a frase da caixa + quem contacta + como se sai. */
export function provaDoCanal(canal: CanalContacto): string {
  return `${TEXTO_CAIXA[canal]} ${QUEM_CONTACTA} ${COMO_SAIR}`
}


export const INDICATIVOS = [
  { codigo: '+351', pais: 'Portugal' },
  { codigo: '+55', pais: 'Brasil' },
  { codigo: '+34', pais: 'Espanha' },
  { codigo: '+33', pais: 'França' },
  { codigo: '+41', pais: 'Suíça' },
  { codigo: '+44', pais: 'Reino Unido' },
  { codigo: '+49', pais: 'Alemanha' },
  { codigo: '+352', pais: 'Luxemburgo' },
  { codigo: '+244', pais: 'Angola' },
  { codigo: '+258', pais: 'Moçambique' },
  { codigo: '+238', pais: 'Cabo Verde' },
  { codigo: '+1', pais: 'EUA / Canadá' },
] as const

