/**
 * «O meu negócio não está na lista» do simulador do /solucoes.
 *
 * A pessoa escreve o negócio (e, se quiser, o site ou a página) e a IA grátis monta um sector com a
 * mesma forma dos sectores da casa: retrato do dia-a-dia, horas por tarefa, plano e o ecrã de
 * exemplo. Tudo aqui é puro, para a guarda testar. A IA só pode usar as tarefas que existem em
 * TAREFAS, as horas são limitadas como no simulador, e os textos não podem trazer números (as horas
 * são a única estimativa, com os pressupostos à vista). Se a IA falhar, há um sector genérico.
 */
import { AREAS, TAREFAS, type Sector } from '@/lib/site-solucoes/automacao'

export const SECTOR_LIVRE_ID = 'outro'
export const LIMITE_SECTOR_IP_HORA = 8

const txt = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').replace(/—/g, ',').trim().slice(0, max)
const semDigitos = (s: string) => !/\d/.test(s)

export function validarNegocio(e: { negocio?: unknown; site?: unknown }): { ok: true; negocio: string; site: string | null } | { ok: false; erro: string } {
  const negocio = txt(e.negocio, 80)
  if (negocio.length < 3) return { ok: false, erro: 'Diz-nos que negócio é, em poucas palavras.' }
  const siteCru = txt(e.site, 160)
  let site: string | null = null
  if (siteCru) {
    const comEsquema = /^https?:\/\//i.test(siteCru) ? siteCru : `https://${siteCru}`
    try {
      const u = new URL(comEsquema)
      if (u.hostname.includes('.') && !/^[\d.]+$/.test(u.hostname) && !u.hostname.includes(':')) site = u.toString()
    } catch {
      site = null
    }
  }
  return { ok: true, negocio, site }
}

/** Sector de recurso quando a IA falha: horas modestas nas tarefas que quase todos os negócios têm. */
export function sectorGenerico(negocio: string): Sector {
  return {
    id: SECTOR_LIVRE_ID,
    nome: negocio,
    retrato: 'Mensagens de clientes a toda a hora, marcações e orçamentos feitos à mão, e as redes sempre para depois.',
    horas: { mensagens: 5, marcacoes: 2, orcamentos: 2, faturas: 2, redes: 2, dados: 2 },
    plano: ['Agente que responde às perguntas repetidas', 'Marcações e lembretes automáticos', 'Orçamentos e faturas a sair sozinhos'],
    ecra: { cliente: 'Cliente', pergunta: 'Olá! Queria saber preços e disponibilidade.', resposta: 'Claro! Digo-te já as opções e, se quiseres, deixo marcado. Recebes confirmação aqui.', servico: 'Pedido de informação' },
  }
}

export function promptSector(negocio: string, resumoSite: string | null): { sistema: string; mensagem: string } {
  const tarefas = Object.values(TAREFAS)
    .map((t) => `${t.id}: ${t.nome}`)
    .join('; ')
  const sistema = [
    'És o analista da MoreThanMoney, que implementa automações e agentes de IA em pequenos negócios portugueses.',
    'Escreves em português de Portugal, a tratar por «tu», tom próximo e claro, sem jargão.',
    'Descreves um negócio pequeno típico (2 a 5 pessoas) do tipo indicado, sem inventar clientes, casos nem resultados.',
    'Nos textos NUNCA uses algarismos, percentagens, euros nem prazos.',
    `Só podes usar estas tarefas, pelo id: ${tarefas}.`,
    'Responde só com JSON: {"nome": "nome curto do tipo de negócio", "retrato": "uma frase sobre o dia-a-dia sem IA", "horas": {"id_da_tarefa": horas por semana entre 1 e 10, de 4 a 6 tarefas}, "plano": ["3 automações que entregávamos primeiro, uma frase curta cada"], "ecra": {"cliente": "nome próprio português", "pergunta": "mensagem típica de um cliente", "resposta": "resposta do agente de IA, curta e simpática", "servico": "o serviço pedido, em poucas palavras"}}.',
  ].join(' ')
  const mensagem = [
    `Negócio, nas palavras do dono: «${negocio}».`,
    resumoSite ? `O que o site ou página dele diz: «${resumoSite}».` : '',
    `O que a casa implementa: ${AREAS.map((a) => a.implementamos).join(' | ')}.`,
  ]
    .filter(Boolean)
    .join('\n')
  return { sistema, mensagem }
}

/** Converte a resposta da IA num Sector válido. Devolve null se não houver nada aproveitável. */
export function normalizarSector(bruto: unknown, negocio: string): Sector | null {
  let o: Record<string, unknown> = {}
  if (typeof bruto === 'string') {
    try {
      o = JSON.parse(bruto)
    } catch {
      return null
    }
  } else if (bruto && typeof bruto === 'object') o = bruto as Record<string, unknown>
  const base = sectorGenerico(negocio)

  const horas: Sector['horas'] = {}
  if (o.horas && typeof o.horas === 'object') {
    for (const [id, v] of Object.entries(o.horas as Record<string, unknown>)) {
      const n = Math.round(Number(v))
      if (TAREFAS[id] && Number.isFinite(n) && n > 0) horas[id as keyof typeof TAREFAS] = Math.min(n, 12)
    }
  }
  if (Object.keys(horas).length < 2) return null

  const retrato = txt(o.retrato, 220)
  const plano = (Array.isArray(o.plano) ? o.plano : [])
    .map((p) => txt(p, 120))
    .filter((p) => p.length >= 8 && semDigitos(p))
    .slice(0, 3)
  const e = (o.ecra && typeof o.ecra === 'object' ? o.ecra : {}) as Record<string, unknown>
  const ecra = {
    cliente: txt(e.cliente, 20) || base.ecra.cliente,
    pergunta: txt(e.pergunta, 140) || base.ecra.pergunta,
    resposta: txt(e.resposta, 200) || base.ecra.resposta,
    servico: txt(e.servico, 40) || base.ecra.servico,
  }
  return {
    id: SECTOR_LIVRE_ID,
    nome: negocio,
    retrato: retrato && semDigitos(retrato) ? retrato : base.retrato,
    horas,
    plano: plano.length >= 2 ? plano : base.plano,
    ecra,
  }
}
