/**
 * O MAPA DOS GRUPOS — o que o MTProto nos dá, e o que não dá.
 *
 * O dono está em ~50 grupos de Telegram: os nossos, os dos parceiros, os de trading onde entrou há
 * anos. Essa lista é conhecimento — diz onde temos audiência, onde temos concorrência e onde
 * estamos sem fazer nada — e hoje só existe dentro do telemóvel dele e num painel do `mtm-auto`.
 *
 * ── O QUE O SERVIÇO DÁ, CAMPO A CAMPO (verificado contra a VPS) ────────────────────────────────
 * `GET /telegram-dialogos/dialogos?limite=300&q=` devolve, por diálogo, exactamente CINCO campos:
 *
 *     id · titulo · tipo · sou_admin · membros
 *
 * E mais nada. Não há endpoint de mensagens. Não há endpoint de participantes. `membros` é uma
 * CONTAGEM, nunca uma lista de quem são. O outro endpoint é `GET /saude`.
 *
 * Isto não é uma limitação a contornar — é o desenho. O serviço corre com a sessão MTProto da
 * conta PESSOAL do dono, e uma sessão pessoal que comece a puxar listas de membros de grupos de
 * terceiros é uma conta limitada em poucos dias. Com ela cairiam os grupos, os canais, os relays
 * e o funil todo.
 *
 *   ❌ Não exporta membros de grupos de terceiros para a nossa base.
 *   ❌ Não envia UMA mensagem — este ficheiro não tem sequer função de envio para alguém ser tentado.
 *
 * O MTProto serve para VER e PERCEBER. A conversão faz-se por caminhos que a pessoa abre.
 *
 * ── O CRUZAMENTO QUE VALE A PENA ───────────────────────────────────────────────────────────────
 * O MTProto sabe onde o DONO está; a tabela `mtmcopy_telegram_discovered` sabe onde o BOT está (e
 * quando lá viu tráfego pela última vez). Cruzar as duas responde à pergunta mais cara de todas:
 *
 *     «em que grupos mando eu e o meu sistema não está a ver nada?»
 *
 * São grupos que já são nossos, com gente lá dentro, e de onde não sai um único lead — porque sem
 * o bot não há boas-vindas, não há radar de contactos, não há nada. Pôr o bot lá custa dois toques
 * e é a maior alavanca de entrada que existe hoje.
 *
 * ── ESTADO ─────────────────────────────────────────────────────────────────────────────────────
 * O serviço está VIVO (responde 401 sem chave). O que falta é a chave no ambiente DESTE site: o
 * `TELEGRAM_DIALOGOS_SECRET` só existe na Vercel do projecto `mtm-auto`. Enquanto faltar,
 * `lerDialogos` devolve `{ ok: false, motivo }` e o resto do sistema anda com o que o bot já vê.
 *
 *   npx tsx lib/__tests__/dialogos.check.ts
 */

const BASE_POR_DEFEITO = 'https://stream.morethanmoney.pt/telegram-dialogos'

/** Um diálogo, tal como o serviço o dá. Sem membros, sem mensagens, sem pessoas. */
export interface Dialogo {
  chatId: string
  titulo: string
  /** 'group' | 'supergroup' | 'channel' | 'user' | o que o serviço devolver */
  tipo: string
  /** O dono é administrador deste grupo. É o sinal mais forte de que o grupo é nosso. */
  souAdmin: boolean
  /** Contagem. Nunca a lista. */
  membros: number | null
}

export type PapelDoGrupo = 'nosso' | 'terceiros'

export interface GrupoClassificado extends Dialogo {
  papel: PapelDoGrupo
  /** O bot está lá dentro? Sem ele não há boas-vindas, nem radar, nem leads. */
  botPresente: boolean
  /** Dias desde a última mensagem que o BOT viu. `null` quando o bot não está lá. */
  diasParado: number | null
  /** Ordena a lista. Quanto maior, mais depressa vale a pena mexer. */
  prioridade: number
  /** A leitura em português: o que este grupo é para o negócio, hoje. */
  leitura: string
  /** O que fazer AQUI — publicar ou participar, nunca enviar a estranhos. */
  oQueFazer: string
}

/** O que o bot sabe de um grupo: que lá está, e quando viu tráfego pela última vez. */
export interface PresencaDoBot {
  chatId: string
  ultimaMensagemIso: string | null
}

// ─────────────────────────────── CLASSIFICAR ───────────────────────────────

