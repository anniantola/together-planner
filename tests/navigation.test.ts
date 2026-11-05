import { describe, expect, it } from 'vitest'
import { clearPage, persistPage, restorePage, PAGES } from '../src/lib/page-navigation'

function store() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) }
  }
}

describe('persisting the selected Together page', () => {
  it('defaults to Home on first visit', () => expect(restorePage(store())).toBe('Home'))
  it('restores every supported page on reload', () => {
    const storage = store()
    for (const page of PAGES) { persistPage(storage, page); expect(restorePage(storage)).toBe(page) }
  })
  it('rejects invalid and obsolete page names', () => {
    const storage = store(); storage.setItem('together-active-page', 'Admin')
    expect(restorePage(storage)).toBe('Home')
  })
  it('clears page on sign-out', () => {
    const storage = store(); persistPage(storage, 'Memories'); clearPage(storage)
    expect(restorePage(storage)).toBe('Home')
  })
  it('does not fail when browser storage is unavailable', () => {
    const blocked = { getItem: () => { throw Error('Storage blocked') }, setItem: () => { throw Error('Storage blocked') }, removeItem: () => { throw Error('Storage blocked') } }
    expect(restorePage(blocked)).toBe('Home')
    expect(() => persistPage(blocked, 'Map')).not.toThrow()
    expect(() => clearPage(blocked)).not.toThrow()
  })
})
