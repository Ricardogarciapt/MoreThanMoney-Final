import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { buildSalesState } from '@/lib/sales-machine'
import { getExecSwitches, setExecSwitches } from '@/lib/mtmcopy/exec-switches'
import { lerFunis } from '@/lib/funis'
import { andar, bracosDeEnsaio, funilPorId } from '@/lib/funis-motor'
import { correrRadar } from '@/lib/instagram/radar'
import { listarAutomacoes } from '@/lib/automacoes'
import { acharAgente, darOrdem, listarOrdens } from '@/lib/agentes/ordens'
import { tocaPremium, validarRota } from '@/lib/telegram/rotas'
import { validarMenu } from '@/lib/telegram/menu-bot'
import { gravarMenu, lerMenu } from '@/lib/telegram/menu-bot-servidor'
import { validarPedido } from '@/lib/telegram/grupos-novos'

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
        // Nomes reais das colunas de mtmauto_accounts (nome/is_active/provider_id nao existem:
        // o select falhava e a ferramenta devolvia sempre zero contas). Os apelidos mantem as
        // chaves de saida. A estrategia seguida vive em mtmauto_subscriptions, nao aqui.
        .select('id, nome:nome_exibicao, is_active:copia_ativa, risco_pct, created_at')
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

  {
    nome: 'dar_ordem_agente',
    descricao:
      'Dá uma ordem do dono a um agente da equipa (CEO, Sensei, Vendedora…). Chega-lhe no próximo ' +
      'ciclo do motor do AIOS e a resposta dele fica na ordem (ver ordens_dos_agentes). Reversível: ' +
      'cancela-se enquanto não está feita. A ordem não passa por cima das leis do motor (dinheiro, ' +
      'trading e apagar continuam a pedir o dono).',
    esquema: {
      type: 'object',
      properties: {
        agente: { type: 'string', description: 'Nome ou código do agente, tal como aparece em Gestão → Agentes' },
        texto: { type: 'string', description: 'A ordem, em PT-PT, com o que se quer e até quando' },
      },
      required: ['agente', 'texto'],
      additionalProperties: false,
    },
    correr: async (a) => {
      const r = await darOrdem(getSupabaseAdmin(), { agente: String(a.agente ?? ''), texto: String(a.texto ?? ''), origem: 'chat', por: 'dono (chat IA)' })
      return r.ok ? { ok: true, agente: r.agente, ordem_id: r.ordem.id, estado: r.ordem.estado } : { ok: false, erro: r.erro }
    },
  },

  {
    nome: 'ordens_dos_agentes',
    descricao: 'As ordens dadas aos agentes, com o estado (pendente, entregue, em curso, feita, recusada, cancelada) e a resposta de cada agente.',
    esquema: {
      type: 'object',
      properties: {
        agente: { type: 'string', description: 'Só as deste agente (nome ou código). Vazio = todos' },
        abertas: { type: 'boolean', description: 'Só as que ainda não estão fechadas' },
      },
      additionalProperties: false,
    },
    correr: async (a) => {
      const db = getSupabaseAdmin()
      const ag = a.agente ? await acharAgente(db, String(a.agente)) : null
      if (a.agente && !ag) return { ok: false, erro: `Não encontrei o agente «${a.agente}».` }
      const r = await listarOrdens(db, { agenteId: ag?.id, abertas: a.abertas === true, limite: 30 })
      return r.erro ? { ok: false, erro: r.erro } : { ok: true, ordens: r.ordens }
    },
  },

  // ── Telegram (Gestão → Telegram). A IA só deixa RASCUNHOS: rota pausada, comando fora do menu,
  // grupo à espera de Aprovar. Ligar, publicar e criar continuam a ser um clique do dono no painel.
  {
    nome: 'telegram_estado',
    descricao:
      'O Telegram da casa: as rotas do forwarder (fonte → destino, activa ou pausada), os comandos ' +
      'do bot @MoreThanMoney_aibot (os de base e os extra), os bots registados e os últimos pedidos ' +
      'de grupos e canais novos. Ver antes de propor alguma coisa, para não duplicar.',
    esquema: semArgs,
    correr: async () => {
      const db = getSupabaseAdmin()
      const [rotas, bots, pedidos, menu] = await Promise.all([
        db.from('telegram_rotas').select('nome, fonte, destino, filtro, activa, notas').order('criado_em'),
        db.from('telegram_bots').select('username, nome, notas'),
        db.from('telegram_grupos_novos').select('tipo, titulo, bot, estado, convite, criado_em').order('criado_em', { ascending: false }).limit(10),
        lerMenu(db),
      ])
      return {
        rotas: rotas.data ?? [],
        bots: bots.data ?? [],
        gruposPedidos: pedidos.data ?? [],
        comandos: { base: menu.base, extras: menu.extras.map(({ command, description, visivel }) => ({ command, description, visivel })) },
        premium: '-1002424441843 é a Premium: EXECUTA nas contas dos clientes. Nunca propor rotas para lá.',
      }
    },
  },

  {
    nome: 'telegram_propor_rota',
    descricao:
      'Propõe uma rota do forwarder (lê a fonte com a conta do dono e republica no destino pelo bot). ' +
      'Fica PAUSADA: o dono liga-a em Gestão → Telegram → Forwarder. Recusa a Premium.',
    esquema: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'curto, letras-números-hífenes, ex.: ouro-londres' },
        fonte: { type: 'string', description: 'id do chat (-100…) ou @canal a ler' },
        destino: { type: 'string', description: 'id do chat MTM (-100…) onde o bot publica' },
        filtro: { type: 'string', enum: ['gold', 'all', 'astro'], description: 'gold = só setups/TP/SL; all = tudo' },
        cabecalho: { type: 'string', description: 'opcional' },
        porque: { type: 'string', description: 'uma frase para o dono perceber a proposta' },
      },
      required: ['nome', 'fonte', 'destino'],
      additionalProperties: false,
    },
    correr: async (a) => {
      const v = validarRota({ ...a, activa: false, notas: `Proposta pela IA: ${String(a.porque ?? '').slice(0, 250)}` })
      if (!v.ok) return { erro: v.erro }
      if (tocaPremium(v.rota.destino)) return { erro: 'A Premium executa nas contas dos clientes. Isso só o dono faz, à mão, no painel.' }
      const { error } = await getSupabaseAdmin().from('telegram_rotas').insert({ ...v.rota, relay: 'gmi-relay', so_novas: true })
      if (error) return { erro: error.code === '23505' ? 'Já há uma rota com esse nome.' : error.message }
      return { ok: true, estado: 'pausada', falta: 'O dono liga-a em Gestão → Telegram → Forwarder.' }
    },
  },

  {
    nome: 'telegram_propor_comando',
    descricao:
      'Acrescenta um comando ao bot @MoreThanMoney_aibot (ex.: /bootcamp) com uma resposta fixa e ' +
      'até 6 botões de link https. Fica em RASCUNHO (não responde, não aparece) até o dono o ' +
      'aceitar e publicar em Gestão → Telegram → Menu do bot.',
    esquema: {
      type: 'object',
      properties: {
        comando: { type: 'string', description: 'sem barra, letras-números-_' },
        descricao: { type: 'string', description: 'o texto no menu' },
        resposta: { type: 'string', description: 'o que o bot responde (texto simples, PT-PT, tu)' },
        botoes: { type: 'array', items: { type: 'object', properties: { texto: { type: 'string' }, url: { type: 'string' } }, required: ['texto', 'url'] } },
      },
      required: ['comando', 'descricao', 'resposta'],
      additionalProperties: false,
    },
    correr: async (a) => {
      const db = getSupabaseAdmin()
      const menu = await lerMenu(db)
      const extra = { command: String(a.comando ?? ''), description: String(a.descricao ?? ''), resposta: String(a.resposta ?? ''), botoes: Array.isArray(a.botoes) ? a.botoes : [], visivel: true, rascunho: true }
      const v = validarMenu({ ...menu, extras: [...menu.extras, extra] })
      if (!v.ok) return { erro: v.erro }
      const { error } = await gravarMenu(db, v.menu)
      if (error) return { erro: error.message }
      return { ok: true, estado: 'rascunho', falta: 'O dono aceita-o e publica em Gestão → Telegram → Menu do bot.' }
    },
  },

  {
    nome: 'telegram_propor_grupo',
    descricao:
      'Propõe um grupo (as pessoas falam) ou um canal (só nós publicamos) novo, com o bot como ' +
      'administrador. Fica em RASCUNHO: só é criado, com a conta pessoal do dono, depois de ele ' +
      'carregar em Aprovar (máximo 3 por dia).',
    esquema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['grupo', 'canal'] },
        titulo: { type: 'string' },
        descricao: { type: 'string', description: 'até 255 caracteres; inclui o aviso educativo se falar de trading' },
      },
      required: ['tipo', 'titulo'],
      additionalProperties: false,
    },
    correr: async (a) => {
      const v = validarPedido({ ...a, bot: 'MoreThanMoney_aibot' })
      if (!v.ok) return { erro: v.erro }
      const { error } = await getSupabaseAdmin().from('telegram_grupos_novos').insert({ ...v.pedido, estado: 'rascunho' })
      if (error) return { erro: error.message }
      return { ok: true, estado: 'rascunho', falta: 'O dono aprova em Gestão → Telegram → Grupos e bots novos.' }
    },
  },

  {
    nome: 'pipeline_vendas',
    descricao:
      'O pipeline de vendas (vendas_negocios) dos últimos N dias: quantos negócios por etapa ' +
      '(lead → contactado → qualificado → marcado → apresentado → ganho/perdido) e por origem. ' +
      'Serve para ver de onde vêm os negócios (ex.: telegram) antes de desenhar um funil novo.',
    esquema: {
      type: 'object',
      properties: { dias: { type: 'number', description: 'janela em dias (por omissão 30, máximo 180)' } },
      additionalProperties: false,
    },
    correr: async (a) => {
      const dias = Math.min(Math.max(Number(a.dias) || 30, 1), 180)
      const { data, error } = await getSupabaseAdmin()
        .from('vendas_negocios')
        .select('estado, origem, pack_previsto')
        .gte('criado_em', new Date(Date.now() - dias * 86_400_000).toISOString())
        .limit(5000)
      if (error) return { erro: error.message }
      const conta = (k: 'estado' | 'origem' | 'pack_previsto') =>
        Object.entries((data ?? []).reduce<Record<string, number>>((m, n) => { const c = n[k] || '(sem)'; m[c] = (m[c] ?? 0) + 1; return m }, {})).sort((x, y) => y[1] - x[1])
      return { dias, total: data?.length ?? 0, porEtapa: conta('estado'), porOrigem: conta('origem'), porPack: conta('pack_previsto') }
    },
  },
]

export function ferramentaPorNome(nome: string): Ferramenta | undefined {
  return FERRAMENTAS.find((f) => f.nome === nome)
}
