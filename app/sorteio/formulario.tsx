'use client'

import { useState } from 'react'

/**
 * A ENTRADA, e o que vem depois dela.
 *
 * Dois estados e nada mais: antes de entrar pede-se o mínimo — nome e email —, e depois de
 * entrar mostra-se o que a pessoa ganhou com isso: os bilhetes e o código que a faz ganhar mais.
 *
 * O código aparece IMEDIATAMENTE. É o momento em que a pessoa está mais disposta a partilhar —
 * acabou de entrar e quer melhorar as hipóteses. Mandá-lo só por email era perder esse momento,
 * e a variante C vive precisamente dele.
 */
export default function FormularioSorteio({
  referencia,
  participantes,
  campanhaOmissa,
}: {
  referencia: string | null
  participantes: number
  campanhaOmissa: string
}) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [estado, setEstado] = useState<'parado' | 'a_enviar'>('parado')
  const [erro, setErro] = useState<string | null>(null)
  const [entrada, setEntrada] = useState<{ bilhetes: number; codigo: string; jaEstava?: boolean } | null>(null)
  const [copiado, setCopiado] = useState(false)

  const entrar = async () => {
    setErro(null)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setErro('Escreve um email válido — é para lá que vai o prémio.')
      return
    }
    setEstado('a_enviar')
    try {
      const r = await fetch('/api/sorteio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accao: 'entrar',
          campanha: campanhaOmissa,
          nome: nome.trim() || null,
          email: email.trim(),
          referencia,
        }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) {
        setErro(j.erro ?? 'Não foi possível registar a tua entrada.')
      } else {
        setEntrada({ bilhetes: j.bilhetes ?? 1, codigo: j.codigo, jaEstava: j.jaEstava })
      }
    } catch {
      setErro('Não foi possível falar com o servidor. Tenta outra vez.')
    }
    setEstado('parado')
  }

  const ligacao =
    typeof window !== 'undefined' && entrada
      ? `${window.location.origin}/sorteio?ref=${entrada.codigo}`
      : ''

  if (entrada) {
    return (
      <div className="mt-10 rounded-2xl border border-[#D2A63C]/30 bg-[#D2A63C]/[0.06] p-6">
        <p className="text-[13px] uppercase tracking-widest text-[#D2A63C]">
          {entrada.jaEstava ? 'Já estavas dentro' : 'Estás dentro'}
        </p>
        <p className="mt-2 text-3xl font-black">
          {entrada.bilhetes} {entrada.bilhetes === 1 ? 'bilhete' : 'bilhetes'}
        </p>

        <p className="mt-5 text-[14.5px] leading-relaxed text-white/70">
          Queres mais? <strong className="text-white">Cada pessoa que entrar com o teu link
          vale-te mais 2 bilhetes</strong> — e não há limite prático. Partilha-o nos stories e
          marca-nos para ganhares mais 3.
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <code className="flex-1 truncate rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-[13px] text-white/80">
            {ligacao}
          </code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(ligacao).then(
                () => { setCopiado(true); setTimeout(() => setCopiado(false), 2000) },
                () => undefined,
              )
            }}
            className="rounded-lg bg-[#D2A63C] px-6 py-3 text-[14px] font-bold text-black"
          >
            {copiado ? 'Copiado' : 'Copiar link'}
          </button>
        </div>

        <p className="mt-4 text-[12.5px] text-white/45">
          Guarda o teu código: <strong className="text-white/70">{entrada.codigo}</strong>. Os
          vencedores são contactados por email.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      {referencia && (
        <p className="mb-4 rounded-lg border border-[#D2A63C]/25 bg-[#D2A63C]/[0.07] px-4 py-2.5 text-[13px] text-[#E8C87A]">
          Vieste pelo convite de alguém — quando entrares, essa pessoa ganha mais 2 bilhetes.
        </p>
      )}

      <p className="text-[15px] font-semibold">Entrar no sorteio</p>
      <p className="mt-1 text-[13px] text-white/50">
        São 30 segundos. Ficas logo com 3 bilhetes.
      </p>

      <div className="mt-5 space-y-3">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="O teu nome"
          autoComplete="name"
          className="w-full rounded-lg border border-white/12 bg-black/40 px-4 py-3 text-[15px] outline-none placeholder:text-white/30 focus:border-[#D2A63C]/50"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && estado === 'parado' && entrar()}
          placeholder="O teu email"
          type="email"
          inputMode="email"
          autoComplete="email"
          className="w-full rounded-lg border border-white/12 bg-black/40 px-4 py-3 text-[15px] outline-none placeholder:text-white/30 focus:border-[#D2A63C]/50"
        />
      </div>

      {erro && <p className="mt-3 text-[13px] text-rose-400">{erro}</p>}

      <button
        type="button"
        onClick={entrar}
        disabled={estado === 'a_enviar'}
        className="mt-5 w-full rounded-lg bg-[#D2A63C] py-3.5 text-[15px] font-bold text-black disabled:opacity-50"
      >
        {estado === 'a_enviar' ? 'A registar…' : 'Quero participar'}
      </button>

      {participantes > 0 && (
        <p className="mt-3 text-center text-[12.5px] text-white/40">
          {participantes} {participantes === 1 ? 'pessoa já entrou' : 'pessoas já entraram'}.
        </p>
      )}
    </div>
  )
}
