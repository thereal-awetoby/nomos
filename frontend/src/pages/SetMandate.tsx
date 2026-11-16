import { useState } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { executeSetMandate, validateAllowlistAddress } from '../lib/contract'

export default function SetMandate() {
  const navigate = useNavigate()
  const { wallet, vaultConfig, setVaultConfig } = useWallet()
  // Pre-fill from existing config when editing an active mandate
  const [dailyLimit, setDailyLimit] = useState(
    vaultConfig ? (vaultConfig.dailyLimitSats / 1e8).toString() : '',
  )
  const [allowlistEnabled, setAllowlistEnabled] = useState(
    vaultConfig?.allowlistEnabled ?? false,
  )
  const [allowlistInput, setAllowlistInput] = useState(
    vaultConfig?.allowedAddrs.filter(Boolean).join('\n') ?? '',
  )
  const [agentPk, setAgentPk] = useState(vaultConfig?.agentPk ?? '')
  const [rescuePk, setRescuePk] = useState(vaultConfig?.rescuePk ?? '')
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

    setError(null)

    const parsedAddrs = allowlistInput.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 5)

    // Validate allowlist addresses (strict: P2PKH only, correct network)
    if (allowlistEnabled && parsedAddrs.length > 0) {
      for (const addr of parsedAddrs) {
        const err = validateAllowlistAddress(addr)
        if (err) {
          setError(`Bad allowlist address "${addr.slice(0, 24)}…": ${err}`)
          return
        }
      }
    }

    const newConfig = {
      ownerPk: wallet.pubkey,
      agentPk: agentPk || '',
      dailyLimitSats: Math.round(parseFloat(dailyLimit || '0') * 1e8),
      allowlistEnabled,
      allowedAddrs: parsedAddrs,
      rescuePk: rescuePk || '',
    }

    // Skip on-chain tx if nothing actually changed
    if (vaultConfig &&
      vaultConfig.ownerPk === newConfig.ownerPk &&
      vaultConfig.dailyLimitSats === newConfig.dailyLimitSats &&
      vaultConfig.allowlistEnabled === newConfig.allowlistEnabled &&
      vaultConfig.agentPk === newConfig.agentPk &&
      vaultConfig.rescuePk === newConfig.rescuePk &&
      JSON.stringify(vaultConfig.allowedAddrs) === JSON.stringify(newConfig.allowedAddrs)
    ) {
      navigate('/vault')
      return
    }

    setSubmitting(true)

    try {
      if (vaultConfig) {
        // Existing vault — redeploy to new contract on-chain
        const result = await executeSetMandate(
          vaultConfig,
          newConfig,
          wallet.address,
          wallet.provider,
        )
        // Save the config that matches the NEW on-chain contract
        setVaultConfig(result.newConfig)
      } else {
        // First time — just save locally
        setVaultConfig(newConfig)
      }
      navigate('/vault')
    } catch (err: any) {
      setError(err.message || 'Failed to set mandate')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page-enter space-y-5">
      {/* Back nav */}
      <Link to="/vault" className="text-xs text-nomos-muted hover:text-nomos-accent transition-colors duration-200">
        ← Back to vault
      </Link>

      <h2 className="font-mono text-2xl font-bold">Set Mandate</h2>

      {/* Info banner */}
      {!vaultConfig ? (
        <div className="card border-nomos-accent/15 bg-nomos-accent/[0.04] p-4 text-xs text-nomos-accent" style={{ borderWidth: '1px', borderStyle: 'solid' }}>
          <strong>First time?</strong> This saves your mandate config locally.
          Deploy the vault on-chain with <code className="text-nomos-accent/80">mint-nft.mjs</code>, then fund the contract address.
        </div>
      ) : (
        <div className="card border-nomos-accent/15 bg-nomos-accent/[0.04] p-4 text-xs text-nomos-accent" style={{ borderWidth: '1px', borderStyle: 'solid' }}>
          <strong>Updating mandate.</strong> This redeploys your vault to a new contract address. NFT and funds move automatically.
        </div>
      )}

      {noPubkey && (
        <div className="card border-nomos-refuse/15 bg-nomos-refuse/[0.04] p-4 text-xs text-nomos-refuse" style={{ borderWidth: '1px', borderStyle: 'solid' }}>
          Your wallet didn't provide a public key. Reconnect with WizardConnect for full support.
        </div>
      )}

      {/* Daily limit */}
      <div>
        <label className="label mb-2 block">Daily Limit (BCH)</label>
        <input
          type="number"
          step="0.00000001"
          value={dailyLimit}
          onChange={(e) => setDailyLimit(e.target.value)}
          placeholder="0.001"
          className="input"
        />
      </div>

      {/* Allowlist */}
      <div>
        <label className="mb-3 flex items-center gap-2 label cursor-pointer">
          <input
            type="checkbox"
            checked={allowlistEnabled}
            onChange={(e) => setAllowlistEnabled(e.target.checked)}
            className="accent-nomos-accent h-3.5 w-3.5"
          />
          Allowlist (up to 5 addresses)
        </label>
        {allowlistEnabled && (
          <textarea
            value={allowlistInput}
            onChange={(e) => setAllowlistInput(e.target.value)}
            placeholder={'bitcoincash:qr…\nbitcoincash:qp…'}
            rows={4}
            className="input text-xs resize-none"
          />
        )}
      </div>

      {/* Agent key */}
      <div>
        <label className="label mb-2 block">Agent Public Key (optional)</label>
        <input
          type="text"
          value={agentPk}
          onChange={(e) => setAgentPk(e.target.value)}
          placeholder="02abc…"
          className="input text-xs"
        />
      </div>

      {/* Rescue key */}
      <div>
        <label className="label mb-2 block">Rescue Co-signer Key (optional)</label>
        <input
          type="text"
          value={rescuePk}
          onChange={(e) => setRescuePk(e.target.value)}
          placeholder="03def…"
          className="input text-xs"
        />
      </div>

      {error && <p className="text-xs text-nomos-refuse">{error}</p>}

      <button onClick={handleConfirm} disabled={submitting} className="btn-primary w-full">
        {submitting
          ? <><span className="spinner mr-2" /> Signing…</>
          : vaultConfig
            ? 'Update Mandate'
            : 'Save Mandate Config'}
      </button>
    </div>
  )
}
