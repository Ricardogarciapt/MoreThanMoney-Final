/**
 * COPIAR AS ESTRATÉGIAS POR SINAIS PARA CONTAS REAIS (MT4 / MT5 / TradeLocker) — em SOMBRA.
 *
 * A mestre de cada estratégia é uma conta MTM Funded da casa. As posições dela já saem para a
 * outbox da cópia pelo trigger da 078 (e, com a 083 do ramo copia-equipas, também para rotas de
 * origem `prov:<provider>` com a mesma chave física `mtmfunded:<conta>` e fan-out de 2000).
 *
 * Aqui só se PLANEIAM e gravam as rotas dos subscritores do MTM Auto que têm uma conta real
 * escolhida na subscrição: `modo = 'shadow'` sempre (o cadeado global do live não se toca),
 * `ativa` só com pedido explícito. Sem a 083 aplicada a base recusa `prov:` — o erro volta no
 * resultado e nada fica meio feito.
 */
import { chaveFisica } from '../../copia-contas/regras'
import type { PlataformaCopia } from '../../copia-contas/tipos'

export interface SubscritorReal {
  userId: string
  mtmautoAccountId: string
  plataforma: string
  login?: string | null
  servidor?: string | null
  tlEnv?: string | null
  tlAccountId?: string | null
}

export interface RotaPlaneada {
  user_id: string
  origem_tipo: 'mtmfunded'
  origem_ref: string
  origem_chave: string
  destino_tipo: PlataformaCopia
  destino_ref: string
  destino_chave: string
  rotulo: string
  modo_lote: 'proporcional_saldo'
  valor: number
  modo: 'shadow'
  ativa: boolean
  estado: 'aprovada'
  pedido_pelo_cliente: false
  notas: string
}

export function planearRotasSombra(p: {
  providerId: string
  slug: string
  nome: string
  contaMestreId: string
  subscritores: SubscritorReal[]
  ativar?: boolean
}): { rotas: RotaPlaneada[]; ignorados: Array<{ mtmautoAccountId: string; motivo: string }> } {
  const rotas: RotaPlaneada[] = []
  const ignorados: Array<{ mtmautoAccountId: string; motivo: string }> = []
  const origemChave = `mtmfunded:${p.contaMestreId.toLowerCase()}`
  const vistos = new Set<string>()
  for (const s of p.subscritores) {
    if (!['mt4', 'mt5', 'tradelocker'].includes(s.plataforma)) {
      ignorados.push({ mtmautoAccountId: s.mtmautoAccountId, motivo: `plataforma ${s.plataforma} (só MT4/MT5/TradeLocker)` })
      continue
    }
    const ref = `auto:${s.mtmautoAccountId}`
    const chave = chaveFisica({ plataforma: s.plataforma as PlataformaCopia, login: s.login, servidor: s.servidor, tlEnv: s.tlEnv, tlAccountId: s.tlAccountId, ref })
    if (!chave) { ignorados.push({ mtmautoAccountId: s.mtmautoAccountId, motivo: 'sem identidade física (login/servidor)' }); continue }
    if (vistos.has(chave)) { ignorados.push({ mtmautoAccountId: s.mtmautoAccountId, motivo: 'conta repetida' }); continue }
    vistos.add(chave)
    rotas.push({
      user_id: s.userId,
      origem_tipo: 'mtmfunded', origem_ref: `prov:${p.providerId}`, origem_chave: origemChave,
      destino_tipo: s.plataforma as PlataformaCopia, destino_ref: ref, destino_chave: chave,
      rotulo: `${p.nome} → conta real`, modo_lote: 'proporcional_saldo', valor: 1,
      modo: 'shadow', ativa: Boolean(p.ativar), estado: 'aprovada', pedido_pelo_cliente: false,
      notas: `estratégia ${p.slug} (092) — sombra; live só pelo cadeado global`,
    })
  }
  return { rotas, ignorados }
}
