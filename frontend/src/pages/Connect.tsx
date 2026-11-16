import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useWallet } from '../context/WalletContext'
import { useWizardConnect } from '@wizardconnect/react'
import { WizardConnectQRDialog } from '@wizardconnect/react'
import {
  setWcManager,
  getWcPubkeyHex,
  getWcAddress,
} from '../lib/wallet'

export default function Connect() {
  const navigate = useNavigate()
  const { connectWc2, setWalletDirect, connecting, error, wallet } = useWallet()
  const [localError, setLocalError] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [wc2Uri, setWc2Uri] = useState<string | null>(null)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

  // ── WizardConnect hook (handles relay, session, auto-reconnect) ──
  const {
    state: wcState,
    manager: wcManager,
    uri: wcUri,
    qrUri: wcQrUri,
    walletName,
    connect: wcConnect,
    disconnect: wcDisconnect,
    error: wcError,
  } = useWizardConnect({
    dappName: 'Nomos',
    dappIcon: window.location.origin + '/favicon.ico',
    persistSession: true,
  })

  // Keep wallet.ts in sync with the current manager
  useEffect(() => {
    setWcManager(wcManager ?? null)
  }, [wcManager])

  // When WizardConnect reaches "connected", derive address + pubkey
  useEffect(() => {
    if (wcState === 'connected' && wcManager) {
      const address = getWcAddress()
      const pubkey = getWcPubkeyHex()
      if (address) {
        setWalletDirect({
          provider: 'wizardconnect',
          address,
          pubkey,
          connected: true,
        })
        setShowQr(false)
      }
    }
  }, [wcState, wcManager, setWalletDirect])

  // Navigate once connected
  useEffect(() => {
    if (wallet?.connected) navigate('/vault', { replace: true })
  }, [wallet, navigate])

  // Listen for WC2 pairing URI (emitted by lib/wallet.ts) and render as QR
  useEffect(() => {
    const handler = (e: Event) => {
      const uri = (e as CustomEvent<string>).detail
      if (uri) setWc2Uri(uri)
    }
    window.addEventListener('nomos:wc2:uri', handler)
    return () => window.removeEventListener('nomos:wc2:uri', handler)
  }, [])

  useEffect(() => {
    if (!wc2Uri || !qrCanvasRef.current) return
    import('qrcode').then((QRCode) => {
      QRCode.toCanvas(qrCanvasRef.current!, wc2Uri, {
        width: 256,
        margin: 2,
        color: { dark: '#00e599', light: '#0a0a0f' },
      })
    }).catch(() => {
      // qrcode failed to load — canvas stays blank, URI can still be copied
    })
  }, [wc2Uri])

  // ── WizardConnect flow ──
  const handleWizardConnect = useCallback(() => {
    setLocalError(null)
    const started = wcConnect()
    if (started !== false) {
      setShowQr(true)
    }
  }, [wcConnect])

  // ── WC2 flow ──
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

  const displayError = localError || error || wcError || null

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
          onClick={handleWizardConnect}
          disabled={connecting || wcState === 'connecting'}
          className="rounded-lg border border-nomos-border bg-nomos-surface px-6 py-3 font-medium transition-all hover:border-nomos-accent hover:bg-nomos-accent/10 disabled:opacity-40"
        >
          {wcState === 'connecting'
            ? 'Scan QR to connect…'
            : wcState === 'reconnecting'
              ? 'Reconnecting…'
              : 'Connect with WizardConnect'}
        </button>
        <button
          onClick={handleWc2}
          disabled={connecting || wcState === 'connecting'}
          className="rounded-lg border border-nomos-border bg-nomos-surface px-6 py-3 font-medium transition-all hover:border-nomos-accent hover:bg-nomos-accent/10 disabled:opacity-40"
        >
          {connecting ? 'Connecting…' : 'Connect with WalletConnect'}
        </button>
      </div>

      {/* WC2 QR code */}
      {wc2Uri && connecting && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <p className="text-xs text-nomos-muted">Scan with your BCH wallet</p>
          <canvas
            ref={qrCanvasRef}
            className="rounded-lg border border-nomos-border"
          />
          <button
            onClick={() => navigator.clipboard?.writeText(wc2Uri)}
            className="text-[10px] text-nomos-muted underline hover:text-nomos-accent"
          >
            Copy pairing URI
          </button>
        </div>
      )}

      {walletName && wcState === 'connected' && (
        <p className="mt-4 text-sm text-nomos-muted">
          Connected to {walletName}
        </p>
      )}

      {displayError && (
        <p className="mt-4 text-sm text-nomos-refuse">
          {displayError}
        </p>
      )}

      {/* WizardConnect QR Dialog (from @wizardconnect/react) */}
      {wcUri && wcQrUri && (
        <WizardConnectQRDialog
          show={showQr}
          onClose={() => {
            setShowQr(false)
            // Cancel the connection attempt
            wcDisconnect()
          }}
          uri={wcUri}
          qrUri={wcQrUri}
          title="Nomos"
          subtitle="Scan with your BCH wallet to connect"
        />
      )}
    </div>
  )
}
