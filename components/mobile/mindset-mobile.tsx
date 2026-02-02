"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Brain, BookOpen, Target, TrendingUp, Send, Loader2, MessageCircle } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"

const MENTORS = [
  { value: 'warren_buffett', label: 'Warren Buffett', icon: '💰' },
  { value: 'eric_worre', label: 'Eric Worre', icon: '🚀' },
  { value: 'grant_cardone', label: 'Grant Cardone', icon: '💪' },
  { value: 'daniel_g', label: 'Daniel G', icon: '🎯' },
  { value: 'rich_dad_poor_dad', label: 'Pai Rico Pai Pobre', icon: '📚' }
]

export default function MindsetMobile() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMentor, setSelectedMentor] = useState('warren_buffett')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    loadSessions()
  }, [])

  const loadSessions = async () => {
    try {
      const response = await fetch('/api/mindset-fitness/mindset?limit=10')
      if (response.ok) {
        const data = await response.json()
        setSessions(data.sessions || [])
      }
    } catch (error) {
      console.error('Erro ao carregar sessões:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    if (!message.trim() || sending) return

    setSending(true)
    try {
      const response = await fetch('/api/mindset-fitness/mindset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          mentor_type: selectedMentor,
          session_type: 'mindset'
        })
      })

      if (response.ok) {
        const data = await response.json()
        setSessions(prev => [data.session, ...prev])
        setMessage('')
        loadSessions() // Recarregar para ter todas
      }
    } catch (error) {
      console.error('Erro:', error)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      <div className="text-center mb-4">
        <Brain className="w-10 h-10 text-[#D2A63C] mx-auto mb-2" />
        <h2 className="text-xl font-bold text-white">Mindset</h2>
        <p className="text-gray-400 text-xs">Mentoria com IA</p>
      </div>

      {/* Seleção de Mentor */}
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-3">
          <Select value={selectedMentor} onValueChange={setSelectedMentor}>
            <SelectTrigger className="bg-gray-900 border-gray-700 text-white text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MENTORS.map((mentor) => (
                <SelectItem key={mentor.value} value={mentor.value}>
                  {mentor.icon} {mentor.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Chat */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-[#D2A63C]" />
            {MENTORS.find(m => m.value === selectedMentor)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Mensagens */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {sessions.length === 0 ? (
              <p className="text-gray-400 text-xs text-center py-4">
                Começa uma conversa com o teu mentor
              </p>
            ) : (
              sessions.slice(0, 5).map((session) => (
                <div key={session.id} className="space-y-1">
                  <div className="flex justify-end">
                    <div className="bg-[#D2A63C] text-black rounded-lg px-3 py-1.5 max-w-[80%]">
                      <p className="text-xs">{session.user_message}</p>
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="bg-gray-700 rounded-lg px-3 py-1.5 max-w-[80%]">
                      <p className="text-xs text-gray-200 whitespace-pre-wrap">{session.ai_response}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Escreve a tua mensagem..."
              className="bg-gray-900 border-gray-700 text-white text-sm"
              disabled={sending}
            />
            <Button
              onClick={handleSend}
              disabled={sending || !message.trim()}
              size="icon"
              className="bg-[#D2A63C] hover:bg-[#BB8525]"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-3 text-center">
            <Target className="w-6 h-6 text-[#D2A63C] mx-auto mb-1" />
            <p className="text-white text-xs font-medium">Metas</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-3 text-center">
            <TrendingUp className="w-6 h-6 text-[#D2A63C] mx-auto mb-1" />
            <p className="text-white text-xs font-medium">Progresso</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

