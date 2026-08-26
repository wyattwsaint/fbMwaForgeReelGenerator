import { relative } from 'node:path'
import { check } from './check.ts'
import { loadSite } from './config.ts'
import { render } from './render.ts'

const USAGE = 'usage: reel check <site>\n       reel render <site>'

export async function main(argv: string[], root = process.cwd()): Promise<number> {
  const [command, slug, ...rest] = argv
  if ((command !== 'check' && command !== 'render') || !slug || rest.length > 0) {
    console.error(USAGE)
    return 2
  }

  const started = Date.now()
  let problems: string[]
  let path = ''
  try {
    const config = await loadSite(slug, root)
    if (command === 'check') {
      problems = await check(config, root)
    } else {
      const result = await render(config, root, slug)
      problems = result.problems
      path = result.path
    }
  } catch (error) {
    console.error(`${command} ${slug} — ${error instanceof Error ? error.message : error}`)
    return 1
  }
  const elapsed = `${((Date.now() - started) / 1000).toFixed(1)}s`

  if (problems.length > 0) {
    console.log(`check ${slug}  ${elapsed}`)
    console.log('')
    for (const problem of problems) console.log(`  ${problem}`)
    console.log('')
    console.log(`${problems.length} problem${problems.length === 1 ? '' : 's'}.`)
    return 1
  }

  if (command === 'check') console.log(`check ok  ${slug}  ${elapsed}`)
  else console.log(`render ok  ${slug}  ${elapsed}  ${relative(root, path)}`)
  return 0
}
