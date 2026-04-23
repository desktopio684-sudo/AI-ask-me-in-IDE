/**
 * build.mjs — esbuild bundler for the QuizGate MCP server.
 *
 * Why esbuild instead of plain tsc?
 *   The MCP server depends on @quizgate/shared (a workspace package).
 *   When published to npm, that workspace link doesn't exist.
 *   esbuild inlines the shared code into the dist, so users
 *   get a single package with zero broken imports.
 *
 * What gets bundled:
 *   ✓ @quizgate/shared  — inlined (workspace-only package)
 *   ✓ Local src/**       — all server code
 *
 * What stays external (installed by npm):
 *   ✗ @modelcontextprotocol/sdk  — MCP protocol library
 *   ✗ zod                        — schema validation
 *   ✗ Node.js builtins           — fs, path, os, http, etc.
 */

import { build } from 'esbuild';

await build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outfile: 'dist/index.js',

    // Keep real npm dependencies external — npm installs them for users
    external: [
        '@modelcontextprotocol/sdk',
        '@modelcontextprotocol/sdk/*',
        'zod',
    ],

    // Shebang and require polyfill for ESM so bundled CJS modules can require externals
    banner: {
        js: `#!/usr/bin/env node\nimport { createRequire } from "module";\nconst require = createRequire(import.meta.url);`,
    },

    // Clean sourcemaps for debugging
    sourcemap: true,

    // Tree-shake dead code
    treeShaking: true,
});

console.log('✓ Built dist/index.js (bundled @quizgate/shared)');
