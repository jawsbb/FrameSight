import { useEffect, useState, type CSSProperties } from 'react'
import { getPreferences, getVersionInfo, setLanguage, setMasteryMarks, type AccessMode, type AppView, type Language, type VersionInfo } from '../backend'
import { hideRewardOverlay, showRewardOverlay } from '../overlay'
import { collectionTotals } from '../collection'
import { MAX_PRICE_FLOOR } from '../settings'
import { version as APP_VERSION } from '../../package.json'
import { UpdatesSetting } from '../UpdateSettings'
import { AccessSelector } from '../AccessSelector'
import { MetalMark } from '../MetalMark'
import { ReportBlock } from '../components/ReportBlock'
import { LANGUAGE_NAMES, useMessages } from '../i18n'

export function SettingsPage({ view, language, onLanguage, priceFloor, effectiveMode, selectedMode, modeBusy, modeError, onSelectMode, onConfirmMode, desktopCaptureActionAvailable, captureAuthorizationBusy, captureNote, onCaptureNote, onAuthorizeCapture, onPriceFloor }: { view: AppView; language: Language | null; onLanguage: (language: Language | null) => void; priceFloor: number; effectiveMode: AccessMode; selectedMode: AccessMode; modeBusy: boolean; modeError: string | null; onSelectMode: (mode: AccessMode) => void; onConfirmMode: () => void; desktopCaptureActionAvailable: boolean; captureAuthorizationBusy: boolean; captureNote: CaptureNote | null; onCaptureNote: (note: CaptureNote | null) => void; onAuthorizeCapture: () => Promise<void>; onPriceFloor: (floor: number) => void }) {
  const t = useMessages()
  const { sellable: total, sellableCount: counted } = collectionTotals(view.collection.items, priceFloor)
  return <section className="page" aria-labelledby="settings-title">
    <div className="page-head">
      <h1 id="settings-title" className="page-title">{t.settings.title}</h1>
      <p className="page-note">{t.settings.note}</p>
    </div>
    <section className="page-section" aria-labelledby="access-setting-title">
      <h2 id="access-setting-title" className="section-title">{t.settings.access}</h2>
      <AccessSelector
        value={selectedMode}
        effectiveMode={effectiveMode}
        onChange={onSelectMode}
        onConfirmUpgrade={onConfirmMode}
        applyingMode={modeBusy ? selectedMode : null}
        disabled={modeBusy}
      />
      {modeError && <p className="error-banner" role="alert">{modeError}</p>}
      <p className="band-note">{t.settings.accessNote}</p>
    </section>

    <LanguageSetting preference={language} onSaved={onLanguage}/>

    <section className="page-section" aria-labelledby="collection-setting-title">
      <h2 id="collection-setting-title" className="section-title">{t.settings.collection}</h2>
      <div className="group"><div className="setting">
        <div>
          <h3>{t.settings.priceFloor}</h3>
          <p className="prose">{t.settings.priceFloorNote}</p>
        </div>
        <div className="dial">
          <label className="dial-slot">
            <span className="sr-only">{t.settings.priceFloorLabel}</span>
            <input
              type="range"
              min={0}
              max={MAX_PRICE_FLOOR}
              step={1}
              value={priceFloor}
              style={{ '--dial-fill': `${priceFloor / MAX_PRICE_FLOOR * 100}%` } as CSSProperties}
              aria-valuetext={priceFloor ? t.settings.floorValue(priceFloor) : t.settings.everyPriceCounts}
              onChange={event => onPriceFloor(Number(event.target.value))}
            />
          </label>
          <output className="dial-figure">
            {priceFloor ? <>{priceFloor}<MetalMark metal="plat" alt={t.units.platinum}/><span>{t.settings.andOver}</span></> : <span>{t.settings.everyPrice}</span>}
          </output>
        </div>
        <p className="band-note">{t.settings.floorSummary(counted, total)}</p>
      </div></div>
    </section>

    <section className="page-section" aria-labelledby="overlays-setting-title">
      <h2 id="overlays-setting-title" className="section-title">{t.settings.overlays}</h2>
      <div className="group">
      <MasteryMarksSetting/>

      <DesktopCaptureSetting actionAvailable={effectiveMode !== 'companion' && desktopCaptureActionAvailable} prohibited={effectiveMode === 'companion'} busy={captureAuthorizationBusy} note={captureNote} onNote={onCaptureNote} onAuthorize={onAuthorizeCapture}/>

      <div className="setting">
        <div>
          <h3>{t.settings.placement}</h3>
          <p className="prose">{t.settings.placementNote}</p>
        </div>
        <OverlayPreviewToggle prohibited={effectiveMode === 'companion'} busy={modeBusy}/>
      </div>
      </div>
    </section>

    <UpdatesSetting observesGame={effectiveMode !== 'companion'}/>

    <ReportBlock health={view.health} alwaysVisible/>

    <AboutSection effectiveMode={effectiveMode}/>
  </section>
}

