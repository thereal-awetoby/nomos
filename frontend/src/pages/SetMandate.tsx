import { useCallback, useState, useEffect, useRef } from 'react'
import { useNavigate, Navigate, Link, useLocation } from 'react-router-dom'
import { useWallet } from '../context/WalletContext'
import { executeSetMandate, executeCreateVault, executeCloseVault, validateAllowlistAddress, validateCashAddress, getWalletBalance, MIN_VAULT_DEPOSIT_SATS, verifyAnchor } from '../lib/contract'
import { isNostrIdentifier, resolveNostrPayee } from '../lib/nostr'
import type { Mandate, VaultConfig } from '../lib/types'
import SpentMeter from '../components/SpentMeter'
import AddFunds from '../components/AddFunds'
import { fmtBch, shortAddr } from '../components/ui'
import { addressMatchesPubkey } from '../lib/wallet'
import { IS_CHIPNET } from '../lib/network'

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
  const { wallet, vault, vaultConfig, setVaultConfig, addReceipt, sharePubkey, disconnect } = useWallet()
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
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)

  // Fetch wallet balance on mount so the user can see it before creating
  const loadBalance = useCallback(() => {
    if (!wallet?.address) return
    getWalletBalance(wallet.address)
      .then(setWalletBal)
      .catch(() => setWalletBal(null))
  }, [wallet?.address])
  useEffect(() => { loadBalance() }, [loadBalance])

  if (!wallet?.connected) return <Navigate to="/connect" replace />

  // No on-chain vault yet: either never configured, or configured but the
  // state NFT was never minted. Either way this form creates it.
  const needsDeploy = !vaultConfig || (vault !== null && !vault.deployed)
  // A wallet that is only the agent key sees the vault but cannot change it.
  const isOwner = !vaultConfig || addressMatchesPubkey(wallet.address, vaultConfig.ownerPk)

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

  // Live preview of the rules being set (desktop column).
  const previewLimitSats = Math.max(0, Math.round((parseFloat(dailyLimit) || 0) * 1e8))
  const previewAllowCount = allowlistInput.split('\n').map((l) => l.trim()).filter(Boolean).length

  if (!isOwner) {
    return (
      <div className="page-enter mx-auto max-w-xl space-y-4">
        <h1 className="page-title">Rules</h1>
        <section className="rounded-2xl border hairline bg-nomos-surface p-6">
          <p className="text-[15px] font-semibold text-nomos-text">You are connected as this vault's agent</p>
          <p className="mt-1.5 text-sm leading-relaxed text-nomos-muted">
            The agent key can pay within the daily limit. Only the owner wallet can change the rules or close the vault. To create a vault of your own, connect a wallet that is not this vault's agent.
          </p>
          <Link to="/vault" className="btn-secondary mt-4">Back to the vault</Link>
        </section>
      </div>
    )
  }

  return (
    <div className="page-enter lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:items-start lg:gap-12">
    <div className="space-y-4">
      <header>
        <h1 className="page-title">{needsDeploy ? 'Create vault' : 'Change rules'}</h1>
      </header>

      <p className="text-sm text-nomos-muted">
        {needsDeploy
          ? 'Your wallet funds the vault. You may confirm one or two transactions.'
          : "Saving moves your coins to a new vault address with these rules, and today's spending starts again from zero. To start over with an empty form, close this vault at the bottom of the page."}
      </p>

      {needsDeploy && walletBal !== null && walletBal < MIN_VAULT_DEPOSIT_SATS + 1_500 && (
        <AddFunds
          address={wallet.address}
          onRefresh={loadBalance}
          title={walletBal === 0 ? 'Add BCH to your wallet first' : 'Add a little more BCH first'}
          body={`A vault needs at least ${MIN_VAULT_DEPOSIT_SATS.toLocaleString('en-US')} sats plus a small network fee, and your wallet holds ${walletBal.toLocaleString('en-US')} sats. ${IS_CHIPNET ? 'Get free test BCH from the chipnet faucet, sent to this address.' : 'Send BCH to this address, or buy some person to person on Mercar.'}`}
        />
      )}

      {noPubkey && (
        <div className="rounded-xl border-2 border-nomos-pending/60 bg-nomos-surface p-4">
          <p className="text-[15px] font-semibold text-nomos-text">Share your public key</p>
          {wallet.provider === 'wc2' ? (
            <>
              <p className="mt-1 text-sm text-nomos-muted-bright">
                Your wallet shared its address but not its public key, which the vault contract needs. Sign a short message in your wallet to share it. No funds move.
              </p>
              <button
                type="button"
                className="btn-primary mt-3 min-h-[40px] px-4 text-sm"
                disabled={sharing}
                onClick={() => {
                  setSharing(true)
                  setShareError(null)
                  sharePubkey()
                    .catch((err: unknown) => setShareError(err instanceof Error ? err.message : 'The wallet did not sign the message'))
                    .finally(() => setSharing(false))
                }}
              >
                {sharing ? <><span className="spinner" aria-hidden="true" /> Waiting for your wallet…</> : 'Sign to share public key'}
              </button>
              {shareError && <p className="mt-2 text-sm text-nomos-refuse">{shareError}</p>}
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-nomos-muted-bright">Your wallet did not share a public key, which the vault contract needs. Disconnect and connect again.</p>
              <button type="button" className="btn-secondary mt-3" onClick={() => { void disconnect().then(() => navigate('/connect')) }}>Disconnect</button>
            </>
          )}
        </div>
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
          {walletBal !== null && wallet?.address && (
            <p className="mt-1.5 text-sm text-nomos-muted">
              Balance at <span className="font-mono text-nomos-text">{shortAddr(wallet.address.replace(/^(bitcoincash|bchtest):/, ''), 4, 4)}</span>:{' '}
              <span className="tabular-nums text-nomos-text">{(walletBal / 1e8).toFixed(8)} BCH</span>
              <span className="mt-0.5 block text-xs">
                The vault is funded from the address your wallet shared. Your wallet's total can be higher if it holds BCH at other addresses.
              </span>
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
            : 'Save new rules'}
      </button>

      {!needsDeploy && vault?.deployed && vaultConfig && <CloseVault />}
    </div>

    <aside className="hidden lg:sticky lg:top-24 lg:block" aria-label="Preview of your rules">
      <div className="rounded-2xl border hairline bg-nomos-surface p-6">
        <p className="text-sm text-nomos-muted">Daily limit</p>
        <p className="mt-1 font-display text-[2.4rem] font-extrabold leading-none tabular-nums text-nomos-text" style={{ fontStretch: '112%' }}>
          {previewLimitSats > 0 ? previewLimitSats.toLocaleString('en-US') : '0'}
          <span className="ml-2 text-base font-semibold text-nomos-muted">sats</span>
        </p>
        {previewLimitSats > 0 && (
          <div className="mt-6">
            <SpentMeter spentSats={0} limitSats={previewLimitSats} />
          </div>
        )}
        <ul className="mt-6 space-y-2.5 text-sm">
          {[
            { label: 'Allowlist', value: allowlistEnabled ? `${Math.min(previewAllowCount, 5)} of 5 addresses` : 'Off', on: allowlistEnabled },
            { label: 'Agent key', value: agentPk.trim() ? 'Set' : 'None', on: Boolean(agentPk.trim()) },
            { label: 'Rescue key', value: rescuePk.trim() ? 'Set' : 'None', on: Boolean(rescuePk.trim()) },
          ].map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-nomos-muted">
                <span className={`h-2 w-2 rounded-full ${row.on ? 'bg-nomos-ok' : 'bg-nomos-surface-raised'}`} aria-hidden="true" />
                {row.label}
              </span>
              <span className="text-nomos-text">{row.value}</span>
            </li>
          ))}
        </ul>
        <p className="mt-6 border-t hairline pt-4 text-sm leading-relaxed text-nomos-muted">
          {previewLimitSats > 0
            ? `Once the vault exists, any payment that would take today's total past ${previewLimitSats.toLocaleString('en-US')} sats is refused by every Bitcoin Cash node.`
            : 'Enter a daily limit to see your vault.'}
        </p>
      </div>
    </aside>
    </div>
  )
}

