import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { lkr } from '../lib/format';

export type RevenuePoint = { month: string; revenue: number };

const axisCurrency = new Intl.NumberFormat('en-LK', { notation: 'compact', maximumFractionDigits: 1 });

export default function RevenueTrend({ trend }: { trend: RevenuePoint[] }) {
  return (
    <div className="revenue-chart" aria-label="Monthly revenue chart">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart data={trend} margin={{ top: 12, right: 10, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="4 4" />
          <XAxis dataKey="month" axisLine={false} tickLine={false} tickMargin={11}
            tick={{ fill: 'var(--muted)', fontSize: 12 }} />
          <YAxis axisLine={false} tickLine={false} tickMargin={7} width={42} tickCount={5} domain={[0, 2000000]}
            tickFormatter={(value: number) => axisCurrency.format(value)}
            tick={{ fill: 'var(--muted)', fontSize: 12 }} />
          <Tooltip formatter={(value) => [lkr(String(Math.round(Number(value) * 100))), 'Revenue']}
            contentStyle={{ background: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 10 }}
            labelStyle={{ color: 'var(--text)' }} itemStyle={{ color: 'var(--text)' }} />
          <Area dataKey="revenue" type="monotone" stroke="var(--chart-line)" strokeWidth={2.5}
            fill="var(--chart-line)" fillOpacity={0.12} isAnimationActive={false}
            dot={{ r: 3, fill: 'var(--chart-line)', stroke: 'var(--surface)' }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
