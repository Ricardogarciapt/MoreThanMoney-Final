import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { buildSalesState } from '@/lib/sales-machine'
import { getExecSwitches, setExecSwitches } from '@/lib/mtmcopy/exec-switches'
import { lerFunis } from '@/lib/funis'
import { andar, bracosDeEnsaio, funilPorId } from '@/lib/funis-motor'
import { correrRadar } from '@/lib/instagram/radar'
import { listarAutomacoes } from '@/lib/automacoes'

/**
 * As ferramentas que o sistema MTM expõe — a mesma camada que o painel usa.
 *
 * Isto existe para o negócio inteiro poder ser conduzido de fora: por mim, pelo AIOS, por
 * qualquer cliente MCP. E existe UMA vez: se o painel chamasse rotas e o MCP chamasse outras,
 * seriam duas descrições do mesmo negócio a divergir — que é exactamente o problema que já
 * tivemos com o funil escrito em três sítios.
 *
 * ── O que se expõe e o que se recusa ─────────────────────────────────────────────────────────
 * Ler: tudo o que o admin vê.
 * Escrever: só o que é reversível com um clique. Publicar um post, executar uma ordem, mandar
 * uma mensagem a um cliente ou mexer em dinheiro NÃO estão aqui — não porque a API não conseguia,
 * mas porque uma ferramenta que faz isso a partir de uma frase mal interpretada não tem volta.
 * Aprovar continua a ser um gesto humano no painel.
 */

export interface Ferramenta {
  nome: string
  descricao: string
  esquema: Record<string, unknown>
  correr: (args: Record<string, unknown>) => Promise<unknown>
}

const semArgs = { type: 'object', properties: {}, additionalProperties: false }