/**
 * Cruza o que o dono vê com o que o bot vê.
 *
 * «Nosso» decide-se por `sou_admin` e não por procurar «MTM» no título. O título engana dos dois
 * lados: há grupos de terceiros que falam de nós, e grupos nossos que nunca tiveram a sigla no
 * nome — o «GOLD DID», o «GOLDEN MOVES». Ser administrador é um facto; um título é uma opinião.
 */
export function classificarDialogos(
  dialogos: Dialogo[],
  presencaDoBot: PresencaDoBot[],
  agoraMs = Date.now(),
): GrupoClassificado[] {
  const bot = new Map(presencaDoBot.map((p) => [String(p.chatId), p.ultimaMensagemIso]))

  return (
    dialogos
      /**
       * Conversas com pessoas não entram.
       *
       * Não é arrumação: é a única porta por onde ia entrar informação pessoal de quem nunca
       * falou connosco. Fecha-se à entrada, antes de qualquer classificação.
       */
      .filter((d) => d.tipo !== 'user' && d.tipo !== 'bot' && d.tipo !== 'private')
      .map((d) => {
        const botPresente = bot.has(d.chatId)
        const ultima = bot.get(d.chatId) ?? null
        const diasParado = ultima ? Math.floor((agoraMs - Date.parse(ultima)) / 86_400_000) : null
        const papel: PapelDoGrupo = d.souAdmin || botPresente ? 'nosso' : 'terceiros'
        const { leitura, oQueFazer, prioridade } = leituraEAcao(papel, d, botPresente, diasParado)
        return { ...d, papel, botPresente, diasParado, prioridade, leitura, oQueFazer }
      })
      .sort((a, b) => b.prioridade - a.prioridade || (b.membros ?? 0) - (a.membros ?? 0))
  )
}

function leituraEAcao(
  papel: PapelDoGrupo,
  d: Dialogo,
  botPresente: boolean,
  diasParado: number | null,
): { leitura: string; oQueFazer: string; prioridade: number } {
  const tamanho = d.membros ?? 0

  if (papel === 'nosso') {
    /**
     * O caso que vale mais do que todos os outros juntos.
     *
     * Grupo onde ele manda e onde o sistema não vê nada: não há boas-vindas a quem entra, não há
     * radar de contactos, não há um único lead a sair dali. É audiência que já é nossa a render
     * zero, e o conserto são dois toques no Telegram.
     */
    if (!botPresente) {
      return {
        leitura: `És admin e o bot NÃO está lá. ${tamanho ? `${tamanho} pessoas` : 'Gente'} sem boas-vindas, sem radar, sem um lead a sair daqui.`,
        oQueFazer: 'Põe o bot no grupo (t.me/morethanmoneypt_bot?startgroup=true) e desliga-lhe o privacy mode. É o passo com maior retorno da lista.',
        // Cresce com o tamanho: um grupo nosso de 400 pessoas sem bot é pior do que um de 4.
        prioridade: 900 + Math.min(99, tamanho),
      }
    }
    if (diasParado != null && diasParado > 14) {
      return {
        leitura: `Grupo nosso parado há ${diasParado} dias — audiência que custou a juntar e está a esfriar.`,
        oQueFazer: 'Publicar. Uma prova em pips e uma pergunta aberta chegam para o grupo voltar a falar.',
        prioridade: 700 + Math.min(99, diasParado),
      }
    }
    if (diasParado != null && diasParado > 7) {
      return {
        leitura: `Grupo nosso com ${diasParado} dias sem mensagem.`,
        oQueFazer: 'Publicar esta semana, antes que as notificações deixem de ser abertas.',
        prioridade: 600,
      }
    }
    return {
      leitura: 'Grupo nosso, activo e com o bot a ver.',
      oQueFazer: 'É aqui que uma chamada à ação converte — quem responde ao bot passa a poder receber mensagens dele.',
      prioridade: 300,
    }
  }

  /**
   * Grupos de terceiros.
   *
   * A acção é SEMPRE participar como pessoa. Não se extraem membros, não se manda nada a ninguém.
   * O que se ganha aqui é ser visto por quem já está a falar do assunto — e isso faz-se
   * respondendo bem a uma pergunta, não a despejar links.
   */
  if (tamanho > 5000) {
    return {
      leitura: `Grupo de terceiros grande (${tamanho}) — muito ruído, pouca hipótese de ser lido.`,
      oQueFazer: 'Baixa prioridade. Só vale se houver uma conversa concreta onde a nossa resposta seja a melhor da sala.',
      prioridade: 80,
    }
  }
  if (tamanho > 200) {
    return {
      leitura: `Grupo de terceiros com ${tamanho} membros — tamanho em que uma boa resposta ainda se vê.`,
      oQueFazer: 'Participar como pessoa: responder a quem pergunta. Nunca extrair membros nem mandar mensagem directa.',
      prioridade: 200,
    }
  }
  return {
    leitura: tamanho ? `Grupo de terceiros pequeno (${tamanho}).` : 'Grupo de terceiros, tamanho desconhecido.',
    oQueFazer: 'Observar. Serve para aprender o vocabulário e as objeções de quem ainda não é nosso.',
    prioridade: 50,
  }
}

