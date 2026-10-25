// ArcSLAVault contract config — address filled after deploy
export const ARC_SLA_VAULT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS ?? '') as `0x${string}`

export const ARC_SLA_VAULT_ABI = [
  // Constructor
  { type: 'constructor', inputs: [{ name: '_usdc', type: 'address' }], stateMutability: 'nonpayable' },

  // Events
  {
    type: 'event',
    name: 'TaskCreated',
    inputs: [
      { name: 'taskId', type: 'uint256', indexed: true },
      { name: 'requester', type: 'address', indexed: true },
      { name: 'provider', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'maxLatencyMs', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'SLASettledWithSplit',
    inputs: [
      { name: 'taskId', type: 'uint256', indexed: true },
      { name: 'providerPayout', type: 'uint256', indexed: false },
      { name: 'treasuryPayout', type: 'uint256', indexed: false },
      { name: 'actualLatencyMs', type: 'uint256', indexed: false },
      { name: 'proofHash', type: 'bytes32', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'SLABreachedAutoRefunded',
    inputs: [
      { name: 'taskId', type: 'uint256', indexed: true },
      { name: 'requester', type: 'address', indexed: true },
      { name: 'refundedAmount', type: 'uint256', indexed: false },
      { name: 'actualLatencyMs', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'EmergencyReclaimed',
    inputs: [
      { name: 'taskId', type: 'uint256', indexed: true },
      { name: 'requester', type: 'address', indexed: true },
      { name: 'reclaimedAmount', type: 'uint256', indexed: false },
    ],
  },

  // Errors
  { type: 'error', name: 'InvalidAmount', inputs: [] },
  { type: 'error', name: 'InvalidShareBps', inputs: [] },
  { type: 'error', name: 'ZeroAddress', inputs: [] },
  { type: 'error', name: 'TaskNotActive', inputs: [] },
  { type: 'error', name: 'NotAuthorized', inputs: [] },
  { type: 'error', name: 'InsufficientPendingBalance', inputs: [] },
  { type: 'error', name: 'TransferFromFailed', inputs: [] },
  { type: 'error', name: 'TransferFailed', inputs: [] },

  // State
  {
    type: 'function', name: 'usdc', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'address' }],
  },
  {
    type: 'function', name: 'taskCount', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'activeTaskCount', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'totalVolumeUsdc', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'totalSplitsSettled', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'totalBreachRefunds', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function', name: 'pendingWithdrawals', stateMutability: 'view',
    inputs: [{ name: 'addr', type: 'address' }], outputs: [{ type: 'uint256' }],
  },

  // Write functions
  {
    type: 'function',
    name: 'createTask',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_provider', type: 'address' },
      { name: '_treasuryVerifier', type: 'address' },
      { name: '_amount', type: 'uint256' },
      { name: '_maxLatencyMs', type: 'uint256' },
    ],
    outputs: [{ name: 'taskId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'executeAndSettleSLA',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_taskId', type: 'uint256' },
      { name: '_actualLatencyMs', type: 'uint256' },
      { name: '_telemetryProofHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'emergencyReclaim',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_taskId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimPayout',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },

  // View functions
  {
    type: 'function',
    name: 'getAllTasks',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'requester', type: 'address' },
          { name: 'provider', type: 'address' },
          { name: 'treasuryVerifier', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'maxLatencyMs', type: 'uint256' },
          { name: 'actualLatencyMs', type: 'uint256' },
          { name: 'providerShareBps', type: 'uint256' },
          { name: 'telemetryProofHash', type: 'bytes32' },
          { name: 'status', type: 'uint8' },
          { name: 'createdAt', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getProtocolStats',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'totalVolume', type: 'uint256' },
      { name: 'splitsSettled', type: 'uint256' },
      { name: 'breachRefunds', type: 'uint256' },
      { name: 'activeTasks', type: 'uint256' },
    ],
  },
] as const
