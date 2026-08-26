import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('./site/', import.meta.url))

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
}

export type FixtureSite = {
  url: string
  /** Document loads per path — the shared-page rule is only observable from here. */
  documentLoads: () => Record<string, number>
  close: () => Promise<void>
}

/**
 * The fixture site, served from the suite. Tests never touch a client's live site:
 * the suite must not depend on anyone's uptime.
 */
export async function startFixtureSite(): Promise<FixtureSite> {
  const loads: Record<string, number> = {}

  const server: Server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    const relative = path === '/' ? 'index.html' : normalize(path).replace(/^[\/]+/, '')
    const file = join(ROOT, relative)

    if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end('not found')
      return
    }
    const type = TYPES[extname(file)] ?? 'application/octet-stream'
    if (type.startsWith('text/html')) loads[path] = (loads[path] ?? 0) + 1

    // Range requests, because a <video> served without them is not seekable — and a
    // hero seeked to a fixed time is the whole point of the video hazard.
    const size = statSync(file).size
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '')
    if (range) {
      const start = range[1] ? Number(range[1]) : 0
      const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
      response.writeHead(206, {
        'content-type': type,
        'content-range': `bytes ${start}-${end}/${size}`,
        'content-length': end - start + 1,
        'accept-ranges': 'bytes',
        'cache-control': 'no-store',
      })
      createReadStream(file, { start, end }).pipe(response)
      return
    }

    response.writeHead(200, {
      'content-type': type,
      'content-length': size,
      'accept-ranges': 'bytes',
      'cache-control': 'no-store',
    })
    createReadStream(file).pipe(response)
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (typeof address === 'string' || address === null) throw new Error('no port')

  return {
    url: `http://127.0.0.1:${address.port}`,
    documentLoads: () => ({ ...loads }),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
