import { resolve } from 'node:path'
import { prepareProductionClosure } from './stage-production-closure.mjs'

const repo = resolve(import.meta.dirname, '../..')
const output = resolve(repo, 'build/android-runtime/closure')
const inventory = prepareProductionClosure(repo, output, { reuse: process.argv.includes('--development') })
process.stdout.write(`Prepared ${inventory.packages.length} current production packages, including installed patches.\n`)
