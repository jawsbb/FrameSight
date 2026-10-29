import { useState } from 'react'

/** An item's picture, or its first two letters when there is none or it fails to load. */
export function Thumb({ src, name }: { src?: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  return <span className="thumb">
    {src && !failed
      ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)}/>
      : <span aria-hidden="true">{name.slice(0, 2)}</span>}
  </span>
}
