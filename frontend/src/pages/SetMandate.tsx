import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { executeSetMandate } from '../lib/contract'

export default function SetMandate() {
  const navigate = useNavigate()
  const { wallet, vaultConfig, setVaultConfig } = useWallet()
  const [dailyLimit, setDailyLimit] = useState('')
  const [allowlistEnabled, setAllowlistEnabled] = useState(false)
  const [allowlistInput, setAllowlistInput] = useState('')
  const [agentPk, setAgentPk] = useState('')
  const [rescuePk, setRescuePk] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!wallet?.connected) return <Navigate to="/" replace />

  // Warn if pubkey is missing (WC2 wallet didn't support bch_getAddresses)
  const noPubkey = !wallet.pubkey

  const handleConfirm = async () => {
    if (noPubkey) {
      setError(
        'Your wallet did not provide a public key. ' +
        'Try connecting with WizardConnect, or paste your owner public key manually.',
      )
      return
    }

    setSubmitting(true)
    setError(null)

    const newConfig = {
      ownerPk: wallet.pubkey,
      agentPk: agentPk || '',
      dailyLimitSats: Math.round(parseFloat(dailyLimit || '0') * 1e8),
      allowlistEnabled,
      allowedAddrs: allowlistInput.split('\n').filter(Boolean).slice(0, 5),
      rescuePk: rescuePk || '',
    }

    try {
      if (vaultConfig) {
        // Existing vault — call setMandate on-chain
        await executeSetMandate(
          vaultConfig,
          {
            dailyLimitSats: newConfig.dailyLimitSats,
            allowlistEnabled,
            allowlist: newConfig.allowedAddrs,
            agentPk: agentPk || null,
            rescuePk: rescuePk || null,
          },
          wallet.address,
          wallet.provider,
        )
      }
      // Save config locally (used to instantiate the contract)
      setVaultConfig(newConfig)
      navigate('/vault')
    } catch (err: any) {
      setError(err.message || 'Failed to set mandate')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="font-mono text-xl font-bold">Set Mandate</h2>

      {!vaultConfig && (
        <div className="rounded-lg border border-nomos-accent/30 bg-nomos-accent/5 p-3 text-xs text-nomos-accent">
          <strong>First time?</strong> This saves your mandate config locally.
          To deploy the vault on-chain, you'll also need to mint the genesis
          NFT using the <code>mint-nft.mjs</code> script and fund the
          contract address.
        </div>
      )}

      {noPubkey && (
        <div className="rounded-lg border border-nomos-refuse/30 bg-nomos-refuse/5 p-3 text-xs text-nomos-refuse">
          Your wallet didn't provide a public key.
          Reconnect with WizardConnect for full support.
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs uppercase tracking-widest text-nomos-muted">Daily limit (BCH)</label>
        <input type="number" step="0.00000001" value={dailyLimit}
          onChange={(e) => setDailyLimit(e.target.value)} placeholder="0.001"
          className="w-full rounded-lg border border-nomos-border bg-nomos-bg px-4 py-3 font-mono text-sm focus:border-nomos-accent focus:outline-none" />
      </div>

      <div>
        <label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-nomos-muted">
          <input type="checkbox" checked={allowlistEnabled}
            onChange={(e) => setAllowlistEnabled(e.target.checked)} className="accent-nomos-accent" />
          Allowlist (up to 5 addresses)
        </label>
        {allowlistEnabled && (
          <textarea value={allowlistInput} onChange={(e) => setAllowlistInput(e.target.value)}
            placeholder={'bitcoincash:qr…\nbitcoincash:qp…'} rows={5}
            className="w-full rounded-lg border border-nomos-border bg-nomos-bg px-4 py-3 font-mono text-xs focus:border-nomos-accent focus:outline-none" />
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-widest text-nomos-muted">Agent public key (optional)</label>
        <input type="text" value={agentPk} onChange={(e) => setAgentPk(e.target.value)}
          placeholder="02abc…"
          className="w-full rounded-lg border border-nomos-border bg-nomos-bg px-4 py-3 font-mono text-xs focus:border-nomos-accent focus:outline-none" />
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-widest text-nomos-muted">Rescue co-signer public key (optional)</label>
        <input type="text" value={rescuePk} onChange={(e) => setRescuePk(e.target.value)}
          placeholder="03def…"
          className="w-full rounded-lg border border-nomos-border bg-nomos-bg px-4 py-3 font-mono text-xs focus:border-nomos-accent focus:outline-none" />
      </div>

      {error && <p className="text-sm text-nomos-refuse">{error}</p>}

      <button onClick={handleConfirm} disabled={submitting}
        className="w-full rounded-lg bg-nomos-accent py-3 text-center font-semibold text-nomos-bg transition-all hover:brightness-110 disabled:opacity-40">
        {submitting ? 'Signing…' : vaultConfig ? 'Update Mandate (sign on-chain)' : 'Save Mandate Config'}
      </button>
    </div>
  )
}
