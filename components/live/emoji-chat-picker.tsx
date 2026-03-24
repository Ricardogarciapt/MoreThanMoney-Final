"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Smile } from "lucide-react"

const DEFAULT_EMOJIS = [
  "👍",
  "👏",
  "🔥",
  "❤️",
  "😂",
  "🎉",
  "📈",
  "📉",
  "✅",
  "❓",
  "🙏",
  "💪",
  "🚀",
  "⭐",
  "💯",
  "🤝",
  "👀",
  "💡",
  "⚠️",
  "🎯",
]

type Props = {
  onPick: (emoji: string) => void
  className?: string
}

export default function EmojiChatPicker({ onPick, className }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={className ?? "h-9 w-9 shrink-0 border-gray-600 p-0 text-gray-300"}
          aria-label="Inserir emoji"
        >
          <Smile className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[100] w-[220px] border-gray-700 bg-gray-900 p-2"
        align="start"
        side="top"
      >
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-gray-500">Emojis</p>
        <div className="grid grid-cols-5 gap-1">
          {DEFAULT_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="flex h-9 items-center justify-center rounded-md text-lg hover:bg-gray-800 active:scale-95"
              onClick={() => {
                onPick(emoji)
                setOpen(false)
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
