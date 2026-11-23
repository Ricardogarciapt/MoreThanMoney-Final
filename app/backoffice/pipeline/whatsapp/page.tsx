/**
 * PRIMEIRA MENSAGEM DE WHATSAPP — a fila de rascunhos (23/11/2026).
 *
 * Cada lead em «lead» com telefone tem a primeira mensagem já escrita (`lib/whatsapp/primeira-mensagem.ts`).
 * Um toque abre o WhatsApp com o texto; «Marquei enviada» passa o negócio a «contactado» e regista no
 * histórico. É o caminho manual, ao lado do automático (templates pela Cloud API no executor do
 * pipeline): serve para a equipa adiantar trabalho e para o número pessoal do Ricardo.
 *
 * Duas filas: «Leads novos» (formulários, landings, Meta, e-books — mais recentes primeiro) e «Lista
 * antiga» (os contactos importados do WhatsApp, mais antigos primeiro). Excluídos (SAIR) não aparecem.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { abrirPagina, SemAcesso } from '../../_partes/acesso'
import { Cabecalho, Falhou, Vazio } from '../../_partes/blocos'
import { LinhaFila } from './linha'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'WhatsApp · primeira mensagem · Backoffice MTM' }

const POR_PAGINA = 40

type Linha = { id: string; nome: string | null; telefone: string; origem: string | null; interesse: string | null; etiquetas: string[] | null; criado_em: string }

export default async function FilaWhatsApp({ searchParams }: { searchParams: Promise<{ fila?: string }> }) {
  const { fila: f } = await searchParams
  const fila = f === 'antiga' ? 'antiga' : 'novos'
  const acesso = await abrirPagina('bo.gestao_comercial')
  if (!acesso.ok) return <SemAcesso motivo={acesso.motivo} oQue="A fila de WhatsApp é da gestão comercial." />

  const db = getSupabaseAdmin()
  let linhas: Linha[] = []
  const contagens = { novos: 0, antiga: 0 }
  try {
    const base = () =>
      db.from('vendas_negocios').select('id, nome, telefone, origem, interesse, etiquetas, criado_em', { count: 'exact' })
        .eq('estado', 'lead').not('telefone', 'is', null)
    const [novos, antiga] = await Promise.all([
      base().neq('origem', 'whatsapp_import').order('criado_em', { ascending: false }).limit(fila === 'novos' ? POR_PAGINA : 1),
      base().eq('origem', 'whatsapp_import').order('criado_em', { ascending: true }).limit(fila === 'antiga' ? POR_PAGINA : 1),
    ])
    if (novos.error) throw novos.error
    if (antiga.error) throw antiga.error
    contagens.novos = novos.count ?? 0
    contagens.antiga = antiga.count ?? 0
    linhas = ((fila === 'novos' ? novos.data : antiga.data) ?? []) as Linha[]
  } catch (e) {
    return <Falhou oQue="Não consegui ler a fila de WhatsApp." detalhe={e instanceof Error ? e.message : undefined} />
  }

  const aba = (k: 'novos' | 'antiga', nome: string) => (
    <a
      href={`?fila=${k}`}
      className={`rounded-md border px-3 py-1.5 text-sm ${fila === k ? 'border-[#D2A63C] text-[#E9C46A]' : 'border-gray-700 text-gray-400 hover:text-gray-200'}`}
    >
      {nome} · {contagens[k].toLocaleString('pt-PT')}
    </a>
  )

  return (
    <div className="space-y-5">
      <Cabecalho
        titulo="WhatsApp · primeira mensagem"
        sub="Toca em «Abrir WhatsApp»: a conversa abre já com o texto. Envia e marca. O automático (Cloud API) corre em paralelo no executor do pipeline."
      />
      <div className="flex flex-wrap gap-2">
        {aba('novos', 'Leads novos')}
        {aba('antiga', 'Lista antiga')}
        <a href="/backoffice/pipeline" className="ml-auto text-sm text-[#D2A63C] hover:underline">← pipeline</a>
      </div>
      {!linhas.length ? (
        <Vazio titulo="Nada por enviar nesta fila." seguinte="Os leads novos dos formulários e anúncios aparecem aqui sozinhos." />
      ) : (
        <ul className="space-y-3">
          {linhas.map((n) => {
            return (
              <li key={n.id} className="rounded-lg border border-gray-800 bg-black/30 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <a href={`/backoffice/pipeline/ficha/${n.id}`} className="font-semibold text-white hover:text-[#E9C46A]">{n.nome || 'Sem nome'}</a>
                  <span className="text-xs text-gray-500">{n.telefone} · {n.origem ?? '—'} · {new Date(n.criado_em).toLocaleDateString('pt-PT')}</span>
                </div>
                <LinhaFila id={n.id} telefone={n.telefone} negocio={{ nome: n.nome, origem: n.origem, interesse: n.interesse, etiquetas: n.etiquetas }} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
