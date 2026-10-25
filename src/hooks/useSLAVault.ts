import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { ARC_SLA_VAULT_ABI, ARC_SLA_VAULT_ADDRESS } from '@/contracts/ArcSLAVault'
import { erc20Abi } from 'viem'
import { getUsdc } from '@/onchain-facts'

const ARC_TESTNET_ID = 5042002

export function useProtocolStats() {
  return useReadContract({
    address: ARC_SLA_VAULT_ADDRESS,
    abi: ARC_SLA_VAULT_ABI,
    functionName: 'getProtocolStats',
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!ARC_SLA_VAULT_ADDRESS, refetchInterval: 4000 },
  })
}

export function useAllTasks() {
  return useReadContract({
    address: ARC_SLA_VAULT_ADDRESS,
    abi: ARC_SLA_VAULT_ABI,
    functionName: 'getAllTasks',
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!ARC_SLA_VAULT_ADDRESS, refetchInterval: 4000 },
  })
}

export function usePendingWithdrawal(address?: `0x${string}`) {
  return useReadContract({
    address: ARC_SLA_VAULT_ADDRESS,
    abi: ARC_SLA_VAULT_ABI,
    functionName: 'pendingWithdrawals',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!ARC_SLA_VAULT_ADDRESS && !!address, refetchInterval: 4000 },
  })
}

export function useUsdcBalance(address?: `0x${string}`) {
  const usdcFact = getUsdc(ARC_TESTNET_ID)
  return useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!address && !!usdcFact, refetchInterval: 6000 },
  })
}

export function useUsdcAllowance(owner?: `0x${string}`) {
  const usdcFact = getUsdc(ARC_TESTNET_ID)
  return useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'allowance',
    args: owner ? [owner, ARC_SLA_VAULT_ADDRESS] : undefined,
    chainId: ARC_TESTNET_ID,
    query: { enabled: !!owner && !!usdcFact && !!ARC_SLA_VAULT_ADDRESS, refetchInterval: 4000 },
  })
}

export function useApproveUsdc() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const usdcFact = getUsdc(ARC_TESTNET_ID)

  const approve = (amount: bigint) => {
    if (!usdcFact) return
    writeContract({
      address: usdcFact.address as `0x${string}`,
      abi: erc20Abi,
      functionName: 'approve',
      args: [ARC_SLA_VAULT_ADDRESS, amount],
    })
  }

  return { approve, hash, isPending, isConfirming, isSuccess, error, reset }
}

export function useCreateTask() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const createTask = (
    provider: `0x${string}`,
    treasuryVerifier: `0x${string}`,
    amount: bigint,
    maxLatencyMs: bigint,
  ) => {
    writeContract({
      address: ARC_SLA_VAULT_ADDRESS,
      abi: ARC_SLA_VAULT_ABI,
      functionName: 'createTask',
      args: [provider, treasuryVerifier, amount, maxLatencyMs],
    })
  }

  return { createTask, hash, isPending, isConfirming, isSuccess, error, reset }
}

export function useExecuteAndSettle() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const executeAndSettle = (taskId: bigint, actualLatencyMs: bigint, telemetryProofHash: `0x${string}`) => {
    writeContract({
      address: ARC_SLA_VAULT_ADDRESS,
      abi: ARC_SLA_VAULT_ABI,
      functionName: 'executeAndSettleSLA',
      args: [taskId, actualLatencyMs, telemetryProofHash],
    })
  }

  return { executeAndSettle, hash, isPending, isConfirming, isSuccess, error, reset }
}

export function useEmergencyReclaim() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const emergencyReclaim = (taskId: bigint) => {
    writeContract({
      address: ARC_SLA_VAULT_ADDRESS,
      abi: ARC_SLA_VAULT_ABI,
      functionName: 'emergencyReclaim',
      args: [taskId],
    })
  }

  return { emergencyReclaim, hash, isPending, isConfirming, isSuccess, error, reset }
}

export function useClaimPayout() {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const claimPayout = () => {
    writeContract({
      address: ARC_SLA_VAULT_ADDRESS,
      abi: ARC_SLA_VAULT_ABI,
      functionName: 'claimPayout',
      args: [],
    })
  }

  return { claimPayout, hash, isPending, isConfirming, isSuccess, error, reset }
}
