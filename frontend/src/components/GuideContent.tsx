import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import type { GuideSection } from '../lib/guide'

/** Guide text with **bold** for on-screen names and [label](/path) for links inside the app. */
export function RichText({ text, onNavigate }: { text: string; onNavigate?: () => void }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g)
  return (
    <>
      {parts.map((part, i) => {
        const bold = /^\*\*([^*]+)\*\*$/.exec(part)
        if (bold) return <strong key={i} className="font-semibold text-nomos-text">{bold[1]}</strong>
        const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part)
        if (link) {
          return (
            <Link key={i} to={link[2]} onClick={onNavigate} className="font-medium text-nomos-text underline underline-offset-4">
              {link[1]}
            </Link>
          )
        }
        return <Fragment key={i}>{part}</Fragment>
      })}
    </>
  )
}

/**
 * One guide section: what it does, what you need, the steps, and what to do
 * when something goes wrong. `compact` is the help panel's version.
 */
export function GuideSectionView({ section, compact = false, onNavigate }: { section: GuideSection; compact?: boolean; onNavigate?: () => void }) {
  const Heading = compact ? 'h3' : 'h2'
  return (
    <div>
      <Heading className={compact ? 'text-[15px] font-semibold text-nomos-text' : 'text-[19px] font-semibold leading-snug text-nomos-text'}>
        {section.title}
      </Heading>
      <p className="mt-1.5 text-sm leading-relaxed text-nomos-muted-bright">{section.summary}</p>

      {section.needs && section.needs.length > 0 && (
        <div className="mt-4 rounded-xl bg-nomos-surface-raised/60 px-4 py-3">
          <p className="text-sm font-semibold text-nomos-text">You need</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-relaxed text-nomos-muted-bright marker:text-nomos-muted">
            {section.needs.map((need) => <li key={need}><RichText text={need} onNavigate={onNavigate} /></li>)}
          </ul>
        </div>
      )}

      {section.flows.map((flow, f) => (
        <div key={flow.title ?? f} className="mt-4">
          {flow.title && <p className="text-sm font-semibold text-nomos-text">{flow.title}</p>}
          <ol className={`${flow.title ? 'mt-2' : ''} space-y-2.5`}>
            {flow.steps.map((step, i) => (
              <li key={step} className="flex items-start gap-3 text-sm leading-relaxed text-nomos-muted-bright">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-nomos-surface-raised text-xs font-bold tabular-nums text-nomos-text" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="min-w-0 pt-0.5"><RichText text={step} onNavigate={onNavigate} /></span>
              </li>
            ))}
          </ol>
        </div>
      ))}

      {section.notes && section.notes.length > 0 && (
        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-nomos-muted marker:text-nomos-muted">
          {section.notes.map((note) => <li key={note}><RichText text={note} onNavigate={onNavigate} /></li>)}
        </ul>
      )}

      {section.problems && section.problems.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-nomos-text">If something goes wrong</p>
          <div className="mt-1.5 divide-hairline border-y hairline">
            {section.problems.map((p) => (
              <details key={p.q} className="group py-2.5">
                <summary className="cursor-pointer list-none text-sm text-nomos-text marker:hidden">
                  <span className="mr-2 inline-block text-nomos-muted transition-transform group-open:rotate-90" aria-hidden="true">›</span>
                  <RichText text={p.q} onNavigate={onNavigate} />
                </summary>
                <p className="mt-1.5 pl-5 text-sm leading-relaxed text-nomos-muted-bright"><RichText text={p.a} onNavigate={onNavigate} /></p>
              </details>
            ))}
          </div>
        </div>
      )}

      {!compact && section.open && (
        <Link to={section.open.to} className="link-action mt-4 inline-block">{section.open.label}</Link>
      )}
    </div>
  )
}
