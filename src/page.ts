import type { Page } from 'playwright'

export type Rect = { x: number; y: number; width: number; height: number }

/** Page coordinates — a master is clipped out of the full page, never scrolled to. */
export async function rectOf(page: Page, selector: string): Promise<Rect | null> {
  return page.evaluate((sel) => {
    const element = document.querySelector(sel)
    if (!element) return null
    const box = element.getBoundingClientRect()
    return {
      x: box.x + window.scrollX,
      y: box.y + window.scrollY,
      width: box.width,
      height: box.height,
    }
  }, selector)
}

/**
 * The hero, resolved the one way — `check` and `capture` have to agree about which
 * element the hook is, or a config that checks clean renders a different opening shot.
 */
export async function hookRect(page: Page, selector?: string): Promise<Rect | null> {
  if (selector) return rectOf(page, selector)
  const found = await page.evaluate(() => {
    const main = document.querySelector('main')
    const hero = (main ?? document).querySelector('section') ?? main?.firstElementChild
    if (!hero) return null
    const box = hero.getBoundingClientRect()
    return {
      x: box.x + window.scrollX,
      y: box.y + window.scrollY,
      width: box.width,
      height: box.height,
    }
  })
  return found
}
