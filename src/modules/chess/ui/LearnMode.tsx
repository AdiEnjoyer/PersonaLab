import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { EmptyState } from '../../../ui/status/EmptyState';
import { OPENING } from '../constants';
import type { MoveInput } from '../logic/board';
import { indexTree, linesOf, playUci } from '../logic/repertoire';
import type { RepertoireTree } from '../types';
import { BoardView } from './BoardView';
import { arrowOf, isOwnerPly, orientationOf, uciOf } from './openingsShared';

export const NO_NOTE = 'No note for this move.';

/** Learn mode: steps through the lines of a tree, showing the idea of each move; changes no SRS state (R52.1). */
export function LearnMode({ tree, onExit }: { tree: RepertoireTree; onExit(): void }) {
  const idx = useMemo(() => indexTree(tree), [tree]);
  const lines = useMemo(() => linesOf(tree), [tree]);
  const [lineNo, setLineNo] = useState(0);
  const [ply, setPly] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const line = lines[lineNo];
  const next = line?.[ply];
  const ownerTurn = next !== undefined && isOwnerPly(tree, ply);

  useEffect(() => {
    if (next === undefined || ownerTurn) return;
    const t = setTimeout(() => setPly((p) => p + 1), OPENING.OPPONENT_DELAY_MS);
    return () => clearTimeout(t);
  }, [next, ownerTurn, ply, lineNo]);

  useEffect(() => {
    if (preview === null) return;
    const t = setTimeout(() => setPreview(null), OPENING.REVERT_MS);
    return () => clearTimeout(t);
  }, [preview]);

  if (line === undefined) {
    return (
      <CardFrame aria-label="Learn">
        <EmptyState title="This tree has no moves yet">Add moves to it in edit mode.</EmptyState>
        <Button variant="secondary" onClick={onExit}>
          Back
        </Button>
      </CardFrame>
    );
  }

  const shown = ply > 0 ? line[ply - 1] : undefined;
  const fen = idx.fen.get(shown?.id ?? null) as string;
  const goLine = (n: number): void => {
    setLineNo(n);
    setPly(0);
    setPreview(null);
  };
  const onMove = (m: MoveInput): void => {
    if (next === undefined || !ownerTurn) return;
    if (uciOf(m) === next.uci) {
      setPly(ply + 1);
      return;
    }
    const wrong = playUci(fen, uciOf(m));
    if (wrong !== null) setPreview(wrong.fen);
  };
  const done = next === undefined;

  return (
    <CardFrame aria-label="Learn" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Learn: {tree.name}</h2>
        <p className="text-sm text-muted" data-testid="learn-line">
          Line {lineNo + 1} of {lines.length}
        </p>
      </div>
      <BoardView
        fen={preview ?? fen}
        orientation={orientationOf(tree)}
        lastMove={shown ? arrowOf(shown.uci) : undefined}
        movable={ownerTurn ? tree.colour : undefined}
        onMove={onMove}
        arrow={ownerTurn && next ? arrowOf(next.uci) : undefined}
      />
      <p role="status" className="text-sm">
        {done ? 'Line complete' : ownerTurn ? 'Play the move shown by the arrow' : 'Opponent is moving…'}
      </p>
      <p className="text-sm" data-testid="learn-moves">
        {line
          .slice(0, ply)
          .map((n, i) => `${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${n.san}`)
          .join(' ')}
      </p>
      <p className="text-sm text-muted" data-testid="learn-note">
        {shown ? (shown.explanation ? `Idea: ${shown.explanation}` : NO_NOTE) : 'Ideas appear here as the line is played.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => goLine(lineNo)}>
          Restart line
        </Button>
        <Button variant="secondary" disabled={lineNo === 0} onClick={() => goLine(lineNo - 1)}>
          Previous line
        </Button>
        <Button disabled={lineNo >= lines.length - 1} onClick={() => goLine(lineNo + 1)}>
          Next line
        </Button>
        <Button variant="ghost" onClick={onExit}>
          Back
        </Button>
      </div>
    </CardFrame>
  );
}
