import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { modeloClaude } from '@/lib/modelo-claude'
import { contextoDaCasa } from '@/lib/factos-da-casa'

/**
 * As nossas automações — o que hoje se paga ao .
 *
 * O modelo veio do `insta-p8` (ver a memória `referencias--funis`), que resolve o mesmo
 * problema com o mesmo stack: um GATILHO, uma RESPOSTA e passos de SEGUIMENTO. Copiou-se o
 * modelo, não o código — as nossas fontes e o nosso funil são outros.
 *
 * ── Porque é que isto existe ──────────────────────────────────────────────────────────────────
 * Duas razões, e nenhuma é "porque dá jeito ter":
 *
 *  · as contas de Instagram estão no plano Essential do , que NÃO faz automação de DM.
 *    Pagava-se por uma ferramenta que não fazia a parte que interessa;
 *  · o funil do Telegram — o que converte — estava escrito dentro do código, sem forma de o
 *    afinar sem um deploy. E o que não se pode afinar não se afina.
 *
 * ── O que depende de permissões que não controlamos ───────────────────────────────────────────
 * Responder a comentários precisa de `instagram_manage_comments`; enviar DM precisa de
 * `instagram_manage_messages`, que a Meta só dá a apps revistas. O motor não finge: quando a
 * permissão falta, regista a falha com o motivo em vez de a engolir — uma automação que parece
 * ligada e não responde é pior do que uma que diz que não pode.
 */

export type CanalAutomacao = 'instagram_comentario' | 'instagram_dm' | 'telegram' | 'email'
export type TipoGatilho = 'palavra' | 'qualquer' | 'comando' | 'entrada'

export interface PassoSeguimento {
  /** Minutos a esperar depois do passo anterior. */
  esperaMin: number
  texto: string
}

export interface Automacao {
  id: string
  nome: string
  canal: CanalAutomacao
  gatilho: TipoGatilho
  valor: string | null
  alvoMediaId: string | null
  respostaTipo: 'texto' | 'ia' | 'fluxo'
  /**
   * `texto` é a resposta fixa; `instrucao` é o que se pede à IA quando o tipo é 'ia'.
   *
   * `publicas` é uma LISTA que roda — ideia tirada do insta-p8, e é boa: responder a cinquenta
   * comentários com a mesma frase faz a conta parecer um robô, e é o próprio Instagram a
   * despromover conteúdo com respostas repetidas.
   */
  resposta: { texto?: string; instrucao?: string; url?: string; publicas?: string[] } | null
  seguimento: PassoSeguimento[] | null
  funilId: string | null
  noId: string | null
  ativa: boolean
  disparos: number
  ultimoDisparo: string | null
}

function daLinha(r: Record<string, unknown>): Automacao {
  return {
    id: r.id as string,
    nome: (r.nome as string) ?? '',
    canal: r.canal as CanalAutomacao,
    gatilho: r.gatilho as TipoGatilho,
    valor: (r.valor as string) ?? null,
    alvoMediaId: (r.alvo_media_id as string) ?? null,
    respostaTipo: (r.resposta_tipo as Automacao['respostaTipo']) ?? 'texto',
    resposta: (r.resposta as Automacao['resposta']) ?? null,
    seguimento: (r.seguimento as PassoSeguimento[]) ?? null,
    funilId: (r.funil_id as string) ?? null,
    noId: (r.no_id as string) ?? null,
    ativa: r.ativa === true,
    disparos: Number(r.disparos ?? 0),
    ultimoDisparo: (r.ultimo_disparo as string) ?? null,
  }
}

export async function listarAutomacoes(canal?: CanalAutomacao): Promise<Automacao[]> {
  const db = getSupabaseAdmin()
  let q = db.from('mtm_automacoes').select('*').order('created_at', { ascending: false })
  if (canal) q = q.eq('canal', canal)
  const { data } = await q
  return (data ?? []).map(daLinha)
}

/**
 * A automação que responde a este texto, neste canal.
 *
 * A ordem importa: uma regra com PALAVRA ganha sempre a uma de "qualquer". Sem isto, uma regra
 * genérica apanhava tudo primeiro e as específicas nunca chegavam a disparar — o erro clássico
 * de quem monta automações por ordem de criação.
 */
