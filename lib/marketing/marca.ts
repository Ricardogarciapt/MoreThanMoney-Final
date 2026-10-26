import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

/**
 * O CÉREBRO DA MARCA — o que o OpenAdKit chama «Brand Brain»: quem somos, a quem falamos, o que
 * vendemos e como soamos. Cada gerador e cada especialista lê isto antes de escrever, por isso
 * mudar o tom ou juntar um produto é mudar aqui UMA vez, no ecrã Marketing → Marca.
 *
 * Fica em `site_settings.marketing_marca`. Sem nada guardado usa-se o que a casa já decidiu
 * (CLAUDE.md e docs/mtm-sales-brain.md), para nenhum gerador arrancar às cegas.
 */
const CHAVE = 'marketing_marca'

export interface ProdutoMarca {
  nome: string
  descricao: string
  preco: string
  link: string
}

export interface Marca {
  nome: string
  site: string
  publico: string
  dores: string
  promessa: string
  tom: string
  provas: string
  produtos: ProdutoMarca[]
  concorrentes: string
  evitar: string
}

export const MARCA_BASE: Marca = {
  nome: 'Ricardo Garcia | MoreThanMoney',
  site: 'https://www.morethanmoney.pt',
  publico: 'Adultos 25-45 anos em Portugal e no Brasil, presos na armadilha das 40h/semana, que querem aprender a investir e fazer trading com consciência, 15 minutos por dia.',
  dores: 'Pouco tempo, medo de perder dinheiro, já tentaram sozinhos e desistiram, não sabem em quem confiar.',
  promessa: 'Educação financeira e trading consciente com método, ferramentas próprias (scanners, app MTM System, MTM Auto) e acompanhamento — sem promessas de lucro.',
  tom: 'PT-PT, "tu", autêntico, próximo, inspirador, pouco técnico, emojis moderados.',
  provas: 'A prova mede-se em pips, com origem declarada (resultados semanais publicados). Nunca percentagens nem ganhos em euros inventados.',
  produtos: [
    { nome: 'Mentoria Premium', descricao: 'Comunidade, sinais educativos, app MTM System e acompanhamento.', preco: '', link: 'https://www.morethanmoney.pt/apresentacao' },
    { nome: 'Pack de scanners', descricao: 'Todos os scanners TradingView (GoldKiller, TrendShot, Sensei X…).', preco: '35 €/mês', link: 'https://www.morethanmoney.pt/scanners' },
    { nome: 'Scanner individual', descricao: 'Um scanner TradingView à escolha.', preco: '50 €/semestre ou 350 € vitalício', link: 'https://www.morethanmoney.pt/scanners' },
  ],
  concorrentes: '',
  evitar: 'Jifu, Golden Era, Trendwave, KillShot; nomear a plataforma dos cursos; números de desempenho sem origem.',
}

const texto = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)

export function limparMarca(raw: unknown): Marca {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const produtos = (Array.isArray(o.produtos) ? o.produtos : [])
    .slice(0, 20)
    .map((p) => {
      const q = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>
      return { nome: texto(q.nome, 120), descricao: texto(q.descricao, 500), preco: texto(q.preco, 80), link: texto(q.link, 300) }
    })
    .filter((p) => p.nome)
  return {
    nome: texto(o.nome, 120) || MARCA_BASE.nome,
    site: texto(o.site, 200) || MARCA_BASE.site,
    publico: texto(o.publico, 1500),
    dores: texto(o.dores, 1500),
    promessa: texto(o.promessa, 1500),
    tom: texto(o.tom, 800),
    provas: texto(o.provas, 1500),
    produtos,
    concorrentes: texto(o.concorrentes, 1500),
    evitar: texto(o.evitar, 1000),
  }
}

export async function lerMarca(): Promise<Marca> {
  try {
    const { data } = await getSupabaseAdmin().from('site_settings').select('value').eq('key', CHAVE).maybeSingle()
    const v = typeof data?.value === 'string' ? JSON.parse(data.value) : data?.value
    if (v && typeof v === 'object') return limparMarca(v)
  } catch {
    /* sem marca guardada vale a base */
  }
  return MARCA_BASE
}

export async function gravarMarca(m: Marca): Promise<{ ok: boolean; erro?: string }> {
  const { error } = await getSupabaseAdmin()
    .from('site_settings')
    .upsert({ key: CHAVE, value: m, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  return error ? { ok: false, erro: error.message } : { ok: true }
}

/** A marca em texto, para entrar no prompt de sistema de qualquer gerador ou especialista. */
export function marcaEmTexto(m: Marca): string {
  const linhas = [
    `Marca: ${m.nome} (${m.site})`,
    m.publico && `Público: ${m.publico}`,
    m.dores && `Dores do público: ${m.dores}`,
    m.promessa && `O que oferecemos: ${m.promessa}`,
    m.tom && `Tom: ${m.tom}`,
    m.provas && `Provas (só estas): ${m.provas}`,
    m.produtos.length && `Produtos:\n${m.produtos.map((p) => `  - ${p.nome}${p.preco ? ` (${p.preco})` : ''}: ${p.descricao}${p.link ? ` → ${p.link}` : ''}`).join('\n')}`,
    m.concorrentes && `Concorrentes: ${m.concorrentes}`,
    m.evitar && `Evitar: ${m.evitar}`,
  ]
  return linhas.filter(Boolean).join('\n')
}
