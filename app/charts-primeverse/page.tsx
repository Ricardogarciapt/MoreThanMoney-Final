"use client"

import { useEffect, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import TradingViewWidget from "@/components/trading-view-widget"
import PositionCalculatorEN from "@/components/position-calculator-en"
import { BarChart3, Loader2, LogOut } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

// Primeverse color palette
const PRIMEVERSE_COLORS = {
  primary: "#015BF9",      // Primary blue
  white: "#FFFFFF",        // White
  dark: "#040507",         // Very dark black
  darkBlue: "#1200DE",     // Dark blue
  lightGray: "#EDECED",    // Light gray
}

const PRIMEVERSE_LOGIN_URL = "https://prime-verse.mn.co/sign_in?from=https%3A%2F%2Fprime-verse.mn.co%2F"
const PRIMEVERSE_BASE_URL = "https://prime-verse.mn.co"

// Admin credentials
const ADMIN_USERNAME = "admin"
const ADMIN_PASSWORD = "admin123"
const ADMIN_SESSION_KEY = "primeverse_admin_session"

// Available studies (without KillShot, Supernova and Smartmonics)
const availableStudies = ["GoldenZone", "Momentum", "Winzone", "Nexus", "Sinergy"] as const
type StudyKey = typeof availableStudies[number]

export default function ChartsPrimeversePage() {
  const [mounted, setMounted] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const [showAdminLogin, setShowAdminLogin] = useState(false)
  const [adminUsername, setAdminUsername] = useState("")
  const [adminPassword, setAdminPassword] = useState("")
  const { toast } = useToast()
  const [showScreener, setShowScreener] = useState(false)
  const [selectedStudies, setSelectedStudies] = useState<StudyKey[]>(["GoldenZone"])

  // Check admin session
  const checkAdminSession = (): boolean => {
    if (typeof window === "undefined") return false
    const adminSession = localStorage.getItem(ADMIN_SESSION_KEY)
    if (adminSession) {
      try {
        const sessionData = JSON.parse(adminSession)
        // Check if session is still valid (24 hours)
        if (Date.now() - sessionData.timestamp < 24 * 60 * 60 * 1000) {
          return true
        } else {
          localStorage.removeItem(ADMIN_SESSION_KEY)
        }
      } catch {
        localStorage.removeItem(ADMIN_SESSION_KEY)
      }
    }
    return false
  }

  // Handle admin login
  const handleAdminLogin = () => {
    if (adminUsername === ADMIN_USERNAME && adminPassword === ADMIN_PASSWORD) {
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({
        username: ADMIN_USERNAME,
        timestamp: Date.now()
      }))
      setIsAuthenticated(true)
      setIsChecking(false)
      setShowAdminLogin(false)
      setAdminUsername("")
      setAdminPassword("")
      toast({
        title: "✅ Admin Login Successful",
        description: "Welcome, admin!",
      })
    } else {
      toast({
        title: "❌ Invalid Credentials",
        description: "Username or password is incorrect",
        variant: "destructive",
      })
    }
  }

  // Verify Prime Verse authentication
  useEffect(() => {
    let mounted = true
    
    const checkPrimeVerseAuth = async () => {
      try {
        setIsChecking(true)
        
        // Check if there are return parameters after external login
        const urlParams = new URLSearchParams(window.location.search)
        const returnFromLogin = urlParams.get('return') === 'true'
        const loginToken = urlParams.get('token')
        
        // If returned from login, wait a bit for session to sync
        if (returnFromLogin || loginToken) {
          console.log("🔄 [PRIMEVERSE] Returned from external login, waiting for synchronization...")
          await new Promise(resolve => setTimeout(resolve, 2000))
          
          // Clear URL parameters
          if (returnFromLogin || loginToken) {
            window.history.replaceState({}, document.title, window.location.pathname)
          }
        }
        
        // Verify session multiple times (with retry)
        let attempts = 0
        const maxAttempts = 5
        
        while (attempts < maxAttempts && mounted) {
          attempts++
          console.log(`🔍 [PRIMEVERSE] Attempt ${attempts}/${maxAttempts} to verify session...`)
          
          // Check if there's a session on prime-verse.mn.co via fetch
          try {
            const response = await fetch(`${PRIMEVERSE_BASE_URL}/api/v1/users/me`, {
              method: 'GET',
              credentials: 'include',
              mode: 'cors',
              headers: {
                'Accept': 'application/json',
              }
            })
            
            if (response.ok) {
              const userData = await response.json()
              if (userData && userData.id) {
                console.log("✅ [PRIMEVERSE] Session found:", userData.email || userData.id)
                if (mounted) {
                  setIsAuthenticated(true)
                  setIsChecking(false)
                }
                return
              }
            }
          } catch (fetchError) {
            console.log("⚠️ [PRIMEVERSE] Error verifying session via API (may be CORS):", fetchError)
          }
          
          // Try to verify via cookie/localStorage as fallback (more permissive)
          const hasSessionCookie = document.cookie.includes('_primeverse_session') || 
                                   document.cookie.includes('primeverse') ||
                                   document.cookie.includes('mn.co') ||
                                   localStorage.getItem('primeverse_session') ||
                                   sessionStorage.getItem('primeverse_session')
          
          if (hasSessionCookie) {
            // If there's a cookie, assume logged in (API may fail due to CORS)
            console.log("✅ [PRIMEVERSE] Session cookie found, allowing access")
            if (mounted) {
              setIsAuthenticated(true)
              setIsChecking(false)
            }
            return
          }

          // If session not found, wait before trying again
          if (attempts < maxAttempts) {
            console.log(`⏳ [PRIMEVERSE] Session not found, waiting ${attempts * 500}ms...`)
            await new Promise(resolve => setTimeout(resolve, attempts * 500))
          }
        }
        
        // If we got here, no session found after all attempts
        console.log("⚠️ [PRIMEVERSE] No session found after all attempts")
        redirectToLogin()
      } catch (error) {
        console.error("❌ [PRIMEVERSE] Error verifying authentication:", error)
        redirectToLogin()
      }
    }

    const redirectToLogin = () => {
      if (!mounted) return
      setIsChecking(false)
    }

    setMounted(true)
    checkPrimeVerseAuth()

    // Add listener for when page gains focus (after returning from login)
    const handleFocus = () => {
      console.log("🌐 [PRIMEVERSE] Page focused, verifying authentication again...")
      if (!isAuthenticated) {
        checkPrimeVerseAuth()
      }
    }
    
    // Add listener for when page becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log("👁️ [PRIMEVERSE] Page visible, verifying authentication...")
        checkPrimeVerseAuth()
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      mounted = false
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isAuthenticated])

  // Filter allowed studies
  const handleStudiesChange = useCallback((studies: string[]) => {
    const filtered = studies.filter(s => availableStudies.includes(s as StudyKey)) as StudyKey[]
    setSelectedStudies(filtered.length > 0 ? filtered : ["GoldenZone"])
  }, [])

  const handleLogout = () => {
    // Clear admin session if exists
    localStorage.removeItem(ADMIN_SESSION_KEY)
    
    // Clear related cookies and localStorage
    document.cookie.split(";").forEach((c) => {
      if (c.trim().startsWith('_primeverse_session') || c.trim().startsWith('primeverse')) {
        document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/")
      }
    })
    localStorage.removeItem('primeverse_session')
    
    // Reset auth state
    setIsAuthenticated(false)
    setIsChecking(true)
    
    // Redirect to login
    window.location.href = PRIMEVERSE_LOGIN_URL
  }

  const handleLoginRedirect = () => {
    const currentUrl = window.location.href
    const loginUrl = `${PRIMEVERSE_LOGIN_URL}&redirect=${encodeURIComponent(currentUrl)}`
    window.location.href = loginUrl
  }

  if (!mounted || isChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: PRIMEVERSE_COLORS.dark }}>
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4" style={{ color: PRIMEVERSE_COLORS.primary }} />
          <p style={{ color: PRIMEVERSE_COLORS.lightGray, fontFamily: "'Gonero ExtExp Regular', sans-serif" }}>Checking access...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: PRIMEVERSE_COLORS.dark }}>
        <div className="text-center max-w-md mx-auto p-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold mb-4" style={{ color: PRIMEVERSE_COLORS.white, fontFamily: "'Gonero ExtExp Bolo', sans-serif" }}>Access Required</h2>
            <p className="text-sm mb-4" style={{ color: PRIMEVERSE_COLORS.lightGray, fontFamily: "'Gonero ExtExp Regular', sans-serif" }}>
              You need to log in to Prime Verse to access Charts Primeverse.
            </p>
            <p className="text-xs mb-6" style={{ color: PRIMEVERSE_COLORS.lightGray + "80", fontFamily: "'Gonero ExtExp Regular', sans-serif" }}>
              After logging in at prime-verse.mn.co, return to this page to access.
            </p>
          </div>
          
          <div className="flex flex-col gap-3">
            <Button
              onClick={handleLoginRedirect}
              className="w-full rounded-lg font-medium"
              style={{ 
                backgroundColor: PRIMEVERSE_COLORS.primary, 
                borderColor: PRIMEVERSE_COLORS.primary, 
                color: PRIMEVERSE_COLORS.white,
                fontFamily: "'Gonero ExtExp Regular', sans-serif"
              }}
            >
              Go to Prime Verse Login
            </Button>
            
            <Button
              onClick={() => setShowAdminLogin(true)}
              variant="outline"
              className="w-full rounded-lg font-medium"
              style={{ 
                backgroundColor: 'transparent', 
                borderColor: PRIMEVERSE_COLORS.primary + "60", 
                color: PRIMEVERSE_COLORS.lightGray,
                fontFamily: "'Gonero ExtExp Regular', sans-serif"
              }}
            >
              Admin Login
            </Button>
            
            <Button
              onClick={async () => {
                setIsChecking(true)
                // Check admin session first
                if (checkAdminSession()) {
                  setIsAuthenticated(true)
                  setIsChecking(false)
                  return
                }
                await new Promise(resolve => setTimeout(resolve, 1000))
                // Verify again
                try {
                  const response = await fetch(`${PRIMEVERSE_BASE_URL}/api/v1/users/me`, {
                    method: 'GET',
                    credentials: 'include',
                    mode: 'cors',
                  })
                  if (response.ok) {
                    const userData = await response.json()
                    if (userData && userData.id) {
                      setIsAuthenticated(true)
                      setIsChecking(false)
                      return
                    }
                  }
                } catch (error) {
                  // Check cookie as fallback (more permissive)
                  const hasSessionCookie = document.cookie.includes('_primeverse_session') || 
                                           document.cookie.includes('primeverse') ||
                                           document.cookie.includes('mn.co') ||
                                           localStorage.getItem('primeverse_session') ||
                                           sessionStorage.getItem('primeverse_session')
                  if (hasSessionCookie) {
                    setIsAuthenticated(true)
                    setIsChecking(false)
                    return
                  }
                }
                setIsChecking(false)
                toast({
                  title: "⚠️ Still no session",
                  description: "Please log in to Prime Verse first.",
                  variant: "destructive",
                })
              }}
              variant="outline"
              className="w-full rounded-lg font-medium"
              style={{ 
                backgroundColor: 'transparent', 
                borderColor: PRIMEVERSE_COLORS.primary + "60", 
                color: PRIMEVERSE_COLORS.lightGray,
                fontFamily: "'Gonero ExtExp Regular', sans-serif"
              }}
            >
              Check Again
            </Button>
          </div>
          
          {/* Admin Login Dialog */}
          {showAdminLogin && (
            <Dialog open={showAdminLogin} onOpenChange={setShowAdminLogin}>
              <DialogContent className="border rounded-lg" style={{ backgroundColor: PRIMEVERSE_COLORS.dark, borderColor: PRIMEVERSE_COLORS.primary + "60" }}>
                <DialogHeader>
                  <DialogTitle style={{ color: PRIMEVERSE_COLORS.white, fontSize: '16px', fontWeight: 600, fontFamily: "'Gonero ExtExp Bolo', sans-serif" }}>Admin Login</DialogTitle>
                  <DialogDescription style={{ color: PRIMEVERSE_COLORS.lightGray, fontSize: '12px', fontFamily: "'Gonero ExtExp Regular', sans-serif" }}>
                    Enter admin credentials to access Charts Primeverse
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label style={{ color: PRIMEVERSE_COLORS.lightGray, fontSize: '12px', fontFamily: "'Gonero ExtExp Regular', sans-serif" }}>Username</Label>
                    <Input
                      value={adminUsername}
                      onChange={(e) => setAdminUsername(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAdminLogin()
                        }
                      }}
                      placeholder="admin"
                      className="mt-2 border rounded-lg"
                      style={{ backgroundColor: PRIMEVERSE_COLORS.darkBlue, borderColor: PRIMEVERSE_COLORS.primary + "60", color: PRIMEVERSE_COLORS.white, fontFamily: "'Gonero ExtExp Regular', sans-serif" }}
                      autoFocus
                    />
                  </div>
                  <div>
                    <Label style={{ color: PRIMEVERSE_COLORS.lightGray, fontSize: '12px', fontFamily: "'Gonero ExtExp Regular', sans-serif" }}>Password</Label>
                    <Input
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAdminLogin()
                        }
                      }}
                      placeholder="••••••••"
                      className="mt-2 border rounded-lg"
                      style={{ backgroundColor: PRIMEVERSE_COLORS.darkBlue, borderColor: PRIMEVERSE_COLORS.primary + "60", color: PRIMEVERSE_COLORS.white, fontFamily: "'Gonero ExtExp Regular', sans-serif" }}
                    />
                  </div>
                  <Button
                    onClick={handleAdminLogin}
                    className="w-full rounded-lg font-medium"
                    style={{ backgroundColor: PRIMEVERSE_COLORS.primary, borderColor: PRIMEVERSE_COLORS.primary, color: PRIMEVERSE_COLORS.white, fontFamily: "'Gonero ExtExp Regular', sans-serif" }}
                  >
                    Login
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: PRIMEVERSE_COLORS.dark, color: PRIMEVERSE_COLORS.white }}>
      {/* Header with Logo and Title */}
      <header className="border-b sticky top-0 z-50 backdrop-blur-sm" style={{ backgroundColor: PRIMEVERSE_COLORS.dark + "F0", borderColor: PRIMEVERSE_COLORS.primary + "30" }}>
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Primeverse Logo - using provided images */}
            <div className="flex items-center gap-3">
              {/* Logo with AV/VERSE symbol */}
              <div className="relative h-10 w-10 flex items-center justify-center">
                <div 
                  className="absolute inset-0 rounded"
                  style={{ 
                    background: `linear-gradient(135deg, ${PRIMEVERSE_COLORS.dark} 0%, ${PRIMEVERSE_COLORS.primary} 100%)`,
                    opacity: 0.3
                  }}
                />
                <span 
                  className="text-2xl font-bold relative z-10"
                  style={{ color: PRIMEVERSE_COLORS.primary }}
                >
                  AV
                </span>
              </div>
              <h1 
                className="text-2xl font-bold tracking-wide uppercase"
                style={{ 
                  color: PRIMEVERSE_COLORS.primary,
                  fontFamily: "'Gonero ExtExp Bolo', sans-serif",
                  letterSpacing: '0.1em',
                  fontWeight: 700
                }}
              >
                Primeverse
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant={showScreener ? "default" : "outline"}
              size="sm"
              className="h-9 px-4 text-sm font-medium rounded-lg transition-all duration-200"
              style={
                showScreener
                  ? { 
                      backgroundColor: PRIMEVERSE_COLORS.primary, 
                      borderColor: PRIMEVERSE_COLORS.primary, 
                      color: PRIMEVERSE_COLORS.white,
                      fontFamily: "'Gonero ExtExp Regular', sans-serif"
                    }
                  : { 
                      backgroundColor: 'transparent', 
                      borderColor: PRIMEVERSE_COLORS.primary + "60", 
                      color: PRIMEVERSE_COLORS.lightGray,
                      fontFamily: "'Gonero ExtExp Regular', sans-serif"
                    }
              }
              onClick={() => setShowScreener((prev) => !prev)}
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              {showScreener ? "Hide Screener" : "Show Screener"}
            </Button>
            
            <Button
              onClick={handleLogout}
              size="sm"
              variant="outline"
              className="h-9 px-3 text-xs font-medium border rounded-lg transition-colors"
              style={{ 
                backgroundColor: 'transparent', 
                borderColor: PRIMEVERSE_COLORS.primary + "60", 
                color: PRIMEVERSE_COLORS.lightGray,
                fontFamily: "'Gonero ExtExp Regular', sans-serif"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = PRIMEVERSE_COLORS.primary + "20"
                e.currentTarget.style.color = PRIMEVERSE_COLORS.white
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = PRIMEVERSE_COLORS.lightGray
              }}
            >
              <LogOut className="h-3 w-3 mr-1.5" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* TradingView Widget */}
      <div className="w-full px-4 py-6">
        <div className="max-w-[98%] mx-auto rounded-lg border p-4 mb-6" style={{ backgroundColor: PRIMEVERSE_COLORS.dark, borderColor: PRIMEVERSE_COLORS.primary + "20" }}>
          <TradingViewWidget 
            showScreener={showScreener}
            externalStudies={selectedStudies as any}
            excludedStudies={["KillShot", "Supernova", "Smartmonics"]}
            onStudiesChange={handleStudiesChange}
          />
        </div>

        {/* Position Size Calculator */}
        <div className="max-w-[98%] mx-auto">
          <PositionCalculatorEN />
        </div>
      </div>
    </div>
  )
}

