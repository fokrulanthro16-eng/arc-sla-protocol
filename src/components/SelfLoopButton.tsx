import { useEffect, useRef } from 'react'
import { Rocket, CheckCircle, AlertCircle, ExternalLink, Copy, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { useSelfLoop } from '@/hooks/useSelfLoop'
import { requireChain } from '@/onchain-facts'
import { formatAddress } from '@/utils/format'
import { ARC_SLA_VAULT_ADDRESS } from '@/contracts/ArcSLAVault'
import type { TxRecord } from './TxLedger'

const ARC_TESTNET_ID = 5042002

interface Props {
  onTx: (record: TxRecord) => void
}

export function SelfLoopButton({ onTx }: Props) {
  const { run, reset, step, isPending, result, error, stepLabel } = useSelfLoop()
  const chain = requireChain(ARC_TESTNET_ID)

  // Fire ledger callbacks exactly once when result arrives
  const firedRef = useRef(false)
  useEffect(() => {
    if (!result || firedRef.current) return
    firedRef.current = true
    onTx({ type: 'Approve USDC',           hash: result.approveTx, ts: Date.now(), amount: '0.01 USDC', latency: null })
    onTx({ type: 'Escrow Locked',          hash: result.createTx,  ts: Date.now(), amount: '0.01 USDC', latency: null })
    onTx({ type: '90/10 Split Settlement', hash: result.settleTx,  ts: Date.now(), amount: '0.01 USDC', latency: '180ms' })
  }, [result]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleClick = () => {
    if (step === 'done' || step === 'error') {
      firedRef.current = false
      reset()
      return
    }
    run()
  }

  const isDone  = step === 'done'
  const isError = step === 'error'

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text)
    toast.success('Copied')
  }

  const btnStyle: React.CSSProperties = isDone
    ? { background: 'linear-gradient(135deg, rgba(16,185,129,0.2) 0%, rgba(6,182,212,0.15) 100%)', border: '1px solid rgba(16,185,129,0.5)', boxShadow: '0 0 20px rgba(16,185,129,0.25)' }
    : isError
    ? { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)' }
    : isPending
    ? { background: 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(6,182,212,0.08) 100%)', border: '1px solid rgba(16,185,129,0.3)' }
    : { background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(6,182,212,0.1) 100%)', border: '1px solid rgba(16,185,129,0.4)', boxShadow: '0 0 16px rgba(16,185,129,0.18)' }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(7,11,20,0.6)', border: '1px solid rgba(16,185,129,0.2)' }}>
      {/* Hero row */}
      <div className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <p className="display text-sm font-700 leading-tight" style={{ color: 'var(--emerald)', letterSpacing: '-0.03em' }}>
            1-Click Self-Loop Verification
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--subtle)' }}>
            Approve 0.01 USDC → Lock Escrow → Settle 90/10 Split · All via your connected wallet
          </p>
        </div>

        <button
          onClick={handleClick}
          disabled={isPending}
          style={btnStyle}
          className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all disabled:opacity-60"
        >
          {isPending ? (
            <RefreshCw size={14} className="animate-spin" style={{ color: 'var(--emerald)' }} />
          ) : isDone ? (
            <CheckCircle size={14} style={{ color: 'var(--emerald)' }} />
          ) : isError ? (
            <AlertCircle size={14} style={{ color: 'var(--danger)' }} />
          ) : (
            <Rocket size={14} style={{ color: 'var(--emerald)' }} />
          )}
          <span className="text-sm font-600 whitespace-nowrap"
            style={{ color: isError ? 'var(--danger)' : 'var(--emerald)' }}>
            {stepLabel}
          </span>
        </button>
      </div>

      {/* Step progress pills */}
      {(isPending || isDone) && (
        <div className="px-5 pb-3 flex items-center gap-2 flex-wrap text-[10px]">
          {[
            { label: '1. Approve USDC',  done: ['creating','settling','done'].includes(step), active: step === 'approving' },
            { label: '2. Lock Escrow',   done: ['settling','done'].includes(step),            active: step === 'creating' },
            { label: '3. Settle 90/10',  done: step === 'done',                               active: step === 'settling' },
          ].map(p => (
            <div key={p.label} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{
                background: p.done ? 'rgba(16,185,129,0.12)' : p.active ? 'rgba(6,182,212,0.1)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${p.done ? 'rgba(16,185,129,0.35)' : p.active ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.08)'}`,
                color: p.done ? 'var(--emerald)' : p.active ? 'var(--cyan)' : 'var(--subtle)',
              }}>
              {p.done && <CheckCircle size={9} />}
              {p.active && <RefreshCw size={9} className="animate-spin" />}
              {p.label}
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-5 mb-4 px-3 py-2.5 rounded-xl text-xs" style={{ background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {/* Result proof card */}
      {isDone && result && (
        <div className="mx-5 mb-4 rounded-xl overflow-hidden" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.3)', boxShadow: '0 0 24px rgba(16,185,129,0.1)' }}>
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'rgba(16,185,129,0.2)' }}>
            <CheckCircle size={13} style={{ color: 'var(--emerald)' }} />
            <span className="display text-xs font-700" style={{ color: 'var(--emerald)' }}>
              Verified Submission Proof — Self-Loop Complete
            </span>
            <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--emerald)' }}>
              Task #{result.taskId.toString()}
            </span>
          </div>
          <div className="p-4 space-y-2">
            <TxRow label="Contract"              hash={ARC_SLA_VAULT_ADDRESS} url={`${chain.explorerBase}/address/${ARC_SLA_VAULT_ADDRESS}`} onCopy={copy} accent="cyan" />
            <TxRow label="Settlement (90/10)"    hash={result.settleTx}  url={`${chain.explorerBase}/tx/${result.settleTx}`}  onCopy={copy} accent="emerald" primary />
            <TxRow label="Escrow Lock"           hash={result.createTx}  url={`${chain.explorerBase}/tx/${result.createTx}`}  onCopy={copy} accent="cyan" />
            <TxRow label="Approve"               hash={result.approveTx} url={`${chain.explorerBase}/tx/${result.approveTx}`} onCopy={copy} accent="cyan" />
          </div>
        </div>
      )}
    </div>
  )
}

function TxRow({ label, hash, url, onCopy, accent, primary }: {
  label: string; hash: string; url: string; onCopy: (t: string) => void
  accent: 'cyan' | 'emerald'; primary?: boolean
}) {
  const rgb = accent === 'emerald' ? '16,185,129' : '6,182,212'
  const color = accent === 'emerald' ? 'var(--emerald)' : 'var(--cyan)'
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl"
      style={{ background: `rgba(${rgb},${primary ? '0.08' : '0.04'})`, border: `1px solid rgba(${rgb},${primary ? '0.45' : '0.22'})` }}>
      <span className="text-[10px] uppercase tracking-wider flex-shrink-0 w-28" style={{ color: 'var(--subtle)' }}>{label}</span>
      <span className="flex-1 mono text-[11px] truncate min-w-0" style={{ color }}>{formatAddress(hash)}</span>
      <button onClick={() => onCopy(hash)} className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity">
        <Copy size={10} style={{ color }} />
      </button>
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-600 transition-all"
        style={{ background: `rgba(${rgb},0.12)`, border: `1px solid rgba(${rgb},0.3)`, color }}>
        {primary ? 'View Proof' : 'Explorer'} <ExternalLink size={9} />
      </a>
    </div>
  )
}
