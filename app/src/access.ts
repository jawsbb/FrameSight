import type { AccessMode } from './backend'
import { en, type Messages } from './i18n/en'

/** The three levels, least first: each includes the one before it. Their words live in the catalog. */
export const ACCESS_MODES: readonly AccessMode[] = ['companion', 'overlay', 'full']

export interface AccessModeDefinition {
  name: string
  boundary: string
  added: readonly string[]
  /** What leaves the machine and what it may cost, said where the level is chosen. */
  caution?: string
}

export function accessMode(id: AccessMode, t: Messages = en): AccessModeDefinition {
  return t.access.modes[id]
}

export function accessLevel(id: AccessMode): number {
  return ACCESS_MODES.indexOf(id)
}

export function accessGrantedBetween(from: AccessMode, to: AccessMode, t: Messages = en): readonly string[] {
  return ACCESS_MODES.slice(accessLevel(from) + 1, accessLevel(to) + 1).flatMap(id => t.access.modes[id].added)
}
