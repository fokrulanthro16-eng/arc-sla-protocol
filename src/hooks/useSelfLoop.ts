/**
 * useSelfLoop — chains Approve → createTask → executeAndSettleSLA
 * All three txs signed by the connected browser wallet.
 *
 * Uses useReducer (dispatch is stable and safe inside effects per React rules).
 */
import { useReducer, useEffect, useRef, useCallback } from 'react'
import { useAccount, useSwitchChain } from 'wagmi'
import { keccak256, toHex } from 'viem'
import { useApproveUsdc, useCreateTask, useExecuteAndSettle, useAllTasks } from '@/hooks/useSLAVault'
import { parseUsdc } from '@/utils/format'

const ARC_TESTNET_ID = 5042002
const SELF_LOOP_AMOUNT = parseUsdc('0.01')

export type Phase = 'idle' | 'approving' | 'creating' | 'settling' | 'done' | 'error'

export interface SelfLoopResult {
  approveTx: `0x${string}`
  createTx:  `0x${string}`
  settleTx:  `0x${string}`
  taskId:    bigint
}

interface State { phase: Phase; errorMsg: string | null; result: SelfLoopResult | null }

type Action =
  | { type: 'START' }
  | { type: 'TO_CREATING' }
  | { type: 'TO_SETTLING' }
  | { type: 'DONE'; result: SelfLoopResult }
  | { type: 'ERROR'; msg: string }
  | { type: 'RESET' }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'START':       return { phase: 'approving', errorMsg: null, result: null }
    case 'TO_CREATING': return { ...state, phase: 'creating' }
    case 'TO_SETTLING': return { ...state, phase: 'settling' }
    case 'DONE':        return { phase: 'done', errorMsg: null, result: action.result }
    case 'ERROR':       return { phase: 'error', errorMsg: action.msg, result: null }
    case 'RESET':       return { phase: 'idle', errorMsg: null, result: null }
    default: return state
  }
}

export function useSelfLoop() {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  const [state, dispatch] = useReducer(reducer, { phase: 'idle', errorMsg: null, result: null })

  const approveHook = useApproveUsdc()
  const createHook  = useCreateTask()
  const settleHook  = useExecuteAndSettle()
  const { refetch: refetchTasks } = useAllTasks()

  // Stable accumulators — only written inside event handlers or void async blocks (not effects)
  const approveTxRef = useRef<`0x${string}` | null>(null)
  const createTxRef  = useRef<`0x${string}` | null>(null)
  const taskIdRef    = useRef<bigint | null>(null)
  const phaseRef     = useRef<Phase>('idle')
  phaseRef.current   = state.phase   // keep in sync with render

  const isWrongChain = !!address && chainId !== ARC_TESTNET_ID

  const run = useCallback(() => {
    if (!address) { dispatch({ type: 'ERROR', msg: 'Connect your wallet first' }); return }
    if (isWrongChain) { switchChain({ chainId: ARC_TESTNET_ID }); return }
    approveTxRef.current = null
    createTxRef.current  = null
    taskIdRef.current    = null
    approveHook.reset()
    createHook.reset()
    settleHook.reset()
    dispatch({ type: 'START' })
    approveHook.approve(SELF_LOOP_AMOUNT)
  }, [address, isWrongChain, switchChain, approveHook, createHook, settleHook])

  const reset = useCallback(() => {
    approveTxRef.current = null
    createTxRef.current  = null
    taskIdRef.current    = null
    approveHook.reset()
    createHook.reset()
    settleHook.reset()
    dispatch({ type: 'RESET' })
  }, [approveHook, createHook, settleHook])

  // Approve result → dispatch only (no setState)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phaseRef.current !== 'approving') return
    if (approveHook.error) {
      const m = (approveHook.error as Error).message
      dispatch({ type: 'ERROR', msg: m.includes('rejected') ? 'Transaction cancelled.' : `Approve failed — ${m.slice(0, 80)}` })
      approveHook.reset()
      return
    }
    if (!approveHook.isSuccess || !approveHook.hash) return
    approveTxRef.current = approveHook.hash
    approveHook.reset()
    dispatch({ type: 'TO_CREATING' })
    createHook.createTask(address as `0x${string}`, address as `0x${string}`, SELF_LOOP_AMOUNT, 500n)
  }, [approveHook.isSuccess, approveHook.error])

  // createTask result → dispatch only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phaseRef.current !== 'creating') return
    if (createHook.error) {
      const m = (createHook.error as Error).message
      dispatch({ type: 'ERROR', msg: m.includes('rejected') ? 'Transaction cancelled.' : `Create task failed — ${m.slice(0, 80)}` })
      createHook.reset()
      return
    }
    if (!createHook.isSuccess || !createHook.hash) return
    createTxRef.current = createHook.hash
    createHook.reset()
    void refetchTasks().then(r => {
      const tasks = r.data as Array<{ id: bigint }> | undefined
      taskIdRef.current = tasks && tasks.length > 0 ? tasks[tasks.length - 1].id : 1n
      dispatch({ type: 'TO_SETTLING' })
      settleHook.executeAndSettle(taskIdRef.current, 180n, keccak256(toHex('ArcSLA_Verified_Telemetry_Pass_180ms')))
    })
  }, [createHook.isSuccess, createHook.error])

  // settle result → dispatch only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phaseRef.current !== 'settling') return
    if (settleHook.error) {
      const m = (settleHook.error as Error).message
      dispatch({ type: 'ERROR', msg: m.includes('rejected') ? 'Transaction cancelled.' : `Settlement failed — ${m.slice(0, 80)}` })
      settleHook.reset()
      return
    }
    if (!settleHook.isSuccess || !settleHook.hash) return
    dispatch({
      type: 'DONE',
      result: {
        approveTx: approveTxRef.current!,
        createTx:  createTxRef.current!,
        settleTx:  settleHook.hash,
        taskId:    taskIdRef.current ?? 1n,
      },
    })
    settleHook.reset()
    void refetchTasks()
  }, [settleHook.isSuccess, settleHook.error])

  const isPending =
    state.phase === 'approving' || approveHook.isPending || approveHook.isConfirming ||
    state.phase === 'creating'  || createHook.isPending  || createHook.isConfirming  ||
    state.phase === 'settling'  || settleHook.isPending  || settleHook.isConfirming

  const labelMap: Record<Phase, string> = {
    idle:      'Execute 0.01 USDC Self-Loop Verification',
    approving: 'Step 1/3: Approving USDC...',
    creating:  'Step 2/3: Locking in Escrow...',
    settling:  'Step 3/3: Settling 90/10 Split...',
    done:      'Verified — Run Again',
    error:     'Retry Self-Loop',
  }

  return {
    run, reset,
    step: state.phase,
    isPending,
    result: state.result,
    error:  state.errorMsg,
    stepLabel: labelMap[state.phase],
  }
}
