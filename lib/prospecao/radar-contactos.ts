/**
 * RADAR DE CONTACTOS — quem já nos tocou e ainda não está no funil.
 *
 * O funil do Telegram está construído há meses e tem CINCO linhas, das quais duas são testes e
 * uma é o dono. Não é o funil que está partido: é a entrada. Há gente nos nossos grupos, gente que
 * entrou e saiu, gente que escreveu uma pergunta e nunca mais apareceu — e nada disso chega ao
 * funil, porque o funil só conhece quem escreve ao bot em privado.
 *
 * Este ficheiro fecha essa distância. Não inventa leads: apanha os que JÁ existem.
 *
 * ── DUAS PAREDES, E O DESENHO É FEITO A CONTORNÁ-LAS ───────────────────────────────────────────
 *
 *  1. Um bot do Telegram NÃO pode iniciar conversa com quem nunca lhe escreveu. Não é uma
 *     limitação de permissões que se resolva com um token melhor — é a API. Logo, isto NUNCA
 *     envia nada. Prepara uma lista e diz porquê; quem aborda é o dono, ou um post no grupo.
 *
 *  2. O MTProto corre na conta PESSOAL. Mandar mensagens em massa por lá é o caminho mais curto
 *     para a conta ser limitada — e com ela caem os grupos, os canais e o funil todo. Por isso o
 *     MTProto, neste sistema, só LÊ (ver `dialogos.ts`).
 *
 * ── O QUE SE GUARDA, E O QUE NÃO SE GUARDA ─────────────────────────────────────────────────────
 * Só entra aqui quem interagiu com NÓS: escreveu num grupo nosso, entrou num grupo nosso, ou saiu
 * de um. Guarda-se o identificador, o nome público e o MOTIVO de estar na lista — nada mais. Não
 * se exportam listas de membros de grupos de terceiros, nem se guarda o conteúdo do que as pessoas
 * escreveram. A lista serve para o dono decidir a quem fala; não é um arquivo de pessoas.
 *
 * ── O PONTO CEGO QUE É PRECISO SABER ───────────────────────────────────────────────────────────
 * Um bot num grupo com «privacy mode» LIGADO (o estado por defeito no BotFather) só recebe os
 * comandos e as respostas directas — não vê as conversas normais. Se o radar tiver muitas entradas
 * em grupo e quase nenhuma mensagem, é isso que está a acontecer, e resolve-se no BotFather
 * (`/setprivacy` → Disable) e não no código. `diagnosticoDeCobertura` diz-o em voz alta.
 *
 *   npx tsx lib/__tests__/radar-contactos.check.ts
 */

/** Porque é que esta pessoa está na lista. Um motivo, um comportamento observado. */
export type MotivoDeContacto = 'escreveu' | 'entrou' | 'saiu'

export interface ContactoVisto {
  tgUserId: string
  username: string | null
  firstName: string | null
  /** Chat ids dos NOSSOS grupos onde apareceu. */
  grupos: string[]
  mensagens: number
  entradas: number
  saidas: number
  primeiroVistoIso: string | null
  ultimoVistoIso: string | null
  /** 'novo' | 'abordado' | 'ignorado' | 'no_funil' */
  estado: string
}

export interface ContactoPriorizado extends ContactoVisto {
  pontuacao: number
  porque: string
  /** O que fazer com esta pessoa — e é sempre uma acção HUMANA ou um post, nunca um envio. */
  comoAbordar: string
}

// ─────────────────────────────── A PONTUAÇÃO ───────────────────────────────

/**
 * Quanto vale a pena falar com esta pessoa.
 *
 * A regra que decide tudo: FALAR vale mais do que ESTAR. Uma pessoa que escreveu uma pergunta num
 * grupo nosso já se expôs — tem uma dúvida com nome e um contexto onde a resposta cabe. Uma pessoa
 * que só está no grupo pode nem o ter aberto.
 *
 * E quem SAIU vale quase tanto como quem escreveu, por uma razão que não é óbvia: quem sai teve um
 * motivo, e o motivo é informação que não se compra. Não é um lead perdido — é o único sítio onde
 * se aprende o que está a afastar as pessoas.
 */
