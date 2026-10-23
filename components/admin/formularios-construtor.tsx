"use client"

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import type { CustomFormField, CustomFormFieldType } from "@/lib/custom-forms"

/**
 * O construtor visual dos campos de um formulário. Escreve o MESMO `fields` que o JSON escrevia —
 * a validação continua a ser a do servidor (`sanitizeFields`) —, mas sem obrigar ninguém a saber
 * JSON para pôr um campo «Telefone» num formulário de captação.
 */
const TIPOS: Array<{ id: CustomFormFieldType; nome: string }> = [
  { id: "text", nome: "Texto curto" },
  { id: "email", nome: "Email" },
  { id: "textarea", nome: "Texto longo" },
  { id: "select", nome: "Escolha (lista)" },
  { id: "chips", nome: "Escolha múltipla" },
  { id: "checkbox", nome: "Caixa (sim/não)" },
]

/** Os campos que um formulário de leads quase sempre tem — e com os nomes que a ingestão reconhece. */
const PRONTOS: CustomFormField[] = [
  { name: "nome", label: "Nome", type: "text", required: true, half: true },
  { name: "email", label: "Email", type: "email", required: true, half: true },
  { name: "telefone", label: "Telemóvel / WhatsApp", type: "text", half: true },
  { name: "instagram", label: "Instagram", type: "text", half: true, placeholder: "@" },
  { name: "interesse", label: "O que procuras?", type: "select", options: ["Aprender trading", "Copytrading", "Scanner", "Outro"] },
  { name: "consentimento", label: "Aceito ser contactado pela MoreThanMoney", type: "checkbox", required: true },
]

const nomeDe = (label: string) =>
  label.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "campo"

export function ConstrutorCampos({ campos, aoMudar }: { campos: CustomFormField[]; aoMudar: (c: CustomFormField[]) => void }) {
  const mudar = (i: number, p: Partial<CustomFormField>) => aoMudar(campos.map((c, j) => (j === i ? { ...c, ...p } : c)))
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= campos.length) return
    const c = [...campos]
    ;[c[i], c[j]] = [c[j], c[i]]
    aoMudar(c)
  }
  const usados = new Set(campos.map((c) => c.name))
  const acrescentar = (f: CustomFormField) => {
    let name = f.name
    for (let n = 2; usados.has(name); n++) name = `${f.name}_${n}`
    aoMudar([...campos, { ...f, name }])
  }

  return (
    <div className="space-y-2">
      {campos.map((c, i) => (
        <div key={i} className="rounded-lg border border-gray-800 bg-black/30 p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={c.label}
              onChange={(e) => mudar(i, { label: e.target.value, ...(c.name.startsWith("campo") || c.name === nomeDe(c.label) ? { name: nomeDe(e.target.value) } : {}) })}
              placeholder="Pergunta"
              className="min-w-[180px] flex-1 rounded-md border border-gray-700 bg-black/40 px-2 py-1.5 text-sm text-gray-100"
            />
            <select value={c.type} onChange={(e) => mudar(i, { type: e.target.value as CustomFormFieldType })} className="rounded-md border border-gray-700 bg-black/40 px-2 py-1.5 text-xs text-gray-200">
              {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
            <label className="flex items-center gap-1 text-[11px] text-gray-400"><input type="checkbox" checked={c.required === true} onChange={(e) => mudar(i, { required: e.target.checked || undefined })} /> obrigatório</label>
            <label className="flex items-center gap-1 text-[11px] text-gray-400"><input type="checkbox" checked={c.half === true} onChange={(e) => mudar(i, { half: e.target.checked || undefined })} /> meia largura</label>
            <div className="ml-auto flex gap-1">
              <button type="button" onClick={() => mover(i, -1)} className="rounded p-1 text-gray-500 hover:text-gray-200" title="Subir"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => mover(i, 1)} className="rounded p-1 text-gray-500 hover:text-gray-200" title="Descer"><ArrowDown className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => aoMudar(campos.filter((_, j) => j !== i))} className="rounded p-1 text-rose-400/70 hover:text-rose-300" title="Apagar"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <input value={c.name} onChange={(e) => mudar(i, { name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} placeholder="nome_interno" className="rounded-md border border-gray-800 bg-black/40 px-2 py-1 font-mono text-[11px] text-gray-400" title="Nome interno (a-z, 0-9, _). «email», «telefone», «instagram» e «interesse» entram no CRM." />
            <input value={c.placeholder ?? ""} onChange={(e) => mudar(i, { placeholder: e.target.value || undefined })} placeholder="Texto de exemplo" className="rounded-md border border-gray-800 bg-black/40 px-2 py-1 text-[11px] text-gray-300" />
            {(c.type === "select" || c.type === "chips") ? (
              <input value={(c.options ?? []).join(", ")} onChange={(e) => mudar(i, { options: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="Opções, separadas por vírgula" className="rounded-md border border-[#D2A63C]/30 bg-black/40 px-2 py-1 text-[11px] text-gray-200" />
            ) : (
              <input value={c.section ?? ""} onChange={(e) => mudar(i, { section: e.target.value || undefined })} placeholder="Começa secção (opcional)" className="rounded-md border border-gray-800 bg-black/40 px-2 py-1 text-[11px] text-gray-300" />
            )}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <button type="button" onClick={() => acrescentar({ name: `campo_${campos.length + 1}`, label: "", type: "text" })} className="inline-flex items-center gap-1 rounded-md border border-[#D2A63C]/40 px-2.5 py-1 text-xs text-[#E9C46A] hover:bg-[#D2A63C]/10">
          <Plus className="h-3.5 w-3.5" /> Campo
        </button>
        <span className="text-[11px] text-gray-500">ou já pronto:</span>
        {PRONTOS.filter((p) => !usados.has(p.name)).map((p) => (
          <button key={p.name} type="button" onClick={() => acrescentar(p)} className="rounded-md border border-gray-700 px-2 py-1 text-[11px] text-gray-300 hover:border-gray-500">
            + {p.label.split(" ")[0]}
          </button>
        ))}
      </div>
    </div>
  )
}
