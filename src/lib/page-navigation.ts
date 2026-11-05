/** Keep the last selected page on reload without persisting modal or draft state. */
export const PAGES = ['Home', 'Calendar', 'Ideas', 'Map', 'Memories', 'Groups', 'Settings'] as const
export type Page = typeof PAGES[number]
const PAGE_KEY = 'together-active-page'

export function restorePage(storage: Pick<Storage, 'getItem'> | null): Page {
  try {
    const value = storage?.getItem(PAGE_KEY)
    return PAGES.includes(value as Page) ? value as Page : 'Home'
  } catch { return 'Home' }
}

export function persistPage(storage: Pick<Storage, 'setItem'> | null, page: Page): void {
  try { storage?.setItem(PAGE_KEY, page) } catch { /* storage disabled */ }
}

export function clearPage(storage: Pick<Storage, 'removeItem'> | null): void {
  try { storage?.removeItem(PAGE_KEY) } catch { /* storage disabled */ }
}
