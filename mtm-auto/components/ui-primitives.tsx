"use client"

import { cn } from "@mtm-auto/lib/utils"
import type { LucideIcon } from "lucide-react"
import { ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { ReactNode, useState } from "react"

export type ClientMenuItem = {
  id: string
  label: string
  icon: LucideIcon
}

export type AdminMenuItem = ClientMenuItem

type SidebarProps = {
  items: ClientMenuItem[]
  activeItem: string
  onItemClick: (id: string) => void
  collapsed: boolean
  onToggleCollapse: () => void
  /** Telemóvel: menu em gaveta com overlay (controlado por `drawerOpen`). */
  mobileDrawer?: boolean
  drawerOpen?: boolean
}

export function Sidebar({
  items,
  activeItem,
  onItemClick,
  collapsed,
  onToggleCollapse,
  mobileDrawer,
  drawerOpen,
}: SidebarProps) {
  const showLabels = mobileDrawer || !collapsed

  return (
    <aside
      className={cn(
        "fixed left-0 z-40 flex flex-col border-r border-[var(--mtm-border)] bg-[var(--mtm-bg2)] top-[calc(4rem+env(safe-area-inset-top,0px))] h-[calc(100dvh-4rem-env(safe-area-inset-top,0px))]",
        mobileDrawer
          ? cn(
              "z-[45] w-64 shadow-2xl transition-transform duration-300 ease-out",
              drawerOpen ? "translate-x-0" : "-translate-x-full pointer-events-none",
            )
          : cn("transition-[width] duration-300", collapsed ? "w-20" : "w-64"),
      )}
    >
      {!mobileDrawer ? (
        <div className="flex justify-end border-b border-[var(--mtm-border)] p-2">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded-lg p-2 text-[var(--mtm-text3)] transition-colors hover:bg-[var(--mtm-bg3)] hover:text-[var(--mtm-text)]"
            aria-label={collapsed ? "Expandir menu" : "Colapsar menu"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      ) : (
        <div className="border-b border-[var(--mtm-border)] px-3 py-2.5">
          <p className="mtm-font-mono text-[10px] uppercase tracking-wider text-[var(--mtm-text3)]">Menu</p>
        </div>
      )}
      <nav className="flex-1 space-y-1 overflow-y-auto overscroll-contain p-2 touch-pan-y">
        {items.map((item) => {
          const Icon = item.icon
          const active = activeItem === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onItemClick(item.id)}
              className={cn(
                "mtm-font-condensed flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors",
                active
                  ? "bg-[rgba(79,255,176,0.12)] text-[var(--mtm-green)]"
                  : "text-[var(--mtm-text2)] hover:bg-[var(--mtm-bg3)] hover:text-[var(--mtm-text)]",
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {showLabels ? <span className="truncate">{item.label}</span> : null}
            </button>
          )
        })}
      </nav>
      <div className="border-t border-[var(--mtm-border)] p-2">
        <Link
          href="/app-mobile"
          className="mtm-font-condensed flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-[var(--mtm-text2)] transition-colors hover:bg-[var(--mtm-bg3)] hover:text-[var(--mtm-cyan)]"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          {showLabels ? <span>Voltar à App Mobile</span> : null}
        </Link>
      </div>
    </aside>
  )
}

// Stat Card
interface StatCardProps {
  label: string
  value: string | ReactNode
  subtitle?: string
  subtitleUp?: boolean
  subtitleDown?: boolean
  accent?: 'green' | 'gold' | 'blue' | 'red' | 'purple'
}

export function StatCard({ label, value, subtitle, subtitleUp, subtitleDown, accent = 'green' }: StatCardProps) {
  const accentColors = {
    green: 'var(--mtm-green)',
    gold: 'var(--mtm-gold)',
    blue: 'var(--mtm-cyan)',
    red: 'var(--mtm-red)',
    purple: 'var(--mtm-purple)'
  }
  
  return (
    <div className="bg-[var(--mtm-bg3)] border border-[var(--mtm-border)] rounded-lg p-4 relative overflow-hidden">
      <div 
        className="absolute top-0 left-0 right-0 h-px opacity-60"
        style={{ background: `linear-gradient(90deg, transparent, ${accentColors[accent]}, transparent)` }}
      />
      <div className="text-[10px] text-[var(--mtm-text3)] tracking-[2px] uppercase font-mono mb-1.5">{label}</div>
      <div className="font-bold text-xl sm:text-2xl break-words">{value}</div>
      {subtitle && (
        <div className={cn(
          "text-[10px] font-mono mt-0.5",
          subtitleUp && "text-[var(--mtm-green)]",
          subtitleDown && "text-[var(--mtm-red)]",
          !subtitleUp && !subtitleDown && "text-[var(--mtm-text3)]"
        )}>
          {subtitle}
        </div>
      )}
    </div>
  )
}

// Card
interface CardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
}

export function Card({ children, className, onClick }: CardProps) {
  return (
    <div 
      className={cn(
        "bg-[var(--mtm-bg2)] border border-[var(--mtm-border)] rounded-lg p-4",
        onClick && "cursor-pointer transition-all hover:border-[var(--mtm-green)] hover:-translate-y-0.5",
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

// Card Header
interface CardHeaderProps {
  title: string
  action?: ReactNode
  badge?: ReactNode
}

export function CardHeader({ title, action, badge }: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3.5">
      <h3 className="font-bold text-sm">{title}</h3>
      <div className="flex items-center gap-2">
        {badge}
        {action}
      </div>
    </div>
  )
}

// Badge
interface BadgeProps {
  children: ReactNode
  variant?: 'live' | 'demo' | 'mt4' | 'mt5' | 'active' | 'paused' | 'pending' | 'rejected' | 'master' | 'slave' | 'prop' | 'buy' | 'sell'
  dot?: boolean
  pulse?: boolean
  className?: string
}

export function Badge({ children, variant = 'active', dot, pulse, className }: BadgeProps) {
  const variants = {
    live: 'bg-[rgba(79,255,176,0.1)] text-[var(--mtm-green)] border-[rgba(79,255,176,0.2)]',
    demo: 'bg-[rgba(0,212,255,0.1)] text-[var(--mtm-cyan)] border-[rgba(0,212,255,0.2)]',
    mt4: 'bg-[rgba(157,123,255,0.1)] text-[var(--mtm-purple)] border-[rgba(157,123,255,0.2)]',
    mt5: 'bg-[rgba(245,200,66,0.1)] text-[var(--mtm-gold)] border-[rgba(245,200,66,0.2)]',
    active: 'bg-[rgba(79,255,176,0.1)] text-[var(--mtm-green)] border-[rgba(79,255,176,0.2)]',
    paused: 'bg-[rgba(245,200,66,0.1)] text-[var(--mtm-gold)] border-[rgba(245,200,66,0.2)]',
    pending: 'bg-[rgba(0,212,255,0.1)] text-[var(--mtm-cyan)] border-[rgba(0,212,255,0.2)]',
    rejected: 'bg-[rgba(255,77,109,0.1)] text-[var(--mtm-red)] border-[rgba(255,77,109,0.2)]',
    master: 'bg-[rgba(245,200,66,0.1)] text-[var(--mtm-gold)] border-[rgba(245,200,66,0.2)]',
    slave: 'bg-[rgba(0,212,255,0.1)] text-[var(--mtm-cyan)] border-[rgba(0,212,255,0.2)]',
    prop: 'bg-[rgba(157,123,255,0.1)] text-[var(--mtm-purple)] border-[rgba(157,123,255,0.2)]',
    buy: 'bg-[rgba(79,255,176,0.1)] text-[var(--mtm-green)] border-[rgba(79,255,176,0.2)]',
    sell: 'bg-[rgba(255,77,109,0.1)] text-[var(--mtm-red)] border-[rgba(255,77,109,0.2)]',
  }

  const dotColors = {
    live: 'var(--mtm-green)',
    demo: 'var(--mtm-cyan)',
    active: 'var(--mtm-green)',
    paused: 'var(--mtm-gold)',
    pending: 'var(--mtm-cyan)',
    rejected: 'var(--mtm-red)',
  }
  
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide font-mono border",
      variants[variant],
      className
    )}>
      {dot && (
        <span 
          className={cn("w-1.5 h-1.5 rounded-full", pulse && "animate-pulse")}
          style={{ 
            backgroundColor: dotColors[variant as keyof typeof dotColors] || 'currentColor',
            boxShadow: `0 0 6px ${dotColors[variant as keyof typeof dotColors] || 'currentColor'}`
          }}
        />
      )}
      {children}
    </span>
  )
}

// Risk Bar
interface RiskBarProps {
  current: number
  max: number
  showLabel?: boolean
}

export function RiskBar({ current, max, showLabel = true }: RiskBarProps) {
  const percent = Math.min((current / max) * 100, 100)
  const color = percent < 50 ? 'var(--mtm-green)' : percent < 80 ? 'var(--mtm-gold)' : 'var(--mtm-red)'
  
  return (
    <div className="flex items-center gap-2 text-[10px] text-[var(--mtm-text3)]">
      <div className="flex-1 h-[3px] bg-[var(--mtm-bg4)] rounded-sm overflow-hidden max-w-20">
        <div 
          className="h-full rounded-sm transition-all"
          style={{ width: `${percent}%`, backgroundColor: color }}
        />
      </div>
      {showLabel && (
        <span className="font-mono" style={{ color }}>
          -{current.toFixed(1)}%/{max}%
        </span>
      )}
    </div>
  )
}

// Toggle
interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <div className="flex items-center gap-2.5 mb-2.5">
      <button
        onClick={() => onChange(!checked)}
        className={cn(
          "w-[34px] h-[18px] rounded-full relative transition-colors flex-shrink-0",
          checked ? "bg-[var(--mtm-green)]" : "bg-[var(--mtm-border2)]"
        )}
      >
        <span 
          className={cn(
            "absolute w-3 h-3 bg-white rounded-full top-[3px] transition-all",
            checked ? "left-[19px]" : "left-[3px]"
          )}
        />
      </button>
      {label && <span className="text-xs text-[var(--mtm-text2)]">{label}</span>}
    </div>
  )
}

