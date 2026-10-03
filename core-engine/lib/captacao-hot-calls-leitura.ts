import type { SupabaseClient } from '@supabase/supabase-js'
import { chamadasDoDia, type ChamadaQuente, type FactosDaPessoa } from '@/lib/captacao-hot-calls'

/**
 * De onde saem as chamadas quentes — a parte que fala com a base de dados.
 *
 * Separada da decisão (`captacao-hot-calls.ts`) de propósito: a decisão é pura e está presa por
 * guardas; isto só vai buscar factos e entrega-os. Assim o que decide quem se liga pode ser testado
 * sem base de dados e sem ninguém do outro lado do telefone.
 *
 * TRÊS FONTES, por ordem de temperatura:
 *  · rede de IBs — gente que JÁ negoceia, só que noutra casa. A conversa mais curta que há;
 *  · pipeline — negócios vivos com número;
 *  · perfis — quem abriu conta na corretora ou se registou e nunca activou.
 */
export async function factosParaChamadas(db: SupabaseClient): Promise<FactosDaPessoa[]> {
  const [ib, negocios, perfis, daCasa] = await Promise.all([
    db
      .from('ib_contas')
      .select('cliente_nome, cliente_telefone, volume_lotes, comissao_usd, estado_migracao')
      .eq('estado_migracao', 'a_transitar')
      .not('cliente_telefone', 'is', null)
      .order('volume_lotes', { ascending: false, nullsFirst: false })
      .limit(200),
    db
      .from('vendas_negocios')
      .select('nome, telefone, estado, nota, atualizado_em')
      .not('telefone', 'is', null)
      .not('estado', 'in', '("ganho","perdido")')
      .limit(200),
    db
      .from('profiles')
      .select('full_name, phone, broker_uid, is_active')
      .not('phone', 'is', null)
      .limit(200),
    // Quem é da casa não se liga. Ver a explicação abaixo. Os membros da rede de IBs entram por
    // aqui também — são todos perfis activos, por isso não é preciso ler `ib_membros` à parte.
    db.from('profiles').select('phone, full_name, is_active'),
  ])

  /**
   * QUEM É NOSSO NÃO ENTRA NA LISTA DE CHAMADAS.
   *
   * A primeira versão pôs o Rui Rodrigues e o Ruben Pereira no topo — e os dois são SUB-IBs da
   * rede. Ligar-lhes a propor «traga a sua conta para a PU Prime» é o género de chamada que
   * estraga uma relação em trinta segundos, e faz quem liga perder a confiança na lista à primeira
   * linha que lê. É a segunda vez que caio nisto: aconteceu igual com os leads da ingestão.
   *
   * Excluem-se por duas vias, porque nenhuma delas é completa sozinha: o TELEFONE (que é o que se
   * marca, e a rede de IBs tem os números) e o NOME de quem é membro activo da casa. Comparar
   * nomes é grosseiro — mas aqui o erro caro é ligar a um colega, não é deixar uma chamada por
   * fazer.
   */
  const telefonesDaCasa = new Set<string>()
  const nomesDaCasa = new Set<string>()
  for (const r of daCasa.data ?? []) {
    const p = r as { phone: string | null; full_name: string | null; is_active: boolean | null }
    if (p.is_active !== true) continue
    const digitos = (p.phone ?? '').replace(/\D/g, '')
    if (digitos.length >= 9) telefonesDaCasa.add(digitos.slice(-9))
    const nome = (p.full_name ?? '').trim().toLowerCase()
    if (nome) nomesDaCasa.add(nome)
  }
  const ehDaCasa = (telefone: string | null, nome: string): boolean => {
    const digitos = (telefone ?? '').replace(/\D/g, '')
    if (digitos.length >= 9 && telefonesDaCasa.has(digitos.slice(-9))) return true
    return nomesDaCasa.has(nome.trim().toLowerCase())
  }

  const factos: FactosDaPessoa[] = []

  for (const r of ib.data ?? []) {
    const c = r as Record<string, unknown>
    if (ehDaCasa((c.cliente_telefone as string) ?? null, String(c.cliente_nome ?? ''))) continue
    factos.push({
      nome: String(c.cliente_nome ?? 'Sem nome'),
      telefone: (c.cliente_telefone as string) ?? null,
      fonte: 'corretora',
      lotesNoutraCasa: Number(c.volume_lotes ?? 0),
      comissaoNoutraCasa: Number(c.comissao_usd ?? 0),
    })
  }

  const agora = Date.now()
  for (const r of negocios.data ?? []) {
    const n = r as Record<string, unknown>
    if (ehDaCasa((n.telefone as string) ?? null, String(n.nome ?? ''))) continue
    const mexido = Date.parse(String(n.atualizado_em ?? ''))
    factos.push({
      nome: String(n.nome ?? 'Sem nome'),
      telefone: (n.telefone as string) ?? null,
      fonte: 'pipeline',
      diasSemContacto: Number.isFinite(mexido) ? Math.floor((agora - mexido) / 86_400_000) : null,
    })
  }

  for (const r of perfis.data ?? []) {
    const p = r as Record<string, unknown>
    // Um perfil ACTIVO é cliente ou é da equipa — nos dois casos não é uma chamada de angariação.
    if (p.is_active === true) continue
    factos.push({
      nome: String(p.full_name ?? 'Sem nome'),
      telefone: (p.phone as string) ?? null,
      fonte: 'perfil',
      temContaNaCorretora: Boolean(p.broker_uid),
      registadoSemActivar: p.is_active !== true,
    })
  }

  return factos
}

export async function chamadasParaHoje(
  db: SupabaseClient,
  quantas?: number,
): Promise<ChamadaQuente[]> {
  return chamadasDoDia(await factosParaChamadas(db), quantas)
}
