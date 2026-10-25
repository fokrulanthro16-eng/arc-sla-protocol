import { useRef, useState, useEffect, useCallback } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { toast } from 'sonner'
import { Cpu, ShieldAlert, RotateCcw, RefreshCw, Terminal, CheckCircle2, XCircle } from 'lucide-react'
import { keccak256, toHex } from 'viem'
import {
  useAllTasks, useExecuteAndSettle, useEmergencyReclaim,
  useClaimPayout, usePendingWithdrawal,
} from '@/hooks/useSLAVault'
import { formatAddress, formatUsdc, STATUS_LABELS, formatTimestamp } from '@/utils/format'
import type { TxRecord } from './TxLedger'

const ARC_TESTNET_ID = 5042002

interface Task {
  id: bigint; requester: string; provider: string; treasuryVerifier: string
  amount: bigint; maxLatencyMs: bigint; actualLatencyMs: bigint
  providerShareBps: bigint; telemetryProofHash: string
  status: number; createdAt: bigint
}

interface TerminalLine { text: string; color: string; ts: number }

interface Props { onTx: (r: TxRecord) => void }

export function TaskList({ onTx }: Props) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { data: tasks, refetch } = useAllTasks()
  const { data: pendingAmount, refetch: refetchPending } = usePendingWithdrawal(address)

  const settleHook  = useExecuteAndSettle()
  const reclaimHook = useEmergencyReclaim()
  const claimHook   = useClaimPayout()

  const pendingActionRef = useRef<'settle_met' | 'settle_breach' | 'reclaim' | null>(null)

  // Terminal log state
  const [termLines, setTermLines] = useState<TerminalLine[]>([])
  const [termVisible, setTermVisible] = useState(false)

  const pushLine = useCallback((text: string, color = 'var(--muted)') => {
    setTermLines(prev => [...prev.slice(-30), { text, color, ts: Date.now() }])
  }, [])

  const isWrongChain = !!address && chainId !== ARC_TESTNET_ID

  const ensureChain = useCallback(() => {
    if (isWrongChain) { switchChain({ chainId: ARC_TESTNET_ID }); return false }
    return true
  }, [isWrongChain, switchChain])

  const handleRefresh = useCallback(() => { void refetch() }, [refetch])

  const runTerminalSequence = useCallback((
    type: 'settle_met' | 'settle_breach',
    taskId: bigint,
    latency: number,
    maxLatency: number,
    proofHash: string,
  ) => {
    setTermVisible(true)
    setTermLines([])
    const lines: [string, string, number][] = type === 'settle_met' ? [
      [`[AGENT] Dispatching inference payload for task #${taskId}...`, 'var(--cyan)', 0],
      [`[RPC]   Connecting to Arc Testnet node...`, 'var(--muted)', 120],
      [`[TELEMETRY] Measuring response latency...`, 'var(--muted)', 400],
      [`[TELEMETRY] Measured Latency: ${latency}ms (SLA PASSED <= ${maxLatency}ms)`, 'var(--emerald)', 800],
      [`[HASH]  SHA-256 Proof: ${proofHash.slice(0, 18)}...`, 'var(--subtle)', 1000],
      [`[CONTRACT] Calling executeAndSettleSLA()...`, 'var(--cyan)', 1300],
      [`[SETTLEMENT] Distributing 90% to Provider / 10% to Treasury...`, 'var(--emerald)', 1600],
      [`[DONE] SLA Met — Split payout credited to pendingWithdrawals.`, 'var(--emerald)', 2000],
    ] : [
      [`[AGENT] Dispatching inference payload for task #${taskId}...`, 'var(--cyan)', 0],
      [`[RPC]   Connecting to Arc Testnet node...`, 'var(--muted)', 120],
      [`[TELEMETRY] Measuring response latency...`, 'var(--muted)', 400],
      [`[TELEMETRY] Measured Latency: ${latency}ms (SLA FAILED > ${maxLatency}ms)`, 'var(--danger)', 800],
      [`[CIRCUIT-BREAKER] SLA threshold exceeded — triggering refund...`, 'var(--amber)', 1100],
      [`[HASH]  SHA-256 Proof: ${proofHash.slice(0, 18)}...`, 'var(--subtle)', 1300],
      [`[CONTRACT] Calling executeAndSettleSLA() — breach path...`, 'var(--amber)', 1600],
      [`[REFUND] 100% USDC credited to requester pendingWithdrawals.`, 'var(--danger)', 2000],
    ]
    lines.forEach(([text, color, delay]) => {
      setTimeout(() => pushLine(text, color), delay)
    })
  }, [pushLine])

  const handleSettleMet = useCallback((task: Task) => {
    if (!ensureChain()) return
    pendingActionRef.current = 'settle_met'
    const payload = `ArcSLA:task=${task.id.toString()}:ts=${Math.floor(performance.now())}`
    const proofHash = keccak256(toHex(payload))
    runTerminalSequence('settle_met', task.id, 180, Number(task.maxLatencyMs), proofHash)
    settleHook.executeAndSettle(task.id, 180n, proofHash)
  }, [ensureChain, settleHook, runTerminalSequence])

  const handleSettleBreach = useCallback((task: Task) => {
    if (!ensureChain()) return
    pendingActionRef.current = 'settle_breach'
    const payload = `ArcSLA:task=${task.id.toString()}:breach=${Math.floor(performance.now())}`
    const proofHash = keccak256(toHex(payload))
    runTerminalSequence('settle_breach', task.id, 1420, Number(task.maxLatencyMs), proofHash)
    settleHook.executeAndSettle(task.id, 1420n, proofHash)
  }, [ensureChain, settleHook, runTerminalSequence])

  const handleReclaim = useCallback((task: Task) => {
    if (!ensureChain()) return
    pendingActionRef.current = 'reclaim'
    reclaimHook.emergencyReclaim(task.id)
  }, [ensureChain, reclaimHook])

  const handleClaim = useCallback(() => {
    if (!ensureChain()) return
    claimHook.claimPayout()
  }, [ensureChain, claimHook])

  // Settle success
  useEffect(() => {
    if (!settleHook.isSuccess || !settleHook.hash) return
    const type = pendingActionRef.current === 'settle_met' ? '90/10 Split Settlement' : 'SLA Breach Auto-Refund'
    toast.success(pendingActionRef.current === 'settle_met' ? '90/10 split credited' : '100% refund credited')
    onTx({ type, hash: settleHook.hash, ts: Date.now(), latency: pendingActionRef.current === 'settle_met' ? 180 : 1420 })
    pendingActionRef.current = null
    settleHook.reset()
    void refetch()
    void refetchPending()
  }, [settleHook.isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  // Settle error
  useEffect(() => {
    if (!settleHook.error) return
    const msg = (settleHook.error as Error).message
    if (!msg.includes('rejected')) toast.error('Settle failed')
    pendingActionRef.current = null
    settleHook.reset()
  }, [settleHook.error]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reclaim success
  useEffect(() => {
    if (!reclaimHook.isSuccess || !reclaimHook.hash) return
    toast.success('USDC reclaim credited to your address')
    onTx({ type: 'Emergency Reclaim', hash: reclaimHook.hash, ts: Date.now() })
    pendingActionRef.current = null
    reclaimHook.reset()
    void refetch()
    void refetchPending()
  }, [reclaimHook.isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reclaim error
  useEffect(() => {
    if (!reclaimHook.error) return
    const msg = (reclaimHook.error as Error).message
    if (!msg.includes('rejected')) toast.error('Reclaim failed')
    pendingActionRef.current = null
    reclaimHook.reset()
  }, [reclaimHook.error]) // eslint-disable-line react-hooks/exhaustive-deps

  // Claim success
  useEffect(() => {
    if (!claimHook.isSuccess || !claimHook.hash) return
    toast.success('Payout claimed to your wallet')
    onTx({ type: 'Claim Payout', hash: claimHook.hash, ts: Date.now() })
    claimHook.reset()
    void refetchPending()
  }, [claimHook.isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  // Claim error
  useEffect(() => {
    if (!claimHook.error) return
    const msg = (claimHook.error as Error).message
    if (!msg.includes('rejected')) toast.error('Claim failed')
    claimHook.reset()
  }, [claimHook.error]) // eslint-disable-line react-hooks/exhaustive-deps

  const taskList = (tasks as Task[] | undefined) ?? []
  const settleLoading  = settleHook.isPending  || settleHook.isConfirming
  const reclaimLoading = reclaimHook.isPending || reclaimHook.isConfirming

  return (
    <div className="space-y-4">

      {/* ── AI Execution Terminal ───────────────────────────── */}
      <div className="card overflow-hidden" style={{ border: '1px solid rgba(6,182,212,0.2)' }}>
        <button
          onClick={() => setTermVisible(v => !v)}
          className="w-full px-5 py-3.5 flex items-center justify-between transition-colors hover:opacity-80"
          style={{ borderBottom: termVisible ? '1px solid var(--border)' : 'none', background: 'rgba(6,182,212,0.04)' }}>
          <div className="flex items-center gap-2.5">
            <Terminal size={14} style={{ color: 'var(--cyan)' }} />
            <span className="display text-xs font-700 tracking-tight" style={{ color: 'var(--ink)' }}>
              AI Agent Execution Terminal
            </span>
            {termLines.length > 0 && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-600 mono"
                style={{ background: 'var(--cyan-dim)', color: 'var(--cyan)' }}>
                {termLines.length} lines
              </span>
            )}
          </div>
          <span className="text-[10px]" style={{ color: 'var(--subtle)' }}>
            {termVisible ? 'collapse' : 'expand'}
          </span>
        </button>

        {termVisible && (
          <div className="p-4 font-mono text-xs leading-relaxed overflow-y-auto max-h-52"
            style={{ background: '#050810' }}>
            {termLines.length === 0 ? (
              <p style={{ color: 'var(--subtle)' }}>
                {'>'} Execute an active task to see live telemetry logs...
                <span className="cursor-blink ml-0.5" style={{ color: 'var(--cyan)' }}>_</span>
              </p>
            ) : (
              termLines.map((line, i) => (
                <div key={`${line.ts}-${i}`} className="terminal-line py-0.5">
                  <span style={{ color: 'var(--subtle)' }}>{'>'} </span>
                  <span style={{ color: line.color }}>{line.text}</span>
                </div>
              ))
            )}
            {termLines.length > 0 && (
              <span className="cursor-blink" style={{ color: 'var(--cyan)' }}>_</span>
            )}
          </div>
        )}
      </div>

      {/* ── Task cards panel ────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--border)', background: 'rgba(6,182,212,0.03)' }}>
          <div className="flex items-center gap-2.5">
            <Cpu size={15} style={{ color: 'var(--cyan)' }} />
            <h2 className="display text-sm font-700 tracking-tight" style={{ color: 'var(--ink)' }}>
              2. Live AI Telemetry &amp; Settlement Engine
            </h2>
            {taskList.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-600"
                style={{ background: 'var(--cyan-dim)', color: 'var(--cyan)', border: '1px solid rgba(6,182,212,0.3)' }}>
                {taskList.length} task{taskList.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <button onClick={handleRefresh}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:opacity-80"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <RefreshCw size={13} style={{ color: 'var(--muted)' }} />
          </button>
        </div>

        {/* Pending payout claim */}
        {pendingAmount !== undefined && pendingAmount > 0n && address && (
          <div className="mx-5 mt-4 p-3.5 rounded-xl flex items-center justify-between gap-3"
            style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.25)' }}>
            <div>
              <p className="text-xs font-600" style={{ color: 'var(--emerald)' }}>Pending Payout Available</p>
              <p className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
                {formatUsdc(pendingAmount)} USDC ready to claim
              </p>
            </div>
            <button onClick={handleClaim}
              disabled={claimHook.isPending || claimHook.isConfirming}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-600 transition-all disabled:opacity-40"
              style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: 'var(--emerald)' }}>
              {claimHook.isPending || claimHook.isConfirming ? 'Claiming...' : 'Claim Payout'}
            </button>
          </div>
        )}

        <div className="p-5 space-y-3">
          {taskList.length === 0 ? (
            <div className="text-center py-10">
              <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
                <Cpu size={22} style={{ color: 'var(--subtle)', opacity: 0.4 }} />
              </div>
              <p className="text-sm font-500" style={{ color: 'var(--subtle)' }}>No tasks yet</p>
              <p className="text-xs mt-1" style={{ color: 'var(--subtle)', opacity: 0.6 }}>
                Create an SLA escrow in the left panel to begin
              </p>
            </div>
          ) : (
            [...taskList].reverse().map(task => (
              <TaskCard
                key={task.id.toString()}
                task={task}
                address={address}
                onSettleMet={() => handleSettleMet(task)}
                onSettleBreach={() => handleSettleBreach(task)}
                onReclaim={() => handleReclaim(task)}
                settleLoading={settleLoading}
                reclaimLoading={reclaimLoading}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────── */
const STATUS_STYLE: Record<number, { bg: string; border: string; color: string; label: string }> = {
  0: { bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.30)',  color: 'var(--amber)',   label: 'LOCKED IN ESCROW' },
  1: { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.30)', color: 'var(--emerald)', label: '90/10 SPLIT SETTLED' },
  2: { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.30)',  color: 'var(--danger)',  label: 'BREACH REFUNDED' },
  3: { bg: 'rgba(100,116,139,0.10)', border: 'rgba(100,116,139,0.30)', color: 'var(--subtle)', label: 'RECLAIMED' },
}

function TaskCard({ task, address, onSettleMet, onSettleBreach, onReclaim, settleLoading, reclaimLoading }: {
  task: Task; address?: string
  onSettleMet: () => void; onSettleBreach: () => void; onReclaim: () => void
  settleLoading: boolean; reclaimLoading: boolean
}) {
  const ss = STATUS_STYLE[task.status] ?? STATUS_STYLE[3]
  const isActive      = task.status === 0
  const isRequester   = address?.toLowerCase() === task.requester.toLowerCase()
  const isParticipant = isRequester || address?.toLowerCase() === task.treasuryVerifier.toLowerCase()
  const latencyPassed = task.actualLatencyMs > 0n && task.actualLatencyMs <= task.maxLatencyMs

  const statusLabel = STATUS_LABELS[task.status] ?? ss.label

  return (
    <div className="rounded-xl overflow-hidden transition-all"
      style={{ background: 'rgba(17,24,39,0.80)', border: `1px solid ${ss.border}` }}>

      {/* Status strip */}
      <div className="h-0.5 w-full" style={{ background: ss.color, opacity: 0.5 }} />

      {/* Main row */}
      <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-3 flex-wrap">
        {/* Left: ID + addresses */}
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: ss.bg, border: `1px solid ${ss.border}` }}>
            <span className="display text-xs font-700" style={{ color: ss.color }}>
              #{task.id.toString()}
            </span>
          </div>
          <div>
            <div className="text-xs flex items-center gap-1.5 flex-wrap">
              <span className="font-500" style={{ color: 'var(--ink-2)' }}>{formatAddress(task.requester)}</span>
              <span style={{ color: 'var(--subtle)' }}>to</span>
              <span className="font-500" style={{ color: 'var(--ink-2)' }}>{formatAddress(task.provider)}</span>
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--subtle)' }}>
              {formatTimestamp(task.createdAt)} · Verifier: {formatAddress(task.treasuryVerifier)}
            </div>
          </div>
        </div>

        {/* Right: amount + status badge */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <span className="display text-base font-700 tabular-nums" style={{ color: 'var(--ink)' }}>
            {formatUsdc(task.amount)}<span className="text-xs font-500 ml-1" style={{ color: 'var(--subtle)' }}>USDC</span>
          </span>
          <span className="text-[10px] font-700 uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{ background: ss.bg, border: `1px solid ${ss.border}`, color: ss.color }}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Detail row */}
      <div className="px-4 pb-3 flex items-center gap-4 text-xs flex-wrap" style={{ color: 'var(--subtle)' }}>
        <span>SLA: <strong className="tabular-nums" style={{ color: 'var(--ink-2)' }}>{task.maxLatencyMs.toString()}ms</strong></span>
        {task.actualLatencyMs > 0n && (
          <span className="flex items-center gap-1">
            {latencyPassed ? <CheckCircle2 size={11} style={{ color: 'var(--emerald)' }} /> : <XCircle size={11} style={{ color: 'var(--danger)' }} />}
            <span>Actual: <strong className="tabular-nums" style={{ color: latencyPassed ? 'var(--emerald)' : 'var(--danger)' }}>
              {task.actualLatencyMs.toString()}ms
            </strong></span>
          </span>
        )}
        <span>Split: <strong style={{ color: 'var(--ink-2)' }}>90% / 10%</strong></span>
      </div>

      {/* Action buttons */}
      {isActive && isParticipant && (
        <div className="px-4 pb-4 flex items-center gap-2 flex-wrap">
          <button onClick={onSettleMet} disabled={settleLoading || reclaimLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-600 transition-all disabled:opacity-40"
            style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.30)', color: 'var(--emerald)' }}>
            <Cpu size={11} />
            {settleLoading ? 'Settling...' : 'Execute AI Task (180ms SLA Pass → 90/10 Split)'}
          </button>
          <button onClick={onSettleBreach} disabled={settleLoading || reclaimLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-600 transition-all disabled:opacity-40"
            style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: 'var(--danger)' }}>
            <ShieldAlert size={11} />
            {settleLoading ? 'Processing...' : 'API Timeout (1420ms Breach → 100% Refund)'}
          </button>
          {isRequester && (
            <button onClick={onReclaim} disabled={settleLoading || reclaimLoading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-500 transition-all disabled:opacity-40"
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--subtle)' }}>
              <RotateCcw size={11} />
              {reclaimLoading ? 'Reclaiming...' : 'Emergency Reclaim'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
