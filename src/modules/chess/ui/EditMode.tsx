import { useEffect, useMemo, useState } from 'react';
import { newId } from '../../../core/ids';
import { TextField } from '../../../ui/form/TextField';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { Sheet } from '../../../ui/sheet/Sheet';
import { toast } from '../../../ui/toast/toastStore';
import { OPENING } from '../constants';
import type { MoveInput } from '../logic/board';
import { addMove, checkExplanation, checkTreeName, deleteBranch, indexTree, linesOf, positionKey, replaceExpected, setExplanation } from '../logic/repertoire';
import type { RepertoireTree } from '../types';
import { BoardView } from './BoardView';
import { arrowOf, orientationOf, turnOf, uciOf } from './openingsShared';

export interface Conflict {
  uci: string;
  existing: string;
  treeNames: string[];
  removedCount: number;
}

export interface EditModeProps {
  tree: RepertoireTree;
  trees: readonly RepertoireTree[];
  /** Stores the new set of trees; resolves false when the write failed. The label shows an Undo_Toast (R64). */
  commit(next: RepertoireTree[], undoLabel?: string): Promise<boolean>;
  onExit(): void;
}

/** Edit mode: add or replace moves by playing them on the board, delete branches, edit notes and the tree (R51.3 to R51.8). */
export function EditMode({ tree, trees, commit, onExit }: EditModeProps) {
  const idx = useMemo(() => indexTree(tree), [tree]);
  const lines = useMemo(() => linesOf(tree), [tree]);
  const [at, setAt] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const selected = at === null ? undefined : idx.byId.get(at);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | undefined>(undefined);
  const [name, setName] = useState(tree.name);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const position = idx.fen.has(at) ? at : null;
  const fen = idx.fen.get(position) as string;

  useEffect(() => {
    setNote(selected?.explanation ?? '');
    setNoteError(undefined);
  }, [selected?.id, selected?.explanation]);

  const replaceTree = (next: RepertoireTree): RepertoireTree[] => trees.map((t) => (t.id === next.id ? next : t));
  const childOf = (all: readonly RepertoireTree[], parentId: string | null, uci: string): string | undefined =>
    all.find((t) => t.id === tree.id)?.nodes.find((n) => n.parentId === parentId && n.uci === uci)?.id;

  const onMove = async (m: MoveInput): Promise<void> => {
    const uci = uciOf(m);
    const result = addMove(trees, tree.id, position, uci, newId);
    if (result.kind === 'illegal') {
      toast.show({ message: 'That move is not legal here.', kind: 'error' });
    } else if (result.kind === 'exists') {
      setAt(childOf(trees, position, uci) ?? position);
    } else if (result.kind === 'conflict') {
      setConflict({ uci, existing: result.existing, treeNames: result.treeNames, removedCount: result.removedCount });
    } else if (await commit(result.trees)) {
      setAt(childOf(result.trees, position, uci) ?? position);
    }
  };

  const confirmReplace = async (): Promise<void> => {
    if (conflict === null) return;
    const { uci } = conflict;
    setConflict(null);
    const next = replaceExpected(trees, tree.colour, positionKey(fen, tree.colour), uci, newId, { treeId: tree.id, parentId: position });
    if (await commit(next, 'Move replaced')) setAt(childOf(next, position, uci) ?? position);
  };

  const removeBranch = async (): Promise<void> => {
    if (selected === undefined) return;
    if (await commit(replaceTree(deleteBranch(tree, selected.id)), 'Branch deleted')) setAt(selected.parentId);
  };

  const saveNote = async (): Promise<void> => {
    if (selected === undefined) return;
    const checked = checkExplanation(note);
    if (!checked.ok) {
      setNoteError(checked.error);
      return;
    }
    setNoteError(undefined);
    await commit(replaceTree(setExplanation(tree, selected.id, note)));
  };

  const rename = async (): Promise<void> => {
    const checked = checkTreeName(name);
    if (!checked.ok) {
      setNameError(checked.error);
      return;
    }
    setNameError(undefined);
    await commit(replaceTree({ ...tree, name: checked.value }));
  };

  const removeTree = async (): Promise<void> => {
    if (await commit(trees.filter((t) => t.id !== tree.id), 'Tree deleted')) onExit();
  };

  return (
    <CardFrame aria-label="Edit tree" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Edit: {tree.name}</h2>
      <p className="text-sm text-muted">Play a move on the board to add it after the selected move.</p>
      <BoardView
        fen={fen}
        orientation={orientationOf(tree)}
        movable={turnOf(fen)}
        onMove={(m) => void onMove(m)}
        lastMove={selected ? arrowOf(selected.uci) : undefined}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" aria-pressed={position === null} onClick={() => setAt(null)}>
          Start position
        </Button>
        <Button variant="danger" disabled={selected === undefined} onClick={() => void removeBranch()}>
          Delete branch
        </Button>
      </div>
      <ol aria-label="Lines" className="flex flex-col gap-2">
        {lines.map((line, i) => (
          <li key={line[line.length - 1]?.id ?? i} className="flex flex-wrap gap-1">
            {line.map((n, ply) => (
              <button
                key={n.id}
                type="button"
                aria-pressed={n.id === position}
                aria-label={`${ply % 2 === 0 ? `${ply / 2 + 1}. ` : `${(ply + 1) / 2}... `}${n.san}`}
                className={`tap rounded-continuous px-2 text-sm ${n.id === position ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg'}`}
                onClick={() => setAt(n.id)}
              >
                {n.san}
              </button>
            ))}
          </li>
        ))}
      </ol>
      {selected ? (
        <div className="flex flex-col gap-2">
          <TextField label="Explanation" value={note} onChange={setNote} error={noteError} placeholder={`Up to ${OPENING.EXPLANATION_MAX} characters`} />
          <Button variant="secondary" onClick={() => void saveNote()}>
            Save explanation
          </Button>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <TextField label="Tree name" value={name} onChange={setName} error={nameError} />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void rename()}>
            Rename tree
          </Button>
          <Button variant="danger" onClick={() => void removeTree()}>
            Delete tree
          </Button>
          <Button variant="ghost" onClick={onExit}>
            Back
          </Button>
        </div>
      </div>
      <Sheet open={conflict !== null} onRequestClose={() => setConflict(null)} title="Replace the expected move?">
        {conflict ? (
          <div className="flex flex-col gap-3 pb-4">
            <p>
              This position already expects <strong>{conflict.existing}</strong>.
            </p>
            <p>Trees of this colour that contain it: {conflict.treeNames.join(', ')}.</p>
            <p data-testid="removed-count">
              {conflict.removedCount} {conflict.removedCount === 1 ? 'move' : 'moves'} will be removed.
            </p>
            <div className="flex gap-2">
              <Button variant="danger" onClick={() => void confirmReplace()}>
                Replace
              </Button>
              <Button variant="secondary" onClick={() => setConflict(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </Sheet>
    </CardFrame>
  );
}
