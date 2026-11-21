// Confrontos do RPG «Operação Liberdade»: combate por turnos contra os inimigos interiores
// (o Adiador, o Medo, a Ganância…). O inimigo mostra sempre o que vai fazer a seguir (intenção à vista),
// cada acção usa um atributo da ficha e todos os dados lançam-se no servidor.
// Um inimigo por semana dá XP na primeira vitória; os já vencidos podem ser repetidos sem XP.
// «A Rotina» é o inimigo final e só abre depois do capítulo 6.
import { RPG, atributos, bonusKits, d, mod, type Atr, type Progresso } from './rpg'

export type Intencao = { tipo: 'ataque' | 'forte' | 'escudo' | 'cura'; valor: number; texto: string }
export type Linha = { quem: 'eu' | 'ele' | 'sistema'; texto: string; dano?: number; cura?: number; critico?: boolean; fraco?: boolean; d20?: number; total?: number; cd?: number }
export type Estado = {
  vida: number; vidaMax: number; foco: number; bossVida: number; bossMax: number; turno: number; fase: 1 | 2
  escudo: number; guarda: number; tecnica: boolean; log: Linha[]; fim: null | 'vitoria' | 'derrota'
}

export const INIMIGOS: any[] = RPG.inimigos
export const ACCOES: any[] = RPG.accoes_confronto
export const inimigo = (id: string) => INIMIGOS.find(b => b.id === id)
const FOCO_MAX = 5
export const LIMITE_TURNOS = 20

/** Semana ISO (segunda a domingo), p.ex. «2026-W47». */
export function semanaAtual(agora = new Date()) {
  const t = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()))
  const dia = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dia)
  const ano = t.getUTCFullYear()
  const n = Math.ceil(((t.getTime() - Date.UTC(ano, 0, 1)) / 86_400_000 + 1) / 7)
  return `${ano}-W${String(n).padStart(2, '0')}`
}
/** O inimigo da semana roda pelos seis inimigos interiores (a Rotina fica de fora). */
export function inimigoDaSemana(agora = new Date()) {
  const normais = INIMIGOS.filter(b => !b.final)
  const semanas = Math.floor((Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()) - Date.UTC(2026, 10, 16)) / (7 * 86_400_000))
  return normais[((semanas % normais.length) + normais.length) % normais.length]
}

export function intencao(b: any, e: Pick<Estado, 'turno' | 'fase'>): Intencao {
  const p = e.fase === 2 && b.padrao2 ? b.padrao2 : b.padrao
  return p[e.turno % p.length]
}

export function novoEstado(b: any, f: any, nivel: number, p: Progresso): Estado {
  const at = atributos(f, p)
  const vidaMax = Math.max(20, 24 + 2 * mod(at.ene.v) + 2 * nivel)
  return { vida: vidaMax, vidaMax, foco: 2, bossVida: b.vida, bossMax: b.vida, turno: 0, fase: 1, escudo: 0, guarda: 0, tecnica: false, fim: null,
    log: [{ quem: 'ele', texto: b.entrada }] }
}

function tecnicaDaClasse(f: any) {
  const c = RPG.classes.find((x: any) => x.id === f.classe)
  const atr = (c?.principal?.[0] || 'dis') as Atr
  return { id: 'tecnica', atr, nome: c?.talentos?.[0]?.nome || 'Técnica', emoji: c?.emoji || '✨', custo: 3, dano: 12, texto: 'O golpe da tua classe. Uma vez por confronto.' }
}
export function accoesDisponiveis(f: any, e: Estado) {
  const t = tecnicaDaClasse(f)
  return [...ACCOES, t].map(a => ({ id: a.id, atr: a.atr, nome: a.nome, emoji: a.emoji, custo: a.custo, texto: a.texto,
    pode: !e.fim && e.foco >= a.custo && !(a.id === 'tecnica' && (e.tecnica || e.turno < 2)) }))
}

/**
 * Um turno: a tua acção e depois a intenção do inimigo. Devolve o estado novo e as linhas deste turno,
 * para o ecrã animar os números por ordem.
 */
