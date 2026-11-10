/**
 * O público virtual como ferramentas MCP / chat do dashboard-gestao (servidas com as outras).
 * Dentro da regra de lib/mcp/ferramentas: pedir uma simulação é reversível e não toca em clientes.
 * O pedido fica 'pendente' até o Mac do dono o trazer (aios/publico_virtual `sincronizar`).
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import type { Ferramenta } from '@/lib/mcp/ferramentas'
import { ALVOS, AVISO_SIMULACAO, RONDAS_TECTO, validarPedidoPV } from './regras'

export const FERRAMENTAS_PUBLICO_VIRTUAL: Ferramenta[] = [
  {
    nome: 'pedir_teste_publico_virtual',
    descricao:
      'Pede um teste com PÚBLICO VIRTUAL: uma multidão simulada do público-alvo MTM (MiroFish com IA local ' +
      'no Mac do dono) reage a uma página pública, funil, email, DM, post ou ecrã da app e devolve um relatório ' +
      'em pt-PT com objeções, quem avança, quem desiste e o que mudar. Demora ~1 h e há no máximo 3 por dia. ' +
      'É simulação: serve para encontrar objeções, não para prometer números. ' +
      `Alvos: ${Object.keys(ALVOS).join(', ')}. Os alvos *:texto precisam do campo texto.`,
    esquema: {
      type: 'object',
      properties: {
        alvo: { type: 'string', enum: Object.keys(ALVOS) },
        pergunta: { type: 'string', description: 'O que se quer saber (pt-PT). Vazio = a pergunta por omissão do alvo' },
        texto: { type: 'string', description: 'Só nos alvos *:texto: o rascunho a testar (post, email, DM)' },
        rondas: { type: 'number', description: `Rondas da simulação (2–${RONDAS_TECTO}; por omissão 8)` },
        pedido_por: { type: 'string', description: 'Código do agente que pede (ex.: AG-SOCIAL). Vazio = dono' },
      },
      required: ['alvo'],
      additionalProperties: false,
    },
    correr: async (a) => {
      const v = validarPedidoPV(a)
      if (!v.ok) return { ok: false, erro: v.erro }
      const { data, error } = await getSupabaseAdmin().from('publico_virtual_testes').insert(v.pedido).select('id, estado').single()
      return error ? { ok: false, erro: error.message } : { ok: true, id: data.id, estado: data.estado, nota: 'Fica pendente até o Mac do dono o trazer; vê com ver_testes_publico_virtual.' }
    },
  },
  {
    nome: 'ver_testes_publico_virtual',
    descricao: 'Os testes com público virtual (estado: pendente, fila, recusado, feito, falhou). Com id, devolve o relatório completo.',
    esquema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Id do teste para ler o relatório' } },
      additionalProperties: false,
    },
    correr: async (a) => {
      const db = getSupabaseAdmin()
      if (a.id) {
        const { data, error } = await db.from('publico_virtual_testes').select('*').eq('id', String(a.id)).maybeSingle()
        return error ? { ok: false, erro: error.message } : { ok: true, aviso: AVISO_SIMULACAO, teste: data }
      }
      const { data, error } = await db.from('publico_virtual_testes')
        .select('id, alvo, pergunta, pedido_por, estado, motivo, criado_em').order('criado_em', { ascending: false }).limit(20)
      return error ? { ok: false, erro: error.message } : { ok: true, testes: data ?? [] }
    },
  },
]
