// The Performance tab's rules (lib/performance-view.js): the address, filters, scopes, the plan, and that the
// figures it builds add up. The database is imitated by a small evaluator that follows game_performance()
// (migration 0022) line by line, so a wrong member or a double count shows up here.
// Run: node test/performance-view.test.mjs
import assert from "node:assert/strict";
import {
  BREAKDOWNS, NONE, UNKNOWN, advShare, assembleFocus, assembleList, buildPlan, cellFrom, chunkScopes, createScopes, dayCells,
  compactCount, defaultBreakdown, emptyCell, facetOptions, figures, isFiltered, labelOf, membersOf, niceTop, parseParams, passes, sceneKeys, toQuery, valuesOf, windowOf,
} from "../lib/performance-view.js";

const place = (id, scene, path = "obj") => ({ id, scene, path });
const item = (id, extra = {}) => ({
  id, externalId: `plc_${id}`, label: id, shared: false, enabled: true, folderId: null, tags: [], placeType: null, suggestedType: null,
  format: "16:9 landscape", places: [], ...extra,
});

const ctx = {
  folders: [{ id: "f-street", name: "Streets", enabled: true }, { id: "f-menu", name: "Menus", enabled: true }, { id: "f-off", name: "Old", enabled: false }],
  offScenes: new Set(),
};

const items = [
  item("billboard", { shared: true, folderId: "f-street", tags: ["premium", "wall"], places: [place("bb1", "Street"), place("bb2", "Crossroad"), place("bb3", "Arena")], suggestedType: "gameplay" }),
  item("poster", { folderId: "f-street", tags: ["wall"], places: [place("po1", "Street")], format: "3:4 portrait" }),
  item("sign", { folderId: "f-street", places: [place("si1", "Crossroad")], placeType: "gameplay" }),
  item("banner", { folderId: "f-menu", places: [place("ba1", "MainMenu")], placeType: "menu" }),
  item("tip", { places: [place("ti1", "Loading")], tags: ["hud"], format: null, placeType: "loading" }),
  item("lost", { places: [] }), // reported no place
  item("dead", { folderId: "f-off", enabled: false, places: [place("de1", "Arena")] }),
];
const removedIds = ["gone"];
const all = [...items.map((entry) => entry.id), ...removedIds];

// ---------------------------------------------------------------- views to count
// A seeded generator, so the data is the same on every run.
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const now = new Date("2026-10-12T10:00:00Z");
const win = windowOf(30, now);
assert.equal(win.from, "2026-09-13");
assert.equal(win.to, "2026-10-12");

