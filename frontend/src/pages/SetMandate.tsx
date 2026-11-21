import { useState, useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { executeSetMandate, executeCreateVault, validateAllowlistAddress, validateCashAddress, getWalletBalance, MIN_VAULT_DEPOSIT_SATS, verifyAnchor } from '../lib/contract'
import { isNostrIdentifier, resolveNostrPayee } from '../lib/nostr'
import type { Mandate, VaultConfig } from '../lib/types'

function mandateSnapshot(config: VaultConfig): Mandate {
  return {
    dailyLimitSats: config.dailyLimitSats,
    spentTodaySats: 0,
    dayMarker: 0,
    allowlistEnabled: config.allowlistEnabled,
    allowlist: [...config.allowedAddrs],
    agentPk: config.agentPk || null,
    rescuePk: config.rescuePk || null,
  }
}

export default function SetMandate() {
  const navigate = useNavigate()
  const { wallet, vault, vaultConfig, setVaultConfig, addReceipt } = useWallet()
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
  const [deposit, setDeposit] = useState('0.0001')
  const [submitting, setSubmitting] = useState(false)
  const [step, setStep] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [walletBal, setWalletBal] = useState<number | null>(null)

  // Fetch wallet balance on mount so the user can see it before creating
  useEffect(() => {
    if (!wallet?.address) return
    getWalletBalance(wallet.address)
      .then(setWalletBal)
      .catch(() => setWalletBal(null))
  }, [wallet?.address])

  if (!wallet?.connected) return <Navigate to="/connect" replace />

  // No on-chain vault yet: either never configured, or configured but the
  // state NFT was never minted. Either way this form creates it.
  const needsDeploy = !vaultConfig || (vault !== null && !vault.deployed)

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

    const rawEntries = allowlistInput.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 5)

    // Allowlist entries may be Nostr names; resolve each to its linked address
    // (both keys signed), else the address its owner published. The contract
    // stores the address, so this happens once.
    const parsedAddrs: string[] = []
    if (allowlistEnabled) {
      for (const entry of rawEntries) {
        if (!isNostrIdentifier(entry)) { parsedAddrs.push(entry); continue }
        try {
          setStep(`Looking up ${entry.slice(0, 24)} on Nostr…`)
          const p = await resolveNostrPayee(entry, validateCashAddress, verifyAnchor)
          parsedAddrs.push(p.address)
        } catch (err: any) {
          setStep(null)
          setError(`${entry.slice(0, 24)}: ${err.message}`)
          return
        } finally {
          setStep(null)
        }
      }
    }

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
    if (!needsDeploy && vaultConfig &&
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
      if (needsDeploy) {
        // New vault: mint the state NFT into the covenant from the user's wallet
        const depositSats = Math.round(parseFloat(deposit || '0') * 1e8)
        const created = await executeCreateVault(newConfig, depositSats, wallet.address, wallet.provider, setStep, wallet.wcIndex ?? 0)
        setVaultConfig(newConfig)
        addReceipt({
          id: created.txid,
          kind: 'mandate',
          status: 'submitted',
          amount: depositSats,
          destination: created.tokenAddress,
          destinationLabel: 'Vault created',
          txHash: created.txid,
          mandate: mandateSnapshot(newConfig),
          timestamp: Date.now(),
        })
      } else if (vaultConfig) {
        // Existing vault: redeploy to a new contract with the new params
        const result = await executeSetMandate(
          vaultConfig,
          newConfig,
          wallet.address,
          wallet.provider,
          wallet.wcIndex ?? 0,
        )
        // Save the config that matches the NEW on-chain contract
        setVaultConfig(result.newConfig)
        addReceipt({
          id: result.txid,
          kind: 'mandate',
          status: 'submitted',
          amount: result.amountSats,
          destination: result.tokenAddress,
          destinationLabel: 'Mandate updated',
          txHash: result.txid,
          mandate: mandateSnapshot(result.newConfig),
          timestamp: Date.now(),
        })
      }
      navigate('/vault')
    } catch (err: any) {
      setError(err.message || 'Failed to set mandate')
    } finally {
      setSubmitting(false)
      setStep(null)
    }
  }

  return (
    <div className="page-enter space-y-4">
      <header>
        <h1 className="page-title">{needsDeploy ? 'Create vault' : 'Rules'}</h1>
      </header>

      <p className="text-sm text-nomos-muted">
        {needsDeploy
          ? 'Your wallet funds the vault. You may confirm one or two transactions.'
          : 'Saving moves the vault to a new address with the new rules.'}
      </p>

      {noPubkey && (
        <p className="text-sm text-nomos-refuse">Your wallet did not share a public key. Reconnect with WizardConnect.</p>
      )}

      {/* Daily limit */}
      <div>
        <label className="label mb-2 block">Daily limit (BCH)</label>
        <input
          type="number"
          step="0.00000001"
          value={dailyLimit}
          onChange={(e) => setDailyLimit(e.target.value)}
          placeholder="0.001"
          className="input"
        />
      </div>

      {/* Initial deposit (new vault only) */}
      {needsDeploy && (
        <div>
          <label className="label mb-2 block">Deposit (BCH)</label>
          <input
            type="number"
            step="0.00000001"
            min={MIN_VAULT_DEPOSIT_SATS / 1e8}
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
            placeholder="0.0001"
            className="input"
          />
          {walletBal !== null && (
            <p className="mt-1.5 text-sm text-nomos-muted">
              Wallet balance: <span className="tabular-nums text-nomos-text">{(walletBal / 1e8).toFixed(8)} BCH</span>
            </p>
          )}
        </div>
      )}

      {/* Allowlist */}
      <div>
        <label className="mb-2 flex cursor-pointer items-center gap-2 text-[15px] text-nomos-text">
          <input
            type="checkbox"
            checked={allowlistEnabled}
            onChange={(e) => setAllowlistEnabled(e.target.checked)}
            className="h-4 w-4 accent-nomos-accent"
          />
          Only pay up to 5 chosen addresses
        </label>
        {allowlistEnabled && (
          <textarea
            value={allowlistInput}
            onChange={(e) => setAllowlistInput(e.target.value)}
            placeholder={'One per line: address, npub or name@domain'}
            rows={4}
            className="input resize-none"
          />
        )}
      </div>

      {/* Agent key */}
      <div>
        <label className="label mb-2 block">Agent key (optional)</label>
        <input
          type="text"
          value={agentPk}
          onChange={(e) => setAgentPk(e.target.value)}
          placeholder="Public key, 02… or 03…"
          className="input font-mono text-sm"
          spellCheck={false}
        />
      </div>

      {/* Rescue key */}
      <div>
        <label className="label mb-2 block">Rescue key (optional)</label>
        <input
          type="text"
          value={rescuePk}
          onChange={(e) => setRescuePk(e.target.value)}
          placeholder="Public key, 02… or 03…"
          className="input font-mono text-sm"
          spellCheck={false}
        />
      </div>

      {step && <p className="pulse-text text-sm text-nomos-muted-bright">{step}</p>}
      {error && <p className="text-sm text-nomos-refuse">{error}</p>}

      <button onClick={handleConfirm} disabled={submitting} className="btn-primary w-full">
        {submitting
          ? <><span className="spinner mr-2" /> Signing…</>
          : needsDeploy
            ? 'Create vault'
            : 'Save rules'}
      </button>
    </div>
  )
}