/** O resumo do mapa, em números — o que cabe num ecrã de telemóvel. */
export function resumoDoMapa(grupos: GrupoClassificado[]): {
  nossos: number
  terceiros: number
  /** Os que interessam: nossos, sem o bot lá dentro. */
  nossosSemBot: number
  nossosParados: number
  alcanceTerceiros: number
} {
  const nossos = grupos.filter((g) => g.papel === 'nosso')
  const terceiros = grupos.filter((g) => g.papel === 'terceiros')
  return {
    nossos: nossos.length,
    terceiros: terceiros.length,
    nossosSemBot: nossos.filter((g) => !g.botPresente).length,
    nossosParados: nossos.filter((g) => g.botPresente && (g.diasParado ?? 0) > 7).length,
    alcanceTerceiros: terceiros.reduce((s, g) => s + (g.membros ?? 0), 0),
  }
}

// ─────────────────────────────── LER ───────────────────────────────

/**
 * Normaliza o que o serviço devolver.
 *
 * O serviço vive noutro sítio (`/opt/mtm-dialogos/dialogos.py`, na VPS) e não está versionado em
 * repo nenhum. Aceitar vários nomes para o mesmo campo custa dez linhas; descobrir num sábado que
 * o mapa está vazio porque alguém renomeou `id` para `chat_id` custa a manhã toda.
 */
export function normalizarDialogos(bruto: unknown): Dialogo[] {
  const lista = Array.isArray(bruto)
    ? bruto
    : Array.isArray((bruto as { dialogos?: unknown[] })?.dialogos)
      ? (bruto as { dialogos: unknown[] }).dialogos
      : Array.isArray((bruto as { chats?: unknown[] })?.chats)
        ? (bruto as { chats: unknown[] }).chats
        : []

  const saida: Dialogo[] = []
  for (const item of lista) {
    const r = item as Record<string, unknown>
    const id = r.id ?? r.chat_id ?? r.chatId
    if (id == null) continue
    const membros = r.membros ?? r.members ?? r.participants_count
    saida.push({
      chatId: String(id),
      titulo: String(r.titulo ?? r.title ?? r.name ?? 'sem título'),
      tipo: String(r.tipo ?? r.type ?? r.chat_type ?? 'desconhecido'),
      souAdmin: r.sou_admin === true || r.souAdmin === true || r.is_admin === true,
      membros: membros != null && Number.isFinite(Number(membros)) ? Number(membros) : null,
    })
  }
  return saida
}

export type LeituraDeDialogos = { ok: true; dialogos: Dialogo[] } | { ok: false; motivo: string }

/**
 * Lê os diálogos do serviço da VPS. Só GET, só leitura.
 *
 * Nunca lança: quem chama é um cron e um painel, e nenhum dos dois deve cair porque a VPS foi
 * reiniciada. Os nomes das variáveis são os MESMOS que o `mtm-auto` já usa — duas casas com dois
 * nomes para a mesma chave é a forma garantida de uma delas ficar para trás numa rotação.
 */
export async function lerDialogos(limite = 300): Promise<LeituraDeDialogos> {
  const token = process.env.TELEGRAM_DIALOGOS_SECRET?.trim()
  if (!token) {
    return {
      ok: false,
      motivo:
        'Falta TELEGRAM_DIALOGOS_SECRET neste projecto. O serviço da VPS está vivo (responde 401 sem chave); a chave existe, mas só no ambiente do mtm-auto.',
    }
  }
  const base = (process.env.TELEGRAM_DIALOGOS_URL?.trim() || BASE_POR_DEFEITO).replace(/\/+$/, '')

  try {
    const r = await fetch(`${base}/dialogos?limite=${encodeURIComponent(String(limite))}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(45_000),
    })
    if (!r.ok) {
      return {
        ok: false,
        motivo:
          r.status === 401
            ? 'O serviço recusou a chave (401) — o TELEGRAM_DIALOGOS_SECRET aqui não bate certo com o da VPS.'
            : `O serviço respondeu ${r.status}.`,
      }
    }
    return { ok: true, dialogos: normalizarDialogos(await r.json()) }
  } catch (e) {
    return { ok: false, motivo: `Não consegui falar com a VPS: ${e instanceof Error ? e.message : 'erro'}` }
  }
}