// Input
interface InputProps {
  label?: string
  value: string | number
  onChange: (value: string) => void
  type?: 'text' | 'number' | 'password' | 'time'
  placeholder?: string
  className?: string
}

export function Input({ label, value, onChange, type = 'text', placeholder, className }: InputProps) {
  return (
    <div className={cn("mb-3", className)}>
      {label && (
        <label className="block text-[10px] text-[var(--mtm-text3)] uppercase tracking-[1.5px] font-mono mb-1.5">
          {label}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[var(--mtm-bg3)] border border-[var(--mtm-border)] rounded-md px-3 py-2.5 text-[var(--mtm-text)] text-sm outline-none transition-all focus:border-[var(--mtm-green)] focus:shadow-[0_0_0_3px_rgba(79,255,176,0.07)] placeholder:text-[var(--mtm-text3)]"
      />
    </div>
  )
}

// Select
interface SelectProps {
  label?: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  className?: string
}

export function Select({ label, value, onChange, options, className }: SelectProps) {
  return (
    <div className={cn("mb-3", className)}>
      {label && (
        <label className="block text-[10px] text-[var(--mtm-text3)] uppercase tracking-[1.5px] font-mono mb-1.5">
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[var(--mtm-bg3)] border border-[var(--mtm-border)] rounded-md px-3 py-2.5 text-[var(--mtm-text)] text-sm outline-none transition-all focus:border-[var(--mtm-green)] cursor-pointer appearance-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='7' viewBox='0 0 10 7'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%233d5068' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 11px center',
          paddingRight: '28px'
        }}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value} className="bg-[var(--mtm-bg3)]">{opt.label}</option>
        ))}
      </select>
    </div>
  )
}

