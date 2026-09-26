/**
 * O CÓDIGO DE LIGAÇÃO — gerar, resumir, e decidir se serve.
 *
 * PORQUE É QUE A LIGAÇÃO SE FAZ POR CÓDIGO E NÃO PELO EMAIL
 * A pergunta que a porta tem de responder não é «quem é esta pessoa?» — é «como é que se impede
 * esta pessoa de se ligar à conta de outra?». Pelo email não se impede: o email de um colega
 * sabe-se de cor e está escrito em cima de metade das conversas da equipa. Quem escrevesse
 * `/ligar joao@…` passava a receber as tarefas do João e a ver o extracto do João, e o João nunca
 * daria por isso.
 *
 * Com um código gerado DENTRO do backoffice, a identidade foi provada antes de o código existir:
 * para o ver é preciso ter entrado na conta. O bot não autentica ninguém — só verifica um segredo
 * que só a própria pessoa pôde ver. É a mesma regra do painel do dono: a autoridade nunca vem de
 * algo que o próprio chat afirma sobre si.
 *
 * Este ficheiro é PURO (só `node:crypto`, zero base de dados e zero rede) para as decisões — o que
 * é um código bem formado, quando morre, quantas tentativas chegam — poderem ser presas por
 * guardas em vez de testadas com pessoas reais do outro lado.
 */
import { createHash, randomInt } from 'node:crypto'

/**
 * O alfabeto, sem os caracteres que se confundem ao ler de um ecrã para uma conversa.
 *
 * Fora: 0/O, 1/I/L. Um código que se lê mal não é um código mais seguro — é uma pessoa a tentar
 * três vezes, a gastar as tentativas e a pedir ajuda. Trinta caracteres ainda dão 30^8 ≈ 6,5×10^11
 * combinações, que é muito acima do que faz sentido para um segredo que vive quinze minutos.
 */
export const ALFABETO_CODIGO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

export const TAMANHO_CODIGO = 8

/**
 * Quinze minutos. É o tempo de copiar do ecrã para a conversa, e nada mais.
 *
 * Um código que dura um dia é um código que fica esquecido num screenshot, num grupo de equipa ou
 * numa aba aberta — e aí deixa de importar que seja de uso único, porque quem passar por lá usa-o
 * primeiro do que o dono.
 */
export const VALIDADE_MINUTOS = 15

/** Tentativas erradas que um chat pode fazer antes de ficar à espera. */
export const TENTATIVAS_MAXIMAS = 5
export const JANELA_TENTATIVAS_MINUTOS = 15

/**
 * Gera um código. `randomInt` do `node:crypto` e não `Math.random()`: isto é um segredo de acesso,
 * e um gerador previsível transformava oito caracteres numa decoração.
 */
export function gerarCodigo(tamanho: number = TAMANHO_CODIGO): string {
  let out = ''
  for (let i = 0; i < tamanho; i++) out += ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)]
  return out
}

/**
 * Limpa o que a pessoa escreveu.
 *
 * Aceita `ab12 cd34`, `AB12-CD34` e `/ligar  ab12cd34` — maiúsculas, espaços e traços tiram-se. O
 * que NÃO se tenta é adivinhar confusões (um `O` por um zero): o alfabeto já não tem caracteres
 * ambíguos, por isso um caractere de fora é sinal de erro de cópia e não de ambiguidade. Reparar
 * palpites seria alargar em silêncio o espaço de códigos que a força bruta tem de tentar.
 */
export function normalizarCodigo(texto: string): string {
  return (texto ?? '')
    .toUpperCase()
    .replace(/[\s\-_.]/g, '')
    .slice(0, 64)
}

export function ehCodigoBemFormado(codigo: string): boolean {
  if (codigo.length !== TAMANHO_CODIGO) return false
  for (const c of codigo) if (!ALFABETO_CODIGO.includes(c)) return false
  return true
}

/**
 * O resumo que vai para a base. O código em claro NUNCA é guardado: quem conseguir ler a tabela
 * fica com resumos, e com resumos não se escreve nada ao bot.
 */
export function resumoDoCodigo(codigo: string): string {
  return createHash('sha256').update(`backoffice-telegram:${codigo}`).digest('hex')
}

export function expiracaoDe(agora: Date = new Date(), minutos: number = VALIDADE_MINUTOS): Date {
  return new Date(agora.getTime() + minutos * 60_000)
}

export type EstadoCodigo = 'valido' | 'expirado' | 'usado'

/**
 * Serve este código? A ordem importa: um código JÁ USADO responde «usado» mesmo que também esteja
 * expirado, porque as duas coisas pedem respostas diferentes à pessoa («já ligaste» vs «gera
 * outro») e dizer a errada faz uma pessoa tentar o que não resolve.
 */
export function estadoDoCodigo(
  linha: { usadoEm?: string | Date | null; expiraEm: string | Date },
  agora: Date = new Date(),
): EstadoCodigo {
  if (linha.usadoEm) return 'usado'
  const expira = linha.expiraEm instanceof Date ? linha.expiraEm : new Date(linha.expiraEm)
  if (!Number.isFinite(expira.getTime()) || expira.getTime() <= agora.getTime()) return 'expirado'
  return 'valido'
}

export interface Tentativas {
  contagem: number
  janelaInicio: Date
}

/**
 * Conta mais uma tentativa errada, reiniciando a janela quando ela já passou.
 *
 * Devolve estado novo em vez de mexer no que recebe para isto poder ser verificado sem base de
 * dados — e para a rota não ter de decidir se a janela expirou, que é exactamente o género de
 * decisão que se esquece num `if` à pressa.
 */
export function contarTentativa(
  anterior: Tentativas | null,
  agora: Date = new Date(),
  janelaMinutos: number = JANELA_TENTATIVAS_MINUTOS,
): Tentativas {
  const limite = agora.getTime() - janelaMinutos * 60_000
  if (!anterior || anterior.janelaInicio.getTime() <= limite) {
    return { contagem: 1, janelaInicio: agora }
  }
  return { contagem: anterior.contagem + 1, janelaInicio: anterior.janelaInicio }
}

/** Já chega de tentar? Uma janela passada não conta — quem errou há uma hora não está a atacar. */
export function tentativasExcedidas(
  estado: Tentativas | null,
  agora: Date = new Date(),
  maximo: number = TENTATIVAS_MAXIMAS,
  janelaMinutos: number = JANELA_TENTATIVAS_MINUTOS,
): boolean {
  if (!estado) return false
  if (estado.janelaInicio.getTime() <= agora.getTime() - janelaMinutos * 60_000) return false
  return estado.contagem >= maximo
}
