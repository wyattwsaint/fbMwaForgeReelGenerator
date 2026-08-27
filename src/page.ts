import type { Page } from 'playwright'

export type Rect = { x: number; y: number; width: number; height: number }

/** How a candidate section is addressed: by its own id, or through its parent. */
export type Named = { selector: string; named: boolean }

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

/**
 * Every candidate section on the page, in document order, measured in page
 * coordinates — what `reel sections` reports and nothing else reads.
 *
 * A candidate is a direct child of `main` (or of `body` on a page that has no
 * `main`), because that is the level a config's beats are written at. Each carries a
 * selector that *resolves*, which is the one thing the report promises: the section's
 * own `id` where it has one, since an id is what survives the client's next edit, and
 * otherwise the parent it has to be addressed through — `main` or `body`, whichever
 * this page actually has, because naming the one it does not is a selector that
 * resolves to nothing.
 *
 * Nothing is ranked, scored or suggested here: which of these become beats, in what
 * order, is the human's (#10).
 */
export async function sectionRects(page: Page): Promise<(Rect & Named)[]> {
  return page.evaluate(() => {
    const main = document.querySelector('main')
    const parent = main ?? document.body
    const through = main ? 'main' : 'body'
    const found: (Named & { x: number; y: number; width: number; height: number })[] = []
    for (const element of parent.children) {
      const box = element.getBoundingClientRect()
      // Zero height is a `<script>`, a `<style>` or a wrapper that draws nothing —
      // a child of `main` that is not a section of it. That is the only exclusion:
      // deciding a rendered element is not worth reporting is the human's call.
      if (box.height === 0) continue
      found.push({
        selector: element.id ? `#${element.id}` : through,
        named: element.id !== '',
        x: box.x + window.scrollX,
        y: box.y + window.scrollY,
        width: box.width,
        height: box.height,
      })
    }
    return found
  })
}
