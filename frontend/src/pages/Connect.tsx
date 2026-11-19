import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useWallet } from '../context/WalletContext'
import { WizardConnectQRDialog } from '@wizardconnect/react'
import { qrColors, THEME_CHANGE_EVENT } from '../lib/theme'
import { useToast } from '../components/Toast'

export default function Connect() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const {
    wallet, connecting, error,
    wcState, wcUri, wcQrUri, wcWalletName,
    startWizardConnect, cancelWizardConnect, connectWc2,
  } = useWallet()

  const [localError, setLocalError] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [wc2Uri, setWc2Uri] = useState<string | null>(null)
  const [qrThemeVersion, setQrThemeVersion] = useState(0)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const onThemeChange = () => setQrThemeVersion((version) => version + 1)
    window.addEventListener(THEME_CHANGE_EVENT, onThemeChange)
    return () => window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange)
  }, [])

  useEffect(() => {
    if (wallet?.connected) navigate('/vault', { replace: true })
  }, [wallet, navigate])

  useEffect(() => {
    const handler = (e: Event) => {
      const uri = (e as CustomEvent<string>).detail
      if (uri) setWc2Uri(uri)
    }
    window.addEventListener('nomos:wc2:uri', handler)
    return () => window.removeEventListener('nomos:wc2:uri', handler)
  }, [])

  useEffect(() => {
    const canvas = qrCanvasRef.current
    if (!wc2Uri || !canvas) return

    let cancelled = false
    import('qrcode').then((QRCode) => {
      if (cancelled) return
      return QRCode.toCanvas(canvas, wc2Uri, {
        width: 220,
        margin: 2,
        color: qrColors(),
      })
    }).catch(() => {
      // QR generation failure leaves the pairing URI available to copy.
    })
    return () => { cancelled = true }
  }, [wc2Uri, qrThemeVersion])

  const handleWizardConnect = useCallback(() => {
    setLocalError(null)
    const started = startWizardConnect()
    if (started !== false) {
      setShowQr(true)
      toast('WizardConnect pairing started', 'info')
    } else {
      toast('A wallet pairing is already in progress', 'info')
    }
  }, [startWizardConnect, toast])

  const handleWc2 = useCallback(async () => {
    setLocalError(null)
    setWc2Uri(null)
    try {
      await connectWc2()
      toast('Wallet connected', 'success')
      navigate('/vault')
    } catch (err: any) {
      const message = err.message || 'Connection failed'
      setLocalError(message)
      toast(message, 'error')
    }
  }, [connectWc2, navigate, toast])

  const copyWc2Uri = async () => {
    if (!wc2Uri) return
    try {
      await navigator.clipboard.writeText(wc2Uri)
      toast('WalletConnect pairing URI copied', 'success')
    } catch {
      toast('Could not copy pairing URI', 'error')
    }
  }

  const displayError = localError || error || null

  return (
    <div className="page-enter flex min-h-[75vh] flex-col items-center justify-center text-center">
      {/* Logo */}
      <div className="mb-10">
        <p className="eyebrow mb-3">STEP 1 OF 4 · CONNECT</p>
        <h1 className="font-mono text-5xl font-bold tracking-tighter text-nomos-text">
          NOMOS
        </h1>
        <p className="mt-3 max-w-[280px] text-sm leading-relaxed text-nomos-muted">
          On-chain spend rules for BCH.
          <br />
          Set a daily limit. The vault covenant checks each spend.
        </p>
        <p className="mt-2 max-w-[280px] text-[10px] leading-relaxed text-nomos-muted/60">
          No Nomos-operated backend or manual approval queue; your wallet still signs each spend. The CashScript covenant enforces its deployed rules on-chain, so a violating spend is invalid, not merely blocked by this app.
        </p>
      </div>

      {/* Buttons */}
      <div className="flex w-full max-w-xs flex-col gap-3">
        <button
          onClick={handleWizardConnect}
          disabled={connecting || wcState === 'connecting'}
          className="btn-primary"
        >
          {wcState === 'connecting'
            ? <><span className="spinner mr-2" /> Scan QR to connect…</>
            : wcState === 'reconnecting'
              ? <><span className="spinner mr-2" /> Reconnecting…</>
              : 'Connect with WizardConnect'}
        </button>
        <button
          onClick={handleWc2}
          disabled={connecting || wcState === 'connecting'}
          className="btn-ghost"
        >
          {connecting ? <><span className="spinner mr-2" /> Connecting…</> : 'Connect with WalletConnect v2'}
        </button>
      </div>

      {/* WC2 QR code */}
      {wc2Uri && connecting && (
        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="label">Scan with your BCH wallet</p>
          <div className="card p-3">
            <canvas ref={qrCanvasRef} />
          </div>
          <button
            onClick={() => { void copyWc2Uri() }}
            className="text-[10px] text-nomos-muted hover:text-nomos-accent transition-colors duration-200"
          >
            Copy pairing URI
          </button>
        </div>
      )}

      {wcWalletName && wcState === 'connected' && (
        <p className="mt-5 text-xs text-nomos-muted-bright">
          Connected to {wcWalletName}
        </p>
      )}

      {displayError && (
        <p className="mt-5 text-xs text-nomos-refuse">{displayError}</p>
      )}

      {wcUri && wcQrUri && (
        <WizardConnectQRDialog
          show={showQr}
          onClose={() => { setShowQr(false); cancelWizardConnect() }}
          uri={wcUri}
          qrUri={wcQrUri}
          title="Nomos"
          subtitle="Scan with your BCH wallet to connect"
        />
      )}

      <section className="mt-12 w-full max-w-xs space-y-4 text-left" aria-labelledby="how-nomos-works">
        <h2 id="how-nomos-works" className="label text-center">How Nomos works</h2>
        <ol className="space-y-3">
          {[
            { step: '1', title: 'Connect a BCH wallet', desc: 'Pair with WizardConnect or WalletConnect v2.' },
            { step: '2', title: 'Create your vault', desc: 'Set a daily cap, optional allowlist, and agent key.' },
            { step: '3', title: 'Fund the vault', desc: 'Use its token-aware deposit address; check the network first.' },
            { step: '4', title: 'Pay under the rules', desc: 'Review the live preview; Activity saves receipts and /proof checks node replies.' },
          ].map(({ step, title, desc }) => (
            <li key={step} className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nomos-accent/15 text-sm font-bold text-nomos-accent">
                {step}
              </span>
              <div>
                <p className="text-xs font-medium text-nomos-text">{title}</p>
                <p className="text-[10px] text-nomos-muted">{desc}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="text-center text-[10px] text-nomos-muted/60">
          The Bridge route is a preview; swap and cross-chain actions are disabled.
        </p>
        <div className="space-y-2 pt-2">
          <p className="label text-center">Explore without a wallet</p>
          <div className="grid grid-cols-2 gap-2">
            <Link to="/simulate" className="btn-ghost py-2.5 text-center text-[10px]">
              Try the simulator
            </Link>
            <Link to="/identity" className="btn-ghost py-2.5 text-center text-[10px]">
              Nostr lookup
            </Link>
            <Link to="/architecture" className="btn-ghost py-2.5 text-center text-[10px]">
              Architecture
            </Link>
            <Link to="/proof" className="btn-ghost py-2.5 text-center text-[10px]">
              Proof checker
            </Link>
          </div>
          <p className="pt-1 text-center text-[10px] text-nomos-muted/60">
            Use the help button or press <kbd className="font-mono">?</kbd> for keyboard shortcuts.
          </p>
        </div>
      </section>
    </div>
  )
}
