/**
 * O BOT A TRABALHAR COM A EQUIPA — ligar a conta, e responder ao que cada um pode ver.
 *
 * PORQUE É QUE ISTO EXISTE
 * O motor do dia (`lib/backoffice-dia-motor.ts`) prepara o trabalho de cada pessoa todas as manhãs
 * e já sabe escrever-lhe — lê `backoffice_contactos.telegram_chat_id` e manda o resumo. Só que essa
 * tabela nasceu vazia e ficou vazia: não havia porta nenhuma para a preencher. O motor corria a
 * preparar tarefas que ninguém sabia que existiam, e o hábito de abrir o backoffice nunca se criou.
 *
 * Agora a pessoa liga o Telegram uma vez (ver `lib/backoffice-telegram-codigo.ts` para o porquê do
 * código de uso único) e passa a trabalhar por aqui: vê o dia, risca uma tarefa, lê o rascunho da
 * mensagem, vê o seu pipeline e o seu extracto.
 *
 * A LINHA QUE SEPARA OS DOIS MUNDOS, e é a razão de este ficheiro existir separado:
 *
 *   as capacidades de um chat da equipa saem SEMPRE e SÓ dos papéis do backoffice.
 *
 * Um chat ligado nunca ganha autoridade de administração — nem que a conta dele seja `user_type
 * 'admin'` no site. Quem manda no bot continua a ser uma variável de ambiente e um chat só, do
 * outro lado da casa, e este ficheiro não conhece nem um nem outro (há uma guarda a varrer o código
 * para o provar: `backoffice-telegram-comandos.check.ts`). Se um dia alguém der papéis de equipa à
 * própria conta do dono, ele ganha `/hoje` e `/extracto` — não perde nem ganha nada no painel.
 *
 * O QUE ISTO NÃO FAZ
 * Não move dinheiro nem aprova nada: `/extracto` lê. Aprovar uma comissão ou marcá-la como paga
 * continua a ser do dono, no /admin, com o ecrã todo à frente — um polegar a passar por um botão de
 * «pago» numa conversa de telemóvel é uma dívida mal registada à espera de acontecer.
 *
 * Também não envia nada por ninguém. O rascunho mostra-se para ser copiado; quem fala com o cliente
 * é sempre a pessoa. É a mesma fronteira de `lib/backoffice-dia-mensagem.ts`.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { capacidadesDe, PAPEL_NOME, type Capacidade, type Papel } from '@/lib/backoffice-papeis'
import { papeisActivosDe, type ClienteLeitura } from '@/lib/backoffice-papeis-leitura'
import { equipasQueLidera, membrosDasEquipas } from '@/lib/backoffice-equipas'
import { filtroDeParticipacao } from '@/lib/backoffice-negocios'
import { diaEmLisboa } from '@/lib/backoffice-dia-regras'
import { inicioDoDia } from '@/lib/backoffice-paginacao'
import { ESTADO_PIPELINE_NOME, ehEstadoPipeline, ESTADO_COMISSAO_NOME, estadoComissao } from '@/lib/backoffice-vista'
import { getOrCreateReferralCode } from '@/lib/referral'
import {
  PREFIXO_BOTAO_EQUIPA,
  argumentoDe,
  comandoPor,
  podeComando,
  textoDeAjudaEquipa,
  type PapelOuIb,
} from '@/lib/backoffice-telegram-comandos'
import {
  contarTentativa,
  ehCodigoBemFormado,
  estadoDoCodigo,
  expiracaoDe,
  gerarCodigo,
  normalizarCodigo,
  resumoDoCodigo,
  tentativasExcedidas,
  TAMANHO_CODIGO,
  TENTATIVAS_MAXIMAS,
  VALIDADE_MINUTOS,
} from '@/lib/backoffice-telegram-codigo'

type Supa = ReturnType<typeof getSupabaseAdmin>

const SITE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://www.morethanmoney.pt'
const BACKOFFICE = `${SITE}/backoffice`

/** Quantas tarefas cabem numa mensagem sem se deixar de ler. O resto está no backoffice. */
const TAREFAS_NA_MENSAGEM = 5

export interface Resposta {
  texto: string
  teclado?: unknown
}

export interface Trabalhador {
  userId: string
  papeis: Papel[]
  capacidades: Set<Capacidade>
  avisosLigados: boolean
  /**
   * A linha desta pessoa em `ib_membros`, se estiver activa. `null` = não é da rede de IBs.
   *
   * Lê-se aqui, uma vez, e não dentro da bancada do `/ib`: é isto que decide se o comando existe
   * para a pessoa, e uma decisão de acesso tomada no handler é uma decisão que o handler seguinte
   * se esquece de tomar.
   */
  ib: { nivel: string; ibExterno: string | null; corretora: string } | null
  /**
   * O que a pessoa TEM, na linguagem do registo de comandos: os papéis mais o `ib`.
   *
   * Calcula-se uma vez e passa-se inteiro a `podeComando`/`comandosPara`/`textoDeAjudaEquipa`. Se
   * cada sítio montasse a sua lista, bastava um esquecer o `ib` para a bancada da rede desaparecer
   * (ou, pior, um esquecer os papéis e a autorização fechar-se em silêncio no meio de um comando).
   */
  papeisEIb: PapelOuIb[]
}

// ────────────────────────────── QUEM ESTÁ A ESCREVER ──────────────────────────────

/**
 * Quem é o dono deste chat — ou `null`, que significa «não é ninguém da equipa».
 *
 * `capacidadesDe(papeis)` sem mais nada: as capacidades vêm dos papéis e de nada além deles. É
 * aqui que a separação entre a equipa e o painel do dono se cumpre na prática.
 *
 * Uma conta DESACTIVADA fecha a porta, pela mesma razão que `contextoBackoffice` já fecha a do
 * site: quem sai da equipa deixa de a ver no mesmo instante, sem ninguém se lembrar de ir desligar
 * o Telegram dele. E uma falha de leitura devolve `null` — fecha, nunca abre.
 */
export async function trabalhadorDoChat(db: Supa, chatId: string): Promise<Trabalhador | null> {
  try {
    const { data } = await db
      .from('backoffice_contactos')
      .select('user_id, avisos_ligados')
      .eq('telegram_chat_id', chatId)
      .maybeSingle()

    const linha = data as { user_id?: string; avisos_ligados?: boolean } | null
    if (!linha?.user_id) return null

    const [{ data: perfil }, atribuicoes, { data: ibRaw }] = await Promise.all([
      db.from('profiles').select('is_active').eq('id', linha.user_id).maybeSingle(),
      papeisActivosDe(db as unknown as ClienteLeitura, linha.user_id),
      /**
       * `ate is null` é a parte que importa: quem saiu da rede de IBs tem a linha lá com data de
       * fim, e lê-la sem este filtro devolvia-lhe a carteira de clientes de corretora depois de já
       * não ser IB. É a mesma leitura de `app/backoffice/ib/page.tsx` — de propósito: duas
       * maneiras diferentes de perguntar «é IB?» acabam a responder coisas diferentes.
       */
      db
        .from('ib_membros')
        .select('nivel, ib_externo, corretora')
        .eq('user_id', linha.user_id)
        .is('ate', null)
        .maybeSingle(),
    ])
    if ((perfil as { is_active?: boolean } | null)?.is_active === false) return null

    const papeis = atribuicoes.map((a) => a.papel)
    const ibLinha = ibRaw as { nivel?: string; ib_externo?: string | null; corretora?: string } | null
    const ib = ibLinha
      ? {
          nivel: String(ibLinha.nivel ?? 'sub'),
          ibExterno: ibLinha.ib_externo ?? null,
          corretora: String(ibLinha.corretora ?? 'pu_prime'),
        }
      : null

    return {
      userId: linha.user_id,
      papeis,
      capacidades: capacidadesDe(papeis),
      avisosLigados: linha.avisos_ligados !== false,
      ib,
      papeisEIb: ib ? [...papeis, 'ib'] : [...papeis],
    }
  } catch {
    return null
  }
}

