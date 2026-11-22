import type { Ferramenta } from '@/lib/mcp/ferramentas'
import { chamarApi, curto, guardarSessao, idDoGrupo, lerPagina, lerSessao } from '@/lib/skool/cliente'

/**
 * Ferramentas do conector MCP do Skool.
 *
 * As leituras usam as páginas (formato estável há anos). As escritas usam os caminhos do api2
 * que o próprio site chama; como não há documentação oficial, `skool_api` deixa chamar qualquer
 * caminho do api2 — se o Skool mudar uma rota, ajusta-se sem deploy.
 *
 * Escritas que outra pessoa vê (post, comentário, mensagem, aprovar/banir membro) exigem
 * `confirmar: true`: o modelo tem de mostrar o texto ao Ricardo antes, não publicar à primeira.
 */

const grupoAtual = async () => (await lerSessao()).grupo

const PEDE_CONFIRMACAO = {
  confirmar: {
    type: 'boolean',
    description: 'Tem de ser true. Só depois de mostrares ao Ricardo exactamente o que vai sair e ele dizer que sim.',
  },
}

function exigirConfirmacao(args: Record<string, unknown>) {
  if (args.confirmar !== true) throw new Error('Esta acção é visível para outras pessoas: mostra primeiro o conteúdo ao Ricardo e repete com confirmar=true.')
}

/** Quando não conhecemos a forma exacta de uma página, devolvemos as chaves e um excerto. */
function resumirPagina(pp: Record<string, any>, preferidas: string[]) {
  const achadas = preferidas.filter((k) => pp[k] !== undefined)
  if (achadas.length) return Object.fromEntries(achadas.map((k) => [k, pp[k]]))
  const ignorar = new Set(['translation', 'growthBookData', 'env', 'renderData', 'settings', '_sentryTraceData', '_sentryBaggage', 'self', 'currentGroup', 'userAgent', 'securityNonce'])
  return { chaves: Object.keys(pp).filter((k) => !ignorar.has(k)), excerto: curto(Object.fromEntries(Object.entries(pp).filter(([k]) => !ignorar.has(k))), 6000) }
}

function resumirPost(p: any) {
  const m = p?.metadata ?? {}
  return {
    id: p?.id,
    slug: p?.name,
    titulo: m.title,
    conteudo: curto(m.content, 500),
    autor: p?.user ? `${p.user.firstName ?? ''} ${p.user.lastName ?? ''}`.trim() || p.user.name : undefined,
    categoria_id: p?.labelId || m.labels,
    gostos: m.upvotes,
    comentarios: m.comments,
    fixado: Boolean(m.pinned),
    criado: p?.createdAt,
  }
}

function resumirComentarios(filhos: any[] | undefined, nivel = 0): any[] {
  return (filhos ?? []).map((c) => ({
    id: c?.post?.id,
    autor: c?.post?.user ? `${c.post.user.firstName ?? ''} ${c.post.user.lastName ?? ''}`.trim() : undefined,
    texto: curto(c?.post?.metadata?.content, 600),
    criado: c?.post?.createdAt,
    ...(nivel < 1 && c?.children?.length ? { respostas: resumirComentarios(c.children, nivel + 1) } : {}),
  }))
}

