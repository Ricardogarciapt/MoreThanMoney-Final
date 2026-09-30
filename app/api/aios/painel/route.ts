import { NextResponse } from 'next/server'
import { soAdmin } from '@/lib/copia-contas/servidor/guarda'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

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
 * lado nenhum desta base — não há tabela de seguidores nem de subscritores do ManyChat. Em vez de
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
  const [porColuna, radar, leads, marcacoes, membros, membrosActivos] = await Promise.all([
    Promise.all(COLUNAS.map((c) =>
      db.from('social_scheduled_posts')
        .select('id, caption, media_type, pillar, status, scheduled_at, permalink, ig_username, error')
        .in('status', c.estados as unknown as string[])
        .order('scheduled_at', { ascending: false })
        .limit(8),
    )),
    db.from('ig_radar_prospetos').select('id', { count: 'exact', head: true }),
    db.from('ig_leads').select('comment_id', { count: 'exact', head: true }),
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

  const funil = [
    { icone: '📡', rotulo: 'Radar Instagram', sub: 'publicações encontradas por hashtag', n: topo, pct: 100 },
    { icone: '💬', rotulo: 'Leads do Instagram', sub: 'comentaram a palavra-chave', n: leads.count ?? 0, pct: pct(leads.count ?? 0) },
    { icone: '📅', rotulo: 'Chamadas marcadas', sub: '/agendar', n: marcacoes.count ?? 0, pct: pct(marcacoes.count ?? 0) },
    { icone: '⭐', rotulo: 'Membros activos', sub: `de ${membros.count ?? 0} contas`, n: membrosActivos.count ?? 0, pct: pct(membrosActivos.count ?? 0) },
  ]

  return NextResponse.json({
    quadro,
    funil,
    // Para o ecrã poder dizer DE QUANDO são os números em vez de os mostrar como se fossem de agora.
    lidoEm: new Date().toISOString(),
    janela: { desde: ha30dias },
  })
})
