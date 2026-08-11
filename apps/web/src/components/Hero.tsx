import type { Money } from '@varve/core';
import { money, percent } from '../lib/format.js';

/**
 * The one number the view leads with.
 *
 * A probability rather than a balance, because a probability is both the honest
 * answer and the more useful one. "You will have $3.5M" is a claim nobody can
 * make; "four times in five you clear $2M" is something a person can act on, and
 * it carries its own uncertainty in the sentence.
 */
export function Hero({
  chance,
  target,
  targetYear,
  median,
}: {
  chance: number;
  target: Money;
  targetYear: number;
  median: Money;
}) {
  return (
    <section className="hero">
      <p className="hero-lead">Chance of reaching {money(target)} by {targetYear}</p>
      <p className="hero-figure">{percent(chance, 0)}</p>
      <p className="hero-detail">
        The middle outcome lands near <strong>{money(median)}</strong>. {readAsWords(chance)}
      </p>
    </section>
  );
}

/**
 * The same figure again, in words.
 *
 * Percentages are precise and slippery — plenty of people read 70% as "probably
 * fine" and 45% as "probably fine" too. A frequency out of ten is much harder to
 * misread, and it is the phrasing that risk research consistently finds lands
 * best with non-specialists.
 */
function readAsWords(chance: number): string {
  const outOfTen = Math.round(chance * 10);
  if (outOfTen >= 10) return 'Effectively every simulated run got there.';
  if (outOfTen <= 0) return 'Almost no simulated run got there.';
  return `About ${outOfTen} in 10 simulated runs got there.`;
}
