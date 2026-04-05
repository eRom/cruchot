import { PROVIDER_COLORS } from '@/components/chat/ProviderIcon'
import { cn } from '@/lib/utils'
import { useStatsStore, type StatsPeriod } from '@/stores/stats.store'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  DollarSign,
  FolderOpen,
  Loader2,
  MessageSquare
} from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'

const PIE_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#f97316', '#ec4899']

const PERIOD_OPTIONS: Array<{ value: StatsPeriod; label: string }> = [
  { value: 'today', label: 'Auj.' },
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: '90d', label: '90 jours' },
  { value: 'all', label: 'Tout' }
]

const COST_TYPE_LABELS: Record<string, string> = {
  compact: 'Compaction',
  episode: 'Episodes',
  oneiric: 'Onirique',
  summary: 'Resumes',
  optimizer: 'Optimizer',
  skills: 'Skills',
  live_memory: 'Live Memory',
  image: 'Images'
}

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: '12px'
}

function formatCost(n: number): string {
  if (n === 0) return '$0.00'
  if (n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

function formatNumber(n: number): string {
  return n.toLocaleString('fr-FR')
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

export function StatsView() {
  const {
    dailyStats,
    providerStats,
    modelStats,
    projectStats,
    totalCost,
    totalMessages,
    totalTokensIn,
    totalTokensOut,
    totalConversations,
    totalTtsCost,
    totalBackgroundCost,
    totalImageCost,
    backgroundCostsByType,
    previousPeriodCost,
    selectedPeriod,
    isLoading,
    setSelectedPeriod,
    loadStats
  } = useStatsStore()

  const [modelSortBy, setModelSortBy] = useState<'cost' | 'messages'>('cost')

  useEffect(() => {
    loadStats()
  }, [loadStats])

  // Derived values
  const chatCost = totalCost
  const systemCost = totalBackgroundCost - totalImageCost
  const imageCost = totalImageCost
  const ttsCost = totalTtsCost
  const grandTotal = chatCost + totalBackgroundCost + ttsCost
  const systemDetails = backgroundCostsByType.filter(b => b.type !== 'image' && b.totalCost > 0)

  // Trend calculation
  const prevTotal = previousPeriodCost
  const trend = prevTotal != null && prevTotal > 0
    ? ((grandTotal - prevTotal) / prevTotal) * 100
    : null

  // Stacked bar segments
  const costSegments = [
    { label: 'Chat', value: chatCost, color: '#3B82F6' },
    { label: 'Systeme', value: systemCost, color: '#F59E0B' },
    { label: 'TTS', value: ttsCost, color: '#06B6D4' },
    { label: 'Images', value: imageCost, color: '#EC4899' }
  ].filter(s => s.value > 0)
  const segmentTotal = costSegments.reduce((s, c) => s + c.value, 0)

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin" />
          <span className="text-sm">Chargement des statistiques...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      {/* Header + Period selector */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Statistiques</h1>
        <div className="flex gap-1 rounded-lg border border-border/40 bg-muted/30 p-0.5">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelectedPeriod(opt.value)}
              className={cn(
                'rounded-md px-3 py-1 text-xs transition-colors duration-150',
                selectedPeriod === opt.value
                  ? 'bg-background font-medium text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Zone -- 2 columns */}
      <div className="grid grid-cols-2 gap-4">
        {/* Left column -- KPIs */}
        <div className="flex flex-col gap-3">
          {/* Hero cost card */}
          <div className="rounded-lg border border-border bg-card p-4">
            <span className="text-xs text-muted-foreground">Cout total</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground">{formatCost(grandTotal)}</span>
              {trend != null && (
                <span className={cn('text-xs font-medium', trend > 0 ? 'text-destructive' : 'text-emerald-500')}>
                  {trend > 0 ? '+' : ''}{trend.toFixed(1)}% vs prec.
                </span>
              )}
            </div>
          </div>

          {/* Mini cards row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Messages</span>
                <MessageSquare className="size-3.5 text-muted-foreground" />
              </div>
              <span className="mt-1 block text-lg font-bold text-foreground">{formatNumber(totalMessages)}</span>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Conversations</span>
                <FolderOpen className="size-3.5 text-muted-foreground" />
              </div>
              <span className="mt-1 block text-lg font-bold text-foreground">{formatNumber(totalConversations)}</span>
            </div>
          </div>

          {/* Tokens card */}
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Tokens</span>
              <div className="flex gap-1">
                <ArrowDownToLine className="size-3.5 text-muted-foreground" />
                <ArrowUpFromLine className="size-3.5 text-muted-foreground" />
              </div>
            </div>
            <span className="mt-1 block text-lg font-bold text-foreground">{formatTokens(totalTokensIn + totalTokensOut)}</span>
            <span className="text-xs text-muted-foreground">
              {formatTokens(totalTokensIn)} in / {formatTokens(totalTokensOut)} out
            </span>
          </div>
        </div>

        {/* Right column -- Cost breakdown */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium text-foreground">Ventilation</h3>

          {/* Stacked bar */}
          {segmentTotal > 0 && (
            <div className="mb-4 flex h-2 overflow-hidden rounded-full bg-muted">
              {costSegments.map((seg) => (
                <div
                  key={seg.label}
                  style={{ width: `${(seg.value / segmentTotal) * 100}%`, backgroundColor: seg.color }}
                  title={`${seg.label}: ${formatCost(seg.value)}`}
                />
              ))}
            </div>
          )}

          {/* Detail list */}
          <div className="flex flex-col gap-2">
            {/* Chat */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="size-2 rounded-sm bg-blue-500" />
                <span className="text-xs text-muted-foreground">Chat</span>
              </div>
              <span className="text-sm font-medium text-foreground">{formatCost(chatCost)}</span>
            </div>

            {/* Systeme */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="size-2 rounded-sm bg-amber-500" />
                <span className="text-xs text-muted-foreground">Systeme</span>
              </div>
              <span className="text-sm font-medium text-foreground">{formatCost(systemCost)}</span>
            </div>

            {/* Systeme details */}
            {systemDetails.length > 0 && (
              <div className="ml-1 flex flex-col gap-1.5 border-l border-border pl-4">
                {systemDetails.map((b) => (
                  <div key={b.type} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{COST_TYPE_LABELS[b.type] ?? b.type}</span>
                    <span className="text-xs text-muted-foreground">{formatCost(b.totalCost)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* TTS */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="size-2 rounded-sm bg-cyan-500" />
                <span className="text-xs text-muted-foreground">TTS</span>
              </div>
              <span className="text-sm font-medium text-foreground">{formatCost(ttsCost)}</span>
            </div>

            {/* Images */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="size-2 rounded-sm bg-pink-500" />
                <span className="text-xs text-muted-foreground">Images</span>
              </div>
              <span className="text-sm font-medium text-foreground">{formatCost(imageCost)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts zone -- 2x2 grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Bar chart -- cost evolution */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium text-foreground">Evolution des couts</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={dailyStats}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
                tickFormatter={(v: number) => `$${v.toFixed(2)}`}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [`$${Number(value).toFixed(4)}`, 'Cout']} />
              <Bar dataKey="cost" fill="#4363EE" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart -- provider breakdown */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium text-foreground">Repartition par provider</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={providerStats}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                dataKey="cost"
                nameKey="provider"
                paddingAngle={3}
              >
                {providerStats.map((entry, index) => (
                  <Cell key={`provider-${index}`} fill={PROVIDER_COLORS[entry.provider] ?? PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [`$${Number(value).toFixed(4)}`, 'Cout']} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Bar chart -- project breakdown */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-3 text-sm font-medium text-foreground">Repartition par projet</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={[...projectStats].sort((a, b) => b.cost - a.cost)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis type="number" tick={{ fontSize: 10 }} className="fill-muted-foreground" tickFormatter={(v: number) => `$${v.toFixed(2)}`} />
              <YAxis type="category" dataKey="projectName" tick={{ fontSize: 10 }} className="fill-muted-foreground" width={100} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null
                  const d = payload[0].payload as typeof projectStats[number]
                  return (
                    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
                      <p className="mb-1 font-medium text-foreground">{d.projectName}</p>
                      <p className="text-muted-foreground">Cout : <span className="text-foreground">{formatCost(d.cost)}</span></p>
                      <p className="text-muted-foreground">Messages : <span className="text-foreground">{d.messages}</span></p>
                      <p className="text-muted-foreground">Conversations : <span className="text-foreground">{d.conversations}</span></p>
                    </div>
                  )
                }}
              />
              <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                {[...projectStats].sort((a, b) => b.cost - a.cost).map((p, index) => (
                  <Cell key={`project-${index}`} fill={p.projectColor || PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Bar chart -- top models with toggle */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Top modeles</h3>
            <div className="flex gap-0.5 rounded-md border border-border/40 bg-muted/30 p-0.5">
              <button
                type="button"
                onClick={() => setModelSortBy('cost')}
                className={cn(
                  'rounded px-2 py-0.5 text-[10px] transition-colors',
                  modelSortBy === 'cost' ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground'
                )}
              >
                <DollarSign className="inline size-3" />
              </button>
              <button
                type="button"
                onClick={() => setModelSortBy('messages')}
                className={cn(
                  'rounded px-2 py-0.5 text-[10px] transition-colors',
                  modelSortBy === 'messages' ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground'
                )}
              >
                Msgs
              </button>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={[...modelStats]
                .sort((a, b) => modelSortBy === 'cost' ? b.cost - a.cost : b.messages - a.messages)
                .slice(0, 5)}
              layout="vertical"
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis
                type="number"
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
                tickFormatter={modelSortBy === 'cost' ? (v: number) => `$${v.toFixed(2)}` : undefined}
              />
              <YAxis type="category" dataKey="model" tick={{ fontSize: 10 }} className="fill-muted-foreground" width={120} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={modelSortBy === 'cost' ? (value) => [`$${Number(value).toFixed(4)}`, 'Cout'] : undefined}
              />
              <Bar dataKey={modelSortBy === 'cost' ? 'cost' : 'messages'} radius={[0, 4, 4, 0]}>
                {[...modelStats]
                  .sort((a, b) => modelSortBy === 'cost' ? b.cost - a.cost : b.messages - a.messages)
                  .slice(0, 5)
                  .map((entry, index) => (
                    <Cell key={`model-${index}`} fill={PROVIDER_COLORS[entry.provider] ?? 'hsl(var(--primary))'} />
                  ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
