import { useEffect, useRef, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { stampReading } from './freshness'
import { dismissedCount, readUpdateAutoCheck, readUpdatePrerelease, writeUpdateAutoCheck, writeUpdatePrerelease } from './settings'
import { checkForUpdatesNow, dismissOffered, downloadUpdate, isMeteredConnection, restartToUpdate, useUpdateNotice, useUpdateStore, type UpdateNote } from './updateStore'
import { useMessages, type Messages } from './i18n'
import { Tip } from './components/Tip'


/** The rail's update mark: offered and downloaded states share one dot and
 *  never borrow the reader-state icons. The sr-only status line stays mounted so
 *  async arrival is always announced. */
export function UpdateMark({ onOpen }: { onOpen: () => void }) {
  const t = useMessages()
  const notice = useUpdateNotice()
  const hint = notice && (notice.downloaded ? t.updates.readyHint(notice.version) : t.updates.availableHint(notice.version))
  return <>
    <span className="sr-only" role="status">{hint ?? ''}</span>
    {notice && <Tip text={notice.downloaded ? t.updates.ready(notice.version) : t.updates.available(notice.version)}>
      <button type="button" className="rail-item update-mark" onClick={onOpen} aria-label={hint ?? undefined}>
        <span className="update-dot" aria-hidden="true"/>
      </button>
    </Tip>}
  </>
}

/** The store's note in the words of the language on screen. */
function noteText(note: UpdateNote | null, t: Messages): string | null {
  if (note === null) return null
  return typeof note === 'string' ? t.updates.notes[note] : t.updates.notes.snoozed(note.snoozed)
}

function releaseTagUrl(version: string): string {
  return `https://github.com/Deftera186/tennoscope/releases/tag/v${version}`
}

/**
 * The Updates row: source of truth for update state. Portable installs get
 * check/download/restart here; system installs get the nudge card instead of
 * an install button that could never work.
 */
export function UpdatesSetting({ observesGame }: { observesGame: boolean }) {
  const t = useMessages()
  const store = useUpdateStore()
  const note = noteText(store.note, t)
  const [autoCheck, setAutoCheck] = useState(readUpdateAutoCheck)
  const [prerelease, setPrerelease] = useState(readUpdatePrerelease)
  const [copied, setCopied] = useState(false)
  const [copyNote, setCopyNote] = useState<string | null>(null)
  const [deferred, setDeferred] = useState(false)
  const statusRef = useRef<HTMLParagraphElement>(null)
  const actedRef = useRef(false)
  const busy = store.phase === 'checking' || store.phase === 'downloading'
  const info = store.info
  const updatable = info?.updatable ?? false
  const actionable = (store.phase === 'offered' || store.phase === 'suppressed' || store.phase === 'downloading' || store.phase === 'ready' || store.phase === 'failed') ? store.available : null
  const lastReading = store.lastCheck ? stampReading(new Date(store.lastCheck).toISOString(), new Date(), t) : null
  const lastChecked = lastReading ? t.updates.lastChecked(lastReading.relative) : t.updates.neverChecked
  const percent = store.total ? Math.round((store.downloaded ?? 0) / store.total * 100) : null
  const milestone = percent === null ? null : Math.floor(percent / 25) * 25
  const metered = isMeteredConnection()
  /** Bytes as megabytes to one decimal, with the language's decimal mark: `12.5` / `12,5`. */
  const megabytes = (bytes: number) => (bytes / 1048576).toLocaleString(t.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  // User-initiated transitions move focus to the new status so keyboard users
  // are not dropped at body when their button unmounts. Background auto-checks
  // never steal focus.
  useEffect(() => {
    if (actedRef.current) {
      actedRef.current = false
      statusRef.current?.focus()
    }
  }, [store.phase])

  function act(action: () => void): void {
    actedRef.current = true
    action()
  }

  async function copyCommand(command: string) {
    try {
      await writeText(command)
      setCopied(true)
      setCopyNote(t.updates.copied)
    } catch {
      setCopied(false)
      setCopyNote(t.updates.copyFailed)
    }
  }

  return <section className="page-section" id="updates-setting" aria-labelledby="updates-title">
    <h2 id="updates-title" className="section-title" tabIndex={-1}>{t.updates.title}</h2>
    <div className="group">
      <label className="setting check-row">
        <input
          type="checkbox"
          checked={autoCheck}
          onChange={() => {
            const next = !autoCheck
            writeUpdateAutoCheck(next)
            setAutoCheck(next)
            if (next) void checkForUpdatesNow()
          }}
        />
        <span>{t.updates.daily}</span>
      </label>
      <details className="setting update-channel">
        <summary>{t.updates.prereleases}</summary>
        <label className="check-row">
          <input
            type="checkbox"
            checked={prerelease}
          onChange={() => {
            const next = !prerelease
            writeUpdatePrerelease(next)
            setPrerelease(next)
            // Either direction changes the feed: re-check so a stale beta
            // offer can never linger after opting out.
            void checkForUpdatesNow()
          }}
          />
          <span>{t.updates.beta}</span>
        </label>
      </details>
      <div className="setting">
        <p ref={statusRef} tabIndex={-1} className="band-note capture-status" role="status" aria-live="polite" aria-atomic="true">
          {store.phase === 'loading' && t.updates.loading}
          {store.phase === 'checking' && t.updates.checking}
          {store.phase === 'current' && info && t.updates.latest(info.version, lastChecked)}
          {store.phase === 'idle' && info && (note ?? t.updates.current(info.version, lastChecked))}
          {store.phase === 'idle' && !info && (note ?? t.updates.backendDown)}
          {store.phase === 'failed' && note}
          {/* The offline note rides with a standing offer. Without this the store holds a note that
              nothing renders, and pressing Check now with no network answers the press with silence. */}
          {store.phase === 'offered' && actionable && `${t.updates.offered(actionable.version)}${note ? ` ${note}` : ''}`}
          {store.phase === 'ready' && actionable && `${t.updates.downloaded(actionable.version)}${note ? ` ${note}` : ''}`}
          {store.phase === 'suppressed' && actionable && dismissedCount(actionable.version) >= 2
            && `${t.updates.dismissedTwice(actionable.version)}${note ? ` ${note}` : ''}`}
          {store.phase === 'suppressed' && actionable && dismissedCount(actionable.version) < 2
            && `${t.updates.offered(actionable.version)}${note ? ` ${note}` : ''}`}
          {store.phase === 'downloading' && actionable && t.updates.downloading(actionable.version)}
        </p>
        <button type="button" className="stamp" onClick={() => act(() => void checkForUpdatesNow())} disabled={busy}>{t.updates.checkNow}</button>
      </div>
      {store.phase === 'downloading' && <div className="setting update-download">
        <progress className="update-progress" max={store.total ?? undefined} value={store.total == null ? undefined : (store.downloaded ?? undefined)} aria-label={t.updates.downloadingLabel(actionable?.version ?? t.updates.update)} aria-valuetext={actionable ? (percent === null ? t.updates.downloadStarting : `${t.updates.downloadPercent(percent)}${store.total ? t.updates.megabytesOf(megabytes(store.downloaded ?? 0), megabytes(store.total)) : ''}`) : undefined}/>
        <p className="band-note" aria-hidden="true">{actionable && (percent === null ? t.updates.starting : `${t.updates.progress(percent)}${store.total ? t.updates.mbOf(megabytes(store.downloaded ?? 0), megabytes(store.total)) : ''}`)}</p>
      </div>}
      <p className="sr-only" role="status">{store.phase === 'downloading' && milestone !== null && milestone > 0 ? t.updates.milestone(milestone) : ''}</p>
      {store.phase === 'offered' && actionable && updatable && <div className="setting update-actions">
        <p className="prose">{t.updates.availableDownload(actionable.version)}</p>
        {metered && <p className="prohibition-note">{t.updates.meteredDownload}</p>}
        <button type="button" className="stamp" onClick={() => act(() => void downloadUpdate())} disabled={busy}>{t.updates.download}</button>
        <button type="button" className="stamp" onClick={() => act(() => dismissOffered())}>{t.updates.notNow}</button>
        <button type="button" className="stamp" onClick={() => void openUrl(releaseTagUrl(actionable.version))}>{t.updates.releasePage}</button>
      </div>}
      {store.phase === 'offered' && actionable && !updatable && <div className="setting update-actions">
        {info?.kind === 'appimage' && !info.writable
          ? <p className="prose">{t.updates.appImageStuck(actionable.version)}</p>
          : <p className="prose">{t.updates.throughManager(actionable.version, info?.manager ?? null)}</p>}
        {info?.manager_command && <>
          <p className="band-note" id="update-command-offered">{t.updates.copyRun}</p>
          <div className="command-chip">
            <input value={info.manager_command} readOnly onFocus={event => event.currentTarget.select()} aria-label={t.updates.managerCommand} aria-describedby="update-command-offered"/>
            <button type="button" className="stamp" onClick={() => void copyCommand(info.manager_command ?? '')}>{copied ? t.updates.copiedButton : t.updates.copy}</button>
          </div>
          <p className="sr-only" role="status">{copyNote ?? ''}</p>
        </>}
        <button type="button" className="stamp" onClick={() => void openUrl(releaseTagUrl(actionable.version))}>{t.updates.releasePage}</button>
        <button type="button" className="stamp" onClick={() => act(() => dismissOffered())}>{t.updates.notNow}</button>
      </div>}
      {store.phase === 'suppressed' && actionable && <div className="setting update-actions">
        {actionable && dismissedCount(actionable.version) >= 2
          ? <p className="prose">{t.updates.dismissedTwiceRelease(actionable.version)}</p>
          : <p className="prose">{t.updates.paused(actionable.version)}</p>}
        <button type="button" className="stamp" onClick={() => void openUrl(releaseTagUrl(actionable.version))}>{t.updates.releasePage}</button>
      </div>}
      {store.phase === 'failed' && actionable && updatable && <div className="setting update-actions">
        {metered && <p className="prohibition-note">{t.updates.meteredRetry}</p>}
        <button type="button" className="stamp" onClick={() => act(() => void downloadUpdate())} disabled={busy}>{t.updates.retry}</button>
        <button type="button" className="stamp" onClick={() => void openUrl(releaseTagUrl(actionable.version))}>{t.updates.releasePage}</button>
      </div>}
      {store.phase === 'failed' && actionable && !updatable && <div className="setting update-actions">
        {info?.manager_command && <>
          <p className="band-note" id="update-command-failed">{t.updates.copyRun}</p>
          <div className="command-chip">
            <input value={info.manager_command} readOnly onFocus={event => event.currentTarget.select()} aria-label={t.updates.managerCommand} aria-describedby="update-command-failed"/>
            <button type="button" className="stamp" onClick={() => void copyCommand(info.manager_command ?? '')}>{copied ? t.updates.copiedButton : t.updates.copy}</button>
          </div>
          <p className="sr-only" role="status">{copyNote ?? ''}</p>
        </>}
        <button type="button" className="stamp" onClick={() => void openUrl(releaseTagUrl(actionable.version))}>{t.updates.releasePage}</button>
      </div>}
      {store.phase === 'ready' && actionable && !deferred && <div className="setting update-actions">
        <p className="prose">{t.updates.restartReady(actionable.version, observesGame)}</p>
        <button type="button" className="stamp" onClick={() => act(() => void restartToUpdate())}>{t.updates.restart}</button>
        <button type="button" className="stamp" onClick={() => act(() => setDeferred(true))}>{t.updates.later}</button>
      </div>}
      {store.phase === 'ready' && actionable && deferred && <div className="setting update-actions">
        <p className="prose">{t.updates.restartWaiting(actionable.version, observesGame)}</p>
        <button type="button" className="stamp" onClick={() => act(() => void restartToUpdate())}>{t.updates.restart}</button>
      </div>}
    </div>
    <p className="band-note">{t.updates.intro}</p>
  </section>
}
