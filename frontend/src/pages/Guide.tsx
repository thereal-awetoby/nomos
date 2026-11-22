import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { GuideSectionView } from '../components/GuideContent'
import { GUIDE_SECTIONS } from '../lib/guide'

function Topics() {
  return (
    <ol className="space-y-0.5">
      {GUIDE_SECTIONS.map((s) => (
        <li key={s.id}>
          <a href={`#${s.id}`} className="block rounded-lg px-2 py-1.5 text-sm text-nomos-muted-bright transition-colors hover:bg-nomos-surface-raised hover:text-nomos-text">
            {s.title}
          </a>
        </li>
      ))}
    </ol>
  )
}

export default function Guide() {
  const { hash } = useLocation()

  // The page loads after the browser looks for the #topic, so scroll to it once it exists.
  useEffect(() => {
    const id = decodeURIComponent(hash.replace(/^#/, ''))
    if (!id) return
    const timer = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 0)
    return () => window.clearTimeout(timer)
  }, [hash])

  return (
    <div className="page-enter">
      <h1 className="page-title">How to use Nomos</h1>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-nomos-muted">
        Every feature, step by step, with the buttons named as they appear on screen. On any page, the <strong className="font-semibold text-nomos-text">?</strong> button
        in the corner shows the steps for that page.
      </p>

      <details className="card mt-5 px-4 py-3 lg:hidden">
        <summary className="cursor-pointer text-[15px] font-medium text-nomos-text">Jump to a topic</summary>
        <nav aria-label="Guide topics" className="mt-2"><Topics /></nav>
      </details>

      <div className="mt-5 grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Guide topics" className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
          <p className="px-2 text-sm font-semibold text-nomos-text">Topics</p>
          <div className="mt-2"><Topics /></div>
        </nav>
        <div className="min-w-0 space-y-4">
          {GUIDE_SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="card scroll-mt-24 p-5 sm:p-6" aria-label={section.title}>
              <GuideSectionView section={section} />
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
