import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import { formatRank } from '@/lib/utils'
import { CHART, compactRank, seriesColor } from './theme'

/** Tooltip card – text uses text tokens; identity comes from the swatch. */
function TooltipCard({ active, payload, label, labelPrefix }: Partial<TooltipContentProps<number, string>> & { labelPrefix?: string }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="min-w-44 rounded-xl border border-navy-100 bg-white px-3.5 py-2.5 text-xs shadow-xl">
      <p className="mb-1.5 font-semibold text-navy-900">
        {labelPrefix}
        {label}
      </p>
      <ul className="space-y-1">
        {payload
          .filter((p) => p.value !== null && p.value !== undefined)
          .map((p) => (
            <li key={String(p.dataKey)} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-navy-600">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} aria-hidden />
                {p.name}
              </span>
              <span className="font-semibold tabular text-navy-900">{formatRank(Number(p.value))}</span>
            </li>
          ))}
      </ul>
    </div>
  )
}

export function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
  if (items.length < 2) return null
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-navy-600" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  )
}

export function ChartFrame({ title, subtitle, legend, children, height = 300 }: { title: string; subtitle?: string; legend?: ReactNode; children: ReactNode; height?: number }) {
  return (
    <figure className="space-y-3">
      <figcaption className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-navy-900">{title}</p>
          {subtitle && <p className="text-xs text-navy-500">{subtitle}</p>}
        </div>
        {legend}
      </figcaption>
      <div style={{ height }} className="w-full">
        {children}
      </div>
    </figure>
  )
}

/** Horizontal bars, single series (e.g. median closing rank per branch). */
export function HorizontalBars({
  data,
  valueKey,
  labelKey,
  name,
  height,
}: {
  data: Array<Record<string, string | number | null>>
  valueKey: string
  labelKey: string
  name: string
  height?: number
}) {
  const h = height ?? Math.max(200, data.length * 40 + 40)
  return (
    <div style={{ height: h }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 8 }} barCategoryGap={10}>
          <CartesianGrid horizontal={false} stroke={CHART.grid} strokeWidth={1} />
          <XAxis type="number" tickFormatter={compactRank} tick={{ fill: CHART.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey={labelKey} width={128} tick={{ fill: CHART.textSecondary, fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: 'rgb(42 75 224 / 0.06)' }} content={(p) => <TooltipCard {...(p as TooltipContentProps<number, string>)} />} />
          <Bar
            dataKey={valueKey}
            name={name}
            fill={seriesColor(0)}
            barSize={CHART.barSize}
            radius={[0, 4, 4, 0]}
            label={{ position: 'right', fill: CHART.textSecondary, fontSize: 11, formatter: (v: unknown) => compactRank(Number(v)) }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Lines over an ordered x axis (rounds), one series per year (≤ 5). */
export function MultiLine({
  data,
  xKey,
  series,
  xLabelPrefix,
}: {
  data: Array<Record<string, string | number | null>>
  xKey: string
  series: Array<{ key: string; label: string }>
  xLabelPrefix?: string
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} strokeWidth={1} />
        <XAxis dataKey={xKey} tick={{ fill: CHART.textMuted, fontSize: 11 }} axisLine={{ stroke: CHART.axis }} tickLine={false} />
        <YAxis tickFormatter={compactRank} tick={{ fill: CHART.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
        <Tooltip
          cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
          content={(p) => <TooltipCard {...(p as TooltipContentProps<number, string>)} labelPrefix={xLabelPrefix} />}
        />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={seriesColor(i)}
            strokeWidth={2}
            dot={{ r: 4, fill: seriesColor(i), stroke: CHART.surface, strokeWidth: 2 }}
            activeDot={{ r: 6, stroke: CHART.surface, strokeWidth: 2 }}
            connectNulls
            isAnimationActive
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

/** Grouped columns: x = year, one series per entity (≤ 4 colleges). */
export function GroupedColumns({
  data,
  xKey,
  series,
}: {
  data: Array<Record<string, string | number | null>>
  xKey: string
  series: Array<{ key: string; label: string }>
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }} barGap={2} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={CHART.grid} strokeWidth={1} />
        <XAxis dataKey={xKey} tick={{ fill: CHART.textMuted, fontSize: 11 }} axisLine={{ stroke: CHART.axis }} tickLine={false} />
        <YAxis tickFormatter={compactRank} tick={{ fill: CHART.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
        <Tooltip cursor={{ fill: 'rgb(42 75 224 / 0.06)' }} content={(p) => <TooltipCard {...(p as TooltipContentProps<number, string>)} />} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} fill={seriesColor(i)} maxBarSize={24} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Tiny inline trend (closing rank by year). Single series, end-dot labelled. */
export function Sparkline({ points, width = 120, height = 36 }: { points: Array<{ year: number; value: number | null }>; width?: number; height?: number }) {
  const valid = points.filter((p): p is { year: number; value: number } => p.value !== null)
  if (valid.length < 2) return <span className="text-xs text-navy-400">{valid.length === 1 ? '1 year of data' : 'No trend'}</span>
  const min = Math.min(...valid.map((p) => p.value))
  const max = Math.max(...valid.map((p) => p.value))
  const span = max - min || 1
  const step = (width - 12) / (points.length - 1)
  const coords = points.map((p, i) => (p.value === null ? null : { x: 6 + i * step, y: 6 + (1 - (p.value - min) / span) * (height - 12), p }))
  const path = coords
    .filter(Boolean)
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c!.x.toFixed(1)},${c!.y.toFixed(1)}`)
    .join(' ')
  const last = coords.filter(Boolean).at(-1)!
  return (
    <svg width={width} height={height} role="img" aria-label={`Closing rank trend: ${valid.map((v) => `${v.year} ${formatRank(v.value)}`).join(', ')}`}>
      <path d={path} fill="none" stroke={seriesColor(0)} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r={4} fill={seriesColor(0)} stroke={CHART.surface} strokeWidth={2} />
    </svg>
  )
}
