import { chamarIA, mensagemIndisponivel, type MensagemIA } from '@/lib/ia/chamar'
import { MAX_VOLTAS_FERRAMENTAS, lerDecisao, protocoloFerramentas } from '@/lib/dashboard-gestao/protocolo-ferramentas'
import { ESPECIALISTAS, REVISOR_SISTEMA, ROUTER_SISTEMA, escolherPorPalavras, especialistaPorId, type IdEspecialista } from './especialistas'
import { ferramentasDe } from './ferramentas'
import { lerMarca, marcaEmTexto } from './marca'
import { REGRAS_CASA, peneira } from './regras'

/**
 * O ASSISTENTE DE MARKETING — router → especialista com ferramentas → revisor.
 *
 * É o padrão do telegram-bot-crewai sem CrewAI: três passos em série pela cadeia de IA da casa
 * (grátis primeiro). Serve o ecrã Gestão → Marketing → Assistente e o comando /marketing do bot.
 * Cada passo tem rede: sem router usa palavras, sem revisor fica a peneira das regras.
 */

export interface PassoFerramenta { nome: string; ok: boolean; resumo: string }
export interface RespostaAssistente {
  especialista: IdEspecialista
  nomeEspecialista: string
  motivo: string
  resposta: string
  ferramentas: PassoFerramenta[]
  correcoes: string[]
  alertas: string[]
  rascunhos: string[]
}

const curto = (v: unknown, n = 6000) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > n ? `${s.slice(0, n)}… (cortado)` : s
}

async function escolher(pedido: string, forcar?: string): Promise<{ id: IdEspecialista; motivo: string }> {
  if (forcar && especialistaPorId(forcar)) return { id: forcar as IdEspecialista, motivo: 'escolhido por ti' }
  try {
    const r = await chamarIA({ tarefa: 'marketing-router', preferencia: 'rapido', json: true, maxTokens: 200, timeoutMs: 15_000, sistema: ROUTER_SISTEMA, mensagens: [{ role: 'user', content: pedido }] })
    const j = JSON.parse(r.texto) as { especialista?: string; motivo?: string }
    if (j.especialista && especialistaPorId(j.especialista)) return { id: j.especialista as IdEspecialista, motivo: String(j.motivo ?? '').slice(0, 200) }
  } catch {
    // sem router: as palavras decidem
  }
  return { id: escolherPorPalavras(pedido), motivo: 'pelas palavras do pedido' }
}

export async function perguntarAoAssistente(pedido: string, opts: { historico?: MensagemIA[]; especialista?: string } = {}): Promise<RespostaAssistente> {
  const { id, motivo } = await escolher(pedido, opts.especialista)
  const esp = especialistaPorId(id)!
  const ferramentas = ferramentasDe(esp.ferramentas)
  const marca = await lerMarca()

  const sistema = `És o ${esp.nome} da MoreThanMoney — ${esp.papel}. Falas com o dono, em PT-PT, directo e prático.
${esp.playbook}

${REGRAS_CASA}

${marcaEmTexto(marca)}

${protocoloFerramentas(ferramentas.map((f) => ({ name: f.nome, description: f.descricao, input_schema: f.esquema })))}`

  const mensagens: MensagemIA[] = [...(opts.historico ?? []).slice(-8), { role: 'user', content: pedido }]
  const passos: PassoFerramenta[] = []
  const rascunhos: string[] = []
  let resposta = ''

  for (let volta = 0; volta <= MAX_VOLTAS_FERRAMENTAS && !resposta; volta++) {
    const ultima = volta === MAX_VOLTAS_FERRAMENTAS
    const r = await chamarIA({
      tarefa: `marketing-assistente:${id}`,
      preferencia: 'qualidade',
      json: true,
      maxTokens: 3000,
      timeoutMs: 45_000,
      sistema: ultima ? `${sistema}\n\nJá não podes usar ferramentas: responde agora com {"resposta": ...}.` : sistema,
      mensagens,
    })
    const d = lerDecisao(r.texto)
    if (d.tipo === 'resposta') { resposta = d.texto; break }
    if (d.tipo === 'invalida' || ultima) { resposta = d.tipo === 'invalida' ? r.texto : ''; break }

    const f = ferramentas.find((x) => x.nome === d.nome)
    let saida: unknown
    if (!f) saida = { erro: `Ferramenta «${d.nome}» não está disponível para este especialista.` }
    else {
      try { saida = await f.correr(d.argumentos) } catch (e) { saida = { erro: e instanceof Error ? e.message : String(e) } }
    }
    const o = (saida && typeof saida === 'object' ? saida : {}) as Record<string, unknown>
    if (typeof o.rascunho === 'string') rascunhos.push(o.rascunho)
    passos.push({ nome: d.nome, ok: !o.erro && o.ok !== false, resumo: curto(o.erro ?? o.corrige ?? o.falta ?? 'ok', 200) })
    mensagens.push({ role: 'assistant', content: JSON.stringify({ ferramenta: d.nome, argumentos: d.argumentos }) })
    mensagens.push({ role: 'user', content: `Resultado de ${d.nome}:\n${curto(saida)}` })
  }
  if (!resposta) resposta = 'Não consegui fechar uma resposta. Tenta reformular o pedido.'

  // Revisor: corrige só o que viola as regras. Se falhar, fica a resposta e a peneira avisa.
  let correcoes: string[] = []
  try {
    const r = await chamarIA({
      tarefa: 'marketing-revisor',
      preferencia: 'rapido',
      json: true,
      maxTokens: 3200,
      timeoutMs: 30_000,
      sistema: `${REVISOR_SISTEMA}\n\n${REGRAS_CASA}`,
      mensagens: [{ role: 'user', content: resposta }],
    })
    const j = JSON.parse(r.texto) as { resposta?: string; correcoes?: unknown }
    if (typeof j.resposta === 'string' && j.resposta.trim().length > resposta.length * 0.5) {
      resposta = j.resposta
      correcoes = (Array.isArray(j.correcoes) ? j.correcoes : []).map((c) => String(c).slice(0, 200)).slice(0, 8)
    }
  } catch {
    // sem revisor
  }

  return { especialista: id, nomeEspecialista: esp.nome, motivo, resposta, ferramentas: passos, correcoes, alertas: peneira(resposta), rascunhos }
}

export { ESPECIALISTAS, mensagemIndisponivel }
