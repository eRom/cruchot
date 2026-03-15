import { PROVIDER_COLORS } from '@/components/chat/ProviderIcon'
import { cn } from '@/lib/utils'
import { useStatsStore, type StatsPeriod } from '@/stores/stats.store'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  DollarSign,
  FolderOpen,
  Loader2,
  MessageSquare
} from 'lucide-react'
import { useEffect } from 'react'
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
import { StatCard } from './StatCard'

const PIE_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#f59e0b', '#ef4444', '#10b981', '#f97316', '#ec4899']

const PERIOD_OPTIONS: Array<{ value: StatsPeriod; label: string }> = [
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: '90d', label: '90 jours' },
  { value: 'all', label: 'Tout' }
]

function formatDuration(ms: number): string {
  if (ms <= 0) return '0s'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours}h ${minutes}min`
  if (minutes > 0) return `${minutes}min ${seconds}s`
  return `${seconds}s`
}

function formatNumber(n: number): string {
  return n.toLocaleString('fr-FR')
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
    totalResponseTimeMs,
    totalConversations,
    totalTtsCost,
    selectedPeriod,
    isLoading,
    setSelectedPeriod,
    loadStats
  } = useStatsStore()

  useEffect(() => {
    loadStats()
  }, [loadStats])

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
      {/* Period selector */}
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

      {/* Stat cards — 2 rows of 3 */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          title="Cout total"
          value={`$${totalCost.toFixed(2)}`}
          subtitle={totalTtsCost > 0 ? `dont $${totalTtsCost.toFixed(2)} TTS` : undefined}
          icon={<DollarSign className="size-4 text-muted-foreground" />}
        />
        <StatCard
          title="Messages envoyes"
          value={formatNumber(totalMessages)}
          icon={<MessageSquare className="size-4 text-muted-foreground" />}
        />
        <StatCard
          title="Conversations"
          value={formatNumber(totalConversations)}
          icon={<FolderOpen className="size-4 text-muted-foreground" />}
        />
        <StatCard
          title="Tokens entree"
          value={formatNumber(totalTokensIn)}
          icon={<ArrowDownToLine className="size-4 text-muted-foreground" />}
        />
        <StatCard
          title="Tokens sortie"
          value={formatNumber(totalTokensOut)}
          icon={<ArrowUpFromLine className="size-4 text-muted-foreground" />}
        />
        <StatCard
          title="Temps total"
          value={formatDuration(totalResponseTimeMs)}
          icon={<Clock className="size-4 text-muted-foreground" />}
        />
      </div>

      {/* Charts row — cost evolution + provider pie */}
      <div className="grid grid-cols-2 gap-4">
        {/* Bar chart — cost evolution */}
        <div className="rounded-xl border border-border/40 bg-card p-4 shadow-sm">
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
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                formatter={(value) => [`$${Number(value).toFixed(4)}`, 'Cout']}
              />
              <Bar
                dataKey="cost"
                fill="#9394b0ff"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart — provider breakdown */}
        <div className="rounded-xl border border-border/40 bg-card p-4 shadow-sm">
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
                  <Cell
                    key={`provider-${index}`}
                    fill={PROVIDER_COLORS[entry.provider] ?? PIE_COLORS[index % PIE_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                formatter={(value) => [`$${Number(value).toFixed(4)}`, 'Cout']}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts row — project bar + top models bar */}
      <div className="grid grid-cols-2 gap-4">
        {/* Bar chart — project breakdown by cost */}
        <div className="rounded-xl border border-border/40 bg-card p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-medium text-foreground">Repartition par projet</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={[...projectStats].sort((a, b) => b.cost - a.cost)}
              layout="vertical"
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis
                type="number"
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
                tickFormatter={(v: number) => `$${v.toFixed(2)}`}
              />
              <YAxis
                type="category"
                dataKey="projectName"
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
                width={100}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null
                  const d = payload[0].payload as typeof projectStats[number]
                  return (
                    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
                      <p className="mb-1 font-medium text-foreground">{d.projectName}</p>
                      <p className="text-muted-foreground">Cout : <span className="text-foreground">${d.cost.toFixed(4)}</span></p>
                      <p className="text-muted-foreground">Messages : <span className="text-foreground">{d.messages}</span></p>
                      <p className="text-muted-foreground">Conversations : <span className="text-foreground">{d.conversations}</span></p>
                    </div>
                  )
                }}
              />
              <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                {[...projectStats].sort((a, b) => b.cost - a.cost).map((p, index) => (
                  <Cell
                    key={`project-${index}`}
                    fill={p.projectColor || PIE_COLORS[index % PIE_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Bar chart — top 5 models */}
        <div className="rounded-xl border border-border/40 bg-card p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-medium text-foreground">Top modeles par utilisation</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={modelStats.slice(0, 5)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
              <XAxis
                type="number"
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
              />
              <YAxis
                type="category"
                dataKey="model"
                tick={{ fontSize: 10 }}
                className="fill-muted-foreground"
                width={120}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
              <Bar dataKey="messages" radius={[0, 4, 4, 0]}>
                {modelStats.slice(0, 5).map((entry, index) => (
                  <Cell
                    key={`model-${index}`}
                    fill={PROVIDER_COLORS[entry.provider] ?? 'hsl(var(--primary))'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
