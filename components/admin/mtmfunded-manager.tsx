'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Loader2, Power, Trophy, Users, Wallet, AlertTriangle, Award,
  Shield, RefreshCw, Mail, KeyRound, Ban, Check, Package, Plus, Banknote, ExternalLink,
} from 'lucide-react'

/**
 * Painel de admin do MTM Funded e dos torneios.
 *
 * O interruptor está no topo porque é o que separa "o produto existe" de "o produto vende".
 * O resto é operação: quem se inscreveu, que contas estão por emitir, o que encravou na fila,
 * e as regras de cada torneio. Um painel de gestão que não diz o que está encravado não serve
 * para gerir — serve para dar a sensação de que se está a gerir.
 */

type Aba = 'resumo' | 'participantes' | 'contas' | 'programas' | 'levantamentos' | 'certificados' | 'regras'

interface Torneio {
  id: string; slug: string; nome: string; estado: string; publicado: boolean
  comeca_em: string; acaba_em: string; participantes: number
  saldo_inicial: number; regras: Record<string, number>
}
interface Resumo {
  config: { ativo: boolean; vendas_abertas: boolean; minutos_entre_leituras: number }
  torneios: Torneio[]
  contas: { total: number; porEmitir: number; ativas: number; quebradas: number }
  fila: { emFila: number; erro: number }
  certificados: number
}

const ABAS: Array<{ id: Aba; nome: string; icone: typeof Users }> = [
  { id: 'resumo', nome: 'Resumo', icone: Trophy },
  { id: 'participantes', nome: 'Participantes', icone: Users },
  { id: 'contas', nome: 'Contas', icone: Wallet },
  { id: 'programas', nome: 'Programas', icone: Package },
  { id: 'levantamentos', nome: 'Levantamentos', icone: Banknote },
  { id: 'certificados', nome: 'Certificados', icone: Award },
  { id: 'regras', nome: 'Regras', icone: Shield },
]

