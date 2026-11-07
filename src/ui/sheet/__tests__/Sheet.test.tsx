import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sheet } from '../Sheet';

/** A slow drag: 1 s between events, so only the distance decides (velocity ~0.1 px/ms). */
function dragPanel(panel: HTMLElement, fromY: number, toY: number) {
  let clock = 0;
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => (clock += 1000));
  fireEvent.pointerDown(panel, { clientY: fromY, pointerId: 1 });
  fireEvent.pointerMove(panel, { clientY: toY, pointerId: 1 });
  fireEvent.pointerUp(panel, { clientY: toY, pointerId: 1 });
  spy.mockRestore();
}

function mockHeight(panel: HTMLElement, height: number) {
  panel.getBoundingClientRect = () => ({ height, width: 300, top: 0, left: 0, right: 300, bottom: height, x: 0, y: 0, toJSON: () => ({}) });
}

describe('Sheet', () => {
  it('closes on a backdrop tap and on Escape', () => {
    const onRequestClose = vi.fn();
    render(
      <Sheet open onRequestClose={onRequestClose} title="Test">
        <p>Body</p>
      </Sheet>,
    );
    fireEvent.click(screen.getByTestId('sheet-backdrop'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onRequestClose).toHaveBeenCalledTimes(2);
  });

  it('dismisses after a swipe down past a quarter of its height and snaps back below it', () => {
    const onRequestClose = vi.fn();
    render(
      <Sheet open onRequestClose={onRequestClose}>
        <p>Body</p>
      </Sheet>,
    );
    const panel = screen.getByRole('dialog');
    mockHeight(panel, 400);
    dragPanel(panel, 0, 80); // 20 % of 400: stays open (slow drag, no velocity in one frame)
    expect(onRequestClose).not.toHaveBeenCalled();
    expect(panel.style.transform).toBe('translateY(0px)');
    dragPanel(panel, 0, 150); // 37.5 %
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it('asks before discarding a dirty sheet', () => {
    const onRequestClose = vi.fn();
    render(
      <Sheet open dirty onRequestClose={onRequestClose}>
        <p>Body</p>
      </Sheet>,
    );
    fireEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(onRequestClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByText('Discard changes?', { selector: 'p' })).toBeNull();
    fireEvent.click(screen.getByTestId('sheet-backdrop'));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });
});