// ────────────────────────────── LIGAR E DESLIGAR ──────────────────────────────

/**
 * Cria um código para esta pessoa e devolve-o UMA vez.
 *
 * Os códigos anteriores ainda vivos são fechados antes: dois códigos válidos ao mesmo tempo
 * significa que o que ela gerou ontem e esqueceu num screenshot continua a abrir a conta. Quem gera
 * um novo está a dizer que o anterior já não serve.
 */
export async function criarCodigoDeLigacao(
  db: Supa,
  userId: string,
): Promise<{ codigo: string; expiraEm: string }> {
  const agora = new Date()
  await db
    .from('backoffice_telegram_codigos')
    .update({ expira_em: agora.toISOString() })
    .eq('user_id', userId)
    .is('usado_em', null)
    .gt('expira_em', agora.toISOString())

  const codigo = gerarCodigo()
  const expiraEm = expiracaoDe(agora)
  const { error } = await db.from('backoffice_telegram_codigos').insert({
    codigo_hash: resumoDoCodigo(codigo),
    user_id: userId,
    expira_em: expiraEm.toISOString(),
  })
  if (error) throw new Error(error.message)

  return { codigo, expiraEm: expiraEm.toISOString() }
}

export type MotivoRecusa =
  | 'travado'
  | 'mal_formado'
  | 'invalido'
  | 'expirado'
  | 'usado'
  | 'chat_de_outro'
  | 'sem_papeis'
  | 'erro'

export type ResultadoLigacao =
  | { ok: true; papeis: Papel[] }
  | { ok: false; motivo: MotivoRecusa }

async function lerTentativas(db: Supa, chatId: string) {
  const { data } = await db
    .from('backoffice_telegram_tentativas')
    .select('contagem, janela_inicio')
    .eq('chat_id', chatId)
    .maybeSingle()
  const l = data as { contagem?: number; janela_inicio?: string } | null
  if (!l?.janela_inicio) return null
  return { contagem: Number(l.contagem ?? 0), janelaInicio: new Date(l.janela_inicio) }
}

async function falhou(db: Supa, chatId: string, motivo: MotivoRecusa): Promise<ResultadoLigacao> {
  const seguinte = contarTentativa(await lerTentativas(db, chatId))
  await db
    .from('backoffice_telegram_tentativas')
    .upsert(
      { chat_id: chatId, contagem: seguinte.contagem, janela_inicio: seguinte.janelaInicio.toISOString() },
      { onConflict: 'chat_id' },
    )
  return { ok: false, motivo }
}

/**
 * Consome um código e liga este chat à conta dele.
 *
 * A ORDEM DOS TRAVÕES é deliberada, e cada passo antes do último existe para não gastar o código:
 * primeiro as tentativas (para não se adivinhar à força), depois a forma, depois a existência,
 * depois a validade, depois se o chat já é de outra pessoa, depois se a pessoa tem papéis — e só no
 * fim se marca o código como usado. Um código gasto numa recusa obrigava a pessoa a voltar ao
 * backoffice por uma razão que não era dela.
 */
export async function ligarChatComCodigo(
  db: Supa,
  chatId: string,
  textoCodigo: string,
  username?: string | null,
): Promise<ResultadoLigacao> {
  try {
    if (tentativasExcedidas(await lerTentativas(db, chatId))) return { ok: false, motivo: 'travado' }

    const codigo = normalizarCodigo(textoCodigo)
    if (!ehCodigoBemFormado(codigo)) return falhou(db, chatId, 'mal_formado')

    const { data } = await db
      .from('backoffice_telegram_codigos')
      .select('codigo_hash, user_id, expira_em, usado_em')
      .eq('codigo_hash', resumoDoCodigo(codigo))
      .maybeSingle()

    const linha = data as { codigo_hash: string; user_id: string; expira_em: string; usado_em: string | null } | null
    if (!linha) return falhou(db, chatId, 'invalido')

    const estado = estadoDoCodigo({ expiraEm: linha.expira_em, usadoEm: linha.usado_em })
    if (estado !== 'valido') return { ok: false, motivo: estado }

    // Este telemóvel já é de outra pessoa? A base também o recusa (índice único), mas dizê-lo aqui
    // permite responder porquê em vez de devolver um erro de base que ninguém percebe.
    const { data: jaLigado } = await db
      .from('backoffice_contactos')
      .select('user_id')
      .eq('telegram_chat_id', chatId)
      .maybeSingle()
    const outro = (jaLigado as { user_id?: string } | null)?.user_id
    if (outro && outro !== linha.user_id) return { ok: false, motivo: 'chat_de_outro' }

    const papeis = (await papeisActivosDe(db as unknown as ClienteLeitura, linha.user_id)).map((a) => a.papel)
    // Sem papéis não há nada para mostrar, e ligar o Telegram a uma conta que não entra no
    // backoffice só cria a expectativa de receber o dia de manhã. Diz-se o que falta.
    if (papeis.length === 0) return { ok: false, motivo: 'sem_papeis' }

    const agora = new Date().toISOString()
    const { error: erroContacto } = await db.from('backoffice_contactos').upsert(
      {
        user_id: linha.user_id,
        telegram_chat_id: chatId,
        telegram_username: username ?? null,
        ligado_em: agora,
        atualizado_em: agora,
      },
      { onConflict: 'user_id' },
    )
    if (erroContacto) return { ok: false, motivo: 'chat_de_outro' }

    await db
      .from('backoffice_telegram_codigos')
      .update({ usado_em: agora, usado_por_chat: chatId })
      .eq('codigo_hash', linha.codigo_hash)
      .is('usado_em', null)

    await db.from('backoffice_telegram_tentativas').delete().eq('chat_id', chatId)

    return { ok: true, papeis }
  } catch {
    return { ok: false, motivo: 'erro' }
  }
}

/**
 * Desliga o Telegram desta conta. A LINHA FICA, só sem chat.
 *
 * Apagar a linha apagava também a preferência de avisos — quem desligou os avisos e depois voltou a
 * ligar o Telegram acordava outra vez às 7h sem ter pedido nada.
 */
export async function desligarChat(db: Supa, chatId: string): Promise<boolean> {
  const { error } = await db
    .from('backoffice_contactos')
    .update({ telegram_chat_id: null, ligado_em: null, atualizado_em: new Date().toISOString() })
    .eq('telegram_chat_id', chatId)
  return !error
}

/** Liga/desliga o resumo da manhã. O trabalho continua a ser preparado — deixa só de ser anunciado. */
export async function definirAvisos(db: Supa, chatId: string, ligar: boolean): Promise<boolean> {
  const { error } = await db
    .from('backoffice_contactos')
    .update({ avisos_ligados: ligar, atualizado_em: new Date().toISOString() })
    .eq('telegram_chat_id', chatId)
  return !error
}

// ────────────────────────────── O TRABALHO ──────────────────────────────

interface TarefaLinha {
  id: string
  titulo: string
  descricao: string | null
  rascunho: string | null
  prazo: string | null
}

/**
 * As tarefas que contam para hoje: as abertas com prazo até hoje.
 *
 * «até hoje» e não «igual a hoje», como em `_partes/o-meu-dia.tsx` — uma tarefa de ontem que ficou
 * por fazer continua a ser trabalho de hoje, e esconder--la porque a data passou era a forma mais
 * silenciosa de a perder.
 *
 * A ordem é DETERMINISTA (prazo, depois criação) porque é ela que dá sentido ao número que a pessoa
 * escreve no `/feito 2`: sem ordem fixa, o 2 de agora não era o 2 de há um minuto.
 */
async function tarefasDeHoje(db: Supa, userId: string): Promise<TarefaLinha[]> {
  const { data } = await db
    .from('vendas_tarefas')
    .select('id, titulo, descricao, rascunho, prazo')
    .eq('responsavel_id', userId)
    .eq('estado', 'aberta')
    .lte('prazo', diaEmLisboa())
    .order('prazo', { ascending: true })
    .order('criado_em', { ascending: true })
    .limit(20)
  return (data ?? []) as unknown as TarefaLinha[]
}

