import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Activity,
  ArrowDownUp,
  Gauge,
  ServerCog,
  TrendingUp,
  ShieldAlert,
  WalletCards,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { Badge } from '../components/Badge';
import { useAuthStore } from '../stores/authStore';

type UsagePanel = {
  title: string;
  subtitle: string;
  description: string;
  Icon: LucideIcon;
  accent: string;
  checks: string[];
};

const usagePanels: UsagePanel[] = [
  {
    title: 'Edge Requests',
    subtitle: 'Incoming traffic volume',
    description: 'Track routed requests separately from compute so traffic spikes are easier to spot.',
    Icon: Activity,
    accent: '#EF5350',
    checks: ['Request count by route', '4xx / 5xx split', 'Bot or crawler traffic'],
  },
  {
    title: 'Fast Data Transfer',
    subtitle: 'Bytes served through Vercel',
    description: 'Watch bandwidth pressure independently from server execution and image work.',
    Icon: ArrowDownUp,
    accent: '#60A5FA',
    checks: ['Top bandwidth paths', 'Cache hit opportunities', 'Large asset review'],
  },
  {
    title: 'Vercel Functions',
    subtitle: 'Invocations and duration',
    description: 'Separate serverless invocation count from active CPU time to isolate expensive routes.',
    Icon: ServerCog,
    accent: '#F59E0B',
    checks: ['Invocation count', 'Duration by endpoint', 'Erroring functions'],
  },
  {
    title: 'Compute',
    subtitle: 'Active CPU usage',
    description: 'Monitor compute as its own cost center so slow code and high traffic do not blur together.',
    Icon: Gauge,
    accent: '#22C55E',
    checks: ['Active CPU trend', 'Expensive handlers', 'Regression after deploys'],
  },
];

export default function VercelUsageDashboardPage() {
  const navigate = useNavigate();
  const { profile } = useAuthStore();

  if (!profile) return null;
  if (!['admin', 'super_admin'].includes(profile.role)) {
    navigate('/', { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen px-4 pt-6 pb-8 space-y-5">
      <button
        type="button"
        onClick={() => navigate('/admin')}
        className="flex items-center gap-2 text-[#9CA3AF] p-2 -ml-2 font-[Barlow] text-sm"
      >
        <ArrowLeft size={18} /> Back to Admin
      </button>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <LayoutDashboard size={28} className="text-[#C62828]" />
          <h1 className="font-[Bebas_Neue] text-5xl text-[#E8E2D6] leading-none">Vercel Usage</h1>
        </div>
        <p className="text-[#9CA3AF] text-sm font-[Barlow] max-w-2xl">
          A separated interface for the Vercel cost drivers we want to watch: Edge Requests, Fast Data Transfer,
          Vercel Functions, and Compute.
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="info">Admin only</Badge>
          <Badge variant="pending">Data source pending</Badge>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {usagePanels.map(({ title, subtitle, description, Icon, accent, checks }) => (
          <GlassCard key={title} className="p-4 overflow-hidden relative" style={{ borderColor: `${accent}55` }}>
            <div
              className="absolute inset-x-0 top-0 h-1"
              style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }}
            />
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="font-[Bebas_Neue] text-3xl text-[#E8E2D6] leading-none">{title}</div>
                <div className="text-[#9CA3AF] text-xs font-[Azeret_Mono] uppercase tracking-[0.18em] mt-1">
                  {subtitle}
                </div>
              </div>
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${accent}18`, color: accent }}
              >
                <Icon size={22} />
              </div>
            </div>

            <p className="text-[#B8B0A4] text-sm font-[Barlow] leading-relaxed mb-4">{description}</p>

            <div className="rounded-xl border border-white/5 bg-black/20 p-3 mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[#6B7280] text-xs font-[Azeret_Mono] uppercase tracking-[0.16em]">Current value</span>
                <span className="text-[#6B7280] text-xs font-[Barlow]">Awaiting metric feed</span>
              </div>
              <div className="font-[Azeret_Mono] text-3xl text-[#E8E2D6]">—</div>
            </div>

            <ul className="space-y-2">
              {checks.map((check) => (
                <li key={check} className="flex items-center gap-2 text-[#9CA3AF] text-sm font-[Barlow]">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
                  {check}
                </li>
              ))}
            </ul>
          </GlassCard>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 text-[#E8E2D6] font-[Barlow] font-semibold mb-1">
            <TrendingUp size={18} className="text-[#D4AF37]" /> Trend review
          </div>
          <p className="text-[#9CA3AF] text-xs font-[Barlow]">
            Add billing-period trends here once live Vercel usage data is wired in.
          </p>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 text-[#E8E2D6] font-[Barlow] font-semibold mb-1">
            <ShieldAlert size={18} className="text-[#EF5350]" /> Spike alerts
          </div>
          <p className="text-[#9CA3AF] text-xs font-[Barlow]">
            Use this section for thresholds and owner notes for each usage bucket.
          </p>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="flex items-center gap-2 text-[#E8E2D6] font-[Barlow] font-semibold mb-1">
            <WalletCards size={18} className="text-[#22C55E]" /> Spend action
          </div>
          <p className="text-[#9CA3AF] text-xs font-[Barlow]">
            Keep mitigation links and decisions separated from the player admin tools.
          </p>
        </GlassCard>
      </div>
    </div>
  );
}