export async function encontrarAutomacao(
  canal: CanalAutomacao,
  texto: string,
  opts?: { mediaId?: string | null },
): Promise<Automacao | null> {
  const todas = (await listarAutomacoes(canal)).filter((a) => a.ativa)
  const t = texto.toLowerCase()

  const porPalavra = todas.filter((a) => {
    if (a.gatilho !== 'palavra' && a.gatilho !== 'comando') return false
    if (!a.valor) return false
    // Um alvo específico só conta nesse post: a palavra "APP" comentada noutro não é o mesmo lead.
    if (a.alvoMediaId && opts?.mediaId && a.alvoMediaId !== opts.mediaId) return false
    // Fronteira de palavra: "app" não deve disparar dentro de "apple".
    return new RegExp(`\\b${a.valor.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t)
  })
  if (porPalavra.length) return porPalavra[0]

  return todas.find((a) => a.gatilho === 'qualquer' || a.gatilho === 'entrada') ?? null
}

/**
 * Já respondemos a esta pessoa por esta automação?
 *
 * Marca ANTES de responder. Falhar a responder é melhor do que responder duas vezes: a segunda
 * resposta a um comentário é o que faz uma marca parecer um robô avariado.
 */
export async function reservarDisparo(
  automacaoId: string,
  pessoa: string,
  contexto?: string | null,
): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from('mtm_automacoes_disparos')
    .upsert(
      { automacao_id: automacaoId, pessoa, contexto: contexto ?? null },
      { onConflict: 'automacao_id,pessoa,contexto', ignoreDuplicates: true },
    )
    .select('id')
  return Boolean(data?.length)
}

export async function contarDisparo(automacaoId: string): Promise<void> {
  const db = getSupabaseAdmin()
  const { data } = await db.from('mtm_automacoes').select('disparos').eq('id', automacaoId).maybeSingle()
  await db
    .from('mtm_automacoes')
    .update({ disparos: Number(data?.disparos ?? 0) + 1, ultimo_disparo: new Date().toISOString() })
    .eq('id', automacaoId)
}

/**
 * O texto a enviar. Quando a resposta é por IA, escreve-se na hora com o contexto da pessoa.
 *
 * A IA aqui não inventa números: recebe a instrução da automação e o que a pessoa disse, e mais
 * nada. Dar-lhe acesso a números de desempenho sem os verificar era como a linha congelada que
 * andou dois meses a sair em cartões.
 */
/**
 * A resposta pública a um comentário — uma da lista, à vez.
 *
 * Roda pelo número de disparos e não à sorte: à sorte repetiria duas seguidas com frequência, e
 * duas iguais seguidas por baixo do mesmo post é precisamente o que se quer evitar.
 */
export function respostaPublica(a: Automacao): string | null {
  const lista = a.resposta?.publicas?.filter(Boolean) ?? []
  if (!lista.length) return null
  return lista[a.disparos % lista.length]
}

export async function textoDaResposta(a: Automacao, doCliente: string): Promise<string> {
  if (a.respostaTipo !== 'ia') return a.resposta?.texto ?? ''

  const key = process.env.ANTHROPIC_API_KEY?.trim()
  // Sem chave devolve-se o texto de reserva — uma automação que não responde nada é pior do que
  // uma que responde o básico.
  if (!key) return a.resposta?.texto ?? ''

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: modeloClaude(process.env.CONTENT_DRAFT_MODEL),
        max_tokens: 400,
        system:
          // A visão da casa vem de um sítio só: uma automação de IA responde EM NOME da casa, e
          // sem factos na mão nega produtos que existem a quem pergunta por eles.
          `${contextoDaCasa()}\n\n` +
          'Respondes em nome da MoreThanMoney, comunidade portuguesa de trading. Português de ' +
          'Portugal, tratamento por "tu", curto — duas ou três frases. Nada de promessas de lucro ' +
          'nem números de desempenho: não os tens e inventá-los destrói a confiança. ' +
          `Instrução para esta resposta: ${a.resposta?.instrucao ?? 'responde e encaminha para o passo seguinte'}` +
          (a.resposta?.url ? `\nLink a incluir: ${a.resposta.url}` : ''),
        messages: [{ role: 'user', content: doCliente.slice(0, 1000) }],
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!r.ok) return a.resposta?.texto ?? ''
    const j = await r.json()
    const texto = ((j?.content ?? []) as { type: string; text?: string }[])
      .filter((p) => p.type === 'text')
      .map((p) => p.text ?? '')
      .join('')
      .trim()
    return texto || a.resposta?.texto || ''
  } catch {
    return a.resposta?.texto ?? ''
  }
}

/**
 * O "smart delay": juntar as mensagens de uma pessoa antes de a IA responder.
 *
 * Ideia tirada do ChatbotX (`packages/automated-response`). Resolve um problema que qualquer
 * pessoa reconhece: quem escreve a um bot manda três mensagens seguidas — "olá", "queria saber",
 * "sobre os sinais". Um bot que responde a cada uma responde três vezes e responde à mensagem
 * ERRADA: a primeira, quando a pergunta estava na terceira.
 *
 * As regras por PALAVRA continuam instantâneas. Quem escreve "APP" quer o link agora, e fazê-lo
 * esperar por uma heurística seria estragar o caso simples para melhorar o complicado — que é
 * exactamente a distinção que o ChatbotX faz em `isSmartDelayEligible`.
 */
export const ESPERA_IA_SEGUNDOS = Number(process.env.BOT_SMART_DELAY_SEGUNDOS) || 8

/** Põe a mensagem na fila e diz se ESTA chamada é a que deve responder. */
export async function enfileirarParaIA(
  canal: CanalAutomacao,
  pessoa: string,
  texto: string,
): Promise<void> {
  await getSupabaseAdmin().from('mtm_conversa_fila').insert({
    pessoa: `${canal}:${pessoa}`,
    canal,
    texto: texto.slice(0, 2000),
    responder_a: new Date(Date.now() + ESPERA_IA_SEGUNDOS * 1000).toISOString(),
  })
}

export interface ConversaJunta {
  pessoa: string
  canal: CanalAutomacao
  texto: string
  ids: string[]
}

/**
 * As conversas prontas a responder — já com as mensagens de cada pessoa juntas numa só.
 *
 * Uma pessoa que continua a escrever ADIA a resposta: enquanto houver mensagens dela por vencer,
 * não se responde a nenhuma. É o que evita responder a meio de um raciocínio.
 */
export async function conversasProntas(limite = 20): Promise<ConversaJunta[]> {
  const db = getSupabaseAdmin()
  const { data } = await db
    .from('mtm_conversa_fila')
    .select('id, pessoa, canal, texto, responder_a')
    .eq('processada', false)
    .order('created_at')
    .limit(200)

  const porPessoa = new Map<string, { canal: string; textos: string[]; ids: string[]; venceuTudo: boolean }>()
  const agora = Date.now()

  for (const m of data ?? []) {
    const p = String(m.pessoa)
    const g = porPessoa.get(p) ?? { canal: String(m.canal), textos: [], ids: [], venceuTudo: true }
    g.textos.push(String(m.texto))
    g.ids.push(String(m.id))
    // Uma só mensagem ainda por vencer chega para adiar a pessoa inteira.
    if (new Date(String(m.responder_a)).getTime() > agora) g.venceuTudo = false
    porPessoa.set(p, g)
  }

  return [...porPessoa.entries()]
    .filter(([, g]) => g.venceuTudo && g.textos.length)
    .slice(0, limite)
    .map(([pessoa, g]) => ({
      pessoa: pessoa.split(':').slice(1).join(':'),
      canal: g.canal as CanalAutomacao,
      texto: g.textos.join('\n'),
      ids: g.ids,
    }))
}

export async function marcarRespondidas(ids: string[]): Promise<void> {
  if (!ids.length) return
  await getSupabaseAdmin().from('mtm_conversa_fila').update({ processada: true }).in('id', ids)
}
