import { check } from './check.ts'
import { loadSite } from './config.ts'

const USAGE = 'usage: reel check <site>'

export async function main(argv: string[], root = process.cwd()): Promise<number> {
  const [command, slug, ...rest] = argv
  if (command !== 'check' || !slug || rest.length > 0) {
    console.error(USAGE)
    return 2
  }

  const started = Date.now()
  let problems: string[]
  try {
    problems = await check(await loadSite(slug, root), root)
  } catch (error) {
    console.error(`check ${slug} — ${error instanceof Error ? error.message : error}`)
    return 1
  }
  const elapsed = `${((Date.now() - started) / 1000).toFixed(1)}s`

  if (problems.length === 0) {
    console.log(`check ok  ${slug}  ${elapsed}`)
    return 0
  }
  console.log(`check ${slug}  ${elapsed}`)
  console.log('')
  for (const problem of problems) console.log(`  ${problem}`)
  console.log('')
  console.log(`${problems.length} problem${problems.length === 1 ? '' : 's'}.`)
  return 1
}
