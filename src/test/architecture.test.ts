/**
 * Architecture import scan (R2.8, R74.2). Parses every `.ts/.tsx` file under `src/` with the TypeScript
 * compiler API, resolves each import specifier and checks the dependency rules of the design:
 *
 * 1. Code outside `src/modules/**` (core, app, ui and the root entry files) imports module code only through
 *    `src/core/registry/modules.ts`. `src/test/**` is test support, not app source, and is not covered.
 * 2. No module imports another module.
 * 3. No file under a `logic/` folder imports `dexie`, `react`, `react-dom` (or `dexie-react-hooks`), or any
 *    `db/`, `data/`, `ui/`, `app/`, `net/` or `engine/` path.
 */
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

const MODULE_REGISTRY_FILE = '/src/core/registry/modules.ts';
const FORBIDDEN_LOGIC_PACKAGES = ['dexie', 'react', 'react-dom', 'dexie-react-hooks'];
const FORBIDDEN_LOGIC_SEGMENTS = ['db', 'data', 'ui', 'app', 'net', 'engine'];

export interface ImportViolation {
  rule: 'core-imports-module' | 'module-imports-module' | 'logic-imports-io';
  file: string;
  specifier: string;
}

/** Every module specifier in a file: static imports and re-exports (type-only included), dynamic imports, `import x = require()` and `import('x')` types. */
export function collectSpecifiers(fileName: string, text: string): string[] {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const expr = node.moduleReference.expression;
      if (ts.isStringLiteral(expr)) specifiers.push(expr.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [arg] = node.arguments;
      if (arg !== undefined && ts.isStringLiteralLike(arg)) specifiers.push(arg.text);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      specifiers.push(node.argument.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

/** Normalises a POSIX path, resolving `.` and `..` segments. */
function normalise(path: string): string {
  const out: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') out.pop();
    else out.push(segment);
  }
  return `/${out.join('/')}`;
}

type Target = { kind: 'path'; path: string } | { kind: 'package'; name: string };

/** Resolves a specifier from `importer` (a root-relative path such as `/src/core/x.ts`). */
export function resolveSpecifier(importer: string, specifier: string): Target {
  if (specifier.startsWith('./') || specifier.startsWith('../') || specifier === '.' || specifier === '..') {
    const dir = importer.slice(0, importer.lastIndexOf('/'));
    return { kind: 'path', path: normalise(`${dir}/${specifier}`) };
  }
  if (specifier.startsWith('/')) return { kind: 'path', path: normalise(specifier) };
  const clean = specifier.split('?')[0]!;
  const parts = clean.split('/');
  const name = clean.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
  return { kind: 'package', name };
}

/** `gym` for `/src/modules/gym/...`, otherwise `null`. */
function moduleOf(path: string): string | null {
  const segments = path.split('/').filter(Boolean);
  return segments[0] === 'src' && segments[1] === 'modules' && segments[2] !== undefined ? segments[2] : null;
}

function isUnder(path: string, dir: string): boolean {
  return path.startsWith(`${dir}/`);
}

/** Directory segments of a path (the file name is excluded). */
function directorySegments(path: string): string[] {
  const segments = path.split('/').filter(Boolean);
  return segments.slice(0, -1);
}

/** Applies the three dependency rules to `files` (root-relative path → source text). */
export function findImportViolations(files: Record<string, string>): ImportViolation[] {
  const violations: ImportViolation[] = [];
  for (const [file, text] of Object.entries(files)) {
    const importerModule = moduleOf(file);
    const isAppSource = importerModule === null && isUnder(file, '/src') && !isUnder(file, '/src/test');
    const isLogic = directorySegments(file).includes('logic');
    for (const specifier of collectSpecifiers(file, text)) {
      const target = resolveSpecifier(file, specifier);
      if (target.kind === 'path') {
        const targetModule = moduleOf(target.path);
        if (isAppSource && targetModule !== null && file !== MODULE_REGISTRY_FILE) {
          violations.push({ rule: 'core-imports-module', file, specifier });
        }
        if (importerModule !== null && targetModule !== null && targetModule !== importerModule) {
          violations.push({ rule: 'module-imports-module', file, specifier });
        }
        if (isLogic) {
          // The last segment is checked too: `../db` may be a directory imported through its index.
          const segments = target.path.split('/').filter(Boolean);
          if (segments.some((s) => FORBIDDEN_LOGIC_SEGMENTS.includes(s))) {
            violations.push({ rule: 'logic-imports-io', file, specifier });
          }
        }
      } else if (isLogic && FORBIDDEN_LOGIC_PACKAGES.includes(target.name)) {
        violations.push({ rule: 'logic-imports-io', file, specifier });
      }
    }
  }
  return violations;
}

const sources = import.meta.glob<string>('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });

describe('architecture import scan', () => {
  // `import.meta.glob` never matches the file that calls it, so this file is the only one not scanned;
  // it imports only vitest and typescript.
  it('finds the source files', () => {
    const files = Object.keys(sources);
    for (const file of [MODULE_REGISTRY_FILE, '/src/main.tsx', '/src/modules/gym/index.ts', '/src/test/numruns.test.ts']) {
      expect(files).toContain(file);
    }
  });

  it('src/ follows every dependency rule', () => {
    expect(findImportViolations(sources)).toEqual([]);
  });
});

describe('architecture import scan self-tests', () => {
  it('collects every kind of import specifier and ignores strings and comments', () => {
    const text = [
      "import a from './a';",
      "import type { B } from '../b';",
      "export { c } from './c';",
      "export * from './d';",
      "import './side-effect';",
      "import e = require('./e');",
      "const f = () => import('./f');",
      "type G = import('./g').G;",
      "const s = \"import x from './not-an-import'\";",
      "// import y from './comment'",
    ].join('\n');
    expect(collectSpecifiers('/src/x.ts', text)).toEqual(['./a', '../b', './c', './d', './side-effect', './e', './f', './g']);
  });

  it('resolves relative, root-relative and package specifiers', () => {
    expect(resolveSpecifier('/src/core/backup/export.ts', '../registry/modules')).toEqual({ kind: 'path', path: '/src/core/registry/modules' });
    expect(resolveSpecifier('/src/core/a.ts', '/src/modules/gym')).toEqual({ kind: 'path', path: '/src/modules/gym' });
    expect(resolveSpecifier('/src/core/a.ts', 'react-dom/client')).toEqual({ kind: 'package', name: 'react-dom' });
    expect(resolveSpecifier('/src/core/a.ts', '@zxing/browser')).toEqual({ kind: 'package', name: '@zxing/browser' });
  });

  it('rule 1: core, app, ui and root files may not import module code, except the Module_Registry', () => {
    const files = {
      '/src/core/backup/export.ts': "import { gymModule } from '../../modules/gym';",
      '/src/app/router.tsx': "import type { X } from '../modules/chess/types';",
      '/src/ui/sheet/Sheet.tsx': "const m = () => import('../../modules/nutrition/ui/Today');",
      '/src/main.tsx': "import './modules/gym';",
      [MODULE_REGISTRY_FILE]: "import { gymModule } from '../../modules/gym';",
      '/src/core/backup/ok.ts': "import { MODULES } from '../registry/modules';",
      '/src/test/arbitraries/gym.ts': "import type { Session } from '../../modules/gym/types';",
    };
    expect(findImportViolations(files)).toEqual([
      { rule: 'core-imports-module', file: '/src/core/backup/export.ts', specifier: '../../modules/gym' },
      { rule: 'core-imports-module', file: '/src/app/router.tsx', specifier: '../modules/chess/types' },
      { rule: 'core-imports-module', file: '/src/ui/sheet/Sheet.tsx', specifier: '../../modules/nutrition/ui/Today' },
      { rule: 'core-imports-module', file: '/src/main.tsx', specifier: './modules/gym' },
    ]);
  });

  it('rule 2: a module may not import another module', () => {
    const files = {
      '/src/modules/nutrition/logic/energy.ts': "import type { Session } from '../../gym/types';",
      '/src/modules/chess/index.ts': "export { x } from '../gym';",
      '/src/modules/gym/index.ts': "import { gymTables } from './tables'; import { MODULES } from '../../core/registry/modules';",
    };
    expect(findImportViolations(files)).toEqual([
      { rule: 'module-imports-module', file: '/src/modules/nutrition/logic/energy.ts', specifier: '../../gym/types' },
      { rule: 'module-imports-module', file: '/src/modules/chess/index.ts', specifier: '../gym' },
    ]);
  });

  it('rule 3: logic files may not import dexie, react, react-dom or I/O paths', () => {
    const forbidden = [
      'dexie',
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      'dexie-react-hooks',
      '../data/exerciseRepo',
      '../ui/Screen',
      '../../../app/router',
      '../net/client',
      '../engine/stockfish',
      '../../../core/db/db',
      '../../../core/db',
    ];
    const violations = findImportViolations(
      Object.fromEntries(forbidden.map((spec, i) => [`/src/modules/gym/logic/f${i}.ts`, `import x from '${spec}';`])),
    );
    expect(violations.map((v) => v.specifier)).toEqual(forbidden);
    expect(violations.every((v) => v.rule === 'logic-imports-io')).toBe(true);

    const allowed = [
      './e1rm',
      '../constants',
      '../../../core/math/round',
      '../../../core/time/localDate',
      '../../../core/text/fold',
      'chess.js',
    ];
    expect(findImportViolations({ '/src/modules/gym/logic/volume.ts': allowed.map((s) => `import x from '${s}';`).join('\n') })).toEqual([]);
  });

  it('rule 3 applies to logic folders anywhere, including core', () => {
    expect(findImportViolations({ '/src/core/command/logic/ranking.ts': "import { useState } from 'react';" })).toEqual([
      { rule: 'logic-imports-io', file: '/src/core/command/logic/ranking.ts', specifier: 'react' },
    ]);
    expect(findImportViolations({ '/src/core/command/recents.ts': "import { db } from '../db/db';" })).toEqual([]);
  });
});
