import type { HealthState } from '../backend'

/** A health state as a shape and a colour, never colour alone: a full dot is ready, a ring is
 * idle, a triangle is degraded, a cross is failed. Paired with the state in words wherever used. */
export function StateIcon({ state }: { state: HealthState }) {
  return <svg className={`state-icon ${state}`} viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    {state === 'ready' ? <circle cx="8" cy="8" r="4.5" fill="currentColor" stroke="none"/>
      : state === 'idle' ? <circle cx="8" cy="8" r="4.25"/>
        : state === 'degraded' ? <><path d="M8 2.75 14 13.25H2z"/><path d="M8 7v2.5"/><path d="M8 11.4v.1"/></>
          : <path d="m4 4 8 8M12 4l-8 8"/>}
  </svg>
}
