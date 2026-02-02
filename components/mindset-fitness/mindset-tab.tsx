"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Brain, Send, Loader2, User, MessageSquare } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"

const MENTORS = [
  { value: 'warren_buffett', label: 'Warren Buffett', icon: '💰' },
  { value: 'eric_worre', label: 'Eric Worre', icon: '🚀' },
  { value: 'grant_cardone', label: 'Grant Cardone', icon: '💪' },
  { value: 'daniel_g', label: 'Daniel G', icon: '🎯' },
  { value: 'rich_dad_poor_dad', label: 'Pai Rico Pai Pobre', icon: '📚' }
]

export default function MindsetTab() {
  const { user } = useAuth()
  const [selectedMentor, setSelectedMentor] = useState('warren_buffett')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessions, setSessions] = useState<any[]>([])
  const [sessionType, setSessionType] = useState('mindset')

  useEffect(() => {
    loadSessions()
  }, [])

  const loadSessions = async () => {
    try {
      const response = await fetch('/api/mindset-fitness/mindset?limit=20')
      if (response.ok) {
        const data = await response.json()
        setSessions(data.sessions || [])
      }
    } catch (error) {
      console.error('Erro ao carregar sessões:', error)
    }
  }

  const handleSend = async () => {
    if (!message.trim() || loading) return

    setLoading(true)
    try {
      const response = await fetch('/api/mindset-fitness/mindset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim(),
          mentor_type: selectedMentor,
          session_type: sessionType
        })
      })

      if (response.ok) {
        const data = await response.json()
        setSessions(prev => [data.session, ...prev])
        setMessage('')
      } else {
        alert('Erro ao enviar mensagem')
      }
    } catch (error) {
      console.error('Erro:', error)
      alert('Erro ao enviar mensagem')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Mentor Selection */}
      <Card className="bg-gray-900 border-[#D2A63C]/30">
        <CardHeader>
          <CardTitle className="text-[#D2A63C]">Escolhe o Teu Mentor</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            {MENTORS.map((mentor) => (
              <button
                key={mentor.value}
                onClick={() => setSelectedMentor(mentor.value)}
                className={`p-4 rounded-lg border-2 transition-all ${
                  selectedMentor === mentor.value
                    ? 'border-[#D2A63C] bg-[#D2A63C]/20'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="text-3xl mb-2">{mentor.icon}</div>
                <div className="text-sm font-medium">{mentor.label}</div>
              </button>
            ))}
          </div>
          <Select value={sessionType} onValueChange={setSessionType}>
            <SelectTrigger className="bg-gray-800 border-gray-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mindset">Desenvolvimento Pessoal</SelectItem>
              <SelectItem value="nwm">Network Marketing</SelectItem>
              <SelectItem value="finance">Finanças</SelectItem>
              <SelectItem value="goal_setting">Definição de Objetivos</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Chat Interface */}
      <Card className="bg-gray-900 border-[#D2A63C]/30">
        <CardHeader>
          <CardTitle className="text-[#D2A63C]">
            Conversa com {MENTORS.find(m => m.value === selectedMentor)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Messages */}
          <div className="space-y-4 mb-4 max-h-96 overflow-y-auto">
            {sessions.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <Brain className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Começa uma conversa com o teu mentor</p>
              </div>
            ) : (
              sessions.map((session) => (
                <div key={session.id} className="space-y-2">
                  <div className="flex justify-end">
                    <div className="bg-[#D2A63C] text-black rounded-lg px-4 py-2 max-w-[80%]">
                      <p className="text-sm">{session.user_message}</p>
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="bg-gray-800 rounded-lg px-4 py-2 max-w-[80%]">
                      <p className="text-sm whitespace-pre-wrap">{session.ai_response}</p>
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
              className="bg-gray-800 border-gray-700 text-white"
              disabled={loading}
            />
            <Button
              onClick={handleSend}
              disabled={loading || !message.trim()}
              className="bg-[#D2A63C] hover:bg-[#BB8525]"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

