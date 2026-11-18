import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useWallet } from '../context/WalletContext'
import { WizardConnectQRDialog } from '@wizardconnect/react'
import { qrColors, THEME_CHANGE_EVENT } from '../lib/theme'

export default function Connect() {
  const navigate = useNavigate()
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
    if (started !== false) setShowQr(true)
  }, [startWizardConnect])

  const handleWc2 = useCallback(async () => {
    setLocalError(null)
    setWc2Uri(null)
    try {
      await connectWc2()
      navigate('/vault')
    } catch (err: any) {
      setLocalError(err.message || 'Connection failed')
    }
  }, [connectWc2, navigate])

  const displayError = localError || error || null

  return (
    <div className="page-enter flex min-h-[75vh] flex-col items-center justify-center text-center">
      {/* Logo */}
      <div className="mb-10">
        <h1 className="font-mono text-5xl font-bold tracking-tighter text-nomos-text">
          NOMOS
        </h1>
        <p className="mt-3 max-w-[280px] text-sm leading-relaxed text-nomos-muted">
          Spend rules the chain enforces.
          <br />
          Violate → refuse. Obey → pay + receipt.
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
              : 'Connect Wallet'}
        </button>
        <button
          onClick={handleWc2}
          disabled={connecting || wcState === 'connecting'}
          className="btn-ghost"
        >
          {connecting ? <><span className="spinner mr-2" /> Connecting…</> : 'WalletConnect'}
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
            onClick={() => navigator.clipboard?.writeText(wc2Uri)}
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
    </div>
  )
}
