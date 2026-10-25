import { useState, useCallback } from 'react'
import { Header } from '@/components/Header'
import { SelfLoopButton } from '@/components/SelfLoopButton'
import { CreateTaskPanel } from '@/components/CreateTaskPanel'
import { TaskList } from '@/components/TaskList'
import { TxLedger, type TxRecord } from '@/components/TxLedger'

export default function App() {
  const [txRecords, setTxRecords] = useState<TxRecord[]>([])
  const [taskVersion, setTaskVersion] = useState(0)

  const handleTx = useCallback((record: TxRecord) => {
    setTxRecords(prev => [...prev, record])
  }, [])

  const handleTaskCreated = useCallback(() => {
    setTaskVersion(v => v + 1)
  }, [])

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg-gradient)' }}>
      <Header />

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        {/* 1-click self-loop hero */}
        <SelfLoopButton onTx={record => { handleTx(record); handleTaskCreated() }} />

        {/* 2-column workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <CreateTaskPanel onTx={handleTx} onTaskCreated={handleTaskCreated} />
          <TaskList key={taskVersion} onTx={handleTx} />
        </div>

        {/* Full-width ledger */}
        <TxLedger records={txRecords} />
      </main>
    </div>
  )
}
