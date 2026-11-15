/**
 * O KIT DE CADA PAPEL — guiões, triagem e objecções, prontos a copiar.
 *
 * O conteúdo vive em `lib/backoffice-kit-papeis.ts` (com guarda); aqui só se desenha. Cada kit é
 * um <details> para a página não virar um muro de texto: quem tem um papel abre o seu.
 */
import type { KitPapel } from '@/lib/backoffice-kit-papeis'
import { NUNCA_SE_DIZ } from '@/lib/backoffice-kit-papeis'
import { Copiar } from '../_partes/copiar'

export function KitDosPapeis({ kits }: { kits: KitPapel[] }) {
  return (
    <div className="space-y-3">
      {kits.map((k, i) => (
        <details
          key={k.papel}
          open={kits.length === 1 || i === 0}
          className="group rounded-xl border border-white/[0.06] bg-zinc-950/70 p-4 open:border-[#D2A63C]/30"
        >
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-white">{k.nome}</span>
              <span className="text-xs text-zinc-500 group-open:hidden">abrir</span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">{k.missao}</p>
          </summary>

          <div className="mt-4 space-y-5">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Como trabalhar</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-zinc-300">
                {k.passos.map((p) => (
                  <li key={p} className="break-words">{p}</li>
                ))}
              </ol>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Guiões</h3>
              <ul className="mt-2 space-y-2">
                {k.guioes.map((g) => (
                  <li key={g.titulo} className="rounded-lg border border-white/[0.05] bg-black/30 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-white">{g.titulo}</div>
                        <div className="text-xs text-zinc-500">{g.quando}</div>
                      </div>
                      <Copiar texto={g.texto} />
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-300">{g.texto}</p>
                  </li>
                ))}
              </ul>
            </div>

            {k.objeccoes.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Objecções</h3>
                <ul className="mt-2 space-y-2 text-sm leading-relaxed">
                  {k.objeccoes.map((o) => (
                    <li key={o.diz}>
                      <span className="text-[#E9C46A]">{o.diz}</span>{' '}
                      <span className="text-zinc-300">{o.respondes}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      ))}

      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-red-300/80">O que nunca se diz</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-zinc-300">
          {NUNCA_SE_DIZ.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-zinc-500">
          Os guiões são pontos de partida: troca o que está entre chavetas e adapta à conversa.
          Conteúdo educativo, não constitui consultoria financeira.
        </p>
      </div>
    </div>
  )
}
