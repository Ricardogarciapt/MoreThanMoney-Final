import { NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { contarLeads } from '@/lib/instagram/leads-novos'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * O FUNIL E O QUADRO DE CONTEÚDO DO AIOS — com dados reais.
 *
 * ═══ O QUE ISTO SUBSTITUI ══════════════════════════════════════════════════════════════════
 *
 * Números escritos à mão dentro do HTML desde Junho: «4.2K views», «892 likes», «Ter 10/Jun».
 * Um painel de decisão com números inventados é pior do que um painel vazio — o vazio faz-se
 * perguntas, o inventado faz-se acreditar.
 *
 * ═══ AS FONTES, E PORQUE SÃO ESTAS ═════════════════════════════════════════════════════════
 *
 * O funil antigo prometia «Seguidores Instagram» e «Leads ManyChat». Nenhum dos dois existe em
 * lado nenhum desta base — não há tabela de seguidores, e o ManyChat saiu (04/10/2026). Em vez de
 * inventar uma contagem ou de deixar o traço, o funil passa a ser o que a casa MEDE mesmo:
 *
 *   radar do Instagram  →  leads (quem comentou a palavra-chave)  →  chamadas marcadas  →  membros
 *
 * São quatro tabelas que existem e se contam: `ig_radar_prospetos`, `ig_leads`,
 * `agenda_marcacoes` e `profiles`. Um funil mais curto e verdadeiro vale mais do que um funil
 * bonito onde metade das linhas mostra um traço.
 *
 * O quadro de conteúdo é `social_scheduled_posts` — as publicações reais do Instagram, com o
 * estado que o publicador escreve.
 */

/**
 * Os quatro estados que interessam ao quadro, e o que cada um junta.
 *
 * `failed` e `cancelled` vão para a mesma coluna de propósito: para quem olha, as duas querem a
 * mesma acção — ir ver o que aconteceu. Separá-las dava uma quinta coluna que ninguém usa.
 */
const COLUNAS = [
  { chave: 'aprovado', titulo: '✅ APROVADO', cor: '#60a5fa', estados: ['approved'] },
  { chave: 'a_publicar', titulo: '📤 A PUBLICAR', cor: '#fbbf24', estados: ['publishing', 'scheduled', 'pending'] },
  { chave: 'publicado', titulo: '🚀 PUBLICADO', cor: '#34d399', estados: ['published'] },
  { chave: 'problema', titulo: '⚠️ POR RESOLVER', cor: '#f87171', estados: ['failed', 'cancelled'] },
] as const

/** O pilar, legível. Os `repost:<uuid>` são ruído de máquina e não se mostram a ninguém. */
function pilarLegivel(p: unknown): string | null {
  const t = String(p ?? '').trim()
  if (!t || t.startsWith('repost:')) return null
  return t.replace(/^cta:/, '').replace(/_/g, ' ')
}

export const GET = soAdmin(async () => {
  const db = getSupabaseAdmin()
  const ha30dias = new Date(Date.now() - 30 * 86_400_000).toISOString()

  /**
   * UMA CONSULTA POR COLUNA, e não uma janela única partida a seguir.
   *
   * A primeira versão lia as 60 publicações mais recentes e separava-as por estado. Parecia
   * equivalente e não era: das 197 publicações, 178 estão publicadas, por isso as 60 mais recentes
   * são quase todas «publicado» — e as 6 falhadas e 5 canceladas, que são de Agosto, ficavam de
   * fora. A coluna «por resolver» mostrava ZERO com onze coisas por resolver na base.
   *
   * É o pior engano possível num painel: o vazio a dizer «está tudo bem».
   */
  const [porColuna, radar, radarTrabalhado, radarTopo, leadsLinhas, perfis, marcacoes, membros, membrosActivos] = await Promise.all([
    Promise.all(COLUNAS.map((c) =>
      db.from('social_scheduled_posts')
        .select('id, caption, media_type, pillar, status, scheduled_at, permalink, ig_username, error')
        .in('status', c.estados as unknown as string[])
        .order('scheduled_at', { ascending: false })
        .limit(8),
    )),
    db.from('ig_radar_prospetos').select('id', { count: 'exact', head: true }),
    // «usado» = alguém foi lá comentar à mão. É o ÚNICO passo que transforma um prospeto em
    // conversa — ver a nota sobre o que a API do Instagram não deixa fazer, mais abaixo.
    db.from('ig_radar_prospetos').select('id', { count: 'exact', head: true }).eq('estado', 'usado'),
    db.from('ig_radar_prospetos')
      .select('id, hashtag, permalink, legenda, gostos, comentarios, pontuacao, porque, encontrado_em')
      .eq('estado', 'pendente')
      .order('pontuacao', { ascending: false })
      .limit(6),
    // As LINHAS, não a contagem: é preciso o `commenter` de cada uma para contar PESSOAS. Ver a
    // nota em `lib/instagram/leads-novos.ts` — a 30/09 havia nove linhas e uma pessoa, e essa
    // pessoa era um membro.
    db.from('ig_leads').select('commenter, keyword, created_at, dm_status').limit(1000),
    // Quem já é da casa. O handle do Instagram vive em `profiles.social_media` quando alguém o
    // escreveu lá — e só lá é que a ligação existe: nada liga «ruipaulo.fxcripto» a «Rui
    // Rodrigues» sem uma pessoa o dizer.
    db.from('profiles').select('username, full_name, email, social_media').limit(1000),
    db.from('agenda_marcacoes').select('id', { count: 'exact', head: true }).in('estado', ['marcada', 'a_confirmar', 'compareceu']),
    db.from('profiles').select('id', { count: 'exact', head: true }),
    db.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ])

  const quadro = COLUNAS.map((c, i) => ({
    chave: c.chave,
    titulo: c.titulo,
    cor: c.cor,
    cartoes: (porColuna[i]?.data ?? [])
      .map((p) => ({
        id: String(p.id),
        // A legenda de um post do Instagram tem parágrafos e emojis; num cartão cabe a primeira
        // linha. Cortar a meio de uma palavra fica pior do que cortar no fim da primeira frase.
        titulo: String(p.caption ?? '(sem legenda)').split('\n')[0].slice(0, 80),
        etiqueta: String(p.media_type ?? 'POST').toUpperCase(),
        pilar: pilarLegivel(p.pillar),
        quando: p.scheduled_at ?? null,
        permalink: p.permalink ?? null,
        erro: p.error ? String(p.error).slice(0, 120) : null,
      })),
  }))

  /**
   * O funil em NÚMEROS ABSOLUTOS e percentagens do topo.
   *
   * A percentagem é sempre sobre o PRIMEIRO degrau, não sobre o anterior. Sobre o anterior, um
   * degrau com poucos números dá percentagens que saltam (de 9 para 3 é «33%», que parece bom) e
   * escondem que o topo tinha 634. Sobre o topo, vê-se o funil como ele é.
   */
  const topo = radar.count ?? 0
  const pct = (n: number) => (topo > 0 ? Math.round((n / topo) * 1000) / 10 : null)

  /**
   * ═══ O DEGRAU QUE É UMA PESSOA, E PORQUE TEM DE SER ═════════════════════════════════════
   *
   * Entre «o radar encontrou» e «alguém falou connosco» há um passo que NENHUM código pode dar: a
   * API do Instagram não deixa comentar em publicações de terceiros, nem seguir, nem mandar DM a
   * quem não nos escreveu primeiro (está documentado em `lib/instagram/radar.ts`). O radar
   * encontra e ordena; comentar é trabalho de uma pessoa.
   *
   * E há uma segunda razão, mais dura: a pesquisa por hashtag devolve `id, caption, like_count,
   * comments_count, permalink` — e mais nada. Não devolve o autor. Mesmo que se quisesse ligar um
   * prospeto ao lead que ele viesse a dar, não há nome por onde os ligar.
   *
   * Por isso o funil mostra o passo humano em vez de o esconder: quantos prospetos foram
   * TRABALHADOS. Enquanto esse número for zero, os degraus abaixo não vêm do radar — vêm de quem
   * já nos segue.
   */
  const trabalhados = radarTrabalhado.count ?? 0

  /**
   * LEADS SÃO PESSOAS, e pessoas que ainda não são nossas. Contar linhas de `ig_leads` dava nove
   * onde havia uma, e essa uma era um membro — ver a guarda em `leads-novos.check.ts`.
   */
  const contagem = contarLeads(leadsLinhas.data ?? [], perfis.data ?? [])
  const semDm = (leadsLinhas.data ?? []).filter((l) => String(l.dm_status) !== 'sent').length
  const funil = [
    { icone: '📡', rotulo: 'Radar Instagram', sub: 'publicações encontradas por hashtag', n: topo, pct: 100 },
    { icone: '✋', rotulo: 'Trabalhados à mão', sub: 'comentados por uma pessoa (a API não o faz)', n: trabalhados, pct: pct(trabalhados) },
    {
      icone: '💬',
      rotulo: 'Leads do Instagram',
      sub: contagem.jaNossas.length
        ? `${contagem.pessoas} pessoas · ${contagem.jaNossas.length} já são da casa · ${contagem.comentarios} comentários`
        : `${contagem.pessoas} pessoas em ${contagem.comentarios} comentários`,
      n: contagem.novas,
      pct: pct(contagem.novas),
    },
    { icone: '📅', rotulo: 'Chamadas marcadas', sub: '/agendar', n: marcacoes.count ?? 0, pct: pct(marcacoes.count ?? 0) },
    { icone: '⭐', rotulo: 'Membros activos', sub: `de ${membros.count ?? 0} contas`, n: membrosActivos.count ?? 0, pct: pct(membrosActivos.count ?? 0) },
  ]

  return NextResponse.json({
    quadro,
    funil,
    // Os prospetos por trabalhar, para se poder agir SEM sair do AIOS: abrir o post e marcar.
    radar: {
      pendentes: (topo || 0) - trabalhados,
      porTrabalhar: (radarTopo.data ?? []).map((r) => ({
        id: String(r.id),
        hashtag: String(r.hashtag ?? ''),
        permalink: String(r.permalink ?? ''),
        excerto: String(r.legenda ?? '').split('\n')[0].slice(0, 90),
        pontuacao: Number(r.pontuacao ?? 0),
        porque: r.porque ? String(r.porque).slice(0, 90) : null,
        gostos: Number(r.gostos ?? 0),
        comentarios: Number(r.comentarios ?? 0),
      })),
    },
    /**
     * O ALERTA que vale mais do que o funil todo: leads que comentaram e a quem a mensagem privada
     * NUNCA chegou. Nas nove de Setembro o motivo foi sempre o mesmo — a app não tem permissão
     * para `private_replies`, e o que saiu foi uma resposta pública sem link.
     */
    fuga: { leadsSemDm: semDm, leadsTotal: contagem.comentarios, pessoas: contagem.pessoas, jaNossas: contagem.jaNossas },
    // Para o ecrã poder dizer DE QUANDO são os números em vez de os mostrar como se fossem de agora.
    lidoEm: new Date().toISOString(),
    janela: { desde: ha30dias },
  })
})
