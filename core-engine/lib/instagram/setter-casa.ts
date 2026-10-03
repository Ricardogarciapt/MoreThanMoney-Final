import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * QUEM É DA CASA NÃO SE PROSPECTA — a mesma regra, agora no Instagram.
 *
 * É a terceira vez nesta casa que o mesmo erro aparece de roupa diferente. Na ingestão de leads
 * entrou o Rui Rodrigues, que é sub-IB. Nas chamadas quentes, o Rui e o Ruben ficaram no TOPO da
 * lista — e ligar a um sub-IB a propor que traga a conta para a nossa corretora estraga uma relação
 * em trinta segundos. No Instagram o estrago é maior e não tem volta: a Meta dá UMA private reply
 * por comentário. Uma DM de vendas mandada a um cliente queima esse comentário para sempre, à
 * frente da audiência dele.
 *
 * Quando isto foi escrito, a fila do Instagram tinha UMA pessoa: `ruipaulo.fxcripto`, que é o Rui
 * Rodrigues. Ligar o envio sem esta guarda tinha como primeiro acto mandar uma DM de angariação ao
 * nosso próprio sub-IB — e a resposta pública de vendas debaixo do post dele.
 *
 * DUAS FONTES, porque nenhuma delas chega sozinha:
 *
 *  1. os negócios já GANHOS (`vendas_negocios.estado = 'ganho'`) — quem já é cliente não é lead, e
 *     isto actualiza-se sozinho à medida que se fecha gente. É a fonte que não precisa de manutenção;
 *  2. uma lista escrita à mão em `site_settings.ig_setter_casa` — para a equipa e os parceiros, que
 *     não têm negócio nenhum na tabela e portanto a fonte 1 nunca os apanha.
 *
 * A comparação é pelo HANDLE normalizado (ver `normalizarHandle`), porque é a única coisa que a
 * Graph API nos dá sobre quem comentou: não há email nem telefone para cruzar.
 *
 * Falhar a leitura devolve o conjunto VAZIO — e isso é de propósito perigoso no sentido certo: quem
 * chama trata um conjunto vazio como «não sei», e o setter não envia quando não sabe. Ver
 * `setter.ts`.
 */

export const CHAVE_CASA = 'ig_setter_casa'

/**
 * O mesmo handle escrito de cinco maneiras.
 *
 * «@RuiPaulo.FXcripto », «ruipaulo.fxcripto», «instagram.com/ruipaulo.fxcripto/» — é a mesma pessoa,
 * e comparar as três à letra deixava passar duas. Tira o arroba, o endereço, os espaços e a caixa.
 */
export function normalizarHandle(bruto: string | null | undefined): string {
  let s = (bruto ?? '').trim().toLowerCase()
  if (!s) return ''
  s = s.replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
  s = s.replace(/^@+/, '').replace(/\/+$/, '')
  // Um handle do Instagram só tem letras, números, ponto e underscore. O resto é ruído de colagem.
  s = s.replace(/[^a-z0-9._]/g, '')
  return s
}

/**
 * Os handles que este sistema não deve abordar.
 *
 * Devolve SEMPRE um conjunto de handles normalizados. Em caso de erro devolve vazio, e quem chama
 * tem de tratar isso como incerteza — não como autorização.
 */
let cache: { em: number; v: Set<string> } | null = null
const CACHE_MS = 60_000

export async function handlesDaCasa(db: SupabaseClient): Promise<Set<string>> {
  // O funil chama isto por COMENTÁRIO. Sem cache, uma volta com trinta comentários faz sessenta
  // leituras para responder sempre a mesma coisa — a lista não muda de minuto a minuto.
  if (cache && Date.now() - cache.em < CACHE_MS) return cache.v

  const fora = new Set<string>()

  const [clientes, config] = await Promise.all([
    db.from('vendas_negocios').select('instagram_handle').eq('estado', 'ganho').not('instagram_handle', 'is', null),
    db.from('site_settings').select('value').eq('key', CHAVE_CASA).maybeSingle(),
  ])

  for (const r of clientes.data ?? []) {
    const h = normalizarHandle((r as { instagram_handle: string | null }).instagram_handle)
    if (h) fora.add(h)
  }

  // `value` tanto vem como objecto como string JSON, conforme quem o escreveu. Ler só um dos dois
  // faz uma lista guardada não ter efeito nenhum, em silêncio — já aconteceu com as fontes do T2T.
  try {
    const bruto = typeof config.data?.value === 'string' ? JSON.parse(config.data.value) : config.data?.value
    const lista: unknown = Array.isArray(bruto) ? bruto : bruto?.handles
    for (const h of Array.isArray(lista) ? lista : []) {
      const n = normalizarHandle(typeof h === 'string' ? h : null)
      if (n) fora.add(n)
    }
  } catch {
    // Uma lista mal formada não pode abrir a porta ao envio: fica o que já se apanhou pelos clientes.
  }

  cache = { em: Date.now(), v: fora }
  return fora
}

/** Este comentador é da casa? Sem handle, assume-se que SIM — não se escreve a quem não se conhece. */
export function ehDaCasa(commenter: string | null | undefined, fora: ReadonlySet<string>): boolean {
  const h = normalizarHandle(commenter)
  if (!h) return true
  return fora.has(h)
}
