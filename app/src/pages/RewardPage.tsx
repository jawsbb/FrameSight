import type { AccessMode, AppView } from '../backend'
import { RewardCards } from '../RewardCards'
import { EmptyState } from '../components/EmptyState'
import { useMessages } from '../i18n'

export function RewardPage({ view, effectiveMode }: { view: AppView; effectiveMode: AccessMode }) {
  const t = useMessages()
  const ownershipVerified = effectiveMode === 'full'
  const companion = effectiveMode === 'companion'
  return <div className="page">
    <div className="page-head">
      <h1 id="reward-title" className="page-title">{t.rewards.title}</h1>
      {companion && <p className="page-note">{t.rewards.companionNote}</p>}
    </div>
    <section aria-label={t.rewards.title}>
      {view.reward.cards.length
        ? <RewardCards cards={view.reward.cards} bestValueIndex={view.reward.best_value_index} bestDucatIndex={view.reward.best_ducat_index} ownershipVerified={ownershipVerified}/>
        : <EmptyState icon="rewards" title={t.rewards.none} detail={companion ? t.rewards.companionDetail : t.rewards.waiting}/>}
    </section>
  </div>
}
