import { mkdir, mkdtemp, readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { build } from 'esbuild'

const id = 'dsh-threads'
const outDir = 'lib'
const artifacts = ['index.js', 'client.js.map', 'client.js']
const stagingDir = await mkdtemp(join(process.cwd(), '.lib-staging-'))

try {
  await build({
    entryPoints: ['src/host/index.ts'],
    outfile: join(stagingDir, 'index.js'),
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    sourcemap: false,
  })

  await build({
    entryPoints: ['src/client/index.ts'],
    outfile: join(stagingDir, 'client.js'),
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: ['chrome120', 'safari17'],
    jsx: 'automatic',
    sourcemap: true,
    minify: false,
    external: ['react', 'react/jsx-runtime'],
    banner: {
      js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
    },
    footer: {
      js: 'return module.exports; } });',
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    },
  })

  await mkdir(outDir, { recursive: true })
  for (const file of artifacts) {
    await rename(join(stagingDir, file), join(outDir, file))
  }

  const expected = new Set(artifacts)
  for (const entry of await readdir(outDir)) {
    if (!expected.has(entry)) {
      await rm(join(outDir, entry), { recursive: true, force: true })
    }
  }
} finally {
  await rm(stagingDir, { recursive: true, force: true })
}
