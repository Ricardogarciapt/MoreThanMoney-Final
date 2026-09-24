'use client'

import { useCallback, useEffect, useState } from 'react'
import { tipoCurto, estadoCurto, COR_DO_ESTADO } from '@/lib/mtmfunded/etiquetas'
import Link from 'next/link'
import {
  LayoutDashboard, Wallet, FileText, Trophy, ListOrdered,
  LineChart, Award, MessageSquare, Bot, ShieldAlert, Banknote, Settings, Pencil, Check,
} from 'lucide-react'
// 113 — a etiqueta do dono: a MESMA normalização e o MESMO limite do lápis do WebTrader.
import { ETIQUETA_MAX, normalizarEtiqueta } from '@/lib/contas/etiqueta'
import { PALAVRA_SEM_LOGIN } from '@/lib/mtmfunded/apagar-conta'
import dynamic from 'next/dynamic'
import { Contratos, Levantamentos } from '@/components/mtmfunded/contratos-e-levantamentos'
import { useT } from '@/components/i18n-provider'
import ModalMetricas from '@/components/mtmfunded/modal-metricas'
import { inscricoesAbertas } from '@/lib/mtmfunded/inscricoes'
import CredenciaisConta from '@/components/funded/credenciais-conta'

/**
 * O painel de admin aqui é o MESMO componente do /admin, e não uma cópia.
 *
 * É o que garante que nunca dessincroniza: qualquer botão que se acrescente no /admin aparece
 * aqui no mesmo instante, porque é literalmente o mesmo ficheiro a falar com a mesma rota.
 * Duas implementações do mesmo painel divergem sempre — e quando divergem, uma delas mostra
 * dados errados sobre contas e pagamentos reais.
 *
 * Carregado à parte: é pesado, e quase ninguém que abre este painel é admin.
 */
const MtmFundedManager = dynamic(() => import('@/components/admin/mtmfunded-manager'), {
  loading: () => <p className="p-6 text-sm text-zinc-500">A abrir o painel de admin…</p>,
})
import {
  CamposConta, DADOS_CONTA_VAZIOS, dadosContaCompletos, type DadosConta,
} from '@/components/mtmfunded/campos-conta'

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
  /** O QR do MetaTrader, em data URI. Entra na app com um toque. */
  qrcode: string | null
  /**
   * 113 — A ETIQUETA DO DONO: o nome que ele deu à conta. É a MESMA coluna
   * (`mtm_trading_accounts.etiqueta`) e a MESMA rota (PATCH /api/contas/etiqueta) do lápis do
   * WebTrader, para uma etiqueta posta lá aparecer aqui e ao contrário. `null` = sem etiqueta,
   * e então mostra-se o que este painel sempre mostrou (tipo · login).
   */
  etiquetaDoDono: string | null
}
interface Certificado { codigo: string; tipo: string; posicao: number | null; emitidoEm: string }
interface LinhaTabela { posicao: number | null; nome: string; resultadoPct: number | null; estado: string; elegivel: boolean }

/**
 * As secções traduzem-se pelo DICIONÁRIO. O Google Translate mudava o nome dos separadores
 * entre visitas e traduzia «Terminal MTM», que é um nome de produto e não uma palavra.
 */
const SECCOES = [
  { id: 'dashboard', chave: 'mtmfunded.painel.dashboard', icone: LayoutDashboard },
  { id: 'contas', chave: 'mtmfunded.painel.contas', icone: Wallet },
  { id: 'contratos', chave: 'mtmfunded.painel.contratos', icone: FileText },
  { id: 'levantamentos', chave: 'mtmfunded.painel.levantamentos', icone: Banknote },
  { id: 'competicoes', chave: 'mtmfunded.painel.competicoes', icone: Trophy },
  { id: 'classificacao', chave: 'mtmfunded.painel.classificacao', icone: ListOrdered },
  { id: 'terminal', chave: 'mtmfunded.painel.terminal', icone: LineChart },
  { id: 'certificados', chave: 'mtmfunded.painel.certificados', icone: Award },
] as const

type SeccaoId = (typeof SECCOES)[number]['id'] | 'comunidade' | 'apoio' | 'admin'

