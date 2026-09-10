'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Power, Trophy, Users, Wallet, AlertTriangle } from 'lucide-react'

/**
 * Painel de admin do MTM Funded e dos torneios.
 *
 * O interruptor está no topo e é o primeiro que se vê: é o que separa "o produto existe" de
 * "o produto vende". Desligado, o /mtmfunded encaminha para os torneios e não mostra preço
 * nenhum.
 *
 * O que se mostra a seguir é o estado real da operação — quantos se inscreveram, quantas
 * contas estão por emitir, quantas quebraram. Um painel de gestão que não diz o que está
 * encravado não serve para gerir.
 */

interface Estado {
  config: { ativo: boolean; vendas_abertas: boolean; torneio_ativo: string | null; minutos_entre_leituras: number }
  torneios: Array<{
    id: string; slug: string; nome: string; estado: string; publicado: boolean
    comeca_em: string; acaba_em: string; participantes: number
  }>
  contas: { total: number; porEmitir: number; ativas: number; quebradas: number }
  fila: { emFila: number; erro: number }
  certificados: number
}

export default function MtmFundedManager() {
  const [estado, setEstado] = useState<Estado | null>(null)
  const [aCarregar, setACarregar] = useState(true)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/mtmfunded', { cache: 'no-store' })
      if (!r.ok) throw new Error((await r.json())?.error ?? 'Falha a carregar')
      setEstado(await r.json())
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha a carregar')
    } finally {
      setACarregar(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const accao = async (corpo: Record<string, unknown>, etiqueta: string) => {
    setOcupado(etiqueta)
    setErro(null)
    try {
      const r = await fetch('/api/admin/mtmfunded', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'Falhou')
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falhou')
    } finally {
      setOcupado(null)
    }
  }

  if (aCarregar) {
    return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#D2A63C]" /></div>
  }
  if (!estado) {
    return <p className="p-6 text-sm text-red-400">{erro ?? 'Sem dados.'}</p>
  }

  const c = estado.config

  return (
    <div className="space-y-5 p-6">
      {erro && <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-sm text-red-400">{erro}</p>}

      {/* ── O interruptor ────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-[#D2A63C]/20 bg-black/30 p-5">
        <div className="flex items-center gap-2">
          <Power className="h-4 w-4 text-[#D2A63C]" />
          <h3 className="font-semibold text-gray-200">MTM Funded</h3>
        </div>

        <div className="mt-4 space-y-3">
          <Interruptor
            titulo="Produto activo"
            nota="Desligado, o /mtmfunded encaminha para os torneios e não mostra preços."
            ligado={c.ativo}
            ocupado={ocupado === 'ativo'}
            aoMudar={(v) => accao({ ativo: v }, 'ativo')}
          />
          <Interruptor
            titulo="Vendas abertas"
            nota="Com o produto activo mas as vendas fechadas, os programas aparecem como montra."
            ligado={c.vendas_abertas}
            desativado={!c.ativo}
            ocupado={ocupado === 'vendas'}
            aoMudar={(v) => accao({ vendas_abertas: v }, 'vendas')}
          />
        </div>
      </section>

      {/* ── Operação ─────────────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao icone={Users} titulo="Participantes" valor={estado.torneios.reduce((a, t) => a + t.participantes, 0)} />
        <Cartao icone={Wallet} titulo="Contas activas" valor={estado.contas.ativas} />
        <Cartao
          icone={AlertTriangle}
          titulo="Contas por emitir"
          valor={estado.contas.porEmitir}
          alerta={estado.contas.porEmitir > 0}
        />
        <Cartao icone={Trophy} titulo="Certificados" valor={estado.certificados} />
      </div>

      {(estado.fila.emFila > 0 || estado.fila.erro > 0) && (
        <section className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-4">
          <p className="text-sm text-amber-300">
            Fila de criação de contas: <b>{estado.fila.emFila}</b> à espera
            {estado.fila.erro > 0 && <> · <b>{estado.fila.erro}</b> com erro</>}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            O agente do MT5 processa a fila. Não emite contas com transmissão a decorrer.
          </p>
        </section>
      )}

      {/* ── Torneios ─────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-800 bg-black/30 p-5">
        <h3 className="font-semibold text-gray-200">Torneios</h3>
        <div className="mt-3 space-y-3">
          {!estado.torneios.length && <p className="text-sm text-gray-500">Ainda não há torneios.</p>}
          {estado.torneios.map((t) => (
            <div key={t.id} className="rounded-lg border border-gray-800 bg-black/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-100">{t.nome}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {new Date(t.comeca_em).toLocaleDateString('pt-PT')} — {new Date(t.acaba_em).toLocaleDateString('pt-PT')}
                    {' · '}{t.participantes} {t.participantes === 1 ? 'participante' : 'participantes'}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs ${
                  t.publicado ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-800 text-gray-400'
                }`}>
                  {t.publicado ? t.estado : 'não publicado'}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {!t.publicado && (
                  <Botao
                    ocupado={ocupado === `pub:${t.id}`}
                    onClick={() => accao({ torneioId: t.id, publicar: true }, `pub:${t.id}`)}
                  >
                    Publicar
                  </Botao>
                )}
                {t.publicado && t.estado === 'draft' && (
                  <Botao
                    ocupado={ocupado === `insc:${t.id}`}
                    onClick={() => accao({ torneioId: t.id, estado: 'inscricoes' }, `insc:${t.id}`)}
                  >
                    Abrir inscrições
                  </Botao>
                )}
                {t.estado === 'inscricoes' && (
                  <Botao
                    ocupado={ocupado === `corr:${t.id}`}
                    onClick={() => accao({ torneioId: t.id, estado: 'a_decorrer' }, `corr:${t.id}`)}
                  >
                    Começar torneio
                  </Botao>
                )}
                {t.estado === 'a_decorrer' && (
                  <Botao
                    ocupado={ocupado === `fim:${t.id}`}
                    onClick={() => {
                      if (confirm('Terminar o torneio? A classificação fica congelada como está.')) {
                        accao({ torneioId: t.id, estado: 'terminado' }, `fim:${t.id}`)
                      }
                    }}
                  >
                    Terminar
                  </Botao>
                )}
                {t.estado === 'terminado' && (
                  <Botao
                    ocupado={ocupado === `cert:${t.id}`}
                    onClick={() => {
                      if (confirm('Emitir certificados e enviá-los por email a todos os que negociaram?')) {
                        accao({ torneioId: t.id, emitirCertificados: true }, `cert:${t.id}`)
                      }
                    }}
                  >
                    Emitir certificados
                  </Botao>
                )}
                {t.publicado && (
                  <a
                    href={`/mtmfunded/tradingtournament`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500"
                  >
                    Ver página
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Interruptor({
  titulo, nota, ligado, aoMudar, ocupado, desativado,
}: {
  titulo: string; nota: string; ligado: boolean
  aoMudar: (v: boolean) => void; ocupado?: boolean; desativado?: boolean
}) {
  return (
    <div className={`flex items-start justify-between gap-4 ${desativado ? 'opacity-40' : ''}`}>
      <div>
        <p className="text-sm font-medium text-gray-200">{titulo}</p>
        <p className="mt-0.5 text-xs text-gray-500">{nota}</p>
      </div>
      <button
        type="button"
        disabled={ocupado || desativado}
        onClick={() => aoMudar(!ligado)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${ligado ? 'bg-emerald-500' : 'bg-gray-700'} disabled:cursor-not-allowed`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${ligado ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  )
}

function Cartao({
  icone: Icone, titulo, valor, alerta,
}: {
  icone: typeof Users; titulo: string; valor: number; alerta?: boolean
}) {
  return (
    <div className={`rounded-xl border p-4 ${alerta ? 'border-amber-500/30 bg-amber-500/[0.04]' : 'border-gray-800 bg-black/30'}`}>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Icone className="h-3.5 w-3.5" /> {titulo}
      </div>
      <p className={`mt-1 text-2xl font-bold ${alerta ? 'text-amber-400' : 'text-gray-100'}`}>{valor}</p>
    </div>
  )
}

function Botao({ children, onClick, ocupado }: { children: React.ReactNode; onClick: () => void; ocupado?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={ocupado}
      className="rounded-lg bg-[#D2A63C] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
    >
      {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : children}
    </button>
  )
}
