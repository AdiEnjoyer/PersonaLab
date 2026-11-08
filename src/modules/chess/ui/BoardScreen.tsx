import { useId, useMemo, useState } from 'react';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { INITIAL_BOARD, loadBoardText, playMove, positionOf, redoMove, undoMove, type MoveInput } from '../logic/board';
import { BoardView } from './BoardView';

/** `/chess/board`: free board with undo, redo, reset, flip and FEN/PGN loading (R42). */
export default function BoardScreen() {
  const [state, setState] = useState(INITIAL_BOARD);
  const [flipped, setFlipped] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const inputId = useId();
  const chess = useMemo(() => positionOf(state), [state]);
  const last = state.moves[state.moves.length - 1];

  const onMove = (move: MoveInput) => {
    const next = playMove(state, move);
    if (next !== null) setState(next);
  };

  const load = () => {
    const result = loadBoardText(text);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(undefined);
    setState(result.state);
  };

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Board</h1>
      <BoardView
        fen={chess.fen()}
        orientation={flipped ? 'black' : 'white'}
        lastMove={last ? { from: last.from, to: last.to } : undefined}
        movable={chess.turn()}
        onMove={onMove}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={state.moves.length === 0} onClick={() => setState(undoMove(state))}>
          Undo
        </Button>
        <Button variant="secondary" disabled={state.redo.length === 0} onClick={() => setState(redoMove(state))}>
          Redo
        </Button>
        <Button variant="secondary" onClick={() => setState(INITIAL_BOARD)}>
          Reset
        </Button>
        <Button variant="secondary" onClick={() => setFlipped((f) => !f)}>
          Flip
        </Button>
      </div>
      <p className="text-sm text-muted">{chess.isGameOver() ? 'Game over.' : `${chess.turn() === 'w' ? 'White' : 'Black'} to move.`}</p>
      {state.moves.length > 0 ? (
        <p aria-label="Moves" className="text-sm tabular-nums">
          {state.moves.map((m, i) => `${i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ''}${m.san}`).join(' ')}
        </p>
      ) : null}
      <CardFrame className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-sm text-muted">
          FEN or PGN
        </label>
        <textarea
          id={inputId}
          value={text}
          rows={4}
          aria-invalid={error ? true : undefined}
          onChange={(e) => setText(e.target.value)}
          className="rounded-continuous border border-line bg-surface-2 p-3 font-mono text-sm text-fg"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div>
          <Button onClick={load}>Load</Button>
        </div>
      </CardFrame>
    </section>
  );
}