const impressions = [];
const placeIdsOf = new Map(items.map((entry) => [entry.id, entry.places.map((p) => p.id)]));
const dayOf = (n) => new Date(Date.parse("2026-08-01T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
for (let n = 0; n < 4000; n += 1) {
  const placement = all[Math.floor(rnd() * all.length)];
  const spots = placeIdsOf.get(placement) ?? [];
  const known = spots.length > 0 && rnd() < 0.8; // some views carry no place (older SDK)
  impressions.push({
    id: n,
    placement,
    place: known ? spots[Math.floor(rnd() * spots.length)] : null,
    own: rnd() < 0.3,
    session: `s${Math.floor(rnd() * 400)}`,
    visible: rnd() < 0.9 ? Math.round(rnd() * 900) / 100 : null,
    day: dayOf(Math.floor(rnd() * 73)), // Aug 1 to Oct 12, the window sees the last 30 days of it
    creative: `c${Math.floor(rnd() * 5)}`,
  });
}

/** What game_performance() does, in JavaScript. */
function evaluate(scopes, window, byDay) {
  const inWindow = impressions.filter((row) => row.day >= window.from && row.day <= window.to);
  const rows = [];
  const cellRow = (key, day, hit) => {
    const advRows = hit.filter((row) => !row.own);
    const ownRows = hit.filter((row) => row.own);
    const sum = (list) => list.reduce((total, row) => total + (row.visible ?? 0), 0);
    const counted = (list) => list.filter((row) => row.visible != null).length;
    return {
      scope_key: key, day, adv: advRows.length, own: ownRows.length,
      sessions: new Set(hit.map((row) => row.session)).size,
      adv_sessions: new Set(advRows.map((row) => row.session)).size,
      own_sessions: new Set(ownRows.map((row) => row.session)).size,
      adv_visible: sum(advRows), adv_visible_n: counted(advRows), own_visible: sum(ownRows), own_visible_n: counted(ownRows),
    };
  };
  for (const scope of scopes) {
    const hit = inWindow.filter(
      (row) =>
        scope.all ||
        scope.members.some(
          (member) =>
            row.placement === member.placement &&
            (member.place ? row.place === member.place : member.unplaced ? row.place === null : true)
        )
    );
    if (hit.length === 0) continue; // a scope with no views has no row
    rows.push(cellRow(scope.key, null, hit));
    if (byDay) for (const day of new Set(hit.map((row) => row.day))) rows.push(cellRow(scope.key, day, hit.filter((row) => row.day === day)));
  }
  return rows;
}

function run(state, window = win) {
  const plan = buildPlan({ items, removedIds, state, ctx });
  const rows = evaluate(plan.scopes, window, false);
  const cellOf = new Map(plan.scopes.map((scope) => [scope.key, cellFrom(rows.find((row) => row.scope_key === scope.key && !row.day))]));
  const dayRows = evaluate(plan.scopes.filter((scope) => scope.key === plan.chartScope), window, true).filter((row) => row.day);
  if (plan.mode === "focus") {
    const creativeRows = [];
    const members = plan.creativeMembers;
    const hit = impressions.filter((row) => row.day >= window.from && row.day <= window.to && members.some((m) => m.placement === row.placement));
    for (const key of new Set(hit.map((row) => `${row.creative}|${row.own}`))) {
      const [creative, own] = key.split("|");
      creativeRows.push({ creative_id: creative, own: own === "true", impressions: hit.filter((row) => row.creative === creative && String(row.own) === own).length });
    }
    return assembleFocus({ plan, state, ctx, win: window, cellOf, dayRows, creativeRows, creativeInfo: new Map(), folderName: "" });
  }
  return assembleList({ plan, items, state, ctx, win: window, cellOf, dayRows });
}

const base = parseParams({});
const withState = (patch) => ({ ...base, ...patch, filters: { ...base.filters, ...(patch.filters ?? {}) } });
const total = (model) => model.table.total.cell.adv + model.table.total.cell.own;
const views = (cell) => cell.adv + cell.own;
const sumViews = (list) => list.reduce((sum, entry) => sum + views(entry.cell), 0);

// ---------------------------------------------------------------- the address
assert.deepEqual(parseParams({}), { days: 30, source: "all", by: null, q: "", filters: { folder: [], scene: [], tag: [], type: [], format: [] }, ticked: [], focus: "" });
const parsed = parseParams({ days: "7", src: "own", by: "scene", q: " arena ", folder: ["a", "b", "a"], tag: "wall", p: "x,y", placement: "z" });
assert.equal(parsed.days, 7);
assert.equal(parsed.source, "own");
assert.equal(parsed.by, "scene");
assert.equal(parsed.q, "arena");
assert.deepEqual(parsed.filters.folder, ["a", "b"], "repeats collapse");
assert.deepEqual(parsed.ticked, ["x", "y"]);
assert.equal(parsed.focus, "z");
assert.equal(parseParams({ days: "999", src: "x", by: "nonsense" }).days, 30, "unknown values fall back");
assert.equal(parseParams({ days: "999", src: "x", by: "nonsense" }).source, "all");
assert.equal(parseParams({ days: "999", src: "x", by: "nonsense" }).by, null);
// an address survives a round trip, and defaults stay out of it
assert.equal(toQuery(base), "tab=performance");
assert.deepEqual(parseParams(Object.fromEntries(new URLSearchParams(toQuery(parsed, { defaultBy: "folder" })))).days, 7);
const again = parseParams(Object.fromEntries([...new URLSearchParams(toQuery({ ...parsed, by: "scene" }, { defaultBy: "folder" }))].map(([k, v]) => [k, v])));
assert.equal(again.by, "scene");
assert.equal(toQuery({ ...base, by: "folder" }, { defaultBy: "folder" }), "tab=performance", "the default grouping is not written");
assert.match(toQuery({ ...base, filters: { ...base.filters, scene: ["A B", "C"] } }), /scene=A\+B&scene=C/);
assert.equal(isFiltered(base), false);
assert.equal(isFiltered(withState({ q: "x" })), true);
assert.equal(isFiltered(withState({ filters: { tag: ["wall"] } })), true);

// ---------------------------------------------------------------- values and filters
assert.deepEqual(sceneKeys(items[0]), ["Street", "Crossroad", "Arena"]);
assert.deepEqual(sceneKeys(items[5]), [NONE], "no place reported");
assert.deepEqual(valuesOf(items[4], "tag"), ["hud"]);
assert.deepEqual(valuesOf(items[3], "tag"), [NONE]);
assert.deepEqual(valuesOf(items[0], "type"), ["gameplay"], "the server's guess stands in when none is set");
assert.deepEqual(valuesOf(items[5], "type"), [NONE]);
assert.deepEqual(valuesOf(items[4], "format"), ["custom"]);
assert.equal(labelOf("folder", NONE, ctx), "Not in a folder");
assert.equal(labelOf("folder", "f-menu", ctx), "Menus");
assert.equal(labelOf("scene", UNKNOWN, ctx), "Location not recorded");
assert.equal(labelOf("scene", NONE, ctx), "(no scene)");
assert.equal(labelOf("type", "menu", ctx), "Menu");

assert.equal(passes(items[0], withState({ filters: { scene: ["Arena"] } }), ctx), true, "stands in Arena");
assert.equal(passes(items[1], withState({ filters: { scene: ["Arena"] } }), ctx), false);
assert.equal(passes(items[1], withState({ filters: { folder: ["f-street"], tag: ["wall"] } }), ctx), true, "filters combine with AND");
assert.equal(passes(items[2], withState({ filters: { folder: ["f-street"], tag: ["wall"] } }), ctx), false);
assert.equal(passes(items[2], withState({ filters: { tag: [NONE] } }), ctx), true, "no tags is a value");
assert.equal(passes(items[3], withState({ q: "menus" }), ctx), true, "search reads the folder name");
assert.equal(passes(items[3], withState({ q: "MAINMENU" }), ctx), true, "case does not matter, scenes are searched");
assert.equal(passes(items[3], withState({ q: "zzz" }), ctx), false);

// a placement standing in one scene counts whole; one in several counts by the places in the chosen scenes
assert.deepEqual(membersOf(items[1], null), [{ placement: "poster" }]);
assert.deepEqual(membersOf(items[1], new Set(["Street"])), [{ placement: "poster" }]);
assert.equal(membersOf(items[1], new Set(["Arena"])), null);
assert.deepEqual(membersOf(items[0], null), [{ placement: "billboard" }], "no scene filter: every view, placed or not");
assert.deepEqual(membersOf(items[0], new Set(["Street", "Arena"])), [{ placement: "billboard", place: "bb1" }, { placement: "billboard", place: "bb3" }]);
assert.equal(membersOf(items[0], new Set(["Loading"])), null);
assert.deepEqual(membersOf(items[5], new Set([NONE])), [{ placement: "lost" }], "a placement with no place sits in '(no scene)'");

// ---------------------------------------------------------------- scopes
const scopes = createScopes();
const a = scopes.add([{ placement: "x" }, { placement: "y" }]);
const b = scopes.add([{ placement: "y" }, { placement: "x" }, { placement: "x" }]);
assert.equal(a, b, "the same set of views, however listed, is one scope");
assert.notEqual(scopes.add([{ placement: "x", place: "p" }]), scopes.add([{ placement: "x" }]));
assert.equal(scopes.all(), scopes.all());
assert.equal(scopes.list.length, 4);
assert.equal(scopes.list.find((scope) => scope.all).members, undefined);

const parts = chunkScopes(Array.from({ length: 600 }, (_, n) => ({ key: `s${n}`, members: [{ placement: "x" }] })), { maxScopes: 250 });
assert.deepEqual(parts.map((part) => part.length), [250, 250, 100]);
assert.equal(chunkScopes([{ key: "a", members: Array.from({ length: 10 }, () => ({})) }, { key: "b", members: Array.from({ length: 10 }, () => ({})) }], { maxMembers: 15 }).length, 2);
assert.deepEqual(chunkScopes([]), []);

// ---------------------------------------------------------------- the figures of a cell
const cell = { adv: 6, own: 4, sessions: 7, advSessions: 5, ownSessions: 3, advVisible: 30, advVisibleN: 5, ownVisible: 10, ownVisibleN: 5 };
assert.deepEqual(figures(cell, "all"), { views: 10, sessions: 7, avgVisible: 4 });
assert.deepEqual(figures(cell, "adv"), { views: 6, sessions: 5, avgVisible: 6 });
assert.deepEqual(figures(cell, "own"), { views: 4, sessions: 3, avgVisible: 2 });
assert.deepEqual(figures(emptyCell(), "all"), { views: 0, sessions: 0, avgVisible: null }, "no timing: unknown, not 0");
assert.equal(figures(undefined, "adv").views, 0);
assert.equal(advShare(cell), 60);
assert.equal(advShare(emptyCell()), 0);
assert.deepEqual(cellFrom({ adv: "3", own: 1, sessions: 2, adv_visible: "4.50", adv_visible_n: 3 }).advVisible, 4.5);
assert.deepEqual(cellFrom(null), emptyCell());

// ---------------------------------------------------------------- the axis
assert.equal(niceTop(0), 3);
assert.equal(niceTop(2), 3);
assert.equal(niceTop(1250), 1500, "three steps of 500");
assert.equal(niceTop(31), 36, "three steps of 12");
assert.equal(niceTop(215), 240, "three steps of 80");
assert.equal(niceTop(1000), 1200);
assert.equal(niceTop(1800), 1800);
assert.equal(niceTop(7), 9);
for (const peak of [4, 9, 31, 99, 100, 101, 999, 1000, 4321, 98765]) {
  const top = niceTop(peak);
  assert.ok(top >= peak, `the axis covers ${peak}`);
  assert.ok(top <= peak * 1.5 + 3, `…without much empty room for ${peak}`);
  assert.equal(Number.isInteger(top / 3), true, "the steps are whole numbers");
}
assert.equal(compactCount(950), "950");
assert.equal(compactCount(1000), "1K");
assert.equal(compactCount(1500), "1.5K");
assert.equal(compactCount(12000), "12K");

// ---------------------------------------------------------------- days
const dayList = dayCells(win, [{ day: "2026-10-12", adv: 2, own: 1 }, { day: "2026-09-13", adv: 5 }, { day: null, adv: 99 }]);
assert.equal(dayList.length, 30);
assert.equal(dayList[0].date, "2026-09-13");
assert.equal(dayList[29].date, "2026-10-12");
assert.equal(dayList[0].adv, 5);
assert.equal(dayList[29].own, 1);
assert.equal(dayList[10].adv, 0, "quiet days are zeros");
assert.equal(dayList.reduce((sum, day) => sum + day.adv, 0), 7, "the totals row (no day) is not a day");

// ---------------------------------------------------------------- the plan: what is asked, what follows what
let plan = buildPlan({ items, removedIds, state: withState({ by: "folder" }), ctx });
assert.equal(plan.mode, "list");
assert.equal(plan.tableScope, plan.scopes.find((scope) => scope.all).key, "nothing filtered: the whole game, removed placements included");
assert.equal(plan.chartScope, plan.tableScope, "nothing ticked: the chart counts what the table counts");
assert.ok(plan.removed, "the removed placements get a row while nothing is filtered");
assert.equal(plan.eligible.length, 7);
assert.equal(new Set(plan.scopes.map((scope) => scope.key)).size, plan.scopes.length);

plan = buildPlan({ items, removedIds, state: withState({ by: "folder", filters: { folder: ["f-street"] } }), ctx });
assert.equal(plan.removed, null, "filtered: no row for removed placements");
assert.deepEqual(plan.eligible.map((entry) => entry.item.id), ["billboard", "poster", "sign"]);
assert.notEqual(plan.tableScope, plan.scopes.find((scope) => scope.all)?.key);

plan = buildPlan({ items, removedIds, state: withState({ by: "placement", ticked: ["poster", "sign", "ghost"] }), ctx });
assert.deepEqual(plan.ticked, ["poster", "sign"], "ticks of placements that are not in view are dropped");
assert.notEqual(plan.chartScope, plan.tableScope, "ticks narrow the chart, not the table");
assert.equal(plan.rows.length, 7, "the table keeps every placement");

plan = buildPlan({ items, removedIds, state: withState({ ticked: ["poster"], filters: { folder: ["f-menu"] } }), ctx });
assert.deepEqual(plan.ticked, [], "a tick outside the filters does not count");
assert.equal(plan.chartScope, plan.tableScope);

// one placement: the filters do not matter
plan = buildPlan({ items, removedIds, state: withState({ focus: "billboard", filters: { folder: ["f-menu"] }, q: "nothing" }), ctx });
assert.equal(plan.mode, "focus");
assert.equal(plan.spots.length, 3);
assert.ok(plan.unknownScope);
assert.equal(buildPlan({ items, removedIds, state: withState({ focus: "poster" }), ctx }).spots.length, 0, "one place: nothing to split");
assert.equal(buildPlan({ items, removedIds, state: withState({ focus: "nope" }), ctx }).mode, "list", "an unknown placement is ignored");

// ---------------------------------------------------------------- the numbers add up
const everything = run(withState({ by: "placement" }));
const wholeGame = impressions.filter((row) => row.day >= win.from && row.day <= win.to).length;
assert.ok(wholeGame > 100, "the test data has views in the window");
assert.equal(total(everything), wholeGame, "the total is every view in the window");
assert.equal(sumViews(everything.table.rows) + views(everything.table.removed.cell), wholeGame, "by placement: rows and removed add up to the total");

for (const [by] of BREAKDOWNS.filter(([key]) => key !== "tag")) {
  const model = run(withState({ by }));
  const rows = by === "placement" ? model.table.rows : model.table.groups;
  assert.equal(sumViews(rows) + views(model.table.removed.cell), wholeGame, `by ${by}: groups and removed add up to the total`);
}

// a tag puts a placement in each of its tags: groups overlap, the total does not
const byTag = run(withState({ by: "tag" }));
assert.ok(sumViews(byTag.table.groups) >= wholeGame - views(byTag.table.removed.cell));
assert.equal(total(byTag), wholeGame);
const wall = byTag.table.groups.find((group) => group.key === "wall");
assert.equal(wall.count, 2);
assert.equal(wall.kids.length, 2);
assert.equal(views(wall.cell), views(wall.kids[0].cell) + views(wall.kids[1].cell), "a group of different placements is the sum of them");
assert.ok(wall.cell.sessions <= wall.kids[0].cell.sessions + wall.kids[1].cell.sessions, "sessions are never summed");
assert.ok(wall.cell.sessions >= Math.max(wall.kids[0].cell.sessions, wall.kids[1].cell.sessions));

// scenes: a shared placement's views go to the scene of the place they came from
const byScene = run(withState({ by: "scene" }));
const labels = byScene.table.groups.map((group) => group.label);
assert.ok(labels.includes("Location not recorded"), "views of a shared placement with no place are said so");
assert.deepEqual(byScene.table.groups.slice(-2).map((group) => group.label), ["(no scene)", "Location not recorded"], "'nothing set' groups go last");
const named = byScene.table.groups.slice(0, -2);
assert.deepEqual(named.map((group) => views(group.cell)), [...named.map((group) => views(group.cell))].sort((x, y) => y - x), "the rest: most viewed first");
const crossroad = byScene.table.groups.find((group) => group.key === "Crossroad");
assert.deepEqual(crossroad.kids.map((kid) => kid.id).sort(), ["billboard", "sign"]);
const bbAtCrossroad = impressions.filter((row) => row.day >= win.from && row.placement === "billboard" && row.place === "bb2").length;
assert.equal(views(crossroad.kids.find((kid) => kid.id === "billboard").cell), bbAtCrossroad, "only the views from that place");
assert.equal(crossroad.kids.find((kid) => kid.id === "billboard").sub, "16:9 landscape · Crossroad", "the row names the scene it is under");
const unknown = byScene.table.groups.find((group) => group.key === UNKNOWN);
assert.deepEqual(unknown.kids.map((kid) => kid.id), ["billboard"], "only a placement with several places can have an unplaced view");
const lostScene = byScene.table.groups.find((group) => group.key === NONE);
assert.deepEqual(lostScene.kids.map((kid) => kid.id), ["lost"], "no place at all: '(no scene)', whole placement");
assert.equal(views(lostScene.kids[0].cell), impressions.filter((row) => row.day >= win.from && row.placement === "lost").length);

// a scene filter counts the views from those scenes only
const arena = run(withState({ by: "placement", filters: { scene: ["Arena"] } }));
const arenaViews =
  impressions.filter((row) => row.day >= win.from && row.placement === "billboard" && row.place === "bb3").length +
  impressions.filter((row) => row.day >= win.from && row.placement === "dead").length;
assert.equal(total(arena), arenaViews, "the shared placement counts only from its Arena place; the one in one scene counts whole");
assert.equal(arena.table.removed, null);
assert.deepEqual(arena.table.rows.map((row) => row.id).sort(), ["billboard", "dead"]);
const arenaByScene = run(withState({ by: "scene", filters: { scene: ["Arena"] } }));
assert.deepEqual(arenaByScene.table.groups.map((group) => group.key), ["Arena"], "with a scene filter there is no 'not recorded' group");
assert.equal(sumViews(arenaByScene.table.groups), arenaViews);

// filters combine, and the figures follow them
const wallStreets = run(withState({ by: "placement", filters: { folder: ["f-street"], tag: ["wall"] } }));
assert.deepEqual(wallStreets.table.rows.map((row) => row.id).sort(), ["billboard", "poster"]);
assert.equal(total(wallStreets), sumViews(wallStreets.table.rows));
assert.equal(wallStreets.kpi.placements, 2);
assert.equal(wallStreets.totalPlacements, 7, "the whole game, for '2 of 7 placements'");
assert.equal(wallStreets.filtered, true);

// ticks: the figures and the chart follow them, the table does not
const ticked = run(withState({ by: "placement", ticked: ["poster", "sign"] }));
assert.equal(views(ticked.kpi.cell), ticked.table.rows.filter((row) => ["poster", "sign"].includes(row.id)).reduce((sum, row) => sum + views(row.cell), 0));
assert.equal(ticked.kpi.placements, 2);
assert.equal(ticked.chart.days.reduce((sum, day) => sum + day.adv + day.own, 0), views(ticked.kpi.cell), "the chart adds up to the figure");
assert.equal(total(ticked), wholeGame, "the table total is unchanged by ticks");

// the chart adds up to the total
assert.equal(everything.chart.days.reduce((sum, day) => sum + day.adv + day.own, 0), wholeGame);
assert.equal(everything.chart.days.length, 30);

// sessions and visible time: a source is a subset
const k = everything.kpi.cell;
assert.ok(k.advSessions <= k.sessions && k.ownSessions <= k.sessions);
assert.ok(k.advSessions + k.ownSessions >= k.sessions, "a session can see both kinds");
assert.ok(figures(k, "all").sessions <= figures(k, "all").views);
assert.ok(Math.abs(figures(k, "all").avgVisible * (k.advVisibleN + k.ownVisibleN) - (k.advVisible + k.ownVisible)) < 1e-6);

// a period: fewer days, fewer views, the same rules
const week = run(withState({ by: "folder" }), windowOf(7, now));
assert.equal(week.chart.days.length, 7);
assert.ok(total(week) < wholeGame);
assert.equal(total(week), impressions.filter((row) => row.day >= week.win.from && row.day <= week.win.to).length);

// a game that has seen nothing
const none = (() => {
  const plan0 = buildPlan({ items, removedIds, state: withState({ by: "folder" }), ctx });
  return assembleList({ plan: plan0, items, state: withState({ by: "folder" }), ctx, win, cellOf: new Map(), dayRows: [] });
})();
assert.equal(total(none), 0);
assert.equal(none.table.removed, null, "no views, no row for removed placements");
assert.equal(none.chart.days.every((day) => day.adv === 0 && day.own === 0), true);

// ---------------------------------------------------------------- lists behind the filters
const model = run(withState({ by: "folder" }));
const facet = (key) => model.facets.find((entry) => entry.key === key);
assert.deepEqual(facet("folder").options.map((option) => option.label), ["Menus", "Old", "Streets", "Not in a folder"], "'none' last");
assert.deepEqual(facet("scene").options.map((option) => option.value), ["Arena", "Crossroad", "Loading", "MainMenu", "Street", NONE]);
const streetOption = facet("folder").options.find((option) => option.value === "f-street");
const streetViews = impressions.filter((row) => row.day >= win.from && ["billboard", "poster", "sign"].includes(row.placement)).length;
assert.equal(streetOption.adv + streetOption.own, streetViews, "a folder option counts its placements' views");
const arenaOption = facet("scene").options.find((option) => option.value === "Arena");
const arenaCount = impressions.filter((row) => row.day >= win.from && ((row.placement === "billboard" && row.place === "bb3") || row.placement === "dead")).length;
assert.equal(arenaOption.adv + arenaOption.own, arenaCount, "a scene option counts the views from that scene");
// counts follow the other filters but not their own list
const onlyWall = run(withState({ by: "folder", filters: { tag: ["wall"] } }));
const folderCounts = onlyWall.facets.find((entry) => entry.key === "folder").options;
assert.equal(folderCounts.find((option) => option.value === "f-menu").adv + folderCounts.find((option) => option.value === "f-menu").own, 0, "no wall-tagged placement in Menus");
const tagCounts = onlyWall.facets.find((entry) => entry.key === "tag").options;
assert.ok(tagCounts.find((option) => option.value === "hud").adv + tagCounts.find((option) => option.value === "hud").own > 0, "a chosen tag does not hide the others' counts");
assert.deepEqual(facet("type").options.map((option) => option.label), ["Gameplay", "Loading", "Menu", "Not determined"]);
assert.deepEqual(facetOptions([], base, ctx, new Map()).map((entry) => entry.options.length), [0, 0, 0, 0, 0]);

// default grouping: folders when used, else scenes when there are several, else a plain list
assert.equal(defaultBreakdown(items, ctx.folders), "folder");
assert.equal(defaultBreakdown(items.map((entry) => ({ ...entry, folderId: null })), ctx.folders), "scene");
assert.equal(defaultBreakdown([items[1]], []), "placement");
assert.equal(defaultBreakdown([], []), "placement");

// ---------------------------------------------------------------- one placement
const focus = run(withState({ focus: "billboard" }));
assert.equal(focus.mode, "focus");
assert.equal(focus.placement.label, "billboard");
assert.equal(focus.placement.shared, true);
assert.equal(focus.placement.spots, 3);
assert.equal(focus.placement.type, "Gameplay");
const billboardViews = impressions.filter((row) => row.day >= win.from && row.placement === "billboard").length;
assert.equal(views(focus.kpi.cell), billboardViews);
const where = focus.where.spots.reduce((sum, spot) => sum + views(spot.cell), 0) + (focus.where.unknown ? views(focus.where.unknown) : 0);
assert.equal(where, billboardViews, "the spots and 'not recorded' add up to the placement");
const shown = focus.shown.adv.reduce((sum, c) => sum + c.views, 0) + focus.shown.own.reduce((sum, c) => sum + c.views, 0);
assert.equal(shown, billboardViews, "the creatives add up to the placement");
assert.equal(focus.shown.adv.reduce((sum, c) => sum + c.views, 0), focus.kpi.cell.adv, "advertisers' creatives add up to advertisers' views");
assert.deepEqual(focus.shown.adv.map((c) => c.views), [...focus.shown.adv.map((c) => c.views)].sort((x, y) => y - x), "most shown first");
assert.equal(focus.shown.own[0].name, "Your picture", "an own picture with no name on file is still called something");
assert.equal(run(withState({ focus: "poster" })).where.spots.length, 0);
assert.equal(run(withState({ focus: "dead" })).placement.off, true);

console.log("performance-view: all checks passed");
