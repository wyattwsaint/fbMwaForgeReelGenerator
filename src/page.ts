import type { JSHandle, Page } from 'playwright'

export type Rect = { x: number; y: number; width: number; height: number }

/** How a candidate section is addressed: by its own id, or through its parent. */
export type Named = { selector: string; named: boolean }

/** A candidate section as the page gives it up: where it is, how it is named, what it says. */
export type Candidate = Rect & Named & { heading: string | null }

/**
 * Every level, because the heading a section leads with is an `h1` on the page's hero
 * and an `h2` or an `h3` further down, and the reel wants whichever one it is.
 */
const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6'

/**
 * A heading's text as one line of copy.
 *
 * Collapsed rather than truncated: a heading broken across source lines, or set in two
 * by a `<br>`, is one line when it is read aloud, and that is what a beat draws.
 * Nothing here shortens anything — copy over budget is a loud failure at `check`, never
 * a line quietly cut to fit (#9).
 *
 * It is `innerText` the browser is asked for rather than `textContent`, because the two
 * differ on exactly the pages this is read off: `textContent` runs a `<br>` line break
 * into one word and hands back the screen-reader-only spans a viewer never sees, and a
 * reel's copy is what the page *shows*.
 */
function oneLine(text: string | null | undefined): string | null {
  const line = (text ?? '').replace(/\s+/g, ' ').trim()
  return line === '' ? null : line
}

/**
 * The heading a beat's own section leads with — the label it draws when its config
 * names no `label` (#62).
 *
 * Read off the settled page, inside the element the beat's selector resolved to. A beat
 * that reaches for #7's `y`/`height` hatch resolves to an *ancestor* — `main`, usually,
 * because its section has no id — so the window is applied here too: without it every
 * such beat on a page would take the page's first heading, which is the hero's, and the
 * shot would carry the label of a section it is not framed on.
 *
 * A section with no heading of its own is null, which is a shot with no text on it
 * rather than a problem.
 */
export async function headingIn(
  page: Page,
  selector: string,
  within?: { y?: number; height?: number },
): Promise<string | null> {
  const top = within?.y ?? null
  const bottom = top !== null && within?.height !== undefined ? top + within.height : null
  const found = await page.evaluate(
    (asked) => {
      const element = document.querySelector(asked.sel)
      if (!element) return null
      for (const heading of element.querySelectorAll(asked.headings)) {
        const at = heading.getBoundingClientRect().y + window.scrollY
        if (asked.top !== null && at < asked.top) continue
        if (asked.bottom !== null && at >= asked.bottom) continue
        return (heading as HTMLElement).innerText
      }
      return null
    },
    { sel: selector, headings: HEADING_SELECTOR, top, bottom },
  )
  return oneLine(found)
}

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
 * The hero itself, resolved the one way — `check` and `capture` have to agree about
 * which element the hook is, or a config that checks clean renders a different opening
 * shot.
 *
 * A handle rather than a rect, because two things now ask this question and want
 * different answers about the same element: `hookRect` below wants where it is, and
 * `positionHero` (`./hero.ts`) wants to reach inside it. Stated once here so the rule
 * cannot be changed at one reader and left alone at the other.
 */
export function heroHandle(page: Page, selector?: string): Promise<JSHandle<Element | null>> {
  return page.evaluateHandle((sel) => {
    if (sel) return document.querySelector(sel)
    const main = document.querySelector('main')
    return (main ?? document).querySelector('section') ?? main?.firstElementChild ?? null
  }, selector)
}

/** Where the hero sits, in page coordinates — the space a clip is taken in. */
export async function hookRect(page: Page, selector?: string): Promise<Rect | null> {
  const hero = await heroHandle(page, selector)
  try {
    return await hero.evaluate((element) => {
      if (!element) return null
      const box = element.getBoundingClientRect()
      return {
        x: box.x + window.scrollX,
        y: box.y + window.scrollY,
        width: box.width,
        height: box.height,
      }
    })
  } finally {
    await hero.dispose()
  }
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
 * Each also carries the heading it leads with, which is the label a beat written
 * against it would get for free (#62) — so the report can show the copy a config is
 * about to inherit before it is written.
 *
 * Nothing is ranked, scored or suggested here: which of these become beats, in what
 * order, is the human's (#10).
 */
export async function sectionRects(page: Page): Promise<Candidate[]> {
  const found = await page.evaluate((headings) => {
    const main = document.querySelector('main')
    const parent = main ?? document.body
    const through = main ? 'main' : 'body'
    type Found = Named & { heading: string | null } & Record<'x' | 'y' | 'width' | 'height', number>
    const found: Found[] = []
    for (const element of parent.children) {
      const box = element.getBoundingClientRect()
      // Zero height is a `<script>`, a `<style>` or a wrapper that draws nothing —
      // a child of `main` that is not a section of it. That is the only exclusion:
      // deciding a rendered element is not worth reporting is the human's call.
      if (box.height === 0) continue
      found.push({
        selector: element.id ? `#${element.id}` : through,
        named: element.id !== '',
        heading: (element.querySelector(headings) as HTMLElement | null)?.innerText ?? null,
        x: box.x + window.scrollX,
        y: box.y + window.scrollY,
        width: box.width,
        height: box.height,
      })
    }
    return found
  }, HEADING_SELECTOR)
  return found.map((section) => ({ ...section, heading: oneLine(section.heading) }))
}
