import { useState, useEffect } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { toast } from 'sonner'
import { Lock, Zap, Copy, CheckCircle, ChevronRight } from 'lucide-react'
import { useApproveUsdc, useCreateTask, useUsdcBalance, useUsdcAllowance } from '@/hooks/useSLAVault'
import { formatUsdc, parseUsdc } from '@/utils/format'
import type { TxRecord } from './TxLedger'

const ARC_TESTNET_ID = 5042002
const QUICK_AMOUNTS = ['0.01', '0.05', '0.10', '0.25']

interface Props {
  onTx: (record: TxRecord) => void
  onTaskCreated: () => void
}

export function CreateTaskPanel({ onTx, onTaskCreated }: Props) {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  const [providerAddr, setProviderAddr] = useState('')
  const [treasuryAddr, setTreasuryAddr] = useState('')
  const [amount, setAmount] = useState('0.10')
  const [maxLatency, setMaxLatency] = useState(500)
  // Derived during render — no state needed


  const { data: balance } = useUsdcBalance(address)
  const amountRaw = (() => { try { return parseUsdc(amount) } catch { return 0n } })()
  const { data: allowance, refetch: refetchAllowance } = useUsdcAllowance(address)

  const approveHook = useApproveUsdc()
  const createHook  = useCreateTask()

  const isWrongChain   = !!address && chainId !== ARC_TESTNET_ID
  const needsApproval  = allowance !== undefined && allowance < amountRaw && amountRaw > 0n
  const approveLoading = approveHook.isPending || approveHook.isConfirming
  const createLoading  = createHook.isPending  || createHook.isConfirming

  // Latency zone colour
  const latencyColor = maxLatency <= 500
    ? 'var(--emerald)'
    : maxLatency <= 900
      ? 'var(--amber)'
      : 'var(--danger)'
  const latencyZoneLabel = maxLatency <= 500
    ? 'GREEN ZONE — 90/10 Split Likely'
    : maxLatency <= 900
      ? 'AMBER ZONE — Borderline SLA'
      : 'RED ZONE — High Breach Risk'

  // Slider fill %
  const sliderPct = ((maxLatency - 100) / (2000 - 100)) * 100

  // Self-loop demo
  const fillSelfLoop = () => {
    if (!address) { toast.error('Connect wallet first'); return }
    setProviderAddr(address)
    setTreasuryAddr(address)
    toast.success('Self-loop mode active — 90% + 10% returns to your wallet')
  }

  // selfLoopActive is derived from address/providerAddr/treasuryAddr — no effect needed
  const selfLoopActive = !!address && providerAddr === address && treasuryAddr === address

  // Approve effects
  useEffect(() => {
    if (approveHook.isSuccess && approveHook.hash) {
      toast.success('USDC approved')
      onTx({ type: 'Approve USDC', hash: approveHook.hash, ts: Date.now() })
      void refetchAllowance()
      approveHook.reset()
    }
    if (approveHook.error) {
      const msg = (approveHook.error as Error).message
      if (!msg.includes('rejected')) toast.error('Approve failed')
      approveHook.reset()
    }
  }, [approveHook.isSuccess, approveHook.error]) // eslint-disable-line react-hooks/exhaustive-deps

  // Create task effects
  useEffect(() => {
    if (createHook.isSuccess && createHook.hash) {
      toast.success('SLA escrow locked onchain')
      onTx({ type: 'Escrow Locked', hash: createHook.hash, ts: Date.now() })
      onTaskCreated()
      createHook.reset()
    }
    if (createHook.error) {
      const msg = (createHook.error as Error).message
      if (!msg.includes('rejected')) toast.error('Create task failed')
      createHook.reset()
    }
  }, [createHook.isSuccess, createHook.error]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleApprove = () => {
    if (isWrongChain) { switchChain({ chainId: ARC_TESTNET_ID }); return }
    approveHook.approve(amountRaw)
  }

  const handleCreate = () => {
    if (isWrongChain) { switchChain({ chainId: ARC_TESTNET_ID }); return }
    if (!providerAddr.startsWith('0x') || providerAddr.length !== 42) { toast.error('Invalid provider address'); return }
    if (!treasuryAddr.startsWith('0x') || treasuryAddr.length !== 42) { toast.error('Invalid treasury verifier address'); return }
    if (amountRaw === 0n) { toast.error('Amount must be > 0'); return }
    createHook.createTask(providerAddr as `0x${string}`, treasuryAddr as `0x${string}`, amountRaw, BigInt(maxLatency))
  }

  return (
    <div className="card glow-cyan flex flex-col overflow-hidden">

      {/* ── Panel header ──────────────────────────────────── */}
      <div className="px-5 py-4 flex items-center gap-2.5"
        style={{ borderBottom: '1px solid var(--border)', background: 'rgba(6,182,212,0.04)' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--cyan-dim)', border: '1px solid rgba(6,182,212,0.3)' }}>
          <Lock size={15} style={{ color: 'var(--cyan)' }} />
        </div>
        <div>
          <h2 className="display text-sm font-700 tracking-tight" style={{ color: 'var(--ink)' }}>
            1. Lock USDC in AI SLA Vault
          </h2>
          <p className="text-[10px]" style={{ color: 'var(--subtle)' }}>Define escrow terms · Approve · Lock funds onchain</p>
        </div>
      </div>

      <div className="p-5 space-y-5 flex-1">

        {/* ── Amount selector ───────────────────────────── */}
        <div>
          <label className="block text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--subtle)' }}>
            USDC Amount to Escrow
          </label>
          {/* Quick pills */}
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            {QUICK_AMOUNTS.map(a => (
              <button key={a} onClick={() => setAmount(a)}
                className="px-3 py-1.5 rounded-lg text-xs font-600 transition-all"
                style={amount === a
                  ? { background: 'var(--cyan-dim)', border: '1px solid rgba(6,182,212,0.45)', color: 'var(--cyan)' }
                  : { background: 'transparent', border: '1px solid var(--border)', color: 'var(--subtle)' }
                }>
                {a} USDC
              </button>
            ))}
          </div>
          {/* Custom input */}
          <div className="flex items-center gap-2.5">
            <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl transition-colors"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
              <span className="text-sm" style={{ color: 'var(--subtle)' }}>$</span>
              <input
                type="number" min="0" step="0.01" value={amount}
                onChange={e => setAmount(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none tabular-nums"
                style={{ color: 'var(--ink)' }}
                placeholder="0.00"
              />
              <span className="text-xs font-500" style={{ color: 'var(--subtle)' }}>USDC</span>
            </div>
            {balance !== undefined && (
              <span className="text-xs whitespace-nowrap" style={{ color: 'var(--subtle)' }}>
                Bal: <span className="tabular-nums" style={{ color: 'var(--muted)' }}>{formatUsdc(balance)}</span>
              </span>
            )}
          </div>
        </div>

        {/* ── Self-loop demo ────────────────────────────── */}
        <div className="rounded-xl p-3.5 flex items-center justify-between gap-3"
          style={selfLoopActive
            ? { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.28)' }
            : { background: 'var(--surface-muted)', border: '1px solid var(--border)' }
          }>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Zap size={12} style={{ color: selfLoopActive ? 'var(--emerald)' : 'var(--cyan)', flexShrink: 0 }} />
              <p className="text-xs font-600" style={{ color: selfLoopActive ? 'var(--emerald)' : 'var(--ink-2)' }}>
                One-Click Self-Loop Demo Mode
              </p>
            </div>
            {selfLoopActive ? (
              <p className="text-[11px] font-500" style={{ color: 'var(--emerald)' }}>
                Safe Self-Loop Active — 90% + 10% returns to your wallet
              </p>
            ) : (
              <p className="text-[11px]" style={{ color: 'var(--subtle)' }}>
                Fill your wallet as both Provider and Treasury for safe testnet demos
              </p>
            )}
          </div>
          <button onClick={fillSelfLoop} disabled={!address}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-600 transition-all disabled:opacity-40"
            style={selfLoopActive
              ? { background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: 'var(--emerald)' }
              : { background: 'var(--cyan-dim)', border: '1px solid rgba(6,182,212,0.35)', color: 'var(--cyan)' }
            }>
            {selfLoopActive ? <CheckCircle size={12} /> : <Zap size={12} />}
            {selfLoopActive ? 'Active' : 'Self-Loop Fill'}
          </button>
        </div>

        {/* ── Address inputs ────────────────────────────── */}
        <div className="space-y-3">
          <AddressInput label="Provider Agent Address" value={providerAddr} onChange={setProviderAddr} />
          <AddressInput label="Treasury Verifier Address" value={treasuryAddr} onChange={setTreasuryAddr} />
        </div>

        {/* ── SLA Slider ────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--subtle)' }}>
              SLA Threshold (Max Latency)
            </label>
            <span className="text-[10px] font-600 px-2 py-0.5 rounded-full"
              style={{ background: `${latencyColor}18`, border: `1px solid ${latencyColor}40`, color: latencyColor }}>
              {latencyZoneLabel}
            </span>
          </div>
          {/* Slider track with gradient */}
          <div className="relative mb-2.5">
            <div className="absolute inset-y-0 left-0 h-1 top-2 rounded-full pointer-events-none"
              style={{ width: `${sliderPct}%`, background: latencyColor, opacity: 0.6 }} />
            <input
              type="range" min={100} max={2000} step={25} value={maxLatency}
              onChange={e => setMaxLatency(Number(e.target.value))}
              className="w-full relative z-10"
              style={{ background: `linear-gradient(to right, ${latencyColor}50 0%, ${latencyColor}50 ${sliderPct}%, rgba(30,41,59,0.6) ${sliderPct}%, rgba(30,41,59,0.6) 100%)` }}
            />
          </div>
          {/* Labels */}
          <div className="flex items-center justify-between text-[10px]" style={{ color: 'var(--subtle)' }}>
            <span style={{ color: 'var(--emerald)' }}>100ms (fast)</span>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg tabular-nums"
              style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: latencyColor }}>
              <span className="font-700 text-sm">{maxLatency}</span>
              <span className="text-[10px]">ms</span>
            </div>
            <span style={{ color: 'var(--danger)' }}>2000ms (slow)</span>
          </div>
        </div>

        {/* ── Revenue split bar ─────────────────────────── */}
        <div className="rounded-xl p-3.5"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          <div className="flex justify-between text-xs mb-2">
            <span className="font-600" style={{ color: 'var(--emerald)' }}>90% AI Provider Agent</span>
            <span className="font-600" style={{ color: 'var(--cyan)' }}>10% Telemetry Verifier Treasury</span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="h-full rounded-l-full transition-all"
              style={{ width: '90%', background: 'linear-gradient(90deg, var(--emerald), rgba(16,185,129,0.7))' }} />
            <div className="h-full rounded-r-full transition-all"
              style={{ width: '10%', background: 'linear-gradient(90deg, rgba(6,182,212,0.7), var(--cyan))' }} />
          </div>
          <p className="text-[10px] text-center mt-1.5" style={{ color: 'var(--subtle)' }}>
            Hardcoded on-chain — enforced by the smart contract
          </p>
        </div>

        {/* ── Step buttons ──────────────────────────────── */}
        <div className="space-y-2.5 pt-1">
          {/* Step 1: Approve */}
          <button onClick={handleApprove}
            disabled={!address || approveLoading || (!needsApproval && !isWrongChain)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-600 transition-all disabled:opacity-40"
            style={needsApproval || isWrongChain
              ? { background: 'var(--cyan-dim)', border: '1px solid rgba(6,182,212,0.4)', color: 'var(--cyan)' }
              : { background: 'rgba(100,116,139,0.08)', border: '1px solid var(--border)', color: 'var(--subtle)', cursor: 'default' }
            }>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-700"
                style={{ background: needsApproval ? 'var(--cyan)' : 'var(--subtle)', color: '#070B14' }}>1</span>
              {approveLoading ? 'Awaiting wallet confirmation...' : 'Approve USDC Spend'}
            </div>
            {!needsApproval && !isWrongChain
              ? <CheckCircle size={15} style={{ color: 'var(--emerald)' }} />
              : <ChevronRight size={15} />
            }
          </button>

          {/* Step 2: Create */}
          <button onClick={handleCreate}
            disabled={!address || createLoading || needsApproval}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-600 transition-all disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.18) 0%, rgba(16,185,129,0.12) 100%)', border: '1px solid rgba(6,182,212,0.35)', color: 'var(--cyan)' }}>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-700"
                style={{ background: 'var(--cyan)', color: '#070B14' }}>2</span>
              {createLoading ? 'Locking USDC in escrow...' : 'Create & Lock SLA Escrow'}
            </div>
            <Lock size={14} />
          </button>

          {!address && (
            <p className="text-center text-xs pt-1" style={{ color: 'var(--subtle)' }}>
              Connect your wallet to get started
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function AddressInput({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void
}) {
  const paste = () => {
    void (async () => {
      try { onChange((await navigator.clipboard.readText()).trim()) } catch { /* ignore */ }
    })()
  }

  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest mb-1.5" style={{ color: 'var(--subtle)' }}>
        {label}
      </label>
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl transition-colors"
        style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
        <input
          type="text" value={value} onChange={e => onChange(e.target.value)} placeholder="0x..."
          className="flex-1 bg-transparent text-xs mono outline-none"
          style={{ color: 'var(--ink)' }}
        />
        <button onClick={paste} title="Paste from clipboard"
          className="opacity-40 hover:opacity-80 transition-opacity">
          <Copy size={12} style={{ color: 'var(--muted)' }} />
        </button>
      </div>
    </div>
  )
}
