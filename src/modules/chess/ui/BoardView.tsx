import { Chess } from 'chess.js';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Chessboard } from 'react-chessboard';
import { Button } from '../../../ui/primitives/Button';
import { isPromotion, legalTargets, type MoveInput } from '../logic/board';

export interface BoardViewProps {
  fen: string;
  orientation: 'white' | 'black';
  lastMove?: { from: string; to: string } | undefined;
  /** Side the Owner may move on this screen; omit for a read-only board (R42.2). */
  movable?: 'w' | 'b' | undefined;
  /** Called with legal moves only (a promotion carries its piece). */
  onMove?: ((move: MoveInput) => void) | undefined;
  /** Squares to colour: a hint origin or a wrong move (puzzles). */
  marks?: ReadonlyArray<{ square: string; kind: 'hint' | 'wrong' }> | undefined;
  /** Arrow shown as a second-level hint. */
  arrow?: { from: string; to: string } | undefined;
}

const LAST_MOVE_STYLE: CSSProperties = { backgroundColor: 'rgba(255, 213, 0, 0.45)' };
const HINT_STYLE: CSSProperties = { backgroundColor: 'rgba(40, 180, 90, 0.55)' };
const WRONG_STYLE: CSSProperties = { backgroundColor: 'rgba(230, 50, 50, 0.6)' };
const SELECTED_STYLE: CSSProperties = { backgroundColor: 'rgba(20, 130, 255, 0.5)' };
const TARGET_STYLE: CSSProperties = { background: 'radial-gradient(circle, rgba(20, 130, 255, 0.55) 22%, transparent 24%)' };
const PROMOTIONS = [
  { piece: 'q', label: 'Queen' },
  { piece: 'r', label: 'Rook' },
  { piece: 'b', label: 'Bishop' },
  { piece: 'n', label: 'Knight' },
] as const;

/** Largest whole-pixel square that fits the container width and the viewport height (R42.6). */
function useBoardSize(containerRef: React.RefObject<HTMLDivElement | null>): number {
  const [size, setSize] = useState(320);
  useEffect(() => {
    const measure = () => {
      const width = containerRef.current?.clientWidth || 320;
      const height = Math.max(160, window.innerHeight - 280);
      // A multiple of 8 so that all 8 cells have the same whole-pixel side.
      setSize(Math.max(160, Math.floor(Math.min(width, height) / 8) * 8));
    };
    measure();
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    if (containerRef.current) observer?.observe(containerRef.current);
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [containerRef]);
  return size;
}

/**
 * Chessboard with drag and tap-tap moves, legal-target hints, last-move highlight and a promotion picker
 * (R42.1 to R42.6). The squares are exempt from the 44 px touch rule.
 */
export function BoardView({ fen, orientation, lastMove, movable, onMove, marks, arrow }: BoardViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const size = useBoardSize(containerRef);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<{ from: string; to: string } | null>(null);
  const chess = useMemo(() => new Chess(fen), [fen]);
  const interactive = movable !== undefined && movable === chess.turn() && onMove !== undefined;

  useEffect(() => {
    setSelected(null);
    setPending(null);
  }, [fen]);

  useEffect(() => {
    if (pending === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPending(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  const targets = useMemo(() => (selected !== null && interactive ? legalTargets(fen, selected) : []), [fen, selected, interactive]);

  const attempt = (from: string, to: string): boolean => {
    if (!interactive || !legalTargets(fen, from).includes(to)) return false;
    if (isPromotion(fen, from, to)) {
      setPending({ from, to });
      setSelected(null);
      return false;
    }
    setSelected(null);
    onMove({ from, to });
    return true;
  };

  const ownPiece = (type: string | undefined): boolean => type !== undefined && type[0] === movable;

  const squareStyles: Record<string, CSSProperties> = {};
  if (lastMove) {
    squareStyles[lastMove.from] = LAST_MOVE_STYLE;
    squareStyles[lastMove.to] = LAST_MOVE_STYLE;
  }
  for (const m of marks ?? []) squareStyles[m.square] = m.kind === 'hint' ? HINT_STYLE : WRONG_STYLE;
  if (selected !== null) squareStyles[selected] = SELECTED_STYLE;
  for (const t of targets) squareStyles[t] = { ...squareStyles[t], ...TARGET_STYLE };

  return (
    <div ref={containerRef} className="flex w-full flex-col items-center gap-2">
      <div style={{ width: size, height: size }} data-testid="chessboard" data-gesture="board">
        <Chessboard
          options={{
            position: fen,
            boardOrientation: orientation,
            allowDragging: interactive,
            squareStyles,
            arrows: arrow ? [{ startSquare: arrow.from, endSquare: arrow.to, color: 'rgb(40, 180, 90)' }] : [],
            showAnimations: true,
            animationDurationInMs: 150,
            canDragPiece: ({ piece }) => interactive && ownPiece(piece.pieceType),
            onPieceDrag: ({ square }) => {
              if (interactive && square !== null) setSelected(square);
            },
            onPieceDrop: ({ sourceSquare, targetSquare }) => {
              if (targetSquare === null) {
                setSelected(null);
                return false;
              }
              const accepted = attempt(sourceSquare, targetSquare);
              if (!accepted) setSelected(null);
              return accepted;
            },
            onSquareClick: ({ piece, square }) => {
              if (!interactive) return;
              if (selected === square) setSelected(null);
              else if (selected !== null && targets.includes(square)) attempt(selected, square);
              else if (ownPiece(piece?.pieceType)) setSelected(square);
              else setSelected(null);
            },
          }}
        />
      </div>
      {pending !== null ? (
        <div role="group" aria-label="Promote to" className="flex flex-wrap items-center gap-2">
          {PROMOTIONS.map(({ piece, label }) => (
            <Button
              key={piece}
              variant="secondary"
              onClick={() => {
                const move = { ...pending, promotion: piece };
                setPending(null);
                onMove?.(move);
              }}
            >
              {label}
            </Button>
          ))}
          <Button variant="ghost" onClick={() => setPending(null)}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}
