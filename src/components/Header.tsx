import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { Copy, ExternalLink, Cpu, TrendingUp, ShieldCheck, Activity, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { useUsdcBalance, useProtocolStats } from '@/hooks/useSLAVault'
import { ARC_SLA_VAULT_ADDRESS } from '@/contracts/ArcSLAVault'
import { formatAddress, formatUsdc } from '@/utils/format'
import { requireChain } from '@/onchain-facts'

const ARC_TESTNET_ID = 5042002

export function Header() {
  const { address, chainId } = useAccount()
  const { data: balance } = useUsdcBalance(address)
  const { data: stats } = useProtocolStats()
  const chain = requireChain(ARC_TESTNET_ID)
  const contractExplorer = `${chain.explorerBase}/address/${ARC_SLA_VAULT_ADDRESS}`
  const isWrongChain = !!address && chainId !== ARC_TESTNET_ID

  const copy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text)
    toast.success(`${label} copied`)
  }

  const totalEscrowed = stats ? `$${formatUsdc(stats[0])} USDC` : '—'
  const splits        = stats ? stats[1].toString() : '—'
  const refunds       = stats ? stats[2].toString() : '—'
  const activeTasks   = stats ? stats[3].toString() : '—'

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)]"
      style={{ background: 'rgba(7,11,20,0.96)', backdropFilter: 'blur(16px)' }}>

      {/* ── Top identity bar ─────────────────────────────────── */}
      <div className="px-5 py-2.5 flex items-center justify-between gap-4 border-b border-[var(--border)]">

        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="relative flex-shrink-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.25) 0%, rgba(16,185,129,0.15) 100%)', border: '1px solid rgba(6,182,212,0.35)' }}>
              <Cpu size={17} style={{ color: 'var(--cyan)' }} />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[var(--emerald)] border-2 border-[#070B14]" />
          </div>
          <div>
            <h1 className="display text-sm font-700 leading-tight tracking-tight"
              style={{ color: 'var(--ink)', letterSpacing: '-0.04em' }}>
              ArcSLA <span style={{ color: 'var(--cyan)' }}>//</span> Autonomous AI Clearinghouse
            </h1>
            <p className="text-[10px] leading-tight hidden sm:block" style={{ color: 'var(--subtle)' }}>
              SLA Escrow · Revenue Splitter · Circuit-Breaker Refund Engine
            </p>
          </div>
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-3">
          {/* Network badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
            style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.22)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--emerald)' }} />
            <span className="text-[11px] font-500" style={{ color: 'var(--emerald)' }}>Arc Network • Active</span>
          </div>

          {/* Contract badge */}
          {ARC_SLA_VAULT_ADDRESS && (
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
              style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.22)' }}>
              <span className="text-[11px] mono" style={{ color: 'var(--cyan)' }}>
                {formatAddress(ARC_SLA_VAULT_ADDRESS)}
              </span>
              <button onClick={() => copy(ARC_SLA_VAULT_ADDRESS, 'Contract address')}
                className="opacity-50 hover:opacity-100 transition-opacity" title="Copy contract address">
                <Copy size={10} style={{ color: 'var(--cyan)' }} />
              </button>
              <a href={contractExplorer} target="_blank" rel="noopener noreferrer"
                className="opacity-50 hover:opacity-100 transition-opacity" title="View on explorer">
                <ExternalLink size={10} style={{ color: 'var(--cyan)' }} />
              </a>
            </div>
          )}

          {/* Wrong chain */}
          {isWrongChain && (
            <span className="px-2 py-1 rounded-lg text-[11px] font-600"
              style={{ background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.4)', color: 'var(--danger)' }}>
              Wrong Network
            </span>
          )}

          {/* Balance */}
          {address && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
              <span className="text-[11px]" style={{ color: 'var(--subtle)' }}>Balance</span>
              <span className="text-[11px] font-600 tabular-nums" style={{ color: 'var(--ink)' }}>
                {balance !== undefined ? `${formatUsdc(balance)} USDC` : '—'}
              </span>
            </div>
          )}

          <ConnectKitButton />
        </div>
      </div>

      {/* ── KPI cards row ────────────────────────────────────── */}
      <div className="px-5 py-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={<Layers size={14} />}
          label="Total USDC Escrowed"
          value={totalEscrowed}
          accent="cyan"
        />
        <KpiCard
          icon={<TrendingUp size={14} />}
          label="90/10 Revenue Splits"
          value={splits}
          accent="emerald"
        />
        <KpiCard
          icon={<ShieldCheck size={14} />}
          label="SLA Breach Auto-Refunds"
          value={refunds}
          accent="amber"
        />
        <KpiCard
          icon={<Activity size={14} />}
          label="Active Onchain Tasks"
          value={activeTasks}
          accent="cyan"
        />
      </div>
    </header>
  )
}

function KpiCard({ icon, label, value, accent }: {
  icon: React.ReactNode
  label: string
  value: string
  accent: 'cyan' | 'emerald' | 'amber'
}) {
  const colors = {
    cyan:    { bg: 'rgba(6,182,212,0.06)',   border: 'rgba(6,182,212,0.22)',    icon: 'var(--cyan)',    val: 'var(--cyan)' },
    emerald: { bg: 'rgba(16,185,129,0.06)',  border: 'rgba(16,185,129,0.22)',   icon: 'var(--emerald)', val: 'var(--emerald)' },
    amber:   { bg: 'rgba(245,158,11,0.06)',  border: 'rgba(245,158,11,0.22)',   icon: 'var(--amber)',   val: 'var(--amber)' },
  }
  const c = colors[accent]
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all"
      style={{ background: c.bg, border: `1px solid ${c.border}` }}>
      <div className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
        style={{ background: `${c.bg}`, border: `1px solid ${c.border}`, color: c.icon }}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-widest truncate" style={{ color: 'var(--subtle)' }}>{label}</p>
        <p className="display text-base font-700 tabular-nums leading-tight" style={{ color: c.val }}>{value}</p>
      </div>
    </div>
  )
}
