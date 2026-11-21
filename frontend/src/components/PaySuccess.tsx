import { useEffect, useState } from 'react'

/** Brief success overlay shown after the BCH payment is submitted successfully. */
export default function PaySuccess({ onDone }: { onDone?: () => void }) {
  const [phase, setPhase] = useState<'ring' | 'check' | 'particles' | 'done'>('ring')

  useEffect(() => {
    const checkTimer = window.setTimeout(() => setPhase('check'), 300)
    const particlesTimer = window.setTimeout(() => setPhase('particles'), 700)
    const doneTimer = window.setTimeout(() => {
      setPhase('done')
      onDone?.()
    }, 2400)

    return () => {
      window.clearTimeout(checkTimer)
      window.clearTimeout(particlesTimer)
      window.clearTimeout(doneTimer)
    }
  }, [onDone])

  if (phase === 'done') return null

  return (
    <div
      className="pay-success-overlay fixed inset-0 z-50 flex items-center justify-center bg-nomos-bg/85"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex flex-col items-center">
        <div className="relative h-[120px] w-[120px]">
          <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="rgb(var(--nomos-ok))"
              strokeWidth="4"
              style={{
                opacity: phase === 'ring' ? 0.4 : 1,
                transform: `scale(${phase === 'ring' ? 0.5 : 1})`,
                transformOrigin: 'center',
                transition: 'opacity 0.35s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                filter: 'drop-shadow(0 0 12px rgb(var(--nomos-ok) / 0.3))',
              }}
            />
            <path
              d="M38 62 L52 76 L82 46"
              fill="none"
              stroke="rgb(var(--nomos-ok))"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                strokeDasharray: 80,
                strokeDashoffset: phase === 'ring' ? 80 : 0,
                transition: 'stroke-dashoffset 0.5s ease-out 0.15s',
                filter: 'drop-shadow(0 0 8px rgb(var(--nomos-ok) / 0.4))',
              }}
            />
          </svg>

          {phase === 'particles' && (
            <div className="absolute inset-0" aria-hidden="true">
              {Array.from({ length: 12 }, (_, index) => {
                const angle = index * 30 * (Math.PI / 180)
                const distance = 42 + ((index * 17) % 28)
                const dx = Math.cos(angle) * distance
                const dy = Math.sin(angle) * distance
                const size = 3 + (index % 3)
                const color = index % 3 === 0
                  ? 'rgb(var(--nomos-ok))'
                  : index % 3 === 1
                    ? '#00c9ff'
                    : '#a855f7'

                return (
                  <span
                    key={index}
                    className="pay-success-particle absolute rounded-full"
                    style={{
                      width: size,
                      height: size,
                      left: `calc(50% + ${dx}px)`,
                      top: `calc(50% + ${dy}px)`,
                      backgroundColor: color,
                      animation: `particle-fly 1.1s ease-out ${index * 0.035}s forwards`,
                    }}
                  />
                )
              })}
            </div>
          )}
        </div>

        <p
          className="mt-4 text-center font-mono text-sm font-semibold text-nomos-ok"
          style={{
            opacity: phase === 'ring' ? 0 : 1,
            transition: 'opacity 0.3s ease 0.25s',
          }}
        >
          Paid under mandate ✓
        </p>
      </div>
    </div>
  )
}
