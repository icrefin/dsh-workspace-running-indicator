import type { UserConfig } from 'tsdown'

/**
 * Browser-half bundler: emits `lib/client.js` in the module loader's factory
 * form. The `id` in the banner MUST equal the package name — it is the boot
 * graph row id, and a mismatch makes the module system reject the bundle with
 * "loaded without registering <id>".
 *
 * This browser half imports nothing outside its own sources — no React, no
 * platform seed, no runtime dependency — so the factory's `require` is never
 * called. The `neverBundle` list stays as a guard: a future import of a seed must
 * resolve from the module table rather than be inlined twice.
 *
 * This is expressed as `deps.neverBundle`, not the top-level `external` that
 * tsdown deprecated. The two mean the same thing here — mark these imports
 * external rather than resolve them — but `external` prints a deprecation
 * warning on every build with tsdown 0.22.x.
 */
export default {
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: { neverBundle: ['react', 'react/jsx-runtime'] },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-workspace-running-indicator", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
} satisfies UserConfig