/**
 * OS COMANDOS DA EQUIPA NO BOT — quem abre o quê, e sobretudo o que ninguém abre.
 *
 * PORQUE É QUE ISTO É UM REGISTO E NÃO UMA CADEIA DE `if`
 * O bot já tinha um sítio onde se decide quem pode o quê: uma cadeia de `else if` no webhook, cada
 * um com o seu `if (!await ehChatDeAdmin(...))` copiado à mão. Isso funciona enquanto o autor se
 * lembrar de copiar a linha — e um comando novo sem ela é um painel de administração aberto a quem
 * escreveu o nome certo. Não é hipótese: foi assim que o `/admin` passou meses a dar o painel a
 * quem o escrevesse primeiro (ver `lib/telegram-admin-menu.ts`).
 *
 * Aqui a autorização é DADO e não código: cada comando declara a capacidade que o abre, e a lista
 * de comandos de uma pessoa é o resultado de filtrar este registo pelas capacidades dela. Quem
 * acrescentar um comando tem de escrever a capacidade — não há caminho em que se esqueça, porque
 * sem ela o comando não aparece a ninguém.
 *
 * A REGRA QUE NÃO SE NEGOCEIA
 * O dono, textualmente, sobre os comandos de administração: «essas funções são só para mim como
 * admin». Nenhum comando aqui toca em administração, e isso está PROVADO — não prometido — em
 * `backoffice-telegram-comandos.check.ts`: nomes disjuntos dos do dono, nenhuma capacidade que só
 * o dono tem, e uma varredura ao código que falha se o lado da equipa importar o lado do admin.
 *
 * DINHEIRO
 * Nada aqui muda dinheiro. `/extracto` LÊ o que a pessoa ganhou e mais nada — aprovar ou marcar uma
 * comissão como paga continua a ser do dono, no /admin, com o ecrã todo à frente. Ver o campo
 * `escreve` e a guarda que prende a lista dos que escrevem.
 *
 * Ficheiro PURO: sem base de dados, sem rede, sem `next/*`. A decisão de deixar entrar tem de ser
 * testável num `npx tsx` de dois segundos.
 */
import type { Capacidade } from '@/lib/backoffice-papeis'

/**
 * OS COMANDOS DO DONO — a lista de nomes que o lado da equipa não pode servir, nunca.
 *
 * Vive aqui, ao lado dos comandos da equipa, por uma razão prática: a colisão que interessa é entre
 * as duas listas, e duas listas que se comparam e vivem em ficheiros diferentes acabam a divergir.
 * O webhook continua a ser quem os serve (e a gatear com `ehChatDeAdmin`); isto é a cópia que a
 * guarda verifica, e a guarda falha se um destes nomes deixar de existir no webhook.
 */
export const COMANDOS_DO_DONO = [
  '/admin',
  '/painel',
  '/quem',
  '/cliente',
  '/saldo',
  '/equipa',
  '/pipeline',
  '/comissoes',
  '/comissões',
  '/mlm',
] as const

/** Os botões do painel do dono. O lado da equipa usa `bo:` e nunca toca nestes. */
export const PREFIXO_BOTAO_DONO = 'admin:'
export const PREFIXO_BOTAO_EQUIPA = 'bo:'

/**
 * As capacidades que só o dono tem (`capacidadesDe(..., { admin: true })`).
 *
 * Nenhum comando da equipa pode exigir uma destas: se exigisse, seria por definição uma ferramenta
 * de administração pendurada no lado da equipa — e bastava um dia alguém dar a capacidade a um
 * team leader «só para experimentar» para lhe abrir o comando todo.
 */
export const CAPACIDADES_SO_DO_DONO: readonly Capacidade[] = ['bo.extracto_todos', 'bo.papeis_gerir']

export interface ComandoEquipa {
  /** Com barra, minúsculas, sem argumentos. */
  nome: string
  /**
   * A capacidade que o abre. `null` significa «é a porta da rua» — e há exactamente um desses,
   * o `/ligar`, porque quem ainda não ligou a conta não tem capacidade nenhuma para se mostrar.
   */
  capacidade: Capacidade | null
  /** Uma linha, como aparece no /ajuda de quem o tem. */
  descricao: string
  /** Muda estado? Serve para a guarda prender a lista de escritas e ver o que entrou de novo. */
  escreve: boolean
  /** Aceita argumento a seguir ao nome (`/feito 2`). */
  argumento?: string
}

