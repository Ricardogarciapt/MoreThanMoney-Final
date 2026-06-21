"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Palette, Save, RefreshCw, Check } from "lucide-react"
import { themes, applyTheme, saveThemeToLocalStorage } from "@/lib/theme-config"

export default function ThemeManager() {
  const [selectedTheme, setSelectedTheme] = useState<string>('default')
  const [customColors, setCustomColors] = useState({
    primary: '#efb810',
    primaryLight: '#f9db5c',
    primaryDark: '#b28405',
    primaryDarker: '#795300',
  })
  const [isSaving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    // Carregar tema salvo
    fetchCurrentTheme()
  }, [])

  const fetchCurrentTheme = async () => {
    try {
      const response = await fetch('/api/admin/theme')
      const data = await response.json()
      
      if (data.theme) {
        setSelectedTheme(data.theme)
        if (data.colors) {
          setCustomColors({
            primary: data.colors.primary,
            primaryLight: data.colors.primaryLight,
            primaryDark: data.colors.primaryDark,
            primaryDarker: data.colors.primaryDarker,
          })
        }
      }
    } catch (error) {
      console.error('Erro ao carregar tema:', error)
    }
  }

  const handleThemeSelect = (themeId: string) => {
    setSelectedTheme(themeId)
    const theme = themes[themeId]
    if (theme) {
      setCustomColors({
        primary: theme.colors.primary,
        primaryLight: theme.colors.primaryLight,
        primaryDark: theme.colors.primaryDark,
        primaryDarker: theme.colors.primaryDarker,
      })
      
      // Aplicar tema imediatamente para preview
      applyTheme(theme)
    }
  }

  const handleColorChange = (colorKey: string, value: string) => {
    setCustomColors(prev => ({
      ...prev,
      [colorKey]: value
    }))
  }

  const handleSaveTheme = async () => {
    try {
      setSaving(true)
      setSaveSuccess(false)

      const response = await fetch('/api/admin/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          themeId: selectedTheme,
          colors: {
            ...customColors,
            background: '#000000',
            backgroundLight: '#1a1a1a',
            text: '#ffffff',
            textMuted: '#a0a0a0',
            border: `rgba(${parseInt(customColors.primary.slice(1, 3), 16)}, ${parseInt(customColors.primary.slice(3, 5), 16)}, ${parseInt(customColors.primary.slice(5, 7), 16)}, 0.3)`,
            accent: customColors.primary
          }
        })
      })

      const result = await response.json()

      if (response.ok) {
        const fullColors = {
          ...customColors,
          background: '#000000',
          backgroundLight: '#1a1a1a',
          text: '#ffffff',
          textMuted: '#a0a0a0',
          border: `rgba(${parseInt(customColors.primary.slice(1, 3), 16)}, ${parseInt(customColors.primary.slice(3, 5), 16)}, ${parseInt(customColors.primary.slice(5, 7), 16)}, 0.3)`,
          accent: customColors.primary,
        }
        applyTheme({
          id: selectedTheme,
          name: themes[selectedTheme]?.name ?? 'Personalizado',
          colors: fullColors,
        })
        saveThemeToLocalStorage(selectedTheme)

        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        alert(`Erro ao salvar tema: ${result.error}`)
      }
    } catch (error) {
      console.error('Erro ao salvar tema:', error)
      alert('Erro ao salvar tema')
    } finally {
      setSaving(false)
    }
  }

  const handleResetTheme = () => {
    handleThemeSelect('default')
  }

  return (
    <div className="space-y-6">
      <Card className="card-clean">
        <CardHeader>
          <CardTitle className="text-amber-400 flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Gestão de Tema do Site
          </CardTitle>
          <p className="text-gray-400 text-sm">
            Escolha um tema pré-definido ou personalize as cores do site
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Temas Pré-definidos */}
          <div>
            <Label className="text-white mb-3 block">Temas Pré-definidos</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(themes).map(([themeId, theme]) => (
                <button
                  key={themeId}
                  onClick={() => handleThemeSelect(themeId)}
                  className={`
                    p-4 rounded-lg border-2 transition-all
                    ${selectedTheme === themeId 
                      ? 'border-amber-500 bg-amber-500/10' 
                      : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                    }
                  `}
                >
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex gap-1">
                      <div 
                        className="w-6 h-6 rounded-full border border-white/20"
                        style={{ backgroundColor: theme.colors.primary }}
                      />
                      <div 
                        className="w-6 h-6 rounded-full border border-white/20"
                        style={{ backgroundColor: theme.colors.primaryLight }}
                      />
                      <div 
                        className="w-6 h-6 rounded-full border border-white/20"
                        style={{ backgroundColor: theme.colors.primaryDark }}
                      />
                    </div>
                    <span className="text-sm font-medium text-white">{theme.name}</span>
                    {selectedTheme === themeId && (
                      <Check className="w-4 h-4 text-amber-500" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Personalização de Cores */}
          <div>
            <Label className="text-white mb-3 block">Personalizar Cores</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-300 text-sm mb-2 block">Cor Principal</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={customColors.primary}
                    onChange={(e) => handleColorChange('primary', e.target.value)}
                    className="w-16 h-10 p-1 cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={customColors.primary}
                    onChange={(e) => handleColorChange('primary', e.target.value)}
                    className="flex-1 input-focus"
                    placeholder="#efb810"
                  />
                </div>
              </div>

              <div>
                <Label className="text-gray-300 text-sm mb-2 block">Cor Claro</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={customColors.primaryLight}
                    onChange={(e) => handleColorChange('primaryLight', e.target.value)}
                    className="w-16 h-10 p-1 cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={customColors.primaryLight}
                    onChange={(e) => handleColorChange('primaryLight', e.target.value)}
                    className="flex-1 input-focus"
                    placeholder="#f9db5c"
                  />
                </div>
              </div>

              <div>
                <Label className="text-gray-300 text-sm mb-2 block">Cor Escuro</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={customColors.primaryDark}
                    onChange={(e) => handleColorChange('primaryDark', e.target.value)}
                    className="w-16 h-10 p-1 cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={customColors.primaryDark}
                    onChange={(e) => handleColorChange('primaryDark', e.target.value)}
                    className="flex-1 input-focus"
                    placeholder="#b28405"
                  />
                </div>
              </div>

              <div>
                <Label className="text-gray-300 text-sm mb-2 block">Cor Mais Escuro</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={customColors.primaryDarker}
                    onChange={(e) => handleColorChange('primaryDarker', e.target.value)}
                    className="w-16 h-10 p-1 cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={customColors.primaryDarker}
                    onChange={(e) => handleColorChange('primaryDarker', e.target.value)}
                    className="flex-1 input-focus"
                    placeholder="#795300"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div>
            <Label className="text-white mb-3 block">Preview do Tema</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <div 
                  className="h-16 rounded-lg flex items-center justify-center text-black font-bold"
                  style={{ backgroundColor: customColors.primary }}
                >
                  Principal
                </div>
                <p className="text-xs text-gray-400 text-center">{customColors.primary}</p>
              </div>
              <div className="space-y-2">
                <div 
                  className="h-16 rounded-lg flex items-center justify-center text-black font-bold"
                  style={{ backgroundColor: customColors.primaryLight }}
                >
                  Claro
                </div>
                <p className="text-xs text-gray-400 text-center">{customColors.primaryLight}</p>
              </div>
              <div className="space-y-2">
                <div 
                  className="h-16 rounded-lg flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: customColors.primaryDark }}
                >
                  Escuro
                </div>
                <p className="text-xs text-gray-400 text-center">{customColors.primaryDark}</p>
              </div>
              <div className="space-y-2">
                <div 
                  className="h-16 rounded-lg flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: customColors.primaryDarker }}
                >
                  + Escuro
                </div>
                <p className="text-xs text-gray-400 text-center">{customColors.primaryDarker}</p>
              </div>
            </div>
          </div>

          {/* Botões de Ação */}
          <div className="flex gap-4">
            <Button
              onClick={handleSaveTheme}
              disabled={isSaving}
              className="btn-mtm-primary flex-1"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  A Guardar...
                </>
              ) : saveSuccess ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Tema Guardado!
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Guardar Tema
                </>
              )}
            </Button>
            
            <Button
              onClick={handleResetTheme}
              variant="outline"
              className="btn-mtm-secondary"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Restaurar Padrão
            </Button>
          </div>

          {saveSuccess && (
            <div className="bg-green-500/20 border border-green-500 rounded-lg p-4">
              <p className="text-green-400 text-sm font-medium">
                ✅ Tema guardado e aplicado — visível em todo o site e app-mobile.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
