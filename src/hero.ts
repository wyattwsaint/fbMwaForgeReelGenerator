import type { Page } from 'playwright'
import { heroHandle } from './page.ts'
import { configuredHeroPosition } from './site.ts'
import type { SiteConfig } from './site.ts'

/**
 * Slide a hero's cover crop sideways before the shot is framed (ADR-0011).
 *
 * A landscape hero under `object-fit: cover` shows a column of itself in a 9:16 box —
 * covering 1080x1920 with a 1920x1080 source scales it to 3413px wide, so 31.6% of it
 * is on screen and the browser threw the rest away before this pipeline saw a pixel.
 * *Which* 31.6% is the site's `object-position`, chosen for a phone visitor scrolling
 * a page. It is not chosen for a 3-second silent shot whose whole job is to move, and
 * on pharos the two answers are at opposite ends of the same painting: the lighthouse
 * the school is named for on the left, the water and the sun's glitter on the right.
 * Framed at the site's own 22% the hero reads 1.97 against a floor of 5 — a hook that
 * records dead (ADR-0008) on a hero that is visibly moving.
 *
 * So the reel says which column it wants. This is the one place the pipeline changes
 * the page it is filming, and ADR-0011 is where that is argued rather than assumed:
 * the pixels are still the site's own and the crop is still one the site's own CSS
 * could have chosen — what moves is a framing decision, in the direction the frame
 * needs, on the one shot whose aspect fights the page's.
 *
 * What it moves is media that is actually *cropped sideways* — cover-fitted, inside the
 * hook's own element, and scaled to overflow its box horizontally. Those are the same
 * test asked at three altitudes, and whatever fails any of them has no column to choose:
 * a `background-image` or a canvas has no `object-position` at all, a `fill` stretches
 * rather than crops, and a cover image that overflows only downwards is cropped in the
 * axis this is not about. All are left exactly as the site laid them out, and none is a
 * failure — there is no crop there for this to undo, so nothing is being silently
 * missed. A config that asks for a reposition on such a hero gets the frame it always
 * had, and the motion probe still reports what that reads.
 *
 * The vertical half is read back rather than written, for the same reason: the site's
 * own answer to "which band of a too-tall source" is not the question being asked, and
 * clobbering it to `center` would reframe a hero in an axis nobody measured.
 *
 * Called by every path that frames the hook — the probe, the recording and a still
 * hook's master — because ADR-0008's whole claim is that the probe measured the frame
 * the shot is cut in, and a probe that skipped this would be measuring the site's crop
 * and clearing a shot taken on the reel's.
 */
export async function positionHero(page: Page, config: SiteConfig): Promise<void> {
  const position = configuredHeroPosition(config)
  if (position === undefined) return
  const hero = await heroHandle(page, config.hook?.selector)
  try {
    await hero.evaluate((element, x) => {
      if (!element) return
      for (const media of element.querySelectorAll('video, img')) {
        const computed = getComputedStyle(media)
        if (computed.objectFit !== 'cover') continue
        const source =
          media instanceof HTMLVideoElement
            ? { width: media.videoWidth, height: media.videoHeight }
            : {
                width: (media as HTMLImageElement).naturalWidth,
                height: (media as HTMLImageElement).naturalHeight,
              }
        // Nothing has loaded yet, so there is no crop to reason about. A stabilised page
        // has decoded its images and pinned its videos, which is why this runs after one.
        if (!source.width || !source.height) continue
        const box = media.getBoundingClientRect()
        // Cover scales until neither axis is short, so the scale is the larger ratio and
        // the overflow is what that leaves over. A source no wider than its box is
        // cropped downwards or not at all, and there is no column in it to choose.
        const scale = Math.max(box.width / source.width, box.height / source.height)
        if (source.width * scale - box.width < 1) continue
        // Computed `object-position` is always two resolved values, so the second is
        // the vertical one whatever the stylesheet wrote.
        const vertical = computed.objectPosition.split(' ')[1] ?? 'center'
        ;(media as HTMLElement).style.objectPosition = `${x * 100}% ${vertical}`
      }
    }, position)
  } finally {
    await hero.dispose()
  }
}