export function jogarTurno(b: any, f: any, nivel: number, p: Progresso, e0: Estado, accaoId: string): { e: Estado; linhas: Linha[]; erro?: string } {
  const e: Estado = JSON.parse(JSON.stringify(e0))
  if (e.fim) return { e, linhas: [], erro: 'Este confronto já acabou.' }
  const a = accaoId === 'tecnica' ? tecnicaDaClasse(f) : ACCOES.find(x => x.id === accaoId)
  if (!a) return { e, linhas: [], erro: 'Acção desconhecida.' }
  if (a.id === 'tecnica' && (e.tecnica || e.turno < 2)) return { e, linhas: [], erro: e.tecnica ? 'Já usaste a técnica neste confronto.' : 'A técnica abre ao 3.º turno.' }
  if (e.foco < a.custo) return { e, linhas: [], erro: 'Não tens Foco suficiente.' }

  const at = atributos(f, p), bk = bonusKits(f, nivel, p)
  const m = mod(at[a.atr as Atr].v) + bk[a.atr as Atr]
  const linhas: Linha[] = []
  e.foco -= a.custo

  // ── A tua acção ──
  if (a.id === 'respirar') {
    const cura = Math.max(2, a.cura + m)
    const antes = e.vida
    e.vida = Math.min(e.vidaMax, e.vida + cura)
    e.foco = Math.min(FOCO_MAX, e.foco + 1)
    e.guarda += 1
    linhas.push({ quem: 'eu', texto: `${a.emoji} Respiras fundo. +${e.vida - antes} de Determinação e +1 de Foco.`, cura: e.vida - antes })
    // Contra quem vive da pressa (a Ganância), a calma também fere.
    if (b.fraqueza === a.atr) {
      const dano = Math.max(2, 3 + m) + 3
      e.bossVida = Math.max(0, e.bossVida - dano)
      linhas.push({ quem: 'eu', texto: `A tua calma desarma-o · ponto fraco! −${dano}`, dano, fraco: true })
    }
  } else {
    const cd = b.defesa + e.escudo
    const fraco = b.fraqueza && b.fraqueza === a.atr
    let dano = 0, critico = false, d20: number | undefined, total: number | undefined
    if (a.sem_dado) dano = Math.max(2, a.dano + m)
    else {
      d20 = d(20); total = d20 + m
      critico = d20 === 20
      const acerta = critico || (d20 !== 1 && total >= cd)
      dano = acerta ? Math.max(2, a.dano + m) * (critico ? 2 : 1) : 0
    }
    if (dano && fraco) dano += 3
    if (dano) {
      e.bossVida = Math.max(0, e.bossVida - dano)
      linhas.push({ quem: 'eu', texto: `${a.emoji} ${a.nome}${critico ? ' · 20 natural!' : ''}${fraco ? ' · ponto fraco!' : ''} −${dano}`, dano, critico, fraco: !!fraco, d20, total, cd })
    } else linhas.push({ quem: 'eu', texto: `${a.emoji} ${a.nome}… ${d20 === 1 ? 'falhanço crítico.' : 'falhou.'}`, dano: 0, d20, total, cd })
    if (a.guarda) e.guarda += a.guarda
    if (a.id === 'tecnica') e.tecnica = true
  }
  e.escudo = 0

  // ── Vitória? ──
  if (e.bossVida <= 0) {
    e.fim = 'vitoria'
    linhas.push({ quem: 'ele', texto: b.derrota })
    e.log = [...e.log, ...linhas].slice(-14)
    return { e, linhas }
  }
  // ── Muda de fase a meio da vida ──
  if (e.fase === 1 && e.bossVida <= e.bossMax / 2) {
    e.fase = 2
    linhas.push({ quem: 'sistema', texto: 'Fase 2' })
    linhas.push({ quem: 'ele', texto: b.fase2 })
  }

  // ── A intenção do inimigo ──
  const it = intencao(b, e)
  if (it.tipo === 'ataque' || it.tipo === 'forte') {
    const bruto = it.valor + (e.fase === 2 ? 1 : 0)
    const dano = Math.max(1, bruto - e.guarda)
    e.vida = Math.max(0, e.vida - dano)
    linhas.push({ quem: 'ele', texto: `${it.texto} −${dano}${e.guarda ? ` (travaste ${Math.min(bruto - 1, e.guarda)})` : ''}`, dano, critico: it.tipo === 'forte' })
    e.guarda = 0
  } else if (it.tipo === 'escudo') {
    e.escudo = it.valor
    linhas.push({ quem: 'ele', texto: `${it.texto} Defesa +${it.valor} no próximo turno.` })
  } else if (it.tipo === 'cura') {
    const antes = e.bossVida
    e.bossVida = Math.min(e.bossMax, e.bossVida + it.valor)
    linhas.push({ quem: 'ele', texto: `${it.texto} Recupera ${e.bossVida - antes}.`, cura: e.bossVida - antes })
  }
  if (e.vida <= 0) {
    e.fim = 'derrota'
    linhas.push({ quem: 'ele', texto: b.vitoria_dele })
  }
  e.turno += 1
  e.foco = Math.min(FOCO_MAX, e.foco + 1)
  if (!e.fim && e.turno >= LIMITE_TURNOS) {
    e.fim = 'derrota'
    linhas.push({ quem: 'sistema', texto: 'O confronto arrastou-se demasiado. Recua, recupera e volta com um plano.' })
  }
  e.log = [...e.log, ...linhas].slice(-14)
  return { e, linhas }
}

export function verConfronto(b: any, f: any, e: Estado | null, reg: any) {
  return {
    inimigo: { id: b.id, nome: b.nome, titulo: b.titulo, emoji: b.emoji, retrato: b.retrato, cor: b.cor, fraqueza: b.fraqueza, final: !!b.final, licao: b.licao, nota: b.nota || null, entrada: b.entrada },
    estado: e, intencao: e && !e.fim ? intencao(b, e) : null, accoes: e ? accoesDisponiveis(f, e) : [],
    vitorias: reg?.vitorias || 0, tentativas: reg?.tentativas || 0, xp: reg?.xp || 0,
  }
}
