import type { Page } from 'playwright'
import { DEFAULT_VIDEO_TIME } from './frame.ts'

/**
 * Put the page into a deterministic state (#6's hardened settle). A settled page
 * captures bit-identically run to run, and `check` resolves selectors against it
 * so a section is measured at the size it will be captured at.
 *
 * The page is never scrolled *to a section*: the step-scroll below exists only to
 * trip the IntersectionObservers behind lazy images, and it returns to 0. Masters
 * are taken `fullPage` + `clip`, which is what keeps page chrome out of a beat.
 */
export async function settle(page: Page, videoTime = DEFAULT_VIDEO_TIME): Promise<void> {
  // 1. Lazy images. `loading = 'eager'` alone does not trip an IntersectionObserver,
  //    so walk the page in 0.8-viewport steps and come back (#6, defect 1).
  await page.evaluate(async () => {
    for (const img of document.images) img.loading = 'eager'
    const step = Math.round(window.innerHeight * 0.8)
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 250))
    }
    window.scrollTo(0, 0)
    await new Promise((r) => setTimeout(r, 300))
  })

  // 2. Decode serially against one shared budget. `Promise.all` here is #11's
  //    renderer crash.
  await page.evaluate(async () => {
    const deadline = Date.now() + 10_000
    for (const img of document.images) {
      if (!img.currentSrc) continue
      while (!img.complete && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100))
      try {
        await img.decode()
      } catch {
        // A broken image is the page's problem, not a settle failure.
      }
    }
  })

  // 3. Videos. Stubbing `play()` first is the whole trick: a paused video that the
  //    page's own script re-plays lands the master on an arbitrary frame (#6, defect 2).
  await page.evaluate(async (t) => {
    // No named helpers in here: the TS loader renames functions, and the injected
    // `__name` does not exist inside the page.
    for (const video of document.querySelectorAll('video')) {
      video.autoplay = false
      video.play = () => Promise.resolve()
      video.pause()

      // `preload="none"` means a paused video never buffers, and a seek on a video
      // that has no metadata yet is silently discarded — it has to be asked to load.
      if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
        video.preload = 'auto'
        video.load()
        await Promise.race([
          new Promise<void>((r) => video.addEventListener('loadedmetadata', () => r(), { once: true })),
          new Promise<void>((r) => setTimeout(r, 10_000)),
        ])
      }

      video.pause()
      const seeked = Promise.race([
        new Promise<void>((r) => video.addEventListener('seeked', () => r(), { once: true })),
        new Promise<void>((r) => setTimeout(r, 3000)),
      ])
      video.currentTime = t
      await seeked
      video.pause()
    }
  }, videoTime)

  // 4. Animations. An infinite one differs frame to frame even at scroll 0 (#6, defect 3).
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      const iterations = animation.effect?.getTiming?.().iterations
      if (iterations === Infinity) {
        animation.pause()
        animation.currentTime = 0
      } else {
        try {
          animation.finish()
        } catch {
          animation.pause()
        }
      }
    }
  })

  // 5. Fonts last: everything above can pull in a face.
  await page.evaluate(async () => {
    await document.fonts.ready
  })
}
