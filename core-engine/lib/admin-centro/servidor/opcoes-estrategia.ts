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
import { AVISO_APAGAR, confirmacaoDeApagar, podeApagarEstrategia } from '@/lib/estrategias-admin/apagar'
import { esquecerEscondidas } from '@/lib/estrategias-admin/escondidas-servidor'
import { carregarCadeia, CHAVE_CACHE_CADEIA } from '@/lib/copia-contas/servidor/cadeia'

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

// ── APAGAR (= ESCONDER) E RESTAURAR ─────────────────────────────────────────

/**
 * Esconder uma estratégia (`apagado_em`) e trazê-la de volta.
 *
 * O ESTADO que decide não é lido outra vez aqui: vem da CADEIA (`carregarCadeia`), que já sabe
 * quantas rotas o motor executa em live, quantas posições estão abertas e quem segue a estratégia —
 * e sabe-o pela regra do motor (`lib/mestres/decisao.ts`), não pela coluna `copia_rotas.modo` que
 * está `shadow` em todas as linhas. Uma segunda contagem aqui seria uma segunda opinião sobre o que
 * está vivo, e era exactamente esse desencontro que fazia o painel antigo dizer «0 em live».
 *
 * A decisão é de `lib/estrategias-admin/apagar.ts` (pura, testada). Aqui só se lê, se escreve, se
 * RELÊ e se audita.
 */
export async function apagarEstrategia(adminId: string, providerId: string, confirmacao: string): Promise<RespostaOpcoes> {
  const ficha = await lerOpcoesEstrategia(providerId)
  if (!ficha) return auditar(adminId, providerId, 'apagar', { ok: false, status: 404, mensagem: 'Estratégia não encontrada.' })
  if (confirmacao !== confirmacaoDeApagar(ficha.slug)) {
    return auditar(adminId, providerId, 'apagar', { ok: false, status: 400, mensagem: `Escreve «${confirmacaoDeApagar(ficha.slug)}» para confirmar.` })
  }

  const cadeia = await carregarCadeia()
  const no = cadeia.estrategias.find((e) => e.slug.toLowerCase() === ficha.slug.toLowerCase()) ?? null
  const v = podeApagarEstrategia({
    slug: ficha.slug,
    apagada: ficha.apagada,
    abertas: no?.subscritores.reduce((a, s) => a + s.abertas, 0) ?? 0,
    rotasLive: no?.contagem.live ?? 0,
    // Quem já não segue (rota pausada) não impede esconder — só quem ainda a tem escolhida.
    subscritores: no ? no.contagem.total - no.contagem.pausados : 0,
    modoMotor: no?.modoPedido === 'sem-mestre' ? null : no?.modoPedido ?? null,
  })
  if (!v.ok) return auditar(adminId, providerId, 'apagar', { ok: false, status: 409, mensagem: v.mensagem })

  const escrita = await ler(
    db().from('mtmauto_providers')
      // `ativo=false` no mesmo passo: `apagado_em` tira-a dos catálogos, `ativo` tira-a dos gates de
      // execução que só olham para essa coluna (lib/mtmfunded/estrategias-sinais/executar.ts).
      .update({ apagado_em: new Date().toISOString(), apagado_por: adminId, ativo: false, updated_at: new Date().toISOString() })
      .eq('id', providerId).is('apagado_em', null),
  )
  if (escrita.erro) return auditar(adminId, providerId, 'apagar', { ok: false, status: escrita.semColuna ? 409 : 500, mensagem: `A base recusou: ${escrita.erro}` })

  for (const k of [CHAVE_CACHE_CADEIA, 'centro:estrategias', 'centro:cockpit', 'centro:contas']) esquecerCache(k)
  esquecerEscondidas() // o proxy da app-mobile lê daqui — sem isto, a app mostrava-a 10 s a mais
  // Reler: a resposta de uma escrita não é prova.
  const depois = await lerOpcoesEstrategia(providerId)
  return auditar(adminId, providerId, 'apagar', depois?.apagada
    ? { ok: true, status: 200, mensagem: `«${ficha.slug}» escondida. ${AVISO_APAGAR}` }
    : { ok: false, status: 500, mensagem: 'Gravado mas a releitura diz que continua visível.' })
}

/** Trazer de volta. Volta SEM `ativo`: quem a esconde decide depois, à parte, se a religa. */
export async function restaurarEstrategia(adminId: string, providerId: string): Promise<RespostaOpcoes> {
  const ficha = await lerOpcoesEstrategia(providerId)
  if (!ficha) return auditar(adminId, providerId, 'restaurar', { ok: false, status: 404, mensagem: 'Estratégia não encontrada.' })
  if (!ficha.apagada) return auditar(adminId, providerId, 'restaurar', { ok: true, status: 200, mensagem: 'Já estava visível.' })

  const escrita = await ler(
    db().from('mtmauto_providers').update({ apagado_em: null, apagado_por: null, updated_at: new Date().toISOString() }).eq('id', providerId),
  )
  if (escrita.erro) return auditar(adminId, providerId, 'restaurar', { ok: false, status: 500, mensagem: `A base recusou: ${escrita.erro}` })

  for (const k of [CHAVE_CACHE_CADEIA, 'centro:estrategias', 'centro:cockpit', 'centro:contas']) esquecerCache(k)
  esquecerEscondidas() // o proxy da app-mobile lê daqui — sem isto, a app mostrava-a 10 s a mais
  const depois = await lerOpcoesEstrategia(providerId)
  return auditar(adminId, providerId, 'restaurar', depois && !depois.apagada
    ? { ok: true, status: 200, mensagem: `«${ficha.slug}» voltou aos catálogos. Continua DESLIGADA (ativo=false) até a religares.` }
    : { ok: false, status: 500, mensagem: 'Gravado mas a releitura diz que continua apagada.' })
}

async function auditar(adminId: string, providerId: string, acao: 'apagar' | 'restaurar', r: RespostaOpcoes): Promise<RespostaOpcoes> {
  await registarAuditoria({
    adminId, acao: `estrategia:${acao}`, alvo: `mtmauto_providers:${providerId}`, pedido: { providerId }, resultado: r, ok: r.ok,
  })
  return r
}
