/**
 * Lista de símbolos e specs por conta MetaApi, PARTILHADA entre instâncias (tabela
 * `metaapi_simbolos_cache`, migração 080).
 *
 * Antes: cache de 1 h na memória de CADA instância serverless. Cada arranque a frio — e os
 * monitores do VPS acordam instâncias de segundo a segundo — voltava a pedir `getSymbols`
 * (500 créditos). A 2026-09-15 o balde do getSymbols esgotou e a ordem Premium dos clientes falhou.
 *
 * Agora:
 *  - cada instância lê a linha UMA vez (1 linha, pela chave) e fica com ela em memória;
 *  - a lista refresca-se no máximo a cada 12 h, ou quando um símbolo pedido não tem candidato
 *    (e mesmo aí só se o último refresco tiver mais de 10 min);
 *  - só UMA instância refresca de cada vez (`metaapi_simbolos_reclamar`); as outras usam a lista
 *    que há, ou esperam uns segundos se ainda não houver nenhuma;
 *  - com a quota bloqueada ninguém pede getSymbols: usa-se a lista guardada, mesmo velha;
 *  - sem a tabela (migração por aplicar) ou com a base em baixo → comportamento ANTIGO
 *    (`simbolosDaContaCache`, memória de 1 h).
 */
import { simbolosDaContaCache, specDoSimboloCache } from './metaapi-cache'
import { loja, SEM_TABELA, type LinhaSimbolos, type SpecGuardada } from './metaapi-loja'
import { bloqueioLocalAtivo, registarErroQuota } from './metaapi-quota'

export const TTL_LISTA_MS = 12 * 60 * 60_000
export const TTL_SPEC_MS = 12 * 60 * 60_000
/** Um símbolo em falta só força refresco se a lista tiver mais do que isto. */
export const MISS_MIN_IDADE_MS = 10 * 60_000
/** Numa instância, um símbolo em falta só volta a ir à base passado isto. */
const MISS_RELER_BASE_MS = 60_000
const TRINCO_S = 90
/** Tabela em falta: volta a tentar passado isto. */
const REPROVAR_TABELA_MS = 10 * 60_000

/** Os campos da spec que interessam a execução e dimensionamento. */
const CAMPOS_SPEC = [
  'symbol', 'point', 'pipSize', 'digits', 'tickSize', 'contractSize', 'tradeMode',
  'stopsLevel', 'freezeLevel', 'minVolume', 'maxVolume', 'volumeStep',
] as const

export function recortarSpec(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of CAMPOS_SPEC) if (r[k] !== undefined && r[k] !== null) out[k] = r[k]
  return typeof out.point === 'number' && out.point > 0 ? out : null
}

type Memoria = LinhaSimbolos & { lidoEm: number; missVerificadoEm: number }
const memoria = new Map<string, Memoria>()
const emCurso = new Map<string, Promise<string[]>>()
let tabelaFaltaAte = 0

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

function guardar(accountId: string, linha: LinhaSimbolos, agora: number): Memoria {
  const m: Memoria = { ...linha, lidoEm: agora, missVerificadoEm: 0 }
  memoria.set(accountId, m)
  return m
}

/**
 * Lista de símbolos da conta.
 * @param lerDaMetaApi o getSymbols (RPC ou REST) — só é chamado por quem ganha o trinco.
 * @param serve a lista resolve o que se procura? (normalmente: o símbolo pedido tem candidato)
 */
