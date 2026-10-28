import { describe, expect, it } from 'vitest'
import marketAccountSource from '../../src-tauri/src/market_account.rs?raw'
import { backendReason, catalogs, resolveLanguage, shortDate } from '.'
import { en } from './en'
import { fr } from './fr'

/** Every leaf of a catalog, by path: strings, function arities and array lengths. */
function shape(node: unknown, path = ''): Array<[string, string]> {
  if (typeof node === 'function') return [[path, `fn/${node.length}`]]
  if (Array.isArray(node)) return [[path, `array/${node.length}`], ...node.flatMap((item, index) => shape(item, `${path}[${index}]`))]
  if (node && typeof node === 'object') return Object.entries(node).flatMap(([key, value]) => shape(value, path ? `${path}.${key}` : key))
  return [[path, typeof node]]
}

describe('message catalogs', () => {
  it('give French every English key, with the same shape, and nothing else', () => {
    expect(shape(fr)).toEqual(shape(en))
  })

  it('leave no message empty in any language', () => {
    for (const [language, catalog] of Object.entries(catalogs)) {
      const strings = shape(catalog).filter(([, kind]) => kind === 'string').map(([path]) => path)
      const empty = strings.filter(path => {
        const value = path.split(/\.|\[(\d+)\]/).filter(Boolean).reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], catalog)
        return typeof value !== 'string' || value.trim() === ''
      })
      expect(empty, `${language} has empty messages`).toEqual([])
    }
  })

  it('know every warframe.market reason exactly as the backend spells it', () => {
    for (const reason of Object.values(en.market.reasons)) {
      expect(marketAccountSource, `"${reason}" is not a backend sentence`).toContain(`"${reason}"`)
    }
  })

  it('translate a known backend reason and show an unknown one as sent', () => {
    expect(backendReason('warframe.market is limiting requests; try again shortly', fr)).toBe('warframe.market limite les requêtes\u00a0; réessayez dans un instant')
    expect(backendReason('warframe.market is limiting requests; try again shortly', en)).toBe('warframe.market is limiting requests; try again shortly')
    expect(backendReason('socket closed unexpectedly', fr)).toBe('socket closed unexpectedly')
  })
})

describe('dates by language', () => {
  it('write a calendar date day first, in each language', () => {
    expect(shortDate('2026-07-27', en)).toBe('27 Jul')
    expect(shortDate('2026-07-27', fr)).toBe('27 juil.')
  })

})

describe('language resolution', () => {
  it('follows a French system, and English for any other', () => {
    expect(resolveLanguage(null, 'fr-FR')).toBe('fr')
    expect(resolveLanguage(undefined, 'fr')).toBe('fr')
    expect(resolveLanguage(null, 'de-DE')).toBe('en')
    expect(resolveLanguage(null, 'en-US')).toBe('en')
  })

  it('lets an explicit choice win over the system', () => {
    expect(resolveLanguage('en', 'fr-FR')).toBe('en')
    expect(resolveLanguage('fr', 'de-DE')).toBe('fr')
  })
})
