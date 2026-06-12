'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { RecommendationResult } from '@/lib/validators'

interface Props {
  results: RecommendationResult[]
}

const COLORS = [
  '#1d1a16', '#3a342b', '#5a544b', '#7c756a',
  '#a39d92', '#c9462e', '#4a8a52',
]

export function NAVBreakdownChart({ results }: Props) {
  const top5 = results.slice(0, 5)

  const data = top5.map((r) => ({
    name: r.card.issuer + ' ' + r.card.name.split(' ').slice(-2).join(' '),
    nav: Math.round(r.annual_value),
    rewards: r.breakdown.rewards_earned,
    fee: r.breakdown.net_fee,
  }))

  return (
    <div className="wf-box p-5">
      <h3 className="hand mb-1 text-base font-bold text-[var(--ink)]">top 5 · value to you</h3>
      <p className="mb-4 text-xs text-[var(--ink-soft)]">based on your spending profile</p>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e7e1d6" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: '#a39d92' }}
            angle={-35}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tickFormatter={(v) => `₹${Math.round(v / 1000)}k`}
            tick={{ fontSize: 10, fill: '#a39d92' }}
            width={44}
          />
          <Tooltip
            formatter={(value) => [
              `₹${Number(value).toLocaleString('en-IN')}`,
              'Net Annual Value',
            ]}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: '1px solid #e4e4e7',
              boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
            }}
          />
          <Bar dataKey="nav" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