export async function simbolosPartilhados(
  accountId: string,
  lerDaMetaApi: () => Promise<string[]>,
  serve?: (lista: string[]) => boolean,
  agora: () => number = Date.now,
): Promise<string[]> {
  const t0 = agora()
  const fallback = () => simbolosDaContaCache(accountId, lerDaMetaApi, serve)
  if (t0 < tabelaFaltaAte) return fallback()

  const mem = memoria.get(accountId)
  if (mem && mem.simbolos.length && mem.atualizadoEm != null && t0 - mem.atualizadoEm < TTL_LISTA_MS) {
    if (!serve || serve(mem.simbolos)) return mem.simbolos
    // Símbolo em falta: não martelar a base a cada passagem.
    if (t0 - mem.missVerificadoEm < MISS_RELER_BASE_MS) return mem.simbolos
    mem.missVerificadoEm = t0
  }

  // Um pedido por conta por instância de cada vez. (O `serve` do primeiro manda; os outros
  // recebem a mesma lista — igual ao comportamento da cache antiga.)
  const pendente = emCurso.get(accountId)
  if (pendente) return pendente
  const p = (async (): Promise<string[]> => {
    let linha: LinhaSimbolos | null | typeof SEM_TABELA
    try {
      linha = await loja().ler(accountId)
    } catch {
      return fallback()
    }
    if (linha === SEM_TABELA) {
      tabelaFaltaAte = agora() + REPROVAR_TABELA_MS
      return fallback()
    }
    const t = agora()
    const lista = linha?.simbolos ?? []
    const temLista = lista.length > 0
    if (linha && temLista) {
      const m = guardar(accountId, linha, t)
      if (mem) m.missVerificadoEm = mem.missVerificadoEm
    }
    const idade = linha?.atualizadoEm != null ? t - linha.atualizadoEm : Infinity
    const serveLista = temLista && (!serve || serve(lista))
    if (temLista && idade < TTL_LISTA_MS && serveLista) return lista
    // Lista recente mas sem o símbolo: a corretora não o tem. Não se paga outro getSymbols.
    if (temLista && !serveLista && idade < MISS_MIN_IDADE_MS) return lista
    if (temLista && bloqueioLocalAtivo(accountId, t)) return lista

    let r: string
    try {
      r = await loja().reclamar(accountId, TRINCO_S)
    } catch {
      r = 'erro'
    }
    if (r === SEM_TABELA) {
      tabelaFaltaAte = agora() + REPROVAR_TABELA_MS
      return fallback()
    }
    if (r === 'ok') {
      try {
        const nova = await lerDaMetaApi()
        if (Array.isArray(nova) && nova.length > 0) {
          await loja().gravarLista(accountId, nova).catch(() => undefined)
          const m = guardar(accountId, { simbolos: nova, specs: linha?.specs ?? {}, atualizadoEm: agora(), bloqueioAte: null }, agora())
          m.missVerificadoEm = agora()
          return nova
        }
        await loja().libertar(accountId).catch(() => undefined)
        return temLista ? lista : []
      } catch (err) {
        await loja().libertar(accountId).catch(() => undefined)
        await registarErroQuota(accountId, err, agora())
        if (temLista) return lista
        throw err
      }
    }
    // 'bloqueado' (quota): nunca se pede getSymbols; usa-se o que houver.
    if (r === 'bloqueado') return lista
    // 'ocupado' (outra instância está a refrescar) ou erro a reclamar.
    if (temLista) return lista
    for (let i = 0; i < 3; i++) {
      await dormir(1_000)
      try {
        const l = await loja().ler(accountId)
        if (l && l !== SEM_TABELA && l.simbolos.length) {
          guardar(accountId, l, agora())
          return l.simbolos
        }
      } catch {
        break
      }
    }
    // Primeira lista de sempre e quem a pedia não a escreveu: não se deixa a ordem sem lista.
    return fallback()
  })().finally(() => emCurso.delete(accountId))
  emCurso.set(accountId, p)
  return p
}

/**
 * Spec (subconjunto) de um símbolo da corretora, partilhada. Lê a memória/linha; se faltar ou tiver
 * mais de 12 h, pede à MetaApi (cache de memória antiga à frente, que deduplica) e junta à linha.
 * Com erro ou quota, devolve a spec velha se houver; senão propaga o erro como antes.
 */
export async function specPartilhada<T>(
  accountId: string,
  brokerSymbol: string,
  lerSpec: () => Promise<T>,
  agora: () => number = Date.now,
): Promise<T | null> {
  const t0 = agora()
  let mem = memoria.get(accountId)
  if (!mem && t0 >= tabelaFaltaAte) {
    try {
      const l = await loja().ler(accountId)
      if (l === SEM_TABELA) tabelaFaltaAte = t0 + REPROVAR_TABELA_MS
      else if (l) mem = guardar(accountId, l, t0)
    } catch {
      /* base em baixo: segue para a MetaApi como antes */
    }
  }
  const guardada = mem?.specs?.[brokerSymbol]
  if (guardada && t0 - guardada.em < TTL_SPEC_MS) return guardada.v as T
  if (guardada && bloqueioLocalAtivo(accountId, t0)) return guardada.v as T

  try {
    const raw = await specDoSimboloCache(accountId, brokerSymbol, lerSpec)
    const recorte = recortarSpec(raw)
    if (recorte && t0 >= tabelaFaltaAte) {
      const nova: SpecGuardada = { em: agora(), v: recorte }
      if (mem) mem.specs = { ...mem.specs, [brokerSymbol]: nova }
      await loja().juntarSpec(accountId, brokerSymbol, nova).catch(() => undefined)
    }
    return raw
  } catch (err) {
    await registarErroQuota(accountId, err, agora())
    if (guardada) return guardada.v as T
    throw err
  }
}

/**
 * Esquece o guardado depois de uma ordem recusada por CONFIGURAÇÃO da corretora. `lista` só quando
 * o erro diz que o símbolo não existe. Nunca lança.
 */
export async function esquecerPartilhado(accountId: string, opts: { lista: boolean }): Promise<void> {
  const mem = memoria.get(accountId)
  if (mem) {
    mem.specs = {}
    if (opts.lista && mem.atualizadoEm != null && Date.now() - mem.atualizadoEm >= MISS_MIN_IDADE_MS) memoria.delete(accountId)
  }
  if (Date.now() < tabelaFaltaAte) return
  await loja().esquecer(accountId, { lista: opts.lista, minIdadeMs: MISS_MIN_IDADE_MS }).catch(() => undefined)
}

/** Só para testes. */
export function __limparPartilhados(): void {
  memoria.clear()
  emCurso.clear()
  tabelaFaltaAte = 0
}
