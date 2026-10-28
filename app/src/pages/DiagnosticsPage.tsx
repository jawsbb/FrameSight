import type { AccessMode, AppView, BackendHealth, HealthState } from '../backend'
import { stampReading } from '../freshness'
import { EmptyState } from '../components/EmptyState'
import { ReportBlock } from '../components/ReportBlock'
import { StateIcon } from '../components/StateIcon'
import { useMessages, type Messages } from '../i18n'

/** A service's state in words. Its message is the backend's and stays in English: it is composed
 * from live values (paths, counts, error text) that no catalog can hold. */
function HealthRow({ label, health }: { label: string; health: BackendHealth | { state: HealthState; message: string; last_success?: string | null } }) {
  const t = useMessages()
  return <article className={`health-row ${health.state}`}>
    <StateIcon state={health.state}/>
    <div>
      <h3>{label}</h3>
      <p title={health.message}>{health.message}</p>
      {/* Rows record their success time in whatever form their own source keeps: most write Unix
          seconds, the price table an ISO date. The relative reading is the useful one here; the
          exact stamp rides along for anyone comparing a row against a log. */}
      {health.last_success && <small>{t.health.lastSuccess(healthSuccessLabel(health.last_success, t))}</small>}
    </div>
    <span className="verdict">{t.health.states[health.state]}</span>
  </article>
}

function healthSuccessLabel(value: string, t: Messages) {
  const reading = stampReading(value, new Date(), t)
  return reading ? `${reading.relative} · ${reading.exact}` : value
}

export function DiagnosticsPage({ view, effectiveMode }: { view: AppView; effectiveMode: AccessMode }) {
  const t = useMessages()
  const referenceSystems = ['catalog', 'market', 'collection_prices', 'database', 'market_account'] as const
  const liveSystems = ['game_reader', 'log_monitor', 'capture'] as const
  const systems = effectiveMode === 'companion' ? referenceSystems : [...liveSystems, ...referenceSystems]
  const showAcquisition = effectiveMode === 'full'
  return <div className="page">
    <div className="page-head">
      <h1 id="diagnostics-title" className="page-title">{t.diagnostics.title}</h1>
      <p className="page-note">{t.diagnostics.note}</p>
    </div>
    <ReportBlock health={view.health}/>
    <section className="page-section" aria-label={t.diagnostics.title}>
      {effectiveMode === 'companion' && <p className="prose">{t.diagnostics.companion}</p>}
      <h2 className="section-title">{t.diagnostics.services}</h2>
      <div className="group health-list">{systems.map(system => <HealthRow key={system} label={t.diagnostics.systems[system]} health={view.health[system]}/>)}</div>

      {showAcquisition && <>
        <h2 className="section-title">{t.diagnostics.acquisition}</h2>
        {view.health.acquisition_stages.length
          ? <ol className="group stages">{view.health.acquisition_stages.map((stage, index) => {
            // A stage the catalog does not name yet reads as its id in words.
            const words = stage.stage.replaceAll('_', ' ')
            const label = (t.diagnostics.stages as Partial<Record<string, string>>)[stage.stage] ?? words[0].toUpperCase() + words.slice(1)
            return <li key={stage.stage} className={stage.state}>
              <span className="stage-index">{index + 1}</span>
              <StateIcon state={stage.state}/>
              <div><strong>{label}</strong><p>{stage.message}</p></div>
              <span className="verdict">{t.health.states[stage.state]}</span>
            </li>
          })}</ol>
          : <EmptyState icon="diagnostics" title={t.diagnostics.noAttempt} detail={t.diagnostics.noAttemptDetail}/>}
      </>}
    </section>
  </div>
}
