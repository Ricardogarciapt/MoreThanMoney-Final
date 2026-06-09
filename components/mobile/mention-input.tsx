"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { User } from "lucide-react"

interface MentionUser {
  id: string
  full_name: string
  username?: string
  email?: string
}

interface MentionInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  rows?: number
  onMentionsChange?: (mentions: MentionUser[]) => void
}

export default function MentionInput({
  value,
  onChange,
  placeholder = "Escreve uma mensagem...",
  className = "",
  rows = 4,
  onMentionsChange
}: MentionInputProps) {
  const [showMentions, setShowMentions] = useState(false)
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([])
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)
  const [mentionQuery, setMentionQuery] = useState("")
  const [mentionPosition, setMentionPosition] = useState({ start: 0, end: 0 })
  const textareaRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null)
  const mentionListRef = useRef<HTMLDivElement>(null)

  // Buscar usuários para menção
  const searchUsers = useCallback(async (query: string) => {
    if (!query.trim()) {
      setMentionUsers([])
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const currentUserId = session?.user?.id

      let queryBuilder = supabase
        .from('profiles')
        .select('id, full_name, username, email')
        .or(`full_name.ilike.%${query}%,username.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(10)

      // Não mostrar o próprio usuário
      if (currentUserId) {
        queryBuilder = queryBuilder.neq('id', currentUserId)
      }

      const { data, error } = await queryBuilder

      if (error) {
        console.error('Erro ao buscar usuários:', error)
        return
      }

      setMentionUsers(data || [])
    } catch (error) {
      console.error('Erro ao buscar usuários:', error)
    }
  }, [])

  // Converter valor interno (com formato completo) para exibição (apenas nome)
  const getDisplayValue = (internalValue: string): string => {
    return internalValue.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1')
  }

  // Converter valor de exibição para interno (quando necessário)
  const getInternalValue = (displayValue: string, currentInternalValue: string): string => {
    // Extrair todas as menções do valor interno atual
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g
    const mentions: Array<{ name: string; id: string; fullMatch: string }> = []
    
    let match
    while ((match = mentionRegex.exec(currentInternalValue)) !== null) {
      mentions.push({
        name: match[1],
        id: match[2],
        fullMatch: match[0]
      })
    }

    // Se não há menções, retornar o displayValue como está
    if (mentions.length === 0) {
      return displayValue
    }

    // Reconstruir preservando menções existentes
    // Procurar por @nome no displayValue e substituir pelo formato completo
    let result = displayValue
    
    // Ordenar por tamanho do nome (maior primeiro) para evitar substituições parciais
    mentions.sort((a, b) => b.name.length - a.name.length)
    
    mentions.forEach(({ name, id, fullMatch }) => {
      const displayMention = `@${name}`
      // Usar regex para substituir apenas ocorrências completas (não parte de outra palavra)
      const regex = new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`, 'g')
      if (regex.test(result)) {
        result = result.replace(regex, fullMatch)
      }
    })

    return result
  }

  // Detectar @ e mostrar sugestões
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const displayValue = e.target.value
    const cursorPosition = e.target.selectionStart ?? 0

    // Converter para valor interno
    const internalValue = getInternalValue(displayValue, value)

    // Verificar se há @ antes do cursor no valor de exibição
    const textBeforeCursor = displayValue.substring(0, cursorPosition)
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/)

    if (mentionMatch) {
      const query = mentionMatch[1]
      // Calcular posição no valor interno
      const beforeCursorInternal = getDisplayValue(internalValue.substring(0, cursorPosition))
      const start = cursorPosition - query.length - 1 // -1 para incluir o @
      const end: number = cursorPosition

      setMentionQuery(query)
      setMentionPosition({ start, end })
      setShowMentions(true)
      setSelectedMentionIndex(0)
      searchUsers(query)
    } else {
      setShowMentions(false)
      setMentionUsers([])
    }

    // Atualizar valor interno
    onChange(internalValue)
    extractMentions(internalValue)
  }

  // Extrair menções do texto
  const extractMentions = (text: string) => {
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g
    const mentions: MentionUser[] = []
    let match

    while ((match = mentionRegex.exec(text)) !== null) {
      mentions.push({
        id: match[2],
        full_name: match[1],
        username: match[1]
      })
    }

    if (onMentionsChange) {
      onMentionsChange(mentions)
    }
  }

  // Inserir menção no texto
  const insertMention = (user: MentionUser) => {
    if (!textareaRef.current) return

    const input = textareaRef.current as HTMLTextAreaElement | HTMLInputElement
    const displayValue = getDisplayValue(value)
    const beforeMention = displayValue.substring(0, mentionPosition.start)
    const afterMention = displayValue.substring(mentionPosition.end)
    
    // No valor interno, usar formato completo
    const internalBeforeMention = value.substring(0, mentionPosition.start)
    const internalAfterMention = value.substring(mentionPosition.end)
    const mentionTextInternal = `@[${user.full_name || user.username || user.email}](${user.id})`
    const newInternalValue = internalBeforeMention + mentionTextInternal + internalAfterMention
    
    // No display, mostrar apenas o nome
    const mentionTextDisplay = `@${user.full_name || user.username || user.email}`
    const newDisplayValue = beforeMention + mentionTextDisplay + afterMention
    
    onChange(newInternalValue)

    // Atualizar o valor exibido no input
    if (input instanceof HTMLTextAreaElement) {
      input.value = newDisplayValue
    } else if (input instanceof HTMLInputElement) {
      input.value = newDisplayValue
    }

    // Reposicionar cursor após a menção (no display)
    setTimeout(() => {
      const newCursorPosition = beforeMention.length + mentionTextDisplay.length
      input.setSelectionRange(newCursorPosition, newCursorPosition)
      input.focus()
    }, 0)

    setShowMentions(false)
    setMentionUsers([])
    extractMentions(newInternalValue)
  }

  // Navegar nas sugestões com teclado
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showMentions || mentionUsers.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedMentionIndex(prev => 
        prev < mentionUsers.length - 1 ? prev + 1 : prev
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedMentionIndex(prev => prev > 0 ? prev - 1 : 0)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      if (mentionUsers[selectedMentionIndex]) {
        insertMention(mentionUsers[selectedMentionIndex])
      }
    } else if (e.key === 'Escape') {
      setShowMentions(false)
    }
  }

  // Scroll para item selecionado
  useEffect(() => {
    if (mentionListRef.current && showMentions) {
      const selectedElement = mentionListRef.current.children[selectedMentionIndex] as HTMLElement
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedMentionIndex, showMentions])

  // Calcular posição do popup
  const getMentionPopupStyle = () => {
    if (!textareaRef.current || !showMentions) return {}
    
    const input = textareaRef.current as HTMLTextAreaElement | HTMLInputElement
    const rect = input.getBoundingClientRect()
    return {
      top: `${rect.height + 8}px`,
      left: '0',
      width: '100%'
    }
  }

  // Valor para exibição (apenas nomes, sem IDs)
  const displayValue = getDisplayValue(value)

  return (
    <div className="relative">
      {rows === 1 ? (
        <input
          ref={textareaRef as React.RefObject<HTMLInputElement>}
          value={displayValue}
          onChange={handleInputChange as any}
          onKeyDown={handleKeyDown as any}
          placeholder={placeholder}
          className={className}
          type="text"
        />
      ) : (
        <textarea
          ref={textareaRef as React.RefObject<HTMLTextAreaElement>}
          value={displayValue}
          onChange={handleInputChange as any}
          onKeyDown={handleKeyDown as any}
          placeholder={placeholder}
          className={className}
          rows={rows}
        />
      )}

      {/* Popup de Sugestões de Menção */}
      {showMentions && mentionUsers.length > 0 && (
        <div
          ref={mentionListRef}
          className="absolute z-50 bg-gray-900 border border-[#D2A63C]/30 rounded-lg shadow-xl max-h-48 overflow-y-auto"
          style={getMentionPopupStyle()}
        >
          {mentionUsers.map((user, index) => (
            <button
              key={user.id}
              onClick={() => insertMention(user)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-800 transition-colors ${
                index === selectedMentionIndex ? 'bg-[#D2A63C]/20' : ''
              }`}
            >
              <div className="w-8 h-8 bg-[#D2A63C]/20 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-[#D2A63C]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">
                  {user.full_name || user.username || user.email}
                </p>
                {user.username && user.username !== user.full_name && (
                  <p className="text-gray-400 text-xs truncate">
                    @{user.username}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

