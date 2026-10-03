/**
 * QUEM É QUE VALE A PENA CONTAR — E COM QUEM NÃO SE FALA COMO SE FOSSE UM DESCONHECIDO.
 *
 * ═══ DUAS COISAS QUE O FUNIL FAZIA MAL ═════════════════════════════════════════════════════
 *
 * 1. CONTAVA COMENTÁRIOS COMO SE FOSSEM PESSOAS. A 30/09 a tabela `ig_leads` tinha nove linhas —
 *    e UMA pessoa. O @ruipaulo.fxcripto comentou nove vezes, com quase todas as palavras-chave.
 *    O painel dizia «9 leads» e havia um. Num funil, um número inflacionado é pior do que um
 *    número em falta: o que falta faz perguntar, o inflacionado faz planear em cima de ar.
 *
 * 2. NÃO OLHAVA PARA QUEM JÁ É DA CASA. Um membro que comenta «PREMIUM» num post não é um lead —
 *    é um cliente a perguntar uma coisa. Tratá-lo como lead frio e mandar-lhe a mensagem de
 *    captação («começa por aqui 👉 /register») é dizer a quem já paga que não sabemos quem ele é.
 *    É a mesma regra que `captacao-hot-calls-leitura.ts` já aplica às chamadas — ali foi aprendida
 *    à força, depois de dois SUB-IBs aparecerem no topo da lista de angariação.
 *
 * ═══ PORQUE É PURO ═════════════════════════════════════════════════════════════════════════
 *
 * Porque o que ele decide — «esta pessoa é nossa ou não?» — não se pode testar com base de dados
 * pelo meio, e um erro aqui não dá erro: manda uma mensagem de captação a um cliente, ou esconde
 * um lead verdadeiro. As duas descobrem-se tarde.
 */

export interface ComentarioLead {
  commenter: string
  keyword?: string | null
  created_at?: string | null
}

/** O mínimo de um perfil para se saber se o comentador já é nosso. */
export interface PerfilConhecido {
  username?: string | null
  full_name?: string | null
  email?: string | null
  /** `profiles.social_media` — jsonb ou texto, conforme a linha. Aceita-se como vier. */
  social_media?: unknown
}

/** Um handle comparável: sem @, sem espaços, minúsculas. */
export function normalizarHandle(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().replace(/^@+/, '')
}

/**
 * Todos os handles que um perfil nosso pode ter.
 *
 * O `social_media` é o campo onde o Instagram costuma estar, e vem em formatos diferentes conforme
 * a época: texto solto, objecto com `instagram`, ou um endereço completo. Aceitam-se os três — uma
 * leitura estreita aqui traduz-se em mandar a mensagem errada a um cliente.
 */
export function handlesDoPerfil(p: PerfilConhecido): string[] {
  const out = new Set<string>()
  const juntar = (v: unknown) => {
    const t = normalizarHandle(v)
    if (!t) return
    // «instagram.com/fulano/» e «https://instagram.com/fulano?igsh=…» → «fulano»
    const m = /(?:instagram\.com\/)([^/?#]+)/.exec(t)
    out.add(m ? m[1] : t)
  }
  juntar(p.username)

  /**
   * `profiles.social_media` é uma coluna de TEXTO que guarda JSON — não é jsonb. Por isso uma
   * linha chega aqui como a cadeia `{"instagram":"fulano"}` e não como objecto, e tratá-la como
   * texto solto dava o JSON inteiro por handle. Foi o que aconteceu a 30/09: escrevi o Instagram
   * do Rui no perfil, o funil continuou a contá-lo como lead, e a culpa era desta linha.
   *
   * Tenta-se ler como JSON; se não for, é o handle escrito à mão e vale como está.
   */
  const bruto = p.social_media
  const s = typeof bruto === 'string' ? (() => { try { return JSON.parse(bruto) } catch { return bruto } })() : bruto

  if (typeof s === 'string') juntar(s)
  else if (s && typeof s === 'object') {
    for (const [chave, valor] of Object.entries(s as Record<string, unknown>)) {
      if (/insta|ig/i.test(chave)) juntar(valor)
    }
  }
  return [...out].filter((h) => h.length >= 3)
}

/**
 * Esta pessoa já é da casa?
 *
 * Compara-se pelo HANDLE e não por nome: nomes iguais são comuns e um falso positivo aqui esconde
 * um lead verdadeiro. Ao contrário da lista de chamadas — onde o erro caro era ligar a um colega e
 * por isso se comparava também por nome — aqui o erro caro é o inverso, porque a mensagem é
 * automática e não custa nada a quem a recebe a mais.
 */
export function ehDaCasa(handle: string, perfis: PerfilConhecido[]): boolean {
  const alvo = normalizarHandle(handle)
  if (!alvo) return false
  return perfis.some((p) => handlesDoPerfil(p).includes(alvo))
}

export interface ContagemDeLeads {
  /** Linhas na tabela — o que o painel mostrava antes, e que não é gente. */
  comentarios: number
  /** Pessoas distintas. É este o número do funil. */
  pessoas: number
  /** Pessoas distintas que ainda NÃO são da casa. */
  novas: number
  /** As que já são nossas — contadas, para se saber que existem, mas fora do funil de captação. */
  jaNossas: string[]
}

export function contarLeads(comentarios: ComentarioLead[], perfis: PerfilConhecido[]): ContagemDeLeads {
  const pessoas = new Set<string>()
  for (const c of comentarios) {
    const h = normalizarHandle(c.commenter)
    if (h) pessoas.add(h)
  }
  const jaNossas = [...pessoas].filter((h) => ehDaCasa(h, perfis))
  return {
    comentarios: comentarios.length,
    pessoas: pessoas.size,
    novas: pessoas.size - jaNossas.length,
    jaNossas,
  }
}

/**
 * A quem é que ainda se pode responder em privado.
 *
 * Duas condições, e as duas são da Meta ou do dono:
 *  · dentro da janela de 7 dias contada do comentário (regra da Meta, não negociável);
 *  · e não ser da casa (decisão do dono, 30/09).
 *
 * Devolve UM comentário por pessoa — o mais recente. Nove comentários da mesma pessoa não são nove
 * mensagens: são uma conversa, e mandar-lhe nove seguidas é a melhor maneira de a perder.
 */
export function aQuemResponder(
  comentarios: ComentarioLead[],
  perfis: PerfilConhecido[],
  agora: Date = new Date(),
): ComentarioLead[] {
  const JANELA_MS = 7 * 86_400_000
  const porPessoa = new Map<string, ComentarioLead>()
  for (const c of comentarios) {
    const h = normalizarHandle(c.commenter)
    if (!h || ehDaCasa(h, perfis)) continue
    const quando = c.created_at ? new Date(c.created_at).getTime() : NaN
    if (!Number.isFinite(quando) || agora.getTime() - quando > JANELA_MS) continue
    const actual = porPessoa.get(h)
    const actualQuando = actual?.created_at ? new Date(actual.created_at).getTime() : -Infinity
    if (quando > actualQuando) porPessoa.set(h, c)
  }
  return [...porPessoa.values()]
}
