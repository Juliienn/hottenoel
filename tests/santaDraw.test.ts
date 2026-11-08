import { test } from "node:test";
import assert from "node:assert/strict";
import { draw, isValidDraw } from "../src/lib/santaDraw";

const people = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

/** Existe-t-il au moins une attribution valide ? (force brute, petits n) */
function bruteForceFeasible(ps: string[], ex: Array<[string, string]>): boolean {
  const banned = new Set(ex.map(([g, r]) => g + ">" + r));
  const used = new Set<string>();
  const rec = (i: number): boolean => {
    if (i === ps.length) return true;
    for (const r of ps) {
      if (used.has(r) || r === ps[i] || banned.has(ps[i] + ">" + r)) continue;
      used.add(r);
      if (rec(i + 1)) return true;
      used.delete(r);
    }
    return false;
  };
  return rec(0);
}

test("sans exclusion : chacun offre et reçoit exactement une fois, jamais à soi-même", () => {
  for (let n = 3; n <= 25; n++) {
    for (let k = 0; k < 20; k++) {
      const ps = people(n);
      const r = draw(ps, []);
      assert.ok(r.ok);
      assert.ok(isValidDraw(ps, [], r.pairs));
      for (const [g, rcv] of r.pairs) assert.notEqual(g, rcv);
      assert.equal(new Set(r.pairs.values()).size, n);
    }
  }
});

test("les exclusions sont toujours respectées", () => {
  const ps = ["Tom", "Sam", "Julie", "Thomas", "Léa", "Paul"];
  const ex: Array<[string, string]> = [["Tom", "Sam"], ["Julie", "Thomas"], ["Sam", "Tom"], ["Léa", "Paul"]];
  for (let k = 0; k < 2000; k++) {
    const r = draw(ps, ex);
    assert.ok(r.ok);
    assert.notEqual(r.pairs.get("Tom"), "Sam");
    assert.notEqual(r.pairs.get("Sam"), "Tom");
    assert.notEqual(r.pairs.get("Julie"), "Thomas");
    assert.notEqual(r.pairs.get("Léa"), "Paul");
    assert.ok(isValidDraw(ps, ex, r.pairs));
  }
});

test("moins de 3 participants : refusé", () => {
  const r = draw(["a", "b"], []);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.failure.kind, "too_few");
});

test("un participant qui ne peut offrir à personne est signalé", () => {
  const r = draw(["a", "b", "c"], [["a", "b"], ["a", "c"]]);
  assert.ok(!r.ok && r.failure.kind === "no_receiver" && r.failure.givers.includes("a"));
});

test("un participant à qui personne ne peut offrir est signalé", () => {
  const r = draw(["a", "b", "c"], [["b", "a"], ["c", "a"]]);
  assert.ok(!r.ok && r.failure.kind === "no_giver" && r.failure.receivers.includes("a"));
});

test("blocage de groupe (Hall) : deux personnes ne peuvent offrir qu'à la même", () => {
  // a et b ne peuvent offrir qu'à c.
  const r = draw(["a", "b", "c", "d"], [["a", "b"], ["a", "d"], ["b", "a"], ["b", "d"]]);
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.failure.kind === "blocked_group");
  if (!r.ok && r.failure.kind === "blocked_group") {
    assert.ok(r.failure.givers.length > r.failure.receivers.length);
    assert.deepEqual(new Set(r.failure.receivers), new Set(["c"]));
  }
});

test("détection d'impossibilité identique à la force brute (2 000 cas aléatoires)", () => {
  let impossible = 0;
  for (let k = 0; k < 2000; k++) {
    const n = 3 + Math.floor(Math.random() * 4);
    const ps = people(n);
    const ex: Array<[string, string]> = [];
    for (const g of ps) for (const r of ps) if (g !== r && Math.random() < 0.45) ex.push([g, r]);
    const r = draw(ps, ex);
    const feasible = bruteForceFeasible(ps, ex);
    assert.equal(r.ok, feasible, `n=${n} exclusions=${JSON.stringify(ex)}`);
    if (r.ok) assert.ok(isValidDraw(ps, ex, r.pairs));
    else impossible++;
  }
  assert.ok(impossible > 50, "le jeu de test doit contenir des cas impossibles");
});

test("tirage équitable : les 9 attributions possibles à 4 personnes sortent aussi souvent", () => {
  const ps = people(4);
  const counts = new Map<string, number>();
  const N = 18_000;
  for (let k = 0; k < N; k++) {
    const r = draw(ps, []);
    assert.ok(r.ok);
    const key = ps.map((p) => r.pairs.get(p)).join(",");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  assert.equal(counts.size, 9);
  for (const c of counts.values()) assert.ok(Math.abs(c - N / 9) < N / 9 * 0.12, `écart trop grand : ${c}`);
});
