import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useWallet } from '../context/WalletContext'
import type { WalletProvider } from '../lib/types'

export default function Connect() {
  const navigate = useNavigate()
  const { connect, connecting, error, wallet } = useWallet()
  const [localError, setLocalError] = useState<string | null>(null)

  // Redirect if already connected
  useEffect(() => {
    if (wallet?.connected) navigate('/vault', { replace: true })
  }, [wallet, navigate])

  const handleConnect = async (provider: WalletProvider) => {
    setLocalError(null)
    try {
      await connect(provider)
      navigate('/vault')
    } catch (err: any) {
      setLocalError(err.message || 'Connection failed')
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <h1 className="mb-2 font-mono text-4xl font-bold tracking-tight">
        NOMOS
      </h1>
      <p className="mb-10 max-w-md text-sm text-nomos-muted">
        Pay or withdraw BCH only under rules the chain itself enforces.
        <br />
        Violate → refuse on-chain. Obey → pay + receipt.
      </p>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <button
          onClick={() => handleConnect('wizardconnect')}
          disabled={connecting}
          className="rounded-lg border border-nomos-border bg-nomos-surface px-6 py-3 font-medium transition-all hover:border-nomos-accent hover:bg-nomos-accent/10 disabled:opacity-40"
        >
          {connecting ? 'Connecting…' : 'Connect with WizardConnect'}
        </button>
        <button
          onClick={() => handleConnect('wc2')}
          disabled={connecting}
          className="rounded-lg border border-nomos-border bg-nomos-surface px-6 py-3 font-medium transition-all hover:border-nomos-accent hover:bg-nomos-accent/10 disabled:opacity-40"
        >
          {connecting ? 'Connecting…' : 'Connect with WalletConnect'}
        </button>
      </div>

      {(error || localError) && (
        <p className="mt-4 text-sm text-nomos-refuse">
          {error || localError}
        </p>
      )}
    </div>
  )
}
