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
      <div className="mb-8">
        <h1 className="font-mono text-5xl font-bold tracking-tighter text-nomos-text">
          NOMOS
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-nomos-muted">
          On-chain spend rules for BCH.
          <br />
          Set a daily limit. The vault covenant checks each spend.
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3">
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

      <section className="mt-10 w-full max-w-sm space-y-3 text-left" aria-labelledby="how-nomos-works">
        <h2 id="how-nomos-works" className="label text-center">How it works</h2>
        <ol className="space-y-2">
          {[
            { step: '1', title: 'Connect a BCH wallet' },
            { step: '2', title: 'Create a vault with a daily limit' },
            { step: '3', title: 'Fund the vault' },
            { step: '4', title: 'Pay under the rules' },
          ].map(({ step, title }) => (
            <li key={step} className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-nomos-accent/15 text-[10px] font-bold text-nomos-accent">
                {step}
              </span>
              <p className="text-xs text-nomos-text">{title}</p>
            </li>
          ))}
        </ol>
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Link to="/simulate" className="btn-ghost py-2 text-center text-[10px]">
            Simulator
          </Link>
          <Link to="/architecture" className="btn-ghost py-2 text-center text-[10px]">
            Architecture
          </Link>
        </div>
      </section>
    </div>
  )
}
