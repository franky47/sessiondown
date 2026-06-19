import { defineConfig } from 'tsdown'

export default defineConfig({
  // The library entry (index) and the CLI bin (main, carries the shebang).
  entry: ['src/index.ts', 'src/main.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22.5',
  // Emit declarations with tsgo (@typescript/native-preview), the same compiler
  // used for type-checking — no stock `typescript` package needed.
  dts: { tsgo: true },
  clean: true,
  // Runtime deps (zod, diff, tinyglobby) stay external by default; the dynamic,
  // runtime-selected bun:sqlite / node:sqlite imports resolve as external too.
})
