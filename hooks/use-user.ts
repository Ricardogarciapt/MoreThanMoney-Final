"use client"

import { useState, useEffect } from "react"

export interface User {
  id: string
  name: string
  email: string
  membershipType: "basic" | "premium" | "vip" | null
  isLoggedIn: boolean
  avatar?: string
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simular carregamento do usuário
    const loadUser = () => {
      try {
        const savedUser = localStorage.getItem("user")
        if (savedUser) {
          setUser(JSON.parse(savedUser))
        } else {
          // Usuário padrão para demonstração
          setUser({
            id: "1",
            name: "Usuário Demo",
            email: "demo@example.com",
            membershipType: null,
            isLoggedIn: false,
          })
        }
      } catch (error) {
        console.error("Erro ao carregar usuário:", error)
        setUser({
          id: "1",
          name: "Usuário Demo",
          email: "demo@example.com",
          membershipType: null,
          isLoggedIn: false,
        })
      } finally {
        setLoading(false)
      }
    }

    loadUser()
  }, [])

  const login = (userData: Partial<User>) => {
    const newUser = {
      ...user,
      ...userData,
      isLoggedIn: true,
    } as User

    setUser(newUser)
    localStorage.setItem("user", JSON.stringify(newUser))
  }

  const logout = () => {
    const loggedOutUser = {
      ...user,
      isLoggedIn: false,
      membershipType: null,
    } as User

    setUser(loggedOutUser)
    localStorage.setItem("user", JSON.stringify(loggedOutUser))
  }

  const updateMembership = (membershipType: "basic" | "premium" | "vip") => {
    if (user) {
      const updatedUser = {
        ...user,
        membershipType,
        isLoggedIn: true,
      }

      setUser(updatedUser)
      localStorage.setItem("user", JSON.stringify(updatedUser))
    }
  }

  return {
    user,
    loading,
    login,
    logout,
    updateMembership,
    isLoggedIn: user?.isLoggedIn || false,
    membershipType: user?.membershipType || null,
  }
}