export default function MtmFundedManager() {
  const [aba, setAba] = useState<Aba>('resumo')
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [aCarregar, setACarregar] = useState(true)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/mtmfunded', { cache: 'no-store' })
      if (!r.ok) throw new Error((await r.json())?.error ?? 'Falha a carregar')
      setResumo(await r.json())
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha a carregar')
    } finally {
      setACarregar(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const accao = useCallback(async (corpo: Record<string, unknown>, etiqueta: string) => {
    setOcupado(etiqueta); setErro(null); setAviso(null)
    try {
      const r = await fetch('/api/admin/mtmfunded', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? 'Falhou')
      await carregar()
      return j
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falhou')
      return null
    } finally {
      setOcupado(null)
    }
  }, [carregar])

  if (aCarregar) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#D2A63C]" /></div>
  if (!resumo) return <p className="p-6 text-sm text-red-400">{erro ?? 'Sem dados.'}</p>

  return (
    <div className="p-6">
      <div className="mb-5 flex flex-wrap gap-1 border-b border-gray-800">
        {ABAS.map((a) => {
          const Icone = a.icone
          return (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
                aba === a.id ? 'border-[#D2A63C] text-[#D2A63C]' : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              <Icone className="h-3.5 w-3.5" /> {a.nome}
            </button>
          )
        })}
      </div>

      {erro && <p className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-sm text-red-400">{erro}</p>}
      {aviso && <p className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-2 text-sm text-emerald-400">{aviso}</p>}

      {aba === 'resumo' && <Resumo dados={resumo} accao={accao} ocupado={ocupado} />}
      {aba === 'participantes' && <Participantes torneios={resumo.torneios} accao={accao} ocupado={ocupado} />}
      {aba === 'contas' && <Contas accao={accao} ocupado={ocupado} setAviso={setAviso} />}
      {aba === 'programas' && <Programas accao={accao} ocupado={ocupado} setAviso={setAviso} vendasAbertas={resumo.config.vendas_abertas} />}
      {aba === 'levantamentos' && <LevantamentosAdmin accao={accao} ocupado={ocupado} setAviso={setAviso} />}
      {aba === 'certificados' && <Certificados torneios={resumo.torneios} accao={accao} ocupado={ocupado} setAviso={setAviso} />}
      {aba === 'regras' && <Regras torneios={resumo.torneios} accao={accao} ocupado={ocupado} setAviso={setAviso} />}
    </div>
  )
}

type Accao = (corpo: Record<string, unknown>, etiqueta: string) => Promise<Record<string, unknown> | null>

// ── Resumo ───────────────────────────────────────────────────────────────────

function Resumo({ dados, accao, ocupado }: { dados: Resumo; accao: Accao; ocupado: string | null }) {
  const c = dados.config
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-[#D2A63C]/20 bg-black/30 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Power className="h-4 w-4 text-[#D2A63C]" />
          <h3 className="font-semibold text-gray-200">MTM Funded</h3>
        </div>
        <div className="space-y-3">
          <Interruptor
            titulo="Produto activo" ligado={c.ativo} ocupado={ocupado === 'ativo'}
            nota="Desligado, o /mtmfunded encaminha para os torneios e não mostra preços."
            aoMudar={(v) => accao({ accao: 'config', ativo: v }, 'ativo')}
          />
          <Interruptor
            titulo="Vendas abertas" ligado={c.vendas_abertas} desativado={!c.ativo} ocupado={ocupado === 'vendas'}
            nota="Activo mas com vendas fechadas, os programas ficam como montra."
            aoMudar={(v) => accao({ accao: 'config', vendas_abertas: v }, 'vendas')}
          />
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao icone={Users} titulo="Participantes" valor={dados.torneios.reduce((a, t) => a + t.participantes, 0)} />
        <Cartao icone={Wallet} titulo="Contas activas" valor={dados.contas.ativas} />
        <Cartao icone={AlertTriangle} titulo="Por emitir" valor={dados.contas.porEmitir} alerta={dados.contas.porEmitir > 0} />
        <Cartao icone={Award} titulo="Certificados" valor={dados.certificados} />
      </div>

      {(dados.fila.emFila > 0 || dados.fila.erro > 0) && (
        <section className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-4">
          <p className="text-sm text-amber-300">
            Fila de criação: <b>{dados.fila.emFila}</b> à espera
            {dados.fila.erro > 0 && <> · <b>{dados.fila.erro}</b> com erro</>}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            O agente do MT5 no VPS processa a fila, e não emite contas durante transmissões.
          </p>
        </section>
      )}

      <section className="rounded-xl border border-gray-800 bg-black/30 p-5">
        <h3 className="mb-3 font-semibold text-gray-200">Torneios</h3>
        <div className="space-y-3">
          {!dados.torneios.length && <p className="text-sm text-gray-500">Ainda não há torneios.</p>}
          {dados.torneios.map((t) => (
            <div key={t.id} className="rounded-lg border border-gray-800 bg-black/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-100">{t.nome}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {new Date(t.comeca_em).toLocaleDateString('pt-PT')} — {new Date(t.acaba_em).toLocaleDateString('pt-PT')}
                    {' · '}{t.participantes} {t.participantes === 1 ? 'participante' : 'participantes'}
                    {' · '}{Number(t.saldo_inicial).toLocaleString('pt-PT')} USD
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs ${t.publicado ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-800 text-gray-400'}`}>
                  {t.publicado ? t.estado : 'não publicado'}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {!t.publicado && (
                  <Botao ocupado={ocupado === `p${t.id}`} onClick={() => accao({ accao: 'torneio_publicar', torneioId: t.id, publicado: true }, `p${t.id}`)}>
                    Publicar
                  </Botao>
                )}
                {t.publicado && t.estado === 'draft' && (
                  <Botao ocupado={ocupado === `i${t.id}`} onClick={() => accao({ accao: 'torneio_estado', torneioId: t.id, estado: 'inscricoes' }, `i${t.id}`)}>
                    Abrir inscrições
                  </Botao>
                )}
                {t.estado === 'inscricoes' && (
                  <Botao ocupado={ocupado === `c${t.id}`} onClick={() => accao({ accao: 'torneio_estado', torneioId: t.id, estado: 'a_decorrer' }, `c${t.id}`)}>
                    Começar
                  </Botao>
                )}
                {t.estado === 'a_decorrer' && (
                  <Botao ocupado={ocupado === `f${t.id}`} onClick={() => confirm('Terminar o torneio? A classificação fica como está.') && accao({ accao: 'torneio_estado', torneioId: t.id, estado: 'terminado' }, `f${t.id}`)}>
                    Terminar
                  </Botao>
                )}
                {t.publicado && (
                  <a href="/mtmfunded/tradingtournament" target="_blank" rel="noopener noreferrer"
                    className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500">
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

// ── Participantes ────────────────────────────────────────────────────────────

function Participantes({ torneios, accao, ocupado }: { torneios: Torneio[]; accao: Accao; ocupado: string | null }) {
  const [linhas, setLinhas] = useState<Array<Record<string, unknown>>>([])
  const [torneio, setTorneio] = useState(torneios[0]?.id ?? '')
  const [aCarregar, setACarregar] = useState(true)

  const puxar = useCallback(async () => {
    setACarregar(true)
    const r = await fetch(`/api/admin/mtmfunded?vista=participantes${torneio ? `&torneio=${torneio}` : ''}`, { cache: 'no-store' })
    const j = await r.json()
    setLinhas(j?.participantes ?? [])
    setACarregar(false)
  }, [torneio])
  useEffect(() => { puxar() }, [puxar])

  return (
    <div className="space-y-4">
      <select value={torneio} onChange={(e) => setTorneio(e.target.value)}
        className="rounded-lg border border-gray-700 bg-black/50 px-3 py-2 text-sm text-gray-200">
        {torneios.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
      </select>

      {aCarregar ? <Loader2 className="h-4 w-4 animate-spin text-[#D2A63C]" /> : (
        <Tabela cabecalhos={['#', 'Nome', 'Email', 'Conta', 'Resultado', 'Estado', '']}>
          {linhas.map((p) => {
            const conta = p.conta as { login?: string; estado?: string } | null
            const r = p.resultado_pct == null ? null : Number(p.resultado_pct)
            return (
              <tr key={p.id as string} className="border-t border-gray-900">
                <td className="px-3 py-2 font-mono text-gray-500">{(p.posicao as number) ?? '—'}</td>
                <td className="px-3 py-2 text-gray-200">{p.nome_publico as string}</td>
                <td className="px-3 py-2 font-mono text-xs text-gray-500">{p.email as string}</td>
                <td className="px-3 py-2 font-mono text-xs text-gray-400">
                  {conta?.login ?? <span className="text-amber-400">por emitir</span>}
                </td>
                <td className={`px-3 py-2 text-right font-mono ${r == null ? 'text-gray-600' : r >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {r == null ? '—' : `${r > 0 ? '+' : ''}${r.toFixed(2)}%`}
                </td>
                <td className="px-3 py-2 text-xs">
                  <Estado valor={p.estado as string} />
                </td>
                <td className="px-3 py-2">
                  {p.estado !== 'desclassificado' ? (
                    <button
                      onClick={() => confirm(`Desclassificar ${p.nome_publico}? Sai da classificação.`) &&
                        accao({ accao: 'participante_estado', participanteId: p.id, estado: 'desclassificado' }, `d${p.id}`).then(puxar)}
                      disabled={ocupado === `d${p.id}`}
                      className="rounded border border-red-500/30 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
                    >
                      <Ban className="h-3 w-3" />
                    </button>
                  ) : (
                    <button
                      onClick={() => accao({ accao: 'participante_estado', participanteId: p.id, estado: 'ativo' }, `r${p.id}`).then(puxar)}
                      disabled={ocupado === `r${p.id}`}
                      className="rounded border border-emerald-500/30 px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-500/10"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
          {!linhas.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-500">Sem participantes.</td></tr>}
        </Tabela>
      )}
    </div>
  )
}

// ── Contas ───────────────────────────────────────────────────────────────────

function Contas({ accao, ocupado, setAviso }: { accao: Accao; ocupado: string | null; setAviso: (s: string | null) => void }) {
  const [linhas, setLinhas] = useState<Array<Record<string, unknown>>>([])
  const [aCarregar, setACarregar] = useState(true)

  const puxar = useCallback(async () => {
    setACarregar(true)
    const r = await fetch('/api/admin/mtmfunded?vista=contas', { cache: 'no-store' })
    const j = await r.json()
    setLinhas(j?.contas ?? [])
    setACarregar(false)
  }, [])
  useEffect(() => { puxar() }, [puxar])

  const verCredenciais = async (id: string) => {
    if (!confirm('Isto mostra a palavra-passe do participante no ecrã. Continuar?')) return
    const j = await accao({ accao: 'conta_credenciais', contaId: id }, `k${id}`)
    if (j?.password) {
      setAviso(`${j.login} · ${j.servidor} · password: ${j.password}${j.investor ? ` · investidor: ${j.investor}` : ''}`)
    }
  }

  if (aCarregar) return <Loader2 className="h-4 w-4 animate-spin text-[#D2A63C]" />

  return (
    <Tabela cabecalhos={['Dono', 'Tipo', 'Login', 'Servidor', 'Estado', 'Acções']}>
      {linhas.map((c) => {
        const dono = c.dono as { nome: string; email: string } | null
        const pedido = c.pedido as { estado: string; erro?: string; tentativas: number } | null
        const id = c.id as string
        return (
          <tr key={id} className="border-t border-gray-900">
            <td className="px-3 py-2">
              <p className="text-gray-200">{dono?.nome ?? '—'}</p>
              <p className="font-mono text-xs text-gray-600">{dono?.email ?? ''}</p>
            </td>
            <td className="px-3 py-2 text-xs text-gray-400">{c.tipo as string}</td>
            <td className="px-3 py-2 font-mono text-xs text-gray-300">
              {(c.mt5_login as string) ?? <span className="text-amber-400">—</span>}
            </td>
            <td className="px-3 py-2 text-xs text-gray-500">{(c.servidor as string) ?? '—'}</td>
            <td className="px-3 py-2 text-xs">
              <Estado valor={c.estado as string} />
              {pedido?.erro && <p className="mt-1 max-w-[220px] truncate text-[11px] text-red-400" title={pedido.erro}>{pedido.erro}</p>}
              {Boolean(c.quebrou_regra) && <p className="mt-1 text-[11px] text-red-400">{c.quebrou_regra as string}</p>}
            </td>
            <td className="px-3 py-2">
              <div className="flex flex-wrap gap-1">
                {!c.mt5_login && (
                  <IconeBotao titulo="Voltar a pedir a criação" ocupado={ocupado === `n${id}`}
                    onClick={() => accao({ accao: 'conta_repetir', contaId: id }, `n${id}`).then(puxar)}>
                    <RefreshCw className="h-3 w-3" />
                  </IconeBotao>
                )}
                {Boolean(c.mt5_login) && (
                  <>
                    <IconeBotao titulo="Reenviar o email das credenciais" ocupado={ocupado === `m${id}`}
                      onClick={() => accao({ accao: 'conta_reenviar', contaId: id }, `m${id}`).then(() => setAviso('Email reenviado.'))}>
                      <Mail className="h-3 w-3" />
                    </IconeBotao>
                    <IconeBotao titulo="Ver as credenciais" ocupado={ocupado === `k${id}`} onClick={() => verCredenciais(id)}>
                      <KeyRound className="h-3 w-3" />
                    </IconeBotao>
                  </>
                )}
                {c.estado !== 'quebrada' && Boolean(c.mt5_login) && (
                  <IconeBotao titulo="Marcar como quebrada" perigo ocupado={ocupado === `q${id}`}
                    onClick={() => {
                      const motivo = prompt('Motivo (fica registado e visível ao participante):')
                      if (motivo) accao({ accao: 'conta_quebrar', contaId: id, motivo }, `q${id}`).then(puxar)
                    }}>
                    <Ban className="h-3 w-3" />
                  </IconeBotao>
                )}
              </div>
            </td>
          </tr>
        )
      })}
      {!linhas.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-500">Sem contas.</td></tr>}
    </Tabela>
  )
}

// ── Certificados ─────────────────────────────────────────────────────────────

function Certificados({ torneios, accao, ocupado, setAviso }: { torneios: Torneio[]; accao: Accao; ocupado: string | null; setAviso: (s: string | null) => void }) {
  const [linhas, setLinhas] = useState<Array<Record<string, unknown>>>([])
  const [torneio, setTorneio] = useState(torneios[0]?.id ?? '')

  const puxar = useCallback(async () => {
    const r = await fetch('/api/admin/mtmfunded?vista=certificados', { cache: 'no-store' })
    const j = await r.json()
    setLinhas(j?.certificados ?? [])
  }, [])
  useEffect(() => { puxar() }, [puxar])

  const emitir = async (enviarEmail: boolean) => {
    const t = torneios.find((x) => x.id === torneio)
    const texto = enviarEmail
      ? `Emitir certificados de "${t?.nome}" E ENVIAR por email a todos os que negociaram?`
      : `Emitir certificados de "${t?.nome}" sem enviar emails?`
    if (!confirm(texto)) return
    const j = await accao({ accao: 'certificados_emitir', torneioId: torneio, enviarEmail }, 'emitir')
    if (j) {
      setAviso(`${j.emitidos} emitidos · ${j.jaExistiam} já existiam · ${j.falhados} falharam`)
      puxar()
    }
  }

  return (
    <div className="space-y-4">
      {/*
        Um exemplar de CADA tipo, para ver e descarregar sem emitir nada a ninguém.
        É a única forma de rever o desenho do certificado antes de o mandar a 50 pessoas —
        e de o rever outra vez depois de lhe mexer.
      */}
      <section className="rounded-xl border border-gray-800 bg-black/30 p-5">
        <h3 className="font-semibold text-gray-200">Modelos</h3>
        <p className="mt-1 text-xs text-gray-500">
          Um exemplar em branco de cada tipo. Abre em PDF, para conferires o desenho antes de
          emitires a sério.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {([
            ['financiado', 'Trader Financiado'],
            ['desafio', 'Desafio concluído'],
            ['classificacao', 'Classificação'],
            ['participacao', 'Participação'],
            ['payout', 'Pagamento'],
          ] as const).map(([tipo, nome]) => (
            <a
              key={tipo}
              href={`/api/mtmfunded/certificado/modelo?amostra=${tipo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-[#D2A63C]/50"
            >
              <Award className="h-3.5 w-3.5" /> {nome}
            </a>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-gray-800 bg-black/30 p-5">
        <h3 className="font-semibold text-gray-200">Emitir</h3>
        <p className="mt-1 text-xs text-gray-500">
          Participação para todos os que negociaram — incluindo quem quebrou a conta. Classificação
          para o pódio. Correr duas vezes não emite em duplicado.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select value={torneio} onChange={(e) => setTorneio(e.target.value)}
            className="rounded-lg border border-gray-700 bg-black/50 px-3 py-2 text-sm text-gray-200">
            {torneios.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
          <Botao ocupado={ocupado === 'emitir'} onClick={() => emitir(true)}>Emitir e enviar</Botao>
          <button onClick={() => emitir(false)} disabled={ocupado === 'emitir'}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-gray-500 disabled:opacity-50">
            Emitir sem enviar
          </button>
        </div>
      </section>

      <Tabela cabecalhos={['Código', 'Nome', 'Tipo', 'Posição', 'Emitido']}>
        {linhas.map((c) => (
          <tr key={c.id as string} className="border-t border-gray-900">
            <td className="px-3 py-2">
              <a href={`/mtmfunded/certificado/${c.codigo}`} target="_blank" rel="noopener noreferrer"
                className="font-mono text-xs text-[#D2A63C] hover:underline">{c.codigo as string}</a>
            </td>
            <td className="px-3 py-2 text-gray-200">{c.nome as string}</td>
            <td className="px-3 py-2 text-xs text-gray-400">{c.tipo as string}</td>
            <td className="px-3 py-2 text-xs text-gray-400">{(c.posicao as number) ?? '—'}</td>
            <td className="px-3 py-2 text-xs text-gray-500">{new Date(c.emitido_em as string).toLocaleDateString('pt-PT')}</td>
          </tr>
        ))}
        {!linhas.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-500">Nenhum emitido.</td></tr>}
      </Tabela>
    </div>
  )
}

// ── Regras ───────────────────────────────────────────────────────────────────

function Regras({ torneios, accao, ocupado, setAviso }: { torneios: Torneio[]; accao: Accao; ocupado: string | null; setAviso: (s: string | null) => void }) {
  const [torneio, setTorneio] = useState(torneios[0]?.id ?? '')
  const alvo = torneios.find((t) => t.id === torneio)
  const [r, setR] = useState<Record<string, number>>(alvo?.regras ?? {})
  useEffect(() => { setR(torneios.find((t) => t.id === torneio)?.regras ?? {}) }, [torneio, torneios])

  const campo = (chave: string, rotulo: string, nota: string) => (
    <div key={chave}>
      <label className="text-sm text-gray-300">{rotulo}</label>
      <p className="mb-1 text-xs text-gray-600">{nota}</p>
      <input
        type="number" step="0.5"
        value={r[chave] ?? 0}
        onChange={(e) => setR({ ...r, [chave]: Number(e.target.value) })}
        className="w-32 rounded-lg border border-gray-700 bg-black/50 px-3 py-2 text-sm text-white"
      />
    </div>
  )

  return (
    <div className="space-y-4">
      <select value={torneio} onChange={(e) => setTorneio(e.target.value)}
        className="rounded-lg border border-gray-700 bg-black/50 px-3 py-2 text-sm text-gray-200">
        {torneios.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
      </select>

      <section className="grid gap-5 rounded-xl border border-gray-800 bg-black/30 p-5 sm:grid-cols-2">
        {campo('perda_diaria_pct', 'Perda diária (%)', 'Sobre a equity de abertura do dia.')}
        {campo('perda_maxima_pct', 'Perda máxima (%)', 'Sobre o saldo inicial. Não pode ser menor do que a diária.')}
        {campo('dias_minimos', 'Dias mínimos', 'Abaixo disto o resultado não conta para a classificação.')}
        {campo('consistencia_pct', 'Consistência (%)', 'Fatia máxima do lucro que um dia pode valer. 0 = sem regra.')}
        {campo('dias_maximos', 'Dias máximos', 'Duração da conta. 0 = sem limite.')}
      </section>

      <div className="flex items-center gap-3">
        <Botao ocupado={ocupado === 'regras'}
          onClick={() => accao({ accao: 'torneio_regras', torneioId: torneio, regras: r }, 'regras')
            .then((j) => j && setAviso('Regras guardadas. Passam a valer na próxima leitura das contas.'))}>
          Guardar regras
        </Botao>
        <p className="text-xs text-gray-600">
          Alterar regras a meio de um torneio muda a prova a quem já está a competir.
        </p>
      </div>
    </div>
  )
}

/**
 * OS PROGRAMAS DE AVALIAÇÃO.
 *
 * Cada linha é um produto com preço real e um checkout Stripe do outro lado. Por isso o
 * preço mostra-se em EUROS e guarda-se em cêntimos: um campo em cêntimos convida a enganos de
 * um zero, e um zero a mais aqui é a diferença entre 199 € e 1990 € cobrados a alguém.
 *
 * As regras vão ao lado do preço de propósito. Um programa cujo objectivo é maior do que a
 * perda máxima é um programa impossível de passar, e isso só se vê quando as duas coisas
 * estão à vista uma da outra.
 */
interface Programa {
  id?: string; slug: string; nome: string; descricao: string | null
  fases: number; saldo: number; preco_cents: number; ativo: boolean; ordem: number
  regras: Record<string, number>
  stripe_price_id?: string | null
}

const PROGRAMA_NOVO: Programa = {
  slug: '', nome: '', descricao: null, fases: 1, saldo: 10000, preco_cents: 9900,
  ativo: true, ordem: 0,
  regras: { objetivo_pct: 8, perda_diaria_pct: 5, perda_maxima_pct: 10, dias_minimos: 5 },
}

function Programas({ accao, ocupado, setAviso, vendasAbertas }: {
  accao: Accao; ocupado: string | null; setAviso: (s: string | null) => void; vendasAbertas: boolean
}) {
  const [programas, setProgramas] = useState<Programa[]>([])
  const [compras, setCompras] = useState<Array<Record<string, unknown>>>([])
  const [editar, setEditar] = useState<Programa | null>(null)
  const [aCarregar, setACarregar] = useState(true)

  const carregar = useCallback(async () => {
    setACarregar(true)
    try {
      const r = await fetch('/api/admin/mtmfunded?vista=programas', { cache: 'no-store' })
      const j = await r.json()
      setProgramas(j.programas ?? [])
      setCompras(j.compras ?? [])
    } finally {
      setACarregar(false)
    }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const guardar = async (p: Programa) => {
    const j = await accao({ accao: 'programa_guardar', ...p }, `g${p.slug}`)
    if (j) { setEditar(null); setAviso('Programa guardado.'); carregar() }
  }

  if (aCarregar) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#D2A63C]" /></div>

  return (
    <div className="space-y-5">
      {!vendasAbertas && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-4 text-sm text-amber-300">
          As vendas estão fechadas no interruptor do Resumo. Os programas podem ser preparados
          aqui, mas o site mostra «Brevemente» e o checkout recusa — no servidor, não só no botão.
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200">Programas</h3>
        <Botao ocupado={false} onClick={() => setEditar({ ...PROGRAMA_NOVO })}>
          <span className="flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Novo</span>
        </Botao>
      </div>

      {!programas.length && !editar && (
        <p className="text-sm text-gray-500">Ainda não há programas. O /mtmfunded mostra o torneio enquanto assim for.</p>
      )}

      <div className="space-y-3">
        {programas.map((p) => (
          <div key={p.slug} className="rounded-xl border border-gray-800 bg-black/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-gray-100">
                  {p.nome}{' '}
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${p.ativo ? 'bg-emerald-500/15 text-emerald-400' : 'bg-gray-800 text-gray-500'}`}>
                    {p.ativo ? 'activo' : 'escondido'}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {(p.preco_cents / 100).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })} ·{' '}
                  {Number(p.saldo).toLocaleString('pt-PT')} USD · {p.fases} {p.fases === 1 ? 'fase' : 'fases'} ·{' '}
                  <code className="text-gray-600">{p.slug}</code>
                </p>
              </div>
              <div className="flex gap-2">
                <IconeBotao titulo="Editar" onClick={() => setEditar(p)}><Shield className="h-3.5 w-3.5" /></IconeBotao>
                <IconeBotao
                  titulo={p.ativo ? 'Esconder do site' : 'Mostrar no site'}
                  ocupado={ocupado === `e${p.slug}`}
                  perigo={p.ativo}
                  onClick={() => accao({ accao: 'programa_estado', slug: p.slug, ativo: !p.ativo }, `e${p.slug}`).then(carregar)}
                >
                  {p.ativo ? <Ban className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                </IconeBotao>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editar && <EditorPrograma programa={editar} ocupado={ocupado} onGuardar={guardar} onCancelar={() => setEditar(null)} />}

      {compras.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-200">Últimas compras</h3>
          <Tabela cabecalhos={['Email', 'Valor', 'Estado', 'Data']}>
            {compras.slice(0, 20).map((c) => (
              <tr key={String(c.id)} className="border-t border-gray-800/60">
                <td className="px-3 py-2 text-gray-300">{String(c.email ?? '—')}</td>
                <td className="px-3 py-2 text-gray-400">
                  {c.valor_cents ? (Number(c.valor_cents) / 100).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' }) : '—'}
                </td>
                <td className="px-3 py-2"><Estado valor={String(c.estado)} /></td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {new Date(String(c.created_at)).toLocaleDateString('pt-PT')}
                </td>
              </tr>
            ))}
          </Tabela>
        </section>
      )}
    </div>
  )
}

function EditorPrograma({ programa, ocupado, onGuardar, onCancelar }: {
  programa: Programa; ocupado: string | null
  onGuardar: (p: Programa) => void; onCancelar: () => void
}) {
  const [p, setP] = useState<Programa>(programa)
  useEffect(() => { setP(programa) }, [programa])

  // O preço vive aqui em EUROS e vai em cêntimos. É onde os enganos de um zero acontecem.
  const [euros, setEuros] = useState((programa.preco_cents / 100).toString())
  useEffect(() => { setEuros((programa.preco_cents / 100).toString()) }, [programa])

  const texto = (chave: 'slug' | 'nome' | 'descricao', rotulo: string, nota?: string) => (
    <div>
      <label className="text-sm text-gray-300">{rotulo}</label>
      {nota && <p className="mb-1 text-xs text-gray-600">{nota}</p>}
      <input
        value={(p[chave] as string) ?? ''}
        onChange={(e) => setP({ ...p, [chave]: e.target.value })}
        className="mt-1 w-full rounded-lg border border-gray-700 bg-black/50 px-3 py-2 text-sm text-white"
      />
    </div>
  )

  const numero = (chave: keyof Programa, rotulo: string, nota: string, passo = 1) => (
    <div>
      <label className="text-sm text-gray-300">{rotulo}</label>
      <p className="mb-1 text-xs text-gray-600">{nota}</p>
      <input
        type="number" step={passo}
        value={Number(p[chave] ?? 0)}
        onChange={(e) => setP({ ...p, [chave]: Number(e.target.value) } as Programa)}
        className="w-36 rounded-lg border border-gray-700 bg-black/50 px-3 py-2 text-sm text-white"
      />
    </div>
  )

  const regra = (chave: string, rotulo: string, nota: string) => (
    <div>
      <label className="text-sm text-gray-300">{rotulo}</label>
      <p className="mb-1 text-xs text-gray-600">{nota}</p>
      <input
        type="number" step="0.5"
        value={p.regras[chave] ?? 0}
        onChange={(e) => setP({ ...p, regras: { ...p.regras, [chave]: Number(e.target.value) } })}
        className="w-28 rounded-lg border border-gray-700 bg-black/50 px-3 py-2 text-sm text-white"
      />
    </div>
  )

  const impossivel =
    (p.regras.objetivo_pct ?? 0) > 0 && (p.regras.perda_maxima_pct ?? 0) > 0 &&
    (p.regras.perda_diaria_pct ?? 0) > (p.regras.perda_maxima_pct ?? 0)

  return (
    <div className="space-y-5 rounded-xl border border-[#D2A63C]/30 bg-black/40 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {texto('nome', 'Nome', 'É o que aparece no cartão do site.')}
        {texto('slug', 'Slug', 'Vai no endereço do checkout. Minúsculas e hífens.')}
      </div>
      {texto('descricao', 'Descrição', 'Uma linha, opcional.')}

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="text-sm text-gray-300">Preço (€)</label>
          <p className="mb-1 text-xs text-gray-600">Em euros. Guardado em cêntimos.</p>
          <input
            type="number" step="1" value={euros}
            onChange={(e) => {
              setEuros(e.target.value)
              setP({ ...p, preco_cents: Math.round(Number(e.target.value || 0) * 100) })
            }}
            className="w-36 rounded-lg border border-gray-700 bg-black/50 px-3 py-2 text-sm text-white"
          />
        </div>
        {numero('saldo', 'Saldo (USD)', 'O tamanho da conta simulada.', 1000)}
        {numero('fases', 'Fases', '1 ou 2. Raramente 3.')}
      </div>

      <section className="grid gap-4 rounded-lg border border-gray-800 p-4 sm:grid-cols-2">
        {regra('objetivo_pct', 'Objectivo (%)', 'Lucro que passa a fase.')}
        {regra('perda_diaria_pct', 'Perda diária (%)', 'Sobre a equity de abertura do dia.')}
        {regra('perda_maxima_pct', 'Perda máxima (%)', 'Sobre o saldo inicial.')}
        {regra('dias_minimos', 'Dias mínimos', 'Abaixo disto não passa.')}
        {regra('consistencia_pct', 'Consistência (%)', 'Fatia máxima do lucro num só dia. 0 = sem regra.')}
      </section>

      {impossivel && (
        <p className="flex items-center gap-2 text-sm text-amber-400">
          <AlertTriangle className="h-4 w-4" />
          A perda diária é maior do que a máxima — a regra diária nunca chegaria a disparar.
        </p>
      )}

      <div className="flex items-center gap-3">
        <Botao ocupado={ocupado === `g${p.slug}`} onClick={() => onGuardar(p)}>Guardar</Botao>
        <button onClick={onCancelar} className="text-xs text-gray-500 hover:text-gray-300">Cancelar</button>
      </div>
    </div>
  )
}

/**
 * LEVANTAMENTOS.
 *
 * O painel mostra os PRINTS ao lado do UID, porque é essa a conferência que interessa fazer:
 * o número que o trader escreveu tem de bater certo com o que a corretora lhe mostrou. Um
 * pagamento em cripto para um endereço errado não se recupera, e o print é a única prova de
 * onde o endereço veio.
 *
 * «Pago» só depois de «aprovado». Um estado que salta a revisão transformava um pedido
 * acabado de chegar em pagamento feito com um clique errado.
 */
interface Levantamento {
  id: string
  valor_usd: number
  uid_broker: string
  endereco_cripto: string | null
  estado: string
  motivo: string | null
  criado_em: string
  pessoa: { nome: string; email: string } | null
  conta: { login: string | null; saldoInicial: number } | null
  comprovativosUrl: string[]
}

function LevantamentosAdmin({ accao, ocupado, setAviso }: {
  accao: Accao; ocupado: string | null; setAviso: (s: string | null) => void
}) {
  const [linhas, setLinhas] = useState<Levantamento[]>([])
  const [aCarregar, setACarregar] = useState(true)
  const [motivo, setMotivo] = useState<Record<string, string>>({})

  const carregar = useCallback(async () => {
    setACarregar(true)
    try {
      const r = await fetch('/api/admin/mtmfunded?vista=levantamentos', { cache: 'no-store' })
      const j = await r.json()
      setLinhas(j.levantamentos ?? [])
    } finally {
      setACarregar(false)
    }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const mudar = (l: Levantamento, estado: string) =>
    accao({ accao: 'levantamento_estado', id: l.id, estado, motivo: motivo[l.id] }, `l${l.id}`)
      .then((j) => { if (j) { setAviso(`Pedido marcado como ${estado}.`); carregar() } })

  if (aCarregar) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#D2A63C]" /></div>
  if (!linhas.length) return <p className="text-sm text-gray-500">Ainda não há pedidos de levantamento.</p>

  const emEspera = linhas.filter((l) => ['pedido', 'em_analise', 'aprovado'].includes(l.estado))

  return (
    <div className="space-y-5">
      {emEspera.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-4 text-sm text-amber-300">
          {emEspera.length} {emEspera.length === 1 ? 'pedido à espera' : 'pedidos à espera'} de decisão.
        </div>
      )}

      {linhas.map((l) => (
        <div key={l.id} className="rounded-xl border border-gray-800 bg-black/30 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-lg font-bold text-[#D2A63C]">
                {Number(l.valor_usd).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} USD
              </p>
              <p className="mt-1 text-sm text-gray-200">{l.pessoa?.nome ?? '—'}</p>
              <p className="text-xs text-gray-500">{l.pessoa?.email ?? '—'}</p>
              <p className="mt-2 text-xs text-gray-500">
                Conta MT5 {l.conta?.login ?? '—'} · pedido em{' '}
                {new Date(l.criado_em).toLocaleDateString('pt-PT')}
              </p>
            </div>
            <div className="text-right">
              <Estado valor={l.estado} />
              <p className="mt-2 font-mono text-sm text-gray-200">UID {l.uid_broker}</p>
              {l.endereco_cripto && (
                <p className="mt-1 max-w-xs break-all font-mono text-[10px] text-gray-600">
                  {l.endereco_cripto}
                </p>
              )}
            </div>
          </div>

          {/* Os prints: é aqui que se confere o endereço contra o que a corretora mostrou. */}
          {l.comprovativosUrl.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {l.comprovativosUrl.map((u, i) => (
                <a
                  key={i}
                  href={u}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:border-[#D2A63C]/50"
                >
                  <ExternalLink className="h-3 w-3" /> Print {i + 1}
                </a>
              ))}
            </div>
          )}

          {l.motivo && <p className="mt-3 text-xs text-red-400">{l.motivo}</p>}

          {!['pago', 'recusado'].includes(l.estado) && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-800 pt-4">
              {l.estado === 'pedido' && (
                <Botao ocupado={ocupado === `l${l.id}`} onClick={() => mudar(l, 'em_analise')}>
                  Em análise
                </Botao>
              )}
              {l.estado !== 'aprovado' && (
                <Botao ocupado={ocupado === `l${l.id}`} onClick={() => mudar(l, 'aprovado')}>
                  Aprovar
                </Botao>
              )}
              {l.estado === 'aprovado' && (
                <Botao ocupado={ocupado === `l${l.id}`} onClick={() => mudar(l, 'pago')}>
                  Marcar como pago
                </Botao>
              )}
              <input
                placeholder="Motivo da recusa"
                value={motivo[l.id] ?? ''}
                onChange={(e) => setMotivo({ ...motivo, [l.id]: e.target.value })}
                className="min-w-[180px] flex-1 rounded-lg border border-gray-700 bg-black/50 px-3 py-1.5 text-xs text-white"
              />
              <IconeBotao
                titulo="Recusar"
                perigo
                ocupado={ocupado === `l${l.id}`}
                onClick={() => mudar(l, 'recusado')}
              >
                <Ban className="h-3.5 w-3.5" />
              </IconeBotao>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── peças ────────────────────────────────────────────────────────────────────

function Tabela({ cabecalhos, children }: { cabecalhos: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-black/40 text-xs uppercase tracking-wider text-gray-500">
          <tr>{cabecalhos.map((c, i) => <th key={i} className="px-3 py-2">{c}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Estado({ valor }: { valor: string }) {
  const cores: Record<string, string> = {
    ativa: 'text-emerald-400', ativo: 'text-emerald-400',
    quebrada: 'text-red-400', quebrado: 'text-red-400', desclassificado: 'text-red-400',
    pedida: 'text-amber-400', inscrito: 'text-gray-400',
    pedido: 'text-amber-400', em_analise: 'text-amber-400',
    aprovado: 'text-blue-400', pago: 'text-emerald-400', recusado: 'text-red-400',
  }
  return <span className={cores[valor] ?? 'text-gray-400'}>{valor}</span>
}

function Interruptor({ titulo, nota, ligado, aoMudar, ocupado, desativado }: {
  titulo: string; nota: string; ligado: boolean
  aoMudar: (v: boolean) => void; ocupado?: boolean; desativado?: boolean
}) {
  return (
    <div className={`flex items-start justify-between gap-4 ${desativado ? 'opacity-40' : ''}`}>
      <div>
        <p className="text-sm font-medium text-gray-200">{titulo}</p>
        <p className="mt-0.5 text-xs text-gray-500">{nota}</p>
      </div>
      <button type="button" disabled={ocupado || desativado} onClick={() => aoMudar(!ligado)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${ligado ? 'bg-emerald-500' : 'bg-gray-700'} disabled:cursor-not-allowed`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${ligado ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  )
}

function Cartao({ icone: Icone, titulo, valor, alerta }: { icone: typeof Users; titulo: string; valor: number; alerta?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${alerta ? 'border-amber-500/30 bg-amber-500/[0.04]' : 'border-gray-800 bg-black/30'}`}>
      <div className="flex items-center gap-2 text-xs text-gray-500"><Icone className="h-3.5 w-3.5" /> {titulo}</div>
      <p className={`mt-1 text-2xl font-bold ${alerta ? 'text-amber-400' : 'text-gray-100'}`}>{valor}</p>
    </div>
  )
}

function Botao({ children, onClick, ocupado }: { children: React.ReactNode; onClick: () => void; ocupado?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={ocupado}
      className="rounded-lg bg-[#D2A63C] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50">
      {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : children}
    </button>
  )
}

function IconeBotao({ children, onClick, ocupado, titulo, perigo }: {
  children: React.ReactNode; onClick: () => void; ocupado?: boolean; titulo: string; perigo?: boolean
}) {
  return (
    <button type="button" onClick={onClick} disabled={ocupado} title={titulo}
      className={`rounded border px-2 py-1 disabled:opacity-40 ${
        perigo ? 'border-red-500/30 text-red-400 hover:bg-red-500/10' : 'border-gray-700 text-gray-300 hover:border-gray-500'
      }`}>
      {ocupado ? <Loader2 className="h-3 w-3 animate-spin" /> : children}
    </button>
  )
}
