import { CardFrame } from '../../../ui/primitives/CardFrame';
import { EmptyState } from '../../../ui/status/EmptyState';

/** Placeholder for Chess screens that a later update replaces. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{title}</h1>
      <CardFrame>
        <EmptyState title="Coming in the next update" />
      </CardFrame>
    </section>
  );
}

export const PuzzlesScreen = () => <ComingSoon title="Puzzles" />;
export const OpeningsScreen = () => <ComingSoon title="Openings" />;
export const AnalysisScreen = () => <ComingSoon title="Analysis" />;
