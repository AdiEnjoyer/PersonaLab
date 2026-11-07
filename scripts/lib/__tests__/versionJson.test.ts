import { describe, expect, it, vi } from 'vitest';
import { versionJsonContent, versionJsonPlugin } from '../versionJson';

describe('version.json plugin', () => {
  it('emits {"version": ...} as an asset', () => {
    expect(versionJsonContent('1.0.0+abc')).toBe('{"version":"1.0.0+abc"}');
    const emitFile = vi.fn();
    const plugin = versionJsonPlugin('1.0.0+abc');
    (plugin.generateBundle as unknown as (this: { emitFile: typeof emitFile }) => void).call({ emitFile });
    expect(emitFile).toHaveBeenCalledWith({ type: 'asset', fileName: 'version.json', source: '{"version":"1.0.0+abc"}' });
  });
});