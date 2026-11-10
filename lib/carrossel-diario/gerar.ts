/**
 * A IA escreve um carrossel novo quando o banco do perfil se esgota.
 *
 * Pela porta única (`chamarIAGratis`: Groq → Gemini → Ollama, custo zero). O texto passa pelas
 * trocas seguras de PT-PT e pelas regras do dono (`verificarObjecto`); se falhar, a IA tem UMA
 * segunda oportunidade com a lista do que falhou. Se mesmo assim falhar, devolve-se o motivo e
 * nesse dia não sai nada — melhor um dia sem carrossel do que um carrossel com erros.
 */
import { chamarIAGratis } from '@/lib/ia/chamar'
import { blocoFramework } from '@/lib/framework-mtm'
import { blocoGanchos } from '@/lib/conteudo/ganchos'
import { corrigirObjectoPtPt, regrasPtPtParaPrompt } from '@/lib/pt-pt'
import { DISCLAIMER_PT, regrasParaPrompt, verificarObjecto } from '@/lib/conteudo-magnetico/regras'
import { BANCO } from './banco'
import type { Carrossel, Lamina, Perfil } from './tipos'
import type { Tema } from './temas'

const VOZ: Record<Perfil, string> = {
  ricardo:
    'Perfil pessoal de Ricardo Garcia (@ricardogarciapt): ex-militar (14 anos de farda) que trocou «estar ocupado» por um método de trading com regras. ' +
    'Fala na PRIMEIRA PESSOA, directo, honesto, frases curtas que batem. Entrega valor prático, sem vender nada.',
  mtm:
    'Perfil da marca More Than Money (@morethanmoney.pt): educação financeira e trading com método, tom científico e transparente, anti-pirâmide. ' +
    'Fala com «tu». A penúltima ou última lâmina liga o tema à ferramenta da MTM de forma honesta, sem prometer resultados.',
}

