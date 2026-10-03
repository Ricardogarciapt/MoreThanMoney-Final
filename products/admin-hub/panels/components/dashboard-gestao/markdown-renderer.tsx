"use client"

import React from "react"

function renderInline(text: string): React.ReactNode[] {
  // Nota: grupos não-capturantes (?:...) para os sub-grupos do link,
  // para que o split não injete undefined no array quando bold/italic fazem match.
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[(?:[^\]]+)\]\((?:[^)]+)\))/)
  return parts.map((part, i) => {
    if (part == null) return null
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2 && !part.startsWith("**")) {
      return <em key={i} className="italic text-gray-300">{part.slice(1, -1)}</em>
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={i} className="bg-black/40 text-[#D2A63C] px-1.5 py-0.5 rounded text-[11px] font-mono border border-white/10">
          {part.slice(1, -1)}
        </code>
      )
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (linkMatch) {
      return (
        <a key={i} href={linkMatch[2]} target="_blank" rel="noopener noreferrer"
          className="text-[#D2A63C] underline underline-offset-2 hover:text-[#BB8525]">
          {linkMatch[1]}
        </a>
      )
    }
    return part
  })
}

export default function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n")
  const elements: React.ReactNode[] = []
  let codeBlock = false
  let codeLang = ""
  let codeLines: string[] = []
  let listBuffer: { ordered: boolean; items: string[] } | null = null

  const flushList = (key: string) => {
    if (!listBuffer) return
    const { ordered, items } = listBuffer
    elements.push(
      <ul key={key} className={`my-2 space-y-1 ${ordered ? "list-none" : "list-none"} ml-1`}>
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-gray-200">
            <span className="mt-1 flex-shrink-0 text-[#D2A63C]">{ordered ? `${i + 1}.` : "•"}</span>
            <span className="leading-relaxed">{renderInline(item)}</span>
          </li>
        ))}
      </ul>
    )
    listBuffer = null
  }

  lines.forEach((line, idx) => {
    const key = String(idx)

    // Code block toggle
    if (line.startsWith("```")) {
      if (!codeBlock) {
        flushList(key + "_fl")
        codeBlock = true
        codeLang = line.slice(3).trim()
        codeLines = []
      } else {
        codeBlock = false
        elements.push(
          <div key={key} className="my-3 rounded-xl overflow-hidden border border-white/10 bg-black/50">
            {codeLang && (
              <div className="px-4 py-1.5 bg-white/5 border-b border-white/10 flex items-center gap-2">
                <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">{codeLang}</span>
              </div>
            )}
            <pre className="overflow-x-auto p-4">
              <code className="text-xs text-green-300 font-mono leading-relaxed">
                {codeLines.join("\n")}
              </code>
            </pre>
          </div>
        )
        codeLines = []
        codeLang = ""
      }
      return
    }

    if (codeBlock) { codeLines.push(line); return }

    // Horizontal rule
    if (line.trim() === "---" || line.trim() === "***") {
      flushList(key + "_fl")
      elements.push(<hr key={key} className="border-white/10 my-4" />)
      return
    }

    // Headings
    if (line.startsWith("### ")) {
      flushList(key + "_fl")
      elements.push(<h3 key={key} className="text-sm font-semibold text-white mt-4 mb-1.5">{renderInline(line.slice(4))}</h3>)
      return
    }
    if (line.startsWith("## ")) {
      flushList(key + "_fl")
      elements.push(<h2 key={key} className="text-base font-semibold text-white mt-5 mb-2">{renderInline(line.slice(3))}</h2>)
      return
    }
    if (line.startsWith("# ")) {
      flushList(key + "_fl")
      elements.push(<h1 key={key} className="text-lg font-bold text-white mt-5 mb-2">{renderInline(line.slice(2))}</h1>)
      return
    }

    // Bullet list
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const text = line.slice(2)
      if (!listBuffer || listBuffer.ordered) {
        flushList(key + "_fl")
        listBuffer = { ordered: false, items: [text] }
      } else {
        listBuffer.items.push(text)
      }
      return
    }

    // Numbered list
    const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/)
    if (numberedMatch) {
      const text = numberedMatch[2]
      if (!listBuffer || !listBuffer.ordered) {
        flushList(key + "_fl")
        listBuffer = { ordered: true, items: [text] }
      } else {
        listBuffer.items.push(text)
      }
      return
    }

    // Non-list line — flush any pending list
    flushList(key + "_fl")

    // Empty line
    if (!line.trim()) {
      elements.push(<div key={key} className="h-2" />)
      return
    }

    // Blockquote
    if (line.startsWith("> ")) {
      elements.push(
        <blockquote key={key} className="border-l-2 border-[#D2A63C]/50 pl-3 my-2 text-gray-400 italic text-sm">
          {renderInline(line.slice(2))}
        </blockquote>
      )
      return
    }

    // Paragraph
    elements.push(
      <p key={key} className="text-gray-200 leading-relaxed">
        {renderInline(line)}
      </p>
    )
  })

  // Flush remaining list
  flushList("end")

  return <div className="space-y-1 text-sm">{elements}</div>
}
