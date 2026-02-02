"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Brain, Dumbbell, MessageCircle, Calendar, Target, TrendingUp } from "lucide-react"
import ProtectedPage from "@/components/protected-page"
import MindsetTab from "@/components/mindset-fitness/mindset-tab"
import FitnessTab from "@/components/mindset-fitness/fitness-tab"
import TrainerDashboard from "@/components/mindset-fitness/trainer-dashboard"

export default function MindsetFitnessPage() {
  const { user } = useAuth()
  const [isTrainer, setIsTrainer] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkTrainerStatus = async () => {
      if (user?.id) {
        try {
          const response = await fetch(`/api/profile/get?id=${user.id}`, { credentials: 'include' })
          if (response.ok) {
            const data = await response.json()
            setIsTrainer(data.profile?.membership_level === 'vip' || data.profile?.user_type === 'admin')
          }
        } catch (error) {
          console.error('Erro ao verificar status trainer:', error)
        }
      }
      setLoading(false)
    }
    checkTrainerStatus()
  }, [user?.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#D2A63C] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">A carregar...</p>
        </div>
      </div>
    )
  }

  return (
    <ProtectedPage>
      <main className="min-h-screen bg-black text-white p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-[#D2A63C] to-[#BB8525] bg-clip-text text-transparent">
              Mindset & Fitness
            </h1>
            <p className="text-gray-400 text-lg">
              Desenvolve o teu corpo e mente para alcançares os teus objetivos
            </p>
          </div>

          {/* Trainer Dashboard (se for trainer) */}
          {isTrainer && (
            <div className="mb-8">
              <TrainerDashboard />
            </div>
          )}

          {/* Tabs */}
          <Tabs defaultValue="mindset" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 bg-gray-900">
              <TabsTrigger value="mindset" className="data-[state=active]:bg-[#D2A63C] data-[state=active]:text-black">
                <Brain className="w-5 h-5 mr-2" />
                Mindset
              </TabsTrigger>
              <TabsTrigger value="fitness" className="data-[state=active]:bg-[#D2A63C] data-[state=active]:text-black">
                <Dumbbell className="w-5 h-5 mr-2" />
                Fitness
              </TabsTrigger>
            </TabsList>

            <TabsContent value="mindset">
              <MindsetTab />
            </TabsContent>

            <TabsContent value="fitness">
              <FitnessTab />
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </ProtectedPage>
  )
}