export function pontuarContacto(c: ContactoVisto, agoraMs = Date.now()): { pontos: number; porque: string } {
  const razoes: string[] = []
  let p = 0

  if (c.mensagens > 0) {
    // Cresce, mas com travão: quem escreveu trinta vezes não vale dez vezes quem escreveu três.
    p += Math.min(45, 20 + c.mensagens * 5)
    razoes.push(`escreveu ${c.mensagens}× num grupo nosso`)
  }

  if (c.saidas > 0) {
    p += 25
    razoes.push(c.mensagens ? 'e saiu depois de falar' : 'entrou e saiu — há uma objeção por perceber')
  } else if (c.entradas > 0 && c.mensagens === 0) {
    p += 10
    razoes.push('entrou e nunca falou')
  }

  if (c.grupos.length > 1) {
    p += 15
    razoes.push(`está em ${c.grupos.length} grupos nossos`)
  }

  /**
   * O tempo conta ao contrário do que parece.
   *
   * Quem apareceu hoje ainda se lembra de nós; quem apareceu há dois meses já não faz ideia de
   * quem somos e uma mensagem cai-lhe do céu. Não é castigo — é a diferença entre continuar uma
   * conversa e começar uma do nada.
   */
  const d = c.ultimoVistoIso ? Math.floor((agoraMs - Date.parse(c.ultimoVistoIso)) / 86_400_000) : null
  if (d != null) {
    if (d <= 2) {
      p += 20
      razoes.push('apareceu nos últimos dois dias')
    } else if (d <= 7) {
      p += 10
    } else if (d > 45) {
      p -= 20
      razoes.push(`sem aparecer há ${d} dias — já não se lembra de nós`)
    }
  }

  // Quem já está no funil não é prospeção: é seguimento, e tem lugar próprio.
  if (c.estado === 'no_funil') {
    p -= 100
    razoes.push('já está no funil')
  }
  if (c.estado === 'abordado') {
    p -= 40
    razoes.push('já foi abordado')
  }
  if (c.estado === 'ignorado') p -= 100

  return { pontos: Math.max(0, Math.round(p)), porque: razoes.join(' · ') || 'apenas visto' }
}

/**
 * Como abordar — e a resposta nunca é «o bot manda».
 *
 * O caminho tem de ser um que a pessoa abra: ela responde a um post, carrega num link, ou o dono
 * fala-lhe. É esta função que garante que ninguém, a ler a lista, se lembra de automatizar o envio.
 */
export function comoAbordar(c: ContactoVisto): string {
  if (c.saidas > 0) {
    return 'Saiu de um grupo nosso: uma pergunta directa tua, de pessoa para pessoa, a perguntar o que faltou. Não lhe mandes oferta.'
  }
  if (c.mensagens > 0) {
    return 'Falou no grupo: responde-lhe ALI, no fio onde escreveu, e termina a convidar para o bot. A conversa continua onde já estava.'
  }
  if (c.grupos.length > 1) {
    return 'Está em vários grupos nossos e nunca falou: um post com chamada à ação no grupo onde é mais activo — não uma mensagem directa.'
  }
  return 'Entrou e nunca falou: entra na próxima ronda de boas-vindas do grupo, com pergunta aberta. O bot não lhe pode escrever primeiro.'
}

/** A lista, ordenada. Pura — quem lê a base é a rota. */
export function listaPrioritaria(
  contactos: ContactoVisto[],
  { limite = 20, minimo = 20, agoraMs = Date.now() }: { limite?: number; minimo?: number; agoraMs?: number } = {},
): ContactoPriorizado[] {
  return contactos
    .map((c) => {
      const { pontos, porque } = pontuarContacto(c, agoraMs)
      return { ...c, pontuacao: pontos, porque, comoAbordar: comoAbordar(c) }
    })
    .filter((c) => c.pontuacao >= minimo)
    .sort((a, b) => b.pontuacao - a.pontuacao)
    .slice(0, limite)
}

/**
 * O radar está mesmo a ver, ou está a ver só metade?
 *
 * Uma lista vazia pode significar duas coisas muito diferentes — «não há ninguém» ou «o bot está
 * cego» — e confundi-las custa semanas. Esta função separa-as.
 */
export function diagnosticoDeCobertura(c: {
  contactos: number
  comMensagens: number
  comEntradas: number
  gruposVistos: number
}): { ok: boolean; aviso: string | null } {
  if (c.gruposVistos === 0) {
    return { ok: false, aviso: 'O bot não viu um único grupo. Confirma que está lá dentro e que o webhook está registado.' }
  }
  if (c.contactos === 0) {
    return { ok: false, aviso: 'Nenhum contacto registado ainda — o radar só conta a partir de agora, não vê o passado.' }
  }
  if (c.comEntradas > 5 && c.comMensagens === 0) {
    return {
      ok: false,
      aviso:
        'Vê quem entra mas não vê ninguém a falar: o «privacy mode» do bot está ligado. Resolve-se no BotFather (/setprivacy → Disable) e depois tirar e voltar a pôr o bot nos grupos.',
    }
  }
  return { ok: true, aviso: null }
}

// ─────────────────────────────── A ESCRITA ───────────────────────────────

/**
 * Regista uma interacção. Chamado pelo webhook, e sempre em «melhor esforço»:
 * o radar NUNCA pode fazer cair o funil que funciona.
 */
export async function registarContacto(
  supabase: unknown,
  dados: {
    tgUserId: string | number
    username?: string | null
    firstName?: string | null
    chatId: string | number
    motivo: MotivoDeContacto
  },
): Promise<void> {
  const db = supabase as {
    rpc: (nome: string, args: Record<string, unknown>) => Promise<{ error: unknown }>
  }
  try {
    await db.rpc('prospecao_registar_contacto', {
      p_tg_user_id: String(dados.tgUserId),
      p_username: dados.username ?? null,
      p_first_name: dados.firstName ?? null,
      p_chat_id: String(dados.chatId),
      p_motivo: dados.motivo,
    })
  } catch {
    /* o funil não pode falhar por causa do radar */
  }
}
