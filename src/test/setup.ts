import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import fc from 'fast-check';

fc.configureGlobal({ numRuns: 100 });

afterEach(() => {
  cleanup();
});
