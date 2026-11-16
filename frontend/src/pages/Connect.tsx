import { useNavigate } from 'react-router-dom'

export default function Connect() {
  const navigate = useNavigate()

  // TODO: replace with real wallet connection
  const handleConnect = (provider: 'wizardconnect' | 'xo') => {
    console.log(`[nomos] connect with ${provider}`)
    // After real wallet connect, navigate to vault home
    navigate('/vault')
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      {/* Mark */}
      <h1 className="mb-2 font-mono text-4xl font-bold tracking-tight">
        NOMOS
      </h1>
      <p className="mb-10 max-w-md text-sm text-nomos-muted">
        Pay or withdraw BCH only under rules the chain itself enforces.
        <br />
        Violate → refuse on-chain. Obey → pay + receipt.
      </p>

      {/* Connect buttons */}
      <div className="flex w-full max-w-xs flex-col gap-3">
        <button
          onClick={() => handleConnect('wizardconnect')}
          className="rounded-lg border border-nomos-border bg-nomos-surface px-6 py-3 font-medium transition-all hover:border-nomos-accent hover:bg-nomos-accent/10"
        >
          Connect with WizardConnect
        </button>
        <button
          onClick={() => handleConnect('xo')}
          className="rounded-lg border border-nomos-border bg-nomos-surface px-6 py-3 font-medium transition-all hover:border-nomos-accent hover:bg-nomos-accent/10"
        >
          Connect with XO
        </button>
      </div>
    </div>
  )
}
