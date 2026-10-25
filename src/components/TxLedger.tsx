import { ExternalLink, FileCheck, CheckCircle, XCircle, Clock, Zap } from 'lucide-react'
import { requireChain } from '@/onchain-facts'
import { formatAddress } from '@/utils/format'

const ARC_TESTNET_ID = 5042002

export interface TxRecord {
  type: string
  hash: `0x${string}`
  ts: number
  latency?: number | string | null
  amount?: string | null
}

interface BadgeStyle { bg: string; border: string; color: string; icon: React.ReactNode }

const TYPE_META: Record<string, BadgeStyle & { label: string }> = {
  'Approve USDC': {
    label: 'USDC Approved',
    bg: 'rgba(6,182,212,0.08)', border: 'rgba(6,182,212,0.28)', color: 'var(--cyan)',
    icon: <CheckCircle size={10} />,
  },
  'Escrow Locked': {
    label: 'Escrow Locked',
    bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.30)', color: 'var(--amber)',
    icon: <Clock size={10} />,
  },
  'Create Task': {
    label: 'Escrow Locked',
    bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.30)', color: 'var(--amber)',
    icon: <Clock size={10} />,
  },
  '90/10 Split Settlement': {
    label: '90/10 Split Paid',
    bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.28)', color: 'var(--emerald)',
    icon: <Zap size={10} />,
  },
  'SLA Breach Auto-Refund': {
    label: '100% Refunded',
    bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.28)', color: 'var(--danger)',
    icon: <XCircle size={10} />,
  },
  'Emergency Reclaim': {
    label: 'Emergency Reclaim',
    bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.28)', color: 'var(--subtle)',
    icon: <CheckCircle size={10} />,
  },
  'Claim Payout': {
    label: 'Payout Claimed',
    bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.28)', color: 'var(--emerald)',
    icon: <CheckCircle size={10} />,
  },
}

const FALLBACK_META: BadgeStyle & { label: string } = {
  label: 'Transaction',
  bg: 'rgba(100,116,139,0.08)', border: 'rgba(100,116,139,0.28)', color: 'var(--subtle)',
  icon: <CheckCircle size={10} />,
}

interface Props { records: TxRecord[] }

export function TxLedger({ records }: Props) {
  const chain = requireChain(ARC_TESTNET_ID)

  return (
    <div className="card overflow-hidden glow-cyan">
      {/* Header */}
      <div className="px-5 py-4 flex items-center gap-2.5"
        style={{ borderBottom: '1px solid var(--border)', background: 'rgba(6,182,212,0.03)' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(6,182,212,0.10)', border: '1px solid rgba(6,182,212,0.25)' }}>
          <FileCheck size={15} style={{ color: 'var(--cyan)' }} />
        </div>
        <div>
          <h2 className="display text-sm font-700 tracking-tight" style={{ color: 'var(--ink)' }}>
            Verified Onchain Explorer Audit Ledger
          </h2>
          <p className="text-[10px]" style={{ color: 'var(--subtle)' }}>
            Every transaction verified on Arc Explorer
          </p>
        </div>
        {records.length > 0 && (
          <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-600"
            style={{ background: 'var(--cyan-dim)', color: 'var(--cyan)', border: '1px solid rgba(6,182,212,0.3)' }}>
            {records.length}
          </span>
        )}
      </div>

      {records.length === 0 ? (
        <div className="text-center py-10 px-5">
          <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <FileCheck size={22} style={{ color: 'var(--subtle)', opacity: 0.35 }} />
          </div>
          <p className="text-sm font-500" style={{ color: 'var(--subtle)' }}>No transactions yet</p>
          <p className="text-xs mt-1" style={{ color: 'var(--subtle)', opacity: 0.55 }}>
            Transactions will appear here as you interact with the contract
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                {['Action', 'Tx Hash', 'Latency', 'Time', 'Explorer'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left font-600 uppercase tracking-widest whitespace-nowrap"
                    style={{ color: 'var(--subtle)', fontSize: '10px' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...records].reverse().map((rec, i) => {
                const meta  = TYPE_META[rec.type] ?? FALLBACK_META
                const url   = `${chain.explorerBase}/tx/${rec.hash}`
                const time  = new Date(rec.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                // Normalise latency to a display-safe value
                const latencyNum = typeof rec.latency === 'number' ? rec.latency : null
                const latencyStr = rec.latency != null ? String(rec.latency) : null
                const latencyColor = latencyNum !== null
                  ? latencyNum <= 500 ? 'var(--emerald)' : 'var(--danger)'
                  : 'var(--subtle)'
                const latencyPass = latencyNum !== null ? latencyNum <= 500 : null

                return (
                  <tr key={i}
                    className="transition-colors hover:bg-white/[0.02]"
                    style={{ borderBottom: '1px solid rgba(30,41,59,0.6)' }}>
                    {/* Action badge */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-600 text-[10px] uppercase tracking-wide"
                        style={{ background: meta.bg, border: `1px solid ${meta.border}`, color: meta.color }}>
                        {meta.icon}
                        {meta.label}
                      </span>
                    </td>
                    {/* Tx hash */}
                    <td className="px-4 py-3">
                      <span className="mono" style={{ color: 'var(--muted)' }}>{formatAddress(rec.hash)}</span>
                    </td>
                    {/* Latency */}
                    <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                      {latencyStr !== null ? (
                        <span className="font-600" style={{ color: latencyColor }}>
                          {latencyStr}{typeof rec.latency === 'number' ? 'ms' : ''}
                          {latencyPass !== null && (
                            <span className="ml-1 text-[10px] font-400" style={{ color: 'var(--subtle)' }}>
                              {latencyPass ? 'PASS' : 'BREACH'}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--subtle)' }}>—</span>
                      )}
                    </td>
                    {/* Timestamp */}
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums" style={{ color: 'var(--subtle)' }}>
                      {time}
                    </td>
                    {/* Explorer link */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <a href={url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-600 text-[10px] transition-all hover:opacity-80"
                        style={{ background: 'var(--cyan-dim)', border: '1px solid rgba(6,182,212,0.3)', color: 'var(--cyan)' }}>
                        View on Arc Explorer
                        <ExternalLink size={9} />
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