// Range Slider
interface RangeProps {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  unit?: string
  color?: 'green' | 'gold' | 'red'
}

export function Range({ label, value, onChange, min, max, step = 1, unit = '%', color = 'green' }: RangeProps) {
  const colors = {
    green: 'var(--mtm-green)',
    gold: 'var(--mtm-gold)',
    red: 'var(--mtm-red)'
  }
  
  return (
    <div className="mb-3">
      <label className="block text-[10px] text-[var(--mtm-text3)] uppercase tracking-[1.5px] font-mono mb-1.5">
        {label}
      </label>
      <div className="font-bold text-xl mb-1" style={{ color: colors[color] }}>
        {value.toFixed(step < 1 ? 1 : 0)}{unit}
      </div>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-full h-1 cursor-pointer"
        style={{ accentColor: colors[color] }}
      />
      <div className="flex justify-between text-[10px] text-[var(--mtm-text3)] font-mono mt-1">
        <span>Min: {min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  )
}

// Button
interface ButtonProps {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold'
  size?: 'sm' | 'md' | 'xs'
  fullWidth?: boolean
  className?: string
  disabled?: boolean
}

export function Button({ children, onClick, variant = 'primary', size = 'md', fullWidth, className, disabled }: ButtonProps) {
  const variants = {
    primary: 'bg-[var(--mtm-green)] text-[var(--mtm-bg)] hover:bg-[#6fffc0] hover:-translate-y-0.5 hover:shadow-[0_4px_16px_rgba(79,255,176,0.3)]',
    secondary: 'bg-[var(--mtm-bg4)] text-[var(--mtm-text)] border border-[var(--mtm-border2)] hover:border-[var(--mtm-green)] hover:text-[var(--mtm-green)]',
    ghost: 'bg-transparent text-[var(--mtm-text2)] border border-[var(--mtm-border)] hover:border-[var(--mtm-border2)] hover:text-[var(--mtm-text)]',
    danger: 'bg-[rgba(255,77,109,0.1)] text-[var(--mtm-red)] border border-[rgba(255,77,109,0.25)] hover:bg-[rgba(255,77,109,0.18)]',
    gold: 'bg-[rgba(245,200,66,0.12)] text-[var(--mtm-gold)] border border-[rgba(245,200,66,0.3)] hover:bg-[rgba(245,200,66,0.2)]',
  }
  
  const sizes = {
    xs: 'px-2 py-1 text-[10px] rounded',
    sm: 'px-3 py-1.5 text-[11px] rounded-md',
    md: 'px-4 py-2 text-xs rounded-md',
  }
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "font-semibold transition-all whitespace-nowrap inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
    >
      {children}
    </button>
  )
}