export const FERRAMENTAS: Ferramenta[] = [
  {
    nome: 'estado_do_negocio',
    descricao:
      'O estado da máquina de vendas agora: leads por etapa, a escada do funil com a queda entre ' +
      'andares, conversões nas últimas 24h, fila de conteúdo, saúde das automações e tendência de ' +
      '14 dias. É o primeiro sítio a olhar para saber onde o negócio está travado.',
    esquema: semArgs,
    correr: async () => await buildSalesState(),
  },

  {
    nome: 'radar_conversas',
    descricao:
      'As conversas do nicho encontradas no Instagram e ainda por tratar, ordenadas por quanto ' +
      'vale a pena entrar nelas. Cada uma traz a legenda, a pontuação e a razão da pontuação.',
    esquema: {
      type: 'object',
      properties: { limite: { type: 'number', description: 'Quantas devolver (por omissão 20)' } },
      additionalProperties: false,
    },
    correr: async (a) => {
      const { data } = await getSupabaseAdmin()
        .from('ig_radar_prospetos')
        .select('id, hashtag, permalink, legenda, gostos, comentarios, pontuacao, porque')
        .eq('estado', 'pendente')
        .order('pontuacao', { ascending: false })
        .limit(Math.min(Number(a.limite) || 20, 50))
      return { prospetos: data ?? [] }
    },
  },

  {
    nome: 'procurar_conversas',
    descricao:
      'Corre o radar agora: procura hashtags do nicho e guarda os posts que valem a pena. ' +
      'Reversível — só escreve numa lista que ninguém vê senão nós. ' +
      'Atenção à quota: o Instagram só deixa 30 hashtags diferentes por 7 dias.',
    esquema: {
      type: 'object',
      properties: { hashtags: { type: 'number', description: 'Quantas procurar nesta passagem (1 a 5, por omissão 3)' } },
      additionalProperties: false,
    },
    correr: async (a) => await correrRadar(Math.min(Math.max(Number(a.hashtags) || 3, 1), 5)),
  },

  {
    nome: 'listar_funis',
    descricao:
      'Os funis desenhados, com os blocos, as ligações e a configuração de cada bloco. É o JSON ' +
      'que o editor grava — serve para ler, para copiar e para levar para outro lado.',
    esquema: semArgs,
    correr: async () => ({ funis: await lerFunis() }),
  },

  {
    nome: 'ensaiar_funil',
    descricao:
      'Percorre um funil com uma pessoa real e devolve o caminho passo a passo: que mensagens ' +
      'sairiam, por que lado de cada condição a pessoa cai, onde pararia. NÃO envia nada, não ' +
      'etiqueta, não chama nada de fora. É o que se faz antes de ligar um funil.',
    esquema: {
      type: 'object',
      properties: {
        funil: { type: 'string', description: 'O id do funil (ver listar_funis)' },
        pessoa: { type: 'string', description: 'Ex.: "telegram:12345". Vazio = o lead mais recente.' },
      },
      required: ['funil'],
      additionalProperties: false,
    },
    correr: async (a) => {
      const funil = await funilPorId(String(a.funil))
      if (!funil) return { erro: 'Funil desconhecido' }
      let quem = String(a.pessoa ?? '').trim()
      if (!quem) {
        const { data } = await getSupabaseAdmin()
          .from('telegram_leads')
          .select('chat_id')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        quem = data?.chat_id ? `telegram:${data.chat_id}` : 'telegram:0'
      }
      const r = await andar(funil, { pessoa: quem, dados: {} }, bracosDeEnsaio, { ensaio: true })
      return { pessoa: quem, ...r }
    },
  },

  {
    nome: 'listar_automacoes',
    descricao:
      'As regras que respondem sozinhas no Telegram e no Instagram: palavra que dispara, o que ' +
      'responde, se está ligada, quantas vezes disparou e quando foi a última.',
    esquema: semArgs,
    correr: async () => ({ automacoes: await listarAutomacoes() }),
  },

  {
    nome: 'estado_da_execucao',
    descricao:
      'Os interruptores dos motores de trading: que estratégias estão a executar, que monitores ' +
      'de preço estão ligados, e se o trailing segue o preço ao vivo.',
    esquema: semArgs,
    correr: async () => await getExecSwitches(),
  },

  {
    nome: 'mexer_interruptor',
    descricao:
      'Liga ou desliga UM interruptor de execução. Reversível com o mesmo gesto. ' +
      'Cuidado: desligar uma estratégia pára a execução de trades reais — confirma com o Ricardo ' +
      'antes de mexer em qualquer coisa que comece por "premium", "sensei", "forex" ou "t2t".',
    esquema: {
      type: 'object',
      properties: {
        chave: { type: 'string', description: 'O nome do interruptor (ver estado_da_execucao)' },
        ligado: { type: 'boolean' },
      },
      required: ['chave', 'ligado'],
      additionalProperties: false,
    },
    correr: async (a) => {
      const atuais = await getExecSwitches()
      if (!(String(a.chave) in atuais)) return { erro: `Interruptor desconhecido: ${a.chave}` }
      return await setExecSwitches({ [String(a.chave)]: a.ligado === true })
    },
  },

  {
    nome: 'contas_a_copiar',
    descricao:
      'As contas de clientes ligadas à cópia automática e o estado de cada uma: se está ativa, ' +
      'que estratégia segue e com que risco.',
    esquema: semArgs,
    correr: async () => {
      const { data } = await getSupabaseAdmin()
        .from('mtmauto_accounts')
        .select('id, nome, is_active, risco_pct, provider_id, created_at')
        .order('created_at', { ascending: false })
        .limit(100)
      return { contas: data ?? [] }
    },
  },

  {
    nome: 'fila_de_conteudo',
    descricao:
      'Os posts agendados por publicar, com a conta, o pilar, a hora e se já têm imagem. ' +
      'Nada é publicado a partir daqui: aprovar é um gesto humano no painel, e é assim de propósito.',
    esquema: semArgs,
    correr: async () => {
      const { data } = await getSupabaseAdmin()
        .from('social_scheduled_posts')
        .select('id, ig_username, pillar, status, scheduled_at, media_urls, caption')
        .in('status', ['draft', 'approved', 'processing'])
        .order('scheduled_at')
        .limit(30)
      return {
        posts: (data ?? []).map((p) => ({
          id: p.id,
          conta: p.ig_username,
          pilar: p.pillar,
          estado: p.status,
          quando: p.scheduled_at,
          temImagem: Array.isArray(p.media_urls) && p.media_urls.length > 0,
          texto: String(p.caption ?? '').slice(0, 200),
        })),
      }
    },
  },
]

export function ferramentaPorNome(nome: string): Ferramenta | undefined {
  return FERRAMENTAS.find((f) => f.nome === nome)
}
