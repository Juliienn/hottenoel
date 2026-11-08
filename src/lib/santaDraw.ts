// Tirage au sort Secret Santa : une permutation des participants où personne
// ne se tire soi-même et où aucune exclusion (donneur → receveur) n'est violée.
import { randomInt } from "node:crypto";

export type DrawFailure =
  | { kind: "too_few"; min: number }
  | { kind: "no_receiver"; givers: string[] }
  | { kind: "no_giver"; receivers: string[] }
  | { kind: "blocked_group"; givers: string[]; receivers: string[] };

export type DrawResult = { ok: true; pairs: Map<string, string> } | { ok: false; failure: DrawFailure };

export const MIN_PARTICIPANTS = 3;

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function draw(participants: string[], exclusions: Array<[string, string]>): DrawResult {
  const people = [...new Set(participants)];
  if (people.length < MIN_PARTICIPANTS) return { ok: false, failure: { kind: "too_few", min: MIN_PARTICIPANTS } };

  const banned = new Set(exclusions.map(([g, r]) => `${g}\u0000${r}`));
  const allowed = (g: string, r: string) => g !== r && !banned.has(`${g}\u0000${r}`);
  const options = new Map(people.map((g) => [g, people.filter((r) => allowed(g, r))]));

  // 1. Diagnostics simples, les plus parlants pour l'Hôte.
  const noReceiver = people.filter((g) => options.get(g)!.length === 0);
  if (noReceiver.length) return { ok: false, failure: { kind: "no_receiver", givers: noReceiver } };
  const noGiver = people.filter((r) => !people.some((g) => allowed(g, r)));
  if (noGiver.length) return { ok: false, failure: { kind: "no_giver", receivers: noGiver } };

  // 2. Existence d'une solution = couplage parfait dans le graphe biparti
  //    donneurs → receveurs (algorithme de Kuhn). S'il n'y en a pas, le
  //    théorème de Hall donne un groupe de donneurs qui n'ont, ensemble, pas
  //    assez de receveurs possibles : c'est ce qu'on montre à l'Hôte.
  const matching = maxMatching(people, (g) => options.get(g)!);
  if (matching.size < people.length) {
    const unmatched = people.find((g) => !matching.has(g))!;
    const { givers, receivers } = hallViolator(unmatched, options, matching);
    return { ok: false, failure: { kind: "blocked_group", givers, receivers } };
  }

  // 3. Tirage uniforme parmi toutes les solutions valides : permutations
  //    aléatoires rejetées tant qu'elles violent une règle. Avec une famille
  //    (quelques dizaines de personnes au plus), une permutation sur ~3 est
  //    valide sans exclusion ; la limite ne sert qu'aux cas très contraints.
  for (let attempt = 0; attempt < 200_000; attempt++) {
    const receivers = shuffle(people);
    if (people.every((g, i) => allowed(g, receivers[i]))) {
      return { ok: true, pairs: new Map(people.map((g, i) => [g, receivers[i]])) };
    }
  }
  // Repli (cas très contraints) : couplage sur un ordre et des listes mélangés.
  // Toujours valide, mais pas strictement uniforme.
  const fallback = maxMatching(shuffle(people), (g) => shuffle(options.get(g)!));
  return { ok: true, pairs: fallback };
}

/** Couplage maximal donneur → receveur. */
function maxMatching(givers: string[], neighbors: (g: string) => string[]): Map<string, string> {
  const receiverOf = new Map<string, string>(); // receveur → donneur
  const adj = new Map(givers.map((g) => [g, neighbors(g)]));
  const tryAssign = (g: string, seen: Set<string>): boolean => {
    for (const r of adj.get(g)!) {
      if (seen.has(r)) continue;
      seen.add(r);
      const current = receiverOf.get(r);
      if (current === undefined || tryAssign(current, seen)) {
        receiverOf.set(r, g);
        return true;
      }
    }
    return false;
  };
  for (const g of givers) tryAssign(g, new Set());
  return new Map([...receiverOf].map(([r, g]) => [g, r]));
}

/** Depuis un donneur non couplé, les chemins alternés atteignent un ensemble
 * de donneurs S dont les receveurs possibles N(S) sont moins nombreux. */
function hallViolator(start: string, options: Map<string, string[]>, matching: Map<string, string>) {
  const giverOfReceiver = new Map([...matching].map(([g, r]) => [r, g]));
  const givers = new Set([start]);
  const receivers = new Set<string>();
  const queue = [start];
  while (queue.length) {
    const g = queue.shift()!;
    for (const r of options.get(g)!) {
      if (receivers.has(r)) continue;
      receivers.add(r);
      const next = giverOfReceiver.get(r);
      if (next && !givers.has(next)) { givers.add(next); queue.push(next); }
    }
  }
  return { givers: [...givers], receivers: [...receivers] };
}

/** Vérifie qu'un résultat respecte toutes les règles (utilisé par les tests
 * et, par prudence, avant l'enregistrement en base). */
export function isValidDraw(participants: string[], exclusions: Array<[string, string]>, pairs: Map<string, string>): boolean {
  const banned = new Set(exclusions.map(([g, r]) => `${g}\u0000${r}`));
  if (pairs.size !== participants.length) return false;
  const received = new Set<string>();
  for (const g of participants) {
    const r = pairs.get(g);
    if (!r || r === g || !participants.includes(r) || banned.has(`${g}\u0000${r}`) || received.has(r)) return false;
    received.add(r);
  }
  return true;
}