/** The preference lives in the backend and a click is a command it may refuse. A refusal leaves
 * the switch where it was and says so, so the thumb never claims a state the overlays are not in. */
function MasteryMarksSetting() {
  const t = useMessages()
  const [enabled, setEnabled] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<'unreadable' | 'unsaved' | null>(null)

  useEffect(() => {
    let mounted = true
    // A failed read leaves the switch on, the backend's own fallback, and usable: a control frozen
    // on a guess would teach the player that the guess is a fact.
    getPreferences()
      .then(preferences => { if (mounted) setEnabled(preferences.mastery_marks) })
      .catch(() => { if (mounted) setNote('unreadable') })
      .finally(() => { if (mounted) setLoaded(true) })
    return () => { mounted = false }
  }, [])

  async function toggle() {
    if (!loaded || busy) return
    setBusy(true)
    setNote(null)
    try {
      // The command answers with the stored preference, so the switch takes the backend's word
      // for what it now holds rather than the value that was asked for.
      const preferences = await setMasteryMarks(!enabled)
      setEnabled(preferences.mastery_marks)
    } catch {
      setNote('unsaved')
    } finally {
      setBusy(false)
    }
  }

  return <div className="setting">
    <div>
      <h3>{t.settings.marks}</h3>
      <p className="prose">{t.settings.marksNote}</p>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      className="display-switch"
      disabled={!loaded || busy}
      aria-busy={busy}
      onClick={() => { void toggle() }}
    >
      <span className="sr-only">{t.settings.marksSwitch}</span>
      <span className="display-track" aria-hidden="true"><span className="display-thumb"/></span>
    </button>
    {note && <p className="band-note" role="status">{t.settings[note]}</p>}
  </div>
}

/** System, English or Français. Like the marks, a backend preference: the overlays read it there.
 * Each language is named in itself, so it can be found from a screen the player cannot read. */
