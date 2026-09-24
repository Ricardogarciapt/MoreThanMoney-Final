/**
 * AS OPÇÕES DE UMA ESTRATÉGIA, escritas do site.
 *
 * Isto só existia no admin da MTM Auto (`/definicoes/admin`): daqui, o Centro sabia ler o estado e
 * mandava o admin para lá por um link. Duas páginas para a mesma estratégia — uma para ver e outra
 * para mexer — é o tipo de separação que faz alguém mexer na errada.
 *
 * A regra é a MESMA dos dois lados: `lib/estrategias-admin/opcoes.ts` (puro, copiado tal e qual
 * para o repositório da MTM Auto) decide o que se grava e o que se recusa. Aqui só se lê a linha,
 * se escreve, se RELÊ (a resposta de uma escrita não é prova) e se audita.
 *
 * O que NÃO passa por aqui: as colunas da conta e a fonte de execução (mestre/espelho), que têm as
 * rotas e a função de base delas — `acoes.trocar_fonte`.
 */
import { esquecerCache } from '../cache'
import { db, ler } from './base'
import { registarAuditoria } from './outros'
import {
  diferencasOpcoes, lerOpcoes, normalizarOpcoes, textoDiferenca, type OpcoesEstrategia,
} from '@/lib/estrategias-admin/opcoes'

export interface RespostaOpcoes {
  ok: boolean
  status: number
  mensagem: string
  opcoes?: OpcoesEstrategia
  erros?: string[]
}

/** A palavra que o admin escreve para gravar. Mexer nisto muda o que a estratégia faz às contas. */
export const CONFIRMACAO_OPCOES = 'CONFIRMAR'

export interface FichaOpcoes {
  id: string
  slug: string
  nome: string
  tipo: string | null
  apagada: boolean
  opcoes: OpcoesEstrategia
}

export async function lerOpcoesEstrategia(providerId: string): Promise<FichaOpcoes | null> {
  const r = await ler(db().from('mtmauto_providers').select('*').eq('id', providerId).limit(1))
  const l = r.linhas[0]
  if (!l) return null
  return {
    id: String(l.id),
    slug: String(l.slug ?? ''),
    nome: String(l.nome ?? ''),
    tipo: l.tipo == null ? null : String(l.tipo),
    apagada: Boolean(l.apagado_em),
    opcoes: lerOpcoes(l),
  }
}

export async function gravarOpcoesEstrategia(
  adminId: string,
  providerId: string,
  pedido: Record<string, unknown>,
  confirmacao: string,
): Promise<RespostaOpcoes> {
  let r: RespostaOpcoes
  try {
    if (confirmacao !== CONFIRMACAO_OPCOES) {
      r = { ok: false, status: 400, mensagem: `Escreve «${CONFIRMACAO_OPCOES}» para confirmar.` }
    } else {
      const antes = await ler(db().from('mtmauto_providers').select('*').eq('id', providerId).limit(1))
      const linha = antes.linhas[0]
      if (!linha) r = { ok: false, status: 404, mensagem: 'Estratégia não encontrada.' }
      // Uma estratégia apagada (084) não volta a executar por engano: o histórico dela fica, as
      // opções não se mexem.
      else if (linha.apagado_em) r = { ok: false, status: 410, mensagem: 'Esta estratégia foi apagada.' }
      else {
        const n = normalizarOpcoes(pedido, linha)
        if (!n.ok) {
          r = { ok: false, status: 400, mensagem: n.erros.map((e) => e.erro).join(' '), erros: n.erros.map((e) => e.erro) }
        } else {
          const diffs = diferencasOpcoes(lerOpcoes(linha), n.opcoes)
          if (!diffs.length) {
            r = { ok: true, status: 200, mensagem: 'Nada mudou.', opcoes: n.opcoes }
          } else {
            const escrita = await ler(
              db().from('mtmauto_providers').update({ ...n.opcoes, updated_at: new Date().toISOString() }).eq('id', providerId),
            )
            if (escrita.erro) {
              r = { ok: false, status: escrita.semColuna ? 409 : 500, mensagem: `A base recusou: ${escrita.erro}` }
            } else {
              // Reler: a resposta de uma escrita não é prova (copyfactory-desubscricao-partida).
              const depois = await lerOpcoesEstrategia(providerId)
              const porGravar = depois ? diferencasOpcoes(depois.opcoes, n.opcoes) : diffs
              r = porGravar.length
                ? { ok: false, status: 500, mensagem: `Gravado mas a releitura não bate: ${porGravar.map(textoDiferenca).join(' · ')}.`, opcoes: depois?.opcoes }
                : { ok: true, status: 200, mensagem: `${diffs.map(textoDiferenca).join(' · ')}.`, opcoes: depois!.opcoes }
            }
          }
        }
      }
    }
  } catch (e) {
    r = { ok: false, status: 500, mensagem: e instanceof Error ? e.message : String(e) }
  }
  // O catálogo do Centro guarda 30 s: sem isto o admin gravava e via o valor antigo.
  for (const k of ['centro:estrategias', 'centro:cockpit']) esquecerCache(k)
  await registarAuditoria({
    adminId, acao: 'estrategia:opcoes', alvo: `mtmauto_providers:${providerId}`,
    pedido: { ...pedido, confirmacao: undefined }, resultado: r!, ok: r!.ok,
  })
  return r!
}