export const COMANDOS_EQUIPA: readonly ComandoEquipa[] = [
  {
    nome: '/ligar',
    capacidade: null,
    descricao: 'Ligar este Telegram à tua conta MTM (código do backoffice)',
    escreve: true,
    argumento: 'CÓDIGO',
  },
  { nome: '/eu', capacidade: 'bo.entrar', descricao: 'Quem sou eu para o bot: papéis e o que posso', escreve: false },
  { nome: '/hoje', capacidade: 'bo.tarefas_proprias', descricao: 'As tuas tarefas de hoje', escreve: false },
  { nome: '/tarefas', capacidade: 'bo.tarefas_proprias', descricao: 'Todas as tuas tarefas abertas', escreve: false },
  {
    nome: '/feito',
    capacidade: 'bo.tarefas_proprias',
    descricao: 'Riscar uma tarefa pelo número que aparece no /hoje',
    escreve: true,
    argumento: 'nº',
  },
  {
    nome: '/rascunho',
    capacidade: 'bo.tarefas_proprias',
    descricao: 'Ver o rascunho da mensagem de uma tarefa',
    escreve: false,
    argumento: 'nº',
  },
  { nome: '/negocios', capacidade: 'bo.pipeline_proprio', descricao: 'O teu pipeline por estado', escreve: false },
  { nome: '/extracto', capacidade: 'bo.extracto_proprio', descricao: 'O que ganhaste e o que já foi pago', escreve: false },
  { nome: '/link', capacidade: 'bo.material', descricao: 'O teu código e o teu link de registo', escreve: false },
  { nome: '/minhaequipa', capacidade: 'bo.equipa_ver', descricao: 'A tua equipa e o trabalho aberto de cada um', escreve: false },
  { nome: '/avisos', capacidade: 'bo.entrar', descricao: 'Ligar ou desligar o resumo da manhã', escreve: true },
  { nome: '/desligar', capacidade: 'bo.entrar', descricao: 'Desligar este Telegram da tua conta', escreve: true },
]

/**
 * Os comandos da equipa que MUDAM algo. Nenhum mexe em dinheiro, e é a guarda que o prende: se
 * alguém acrescentar um comando com `escreve: true`, o teste falha até a lista ser actualizada à
 * mão — e é nesse momento que se olha para o que se está a deixar escrever pelo telemóvel.
 */
export const ESCRITAS_PERMITIDAS = ['/ligar', '/feito', '/avisos', '/desligar'] as const

export function ehComandoDoDono(texto: string): boolean {
  const nome = primeiroToken(texto)
  return (COMANDOS_DO_DONO as readonly string[]).includes(nome)
}

/**
 * O nome do comando, limpo. `/feito@MoreThanMoney_aibot 2` → `/feito`.
 *
 * O sufixo `@bot` tira-se aqui e não no webhook porque o webhook já o tirou uma vez para os
 * comandos dele — e uma segunda limpeza escrita à mão noutro sítio é a segunda oportunidade de a
 * escrever de outra maneira.
 */
export function primeiroToken(texto: string): string {
  const bruto = (texto ?? '').trim().split(/\s+/)[0] ?? ''
  return bruto.replace(/@[A-Za-z0-9_]+$/, '').toLowerCase()
}

export function argumentoDe(texto: string): string {
  const t = (texto ?? '').trim()
  const espaco = t.search(/\s/)
  return espaco < 0 ? '' : t.slice(espaco + 1).trim()
}

/**
 * Que comando da equipa é este? `null` para tudo o que não seja um.
 *
 * Um comando do dono devolve SEMPRE `null`, mesmo que um dia o webhook chame isto antes de gatear:
 * é o cinto para o caso de alguém mudar a ordem da cadeia de `else if`. O dono disse que essas
 * funções são só dele, e «só dele» tem de continuar verdade quando o ficheiro for reorganizado por
 * quem não leu este comentário.
 */
export function comandoPor(texto: string): ComandoEquipa | null {
  if (ehComandoDoDono(texto)) return null
  const nome = primeiroToken(texto)
  return COMANDOS_EQUIPA.find((c) => c.nome === nome) ?? null
}

/**
 * Os comandos desta pessoa. Negar por omissão, como em `lib/backoffice-papeis.ts`:
 *
 *  · sem `bo.entrar` (quem ainda não ligou a conta, ou quem ficou sem papéis) fica só com a porta;
 *  · com `bo.entrar`, mostra-se exactamente o que as capacidades dela abrem, e nem um a mais.
 */
export function comandosPara(capacidades: ReadonlySet<Capacidade>): ComandoEquipa[] {
  const dentro = capacidades.has('bo.entrar')
  return COMANDOS_EQUIPA.filter((c) => {
    if (c.capacidade === null) return true
    if (!dentro) return false
    return capacidades.has(c.capacidade)
  })
}

export function podeComando(capacidades: ReadonlySet<Capacidade>, comando: ComandoEquipa): boolean {
  if (comando.capacidade === null) return true
  return capacidades.has('bo.entrar') && capacidades.has(comando.capacidade)
}

/**
 * O /ajuda de quem trabalha na equipa.
 *
 * Só lista o que a pessoa pode. Listar o resto «para ela saber que existe» era o erro do /ajuda
 * antigo, que anunciava o painel a toda a gente — e anunciar um comando a quem não o pode usar é
 * convidar a tentar.
 */
export function textoDeAjudaEquipa(
  capacidades: ReadonlySet<Capacidade>,
  opts?: { papeis?: readonly string[] },
): string {
  const lista = comandosPara(capacidades)
  const linhas = lista.map((c) => `${c.nome}${c.argumento ? ` &lt;${c.argumento}&gt;` : ''} — ${c.descricao}`)
  const quem = opts?.papeis?.length ? `\n<i>${opts.papeis.join(' · ')}</i>` : ''

  if (!capacidades.has('bo.entrar')) {
    return (
      '🔗 <b>Trabalhas na equipa MTM?</b>\n\n' +
      'Entra no backoffice, gera o teu código de ligação e escreve-o aqui:\n' +
      '<code>/ligar CÓDIGO</code>\n\n' +
      '<i>O código é teu, de uso único e morre em minutos — não o partilhes.</i>'
    )
  }

  return `👔 <b>O teu trabalho, aqui</b>${quem}\n\n${linhas.join('\n')}`
}