const limpa = (v: unknown, max: number) =>
  String(typeof v === 'string' ? v : '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)

function parse(texto: string): unknown {
  try {
    return JSON.parse(texto)
  } catch {
    const i = texto.indexOf('{')
    const j = texto.lastIndexOf('}')
    if (i >= 0 && j > i) return JSON.parse(texto.slice(i, j + 1))
    throw new Error('A IA não devolveu JSON.')
  }
}

/** Transforma o que a IA devolveu num carrossel válido, ou explica porque não dá. */
export function normalizar(bruto: unknown, perfil: Perfil, tema: Tema, id: string): { carrossel?: Carrossel; motivo?: string } {
  const o = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>
  const lista = Array.isArray(o.laminas) ? o.laminas : []
  const laminas: Lamina[] = lista.slice(0, 9).map((l) => {
    const x = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>
    return { linha: limpa(x.linha, 44), titulo: limpa(x.titulo, 34), corpo: limpa(x.corpo, 230) }
  })
  if (laminas.length < 6) return { motivo: `só ${laminas.length} lâminas` }
  if (laminas.some((l) => !l.titulo || !l.linha)) return { motivo: 'lâmina sem título ou sem linha' }
  if (laminas.slice(1).some((l) => !l.corpo)) return { motivo: 'lâmina do meio sem texto' }
  laminas[0].corpo = ''
  const resumo = (Array.isArray(o.resumo) ? o.resumo : []).map((r) => limpa(r, 70)).filter(Boolean).slice(0, 7)
  const gancho = limpa(o.gancho, 180)
  if (!gancho || resumo.length < 3) return { motivo: 'legenda incompleta' }
  const base = BANCO[perfil][0].legenda
  const hashtags = base.split('\n').pop() || ''
  const cta =
    perfil === 'ricardo'
      ? ['Guarda este post para releres antes da próxima decisão e partilha com quem precisa de o ler.', 'Segue @ricardogarciapt para mais.']
      : [`💬 Comenta «${tema.palavraChave}» e envio-te ${tema.oQue} por mensagem.`]
  const legenda = [gancho, '', ...resumo.map((r) => `▪️ ${r}`), '', ...cta, '', `⚠️ ${DISCLAIMER_PT}`, '', hashtags].join('\n')
  const carrossel: Carrossel = { id, perfil, area: tema.area, laminas, legenda, palavraChave: tema.palavraChave, educador: tema.educador }
  return { carrossel }
}

export async function gerarCarrossel(perfil: Perfil, tema: Tema, id: string): Promise<{ carrossel?: Carrossel; motivo?: string; fornecedor?: string }> {
  const exemplo = BANCO[perfil][0]
  const sistema = [
    'És copywriter de carrosséis de Instagram de entrega de valor (educação financeira e trading).',
    blocoFramework('conteudo'),
    VOZ[perfil],
    regrasParaPrompt(),
    regrasPtPtParaPrompt(),
    blocoGanchos(),
    'Escreve em português de Portugal, com o Acordo Ortográfico de 1990 (direção, objetivo, ativo). Tratamento por «tu». Ortografia e acentuação impecáveis.',
    'Nada de números de resultados, percentagens de ganho, taxas de acerto ou promessas. Exemplos de risco (ex.: arriscar 1% por operação) são permitidos.',
    'Responde APENAS com JSON válido.',
  ].join('\n\n')
  const utilizador = [
    `TEMA: ${tema.tema}`,
    ...(tema.educador
      ? [`Este carrossel apresenta o educador ${tema.tema.split(' ensina')[0]}: fala dele na terceira pessoa na capa e no fecho, e o conteúdo do meio é o que ele ensina. Sem inventar factos biográficos nem resultados.`]
      : []),
    'Formato: 7 ou 8 lâminas. Lâmina 1 = capa (gancho que pára o dedo, sem corpo). Lâminas do meio = UMA ideia prática cada. Última = fecho com a ideia para levar.',
    'Cada lâmina: "linha" (frase curta, até 40 caracteres, aparece em cor), "titulo" (2 a 4 palavras FORTES, até 30 caracteres), "corpo" (1 a 2 frases, até 220 caracteres).',
    '"gancho" = primeira frase da legenda. "resumo" = 4 a 6 tópicos curtos com as ideias do carrossel.',
    `EXEMPLO do nível pretendido (não copies o tema):\n${JSON.stringify({ laminas: exemplo.laminas.slice(0, 4) })}`,
    'JSON: {"gancho":"...","resumo":["..."],"laminas":[{"linha":"...","titulo":"...","corpo":"..."}]}',
  ].join('\n\n')

  const mensagens: { role: 'user' | 'assistant'; content: string }[] = [{ role: 'user', content: utilizador }]
  let ultimoMotivo = 'sem resposta'
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    let r
    try {
      r = await chamarIAGratis({ sistema, mensagens, json: true, maxTokens: 1800, temperatura: 0.7, tarefa: 'carrossel-diario', preferencia: 'qualidade', timeoutMs: 45_000 })
    } catch (e) {
      return { motivo: `IA indisponível: ${e instanceof Error ? e.message : String(e)}` }
    }
    let bruto: unknown
    try {
      bruto = corrigirObjectoPtPt(parse(r.texto)).valor
    } catch (e) {
      ultimoMotivo = 'JSON inválido'
      mensagens.push({ role: 'assistant', content: r.texto }, { role: 'user', content: 'Isso não é JSON válido. Devolve só o JSON.' })
      continue
    }
    const n = normalizar(bruto, perfil, tema, id)
    if (!n.carrossel) {
      ultimoMotivo = n.motivo || 'formato'
      mensagens.push({ role: 'assistant', content: r.texto }, { role: 'user', content: `Falhou o formato: ${ultimoMotivo}. Reescreve o JSON completo.` })
      continue
    }
    const avisos = verificarObjecto(n.carrossel)
    if (avisos.length === 0) return { carrossel: n.carrossel, fornecedor: `${r.fornecedor}/${r.modelo}` }
    ultimoMotivo = avisos.map((a) => `«${a.trecho}» (${a.tipo})`).join('; ')
    mensagens.push({ role: 'assistant', content: r.texto }, { role: 'user', content: `O texto falhou as regras: ${ultimoMotivo}. Reescreve o JSON inteiro sem isso.` })
  }
  return { motivo: ultimoMotivo }
}
