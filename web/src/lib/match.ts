import type { MatchDish, MatchVote } from './types';

/** Die aktuelle Runde = die zuletzt angelegte. */
export function currentRound(dishes: MatchDish[]): string | null {
  let latest: MatchDish | null = null;
  for (const d of dishes) if (!latest || d.created_at > latest.created_at) latest = d;
  return latest?.round_id ?? null;
}

export function roundDishes(dishes: MatchDish[], roundId: string | null): MatchDish[] {
  return dishes.filter((d) => d.round_id === roundId).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

/** Noch nicht bewertete Gerichte dieser Runde für eine Person. */
export function deckFor(dishes: MatchDish[], votes: MatchVote[], member: string): MatchDish[] {
  const voted = new Set(votes.filter((v) => v.member === member).map((v) => v.dish_id));
  return roundDishes(dishes, currentRound(dishes)).filter((d) => !voted.has(d.id));
}

/** Alle, die schon mitgewischt haben (über alle Runden). */
export function members(votes: MatchVote[]): string[] {
  return [...new Set(votes.map((v) => v.member))].sort();
}

/** Ein Match: mindestens zwei verschiedene Personen haben das Gericht gemocht. */
export function isMatch(dishId: string, votes: MatchVote[]): boolean {
  return new Set(votes.filter((v) => v.dish_id === dishId && v.liked).map((v) => v.member)).size >= 2;
}

/** Offene Matches (noch nicht eingeplant/verworfen), neueste zuerst. */
export function openMatches(dishes: MatchDish[], votes: MatchVote[]): MatchDish[] {
  return dishes
    .filter((d) => !d.done && isMatch(d.id, votes))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Fortschritt der anderen in der aktuellen Runde, z. B. { Sarah: 12 } von 20. */
export function othersProgress(dishes: MatchDish[], votes: MatchVote[], member: string): Record<string, number> {
  const ids = new Set(roundDishes(dishes, currentRound(dishes)).map((d) => d.id));
  const out: Record<string, number> = {};
  for (const v of votes) {
    if (v.member !== member && ids.has(v.dish_id)) out[v.member] = (out[v.member] ?? 0) + 1;
  }
  return out;
}
