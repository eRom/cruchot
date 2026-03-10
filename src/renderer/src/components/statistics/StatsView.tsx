import { useEffect } from 'react'
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts'
import {
  DollarSign,
  MessageSquare,
  FolderOpen,
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  Loader2
} from 'lucide-react'
import { useStatsStore, type StatsPeriod } from '@/stores/stats.store'
import { StatCard } from './StatCard'
import { cn } from '@/lib/utils'

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
        {/* Line chart — cost evolution */}
        <div className="rounded-xl border border-border/40 bg-card p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-medium text-foreground">Evolution des couts</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={dailyStats}>
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
              <Line
                type="monotone"
                dataKey="cost"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
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
                {providerStats.map((_, index) => (
                  <Cell key={`provider-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
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

      {/* Charts row — project pie + top models bar */}
      <div className="grid grid-cols-2 gap-4">
        {/* Pie chart — project breakdown */}
        <div className="rounded-xl border border-border/40 bg-card p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-medium text-foreground">Repartition par projet</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={projectStats}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                dataKey="cost"
                nameKey="projectName"
                paddingAngle={3}
              >
                {projectStats.map((p, index) => (
                  <Cell
                    key={`project-${index}`}
                    fill={p.projectColor || PIE_COLORS[index % PIE_COLORS.length]}
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

        {/* Bar chart — top models */}
        <div className="rounded-xl border border-border/40 bg-card p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-medium text-foreground">Top modeles par utilisation</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={modelStats} layout="vertical">
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
              <Bar dataKey="messages" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
