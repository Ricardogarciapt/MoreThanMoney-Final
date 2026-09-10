'use client'

import Link from 'next/link'
import { use, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Entrar ou criar conta — no MTM Funded, sem sair dele.
 *
 * Um separador só, com dois modos. Um registo que salta para outro site (ainda que seja o
 * nosso) a meio de uma compra é onde as pessoas desistem, e o `/register` da MTM abre com a
 * venda de packs — outro produto, outra decisão, no pior momento possível.
 */
export default function Entrada({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const { redirect } = use(searchParams)
  const destino = redirect && redirect.startsWith('/mtmfunded') ? redirect : '/mtmfunded/tradingtournament/dashboard'

  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar')
  const [dados, setDados] = useState({ nome: '', email: '', password: '' })
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const submeter = async () => {
    setErro(null)
    setOcupado(true)
    try {
      if (modo === 'criar') {
        const r = await fetch('/api/mtmfunded/registo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dados),
        })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) {
          // Email já usado: em vez de um erro seco, muda-se para o modo certo com o email lá.
          if (j?.entrar) setModo('entrar')
          throw new Error(j?.error || 'Não foi possível criar a conta')
        }
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: dados.email.trim().toLowerCase(),
        password: dados.password,
      })
      if (error) {
        throw new Error(
          /Invalid login credentials/i.test(error.message)
            ? 'Email ou palavra-passe errados'
            : error.message,
        )
      }
      window.location.href = destino
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível continuar')
      setOcupado(false)
    }
  }

  const completo =
    dados.email.includes('@') &&
    dados.password.length >= 8 &&
    (modo === 'entrar' || dados.nome.trim().length > 2)

  return (
    <main className="mx-auto max-w-md px-5 py-16 text-white">
      <h1 className="text-2xl font-bold">
        {modo === 'entrar' ? 'Entrar' : 'Criar conta'}
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        {modo === 'entrar'
          ? 'Se já tens conta MoreThanMoney, é a mesma.'
          : 'Uma conta para o MTM Funded. Serve também no morethanmoney.pt, se um dia quiseres.'}
      </p>

      <div className="mt-8 space-y-4">
        {modo === 'criar' && (
          <Campo rotulo="Nome" valor={dados.nome} onChange={(v) => setDados({ ...dados, nome: v })} />
        )}
        <Campo
          rotulo="Email"
          tipo="email"
          valor={dados.email}
          onChange={(v) => setDados({ ...dados, email: v })}
        />
        <Campo
          rotulo="Palavra-passe"
          nota={modo === 'criar' ? 'Pelo menos 8 caracteres.' : undefined}
          tipo="password"
          valor={dados.password}
          onChange={(v) => setDados({ ...dados, password: v })}
        />
      </div>

      {erro && <p className="mt-4 text-sm text-red-400">{erro}</p>}

      <button
        onClick={submeter}
        disabled={!completo || ocupado}
        className="mt-6 w-full rounded-lg bg-[#D2A63C] py-3 text-sm font-semibold text-black disabled:opacity-40"
      >
        {ocupado ? 'Um momento…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
      </button>

      <button
        onClick={() => { setModo(modo === 'entrar' ? 'criar' : 'entrar'); setErro(null) }}
        className="mt-4 w-full text-sm text-zinc-500 hover:text-zinc-300"
      >
        {modo === 'entrar' ? 'Ainda não tenho conta' : 'Já tenho conta'}
      </button>

      <p className="mt-8 text-center text-xs leading-relaxed text-zinc-600">
        Ao continuar aceitas os{' '}
        <Link href="/mtmfunded/legal/termos" className="text-zinc-400 hover:underline">Termos</Link> e a{' '}
        <Link href="/mtmfunded/legal/privacidade" className="text-zinc-400 hover:underline">Privacidade</Link>{' '}
        do MTM Funded.
      </p>
    </main>
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
        className="mt-1.5 w-full rounded-lg border border-zinc-800 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-[#D2A63C]"
      />
    </label>
  )
}
