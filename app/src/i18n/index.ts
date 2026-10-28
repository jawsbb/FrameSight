import { createContext, use, useEffect, useState } from 'react'
import { getPreferences, type Language } from '../backend'
import { en, type Messages } from './en'
import { fr } from './fr'

export type { Language, Messages }

export const catalogs: Record<Language, Messages> = { en, fr }

/** What each language calls itself, whatever language is on screen. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', fr: 'Français' }

/** The player's choice wins; without one a French system reads French, and anything else English. */
export function resolveLanguage(preference: Language | null | undefined, system = navigator.language): Language {
  return preference ?? (system.toLowerCase().startsWith('fr') ? 'fr' : 'en')
}

/** The catalog every component below the provider reads. Outside one, English. */
export const MessagesContext = createContext<Messages>(en)

export function useMessages(): Messages {
  return use(MessagesContext)
}

/** `<html lang>` follows the language on screen, so a reader pronounces it as written. */
export function useDocumentLanguage(language: Language): void {
  useEffect(() => { document.documentElement.lang = language }, [language])
}

/**
 * The overlays' language. They never read browser storage, so they ask the backend at mount and
 * again whenever `tick` changes (each poll or session they already run), which is how a choice
 * made in the main window reaches them. A failed read keeps the language already on screen.
 */
export function useBackendLanguage(tick: unknown): Messages {
  const [language, setLanguage] = useState<Language>(() => resolveLanguage(null))
  useEffect(() => {
    let active = true
    getPreferences()
      .then(preferences => { if (active) setLanguage(resolveLanguage(preferences.language)) })
      .catch(() => {})
    return () => { active = false }
  }, [tick])
  useDocumentLanguage(language)
  return catalogs[language]
}

/**
 * A backend rejection in this catalog's words. The market commands reject with a fixed set of
 * English sentences (`market.reasons`); one found there is swapped for its translation, and any
 * other reason is shown as the backend sent it.
 */
export function backendReason(reason: string, t: Messages): string {
  const key = (Object.keys(en.market.reasons) as Array<keyof Messages['market']['reasons']>)
    .find(candidate => en.market.reasons[candidate] === reason)
  return key ? t.market.reasons[key] : reason
}

/** `2026-07-27` as `27 Jul` or `27 juil.`: the calendar date itself, never shifted by a time zone. */
export function shortDate(isoDate: string, t: Messages): string {
  return new Intl.DateTimeFormat(t.locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`))
}
