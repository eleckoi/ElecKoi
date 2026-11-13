import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts', 'regex-ejs': 'src/regex-ejs.ts', media: 'src/storage/media/index.ts', variables: 'src/domain/variables/variableSchema.ts', frontends: 'src/domain/frontends/index.ts', 'character-assets': 'src/character-assets.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  fixedExtension: false,
  target: 'node20',
  dts: true,
  sourcemap: true,
  clean: true,
  tsconfig: 'tsconfig.json',
  external: [
    '@deepseek-ai/cordis',
    'better-sqlite3',
    /^drizzle-orm(?:\/.*)?$/,
    'zod'
  ]
})
