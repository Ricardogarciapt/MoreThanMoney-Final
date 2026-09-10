'use client'

import { useCallback, useEffect, useState } from 'react'
import { FileSignature, Upload, X, CheckCircle2, AlertTriangle } from 'lucide-react'

/**
 * Contratos e Levantamentos — as duas secções que mexem em dinheiro.
 *
 * Estão no mesmo ficheiro porque estão ligadas por uma regra: sem contrato assinado não há
 * levantamento. Separá-las levava a que o botão de levantar vivesse longe da condição que o
 * governa, e a única forma de a descobrir fosse tentar e falhar.
 */

async function comToken(caminho: string, init: RequestInit = {}) {
  const { getAccessToken } = await import('@/lib/auth-token')
  const tok = await getAccessToken()
  return fetch(caminho, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${tok}` },
  })
}

// ── contrato ─────────────────────────────────────────────────────────────────

interface EstadoContrato {
  versao: string
  texto: string
  assinado: { em: string; nome: string; versao: string } | null
}

export function Contratos({ aoAssinar }: { aoAssinar?: () => void }) {
  const [dados, setDados] = useState<EstadoContrato | null>(null)
  const [nome, setNome] = useState('')
  const [nascimento, setNascimento] = useState('')
  const [aceita, setAceita] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async () => {
    const r = await comToken('/api/mtmfunded/contrato', { cache: 'no-store' })
    if (r.ok) setDados(await r.json())
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const assinar = async () => {
    setErro(null)
    setOcupado(true)
    try {
      const r = await comToken('/api/mtmfunded/contrato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomeCompleto: nome, dataNascimento: nascimento, aceita }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || 'Não foi possível assinar')
      await carregar()
      aoAssinar?.()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível assinar')
    } finally {
      setOcupado(false)
    }
  }

  if (!dados) return <Caixa titulo="Contratos"><p className="text-sm text-zinc-500">A carregar…</p></Caixa>

  return (
    <Caixa titulo="Contrato de Trader Financiado">
      {dados.assinado ? (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
          <div>
            <p className="text-sm font-medium text-emerald-400">Assinado</p>
            <p className="mt-0.5 text-xs text-zinc-400">
              Por {dados.assinado.nome}, em{' '}
              {new Date(dados.assinado.em).toLocaleDateString('pt-PT', {
                day: '2-digit', month: 'long', year: 'numeric',
              })}{' '}
              · versão {dados.assinado.versao}
            </p>
          </div>
        </div>
      ) : (
        <p className="mb-5 text-sm text-zinc-400">
          Assina para poderes pedir levantamentos. É o documento que diz em que termos é que o
          dinheiro sai — vale a pena lê-lo antes de assinar, não depois.
        </p>
      )}

      {/* O texto INTEIRO, num painel com scroll. Um contrato atrás de um link é um contrato
          que ninguém lê, e depois discute-se o que lá estava. */}
      <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-xl border border-zinc-800 bg-black/40 p-4 font-mono text-xs leading-relaxed text-zinc-400">
        {dados.texto}
      </pre>

      {!dados.assinado && (
        <div className="mt-5 space-y-4">
          <CampoSimples
            rotulo="Nome completo"
            nota="Como consta no teu documento de identificação. É o nome que fica no contrato."
            valor={nome}
            onChange={setNome}
          />
          <CampoSimples
            rotulo="Data de nascimento"
            nota="Confirmas aqui que tens 18 anos ou mais."
            tipo="date"
            valor={nascimento}
            onChange={setNascimento}
          />
          <label className="flex gap-3 rounded-xl border border-zinc-800 bg-black/30 p-4">
            <input
              type="checkbox"
              checked={aceita}
              onChange={(e) => setAceita(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#D2A63C]"
            />
            <span className="text-xs leading-relaxed text-zinc-400">
              Li o contrato acima, tenho 18 anos ou mais, e compreendo que a negociação é{' '}
              <b className="text-zinc-300">simulada</b>, que a minha participação nos resultados
              é de <b className="text-zinc-300">75%</b>, e que os pagamentos são feitos por
              depósito na minha conta PU Prime.
            </span>
          </label>

          {erro && <p className="text-sm text-red-400">{erro}</p>}

          <button
            onClick={assinar}
            disabled={!aceita || nome.trim().split(/\s+/).length < 2 || !nascimento || ocupado}
            className="inline-flex items-center gap-2 rounded-lg bg-[#D2A63C] px-6 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
          >
            <FileSignature className="h-4 w-4" />
            {ocupado ? 'A assinar…' : 'Assinar contrato'}
          </button>
        </div>
      )}
    </Caixa>
  )
}

// ── levantamentos ────────────────────────────────────────────────────────────

interface ContaLevantamento {
  id: string
  login: string | null
  saldoInicial: number
  equity: number
  almofada: number
  jaPago: number
  levantavel: number
}

interface Pedido {
  id: string
  valor_usd: number
  uid_broker: string
  estado: string
  motivo: string | null
  criado_em: string
}

const USD = (v: number) =>
  `${Number(v).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`

export function Levantamentos({ irParaContrato }: { irParaContrato: () => void }) {
  const [dados, setDados] = useState<{
    contrato: { versao: string; assinadoEm: string } | null
    quotaTrader: number
    contas: ContaLevantamento[]
    pedidos: Pedido[]
  } | null>(null)
  const [modal, setModal] = useState<ContaLevantamento | null>(null)

  const carregar = useCallback(async () => {
    const r = await comToken('/api/mtmfunded/levantamentos', { cache: 'no-store' })
    if (r.ok) setDados(await r.json())
  }, [])
  useEffect(() => { carregar() }, [carregar])

  if (!dados) return <Caixa titulo="Levantamentos"><p className="text-sm text-zinc-500">A carregar…</p></Caixa>

  return (
    <div className="space-y-4">
      {/* Como funciona, antes dos números. Quem chega aqui pela primeira vez precisa de saber
          porque é que o levantável não é igual ao lucro. */}
      <Caixa titulo="Como se levanta">
        <ul className="space-y-2.5 text-sm text-zinc-400">
          <li>
            <b className="text-zinc-200">75% do lucro é teu.</b> Os 25% restantes ficam para a
            MTM, que suporta o capital real, a infraestrutura e o risco.
          </li>
          <li>
            <b className="text-zinc-200">Almofada de 3%.</b> Só é levantável o que passar de 3%
            de lucro sobre o saldo inicial. A almofada fica na tua conta e continua a ser tua
            para negociar — não é uma retenção.
          </li>
          <li>
            <b className="text-zinc-200">Pagamento por depósito na PU Prime.</b> Em USDC, rede
            Solana, para o endereço que a própria corretora gera na tua conta. Por isso pedimos
            o UID e o print do menu de depósito: o endereço nunca é escrito à mão.
          </li>
        </ul>
      </Caixa>

      {!dados.contrato && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-medium text-amber-400">Falta assinar o contrato</p>
            <p className="mt-1 text-sm text-zinc-400">
              Sem contrato de trader financiado assinado não há levantamentos.
            </p>
            <button onClick={irParaContrato} className="mt-3 rounded-lg border border-amber-500/40 px-4 py-2 text-xs text-amber-300">
              Ir ao contrato
            </button>
          </div>
        </div>
      )}

      {!dados.contas.length ? (
        <Caixa titulo="Contas"><p className="text-sm text-zinc-500">Ainda não tens contas activas.</p></Caixa>
      ) : (
        dados.contas.map((c) => (
          <Caixa key={c.id} titulo={`Conta ${c.login ?? '—'}`}>
            <div className="grid gap-3 sm:grid-cols-4">
              <Metrica rotulo="Saldo inicial" valor={USD(c.saldoInicial)} />
              <Metrica rotulo="Equity" valor={USD(c.equity)} />
              <Metrica rotulo="Almofada (3%)" valor={USD(c.almofada)} />
              <Metrica
                rotulo="Levantável"
                valor={USD(c.levantavel)}
                cor={c.levantavel > 0 ? 'text-emerald-400' : 'text-zinc-500'}
              />
            </div>
            {c.jaPago > 0 && (
              <p className="mt-3 text-xs text-zinc-600">Já levantado nesta conta: {USD(c.jaPago)}</p>
            )}
            <button
              onClick={() => setModal(c)}
              disabled={!dados.contrato || c.levantavel <= 0}
              className="mt-4 rounded-lg bg-[#D2A63C] px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-30"
            >
              Pedir levantamento
            </button>
            {c.levantavel <= 0 && (
              <p className="mt-2 text-xs text-zinc-600">
                O lucro ainda não passou a almofada de 3%.
              </p>
            )}
          </Caixa>
        ))
      )}

      {dados.pedidos.length > 0 && (
        <Caixa titulo="Pedidos">
          <div className="space-y-2">
            {dados.pedidos.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-900 py-2.5 last:border-0">
                <div>
                  <p className="text-sm text-zinc-200">{USD(p.valor_usd)}</p>
                  <p className="text-xs text-zinc-600">
                    UID {p.uid_broker} · {new Date(p.criado_em).toLocaleDateString('pt-PT')}
                  </p>
                </div>
                <div className="text-right">
                  <EstadoPedido valor={p.estado} />
                  {p.motivo && <p className="mt-0.5 max-w-xs text-xs text-zinc-600">{p.motivo}</p>}
                </div>
              </div>
            ))}
          </div>
        </Caixa>
      )}

      {modal && (
        <ModalLevantamento
          conta={modal}
          aoFechar={() => setModal(null)}
          aoConcluir={() => { setModal(null); carregar() }}
        />
      )}
    </div>
  )
}

/**
 * O PEDIDO DE LEVANTAMENTO.
 *
 * O UID e os prints não são burocracia: o pagamento é um depósito na conta do trader na
 * corretora, para um endereço que a corretora gera. Pedir o endereço escrito à mão era pedir
 * um erro de um caractere — e em cripto isso não se recupera. O print serve de prova do que
 * a corretora mostrou, e o campo do endereço serve só para conferir contra o print.
 */
function ModalLevantamento({
  conta, aoFechar, aoConcluir,
}: { conta: ContaLevantamento; aoFechar: () => void; aoConcluir: () => void }) {
  const [valor, setValor] = useState(conta.levantavel.toFixed(2))
  const [uid, setUid] = useState('')
  const [endereco, setEndereco] = useState('')
  const [prints, setPrints] = useState<string[]>([])
  const [aEnviar, setAEnviar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const anexar = async (ficheiros: FileList | null) => {
    if (!ficheiros?.length) return
    setAEnviar(true)
    setErro(null)
    try {
      for (const f of Array.from(ficheiros).slice(0, 3)) {
        const fd = new FormData()
        fd.append('ficheiro', f)
        const r = await comToken('/api/mtmfunded/levantamentos/comprovativo', { method: 'POST', body: fd })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j?.error || 'Não foi possível anexar')
        setPrints((p) => [...p, j.caminho])
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível anexar')
    } finally {
      setAEnviar(false)
    }
  }

  const pedir = async () => {
    setErro(null)
    setOcupado(true)
    try {
      const r = await comToken('/api/mtmfunded/levantamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contaId: conta.id,
          valorUsd: Number(valor),
          uidBroker: uid,
          enderecoCripto: endereco,
          comprovativos: prints,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || 'Não foi possível registar o pedido')
      aoConcluir()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível registar o pedido')
      setOcupado(false)
    }
  }

  const valido =
    Number(valor) > 0 && Number(valor) <= conta.levantavel && uid.trim().length >= 4 && prints.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#0b0b10] p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Pedir levantamento</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Conta {conta.login ?? '—'} · disponível {USD(conta.levantavel)}
            </p>
          </div>
          <button onClick={aoFechar} className="text-zinc-500 hover:text-white" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <ol className="mt-5 space-y-1.5 rounded-xl border border-zinc-800 bg-black/40 p-4 text-xs leading-relaxed text-zinc-400">
          <li>1. Abre a tua conta PU Prime e vai a <b className="text-zinc-300">Depósito → Cripto → USDC (Solana)</b>.</li>
          <li>2. Tira um print onde se vejam o <b className="text-zinc-300">endereço de depósito</b> e o <b className="text-zinc-300">valor</b>.</li>
          <li>3. Anexa-o aqui, com o teu <b className="text-zinc-300">UID</b>. É para lá que o pagamento vai.</li>
        </ol>

        <div className="mt-5 space-y-4">
          <CampoSimples rotulo="Valor a levantar (USD)" tipo="number" valor={valor} onChange={setValor} />
          <CampoSimples
            rotulo="UID da conta PU Prime"
            nota="O número da tua conta na corretora parceira."
            valor={uid}
            onChange={setUid}
          />
          <CampoSimples
            rotulo="Endereço USDC (Solana)"
            nota="Opcional — serve para conferirmos contra o print. Não o escrevas de cabeça: copia-o da corretora."
            valor={endereco}
            onChange={setEndereco}
          />

          <div>
            <p className="text-sm text-zinc-300">Print do menu de depósito</p>
            <p className="mt-0.5 text-xs text-zinc-600">
              PNG, JPG ou WEBP, até 6 MB. Podes anexar mais do que um.
            </p>
            <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-700 py-6 text-sm text-zinc-400 hover:border-[#D2A63C]/50">
              <Upload className="h-4 w-4" />
              {aEnviar ? 'A enviar…' : 'Escolher imagem'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={(e) => anexar(e.target.files)}
              />
            </label>
            {prints.length > 0 && (
              <p className="mt-2 text-xs text-emerald-400">
                {prints.length} {prints.length === 1 ? 'imagem anexada' : 'imagens anexadas'}
              </p>
            )}
          </div>
        </div>

        {erro && <p className="mt-4 text-sm text-red-400">{erro}</p>}

        <div className="mt-6 flex gap-3">
          <button
            onClick={pedir}
            disabled={!valido || ocupado}
            className="flex-1 rounded-lg bg-[#D2A63C] py-3 text-sm font-semibold text-black disabled:opacity-40"
          >
            {ocupado ? 'A enviar…' : 'Enviar pedido'}
          </button>
          <button onClick={aoFechar} className="rounded-lg border border-zinc-700 px-5 text-sm text-zinc-400">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── peças ────────────────────────────────────────────────────────────────────

function Caixa({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-5">
      <h2 className="text-base font-semibold">{titulo}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Metrica({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/70 bg-black/30 p-3">
      <p className="text-xs text-zinc-600">{rotulo}</p>
      <p className={`mt-1 font-mono text-sm ${cor ?? 'text-zinc-200'}`}>{valor}</p>
    </div>
  )
}

function EstadoPedido({ valor }: { valor: string }) {
  const cores: Record<string, string> = {
    pedido: 'text-amber-400', em_analise: 'text-amber-400',
    aprovado: 'text-blue-400', pago: 'text-emerald-400', recusado: 'text-red-400',
  }
  const nomes: Record<string, string> = {
    pedido: 'em fila', em_analise: 'em análise', aprovado: 'aprovado',
    pago: 'pago', recusado: 'recusado',
  }
  return <span className={`text-xs ${cores[valor] ?? 'text-zinc-500'}`}>{nomes[valor] ?? valor}</span>
}

function CampoSimples({
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
        className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-[#D2A63C]"
      />
    </label>
  )
}
