import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useWallet } from '../context/WalletContext'
import { WizardConnectQRDialog } from '@wizardconnect/react'
import { WALLETCONNECT_ENABLED } from '../lib/env'
import { useToast } from '../components/Toast'
import NetworkSwitch from '../components/NetworkSwitch'
import { IS_CHIPNET } from '../lib/network'

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
  const [wc2Hidden, setWc2Hidden] = useState(false)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

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
      // Dark on white in both themes: the pop-up is always light, for scanning.
      return QRCode.toCanvas(canvas, wc2Uri, {
        width: 240,
        margin: 1,
        color: { dark: '#0b1d17', light: '#ffffff' },
      })
    }).catch(() => {
      // QR generation failure leaves the pairing URI available to copy.
    })
    return () => { cancelled = true }
  }, [wc2Uri, wc2Hidden])

  // Escape closes the WalletConnect pop-up; the pairing keeps waiting.
  const wc2Open = Boolean(wc2Uri) && connecting && !wc2Hidden
  useEffect(() => {
    if (!wc2Open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setWc2Hidden(true) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [wc2Open])

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
    setWc2Hidden(false)
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
    <div className="page-enter grid gap-10 py-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16 lg:py-10">
      <section>
        <h1 className="page-title">Connect your wallet</h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-nomos-muted">
          Your wallet keeps your keys and signs every transaction. Nomos only reads your address and public key to build your vault.
        </p>

        <div className="mt-8 space-y-3">
          <div className="rounded-2xl border-2 border-nomos-accent/70 bg-nomos-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[17px] font-semibold text-nomos-text">WizardConnect</p>
              <span className="rounded-full bg-nomos-accent px-2.5 py-0.5 text-xs font-semibold text-nomos-on-accent">Recommended</span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-nomos-muted">
              Scan a QR code with your wallet. It shares the public key the vault needs and works with HD wallets.
            </p>
            <button
              onClick={handleWizardConnect}
              disabled={connecting || wcState === 'connecting'}
              className="btn-primary mt-4 w-full"
            >
              {wcState === 'connecting'
                ? <><span className="spinner mr-2" /> Scan QR to connect…</>
                : wcState === 'reconnecting'
                  ? <><span className="spinner mr-2" /> Reconnecting…</>
                  : 'Connect with WizardConnect'}
            </button>
          </div>

          {WALLETCONNECT_ENABLED && (
            <div className="rounded-2xl border hairline-strong bg-nomos-surface p-5">
              <p className="text-[17px] font-semibold text-nomos-text">WalletConnect</p>
              <p className="mt-1.5 text-sm leading-relaxed text-nomos-muted">
                For wallets with BCH WalletConnect. After connecting, your wallet asks you to sign one message so Nomos can read your public key. No funds move.
              </p>
              <button
                onClick={handleWc2}
                disabled={connecting || wcState === 'connecting'}
                className="btn-secondary mt-4 w-full"
              >
                {connecting ? <><span className="spinner mr-2" /> Connecting…</> : 'Connect with WalletConnect'}
              </button>
            </div>
          )}
        </div>

        {/* WalletConnect pairing: a pop-up, like WizardConnect's. */}
        {wc2Uri && connecting && !wc2Hidden && createPortal(
          <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={() => setWc2Hidden(true)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="wc2-title"
              className="w-full max-w-sm rounded-2xl bg-white p-6 text-[#0b1d17] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="wc2-title" className="text-lg font-bold">Scan with your BCH wallet</h2>
                  <p className="mt-1 text-sm text-[#4e635a]">Open WalletConnect in your wallet and scan. Then approve the connection and the one message it asks you to sign.</p>
                </div>
                <button type="button" onClick={() => setWc2Hidden(true)} aria-label="Close" className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xl leading-none hover:bg-[#0b1d17]/5">×</button>
              </div>
              <div className="mx-auto mt-5 w-fit rounded-xl border border-[#0b1d17]/10 p-2">
                <canvas ref={qrCanvasRef} />
              </div>
              <p className="mt-4 flex items-center justify-center gap-2 text-sm text-[#4e635a]">
                <span className="spinner" aria-hidden="true" /> Waiting for your wallet…
              </p>
              <button
                type="button"
                onClick={() => { void copyWc2Uri() }}
                className="mt-4 w-full rounded-full bg-[#0b1d17] px-4 py-3 text-[15px] font-semibold text-white hover:bg-[#0b1d17]/90"
              >
                Copy pairing link
              </button>
            </div>
          </div>,
          document.body,
        )}
        {wc2Uri && connecting && wc2Hidden && (
          <button type="button" className="mt-4 text-sm font-medium text-nomos-text underline-offset-4 hover:underline" onClick={() => setWc2Hidden(false)}>
            Show the WalletConnect QR code again
          </button>
        )}

        {wcWalletName && wcState === 'connected' && (
          <p className="mt-5 text-sm text-nomos-muted-bright">Connected to {wcWalletName}</p>
        )}

        {displayError && (
          <p className="mt-5 text-sm text-nomos-refuse">{displayError}</p>
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

        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
          <NetworkSwitch />
          <p className="text-sm text-nomos-muted">
            {IS_CHIPNET ? 'Chipnet coins are free test coins.' : 'Testing? Chipnet uses free test coins.'}
          </p>
        </div>

        <p className="mt-6 text-sm text-nomos-muted">
          No wallet yet? <Link to="/simulate" className="font-medium text-nomos-text underline-offset-4 hover:underline">Try the simulator</Link>
        </p>
      </section>

      <aside className="space-y-8">
        <div>
          <h2 className="text-[15px] font-semibold text-nomos-text">Wallets that work</h2>
          <ul className="mt-3 space-y-3">
            {WALLETS.map((w) => (
              <li key={w.name}>
                <a
                  href={w.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex gap-4 rounded-2xl border hairline bg-nomos-surface p-4 transition-colors hover:bg-nomos-surface-raised"
                >
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold ${w.tone}`} aria-hidden="true">
                    {w.name[0]}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-nomos-text">{w.name}</span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-nomos-muted">{w.body}</span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {w.connects.map((c) => (
                        <span key={c} className="rounded-full border hairline-strong px-2 py-0.5 text-xs text-nomos-muted-bright">{c}</span>
                      ))}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-[15px] font-semibold text-nomos-text">After you connect</h2>
          <ol className="mt-3 space-y-3">
            {NEXT.map((step, i) => (
              <li key={step} className="flex items-start gap-3 text-sm leading-relaxed text-nomos-muted">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${NEXT_TONE[i]}`}>{i + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  )
}

// Wallets known to work with Nomos's connections. No logos: initials only.
const WALLETS = [
  {
    name: 'Paytaca',
    url: 'https://www.paytaca.com/',
    body: 'Phone app and Chrome extension. The vaults on mainnet were made with Paytaca over WizardConnect.',
    connects: ['WizardConnect', 'WalletConnect'],
    tone: 'bg-nomos-accent text-nomos-on-accent',
  },
  {
    name: 'Selene',
    url: 'https://selene.cash/',
    body: 'Phone app for iOS and Android, with CashTokens support.',
    connects: ['WizardConnect'],
    tone: 'bg-nomos-surface-raised text-nomos-text',
  },
  {
    name: 'Cashonize',
    url: 'https://cashonize.com/',
    body: 'Web and desktop wallet with CashTokens support.',
    connects: ['WizardConnect', 'WalletConnect'],
    tone: 'bg-nomos-ok text-nomos-on-ok',
  },
]

const NEXT = [
  'Choose a daily limit, and optionally allowed addresses, an agent key and a rescue key.',
  'Your wallet funds the vault. The rules become part of its contract.',
  'Pay as usual. A payment over a rule is refused by every node.',
]
const NEXT_TONE = [
  'bg-nomos-surface-raised text-nomos-text',
  'bg-nomos-ok text-nomos-on-ok',
  'bg-nomos-refuse text-white',
]