// ── Close vault ─────────────────────────────────────────────
// Sends every coin back to the owner's wallet. Afterwards this wallet can
// create a new vault from scratch.
function CloseVault() {
  const navigate = useNavigate()
  const location = useLocation()
  const { wallet, vault, vaultConfig, clearVaultConfig, addReceipt } = useWallet()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    if (location.hash === '#close-vault') ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [location.hash])

  if (!wallet || !vault || !vaultConfig) return null

  const close = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await executeCloseVault(vaultConfig, wallet.address, wallet.provider, wallet.wcIndex ?? 0)
      addReceipt({
        id: result.txid,
        kind: 'mandate',
        status: 'submitted',
        amount: result.amountSats,
        destination: wallet.address,
        destinationLabel: 'Vault closed',
        txHash: result.txid,
        mandate: mandateSnapshot(vaultConfig),
        timestamp: Date.now(),
      })
      clearVaultConfig()
      navigate('/vault')
    } catch (err: any) {
      setError(err?.message || 'The vault was not closed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section ref={ref} id="close-vault" className="mt-10 rounded-2xl border border-nomos-refuse/40 bg-nomos-surface p-5" aria-label="Close vault">
      <h2 className="text-[17px] font-semibold text-nomos-text">Close vault</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-nomos-muted">
        Sends all {fmtBch(vault.balanceSats)} BCH back to your wallet, minus a small network fee, and ends these rules. Then you can create a new vault from scratch.
      </p>
      {!confirming ? (
        <button type="button" onClick={() => setConfirming(true)} className="btn-secondary mt-4 min-h-[40px] border-nomos-refuse/50 px-4 text-sm text-nomos-refuse">
          Close vault
        </button>
      ) : (
        <div className="mt-4 rounded-xl bg-nomos-surface-raised p-4">
          <p className="text-sm text-nomos-text">Your wallet will ask you to sign one transaction to {wallet.address.replace(/^[a-z]+:/, '').slice(0, 10)}…, your own address.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => { void close() }} disabled={busy} className="btn-primary min-h-[40px] bg-nomos-refuse px-4 text-sm text-white hover:bg-nomos-refuse">
              {busy ? <><span className="spinner mr-2" aria-hidden="true" /> Waiting for your wallet…</> : 'Sign and close vault'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="btn-ghost min-h-[40px] px-4 text-sm">Keep the vault</button>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-nomos-refuse">{error}</p>}
    </section>
  )
}