function LanguageSetting({ preference, onSaved }: { preference: Language | null; onSaved: (language: Language | null) => void }) {
  const t = useMessages()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  async function choose(next: Language | null) {
    if (busy || next === preference) return
    setBusy(true)
    setFailed(false)
    try {
      // The stored answer, not the request, decides what the screen shows.
      onSaved((await setLanguage(next)).language ?? null)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  const choices: Array<{ value: Language | null; label: string }> = [
    { value: null, label: t.settings.system },
    { value: 'en', label: LANGUAGE_NAMES.en },
    { value: 'fr', label: LANGUAGE_NAMES.fr },
  ]
  return <section className="page-section" aria-labelledby="language-setting-title">
    <h2 id="language-setting-title" className="section-title">{t.settings.language}</h2>
    <div className="group"><div className="setting">
      <p className="prose">{t.settings.languageNote}</p>
      <div className="segmented" role="group" aria-labelledby="language-setting-title">
        {choices.map(choice => <button
          type="button"
          key={choice.label}
          lang={choice.value ?? undefined}
          aria-pressed={preference === choice.value}
          disabled={busy}
          onClick={() => { void choose(choice.value) }}
        >{choice.label}</button>)}
      </div>
      {failed && <p className="band-note" role="status">{t.settings.unsaved}</p>}
    </div></div>
  </section>
}

/** `note` is a key into the catalog's settings, held by `App` so it outlives the page. */
export type CaptureNote = 'captureAllowed' | 'captureAgain' | 'captureDenied'

function DesktopCaptureSetting({ actionAvailable, prohibited, busy, note, onNote, onAuthorize }: { actionAvailable: boolean; prohibited: boolean; busy: boolean; note: CaptureNote | null; onNote: (note: CaptureNote | null) => void; onAuthorize: () => Promise<void> }) {
  const t = useMessages()
  useEffect(() => {
    if (actionAvailable && note === 'captureAllowed') {
      onNote('captureAgain')
    }
  }, [actionAvailable, note, onNote])
  async function authorize() {
    if (busy) return
    onNote(null)
    try {
      await onAuthorize()
      onNote('captureAllowed')
    } catch {
      onNote('captureDenied')
    }
  }
  return <div className="setting">
    <div>
      <h3>{t.settings.capture}</h3>
      <p className="prose">{t.settings.captureNote}</p>
      {actionAvailable && <p className="prose">{t.settings.captureChooser}</p>}
    </div>
    {(actionAvailable || prohibited) && <div className="prohibited-control">
      <button type="button" className="stamp" onClick={authorize} disabled={busy || prohibited} aria-busy={busy} aria-describedby={prohibited ? 'capture-prohibited' : undefined}>{busy ? t.settings.allowingCapture : t.settings.allowCapture}</button>
      {prohibited && <p className="prohibition-note" id="capture-prohibited">{t.settings.captureProhibited}</p>}
    </div>}
    <p className="band-note capture-status" role="status" aria-live="polite" aria-atomic="true">{note && t.settings[note]}</p>
  </div>
}

/** What FrameSight is, and what it does to this machine in the current mode. */
function AboutSection({ effectiveMode }: { effectiveMode: AccessMode }) {
  const t = useMessages()
  const observesGame = effectiveMode !== 'companion'
  const acquiresInventory = effectiveMode === 'full'
  const [info, setInfo] = useState<VersionInfo | null>(null)
  // The version is a frontend build constant: the line renders even when the
  // backend is down, gaining installer identity once getVersionInfo lands.
  useEffect(() => {
    getVersionInfo().then(setInfo).catch(() => {})
  }, [])
  const installer = !info || info.kind === 'unknown'
    ? undefined
    : info.kind === 'system_linux' ? (info.manager ?? t.about.installers.system_linux) : t.about.installers[info.kind]
  return <section className="page-section" aria-labelledby="about-title">
    <h2 id="about-title" className="section-title">{t.about.title}</h2>
    <div className="group">
    <div className="setting">
      <p className="prose">{t.about.tagline}</p>
      <p className="about-version">{t.about.version(info?.version ?? APP_VERSION, installer)}</p>
    </div>

    {/* What each access level reads, and what Full sends, is said once, in the selector above. */}
    <div className="setting">
      <div>
        <h3>{t.about.storage}</h3>
        <p className="prose">{t.about.storageNote}</p>
      </div>
    </div>
    <div className="setting">
      <div>
        <h3>{t.about.sync}</h3>
        <p className="prose">{acquiresInventory ? t.about.syncFull : t.about.syncOther}</p>
      </div>
    </div>
    <div className="setting">
      <div>
        <h3>{t.about.assistance}</h3>
        <p className="prose">{observesGame ? t.about.assistanceObserving : t.about.assistanceOther}</p>
      </div>
    </div>
    <div className="setting">
      <div>
        <h3>{t.about.worldState}</h3>
        <p className="prose">{t.about.worldStateNote}</p>
      </div>
    </div>
    <div className="setting">
      <div>
        <h3>{t.about.builds}</h3>
        <p className="prose">{t.about.buildsNote}</p>
      </div>
    </div>
    </div>
  </section>
}

/**
 * The strip is placed against the game's own window, so a preview is the only way
 * to see it without a fissure running. A preview you cannot dismiss does not
 * earn its place, which is why this is a toggle and not a one-way button.
 */
function OverlayPreviewToggle({ prohibited, busy }: { prohibited: boolean; busy: boolean }) {
  const t = useMessages()
  const [shown, setShown] = useState(false)
  const [blocked, setBlocked] = useState(false)
  return <div className="prohibited-control">
    <button
      type="button"
      className="stamp"
      aria-pressed={shown}
      disabled={prohibited || busy}
      aria-describedby={prohibited ? 'overlay-prohibited' : blocked ? 'overlay-blocked' : undefined}
      onClick={() => {
        // The backend rejects while an access transition holds the gate. Flip only after the
        // command lands, so a click across a downgrade reports instead of desyncing the toggle.
        const next = !shown
        setBlocked(false)
        void (shown ? hideRewardOverlay() : showRewardOverlay())
          .then(() => setShown(next))
          .catch(() => setBlocked(true))
      }}
    >{shown ? t.settings.hideOverlay : t.settings.previewOverlay}</button>
    {prohibited && <p id="overlay-prohibited" className="prohibition-note">{t.settings.overlayProhibited}</p>}
    {!prohibited && blocked && <p id="overlay-blocked" className="band-note" role="status">{t.settings.overlayBlocked}</p>}
  </div>
}
