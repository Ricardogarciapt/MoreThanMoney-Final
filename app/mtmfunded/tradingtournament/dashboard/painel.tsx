'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  LayoutDashboard, Wallet, FileText, Trophy, ListOrdered,
  LineChart, Award, MessageSquare, Bot, ShieldAlert,
} from 'lucide-react'

/**
 * As sete secções do participante, no formato da barra lateral que o Ricardo mostrou.
 *
 * A comunidade são os CHATS DA APP, não um Discord: mais um sítio para ninguém ir não é
 * comunidade. O apoio é IA, e diz que é IA — deixar a pessoa julgar que fala com alguém e
 * descobrir depois que não custa mais confiança do que a que poupa.
 */

interface Torneio {
  slug: string; nome: string; estado: string; comecaEm: string; acabaEm: string
  saldoInicial: number; regras: Record<string, number>
  premios: Array<{ posicao: number; premio: string }>
}
interface Participante {
  estado: string; posicao: number | null; resultadoPct: number | null
  metricas: Record<string, unknown>
}
interface Conta {
  id: string; tipo: string; login: string | null; servidor: string | null
  saldoInicial: number | null; alavancagem: number | null; estado: string
  metricas: Record<string, unknown>; quebrouRegra: string | null
}
interface Certificado { codigo: string; tipo: string; posicao: number | null; emitidoEm: string }
interface LinhaTabela { posicao: number | null; nome: string; resultadoPct: number | null; estado: string; elegivel: boolean }

const SECCOES = [
  { id: 'dashboard', nome: 'Dashboard', icone: LayoutDashboard },
  { id: 'contas', nome: 'Contas de Trading', icone: Wallet },
  { id: 'contratos', nome: 'Contratos', icone: FileText },
  { id: 'competicoes', nome: 'Competições', icone: Trophy },
  { id: 'classificacao', nome: 'Classificação', icone: ListOrdered },
  { id: 'terminal', nome: 'Terminal MTM', icone: LineChart },
  { id: 'certificados', nome: 'Certificados', icone: Award },
] as const

type SeccaoId = (typeof SECCOES)[number]['id'] | 'comunidade' | 'apoio'

