/**
 * A FILA DE CANDIDATOS B2B (16/11/2026) — o que liga a pesquisa ao envio, sem ninguém clicar.
 *
 *   pesquisa (agente/rotina diária, conector Apollo grátis, pesquisa web)
 *        → `b2b_candidatos` (empresa + página pública: site, página de contactos ou Beacons/Linktree)
 *        → cron /api/cron/b2b-recolha: lê a página (robots.txt, ritmo lento), tira o email e a prova
 *          de pessoa colectiva que a própria página mostra (NIPC, CNPJ, forma jurídica com o nome)
 *        → `b2b_prospectos` → cron /api/cron/b2b-prospeccao envia 20 por dia, com saída automática.
 *
 * A pessoa colectiva fica `true` SÓ com prova escrita na página, ou quando quem pôs o candidato a
 * confirmou (`pessoa_colectiva: true` + `identificacao`). Sem prova o prospecto entra, mas fica parado
 * no validador (o regime B2B da Lei 41/2004 só cobre empresas) até alguém confirmar no painel.
 *
 * `normalizarCandidato` é puro (a guarda está em `b2b.check.ts`); `processarCandidatos` faz a rede.
 */
import { recolherDaPagina } from './recolha'
import { AGENTE_B2B, SEGMENTOS, lerPais, type Pais, type Segmento } from './sequencias'

type Db = { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface Candidato {
  empresa: string
  url: string
  segmento: Segmento
  pais: Pais
  pessoa_colectiva: boolean
  identificacao: string | null
  origem: string
  nota: string | null
}

/** Limpa e valida um candidato vindo de fora (agente, painel, rotina). Devolve null se não serve. Puro. */
export function normalizarCandidato(c: Record<string, unknown>): Candidato | null {
  const empresa = String(c.empresa ?? '').trim().slice(0, 160)
  const segmento = String(c.segmento ?? '') as Segmento
  let url = String(c.url ?? '').trim()
  if (!empresa || !SEGMENTOS.includes(segmento)) return null
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`
  try {
    const u = new URL(url)
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return null
    url = u.toString()
  } catch {
    return null
  }
  const pc = c.pessoa_colectiva === true && !!String(c.identificacao ?? '').trim()
  return {
    empresa, url, segmento, pais: lerPais(c.pais),
    pessoa_colectiva: pc,
    identificacao: String(c.identificacao ?? '').trim().slice(0, 200) || null,
    origem: String(c.origem ?? 'agente').trim().slice(0, 40) || 'agente',
    nota: c.nota ? String(c.nota).slice(0, 300) : null,
  }
}

export async function adicionarCandidatos(db: Db, lista: unknown[]): Promise<{ aceites: number; recusados: number; erro?: string }> {
  const linhas = (Array.isArray(lista) ? lista : [])
    .slice(0, 200)
    .map((x) => normalizarCandidato((x && typeof x === 'object' ? x : {}) as Record<string, unknown>))
  const boas = linhas.filter((x): x is Candidato => !!x)
  if (!boas.length) return { aceites: 0, recusados: linhas.length }
  const { error, count } = await db.from('b2b_candidatos').upsert(boas, { onConflict: 'url', ignoreDuplicates: true, count: 'exact' })
  return { aceites: error ? 0 : count ?? boas.length, recusados: linhas.length - boas.length, erro: error?.message }
}

export interface ResultadoCandidatos {
  vistos: number
  comEmail: number
  semEmail: number
  falhas: number
  gravados: number
  semProvaPc: number
}

/** Processa até `limite` candidatos pendentes. Cada um custa ~10–20 s (robots + página, ao ritmo). */
export async function processarCandidatos(db: Db, limite = 10, ateMs = 240_000): Promise<ResultadoCandidatos> {
  const inicio = Date.now()
  const res: ResultadoCandidatos = { vistos: 0, comEmail: 0, semEmail: 0, falhas: 0, gravados: 0, semProvaPc: 0 }
  const { data, error } = await db
    .from('b2b_candidatos')
    .select('id, empresa, url, segmento, pais, pessoa_colectiva, identificacao, nota, tentativas')
    .eq('estado', 'pendente')
    .order('criado_em', { ascending: true })
    .limit(Math.max(1, Math.min(30, limite)))
  if (error) throw new Error(error.message)

  for (const c of (data ?? []) as Array<Candidato & { id: string; tentativas: number }>) {
    if (Date.now() - inicio > ateMs) break
    res.vistos++
    const agora = new Date().toISOString()
    const r = await recolherDaPagina({ url: c.url, empresa: c.empresa, segmento: c.segmento, pais: c.pais })
    if (!r.ok) {
      res.falhas++
      // Uma falha de rede tenta outra vez (até 3); robots/redes sociais/URL não voltam a tentar.
      const definitivo = /robots|Redes sociais|URL inválida|Só http/.test(r.motivo ?? '') || c.tentativas + 1 >= 3
      await db.from('b2b_candidatos').update({ estado: definitivo ? 'falhou' : 'pendente', motivo: r.motivo ?? null, tentativas: c.tentativas + 1, tentado_em: agora }).eq('id', c.id)
      continue
    }
    if (!r.aceites.length) {
      res.semEmail++
      await db.from('b2b_candidatos').update({
        estado: 'sem_email', tentativas: c.tentativas + 1, tentado_em: agora,
        motivo: r.recusados.length ? `Só emails recusados: ${r.recusados.map((x) => `${x.email} (${x.motivo})`).join('; ').slice(0, 280)}` : 'Nenhum email de empresa na página.',
      }).eq('id', c.id)
      continue
    }
    res.comEmail++
    const prova = c.pessoa_colectiva && c.identificacao ? c.identificacao : r.evidenciaPc ?? null
    if (!prova) res.semProvaPc++
    let site: string | null = null
    try { site = new URL(c.url).origin } catch { /* fica null */ }
    const linhas = r.aceites.map((a) => ({
      empresa: c.empresa, site, segmento: c.segmento, pais: c.pais,
      email: a.email, email_tipo: a.tipo, fonte_url: c.url, fonte_verificada_em: agora,
      identificacao: prova, pessoa_colectiva: !!prova, agente: AGENTE_B2B,
      nota: (c.nota ? c.nota + ' · ' : '') + (prova ? 'candidato → recolha automática' : 'candidato → recolha automática; pessoa colectiva por confirmar'),
    }))
    const { error: e2, count } = await db.from('b2b_prospectos').upsert(linhas, { onConflict: 'email', ignoreDuplicates: true, count: 'exact' })
    if (!e2) res.gravados += count ?? linhas.length
    await db.from('b2b_candidatos').update({
      estado: e2 ? 'falhou' : 'recolhido', emails: r.aceites.map((a) => a.email), identificacao: prova,
      motivo: e2?.message ?? (prova ? null : 'Pessoa colectiva por confirmar — não sai até alguém confirmar.'),
      tentativas: c.tentativas + 1, tentado_em: agora,
    }).eq('id', c.id)
  }
  return res
}
