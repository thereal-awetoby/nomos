import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { useWallet } from '../context/WalletContext'
import type { WalletProviderType } from '../lib/types'

export default function Connect() {
  const navigate = useNavigate()
  const { connect, connecting, error, wallet } = useWallet()
  const [localError, setLocalError] = useState<string | null>(null)
  const [wc2Uri, setWc2Uri] = useState<string | null>(null)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

  // Redirect if already connected
  useEffect(() => {
    if (wallet?.connected) navigate('/vault', { replace: true })
  }, [wallet, navigate])

  // Listen for WC2 URI to display as QR
  useEffect(() => {
    const handler = (e: Event) => {
      const uri = (e as CustomEvent<string>).detail
      if (uri) setWc2Uri(uri)
    }
    window.addEventListener('nomos:wc2:uri', handler)
    return () => window.removeEventListener('nomos:wc2:uri', handler)
  }, [])

  // Render QR code when URI arrives (simple text-based fallback;
  // a real QR lib like 'qrcode' can be added later)
  useEffect(() => {
    if (!wc2Uri || !qrCanvasRef.current) return
    // Try to use qrcode library if available, otherwise show URI text
    import('qrcode').then((QRCode) => {
      QRCode.toCanvas(qrCanvasRef.current!, wc2Uri, {
        width: 256,
        margin: 2,
        color: { dark: '#00e599', light: '#0a0a0f' },
      })
    }).catch(() => {
      // qrcode not installed — canvas stays hidden, URI shown as text
    })
  }, [wc2Uri])

  const handleConnect = async (provider: WalletProviderType) => {
    setLocalError(null)
    setWc2Uri(null)
    try {
      await connect(provider)
      navigate('/vault')
    } catch (err: any) {
      setLocalError(err.message || 'Connection failed')
    }
  }

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
          onClick={() => handleConnect('wizardconnect')}
          disabled={connecting}
          className="rounded-lg border border-nomos-border bg-nomos-surface px-6 py-3 font-medium transition-all hover:border-nomos-accent hover:bg-nomos-accent/10 disabled:opacity-40"
        >
          {connecting ? 'Connecting…' : 'Connect with WizardConnect'}
        </button>
        <button
          onClick={() => handleConnect('wc2')}
          disabled={connecting}
          className="rounded-lg border border-nomos-border bg-nomos-surface px-6 py-3 font-medium transition-all hover:border-nomos-accent hover:bg-nomos-accent/10 disabled:opacity-40"
        >
          {connecting ? 'Connecting…' : 'Connect with WalletConnect'}
        </button>
      </div>

      {/* WC2 QR Code */}
      {wc2Uri && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <p className="text-xs text-nomos-muted">
            Scan with your BCH wallet
          </p>
          <canvas
            ref={qrCanvasRef}
            className="rounded-lg border border-nomos-border"
          />
          {/* Fallback: copyable URI if QR lib not available */}
          <button
            onClick={() => navigator.clipboard?.writeText(wc2Uri)}
            className="text-[10px] text-nomos-muted underline hover:text-nomos-accent"
          >
            Copy pairing URI
          </button>
        </div>
      )}

      {(error || localError) && (
        <p className="mt-4 text-sm text-nomos-refuse">
          {error || localError}
        </p>
      )}
    </div>
  )
}
