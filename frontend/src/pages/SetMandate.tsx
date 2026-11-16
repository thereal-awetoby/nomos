import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function SetMandate() {
  const navigate = useNavigate()
  const [dailyLimit, setDailyLimit] = useState('')
  const [allowlistEnabled, setAllowlistEnabled] = useState(false)
  const [allowlistInput, setAllowlistInput] = useState('')
  const [agentPk, setAgentPk] = useState('')
  const [rescuePk, setRescuePk] = useState('')

  const handleConfirm = async () => {
    // TODO: build + sign setMandate tx via CashScript
    console.log('[nomos] setMandate', {
      dailyLimit,
      allowlistEnabled,
      allowlist: allowlistInput.split('\n').filter(Boolean),
      agentPk: agentPk || null,
      rescuePk: rescuePk || null,
    })
    navigate('/vault')
  }

  return (
    <div className="space-y-6">
      <h2 className="font-mono text-xl font-bold">Set Mandate</h2>

      {/* Daily limit */}
      <div>
        <label className="mb-1 block text-xs uppercase tracking-widest text-nomos-muted">
          Daily limit (BCH)
        </label>
        <input
          type="number"
          step="0.00000001"
          value={dailyLimit}
          onChange={(e) => setDailyLimit(e.target.value)}
          placeholder="0.001"
          className="w-full rounded-lg border border-nomos-border bg-nomos-bg px-4 py-3 font-mono text-sm focus:border-nomos-accent focus:outline-none"
        />
      </div>

      {/* Allowlist */}
      <div>
        <label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-nomos-muted">
          <input
            type="checkbox"
            checked={allowlistEnabled}
            onChange={(e) => setAllowlistEnabled(e.target.checked)}
            className="accent-nomos-accent"
          />
          Allowlist (up to 5 addresses)
        </label>
        {allowlistEnabled && (
          <textarea
            value={allowlistInput}
            onChange={(e) => setAllowlistInput(e.target.value)}
            placeholder={'bitcoincash:qr...\nbitcoincash:qp...'}
            rows={5}
            className="w-full rounded-lg border border-nomos-border bg-nomos-bg px-4 py-3 font-mono text-xs focus:border-nomos-accent focus:outline-none"
          />
        )}
      </div>

      {/* Agent key */}
      <div>
        <label className="mb-1 block text-xs uppercase tracking-widest text-nomos-muted">
          Agent public key (optional)
        </label>
        <input
          type="text"
          value={agentPk}
          onChange={(e) => setAgentPk(e.target.value)}
          placeholder="02abc..."
          className="w-full rounded-lg border border-nomos-border bg-nomos-bg px-4 py-3 font-mono text-xs focus:border-nomos-accent focus:outline-none"
        />
      </div>

      {/* Rescue co-signer */}
      <div>
        <label className="mb-1 block text-xs uppercase tracking-widest text-nomos-muted">
          Rescue co-signer public key (optional)
        </label>
        <input
          type="text"
          value={rescuePk}
          onChange={(e) => setRescuePk(e.target.value)}
          placeholder="03def..."
          className="w-full rounded-lg border border-nomos-border bg-nomos-bg px-4 py-3 font-mono text-xs focus:border-nomos-accent focus:outline-none"
        />
      </div>

      {/* Confirm */}
      <button
        onClick={handleConfirm}
        className="w-full rounded-lg bg-nomos-accent py-3 text-center font-semibold text-nomos-bg transition-all hover:brightness-110"
      >
        Confirm Mandate (sign on-chain)
      </button>
    </div>
  )
}
