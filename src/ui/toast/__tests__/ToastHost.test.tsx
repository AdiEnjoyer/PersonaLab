import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUndoService } from '../../../core/undo/undoService';
import { createToastStore } from '../toastStore';
import { ToastHost } from '../ToastHost';

afterEach(() => vi.useRealTimers());

describe('ToastHost undo flow', () => {
  it('runs the undo once, ignores a second tap and closes the toast', async () => {
    const undo = createUndoService();
    const run = vi.fn(async () => undefined);
    render(<ToastHost undo={undo} store={createToastStore()} />);
    act(() => undo.push({ label: 'Food entry deleted', undo: run }));
    const button = screen.getByRole('button', { name: 'Undo' });
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('undo-toast')).toBeNull();
  });

  it('shows "Could not undo" with the reason when the undo fails', async () => {
    const undo = createUndoService();
    render(<ToastHost undo={undo} store={createToastStore()} />);
    act(() => undo.push({ label: 'Deleted', undo: async () => Promise.reject(new Error('boom')) }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    });
    expect(screen.getByTestId('undo-failed')).toHaveTextContent(/^Could not undo: /);
  });

  it('disappears after 6 seconds', () => {
    vi.useFakeTimers();
    const undo = createUndoService();
    render(<ToastHost undo={undo} store={createToastStore()} />);
    act(() => undo.push({ label: 'Deleted', undo: async () => undefined }));
    expect(screen.getByTestId('undo-toast')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(screen.queryByTestId('undo-toast')).toBeNull();
  });

  it('finalises the action when the toast is swiped away', () => {
    const undo = createUndoService();
    const run = vi.fn(async () => undefined);
    render(<ToastHost undo={undo} store={createToastStore()} />);
    act(() => undo.push({ label: 'Deleted', undo: run }));
    const toast = screen.getByTestId('undo-toast');
    toast.getBoundingClientRect = () => ({ height: 50, width: 300, top: 0, left: 0, right: 300, bottom: 50, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(toast, { clientX: 200, pointerId: 1 });
    fireEvent.pointerMove(toast, { clientX: 20, pointerId: 1 });
    fireEvent.pointerUp(toast, { clientX: 20, pointerId: 1 });
    expect(undo.getState().status).toBe('idle');
    expect(run).not.toHaveBeenCalled();
  });
});