function resumirMembro(u: any) {
  const mb = u?.member ?? {}
  return {
    user_id: u?.id,
    member_id: mb.id,
    nome: `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim(),
    username: u?.name,
    papel: mb.role,
    nivel: u?.metadata?.spData ? curto(u.metadata.spData, 80) : undefined,
    entrou: mb.approvedAt || mb.createdAt,
    ultima_atividade: mb.lastOffline || u?.metadata?.lastOffline,
  }
}

export const FERRAMENTAS_SKOOL: Ferramenta[] = [
  // ── Sessão ──────────────────────────────────────────────────────────────────────────────
  {
    nome: 'skool_estado',
    descricao:
      'Verifica se a ligação ao Skool está viva e devolve: com que conta estamos, a comunidade, total de membros e posts, e as categorias (com o id que skool_post_criar precisa). Corre primeiro.',
    esquema: { type: 'object', properties: {}, additionalProperties: false },
    correr: async () => {
      const s = await lerSessao()
      const { pageProps: pp, buildId } = await lerPagina(s.grupo)
      const g = pp.currentGroup ?? {}
      return {
        conta: pp.self ? { username: pp.self.name, nome: `${pp.self.firstName ?? ''} ${pp.self.lastName ?? ''}`.trim() } : null,
        comunidade: { slug: s.grupo, id: g.id, nome: g.metadata?.displayName, membros: g.metadata?.totalMembers, posts: g.metadata?.totalPosts, admins: g.metadata?.totalAdmins, online: g.metadata?.totalOnlineMembers },
        categorias: (g.labels ?? []).map((l: any) => ({ id: l.id, nome: l.metadata?.displayName ?? l.name })),
        sessao_atualizada_em: s.atualizadaEm ?? 'env SKOOL_COOKIE',
        buildId,
      }
    },
  },
  {
    nome: 'skool_sessao_guardar',
    descricao:
      'Guarda (ou renova) os cookies da sessão do Skool no servidor, sem deploy. Aceita o cabeçalho Cookie inteiro copiado do browser; guarda só auth_token, client_id e aws-waf-token. Opcional: slug da comunidade.',
    esquema: {
      type: 'object',
      properties: {
        cookie: { type: 'string', description: 'Cabeçalho Cookie do browser (tem de incluir auth_token)' },
        grupo: { type: 'string', description: 'Slug da comunidade, ex. morethanmoney-1132' },
      },
      required: ['cookie'],
      additionalProperties: false,
    },
    correr: async (a) => guardarSessao(String(a.cookie ?? ''), a.grupo ? String(a.grupo) : undefined),
  },

  // ── Comunidade (posts) ─────────────────────────────────────────────────────────────────
  {
    nome: 'skool_posts_listar',
    descricao: 'Lista os posts do feed da comunidade (30 por página): título, excerto, autor, gostos, nº de comentários, fixado.',
    esquema: {
      type: 'object',
      properties: {
        pagina: { type: 'number', description: 'Por omissão 1' },
        ordem: { type: 'string', enum: ['newest-cm', 'new', 'top', 'trending'], description: 'newest-cm = atividade recente (omissão)' },
        categoria_id: { type: 'string', description: 'Filtrar por categoria (id de skool_estado)' },
      },
      additionalProperties: false,
    },
    correr: async (a) => {
      const q = new URLSearchParams({ s: String(a.ordem ?? 'newest-cm') })
      if (a.pagina && Number(a.pagina) > 1) q.set('p', String(a.pagina))
      if (a.categoria_id) q.set('c', String(a.categoria_id))
      const { pageProps: pp } = await lerPagina(`${await grupoAtual()}?${q}`)
      return { total: pp.total, posts: (pp.postTrees ?? []).map((t: any) => resumirPost(t.post)) }
    },
  },
  {
    nome: 'skool_post_ler',
    descricao: 'Lê um post completo com os comentários (2 níveis). Recebe o slug do post (campo "slug" de skool_posts_listar).',
    esquema: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'], additionalProperties: false },
    correr: async (a) => {
      const { pageProps: pp } = await lerPagina(`${await grupoAtual()}/${encodeURIComponent(String(a.slug))}`)
      const arvore = pp.postTree ?? pp.postModal ?? null
      if (!arvore?.post) return resumirPagina(pp, ['postTree'])
      return { ...resumirPost(arvore.post), conteudo: arvore.post.metadata?.content, comentarios_lista: resumirComentarios(arvore.children) }
    },
  },
  {
    nome: 'skool_post_criar',
    descricao:
      'Publica um post na comunidade. Pede categoria_id (de skool_estado). notificar_todos manda email a todos os membros (só admin, ~1 vez por 72 h). Mostra o texto ao Ricardo antes.',
    esquema: {
      type: 'object',
      properties: {
        titulo: { type: 'string' },
        conteudo: { type: 'string', description: 'Texto do post (aceita markdown simples e quebras de linha)' },
        categoria_id: { type: 'string' },
        notificar_todos: { type: 'boolean' },
        ...PEDE_CONFIRMACAO,
      },
      required: ['titulo', 'conteudo', 'categoria_id', 'confirmar'],
      additionalProperties: false,
    },
    correr: async (a) => {
      exigirConfirmacao(a)
      const groupId = await idDoGrupo()
      const q = a.notificar_todos ? 'posts?follow=true&notify_all=true' : 'posts?follow=true'
      const r: any = await chamarApi('POST', q, {
        post_type: 'generic',
        group_id: groupId,
        metadata: { title: String(a.titulo), content: String(a.conteudo), attachments: '', labels: String(a.categoria_id), action: 0, video_ids: '' },
      })
      return { publicado: true, id: r?.id, slug: r?.name, url: r?.name ? `https://www.skool.com/${await grupoAtual()}/${r.name}` : undefined }
    },
  },
  {
    nome: 'skool_comentar',
    descricao: 'Comenta um post, ou responde a um comentário (passa responder_a com o id do comentário). Mostra o texto ao Ricardo antes.',
    esquema: {
      type: 'object',
      properties: {
        post_id: { type: 'string', description: 'id do post (não o slug)' },
        conteudo: { type: 'string' },
        responder_a: { type: 'string', description: 'id do comentário a que respondes (opcional)' },
        ...PEDE_CONFIRMACAO,
      },
      required: ['post_id', 'conteudo', 'confirmar'],
      additionalProperties: false,
    },
    correr: async (a) => {
      exigirConfirmacao(a)
      const groupId = await idDoGrupo()
      const r: any = await chamarApi('POST', 'posts?follow=true', {
        post_type: 'comment',
        group_id: groupId,
        root_id: String(a.post_id),
        parent_id: String(a.responder_a ?? a.post_id),
        metadata: { content: String(a.conteudo), attachments: '', action: 0, video_ids: '' },
      })
      return { comentado: true, id: r?.id }
    },
  },
  {
    nome: 'skool_post_editar',
    descricao: 'Edita o título e/ou o texto de um post teu (id do post).',
    esquema: {
      type: 'object',
      properties: { post_id: { type: 'string' }, titulo: { type: 'string' }, conteudo: { type: 'string' }, ...PEDE_CONFIRMACAO },
      required: ['post_id', 'confirmar'],
      additionalProperties: false,
    },
    correr: async (a) => {
      exigirConfirmacao(a)
      const metadata: Record<string, string> = {}
      if (a.titulo) metadata.title = String(a.titulo)
      if (a.conteudo) metadata.content = String(a.conteudo)
      return chamarApi('PUT', `posts/${encodeURIComponent(String(a.post_id))}`, { metadata })
    },
  },
  {
    nome: 'skool_post_apagar',
    descricao: 'Apaga um post ou comentário (id). Não há volta: confirma com o Ricardo.',
    esquema: { type: 'object', properties: { post_id: { type: 'string' }, ...PEDE_CONFIRMACAO }, required: ['post_id', 'confirmar'], additionalProperties: false },
    correr: async (a) => {
      exigirConfirmacao(a)
      return chamarApi('DELETE', `posts/${encodeURIComponent(String(a.post_id))}`)
    },
  },

  // ── Membros ────────────────────────────────────────────────────────────────────────────
  {
    nome: 'skool_membros_listar',
    descricao:
      'Lista membros: ativos, pendentes (pedidos de entrada à espera), admins ou cancelados. Devolve user_id e member_id (as acções sobre membros usam o member_id).',
    esquema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['active', 'pending', 'admins', 'cancelling', 'churned', 'banned'], description: 'Por omissão active' },
        pagina: { type: 'number' },
      },
      additionalProperties: false,
    },
    correr: async (a) => {
      const q = new URLSearchParams({ t: String(a.tipo ?? 'active') })
      if (a.pagina && Number(a.pagina) > 1) q.set('p', String(a.pagina))
      const { pageProps: pp } = await lerPagina(`${await grupoAtual()}/-/members?${q}`)
      const lista = pp.users ?? pp.members ?? null
      if (!Array.isArray(lista)) return resumirPagina(pp, ['users', 'members', 'totalUsers'])
      return { total: pp.totalUsers ?? pp.total, membros: lista.map(resumirMembro) }
    },
  },

  // ── Classroom ──────────────────────────────────────────────────────────────────────────
  {
    nome: 'skool_cursos_listar',
    descricao: 'Lista os cursos do Classroom (título, slug, privacidade, nº de módulos, progresso).',
    esquema: { type: 'object', properties: {}, additionalProperties: false },
    correr: async () => {
      const { pageProps: pp } = await lerPagina(`${await grupoAtual()}/classroom`)
      const cursos = pp.allCourses ?? pp.courses
      if (!Array.isArray(cursos)) return resumirPagina(pp, ['allCourses', 'courses'])
      return cursos.map((c: any) => ({
        id: c.id,
        slug: c.name,
        titulo: c.metadata?.title,
        descricao: curto(c.metadata?.desc, 200),
        privacidade: c.metadata?.privacy,
        modulos: c.metadata?.numModules,
        progresso: c.metadata?.progress,
      }))
    },
  },
  {
    nome: 'skool_curso_ler',
    descricao: 'Lê a árvore de um curso (pastas e aulas, com o texto de cada aula resumido). Recebe o slug do curso.',
    esquema: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'], additionalProperties: false },
    correr: async (a) => {
      const { pageProps: pp } = await lerPagina(`${await grupoAtual()}/classroom/${encodeURIComponent(String(a.slug))}`)
      const c = pp.course
      if (!c) return resumirPagina(pp, ['course'])
      const andar = (n: any): any => ({
        id: n?.course?.id,
        tipo: n?.course?.unitType,
        titulo: n?.course?.metadata?.title,
        texto: n?.course?.metadata?.desc ? curto(n.course.metadata.desc, 300) : undefined,
        video: n?.course?.metadata?.videoLink,
        filhos: (n?.children ?? []).map(andar),
      })
      return andar(c)
    },
  },

  // ── Calendário ─────────────────────────────────────────────────────────────────────────
  {
    nome: 'skool_eventos',
    descricao: 'Eventos do calendário da comunidade (próximos e recorrentes): título, data/hora, fuso, link.',
    esquema: { type: 'object', properties: {}, additionalProperties: false },
    correr: async () => {
      const { pageProps: pp } = await lerPagina(`${await grupoAtual()}/calendar`)
      const ev = pp.events ?? pp.upcomingEvents
      if (!Array.isArray(ev)) return resumirPagina(pp, ['events', 'upcomingEvents'])
      return ev.map((e: any) => ({
        id: e.id,
        titulo: e.metadata?.title,
        inicio: e.metadata?.startTime ?? e.startTime,
        fim: e.metadata?.endTime ?? e.endTime,
        fuso: e.metadata?.timezone,
        recorrente: e.metadata?.recurring ?? undefined,
        link: e.metadata?.location ?? e.metadata?.link,
        descricao: curto(e.metadata?.description, 200),
      }))
    },
  },

  // ── Chat (DMs) ─────────────────────────────────────────────────────────────────────────
  {
    nome: 'skool_conversas',
    descricao: 'As conversas privadas (DMs) mais recentes: com quem, última mensagem, por ler. Devolve o id do canal para ler/responder.',
    esquema: { type: 'object', properties: { limite: { type: 'number', description: 'Por omissão 20' } }, additionalProperties: false },
    correr: async (a) => chamarApi('GET', `self/chat-channels?offset=0&limit=${Number(a.limite ?? 20)}&last=true&unread_only=false`),
  },
  {
    nome: 'skool_mensagens_ler',
    descricao: 'Lê as mensagens de uma conversa (id do canal de skool_conversas).',
    esquema: { type: 'object', properties: { canal_id: { type: 'string' } }, required: ['canal_id'], additionalProperties: false },
    correr: async (a) => chamarApi('GET', `channels/${encodeURIComponent(String(a.canal_id))}/messages?after=1999-01-01T00:00:00Z`),
  },
  {
    nome: 'skool_mensagem_enviar',
    descricao: 'Envia uma DM numa conversa existente (id do canal). Mostra o texto ao Ricardo antes.',
    esquema: {
      type: 'object',
      properties: { canal_id: { type: 'string' }, texto: { type: 'string' }, ...PEDE_CONFIRMACAO },
      required: ['canal_id', 'texto', 'confirmar'],
      additionalProperties: false,
    },
    correr: async (a) => {
      exigirConfirmacao(a)
      return chamarApi('POST', `channels/${encodeURIComponent(String(a.canal_id))}/messages`, { content: String(a.texto), attachments: [] })
    },
  },

  // ── Genéricas (para o que o Skool tiver e ainda não tiver ferramenta própria) ──────────
  {
    nome: 'skool_pagina',
    descricao:
      'Lê os dados de QUALQUER página do Skool (o JSON que a página traz), ex. "morethanmoney-1132/about", "morethanmoney-1132/-/leaderboards", "morethanmoney-1132/-/members?t=pending". Serve para descobrir campos e ids.',
    esquema: { type: 'object', properties: { caminho: { type: 'string', description: 'Caminho depois de www.skool.com/' } }, required: ['caminho'], additionalProperties: false },
    correr: async (a) => {
      const { pageProps } = await lerPagina(String(a.caminho))
      return resumirPagina(pageProps, [])
    },
  },
  {
    nome: 'skool_api',
    descricao:
      'Chamada crua ao api2.skool.com (o backend do Skool) para acções sem ferramenta própria: aprovar/rejeitar/banir membros, fixar posts, gerir cursos, etc. GET não precisa de confirmação; POST/PUT/PATCH/DELETE precisam de confirmar=true.',
    esquema: {
      type: 'object',
      properties: {
        metodo: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
        caminho: { type: 'string', description: 'Ex. "groups/{group_id}/..." (sem domínio)' },
        corpo: { type: 'object', description: 'JSON do pedido (opcional)' },
        confirmar: { type: 'boolean' },
      },
      required: ['metodo', 'caminho'],
      additionalProperties: false,
    },
    correr: async (a) => {
      const metodo = String(a.metodo ?? 'GET').toUpperCase()
      if (metodo !== 'GET') exigirConfirmacao(a)
      const caminho = String(a.caminho).replace('{group_id}', await idDoGrupo())
      return chamarApi(metodo, caminho, a.corpo)
    },
  },
]

export const ferramentaSkool = (nome: string) => FERRAMENTAS_SKOOL.find((f) => f.nome === nome)