// Alert
interface AlertProps {
  children: ReactNode
  variant?: 'info' | 'warning' | 'success' | 'error'
  className?: string
}

export function Alert({ children, variant = 'info', className }: AlertProps) {
  const variants = {
    info: 'bg-[rgba(0,212,255,0.06)] border-[rgba(0,212,255,0.2)] text-[var(--mtm-cyan)]',
    warning: 'bg-[rgba(245,200,66,0.06)] border-[rgba(245,200,66,0.2)] text-[var(--mtm-gold)]',
    success: 'bg-[rgba(79,255,176,0.06)] border-[rgba(79,255,176,0.2)] text-[var(--mtm-green)]',
    error: 'bg-[rgba(255,77,109,0.06)] border-[rgba(255,77,109,0.2)] text-[var(--mtm-red)]',
  }
  
  return (
    <div className={cn(
      "p-3 rounded-lg text-xs flex items-start gap-2 leading-relaxed border mb-3.5",
      variants[variant],
      className
    )}>
      {children}
    </div>
  )
}

// Modal
interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg' | 'xl'
}

export function Modal({ isOpen, onClose, title, subtitle, children, footer, size = 'md' }: ModalProps) {
  if (!isOpen) return null
  
  const sizes = {
    md: 'max-w-[620px]',
    lg: 'max-w-[820px]',
    xl: 'max-w-[1000px]',
  }
  
  return (
    <div 
      className="fixed inset-0 bg-[rgba(7,9,15,0.88)] backdrop-blur-sm z-[5000] flex items-end sm:items-center justify-center p-3 sm:p-5"
      onClick={onClose}
    >
      <div 
        className={cn(
          "bg-[var(--mtm-bg2)] border border-[var(--mtm-border2)] rounded-t-xl sm:rounded-xl w-full max-h-[min(92dvh,900px)] sm:max-h-[90vh] overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-200",
          sizes[size]
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--mtm-border)] flex items-start justify-between sticky top-0 bg-[var(--mtm-bg2)] z-10">
          <div>
            <h2 className="font-bold text-[15px]">{title}</h2>
            {subtitle && <p className="text-[11px] text-[var(--mtm-text3)] mt-0.5">{subtitle}</p>}
          </div>
          <button 
            onClick={onClose}
            className="text-[var(--mtm-text3)] text-lg leading-none p-1 transition-colors hover:text-[var(--mtm-text)]"
          >
            &#x2715;
          </button>
        </div>
        
        {/* Body */}
        <div className="px-5 py-4">
          {children}
        </div>
        
        {/* Footer */}
        {footer && (
          <div className="px-5 py-3.5 border-t border-[var(--mtm-border)] flex flex-wrap justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// Table
interface Column<T> {
  key: string
  header: string
  render?: (row: T) => ReactNode
  className?: string
}

interface TableProps<T> {
  columns: Column<T>[]
  data: T[]
  onRowClick?: (row: T) => void
}

export function Table<T extends { id?: string }>({ columns, data, onRowClick }: TableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            {columns.map(col => (
              <th 
                key={col.key}
                className="text-left px-3 py-2.5 text-[10px] uppercase tracking-[1.5px] text-[var(--mtm-text3)] font-mono border-b border-[var(--mtm-border)] whitespace-nowrap"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr 
              key={row.id || i}
              onClick={() => onRowClick?.(row)}
              className={cn(
                "border-b border-[rgba(30,40,64,0.6)] transition-colors",
                onRowClick && "cursor-pointer hover:bg-[rgba(255,255,255,0.02)]"
              )}
            >
              {columns.map(col => (
                <td key={col.key} className={cn("px-3 py-2.5 text-[var(--mtm-text2)] align-middle", col.className)}>
                  {col.render ? col.render(row) : (row as Record<string, unknown>)[col.key] as ReactNode}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Toast
interface ToastProps {
  message: string | null
}

export function Toast({ message }: ToastProps) {
  if (!message) return null
  
  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 bg-[var(--mtm-bg2)] border border-[var(--mtm-green)] rounded-lg px-4 py-3.5 text-sm text-[var(--mtm-green)] z-[9999] animate-in slide-in-from-right-4 fade-in duration-300 max-w-none sm:max-w-80 shadow-xl">
      {message}
    </div>
  )
}

// Section Label
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-bold text-[15px] mb-3.5 flex items-center gap-2.5">
      {children}
      <div className="flex-1 h-px bg-[var(--mtm-border)]" />
    </div>
  )
}

// Tabs
interface TabsProps {
  tabs: { id: string; label: string; badge?: string }[]
  activeTab: string
  onChange: (tab: string) => void
}

export function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  return (
    <div className="flex gap-0 border-b border-[var(--mtm-border)] mb-4">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-all whitespace-nowrap",
            activeTab === tab.id
              ? "text-[var(--mtm-green)] border-[var(--mtm-green)]"
              : "text-[var(--mtm-text3)] border-transparent hover:text-[var(--mtm-text2)]"
          )}
        >
          {tab.label}
          {tab.badge && (
            <Badge variant="pending" className="ml-1.5">{tab.badge}</Badge>
          )}
        </button>
      ))}
    </div>
  )
}