export default function PainelParticipante(props: {
  nome: string
  /** Admin vê, aqui mesmo, o painel de gestão do MTM Funded e dos torneios. */
  ehAdmin?: boolean
  perfil?: { telefone: string | null; dataNascimento: string | null; pais: string | null }
  papel: string
  scannersPermitidos: string[] | null
  torneio: Torneio | null
  participante: Participante | null
  contas: Conta[]
  certificados: Certificado[]
  classificacao: LinhaTabela[]
}) {
  const t = useT()
  const [seccao, setSeccao] = useState<SeccaoId>('dashboard')

  /**
   * O email da conta traz `?conta=<id>&credenciais=1`.
   *
   * Abre-se logo em Contas de Trading, com as credenciais daquela conta à vista. O link do
   * email prometia a password no painel; deixá-lo cair na raiz obrigava a pessoa a procurá-la
   * — e a maior parte não procura, escreve a perguntar.
   */
  const [contaAberta, setContaAberta] = useState<string | null>(null)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (q.get('credenciais') === '1') {
      setSeccao('contas')
      setContaAberta(q.get('conta'))
    }
  }, [])
  const { torneio, participante, contas, certificados, classificacao } = props

  return (
    <div className="min-h-screen bg-[#050608] text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 lg:flex-row">
        {/* Barra lateral */}
        <aside className="lg:w-60 lg:shrink-0">
          <div className="mb-5">
            <p className="text-xs uppercase tracking-[0.25em] text-[#4B8BFF]">MTM</p>
            <p className="mt-1 text-sm text-zinc-400">{t('mtmfunded.painel.ola')}, {props.nome.split(' ')[0]}</p>
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
                  <span className="whitespace-nowrap">{t(s.chave)}</span>
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
              { id: 'comunidade' as const, nome: t('mtmfunded.painel.comunidade'), icone: MessageSquare },
              { id: 'apoio' as const, nome: t('mtmfunded.painel.apoio'), icone: Bot },
              ...(props.ehAdmin ? [{ id: 'admin' as const, nome: t('mtmfunded.painel.admin'), icone: Settings }] : []),
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
          {seccao === 'dashboard' && <Dashboard {...{ torneio, participante, contas }} nome={props.nome} perfil={props.perfil} />}
          {seccao === 'contas' && <Contas contas={contas} abrir={contaAberta} ehAdmin={props.ehAdmin === true} />}
          {seccao === 'contratos' && <Contratos />}
          {seccao === 'levantamentos' && <Levantamentos irParaContrato={() => setSeccao('contratos')} />}
          {seccao === 'competicoes' && <Competicoes torneio={torneio} participante={participante} onInscrever={() => setSeccao('dashboard')} />}
          {seccao === 'classificacao' && <Classificacao linhas={classificacao} />}
          {seccao === 'terminal' && <Terminal scanners={props.scannersPermitidos} />}
          {seccao === 'certificados' && <Certificados certificados={certificados} />}
          {seccao === 'comunidade' && <Comunidade />}
          {seccao === 'apoio' && <Apoio />}
          {seccao === 'admin' && props.ehAdmin && (
            <div className="overflow-hidden rounded-2xl border border-[#D2A63C]/25 bg-zinc-950/50">
              <div className="border-b border-zinc-900 px-6 py-4">
                <p className="text-sm font-semibold text-[#D2A63C]">MTM Funded & Torneios</p>
                <p className="mt-0.5 text-xs text-zinc-600">
                  O mesmo painel do /admin — o que mudares aqui muda lá, e ao contrário.
                </p>
              </div>
              <MtmFundedManager />
            </div>
          )}
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

/**
 * A INSCRIÇÃO.
 *
 * Pedem-se três coisas, e só três: o nome que aparece na classificação, o telemóvel e a data
 * de nascimento. As duas últimas não são burocracia nossa — são o que a corretora exige no
 * formulário da conta. Sem telemóvel o botão dela fica cinzento; a data vem preenchida com
 * hoje e é recusada. O agente tem valores por omissão para não ficar parado, mas usá-los
 * significava abrir uma conta em nome desta pessoa com um telefone que não é dela.
 *
 * Diz-se aqui porque é que se pedem: um formulário que pede a data de nascimento sem explicar
 * porquê é um formulário que as pessoas abandonam.
 */
function Inscricao({ torneio, nome, perfil }: {
  torneio: Torneio; nome: string
  perfil?: { telefone: string | null; dataNascimento: string | null; pais: string | null }
}) {
  const partes = nome.trim().split(/\s+/)
  // Pré-preenchido com o que já foi dado no registo. O telefone vem guardado com indicativo
  // (+351912…) e aqui mostra-se só o número: o indicativo é do selector do país.
  const [dados, setDados] = useState<DadosConta>({
    ...DADOS_CONTA_VAZIOS,
    primeiroNome: partes[0] ?? '',
    apelido: partes.length > 1 ? partes[partes.length - 1] : '',
    pais: perfil?.pais || 'PT',
    telefone: (perfil?.telefone ?? '').replace(/^\+\d{1,4}/, ''),
    dataNascimento: perfil?.dataNascimento ?? '',
  })
  const [nomePublico, setNomePublico] = useState(nome)
  const [estado, setEstado] = useState<'parado' | 'a_enviar' | 'feito'>('parado')
  const [erro, setErro] = useState<string | null>(null)

  // A porta é a DATA, não o estado — este torneio aceita gente já a decorrer.
  if (!inscricoesAbertas(torneio)) {
    return (
      <Caixa titulo={torneio.nome}>
        <Vazio>
          {torneio.estado === 'a_decorrer'
            ? 'O torneio já começou e as inscrições estão fechadas. O próximo é trimestral.'
            : torneio.estado === 'terminado'
              ? 'Este torneio terminou. O próximo é trimestral.'
              : 'As inscrições ainda não abriram.'}
        </Vazio>
      </Caixa>
    )
  }

  if (estado === 'feito') {
    return (
      <Caixa titulo="Inscrição registada">
        <p className="text-sm text-zinc-300">
          Estás dentro. A conta de {torneio.saldoInicial.toLocaleString('pt-PT')} USD é emitida e
          os dados chegam-te por email.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          A emissão não é imediata — as contas são criadas uma a uma no MetaTrader.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300"
        >
          Actualizar
        </button>
      </Caixa>
    )
  }

  const inscrever = async () => {
    setErro(null)
    setEstado('a_enviar')
    try {
      const { getAccessToken } = await import('@/lib/auth-token')
      const tok = await getAccessToken()
      const r = await fetch('/api/mtmfunded/tournament/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ torneio: torneio.slug, nome: nomePublico, ...dados }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || 'Não foi possível inscrever')
      setEstado('feito')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível inscrever')
      setEstado('parado')
    }
  }

  const completo = nomePublico.trim().length > 2 && dadosContaCompletos(dados)

  return (
    <Caixa titulo={`Inscrever-me · ${torneio.nome}`}>
      <p className="text-sm text-zinc-400">
        Conta de {torneio.saldoInicial.toLocaleString('pt-PT')} USD, gratuita, com as regras à
        vista. Recebes os dados por email assim que a conta for emitida.
      </p>

      <div className="mt-5 space-y-4">
        <Campo
          rotulo="Nome na classificação"
          nota="É este que aparece na tabela pública. Podes usar só o primeiro nome."
          valor={nomePublico}
          onChange={setNomePublico}
        />
        <div className="border-t border-zinc-900 pt-4">
          <p className="mb-3 text-xs uppercase tracking-widest text-zinc-600">
            Dados da conta · pedidos pela corretora
          </p>
          <CamposConta dados={dados} onChange={setDados} cor="#4B8BFF" />
        </div>
      </div>

      {erro && <p className="mt-4 text-sm text-red-400">{erro}</p>}

      <button
        onClick={inscrever}
        disabled={!completo || estado === 'a_enviar'}
        className="mt-5 w-full rounded-lg bg-[#4B8BFF] py-3 text-sm font-semibold text-white disabled:opacity-40 sm:w-auto sm:px-8"
      >
        {estado === 'a_enviar' ? 'A inscrever…' : 'Inscrever-me'}
      </button>
    </Caixa>
  )
}

function Campo({
  rotulo, nota, valor, onChange, tipo = 'text',
}: { rotulo: string; nota?: string; valor: string; onChange: (v: string) => void; tipo?: string }) {
  return (
    <label className="block">
      <span className="text-sm text-zinc-300">{rotulo}</span>
      {nota && <span className="mt-0.5 block text-xs text-zinc-600">{nota}</span>}
      <input
        type={tipo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-[#4B8BFF]"
      />
    </label>
  )
}

function Dashboard({ torneio, participante, contas, nome, perfil }: {
  torneio: Torneio | null; participante: Participante | null; contas: Conta[]; nome: string
  perfil?: { telefone: string | null; dataNascimento: string | null; pais: string | null }
}) {
  const conta = contas.find((c) => c.tipo === 'torneio') ?? contas[0]
  const m = participante?.metricas ?? {}
  const margemDiaria = typeof m.margemDiaria === 'number' ? m.margemDiaria : null
  const margemTotal = typeof m.margemTotal === 'number' ? m.margemTotal : null

  if (!torneio) return <Caixa titulo="Dashboard"><Vazio>Não há torneio a decorrer.</Vazio></Caixa>
  if (!participante) return <Inscricao torneio={torneio} nome={nome} perfil={perfil} />


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

function Contas({ contas, abrir, ehAdmin }: { contas: Conta[]; abrir?: string | null; ehAdmin?: boolean }) {
  /**
   * O modal do DESEMPENHO, aberto uma conta de cada vez.
   *
   * O estado vive aqui e não dentro de cada cartão: dois modais abertos ao mesmo tempo é uma
   * coisa que nunca ninguém quis, e guardar o id em vez de um booleano por cartão faz disso
   * uma impossibilidade em vez de uma convenção.
   */
  const [metricasDe, setMetricasDe] = useState<string | null>(null)
  /** A conta que o admin pediu para apagar — o diálogo vive aqui pela mesma razão. */
  const [apagarDe, setApagarDe] = useState<Conta | null>(null)
  /**
   * As etiquetas gravadas nesta visita. A página é um Server Component: sem isto, mudar a
   * etiqueta só aparecia depois de recarregar, e a pessoa escrevia outra vez a pensar que falhou.
   */
  const [etiquetas, setEtiquetas] = useState<Record<string, string | null>>({})
  /** A lista sem as contas que o admin apagou nesta visita (não se recarrega a página por baixo dele). */
  const [apagadas, setApagadas] = useState<string[]>([])

  const lista = contas.filter((c) => !apagadas.includes(c.id))
  if (!lista.length) return <Caixa titulo="Contas de Trading"><Vazio>Ainda não tens contas.</Vazio></Caixa>
  return (
    <div className="space-y-4">
      {metricasDe && <ModalMetricas contaId={metricasDe} aoFechar={() => setMetricasDe(null)} />}
      {apagarDe && (
        <ModalApagarConta
          conta={{ ...apagarDe, etiquetaDoDono: apagarDe.id in etiquetas ? etiquetas[apagarDe.id] : apagarDe.etiquetaDoDono }}
          aoFechar={() => setApagarDe(null)}
          aoApagar={() => { setApagadas((xs) => [...xs, apagarDe.id]); setApagarDe(null) }}
        />
      )}
      {lista.map((c) => {
        const etiqueta = c.id in etiquetas ? etiquetas[c.id] : c.etiquetaDoDono
        return (
        <Caixa
          key={c.id}
          // A etiqueta do dono MANDA no título; sem ela, o título é o de sempre (tipo · login).
          titulo={etiqueta ?? `${tipoCurto(c.tipo, c.metricas)} · ${c.login ?? 'a emitir'}`}
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span
              className="rounded-md px-2 py-0.5 text-xs font-semibold"
              style={{ color: COR_DO_ESTADO[estadoCurto(c.estado, c.metricas)], background: `${COR_DO_ESTADO[estadoCurto(c.estado, c.metricas)]}1f` }}
            >
              {estadoCurto(c.estado, c.metricas)}
            </span>
            {/* Com etiqueta, o tipo e o login passam para aqui — continuam à vista, só deixam de ser o nome. */}
            {etiqueta && (
              <span className="text-xs text-zinc-500">{tipoCurto(c.tipo, c.metricas)} · {c.login ?? 'a emitir'}</span>
            )}
            <CampoEtiquetaConta
              contaId={c.id}
              etiqueta={etiqueta}
              aoGravar={(nova) => setEtiquetas((e) => ({ ...e, [c.id]: nova }))}
            />
          </div>
          <Linha rotulo="Servidor" valor={c.servidor ?? '—'} />
          <Linha rotulo="Saldo inicial" valor={c.saldoInicial ? `${c.saldoInicial.toLocaleString('pt-PT')} USD` : '—'} />
          <Linha rotulo="Alavancagem" valor={c.alavancagem ? `1:${c.alavancagem}` : '—'} />
          {typeof c.metricas.equity === 'number' && (
            <Linha rotulo="Equity" valor={`${(c.metricas.equity as number).toLocaleString('pt-PT')} USD`} />
          )}

          {/* Só há desempenho para ver depois de a conta existir no MetaTrader. */}
          {c.login && (
            <button
              onClick={() => setMetricasDe(c.id)}
              className="mt-3 w-full rounded-lg border border-[#D2A63C]/35 py-2.5 text-sm text-[#D2A63C] transition hover:border-[#D2A63C] hover:bg-[#D2A63C]/[0.06]"
            >
              Ver desempenho
            </button>
          )}

          {c.login && <Credenciais conta={c} abrirJa={abrir === c.id} />}

          {/* Apagar é só do admin, e quem manda nisso é o SERVIDOR: esconder o botão é
              conveniência, não segurança — a rota volta a verificar a sessão e o papel. */}
          {ehAdmin && (
            <button
              onClick={() => setApagarDe(c)}
              className="mt-3 w-full rounded-lg border border-red-500/30 py-2.5 text-sm text-red-400 transition hover:border-red-500 hover:bg-red-500/[0.06]"
            >
              Apagar esta conta
            </button>
          )}
        </Caixa>
        )
      })}
    </div>
  )
}

/**
 * O LÁPIS DA ETIQUETA — o mesmo gesto do WebTrader, no cartão da conta.
 *
 * Grava pela MESMA rota (PATCH /api/contas/etiqueta, `ref = mtmfunded:<id>`) e na MESMA coluna
 * (`mtm_trading_accounts.etiqueta`), para uma etiqueta posta aqui aparecer no seletor do
 * WebTrader e ao contrário. `''` apaga. O servidor volta a normalizar (40 caracteres, sem `<>`)
 * e devolve o que ficou gravado — é esse valor que se mostra, não o que se escreveu.
 */
function CampoEtiquetaConta({ contaId, etiqueta, aoGravar }: {
  contaId: string
  etiqueta: string | null
  aoGravar: (nova: string | null) => void
}) {
  const [aEditar, setAEditar] = useState(false)
  const [texto, setTexto] = useState(etiqueta ?? '')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const gravar = async () => {
    if (ocupado) return
    // Sem mudança não se gasta um pedido (Enter seguido de blur passava aqui duas vezes).
    if (normalizarEtiqueta(texto) === etiqueta) { setAEditar(false); setErro(null); return }
    setOcupado(true)
    setErro(null)
    try {
      const { getAccessToken } = await import('@/lib/auth-token')
      const tok = await getAccessToken()
      const r = await fetch('/api/contas/etiqueta', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ ref: `mtmfunded:${contaId}`, etiqueta: texto }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || 'Não foi possível gravar a etiqueta')
      aoGravar(j?.etiqueta ?? null)
      setAEditar(false)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gravar a etiqueta')
    } finally {
      setOcupado(false)
    }
  }

  if (!aEditar) {
    return (
      <button
        type="button"
        onClick={() => { setTexto(etiqueta ?? ''); setErro(null); setAEditar(true) }}
        aria-label={etiqueta ? `Mudar a etiqueta (${etiqueta})` : 'Pôr uma etiqueta nesta conta'}
        title={etiqueta ? 'Mudar a etiqueta' : 'Pôr uma etiqueta'}
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-zinc-500 transition hover:bg-white/5 hover:text-[#D2A63C]"
      >
        <Pencil className="h-3.5 w-3.5" />
        {!etiqueta && <span>etiqueta</span>}
      </button>
    )
  }
  return (
    <span className="flex items-center gap-1">
      <input
        autoFocus
        value={texto}
        maxLength={ETIQUETA_MAX}
        placeholder="etiqueta"
        aria-label="Etiqueta da conta"
        enterKeyHint="done"
        disabled={ocupado}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => void gravar()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void gravar() }
          // Escape desiste sem gravar — e o blur que vem a seguir já não encontra mudança.
          if (e.key === 'Escape') { e.preventDefault(); setTexto(etiqueta ?? ''); setAEditar(false) }
        }}
        // 16 px no toque: abaixo disso o iPhone faz zoom ao focar o campo.
        className="h-8 w-40 rounded border border-[#D2A63C]/40 bg-black/60 px-2 text-[16px] text-white outline-none placeholder:text-zinc-600 sm:text-xs"
      />
      {/* No toque não há blur antes do clique: este botão grava o que está escrito. */}
      <button
        type="button"
        aria-label="Guardar etiqueta"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => void gravar()}
        className="grid h-8 w-8 place-items-center rounded-md text-[#D2A63C] hover:bg-white/5"
      >
        <Check className="h-4 w-4" />
      </button>
      {erro && <span className="text-xs text-red-400">{erro}</span>}
    </span>
  )
}

/**
 * APAGAR UMA CONTA — o diálogo que diz o que vai desaparecer antes de deixar apagar.
 *
 * Não é um `confirm()`. Primeiro pergunta-se ao servidor o que está pendurado na conta
 * (GET ?vista=apagar, que não apaga nada) e mostra-se: os bloqueios, o que vai junto e o que
 * fica. O botão só destranca depois de o admin escrever o LOGIN da conta à mão — escrever o
 * login é o que separa «carreguei sem ler» de «quis mesmo esta conta». Havendo bloqueios, não há
 * botão nenhum: recusa-se e explica-se, em vez de apagar meio.
 *
 * O admin é verificado no SERVIDOR (verifyAdminAccess na rota), nunca por este componente.
 */
function ModalApagarConta({ conta, aoFechar, aoApagar }: {
  conta: Conta
  aoFechar: () => void
  aoApagar: () => void
}) {
  const [plano, setPlano] = useState<{
    pode: boolean; bloqueios: string[]; avisos: string[]
    arrasta: Array<{ tabela: string; quantas: number; nota: string }>
    confirmacaoEsperada: string
  } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [escrito, setEscrito] = useState('')
  const [aApagar, setAApagar] = useState(false)
  /**
   * A chave de idempotência, UMA por abertura do diálogo.
   *
   * Duplo clique ou rede que repete: a segunda tentativa devolve o que a primeira fez, em vez de
   * apagar duas vezes. Fixa por conta não servia — uma tentativa recusada (conta ainda viva) fica
   * gravada como «falhou» e a mesma chave nunca mais passava, nem depois de o bloqueio ser
   * resolvido. Abrir o diálogo outra vez é o que dá uma chave nova.
   */
  const [chave] = useState(() => `apagar-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const { getAccessToken } = await import('@/lib/auth-token')
        const tok = await getAccessToken()
        const r = await fetch(`/api/admin/mtmfunded/conta/${conta.id}?vista=apagar`, {
          headers: { Authorization: `Bearer ${tok}` }, cache: 'no-store',
        })
        const j = await r.json().catch(() => ({}))
        if (!vivo) return
        if (!r.ok) throw new Error(j?.error || 'Não foi possível ler o que está ligado a esta conta')
        setPlano(j)
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível ler o que está ligado a esta conta')
      }
    })()
    return () => { vivo = false }
  }, [conta.id])

  const esperado = plano?.confirmacaoEsperada || PALAVRA_SEM_LOGIN
  const destrancado = plano?.pode === true && escrito.trim() === esperado && !aApagar

  const apagar = async () => {
    if (!destrancado) return
    setAApagar(true)
    setErro(null)
    try {
      const { getAccessToken } = await import('@/lib/auth-token')
      const tok = await getAccessToken()
      const r = await fetch(`/api/admin/mtmfunded/conta/${conta.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({
          accao: 'apagar_conta',
          confirmacao: escrito.trim(),
          motivo: `apagada no painel do torneio${conta.etiquetaDoDono ? ` (${conta.etiquetaDoDono})` : ''}`,
          chave,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || 'Não foi possível apagar a conta')
      aoApagar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível apagar a conta')
      setAApagar(false)
    }
  }

  const nome = conta.etiquetaDoDono ?? `${tipoCurto(conta.tipo, conta.metricas)} · ${conta.login ?? 'a emitir'}`
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-[#0A0B0E] p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
          <div className="min-w-0">
            <h3 className="font-semibold text-red-400">Apagar esta conta</h3>
            <p className="mt-0.5 truncate text-sm text-zinc-300">{nome}</p>
          </div>
        </div>

        <div className="mt-4 space-y-1">
          <Linha rotulo="Login" valor={conta.login ?? 'a emitir'} />
          <Linha rotulo="Servidor" valor={conta.servidor ?? '—'} />
          <Linha rotulo="Saldo inicial" valor={conta.saldoInicial ? `${conta.saldoInicial.toLocaleString('pt-PT')} USD` : '—'} />
          {typeof conta.metricas.equity === 'number' && (
            <Linha rotulo="Equity" valor={`${(conta.metricas.equity as number).toLocaleString('pt-PT')} USD`} />
          )}
        </div>

        {!plano && !erro && <p className="mt-4 text-sm text-zinc-500">A ver o que está ligado a esta conta…</p>}

        {plano && plano.bloqueios.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/[0.05] p-3">
            <p className="text-sm font-semibold text-amber-400">Esta conta não pode ser apagada agora</p>
            <ul className="mt-2 space-y-1.5 text-sm text-zinc-300">
              {plano.bloqueios.map((b, i) => <li key={i}>· {b}</li>)}
            </ul>
          </div>
        )}

        {plano && plano.pode && (
          <>
            <div className="mt-4">
              <p className="text-xs uppercase tracking-widest text-zinc-600">Desaparece com a conta</p>
              {plano.arrasta.length ? (
                <ul className="mt-2 space-y-1 text-sm text-zinc-300">
                  {plano.arrasta.map((a) => (
                    <li key={a.tabela}>· <span className="font-mono text-zinc-400">{a.quantas}</span> · {a.nota}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">Nada mais está ligado a esta conta.</p>
              )}
            </div>

            {plano.avisos.length > 0 && (
              <div className="mt-4">
                <p className="text-xs uppercase tracking-widest text-zinc-600">Fica como está</p>
                <ul className="mt-2 space-y-1 text-sm text-zinc-400">
                  {plano.avisos.map((a, i) => <li key={i}>· {a}</li>)}
                </ul>
              </div>
            )}

            <label className="mt-5 block">
              <span className="text-sm text-zinc-300">
                Escreve <span className="font-mono text-white">{esperado}</span> para destrancar
              </span>
              <input
                value={escrito}
                onChange={(e) => setEscrito(e.target.value)}
                autoComplete="off"
                className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-black/40 px-3 py-2.5 font-mono text-sm text-white outline-none focus:border-red-500"
              />
            </label>
          </>
        )}

        {erro && <p className="mt-4 text-sm text-red-400">{erro}</p>}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button onClick={aoFechar} disabled={aApagar} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 disabled:opacity-40">
            Cancelar
          </button>
          {plano?.pode && (
            <button
              onClick={apagar}
              disabled={!destrancado}
              className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-30"
            >
              {aApagar ? 'A apagar…' : 'Apagar para sempre'}
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-zinc-600">
          Isto não tem volta, e fica registado na auditoria (quem apagou, o quê e quando). Para tirar
          a conta da frente sem a perder, usa «Fechar conta» no painel de admin.
        </p>
      </div>
    </div>
  )
}

/**
 * A PALAVRA-PASSE, aqui e só aqui.
 *
 * O email da conta diz «a tua palavra-passe está no painel» — e durante um tempo não estava:
 * o participante recebia a conta, clicava no link e não encontrava nada. Fica aqui, atrás da
 * sessão, que é o que torna o email seguro: um email fica na caixa de entrada para sempre e
 * é reencaminhado sem se pensar; uma sessão fecha-se.
 *
 * Só se pede ao servidor quando se carrega em Mostrar. Trazê-la com a página deixava-a no
 * HTML de toda a gente que abrisse o painel, visível a quem passasse por trás.
 */
function Credenciais({ conta, abrirJa }: { conta: Conta; abrirJa?: boolean }) {
  const [dados, setDados] = useState<{ password: string | null; investor: string | null; aviso?: string } | null>(null)
  const [visivel, setVisivel] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  // Conta simulada: o servidor pede re-autenticação (428) — o componente do WebTrader trata disso.
  const [reautenticar, setReautenticar] = useState(false)

  const mostrar = useCallback(async () => {
    setOcupado(true)
    setErro(null)
    try {
      const { getAccessToken } = await import('@/lib/auth-token')
      const tok = await getAccessToken()
      const r = await fetch('/api/mtmfunded/conta/credenciais', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ contaId: conta.id }),
      })
      const j = await r.json()
      if (r.status === 428) { setReautenticar(true); return }
      if (!r.ok) throw new Error(j?.error || 'Não foi possível ler as credenciais')
      setDados(j)
      setVisivel(true)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ler as credenciais')
    } finally {
      setOcupado(false)
    }
  }, [conta.id])

  // Vindo do email, abre sozinho. É para isso que o link serve.
  useEffect(() => {
    if (abrirJa) mostrar()
  }, [abrirJa, mostrar])

  if (reautenticar) {
    return (
      <div className="mt-4 border-t border-zinc-900 pt-4">
        <CredenciaisConta contaId={conta.id} login={conta.login ?? null} servidor={conta.servidor ?? null} />
      </div>
    )
  }

  return (
    <div className="mt-4 border-t border-zinc-900 pt-4">
      {!visivel ? (
        <>
          <button
            onClick={mostrar}
            disabled={ocupado}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 disabled:opacity-40"
          >
            {ocupado ? 'A ler…' : 'Mostrar credenciais'}
          </button>
          {erro && <p className="mt-2 text-sm text-red-400">{erro}</p>}
        </>
      ) : (
        <div className="space-y-2.5">
          <LinhaCopiavel rotulo="Login" valor={conta.login ?? '—'} />
          <LinhaCopiavel rotulo="Servidor" valor={conta.servidor ?? '—'} />
          {dados?.password ? (
            <>
              <LinhaCopiavel rotulo="Palavra-passe" valor={dados.password} />
              {dados.investor && <LinhaCopiavel rotulo="Investidor (só leitura)" valor={dados.investor} />}
              <p className="pt-1 text-xs text-zinc-600">
                Podes alterá-la dentro do MetaTrader. Guarda-a num sítio seguro.
              </p>
            </>
          ) : (
            <p className="text-sm text-amber-400">{dados?.aviso ?? 'Palavra-passe indisponível.'}</p>
          )}
          {conta.qrcode && (
            <div className="pt-3">
              <p className="text-xs text-zinc-500">Entrar na app com um toque</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={conta.qrcode} alt="Código QR da conta" width={150} height={150} className="mt-2 rounded-lg bg-white p-2" />
              <p className="mt-1.5 text-xs text-zinc-600">
                No MetaTrader 5 do telemóvel: Nova conta → Entrar com código QR.
              </p>
            </div>
          )}
          <button onClick={() => setVisivel(false)} className="mt-2 text-xs text-zinc-500 hover:text-zinc-300">
            Esconder
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Um campo com botão de copiar.
 *
 * Copiar à mão do ecrã do telemóvel para o MetaTrader é onde se erra um caractere de uma
 * password — e um caractere errado parece, do outro lado, uma conta que não funciona. O botão
 * diz «copiado» durante dois segundos: sem confirmação, carrega-se três vezes e fica-se na
 * dúvida à mesma.
 */
function LinhaCopiavel({ rotulo, valor }: { rotulo: string; valor: string }) {
  const [copiado, setCopiado] = useState(false)

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(valor)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sem permissão para a área de transferência (contexto inseguro, browser antigo): o
      // valor continua à vista e selecionável. Não se finge que copiou.
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800/70 bg-black/30 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs text-zinc-600">{rotulo}</p>
        <p className="truncate font-mono text-sm text-zinc-200">{valor}</p>
      </div>
      <button
        onClick={copiar}
        className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
          copiado
            ? 'border-emerald-500/40 text-emerald-400'
            : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
        }`}
      >
        {copiado ? 'copiado' : 'copiar'}
      </button>
    </div>
  )
}

function Competicoes({ torneio, participante, onInscrever }: { torneio: Torneio | null; participante: Participante | null; onInscrever: () => void }) {
  if (!torneio) return <Caixa titulo="Competições"><Vazio>Sem torneios abertos.</Vazio></Caixa>
  const d = (v: string) => new Date(v).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' })
  return (
    <Caixa titulo={torneio.nome}>
      <Linha rotulo="Estado" valor={participante ? 'Inscrito' : inscricoesAbertas(torneio) ? 'Inscrições abertas' : torneio.estado} />
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
      {/* O botão leva ao FORMULÁRIO, que vive no Dashboard. Antes apontava para a página
          pública, que por sua vez volta a apontar para aqui: dois botões «Inscrever-me» a
          mandar um para o outro, sem nada pelo meio que inscrevesse alguém. */}
      {!participante && inscricoesAbertas(torneio) && (
        <button onClick={onInscrever} className="mt-4 rounded-lg bg-[#4B8BFF] px-5 py-2.5 text-sm font-semibold">
          Inscrever-me
        </button>
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
