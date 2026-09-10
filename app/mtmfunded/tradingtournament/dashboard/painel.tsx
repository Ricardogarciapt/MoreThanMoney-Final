'use client'

import { useState } from 'react'
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

type SeccaoId = (typeof SECCOES)[number]['id']

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

          <div className="mt-6 space-y-1 border-t border-zinc-900 pt-4">
            <Link href="/app-mobile" className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-zinc-400 hover:text-white">
              <MessageSquare className="h-4 w-4" /> Comunidade
            </Link>
            <Link href="/aimtm" className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-zinc-400 hover:text-white">
              <Bot className="h-4 w-4" /> Apoio (IA)
            </Link>
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
