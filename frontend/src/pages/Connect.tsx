import { useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { useWallet } from '../context/WalletContext'
import type { WalletProviderType } from '../lib/types'

export default function Connect() {
  const navigate = useNavigate()
  const { connect, connecting, error, wallet } = useWallet()
  const [localError, setLocalError] = useState<string | null>(null)
  const [qrUri, setQrUri] = useState<string | null>(null)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

  // Redirect if already connected
  useEffect(() => {
    if (wallet?.connected) navigate('/vault', { replace: true })
  }, [wallet, navigate])

  // Listen for BOTH WizardConnect and WC2 URIs
  useEffect(() => {
    const handleWcUri = (e: Event) => {
      const uri = (e as CustomEvent<string>).detail
      if (uri) setQrUri(uri)
    }
    // WizardConnect emits nomos:wc:uri, WC2 emits nomos:wc2:uri
    window.addEventListener('nomos:wc:uri', handleWcUri)
    window.addEventListener('nomos:wc2:uri', handleWcUri)
    return () => {
      window.removeEventListener('nomos:wc:uri', handleWcUri)
      window.removeEventListener('nomos:wc2:uri', handleWcUri)
    }
  }, [])

  // Render QR code when URI arrives
  useEffect(() => {
    if (!qrUri || !qrCanvasRef.current) return
    import('qrcode').then((QRCode) => {
      QRCode.toCanvas(qrCanvasRef.current!, qrUri, {
        width: 256,
        margin: 2,
        color: { dark: '#00e599', light: '#0a0a0f' },
      })
    }).catch(() => {
      // qrcode not installed — canvas stays hidden, URI shown as text
    })
  }, [qrUri])

  const handleConnect = async (provider: WalletProviderType) => {
    setLocalError(null)
    setQrUri(null)
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
          {connecting ? 'Scan QR…' : 'Connect with WizardConnect'}
        </button>
        <button
          onClick={() => handleConnect('wc2')}
          disabled={connecting}
          className="rounded-lg border border-nomos-border bg-nomos-surface px-6 py-3 font-medium transition-all hover:border-nomos-accent hover:bg-nomos-accent/10 disabled:opacity-40"
        >
          {connecting ? 'Scan QR…' : 'Connect with WalletConnect'}
        </button>
      </div>

      {/* QR Code (shown for both WizardConnect and WC2) */}
      {qrUri && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <p className="text-xs text-nomos-muted">
            Scan with your BCH wallet
          </p>
          <canvas
            ref={qrCanvasRef}
            className="rounded-lg border border-nomos-border"
          />
          <button
            onClick={() => navigator.clipboard?.writeText(qrUri)}
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
