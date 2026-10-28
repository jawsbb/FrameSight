import type { Relic } from './backend'
import type { Messages } from './i18n'

/** A relic as the pages name it: "Axi A1 Radiant", the refinement in the reader's language. */
export const relicLabel = (relic: Pick<Relic, 'name' | 'refinement'>, t: Messages) =>
  relic.refinement ? `${relic.name} ${t.relics.refinements[relic.refinement]}` : relic.name
