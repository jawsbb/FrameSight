import { useRef, type KeyboardEvent } from 'react'
import type { AccessMode } from './backend'
import { ACCESS_MODES, accessGrantedBetween, accessLevel, accessMode } from './access'
import { useMessages } from './i18n'

interface AccessSelectorProps {
  /** Null on first run until the player picks a level: nothing is chosen for them. */
  value: AccessMode | null
  onChange: (mode: AccessMode) => void
  effectiveMode?: AccessMode | null
  onConfirmUpgrade?: () => void
  applyingMode?: AccessMode | null
  disabled?: boolean
}

export function AccessSelector({ value, onChange, effectiveMode = null, onConfirmUpgrade, applyingMode = null, disabled = false }: AccessSelectorProps) {
  const t = useMessages()
  const radios = useRef<Array<HTMLInputElement | null>>([])
  const selectedIndex = value ? accessLevel(value) : -1
  const selected = value ? accessMode(value, t) : null
  const effective = effectiveMode ? accessMode(effectiveMode, t) : null
  const reviewingUpgrade = effectiveMode !== null && selectedIndex > accessLevel(effectiveMode)
  const reviewingDowngrade = effectiveMode !== null && selectedIndex < accessLevel(effectiveMode)
  const isFirstRun = effectiveMode === null
  const pending = effectiveMode !== null && value !== effectiveMode
  const newlyGranted = reviewingUpgrade && effectiveMode && value ? accessGrantedBetween(effectiveMode, value, t) : []
  const retiring = reviewingDowngrade && effectiveMode && value ? accessGrantedBetween(value, effectiveMode, t) : []
  const choose = (index: number) => {
    const next = ACCESS_MODES[index]
    if (!next || disabled) return
    onChange(next)
    queueMicrotask(() => radios.current[index]?.focus())
  }
  const keyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    let next = index
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + ACCESS_MODES.length) % ACCESS_MODES.length
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % ACCESS_MODES.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = ACCESS_MODES.length - 1
    else return
    event.preventDefault()
    choose(next)
  }

  return <div className="access-selector">
    {effective && <div className="access-mode-status" aria-live="polite">
      <span><i aria-hidden="true"/>{t.access.effective(effective.name)}</span>
      {applyingMode
        ? <span className="access-pending" role="status" aria-label={t.access.applying(accessMode(applyingMode, t).name)}>{t.access.applying(accessMode(applyingMode, t).name)}…</span>
        : pending && selected && <span className="access-pending">{t.access.pending(selected.name)}</span>}
    </div>}
    <fieldset className="access-rail" disabled={disabled} aria-label={t.access.question}>
      <div className="access-stepper">
      <div className="access-track" aria-hidden="true">
        <span className="access-track-line"/>
        <span className="access-track-progress" style={{ transform: `scaleX(${Math.max(selectedIndex, 0) / 2})` }}/>
        {ACCESS_MODES.map((mode, index) => <span key={mode} onClick={() => choose(index)} className={`access-node${index <= selectedIndex ? ' included' : ''}${mode === effectiveMode ? ' active' : ''}`}/>) }
        {selected && <span className="access-thumb" style={{ transform: `translateX(${selectedIndex * 100}%)` }}><span/></span>}
      </div>
        <div className="access-stops">
          {ACCESS_MODES.map((mode, index) => <label key={mode} className={`access-stop${mode === value ? ' selected' : ''}${mode === effectiveMode ? ' active' : ''}`}>
            <input ref={node => { radios.current[index] = node }} type="radio" name="access-mode" value={mode} checked={mode === value} onChange={() => choose(index)} onKeyDown={event => keyDown(event, index)}/>
            <strong>{accessMode(mode, t).name}</strong>
            <small>{accessMode(mode, t).boundary}</small>
          </label>)}
        </div>
      </div>
    </fieldset>

    {selected && <article className={`access-detail${pending && !isFirstRun ? ' review' : ''}`} role="region" aria-label={reviewingUpgrade ? t.access.toGrant : reviewingDowngrade ? t.access.toRetire : t.access.adds(selected.name)} aria-live="polite">
      {pending && !isFirstRun ? <header className="access-detail-head">
        <h3>{selected.name}</h3>
        <p className="access-proposed">{t.access.proposed}</p>
      </header> : <div className="access-detail-body">
        <section className="access-observation">
          <h3>{t.access.adds(selected.name)}</h3>
          <ul>{selected.added.map(item => <li key={item}>{item}</li>)}</ul>
          {selected.caution && <p className="access-caution">{selected.caution}</p>}
        </section>
      </div>}
      {reviewingUpgrade && <div className="access-detail-body">
        <section className="access-observation">
          <h3>{t.access.toGrant}</h3>
          <ul>{newlyGranted.map(item => <li key={item}>{item}</li>)}</ul>
          {selected.caution && <p className="access-caution">{selected.caution}</p>}
        </section>
        {onConfirmUpgrade && <button type="button" className="stamp" onClick={onConfirmUpgrade} disabled={disabled} aria-busy={disabled}>{disabled ? `${t.access.applying(selected.name)}…` : t.access.confirm(selected.name)}</button>}
      </div>}
      {reviewingDowngrade && <div className="access-detail-body">
        <section className="access-observation">
          <h3>{t.access.toRetire}</h3>
          <ul>{retiring.map(item => <li key={item}>{item}</li>)}</ul>
        </section>
        {onConfirmUpgrade && <button type="button" className="stamp" onClick={onConfirmUpgrade} disabled={disabled} aria-busy={disabled}>{disabled ? `${t.access.applying(selected.name)}…` : t.access.confirm(selected.name)}</button>}
      </div>}
    </article>}

    <section className="access-always-off" aria-label={t.access.prohibited}>
      <h3>{t.access.prohibitedTitle}</h3>
      <ul>{t.access.alwaysOff.map(item => <li key={item}>{item}</li>)}</ul>
    </section>
  </div>
}
