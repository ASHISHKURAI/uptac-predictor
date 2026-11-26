import { useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Table2, BarChart3 } from 'lucide-react'
import { formatNumber } from '@/lib/utils'
import { Table, TableWrap, THead, Td, Th, Tr } from '@/components/ui/Table'

/**
 * Chart tokens (validated with the dataviz palette validator, light surface):
 * series-1 royal #2a4be0, series-2 orange #eb6834 – CVD ΔE 31, normal ΔE 41,
 * both ≥ 3:1 on white. Text always uses ink tokens, never series colours.
 */
const VIZ = {
  series1: '#2a4be0',
  series2: '#eb6834',
  grid: '#e3e9f5',
  axis: '#6c80b0',
  textPrimary: '#0b1739',
  textSecondary: '#4a5e91',
  surface: '#ffffff',
}

const compact = (v: number) => (Math.abs(v) >= 10000 ? new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(v) : formatNumber(v))

interface TooltipEntry {
  name?: string | number
  value?: number | string
  color?: string
  dataKey?: string | number
}

function VizTooltip({ active, payload, label, labelFormatter }: { active?: boolean; payload?: TooltipEntry[]; label?: string | number; labelFormatter?: (l: string | number) => string }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-xl border border-navy-100 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold" style={{ color: VIZ.textPrimary }}>
        {labelFormatter && label !== undefined ? labelFormatter(label) : label}
      </p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2" style={{ color: VIZ.textSecondary }}>
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} aria-hidden />
          <span>{p.name}</span>
          <span className="ml-auto pl-3 font-semibold tabular" style={{ color: VIZ.textPrimary }}>
            {formatNumber(Number(p.value))}
          </span>
        </p>
      ))}
    </div>
  )
}

function ViewToggle({ table, onChange }: { table: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!table)}
      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-royal-600 hover:bg-royal-50"
      aria-pressed={table}
    >
      {table ? <BarChart3 className="h-3.5 w-3.5" aria-hidden /> : <Table2 className="h-3.5 w-3.5" aria-hidden />}
      {table ? 'Show chart' : 'View as table'}
    </button>
  )
}

export function RecordsByYearChart({ data }: { data: Array<{ year: number; cutoffs: number; seat_rows: number }> }) {
  const [table, setTable] = useState(false)
  const rows = data.map((d) => ({ year: String(d.year), cutoffs: d.cutoffs, seat_rows: d.seat_rows }))
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <ViewToggle table={table} onChange={setTable} />
      </div>
      {table ? (
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <Th>Year</Th>
                <Th className="text-right">Verified cutoff records</Th>
                <Th className="text-right">Verified seat-matrix rows</Th>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <Tr key={r.year}>
                  <Td>{r.year}</Td>
                  <Td className="text-right tabular">{formatNumber(r.cutoffs)}</Td>
                  <Td className="text-right tabular">{formatNumber(r.seat_rows)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      ) : (
        <div className="h-64" role="img" aria-label="Verified records by academic year: cutoff records and seat matrix rows">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={VIZ.grid} strokeWidth={1} />
              <XAxis dataKey="year" tickLine={false} axisLine={{ stroke: VIZ.grid }} tick={{ fill: VIZ.axis, fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: VIZ.axis, fontSize: 12 }} tickFormatter={compact} width={48} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'rgba(42,75,224,0.06)' }} content={<VizTooltip />} />
              <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} formatter={(value) => <span style={{ color: VIZ.textSecondary }}>{value}</span>} />
              <Bar dataKey="cutoffs" name="Cutoff records" fill={VIZ.series1} radius={[4, 4, 0, 0]} maxBarSize={24} />
              <Bar dataKey="seat_rows" name="Seat-matrix rows" fill={VIZ.series2} radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

export function PredictionsByDayChart({ data }: { data: Array<{ day: string; count: number }> }) {
  const [table, setTable] = useState(false)
  const fmtDay = (d: string | number) => new Date(String(d)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <ViewToggle table={table} onChange={setTable} />
      </div>
      {table ? (
        <TableWrap className="max-h-64 overflow-y-auto">
          <Table>
            <THead>
              <tr>
                <Th>Day</Th>
                <Th className="text-right">Predictions</Th>
              </tr>
            </THead>
            <tbody>
              {data.map((r) => (
                <Tr key={r.day}>
                  <Td>{fmtDay(r.day)}</Td>
                  <Td className="text-right tabular">{formatNumber(r.count)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      ) : (
        <div className="h-64" role="img" aria-label="Predictions per day over the last 30 days">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={VIZ.grid} strokeWidth={1} />
              <XAxis dataKey="day" tickFormatter={fmtDay} tickLine={false} axisLine={{ stroke: VIZ.grid }} tick={{ fill: VIZ.axis, fontSize: 12 }} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: VIZ.axis, fontSize: 12 }} tickFormatter={compact} width={40} allowDecimals={false} />
              <Tooltip cursor={{ stroke: VIZ.axis, strokeWidth: 1 }} content={<VizTooltip labelFormatter={fmtDay} />} />
              <Area
                type="monotone"
                dataKey="count"
                name="Predictions"
                stroke={VIZ.series1}
                strokeWidth={2}
                fill={VIZ.series1}
                fillOpacity={0.1}
                activeDot={{ r: 4, fill: VIZ.series1, stroke: VIZ.surface, strokeWidth: 2 }}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