export default function PainelParticipante(props: {
  nome: string
  papel: string
  scannersPermitidos: string[] | null
  torneio: Torneio | null
  participante: Participante | null
  contas: Conta[]
  certificados: Certificado[]
  classificacao: LinhaTabela[]
}) {
  const [seccao, setSeccao] = useState<SeccaoId>('dashboard')
  const { torneio, participante, contas, certificados, classificacao } = props

  return (
    <div className="min-h-screen bg-[#050608] text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 lg:flex-row">
        {/* Barra lateral */}
        <aside className="lg:w-60 lg:shrink-0">
          <div className="mb-5">
            <p className="text-xs uppercase tracking-[0.25em] text-[#4B8BFF]">MTM</p>
            <p className="mt-1 text-sm text-zinc-400">Olá, {props.nome.split(' ')[0]}</p>
          </div>
          <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {SECCOES.map((s) => {
              const Icone = s.icone
              const ativa = seccao === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => setSeccao(s.id)}
                  className={`flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    ativa ? 'bg-[#4B8BFF]/10 text-[#4B8BFF]' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Icone className="h-4 w-4" />
                  <span className="whitespace-nowrap">{s.nome}</span>
                </button>
              )
            })}
          </nav>

          {/*
            Comunidade e Apoio vivem DENTRO do painel, e não como ligações para /app-mobile e
            /aimtm. Um participante de torneio não é membro: o middleware trava-o nessas rotas
            e atira-o para o registo — o que, além de o confundir, lhe diz que há ali algo que
            ele não pode ver. O chat é o canal do torneio; o apoio é um assistente próprio.
          */}
          <div className="mt-6 space-y-1 border-t border-zinc-900 pt-4">
            {([
              { id: 'comunidade' as const, nome: 'Comunidade', icone: MessageSquare },
              { id: 'apoio' as const, nome: 'Apoio', icone: Bot },
            ]).map((s2) => {
              const Icone = s2.icone
              const ativa = seccao === s2.id
              return (
                <button
                  key={s2.id}
                  onClick={() => setSeccao(s2.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    ativa ? 'bg-[#4B8BFF]/10 text-[#4B8BFF]' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Icone className="h-4 w-4" /> {s2.nome}
                </button>
              )
            })}
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {seccao === 'dashboard' && <Dashboard {...{ torneio, participante, contas }} />}
          {seccao === 'contas' && <Contas contas={contas} />}
          {seccao === 'contratos' && <Contratos />}
          {seccao === 'competicoes' && <Competicoes torneio={torneio} participante={participante} />}
          {seccao === 'classificacao' && <Classificacao linhas={classificacao} />}
          {seccao === 'terminal' && <Terminal scanners={props.scannersPermitidos} />}
          {seccao === 'certificados' && <Certificados certificados={certificados} />}
          {seccao === 'comunidade' && <Comunidade />}
          {seccao === 'apoio' && <Apoio />}
        </main>
      </div>
    </div>
  )
}

function Caixa({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-5">
      <h2 className="text-base font-semibold">{titulo}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-zinc-500">{children}</p>
}

function Dashboard({ torneio, participante, contas }: { torneio: Torneio | null; participante: Participante | null; contas: Conta[] }) {
  const conta = contas.find((c) => c.tipo === 'torneio') ?? contas[0]
  const m = participante?.metricas ?? {}
  const margemDiaria = typeof m.margemDiaria === 'number' ? m.margemDiaria : null
  const margemTotal = typeof m.margemTotal === 'number' ? m.margemTotal : null

  if (!torneio) return <Caixa titulo="Dashboard"><Vazio>Não há torneio a decorrer.</Vazio></Caixa>
  if (!participante) {
    return (
      <Caixa titulo={torneio.nome}>
        <Vazio>Ainda não estás inscrito.</Vazio>
        <Link href="/mtmfunded/tradingtournament" className="mt-4 inline-block rounded-lg bg-[#4B8BFF] px-5 py-2.5 text-sm font-semibold">
          Ver o torneio
        </Link>
      </Caixa>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Metrica titulo="Posição" valor={participante.posicao ? `${participante.posicao}.º` : '—'} />
        <Metrica
          titulo="Resultado"
          valor={participante.resultadoPct == null ? '—' : `${participante.resultadoPct > 0 ? '+' : ''}${participante.resultadoPct.toFixed(2)}%`}
          cor={participante.resultadoPct == null ? undefined : participante.resultadoPct >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
        <Metrica titulo="Estado" valor={participante.estado === 'quebrado' ? 'Conta quebrada' : participante.estado === 'ativo' ? 'Em prova' : 'Inscrito'} />
      </div>

      {/* As margens são o que evita que alguém quebre sem perceber. Mostrar o resultado sem
          mostrar quanto falta para o chão é dar metade da informação que importa. */}
      {(margemDiaria != null || margemTotal != null) && participante.estado !== 'quebrado' && (
        <Caixa titulo="Quanto falta até quebrar">
          <div className="grid gap-3 sm:grid-cols-2">
            {margemDiaria != null && <Barra rotulo="Perda diária" restante={margemDiaria} />}
            {margemTotal != null && <Barra rotulo="Perda máxima" restante={margemTotal} />}
          </div>
        </Caixa>
      )}

      {participante.estado === 'quebrado' && (
        <div className="flex gap-3 rounded-2xl border border-red-500/30 bg-red-500/[0.05] p-5">
          <ShieldAlert className="h-5 w-5 shrink-0 text-red-400" />
          <div>
            <p className="font-semibold text-red-400">A conta foi quebrada</p>
            <p className="mt-1 text-sm text-zinc-400">
              {conta?.quebrouRegra === 'perda_maxima'
                ? 'Foi atingida a perda máxima total.'
                : conta?.quebrouRegra === 'perda_diaria'
                  ? 'Foi atingida a perda diária.'
                  : 'O prazo terminou.'}{' '}
              As métricas ficaram congeladas no momento em que aconteceu.
            </p>
          </div>
        </div>
      )}

      {conta && (
        <Caixa titulo="A tua conta">
          <Linha rotulo="Login" valor={conta.login ?? 'a emitir'} />
          <Linha rotulo="Servidor" valor={conta.servidor ?? '—'} />
          <Linha rotulo="Saldo inicial" valor={conta.saldoInicial ? `${conta.saldoInicial.toLocaleString('pt-PT')} USD` : '—'} />
          {!conta.login && (
            <p className="mt-3 text-xs text-zinc-500">
              A conta está a ser emitida. Recebes os dados por email assim que estiver pronta.
            </p>
          )}
        </Caixa>
      )}
    </div>
  )
}

function Metrica({ titulo, valor, cor }: { titulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-5">
      <p className="text-xs uppercase tracking-widest text-zinc-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-bold ${cor ?? ''}`}>{valor}</p>
    </div>
  )
}

function Barra({ rotulo, restante }: { rotulo: string; restante: number }) {
  const perto = restante <= 0
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-zinc-400">{rotulo}</span>
        <span className={perto ? 'text-red-400' : 'text-zinc-300'}>
          {restante.toLocaleString('pt-PT', { maximumFractionDigits: 2 })} USD
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-900">
        <div className={`h-full ${perto ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: perto ? '100%' : '35%' }} />
      </div>
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between border-b border-zinc-900 py-2 text-sm last:border-0">
      <span className="text-zinc-500">{rotulo}</span>
      <span className="font-medium">{valor}</span>
    </div>
  )
}

function Contas({ contas }: { contas: Conta[] }) {
  if (!contas.length) return <Caixa titulo="Contas de Trading"><Vazio>Ainda não tens contas.</Vazio></Caixa>
  return (
    <div className="space-y-4">
      {contas.map((c) => (
        <Caixa key={c.id} titulo={`${c.tipo === 'torneio' ? 'Torneio' : c.tipo === 'desafio' ? 'Desafio' : 'Financiada'} · ${c.login ?? 'a emitir'}`}>
          <Linha rotulo="Servidor" valor={c.servidor ?? '—'} />
          <Linha rotulo="Saldo inicial" valor={c.saldoInicial ? `${c.saldoInicial.toLocaleString('pt-PT')} USD` : '—'} />
          <Linha rotulo="Alavancagem" valor={c.alavancagem ? `1:${c.alavancagem}` : '—'} />
          <Linha rotulo="Estado" valor={c.estado} />
          {typeof c.metricas.equity === 'number' && (
            <Linha rotulo="Equity" valor={`${(c.metricas.equity as number).toLocaleString('pt-PT')} USD`} />
          )}
        </Caixa>
      ))}
    </div>
  )
}

function Contratos() {
  return (
    <Caixa titulo="Contratos">
      <Vazio>
        Os contratos aparecem aqui quando venceres um torneio ou passares a ter uma conta
        financiada da MTM.
      </Vazio>
    </Caixa>
  )
}

function Competicoes({ torneio, participante }: { torneio: Torneio | null; participante: Participante | null }) {
  if (!torneio) return <Caixa titulo="Competições"><Vazio>Sem torneios abertos.</Vazio></Caixa>
  const d = (v: string) => new Date(v).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' })
  return (
    <Caixa titulo={torneio.nome}>
      <Linha rotulo="Estado" valor={participante ? 'Inscrito' : torneio.estado === 'inscricoes' ? 'Inscrições abertas' : torneio.estado} />
      <Linha rotulo="Decorre" valor={`${d(torneio.comecaEm)} — ${d(torneio.acabaEm)}`} />
      <Linha rotulo="Conta" valor={`${torneio.saldoInicial.toLocaleString('pt-PT')} USD`} />
      {torneio.premios.length > 0 && (
        <div className="mt-4 space-y-2">
          {torneio.premios.map((p) => (
            <div key={p.posicao} className="rounded-lg border border-[#D2A63C]/20 bg-[#D2A63C]/[0.04] px-3 py-2 text-sm">
              <span className="text-[#D2A63C]">{p.posicao}.º</span> · {p.premio}
            </div>
          ))}
        </div>
      )}
      {!participante && torneio.estado === 'inscricoes' && (
        <Link href="/mtmfunded/tradingtournament" className="mt-4 inline-block rounded-lg bg-[#4B8BFF] px-5 py-2.5 text-sm font-semibold">
          Inscrever-me
        </Link>
      )}
    </Caixa>
  )
}

function Classificacao({ linhas }: { linhas: LinhaTabela[] }) {
  if (!linhas.length) return <Caixa titulo="Classificação"><Vazio>Ainda sem classificados.</Vazio></Caixa>
  return (
    <Caixa titulo="Classificação">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-zinc-500">
            <tr><th className="py-2">#</th><th className="py-2">Trader</th><th className="py-2 text-right">Resultado</th></tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {linhas.map((l, i) => (
              <tr key={i} className={l.estado === 'quebrado' ? 'opacity-50' : ''}>
                <td className="py-2.5 font-mono text-zinc-500">{l.posicao ?? '—'}</td>
                <td className="py-2.5">{l.nome}</td>
                <td className={`py-2.5 text-right font-mono ${l.resultadoPct == null ? 'text-zinc-600' : l.resultadoPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {l.resultadoPct == null ? '—' : `${l.resultadoPct > 0 ? '+' : ''}${l.resultadoPct.toFixed(2)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-zinc-600">Actualiza de hora a hora.</p>
    </Caixa>
  )
}

function Terminal({ scanners }: { scanners: string[] | null }) {
  return (
    <Caixa titulo="Terminal MTM">
      <p className="text-sm text-zinc-400">
        Gráficos e scanners da MTM.{' '}
        {scanners
          ? `Com a tua inscrição tens acesso ao scanner ${scanners.join(', ')}.`
          : 'Tens acesso a todos os scanners.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/mtm-terminal" className="rounded-lg bg-[#4B8BFF] px-5 py-2.5 text-sm font-semibold">
          Abrir Terminal
        </Link>
        <Link href="/scanner-access" className="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm text-zinc-300">
          Scanners
        </Link>
      </div>
      {scanners && (
        <p className="mt-3 text-xs text-zinc-600">
          Os restantes scanners e os alertas MTM fazem parte da subscrição de membro.
        </p>
      )}
    </Caixa>
  )
}

function Certificados({ certificados }: { certificados: Certificado[] }) {
  if (!certificados.length) {
    return (
      <Caixa titulo="Certificados">
        <Vazio>Os certificados são emitidos no fim do torneio — participação para todos os que negociaram.</Vazio>
      </Caixa>
    )
  }
  const nomes: Record<string, string> = {
    participacao: 'Participação', classificacao: 'Classificação',
    desafio: 'Desafio concluído', financiado: 'Trader financiado', payout: 'Pagamento',
  }
  return (
    <div className="space-y-3">
      {certificados.map((c) => (
        <div key={c.codigo} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/50 p-4">
          <div>
            <p className="font-medium">
              {nomes[c.tipo] ?? c.tipo}
              {c.posicao ? ` · ${c.posicao}.º lugar` : ''}
            </p>
            <p className="mt-0.5 font-mono text-xs text-zinc-500">{c.codigo}</p>
          </div>
          <Link href={`/mtmfunded/certificado/${c.codigo}`} className="rounded-lg border border-[#D2A63C]/40 px-4 py-2 text-sm text-[#D2A63C]">
            Ver
          </Link>
        </div>
      ))}
    </div>
  )
}

/**
 * Comunidade: o canal do torneio, replicado aqui.
 *
 * Não é o chat dos membros. A rota serve um canal de uma allowlist fixa — o canal nunca vem
 * do pedido, senão bastava mudar uma palavra para ler o chat Premium com uma inscrição
 * gratuita.
 */
function Comunidade() {
  const [mensagens, setMensagens] = useState<Array<{ id: string; texto: string; autor: string; quando: string; meu: boolean }>>([])
  const [texto, setTexto] = useState('')
  const [aCarregar, setACarregar] = useState(true)

  const carregar = async () => {
    try {
      const { getAccessToken } = await import('@/lib/auth-token')
      const t = await getAccessToken()
      const r = await fetch('/api/mtmfunded/chat', { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' })
      const j = await r.json()
      setMensagens(j?.mensagens ?? [])
    } catch { /* silencioso */ } finally { setACarregar(false) }
  }

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 20_000)
    return () => clearInterval(t)
  }, [])

  const enviar = async () => {
    const t = texto.trim()
    if (!t) return
    setTexto('')
    try {
      const { getAccessToken } = await import('@/lib/auth-token')
      const tok = await getAccessToken()
      await fetch('/api/mtmfunded/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ texto: t }),
      })
      carregar()
    } catch { setTexto(t) }
  }

  return (
    <Caixa titulo="Comunidade do torneio">
      <div className="max-h-[420px] space-y-3 overflow-y-auto">
        {aCarregar && <Vazio>A carregar…</Vazio>}
        {!aCarregar && !mensagens.length && <Vazio>Ainda ninguém escreveu. Começa tu.</Vazio>}
        {mensagens.map((m) => (
          <div key={m.id} className={m.meu ? 'text-right' : ''}>
            <p className="text-xs text-zinc-600">{m.autor}</p>
            <p className={`mt-0.5 inline-block rounded-lg px-3 py-2 text-sm ${m.meu ? 'bg-[#4B8BFF]/15 text-white' : 'bg-zinc-900 text-zinc-200'}`}>
              {m.texto}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && enviar()}
          placeholder="Escreve à comunidade…"
          className="flex-1 rounded-lg border border-zinc-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[#4B8BFF]"
        />
        <button onClick={enviar} className="rounded-lg bg-[#4B8BFF] px-4 py-2 text-sm font-semibold">Enviar</button>
      </div>
    </Caixa>
  )
}

/**
 * Apoio: assistente PRÓPRIO do torneio.
 *
 * Independente do assistente dos membros de propósito. Aquele conhece sinais, scanners e
 * planos — coisas que um participante de torneio não pode abrir. Um assistente que fala do
 * que a pessoa não tem acesso ensina-a a pedir o que lhe vai ser negado.
 */
function Apoio() {
  const [fio, setFio] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [texto, setTexto] = useState('')
  const [aPensar, setAPensar] = useState(false)

  const perguntar = async () => {
    const t = texto.trim()
    if (!t || aPensar) return
    setTexto('')
    const novo = [...fio, { role: 'user' as const, content: t }]
    setFio(novo)
    setAPensar(true)
    try {
      const { getAccessToken } = await import('@/lib/auth-token')
      const tok = await getAccessToken()
      const r = await fetch('/api/mtmfunded/apoio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ mensagem: t, historico: fio }),
      })
      const j = await r.json()
      setFio([...novo, { role: 'assistant', content: j?.resposta ?? j?.error ?? 'Não consegui responder.' }])
    } catch {
      setFio([...novo, { role: 'assistant', content: 'O apoio não respondeu. Tenta outra vez.' }])
    } finally {
      setAPensar(false)
    }
  }

  return (
    <Caixa titulo="Apoio">
      <p className="text-xs text-zinc-600">
        Assistente do torneio. Sabe das regras, da conta e do MetaTrader — não dá conselho de
        investimento nem diz o que negociar.
      </p>
      <div className="mt-4 max-h-[380px] space-y-3 overflow-y-auto">
        {!fio.length && <Vazio>Pergunta o que precisares sobre o torneio.</Vazio>}
        {fio.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
            <p className={`inline-block whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'bg-[#4B8BFF]/15 text-white' : 'bg-zinc-900 text-zinc-200'}`}>
              {m.content}
            </p>
          </div>
        ))}
        {aPensar && <Vazio>A escrever…</Vazio>}
      </div>
      <div className="mt-4 flex gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && perguntar()}
          placeholder="A tua pergunta…"
          className="flex-1 rounded-lg border border-zinc-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[#4B8BFF]"
        />
        <button onClick={perguntar} disabled={aPensar} className="rounded-lg bg-[#4B8BFF] px-4 py-2 text-sm font-semibold disabled:opacity-50">
          Perguntar
        </button>
      </div>
    </Caixa>
  )
}
