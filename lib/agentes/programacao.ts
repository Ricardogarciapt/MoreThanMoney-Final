/**
 * AS PROGRAMAÇÕES DO MOTOR DOS AGENTES — puro. Lê e valida o que o dono pode mudar no ecrã.
 *
 * Tudo vive em `site_settings.agentes_motor`, que o motor do AIOS já lê a cada tique
 * (`orquestrador.regras_do_motor`). Por isso uma mudança aqui vale no minuto seguinte, sem
 * reiniciar nada. Só se escrevem as chaves desta lista, e por cima do valor que lá está: as outras
 * chaves (tectos de contacto, envios) não se perdem.
 *
 * Por agente (`por_agente[id]`): ritmo próprio e horas próprias. A rota do motor passa-os em cada
 * agente (`ritmo_min`, `horas_trabalho`) e o motor obedece (aios/motor/regras.py).
 */

export type Campo = {
  chave: string
  rotulo: string
  ajuda: string
  tipo: 'minutos' | 'numero' | 'horas'
  min: number
  max: number
}

export const CAMPOS_GLOBAIS: readonly Campo[] = [
  { chave: 'horas_trabalho', rotulo: 'Horas de trabalho', ajuda: 'Entre que horas (Lisboa) os agentes acordam. 0–24 = sempre.', tipo: 'horas', min: 0, max: 24 },
  { chave: 'contacto_dono', rotulo: 'Horas para te contactar', ajuda: 'Notas de voz e alertas ao dono só nesta janela.', tipo: 'horas', min: 0, max: 24 },
  { chave: 'ritmo_ceo_min', rotulo: 'Ritmo do CEO (modo antigo)', ajuda: 'Minutos entre ciclos do CEO quando o OS v2 está desligado.', tipo: 'minutos', min: 15, max: 1440 },
  { chave: 'ritmo_filho_min', rotulo: 'Ritmo dos filhos (modo antigo)', ajuda: 'Minutos entre ciclos dos outros quando o OS v2 está desligado.', tipo: 'minutos', min: 15, max: 1440 },
  { chave: 'max_execucoes_dia_agente', rotulo: 'Ciclos por agente/dia (modo antigo)', ajuda: 'No OS v2 o máximo sai do ritmo de cada estado.', tipo: 'numero', min: 1, max: 200 },
  { chave: 'max_execucoes_dia_total', rotulo: 'Ciclos da equipa/dia (modo antigo)', ajuda: 'No OS v2 manda o teto da quota, abaixo.', tipo: 'numero', min: 1, max: 600 },
  { chave: 'timeout_ciclo_seg', rotulo: 'Tempo máximo de um ciclo (s)', ajuda: 'Um ciclo que passe disto é cortado.', tipo: 'numero', min: 60, max: 3600 },
] as const

/** O teto duro da quota diária do OS v2 (= TECTOS_DUROS.claudeCiclosDia). */
export const QUOTA_MAX = 600

export type PorAgente = { ritmo_min?: number; horas_trabalho?: [number, number] }

const obj = (v: unknown): Record<string, unknown> => {
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch { return {} } }
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function validar(c: Pick<Campo, 'tipo' | 'min' | 'max' | 'rotulo'>, v: unknown): { ok: true; valor: number | [number, number] } | { ok: false; erro: string } {
  if (c.tipo === 'horas') {
    if (!Array.isArray(v) || v.length !== 2) return { ok: false, erro: `${c.rotulo}: são duas horas (início e fim).` }
    const [a, b] = v.map(Number)
    if (![a, b].every((x) => Number.isInteger(x) && x >= 0 && x <= 24)) return { ok: false, erro: `${c.rotulo}: horas inteiras entre 0 e 24.` }
    return { ok: true, valor: [a, b] }
  }
  const n = Number(v)
  if (!Number.isInteger(n) || n < c.min || n > c.max) return { ok: false, erro: `${c.rotulo}: número inteiro entre ${c.min} e ${c.max}.` }
  return { ok: true, valor: n }
}

/** Junta as mudanças globais ao valor actual. Devolve o valor novo inteiro ou o primeiro erro. */
export function aplicarGlobais(actual: unknown, mudancas: Record<string, unknown>): { ok: true; valor: Record<string, unknown> } | { ok: false; erro: string } {
  const novo = { ...obj(actual) }
  for (const [k, v] of Object.entries(mudancas)) {
    const c = CAMPOS_GLOBAIS.find((x) => x.chave === k)
    if (!c) return { ok: false, erro: `«${k}» não é uma programação editável.` }
    const r = validar(c, v)
    if (!r.ok) return r
    novo[k] = r.valor
  }
  return { ok: true, valor: novo }
}

/** Mexe no `por_agente[id]`. `null` num campo apaga-o (volta ao ritmo/horas da equipa). */
export function aplicarAgente(actual: unknown, id: string, m: { ritmo_min?: unknown; horas_trabalho?: unknown }): { ok: true; valor: Record<string, unknown> } | { ok: false; erro: string } {
  const novo = { ...obj(actual) }
  const todos = { ...obj(novo.por_agente) } as Record<string, PorAgente>
  const este: PorAgente = { ...(todos[id] ?? {}) }
  if ('ritmo_min' in m) {
    if (m.ritmo_min == null || m.ritmo_min === '') delete este.ritmo_min
    else {
      const r = validar({ tipo: 'minutos', min: 15, max: 1440, rotulo: 'Ritmo do agente' }, m.ritmo_min)
      if (!r.ok) return r
      este.ritmo_min = r.valor as number
    }
  }
  if ('horas_trabalho' in m) {
    if (m.horas_trabalho == null) delete este.horas_trabalho
    else {
      const r = validar({ tipo: 'horas', min: 0, max: 24, rotulo: 'Horas do agente' }, m.horas_trabalho)
      if (!r.ok) return r
      este.horas_trabalho = r.valor as [number, number]
    }
  }
  if (Object.keys(este).length) todos[id] = este
  else delete todos[id]
  novo.por_agente = todos
  return { ok: true, valor: novo }
}

/** O que a rota do motor passa em cada agente. */
export function programacaoDoAgente(motor: unknown, id: string): PorAgente {
  const p = obj(obj(motor).por_agente)[id]
  return p && typeof p === 'object' ? (p as PorAgente) : {}
}
