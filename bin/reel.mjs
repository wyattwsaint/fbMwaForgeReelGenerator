#!/usr/bin/env node
// The `reel` entry point (#18). TypeScript is loaded through tsx's ESM hook so a
// site config stays a checked-in `.ts` module (ADR-0001) with no build step.
import { register } from 'tsx/esm/api'

register()
const { main } = await import('../src/cli.ts')
process.exit(await main(process.argv.slice(2)))
