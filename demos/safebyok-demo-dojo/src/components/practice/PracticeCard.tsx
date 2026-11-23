import { type ReactNode, useId } from 'react'

/** One practice: what to do, a line or two on why, and its examples side by side. */
export function PracticeCard({ title, why, children }: Readonly<{ title: string, why: ReactNode, children: ReactNode }>) {
  const titleId = useId()
  return (
    <section className="card practice" aria-labelledby={titleId}>
      <h3 id={titleId}>{title}</h3>
      <div className="why">{why}</div>
      <div className="examples">{children}</div>
    </section>
  )
}

/** One example on a card, labelled as the thing to do or, with `isWrongWay`, the thing not to do. */
export function Example({ isWrongWay = false, caption, children }: Readonly<{ isWrongWay?: boolean, caption: string, children: ReactNode }>) {
  const label = isWrongWay ? "Don't" : 'Do'
  return (
    <figure className={isWrongWay ? 'example wrong-way' : 'example'} aria-label={`${label}: ${caption}`}>
      <figcaption><strong>{label}:</strong> {caption}</figcaption>
      {children}
    </figure>
  )
}
