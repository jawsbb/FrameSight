import { useState } from 'react'
import type { AppView } from '../backend'
import { copyReport, openIssue, saveReport } from '../report'
import { reportBlockVisible } from '../reportable'
import { StateIcon } from './StateIcon'
import { useMessages } from '../i18n'

type ReportStatus =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; message: string }

export function ReportBlock({ health, alwaysVisible }: { health: AppView['health']; alwaysVisible?: boolean }) {
  const t = useMessages()
  const [status, setStatus] = useState<ReportStatus>({ kind: 'idle' })
  const broken = reportBlockVisible(health)
  if (!alwaysVisible && !broken) return null
  const run = async (action: () => Promise<void | { folder_path: string; ee_log_included: boolean }>, done: (result: { folder_path: string; ee_log_included: boolean } | null) => string) => {
    setStatus({ kind: 'busy' })
    try {
      const result = await action()
      const resultOrNull = result && typeof result === 'object' ? result : null
      setStatus({ kind: 'done', message: done(resultOrNull) })
    } catch (error) {
      setStatus({ kind: 'done', message: String(error) })
    }
  }
  return (
    <section className="page-section" role="group" aria-label={t.report.title}>
      <h2 className="section-title">{t.report.title}</h2>
      <div className={`group report${broken ? ' broken' : ''}`}>
        <div className="setting">
          <div className="report-head">
            <StateIcon state={broken ? 'failed' : 'ready'}/>
            <p className="prose">{broken ? t.report.failed : ''}{t.report.intro}</p>
          </div>
          <div className="report-actions">
            <button type="button" className="stamp" disabled={status.kind === 'busy'} onClick={() => void run(openIssue, () => t.report.opened)}>{t.report.openIssue}</button>
            <button type="button" className="stamp" disabled={status.kind === 'busy'} onClick={() => void run(copyReport, () => t.report.copied)}>{t.report.copy}</button>
            <button type="button" className="stamp" disabled={status.kind === 'busy'} onClick={() => void run(saveReport, result =>
              t.report.saved(result?.folder_path ?? '…', result?.ee_log_included ?? false),
            )}>{t.report.save}</button>
          </div>
        </div>
        {status.kind === 'done' && <p className="setting report-status" role="status">{status.message}</p>}
      </div>
    </section>
  )
}
