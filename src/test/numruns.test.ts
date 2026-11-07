/**
 * Meta test for property tests (R74.3): every `*.property.test.ts` file must carry the tag comment
 * `// Feature: personal-lab, Property N: <title>` for the property named in its `p<N>` file name, and no
 * `numRuns` literal may be below 100.
 */
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

const MIN_NUM_RUNS = 100;
const TAG = /^[ \t]*\/\/ Feature: personal-lab, Property (\d+): \S.*$/m;
const FILE_NAME = /\.p(\d+)\.property\.test\.ts$/;

/** The values of every `numRuns: <numeric literal>` property assignment in the file. */
export function numRunsLiterals(fileName: string, text: string): number[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const values: number[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node)) {
      const name = node.name;
      const isNumRuns = (ts.isIdentifier(name) || ts.isStringLiteral(name)) && name.text === 'numRuns';
      if (isNumRuns) {
        let init: ts.Expression = node.initializer;
        while (ts.isParenthesizedExpression(init)) init = init.expression;
        if (ts.isNumericLiteral(init)) values.push(Number(init.text.replace(/_/g, '')));
        else if (ts.isPrefixUnaryExpression(init) && init.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(init.operand)) {
          values.push(-Number(init.operand.text.replace(/_/g, '')));
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return values;
}

/** Problems with one property test file; empty when it follows the rules. */
export function checkPropertyTestFile(fileName: string, text: string): string[] {
  const problems: string[] = [];
  const nameMatch = FILE_NAME.exec(fileName);
  const tagMatch = TAG.exec(text);
  if (nameMatch === null) problems.push(`${fileName}: file name does not follow <topic>.p<N>.property.test.ts`);
  if (tagMatch === null) {
    problems.push(`${fileName}: missing tag comment "// Feature: personal-lab, Property N: <title>"`);
  } else if (nameMatch !== null && nameMatch[1] !== tagMatch[1]) {
    problems.push(`${fileName}: tag names Property ${tagMatch[1]} but the file name names p${nameMatch[1]}`);
  }
  for (const value of numRunsLiterals(fileName, text)) {
    if (!(value >= MIN_NUM_RUNS)) problems.push(`${fileName}: numRuns ${value} is below ${MIN_NUM_RUNS}`);
  }
  return problems;
}

const propertyFiles = import.meta.glob<string>(
  ['/src/**/*.property.test.ts', '/scripts/**/*.property.test.ts', '/worker/**/*.property.test.ts'],
  { query: '?raw', import: 'default', eager: true },
);

describe('property test meta check', () => {
  it('finds the property test files', () => {
    expect(Object.keys(propertyFiles).length).toBeGreaterThan(0);
  });

  it('every property test is tagged and uses numRuns >= 100', () => {
    const problems = Object.entries(propertyFiles).flatMap(([file, text]) => checkPropertyTestFile(file, text));
    expect(problems).toEqual([]);
  });
});

describe('property test meta check self-tests', () => {
  const tag = '// Feature: personal-lab, Property 7: Key mask shows only the last four characters';
  const body = (numRuns: string) => `fc.assert(fc.property(fc.string(), () => true), { numRuns: ${numRuns} });`;

  it('accepts a tagged file with numRuns >= 100 or no numRuns', () => {
    expect(checkPropertyTestFile('/src/a/mask.p7.property.test.ts', `${tag}\n${body('100')}`)).toEqual([]);
    expect(checkPropertyTestFile('/src/a/mask.p7.property.test.ts', `  ${tag}\n${body('1_000')}`)).toEqual([]);
    expect(checkPropertyTestFile('/src/a/mask.p7.property.test.ts', `${tag}\nfc.assert(fc.property(fc.nat(), () => true));`)).toEqual([]);
  });

  it('rejects a numRuns literal below 100', () => {
    expect(checkPropertyTestFile('/src/a/mask.p7.property.test.ts', `${tag}\n${body('99')}`)).toEqual([
      '/src/a/mask.p7.property.test.ts: numRuns 99 is below 100',
    ]);
    expect(checkPropertyTestFile('/src/a/mask.p7.property.test.ts', `${tag}\nfc.configureGlobal({ 'numRuns': 10 });`)).toEqual([
      '/src/a/mask.p7.property.test.ts: numRuns 10 is below 100',
    ]);
    expect(checkPropertyTestFile('/src/a/mask.p7.property.test.ts', `${tag}\n${body('-1')}`)).toHaveLength(1);
  });

  it('rejects a missing or mismatched tag comment', () => {
    expect(checkPropertyTestFile('/src/a/mask.p7.property.test.ts', body('200'))).toEqual([
      '/src/a/mask.p7.property.test.ts: missing tag comment "// Feature: personal-lab, Property N: <title>"',
    ]);
    expect(checkPropertyTestFile('/src/a/mask.p7.property.test.ts', `// Feature: personal-lab, Property 7:\n${body('200')}`)).toHaveLength(1);
    expect(checkPropertyTestFile('/src/a/mask.p8.property.test.ts', `${tag}\n${body('200')}`)).toEqual([
      '/src/a/mask.p8.property.test.ts: tag names Property 7 but the file name names p8',
    ]);
  });

  it('ignores numRuns inside strings and comments', () => {
    expect(checkPropertyTestFile('/src/a/mask.p7.property.test.ts', `${tag}\n// { numRuns: 5 }\nconst s = '{ numRuns: 5 }';`)).toEqual([]);
  });
});