function linhasDeTarefas(tarefas: readonly TarefaLinha[]): string {
  return tarefas
    .slice(0, TAREFAS_NA_MENSAGEM)
    .map((t, i) => `${i + 1}. <b>${escapar(t.titulo)}</b>${t.descricao ? `\n   ${escapar(t.descricao)}` : ''}`)
    .join('\n')
}

/** Botões por ID e não por número: o número desloca-se quando se risca uma, o id nunca. */
function tecladoDeTarefas(tarefas: readonly TarefaLinha[]) {
  const visiveis = tarefas.slice(0, TAREFAS_NA_MENSAGEM)
  if (!visiveis.length) return undefined
  return {
    inline_keyboard: [
      visiveis.map((t, i) => ({ text: `✅ ${i + 1}`, callback_data: `${PREFIXO_BOTAO_EQUIPA}f:${t.id}` })),
      visiveis
        .filter((t) => t.rascunho)
        .map((t, i) => ({ text: `📝 ${i + 1}`, callback_data: `${PREFIXO_BOTAO_EQUIPA}r:${t.id}` })),
    ].filter((linha) => linha.length > 0),
  }
}

/** O Telegram interpreta HTML. Um nome com `<` ou `&` rebentava a mensagem toda. */
function escapar(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function euros(cents: number): string {
  return `${(cents / 100).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

async function respostaHoje(db: Supa, t: Trabalhador): Promise<Resposta> {
  const tarefas = await tarefasDeHoje(db, t.userId)
  if (!tarefas.length) {
    return {
      texto:
        '☀️ <b>Nada em atraso para hoje.</b>\n\n' +
        'Se isto te parece pouco, é porque o pipeline está limpo ou porque falta meter negócios lá ' +
        `dentro — vê em <a href="${BACKOFFICE}/pipeline">pipeline</a>.`,
    }
  }
  const extra = tarefas.length > TAREFAS_NA_MENSAGEM ? `\n\n<i>+${tarefas.length - TAREFAS_NA_MENSAGEM} no backoffice.</i>` : ''
  return {
    texto:
      `🗓️ <b>O teu dia — ${diaEmLisboa()}</b>\n\n${linhasDeTarefas(tarefas)}${extra}\n\n` +
      '<i>✅ risca · 📝 mostra o rascunho da mensagem</i>',
    teclado: tecladoDeTarefas(tarefas),
  }
}


async function respostaTarefas(db: Supa, t: Trabalhador): Promise<Resposta> {
  const { data } = await db
    .from('vendas_tarefas')
    .select('titulo, prazo')
    .eq('responsavel_id', t.userId)
    .eq('estado', 'aberta')
    .order('prazo', { ascending: true })
    .limit(15)

  const abertas = (data ?? []) as unknown as Array<{ titulo: string; prazo: string | null }>
  if (!abertas.length) return { texto: '📋 Não tens tarefas abertas.' }

  const hoje = diaEmLisboa()
  const linhas = abertas.map((x) => {
    const sinal = !x.prazo ? '·' : x.prazo < hoje ? '🔴' : x.prazo === hoje ? '🟡' : '⚪'
    return `${sinal} ${escapar(x.titulo)}${x.prazo ? ` <i>(${x.prazo})</i>` : ''}`
  })
  return {
    texto:
      `📋 <b>As tuas tarefas abertas</b> (${abertas.length})\n\n${linhas.join('\n')}\n\n` +
      '<i>🔴 atrasada · 🟡 hoje · ⚪ por vir. Para riscar, usa /hoje.</i>',
  }
}

/**
 * Riscar uma tarefa. Aceita o ID (botão) ou o NÚMERO que apareceu no `/hoje`.
 *
 * O número resolve-se contra a MESMA consulta ordenada que desenhou a lista, e a resposta devolve o
 * título do que foi riscado. Sem esse eco, um número desactualizado fechava silenciosamente a
 * tarefa errada — e uma lista em que não se confia é uma lista que não se usa.
 *
 * O filtro é sempre `responsavel_id = a própria pessoa`, na CONSULTA e não num `if` depois de ler.
 * É a regra de `app/api/backoffice/tarefas/route.ts`, pela mesma razão: uma consulta filtrada não
 * tem como esquecer-se do filtro. Um id de outra pessoa não encontra linha, e a resposta diz só que
 * não encontrou — não confirma que a tarefa existe.
 */
async function riscar(db: Supa, t: Trabalhador, referencia: string): Promise<Resposta> {
  let id = referencia
  if (!/^[0-9a-f-]{36}$/i.test(referencia)) {
    const n = Number.parseInt(referencia, 10)
    const tarefas = await tarefasDeHoje(db, t.userId)
    if (!Number.isInteger(n) || n < 1 || n > Math.min(tarefas.length, TAREFAS_NA_MENSAGEM)) {
      return { texto: 'Escreve <code>/feito 1</code> com o número que aparece no /hoje.' }
    }
    id = tarefas[n - 1].id
  }

  const agora = new Date().toISOString()
  const { data, error } = await db
    .from('vendas_tarefas')
    .update({ estado: 'feita', feita_em: agora, atualizado_em: agora })
    .eq('id', id)
    .eq('responsavel_id', t.userId)
    .eq('estado', 'aberta')
    .select('titulo')
    .maybeSingle()

  if (error) return { texto: '⚠️ Não consegui riscar agora. Tenta outra vez.' }
  const linha = data as { titulo?: string } | null
  if (!linha) return { texto: '🤷 Não encontrei essa tarefa aberta — talvez já esteja riscada.' }
  return { texto: `✅ Riscada: <b>${escapar(linha.titulo ?? '')}</b>` }
}

/** Mostra o rascunho para ser COPIADO. Não há aqui caminho nenhum para este texto sair sozinho. */
async function mostrarRascunho(db: Supa, t: Trabalhador, referencia: string): Promise<Resposta> {
  const tarefas = await tarefasDeHoje(db, t.userId)
  const tarefa = /^[0-9a-f-]{36}$/i.test(referencia)
    ? tarefas.find((x) => x.id === referencia)
    : tarefas[Number.parseInt(referencia, 10) - 1]

  if (!tarefa) return { texto: 'Escreve <code>/rascunho 1</code> com o número que aparece no /hoje.' }
  if (!tarefa.rascunho) {
    return { texto: `📝 <b>${escapar(tarefa.titulo)}</b>\n\nEsta não tem rascunho — escreve-a com as tuas palavras.` }
  }
  return {
    texto:
      `📝 <b>${escapar(tarefa.titulo)}</b>\n\n<code>${escapar(tarefa.rascunho)}</code>\n\n` +
      '<i>Lê, corrige e envia tu. O bot não fala com clientes por ti.</i>',
  }
}

async function respostaNegocios(db: Supa, t: Trabalhador): Promise<Resposta> {
  const filtro = filtroDeParticipacao([t.userId])
  // `null` significa NÃO LER e nunca «ler tudo» — ver `lib/backoffice-negocios.ts`.
  if (!filtro) return { texto: '⚠️ Não consegui ler o teu pipeline.' }

  const { data } = await db
    .from('vendas_negocios')
    .select('nome, estado, atualizado_em')
    .or(filtro)
    .not('estado', 'in', '("ganho","perdido")')
    .order('atualizado_em', { ascending: true })
    .limit(40)

  const negocios = (data ?? []) as unknown as Array<{ nome: string; estado: string; atualizado_em: string }>
  if (!negocios.length) {
    return {
      texto:
        '📭 <b>Não tens negócios vivos.</b>\n\n' +
        `Os leads que chegam entram sozinhos no pipeline todas as manhãs. Se não aparece nada, fala com o Ricardo — ou mete um à mão em <a href="${BACKOFFICE}/pipeline">pipeline</a>.`,
    }
  }

  const porEstado = new Map<string, number>()
  for (const n of negocios) porEstado.set(n.estado, (porEstado.get(n.estado) ?? 0) + 1)
  const resumo = [...porEstado.entries()]
    .map(([e, n]) => `${ehEstadoPipeline(e) ? ESTADO_PIPELINE_NOME[e] : e}: <b>${n}</b>`)
    .join(' · ')

  // Os cinco mais PARADOS primeiro (a consulta já vem por `atualizado_em` crescente): é onde está
  // o dinheiro a apodrecer, e é a única parte da lista que muda o que a pessoa faz a seguir.
  const parados = negocios
    .slice(0, 5)
    .map(
      (n) =>
        `· ${escapar(n.nome)} — ${ehEstadoPipeline(n.estado) ? ESTADO_PIPELINE_NOME[n.estado] : n.estado} <i>(mexido a ${String(n.atualizado_em).slice(0, 10)})</i>`,
    )

  return {
    texto:
      `📋 <b>O teu pipeline</b> (${negocios.length} vivos)\n\n${resumo}\n\n` +
      `<b>Há mais tempo sem mexer:</b>\n${parados.join('\n')}\n\n` +
      `<a href="${BACKOFFICE}/pipeline">Abrir o pipeline</a>`,
  }
}

/**
 * O extracto — LER, e só ler.
 *
 * Nada neste ficheiro aprova nem paga uma comissão: isso é do dono, no /admin, com o rasto de quem
 * mudou o quê (`vendas_comissoes_historico`). Um botão de «pago» numa conversa de telemóvel é uma
 * dívida mal registada à espera de acontecer.
 *
 * O sinal vem da vista `vendas_extracto` e não de uma conta feita aqui: uma comissão paga e depois
 * estornada conta negativo, e somá-la como positiva era prometer a alguém dinheiro devolvido.
 */
async function respostaExtracto(db: Supa, t: Trabalhador): Promise<Resposta> {
  const { data } = await db
    .from('vendas_extracto')
    .select('origem, detalhe, valor_cents, estado, em, sinal')
    .eq('pessoa_id', t.userId)
    .order('em', { ascending: false })
    .limit(100)

  const linhas = (data ?? []) as unknown as Array<{
    origem: string
    detalhe: string | null
    valor_cents: number
    estado: string
    em: string
    sinal: number
  }>
  if (!linhas.length) {
    return {
      texto:
        '💸 <b>Ainda não tens nada no extracto.</b>\n\n' +
        'Uma comissão só nasce de um pagamento confirmado — o estado do negócio no ecrã não cria dinheiro.',
    }
  }

  const soma = { pendente: 0, aprovada: 0, paga: 0 }
  for (const l of linhas) {
    const e = estadoComissao(l.estado)
    const v = Number(l.valor_cents ?? 0) * (Number(l.sinal ?? 1) < 0 ? -1 : 1)
    if (e === 'pendente') soma.pendente += v
    else if (e === 'aprovada') soma.aprovada += v
    else if (e === 'paga') soma.paga += v
  }

  const ultimas = linhas.slice(0, 5).map((l) => {
    const e = estadoComissao(l.estado)
    const v = Number(l.valor_cents) * (Number(l.sinal) < 0 ? -1 : 1)
    return `· ${euros(v)} — ${escapar(l.detalhe ?? l.origem)} <i>(${ESTADO_COMISSAO_NOME[e]}, ${String(l.em).slice(0, 10)})</i>`
  })

  return {
    texto:
      '💸 <b>O teu extracto</b>\n\n' +
      `${ESTADO_COMISSAO_NOME.paga}: <b>${euros(soma.paga)}</b>\n` +
      `${ESTADO_COMISSAO_NOME.aprovada}: <b>${euros(soma.aprovada)}</b>\n` +
      `${ESTADO_COMISSAO_NOME.pendente}: <b>${euros(soma.pendente)}</b>\n\n` +
      `<b>Últimas:</b>\n${ultimas.join('\n')}\n\n` +
      `<a href="${BACKOFFICE}/extracto">Abrir o extracto</a>\n` +
      '<i>Aprovar e pagar é do Ricardo — aqui só se consulta.</i>',
  }
}

/**
 * O link da pessoa. É o `referral_code` do perfil, o MESMO que o site usa no `?ref=`.
 *
 * Não se inventa aqui um segundo código: dois códigos para a mesma pessoa dão duas contagens da
 * mesma indicação, e nenhuma das duas se consegue provar (ver `app/backoffice/material/page.tsx`).
 */
async function respostaLink(db: Supa, t: Trabalhador): Promise<Resposta> {
  let codigo: string | null = null
  try {
    codigo = await getOrCreateReferralCode(db as never, t.userId)
  } catch {
    codigo = null
  }
  if (!codigo) {
    return { texto: `⚠️ Não consegui obter o teu código. Vê em <a href="${BACKOFFICE}/material">materiais</a>.` }
  }

  return {
    texto:
      '🔗 <b>O teu link</b>\n\n' +
      `Código: <code>${escapar(codigo)}</code>\n` +
      `Registo: <code>${SITE}/register?ref=${escapar(codigo)}</code>\n\n` +
      'Quem se registar por aí fica ligado a ti.\n' +
      '<i>No iPhone a subscrição faz-se DENTRO da app — nunca mandes um link de pagamento a quem está em iOS.</i>\n\n' +
      `<a href="${BACKOFFICE}/material">Materiais e gerador de peças</a>`,
  }
}

/**
 * A equipa de um team leader: quem é, e quanto trabalho aberto tem cada um.
 *
 * Só CONTAGENS por pessoa, e não os títulos das tarefas nem os nomes dos negócios dela. Quem lidera
 * precisa de saber quem está a afogar-se; não precisa de ler a lista de contactos que o colega está
 * a trabalhar. O detalhe está no backoffice, onde o âmbito é verificado linha a linha.
 */
async function respostaEquipa(db: Supa, t: Trabalhador): Promise<Resposta> {
  const equipas = await equipasQueLidera(db as never, t.userId)
  if (!equipas.length) return { texto: '👥 Não lideras nenhuma equipa activa.' }

  const membros = await membrosDasEquipas(
    db as never,
    equipas.map((e) => e.id),
  )
  const ids = [...new Set(membros.map((m) => m.membroId))].filter((id) => id !== t.userId)
  if (!ids.length) {
    return { texto: `👥 <b>${escapar(equipas.map((e) => e.nome).join(' · '))}</b>\n\nAinda não tem membros.` }
  }

  const [{ data: perfis }, { data: tarefas }] = await Promise.all([
    db.from('profiles').select('id, full_name, email').in('id', ids),
    db.from('vendas_tarefas').select('responsavel_id, prazo').in('responsavel_id', ids).eq('estado', 'aberta'),
  ])

  const nome = new Map<string, string>()
  for (const p of (perfis ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
    nome.set(p.id, p.full_name || p.email || p.id.slice(0, 8))
  }

  const hoje = diaEmLisboa()
  const contagem = new Map<string, { abertas: number; atrasadas: number }>()
  for (const x of (tarefas ?? []) as Array<{ responsavel_id: string; prazo: string | null }>) {
    const c = contagem.get(x.responsavel_id) ?? { abertas: 0, atrasadas: 0 }
    c.abertas++
    if (x.prazo && x.prazo < hoje) c.atrasadas++
    contagem.set(x.responsavel_id, c)
  }

  const linhas = ids.map((id) => {
    const c = contagem.get(id) ?? { abertas: 0, atrasadas: 0 }
    const alerta = c.atrasadas > 0 ? ` 🔴 ${c.atrasadas} em atraso` : ''
    return `· ${escapar(nome.get(id) ?? id.slice(0, 8))} — ${c.abertas} aberta(s)${alerta}`
  })

  return {
    texto:
      `👥 <b>${escapar(equipas.map((e) => e.nome).join(' · '))}</b>\n\n${linhas.join('\n')}\n\n` +
      `<a href="${BACKOFFICE}/equipa">Abrir a equipa</a>`,
  }
}

function respostaEu(t: Trabalhador): Resposta {
  return {
    texto:
      '👔 <b>Quem és, para mim</b>\n\n' +
      `Papéis: <b>${t.papeis.map((p) => PAPEL_NOME[p]).join(' · ') || '—'}</b>\n` +
      // O IB aparece à parte porque não é papel: é pertença a `ib_membros` (migração 138).
      (t.ib ? `Rede de IBs: <b>${t.ib.nivel === 'master' ? 'master' : 'sub'}</b>\n` : '') +
      `Resumo da manhã: <b>${t.avisosLigados ? 'ligado' : 'desligado'}</b>\n\n` +
      textoDeAjudaEquipa(t.capacidades, { papeis: t.papeisEIb }),
  }
}

// ────────────────────────────── AS BANCADAS POR PAPEL ──────────────────────────────

/**
 * UMA BANCADA POR FUNÇÃO — e a razão de não ser um `/hoje` maior.
 *
 * O `/hoje` responde «o que tenho de fazer», e é igual para todos. O que o dono pediu é outra
 * coisa: cada função tem uma pergunta própria que faz ao pegar no telemóvel — o prospector quer
 * saber quantos nomes lhe faltam tocar, o setter quantos já podia estar a marcar, o closer o que
 * decide hoje. Misturar isso tudo numa mensagem só dava a mensagem que ninguém lê.
 *
 * NENHUMA ESCREVE. São leituras do que já está na base, e o `ESCRITAS_PERMITIDAS` do registo prende
 * isso: uma bancada que passe a escrever faz falhar a guarda até alguém decidir, com o ecrã à
 * frente, que se pode mudar aquilo pelo telemóvel.
 *
 * O ÂMBITO É SEMPRE A COLUNA DO PAPEL. `/setter` lê por `setter_id`, `/closer` por `closer_id`,
 * `/prospector` por `prospector_id`. Não se usa aqui o `filtroDeParticipacao` (que junta as cinco
 * atribuições) de propósito: numa bancada de função, ver os negócios em que se participou com
 * OUTRO papel é ver a lista de trabalho de outra pessoa — que é exactamente o que o papel no
 * registo de comandos existe para impedir.
 */

/** A meia-noite do dia de Lisboa, em UTC — a mesma fronteira do resto do backoffice. */
function desdeMeiaNoite(): string {
  // `inicioDoDia` só devolve `null` para um dia nulo, e `diaEmLisboa()` nunca o é.
  return inicioDoDia(diaEmLisboa()) ?? `${diaEmLisboa()}T00:00:00.000Z`
}

/** Quantos dias sem ninguém mexer. É o número que diz o que está a apodrecer. */
function diasParado(quando: string | null): number {
  const t = Date.parse(String(quando ?? ''))
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}

/** Um negócio parado há mais de isto ARREFECEU. Três dias é a decisão, e está escrita num sítio só. */
const DIAS_PARA_ARREFECER = 3

function nomeDoEstado(estado: string): string {
  return ehEstadoPipeline(estado) ? ESTADO_PIPELINE_NOME[estado] : estado
}

interface NegocioBancada {
  nome: string
  estado: string
  origem: string | null
  pack_previsto: string | null
  atualizado_em: string
}

const COLUNAS_BANCADA = 'nome, estado, origem, pack_previsto, atualizado_em'

/** Os negócios desta pessoa NESTE papel, vivos, dos mais parados para os menos. */
async function negociosDoPapel(
  db: Supa,
  userId: string,
  coluna: 'prospector_id' | 'setter_id' | 'closer_id' | 'afiliado_id',
  estados: readonly string[],
): Promise<NegocioBancada[]> {
  const { data } = await db
    .from('vendas_negocios')
    .select(COLUNAS_BANCADA)
    .eq(coluna, userId)
    .in('estado', estados)
    .order('atualizado_em', { ascending: true })
    .limit(200)
  return (data ?? []) as unknown as NegocioBancada[]
}

function linhasDeNegocios(negocios: readonly NegocioBancada[], quantos = 3): string {
  return negocios
    .slice(0, quantos)
    .map((n) => {
      const dias = diasParado(n.atualizado_em)
      const parado = dias > 0 ? ` <i>(${dias} dia${dias === 1 ? '' : 's'} sem mexer)</i>` : ''
      return `· ${escapar(n.nome)} — ${nomeDoEstado(n.estado)}${parado}`
    })
    .join('\n')
}

/**
 * A BANCADA DO PROSPECTOR — nomes por trabalhar, o que já tocou hoje, e por quem pegar a seguir.
 *
 * «Tocou hoje» conta EVENTOS do pipeline (`vendas_negocio_eventos.por`), que é o rasto de quem
 * mexeu o quê. Contar negócios com `atualizado_em` de hoje daria outro número — o motor da manhã
 * também mexe nas linhas, e a pessoa via trabalho que não fez.
 */
async function respostaProspector(db: Supa, t: Trabalhador): Promise<Resposta> {
  const [porTrabalhar, { data: eventos }] = await Promise.all([
    negociosDoPapel(db, t.userId, 'prospector_id', ['lead', 'contactado']),
    db.from('vendas_negocio_eventos').select('negocio_id').eq('por', t.userId).gte('em', desdeMeiaNoite()).limit(500),
  ])

  const tocadosHoje = new Set((eventos ?? []).map((e) => String((e as { negocio_id: string }).negocio_id))).size

  if (!porTrabalhar.length) {
    return {
      texto:
        '🎯 <b>Bancada de prospeção</b>\n\n' +
        `Tocados hoje: <b>${tocadosHoje}</b>\n` +
        'Por trabalhar: <b>0</b>\n\n' +
        'Não tens nomes atribuídos. Há leads sem dono à espera de alguém — abre a bolsa em ' +
        `<a href="${BACKOFFICE}/pipeline">pipeline</a> e pega nos que quiseres.`,
    }
  }

  const frios = porTrabalhar.filter((n) => diasParado(n.atualizado_em) >= DIAS_PARA_ARREFECER).length
  const proximo = porTrabalhar[0]

  return {
    texto:
      '🎯 <b>Bancada de prospeção</b>\n\n' +
      `Por trabalhar: <b>${porTrabalhar.length}</b>` +
      `${frios ? ` (${frios} há ${DIAS_PARA_ARREFECER}+ dias)` : ''}\n` +
      `Tocados hoje: <b>${tocadosHoje}</b>\n\n` +
      `<b>O próximo:</b>\n· ${escapar(proximo.nome)} — ${nomeDoEstado(proximo.estado)}` +
      `${proximo.origem ? ` <i>(veio de ${escapar(proximo.origem)})</i>` : ''}\n\n` +
      (porTrabalhar.length > 1 ? `<b>E depois:</b>\n${linhasDeNegocios(porTrabalhar.slice(1), 3)}\n\n` : '') +
      `<a href="${BACKOFFICE}/pipeline">Abrir o pipeline</a>`,
  }
}

/**
 * A BANCADA DO SETTER — o que já podia estar marcado, o que está marcado, e o que arrefeceu.
 *
 * «Arrefeceu» não é um estado na base: é um negócio à espera de marcação parado há
 * `DIAS_PARA_ARREFECER` dias, mais os `no_show`. Inventar uma coluna para isto obrigava alguém a
 * ir marcá-la à mão todos os dias — e o que ninguém marca fica sempre a mentir.
 */
async function respostaSetter(db: Supa, t: Trabalhador): Promise<Resposta> {
  // `apresentado` entra na consulta e não em nenhuma das contagens: o trabalho do setter acaba na
  // marcação. Está aqui para que quem tem só apresentações não leia «não tens negócios atribuídos»,
  // que seria falso e mandava a pessoa pegar leads na bolsa sem precisar.
  const vivos = await negociosDoPapel(db, t.userId, 'setter_id', [
    'lead',
    'contactado',
    'qualificado',
    'marcado',
    'no_show',
    'apresentado',
  ])
  if (!vivos.length) {
    return {
      texto:
        '📅 <b>Bancada de marcação</b>\n\n' +
        'Não tens negócios atribuídos como setter. Se há leads à espera, pega neles na bolsa em ' +
        `<a href="${BACKOFFICE}/pipeline">pipeline</a>.`,
    }
  }

  const porMarcar = vivos.filter((n) => n.estado === 'lead' || n.estado === 'contactado' || n.estado === 'qualificado')
  const marcados = vivos.filter((n) => n.estado === 'marcado')
  const arrefeceram = [
    ...vivos.filter((n) => n.estado === 'no_show'),
    ...porMarcar.filter((n) => diasParado(n.atualizado_em) >= DIAS_PARA_ARREFECER),
  ]

  return {
    texto:
      '📅 <b>Bancada de marcação</b>\n\n' +
      `À espera de marcação: <b>${porMarcar.length}</b>\n` +
      `Reuniões marcadas: <b>${marcados.length}</b>\n` +
      `Arrefeceram: <b>${arrefeceram.length}</b>\n\n` +
      (porMarcar.length ? `<b>Liga a estes:</b>\n${linhasDeNegocios(porMarcar, 3)}\n\n` : '') +
      (marcados.length ? `<b>Marcados:</b>\n${linhasDeNegocios(marcados, 3)}\n\n` : '') +
      (arrefeceram.length ? `<b>Arrefeceram (${DIAS_PARA_ARREFECER}+ dias ou faltaram):</b>\n${linhasDeNegocios(arrefeceram, 3)}\n\n` : '') +
      `<a href="${BACKOFFICE}/pipeline">Abrir o pipeline</a>`,
  }
}

/**
 * A BANCADA DO CLOSER — o que está em fecho, o que está em jogo, e o que decide hoje.
 *
 * SOBRE «O VALOR EM JOGO»: não se mostra em euros, e é uma ausência deliberada. `pack_previsto` é
 * um `planId` da escada e NÃO existe em nenhum sítio uma tabela que diga quanto vale cada plano em
 * cêntimos (`lib/stripe-prices.ts` guarda o id do preço no Stripe, não o montante). Escrever aqui
 * uma soma em euros obrigava a inventar preços no código — e um número inventado numa bancada de
 * fecho passa a ser a previsão de facturação de alguém. Mostra-se por isso o que é verdade: os
 * packs que estão em jogo, e os euros que são REAIS (as comissões da própria pessoa, do extracto).
 */
async function respostaCloser(db: Supa, t: Trabalhador): Promise<Resposta> {
  const [emFecho, { data: tarefas }, { data: extracto }] = await Promise.all([
    negociosDoPapel(db, t.userId, 'closer_id', ['qualificado', 'marcado', 'apresentado']),
    db
      .from('vendas_tarefas')
      .select('titulo')
      .eq('responsavel_id', t.userId)
      .eq('papel', 'closer')
      .eq('estado', 'aberta')
      .lte('prazo', diaEmLisboa())
      .order('prazo', { ascending: true })
      .limit(5),
    db.from('vendas_extracto').select('valor_cents, estado, sinal').eq('pessoa_id', t.userId).limit(500),
  ])

  // Euros a haver: só o que já existe como comissão. Nada disto é previsão.
  let aHaver = 0
  for (const l of (extracto ?? []) as Array<{ valor_cents: number; estado: string; sinal: number }>) {
    const e = estadoComissao(l.estado)
    if (e !== 'pendente' && e !== 'aprovada') continue
    aHaver += Number(l.valor_cents ?? 0) * (Number(l.sinal ?? 1) < 0 ? -1 : 1)
  }

  if (!emFecho.length) {
    return {
      texto:
        '🤝 <b>Bancada de fecho</b>\n\n' +
        'Não tens nada em fecho.\n' +
        `A haver (comissões já criadas): <b>${euros(aHaver)}</b>\n\n` +
        `Se há apresentações marcadas por outra pessoa, elas aparecem-te quando ficares como closer — vê em <a href="${BACKOFFICE}/pipeline">pipeline</a>.`,
    }
  }

  const apresentados = emFecho.filter((n) => n.estado === 'apresentado')
  const packs = new Map<string, number>()
  for (const n of emFecho) {
    const k = n.pack_previsto?.trim() || 'sem pack previsto'
    packs.set(k, (packs.get(k) ?? 0) + 1)
  }
  const emJogo = [...packs.entries()].map(([k, n]) => `${escapar(k)}: <b>${n}</b>`).join(' · ')

  // O que precisa de decisão HOJE: quem já viu a apresentação e está parado, mais as tarefas de
  // closer com prazo até hoje. Uma apresentação feita que ninguém volta a tocar é uma venda perdida
  // por silêncio, e é o único sítio onde isso aparece a quem a pode fechar.
  const decidemHoje = apresentados.filter((n) => diasParado(n.atualizado_em) >= 1)
  const linhasTarefas = ((tarefas ?? []) as Array<{ titulo: string }>).map((x) => `· ${escapar(x.titulo)}`)

  return {
    texto:
      '🤝 <b>Bancada de fecho</b>\n\n' +
      `Em fecho: <b>${emFecho.length}</b> (${apresentados.length} já apresentados)\n` +
      `A haver (comissões já criadas): <b>${euros(aHaver)}</b>\n\n` +
      `<b>Em jogo (packs previstos):</b>\n${emJogo}\n` +
      '<i>Os packs não têm preço no sistema — o valor em euros só existe quando o pagamento entra.</i>\n\n' +
      (decidemHoje.length
        ? `<b>Precisa de decisão hoje:</b>\n${linhasDeNegocios(decidemHoje, 3)}\n\n`
        : `<b>A trabalhar:</b>\n${linhasDeNegocios(emFecho, 3)}\n\n`) +
      (linhasTarefas.length ? `<b>Tarefas de fecho para hoje:</b>\n${linhasTarefas.join('\n')}\n\n` : '') +
      `<a href="${BACKOFFICE}/pipeline">Abrir o pipeline</a>`,
  }
}

function usd(v: number): string {
  return `${v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`
}

interface ContaIb {
  conta: string
  corretora: string
  cliente_nome: string | null
  volume_lotes: number | null
  comissao_usd: number | null
  estado_migracao: string
}

/**
 * A BANCADA DO IB — as contas da rede dele, o que rendem, e quem vale a pena trazer para casa.
 *
 * O ÂMBITO, que é a parte séria: isto traz nome de cliente de corretora e volume negociado. Um
 * `sub` vê as contas que lhe estão atribuídas (`ib_id`) ou que trazem o identificador dele na
 * corretora (`ib_externo`); o `master`, que responde pela rede inteira perante a corretora, vê
 * tudo. Sem `ib_externo` e sem contas atribuídas, um sub não vê NADA — e diz-se-lhe porquê, em vez
 * de lhe mostrar a carteira dos outros «porque o filtro deu vazio».
 *
 * Nada aqui contacta ninguém nem mexe numa conta: mostra e ordena.
 */
async function respostaIb(db: Supa, t: Trabalhador): Promise<Resposta> {
  // Chega aqui só quem tem `ib` (é o `papel: 'ib'` do registo). O `if` é o cinto: se um dia a
  // autorização for reorganizada, isto fecha em vez de servir a carteira a quem não é IB.
  if (!t.ib) return { texto: '⛔ Não fazes parte da rede de IBs.' }

  const master = t.ib.nivel === 'master'
  let contas: ContaIb[] = []

  if (master) {
    const { data } = await db
      .from('ib_contas')
      .select('conta, corretora, cliente_nome, volume_lotes, comissao_usd, estado_migracao')
      .limit(2000)
    contas = (data ?? []) as unknown as ContaIb[]
  } else {
    const alvos = [`ib_id.eq.${t.userId}`]
    // O identificador na corretora é texto e vem da própria linha de `ib_membros` — mas é texto
    // montado num filtro, e por isso só entra se for mesmo alfanumérico. Um `ib_externo` com
    // vírgulas ou parêntesis quebrava o `or` e mudava o que a consulta devolve.
    const externo = (t.ib.ibExterno ?? '').trim()
    if (/^[A-Za-z0-9_-]{1,32}$/.test(externo)) alvos.push(`ib_externo.eq.${externo}`)

    const { data } = await db
      .from('ib_contas')
      .select('conta, corretora, cliente_nome, volume_lotes, comissao_usd, estado_migracao')
      .or(alvos.join(','))
      .limit(2000)
    contas = (data ?? []) as unknown as ContaIb[]
  }

  if (!contas.length) {
    const semIdentificador = !master && !t.ib.ibExterno
    return {
      texto:
        '🏦 <b>A tua rede de IB</b>\n\n' +
        'Nenhuma conta atribuída a ti.\n\n' +
        (semIdentificador
          ? 'Ainda não tens identificador próprio na corretora — sem ele nenhuma linha das exportações te pode ser atribuída. É o passo seguinte: fala com o Ricardo.'
          : `As contas entram por importação das exportações da corretora — vê em <a href="${BACKOFFICE}/ib">rede de IBs</a>.`),
    }
  }

  let lotes = 0
  let comissao = 0
  const porEstado = new Map<string, number>()
  for (const c of contas) {
    lotes += Number(c.volume_lotes ?? 0)
    comissao += Number(c.comissao_usd ?? 0)
    porEstado.set(c.estado_migracao, (porEstado.get(c.estado_migracao) ?? 0) + 1)
  }

  /**
   * «Quem vale a pena trazer» = as que estão noutra corretora e ainda valem volume, pela ordem do
   * que se ganha em as trazer. A ordem é a MESMA de `app/backoffice/ib/page.tsx` (lotes a pesar dez
   * vezes mais do que a comissão) de propósito: duas ordens diferentes punham a página e o bot a
   * dizer a pessoas diferentes que a prioridade era outra.
   */
  const aTrazer = contas
    .filter((c) => c.estado_migracao === 'a_transitar')
    .sort(
      (a, b) =>
        (b.volume_lotes ?? 0) * 10 + (b.comissao_usd ?? 0) - ((a.volume_lotes ?? 0) * 10 + (a.comissao_usd ?? 0)),
    )
    .slice(0, 3)
    .map(
      (c) =>
        `· ${escapar(c.cliente_nome || `conta ${c.conta}`)} — ${escapar(c.corretora)} · ${Number(c.volume_lotes ?? 0).toFixed(2)} lotes · ${usd(Number(c.comissao_usd ?? 0))}`,
    )

  const naCasa = porEstado.get('na_casa') ?? 0
  const porAvaliar = porEstado.get('por_avaliar') ?? 0

  return {
    texto:
      `🏦 <b>A tua rede de IB</b> (${master ? 'master — a rede toda' : 'as tuas contas'})\n\n` +
      `Contas: <b>${contas.length}</b> · na casa: <b>${naCasa}</b> · por avaliar: <b>${porAvaliar}</b>\n` +
      `Volume: <b>${lotes.toFixed(2)} lotes</b>\n` +
      `Comissão: <b>${usd(comissao)}</b>\n\n` +
      (aTrazer.length
        ? `<b>Vale a pena trazer (${porEstado.get('a_transitar') ?? 0} a transitar):</b>\n${aTrazer.join('\n')}\n\n`
        : 'Nenhuma conta marcada como «a transitar» — nada por trazer neste momento.\n\n') +
      `<a href="${BACKOFFICE}/ib">Abrir a rede de IBs</a>\n` +
      '<i>A comissão é a que a corretora exportou, em dólares. Não é o teu extracto.</i>',
  }
}

/**
 * A BANCADA DO AFILIADO — o link, quem entrou por ele, e o que isso rendeu.
 *
 * O código é o `referral_code` do perfil, o MESMO que o site usa — ver `respostaLink` para o porquê
 * de não haver um segundo. Aqui junta-se-lhe o resultado: quantos se registaram com ele, quantos
 * negócios lhe estão atribuídos como afiliado, e os euros que já são comissão de afiliado.
 *
 * Os euros vêm de `vendas_extracto` filtrado por `origem = 'papel'` e `detalhe = 'afiliado'`: é a
 * comissão do PAPEL de afiliado e não o MLM binário, que é dinheiro da árvore e aparece no
 * /extracto com a sua própria origem. Somar os dois aqui dava-lhe o crédito da divulgação por
 * dinheiro que veio de outro sítio.
 */
async function respostaAfiliado(db: Supa, t: Trabalhador): Promise<Resposta> {
  let codigo: string | null = null
  try {
    codigo = await getOrCreateReferralCode(db as never, t.userId)
  } catch {
    codigo = null
  }

  const [{ data: entrados }, negocios, { data: extracto }] = await Promise.all([
    db.from('referrals').select('referred_id').eq('referrer_id', t.userId).limit(500),
    negociosDoPapel(db, t.userId, 'afiliado_id', [
      'lead',
      'contactado',
      'qualificado',
      'marcado',
      'no_show',
      'apresentado',
      'ganho',
    ]),
    db
      .from('vendas_extracto')
      .select('valor_cents, estado, sinal, detalhe, origem')
      .eq('pessoa_id', t.userId)
      .eq('origem', 'papel')
      .eq('detalhe', 'afiliado')
      .limit(500),
  ])

  const quantos = ((entrados ?? []) as Array<{ referred_id: string }>).length
  const ganhos = negocios.filter((n) => n.estado === 'ganho').length

  const soma = { pendente: 0, aprovada: 0, paga: 0 }
  for (const l of (extracto ?? []) as Array<{ valor_cents: number; estado: string; sinal: number }>) {
    const e = estadoComissao(l.estado)
    const v = Number(l.valor_cents ?? 0) * (Number(l.sinal ?? 1) < 0 ? -1 : 1)
    if (e === 'pendente') soma.pendente += v
    else if (e === 'aprovada') soma.aprovada += v
    else if (e === 'paga') soma.paga += v
  }

  const linkLinha = codigo
    ? `Código: <code>${escapar(codigo)}</code>\nRegisto: <code>${SITE}/register?ref=${escapar(codigo)}</code>`
    : `⚠️ Não consegui obter o teu código — vê em <a href="${BACKOFFICE}/material">materiais</a>.`

  return {
    texto:
      '📣 <b>A tua divulgação</b>\n\n' +
      `${linkLinha}\n\n` +
      `Registaram-se com o teu código: <b>${quantos}</b>\n` +
      `Negócios atribuídos a ti como afiliado: <b>${negocios.length}</b>${ganhos ? ` (${ganhos} ganhos)` : ''}\n\n` +
      `<b>Comissão de afiliado:</b>\n` +
      `${ESTADO_COMISSAO_NOME.paga}: <b>${euros(soma.paga)}</b> · ` +
      `${ESTADO_COMISSAO_NOME.aprovada}: <b>${euros(soma.aprovada)}</b> · ` +
      `${ESTADO_COMISSAO_NOME.pendente}: <b>${euros(soma.pendente)}</b>\n` +
      '<i>Só o papel de afiliado. O MLM da árvore aparece no /extracto, com a sua origem.</i>\n\n' +
      (negocios.length ? `<b>Os mais parados:</b>\n${linhasDeNegocios(negocios, 3)}\n\n` : '') +
      `<a href="${BACKOFFICE}/material">Materiais</a> · <a href="${BACKOFFICE}/extracto">Extracto</a>`,
  }
}

// ────────────────────────────── O DESPACHO ──────────────────────────────

const RECUSAS: Record<MotivoRecusa, string> = {
  travado: `⏳ Demasiadas tentativas (limite: ${TENTATIVAS_MAXIMAS}). Espera uns minutos e gera um código novo no backoffice.`,
  mal_formado: `🤔 Um código são ${TAMANHO_CODIGO} caracteres, tipo <code>AB23CD34</code>. Gera-o no backoffice → Telegram.`,
  invalido: '🚫 Esse código não serve. Gera outro no backoffice → Telegram.',
  expirado: `⌛ Esse código já expirou (vale ${VALIDADE_MINUTOS} min). Gera outro no backoffice → Telegram.`,
  usado: '♻️ Esse código já foi usado. Gera outro no backoffice → Telegram.',
  chat_de_outro: '⛔ Este Telegram já está ligado a outra conta MTM. Escreve /desligar nessa conta primeiro.',
  sem_papeis: '🤷 A tua conta existe mas não tem papéis na equipa. Fala com o Ricardo para te atribuir o papel.',
  erro: '⚠️ Não consegui ligar agora. Tenta outra vez dentro de um minuto.',
}

/**
 * O ÚNICO sítio por onde os comandos da equipa entram.
 *
 * Devolve `null` para tudo o que não seja um comando da equipa — e é esse `null` que deixa o webhook
 * continuar a tratar do funil, da IA e dos comandos do dono como sempre tratou. Um despacho que
 * respondesse «não conheço» a tudo o que não fosse dele calava o resto do bot.
 *
 * `comandoPor` já devolve `null` para os comandos do dono, mesmo que este despacho venha um dia a
 * ser chamado antes deles na cadeia. Não é paranóia: a cadeia de `else if` do webhook já foi
 * reordenada várias vezes.
 */
export async function tratarComandoDeEquipa(
  db: Supa,
  chatId: string,
  texto: string,
  username?: string | null,
): Promise<Resposta | null> {
  const comando = comandoPor(texto)
  if (!comando) return null

  // A PORTA. Trata-se antes de saber quem é a pessoa: é o comando de quem ainda não é ninguém.
  if (comando.nome === '/ligar') {
    const arg = argumentoDe(texto)
    if (!arg) {
      return {
        texto:
          '🔗 <b>Ligar este Telegram à tua conta MTM</b>\n\n' +
          `1. Abre <a href="${BACKOFFICE}">o backoffice</a> e entra com o teu login do site\n` +
          '2. Na entrada, no bloco «Telegram», toca em <b>Gerar código</b>\n' +
          '3. Escreve aqui <code>/ligar CÓDIGO</code>\n\n' +
          `<i>O código é teu, serve uma vez e morre em ${VALIDADE_MINUTOS} minutos. Não o passes a ninguém: quem o tiver recebe o teu trabalho e vê o teu extracto.</i>`,
      }
    }
    const r = await ligarChatComCodigo(db, chatId, arg, username)
    if (!r.ok) return { texto: RECUSAS[r.motivo] }
    const ligado = await trabalhadorDoChat(db, chatId)
    return {
      texto:
        `✅ <b>Ligado.</b> ${r.papeis.map((p) => PAPEL_NOME[p]).join(' · ')}\n\n` +
        'A partir de amanhã recebes aqui o teu dia de manhã (podes desligar com /avisos).\n\n' +
        (ligado ? textoDeAjudaEquipa(ligado.capacidades, { papeis: ligado.papeisEIb }) : ''),
    }
  }

  const t = await trabalhadorDoChat(db, chatId)
  /**
   * Não é da equipa (ou já não é). Responde-se como o bot responde a um comando desconhecido, e é
   * de propósito: a quem não tem acesso não se confirma que o comando existe. É a mesma regra dos
   * comandos do dono no webhook.
   */
  if (!t) return { texto: '🤔 Não conheço esse comando. Escreve /ajuda para ver o que sei fazer.' }

  // A autorização, num sítio só. Sem a capacidade, o comando não existe para esta pessoa.
  if (!podeComando(t.capacidades, comando, t.papeisEIb)) {
    return { texto: '🤔 Não conheço esse comando. Escreve /ajuda para ver o que sei fazer.' }
  }

  switch (comando.nome) {
    case '/eu':
      return respostaEu(t)
    case '/hoje':
      return respostaHoje(db, t)
    case '/tarefas':
      return respostaTarefas(db, t)
    case '/feito':
      return riscar(db, t, argumentoDe(texto))
    case '/rascunho':
      return mostrarRascunho(db, t, argumentoDe(texto))
    case '/negocios':
      return respostaNegocios(db, t)
    case '/extracto':
      return respostaExtracto(db, t)
    case '/link':
      return respostaLink(db, t)
    case '/minhaequipa':
      return respostaEquipa(db, t)
    /**
     * As cinco bancadas. Não há aqui nenhum `if (é setter)`: a autorização já aconteceu uma vez, em
     * `podeComando(t.capacidades, comando, t.papeisEIb)`, e um comando sem o papel nem chega a este
     * `switch`. Um papel novo amanhã é uma linha no registo e um `case` — nenhum handler existente
     * precisa de saber que ele apareceu.
     */
    case '/prospector':
      return respostaProspector(db, t)
    case '/setter':
      return respostaSetter(db, t)
    case '/closer':
      return respostaCloser(db, t)
    case '/ib':
      return respostaIb(db, t)
    case '/afiliado':
      return respostaAfiliado(db, t)
    case '/avisos': {
      const ligar = !t.avisosLigados
      const ok = await definirAvisos(db, chatId, ligar)
      if (!ok) return { texto: '⚠️ Não consegui mudar isso agora.' }
      return {
        texto: ligar
          ? '🔔 Resumo da manhã <b>ligado</b>.'
          : '🔕 Resumo da manhã <b>desligado</b>. O trabalho continua a ser preparado — vês em /hoje ou no backoffice.',
      }
    }
    case '/desligar': {
      const ok = await desligarChat(db, chatId)
      return {
        texto: ok
          ? '👋 Desligado. Deixas de receber o teu dia aqui. Para voltar, gera outro código no backoffice e usa /ligar.'
          : '⚠️ Não consegui desligar agora.',
      }
    }
    default:
      return null
  }
}

/**
 * Os botões do lado da equipa (`bo:`). Prefixo próprio, separado do do painel do dono — os dois
 * despachos nunca se cruzam, e a guarda prende que nenhum prefixo é o começo do outro.
 */
export async function tratarBotaoDeEquipa(db: Supa, chatId: string, dados: string): Promise<Resposta | null> {
  if (!dados.startsWith(PREFIXO_BOTAO_EQUIPA)) return null
  const t = await trabalhadorDoChat(db, chatId)
  if (!t) return { texto: '⛔ Este Telegram não está ligado a nenhuma conta da equipa.' }

  const corpo = dados.slice(PREFIXO_BOTAO_EQUIPA.length)
  const [acao, ...resto] = corpo.split(':')
  const id = resto.join(':')

  // A mesma autorização dos comandos, e pela MESMA função: um botão é um comando com outra roupa, e
  // o erro clássico é gatear o comando e esquecer o botão.
  const exigir = (nome: string) => {
    const c = comandoPor(nome)
    return c ? podeComando(t.capacidades, c, t.papeisEIb) : false
  }

  if (acao === 'f') {
    if (!exigir('/feito')) return { texto: '⛔ Sem acesso.' }
    return riscar(db, t, id)
  }
  if (acao === 'r') {
    if (!exigir('/rascunho')) return { texto: '⛔ Sem acesso.' }
    return mostrarRascunho(db, t, id)
  }
  return null
}

/** A ajuda da equipa, para o /ajuda do bot a juntar ao resto quando o chat está ligado. */
export async function ajudaDeEquipaSeLigado(db: Supa, chatId: string): Promise<string | null> {
  const t = await trabalhadorDoChat(db, chatId)
  if (!t) return null
  return textoDeAjudaEquipa(t.capacidades, { papeis: t.papeisEIb })
}
