// What happens when somebody sends, answers, resolves or sorts requests. Run: node test/support-server.test.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  OUTDATED, createFolder, createRequest, deleteFolder, markRead, placeRequests, postMessage, renameFolder, screenshotLinks,
  setStatus, setStatusMany, setType,
} from "../lib/support-server.js";

// A small in-memory stand-in for the Supabase client: tables as arrays, the chained calls the code uses.
function fake({ missing = [] } = {}) {
  const tables = { accounts: [], support_requests: [], support_messages: [], support_attachments: [], support_folders: [], notifications: [] };
  const uploaded = [];
  let number = 100;
  const from = (name) => {
    const q = { op: "select", filters: [], opts: {}, single: false };
    const rows = () => (tables[name] ??= []);
    const matches = (row) => q.filters.every(([kind, col, val]) => (kind === "eq" ? row[col] === val : kind === "gte" ? String(row[col]) >= val : val.includes(row[col])));
    const run = () => {
      if (missing.includes(name)) return { data: null, error: { code: "42P01" } };
      if (q.op === "insert") {
        const row = { id: randomUUID(), created_at: new Date().toISOString(), ...q.payload };
        if (name === "support_requests") Object.assign(row, { number: ++number, status: "new", last_message_at: row.created_at, user_unread: false, admin_unread: true, resolved_by: null, folder_id: null, position: 0 }, q.payload);
        rows().push(row);
        return { data: q.single ? row : [row], error: null };
      }
      if (q.op === "update") {
        const hit = rows().filter(matches);
        hit.forEach((row) => Object.assign(row, q.payload));
        return { data: q.single ? hit[0] ?? null : hit, error: null };
      }
      if (q.op === "delete") {
        const hit = rows().filter(matches);
        tables[name] = rows().filter((row) => !hit.includes(row));
        return { data: hit, error: null };
      }
      let hit = rows().filter(matches);
      if (q.order) hit = [...hit].sort((a, b) => (a[q.order.col] < b[q.order.col] ? -1 : 1) * (q.order.asc ? 1 : -1));
      if (q.limit) hit = hit.slice(0, q.limit);
      if (q.opts.head) return { data: null, count: hit.length, error: null };
      return { data: q.single ? hit[0] ?? null : hit, count: hit.length, error: null };
    };
    const b = {
      select: (cols, opts = {}) => (Object.assign(q.opts, opts), b),
      insert: (payload) => ((q.op = "insert"), (q.payload = payload), b),
      update: (payload) => ((q.op = "update"), (q.payload = payload), b),
      delete: () => ((q.op = "delete"), b),
      eq: (c, v) => (q.filters.push(["eq", c, v]), b),
      gte: (c, v) => (q.filters.push(["gte", c, v]), b),
      in: (c, v) => (q.filters.push(["in", c, v]), b),
      order: (col, o) => ((q.order = { col, asc: o?.ascending !== false }), b),
      limit: (n) => ((q.limit = n), b),
      single: () => ((q.single = true), b),
      maybeSingle: () => ((q.single = true), b),
      then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
    };
    return b;
  };
  const storage = { from: () => ({ upload: async (path, bytes, o) => (uploaded.push({ path, type: o.contentType }), { error: null }), remove: async () => ({}), createSignedUrls: async (paths) => ({ data: paths.map((path) => ({ path, signedUrl: `https://x/${path}` })) }) }) };
  return { tables, uploaded, from, storage };
}

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
const junk = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
const anna = { id: "u-anna", role: "developer" };
const boris = { id: "u-boris", role: "advertiser" };
const admin = { id: "u-admin", role: "admin" };
const seed = () => {
  const db = fake();
  db.tables.accounts.push({ id: anna.id, role: "developer", company: "Pixel Forge", email: "a@x.co" }, { id: boris.id, role: "advertiser", company: "Northwind", email: "b@x.co" }, { id: admin.id, role: "admin", company: "DeusADS", email: "admin@x.co" });
  return db;
};
const only = (db, table) => db.tables[table];
const sent = (db, to) => db.tables.notifications.filter((n) => n.account_id === to);

// --- creating a request
let db = seed();
let r = await createRequest(db, { actor: anna, type: "bug", title: "Banners don't show", text: "Quest build is empty", context: { Page: "/dashboard/g/1", evil: "x" }, files: [{ bytes: png }] });
assert.ok(r.ok && r.number);
assert.equal(only(db, "support_requests")[0].status, "new");
assert.deepEqual(only(db, "support_requests")[0].context, { Page: "/dashboard/g/1" }, "unknown context keys are dropped");
assert.equal(only(db, "support_messages")[0].kind, "user");
assert.equal(db.uploaded.length, 1);
assert.match(db.uploaded[0].path, new RegExp(`^${anna.id}/${r.id}/.+\\.png$`));
assert.equal(db.uploaded[0].type, "image/png");
assert.equal(only(db, "support_attachments").length, 1);
assert.equal(sent(db, admin.id).length, 1, "the admin hears about it");
assert.match(sent(db, admin.id)[0].text, /Pixel Forge/);
assert.equal(sent(db, anna.id).length, 0);

assert.ok((await createRequest(db, { actor: anna, type: "nope", title: "a", text: "b" })).error);
assert.ok((await createRequest(db, { actor: anna, type: "bug", title: "a", text: "b", files: [{ bytes: junk }] })).error, "a file that is not a picture");
assert.ok((await createRequest(db, { actor: anna, type: "bug", title: "a", text: "b", files: Array(6).fill({ bytes: png }) })).error, "six screenshots");
assert.equal(only(db, "support_requests").length, 1, "refused requests leave nothing behind");

// 5 an hour
db = seed();
for (let i = 0; i < 5; i++) assert.ok((await createRequest(db, { actor: anna, type: "question", title: `q${i}`, text: "?" })).ok);
assert.match((await createRequest(db, { actor: anna, type: "question", title: "q6", text: "?" })).error, /short time/);
assert.ok((await createRequest(db, { actor: boris, type: "question", title: "b1", text: "?" })).ok, "the limit is per person");

// database without 0052
assert.equal((await createRequest(fake({ missing: ["support_requests"] }), { actor: anna, type: "bug", title: "a", text: "b" })).error, OUTDATED);

// --- writing in a request
db = seed();
const bug = (await createRequest(db, { actor: anna, type: "bug", title: "Bug", text: "x" })).id;
const idea = (await createRequest(db, { actor: anna, type: "idea", title: "Idea", text: "x" })).id;
const req = (id) => only(db, "support_requests").find((x) => x.id === id);

// the admin's reply answers at once and tells the owner
r = await postMessage(db, { actor: admin, requestId: bug, body: "Looking into it" });
assert.equal(r.status, "answered");
assert.equal(req(bug).user_unread, true);
assert.equal(sent(db, anna.id).length, 1);
assert.equal(sent(db, anna.id)[0].link, `/dashboard/support?tab=requests&open=${bug}`);
// the person's answer puts it back to new
r = await postMessage(db, { actor: anna, requestId: bug, body: "Here is more" });
assert.equal(r.status, "new");
assert.equal(req(bug).admin_unread, true);
// somebody else's request, a note by a non-admin, an empty message
assert.equal((await postMessage(db, { actor: boris, requestId: bug, body: "hi" })).error, "Request not found.");
assert.equal((await postMessage(db, { actor: anna, requestId: bug, body: "hi", note: true })).error, "Not allowed.");
assert.equal((await postMessage(db, { actor: anna, requestId: bug, body: "  " })).error, "Write a message.");
// an internal note changes nothing the person can see
const before = { status: req(bug).status, last: req(bug).last_message_at, mails: sent(db, anna.id).length };
r = await postMessage(db, { actor: admin, requestId: bug, body: "Probably the scene switch", note: true });
assert.ok(r.ok);
assert.equal(only(db, "support_messages").at(-1).kind, "note");
assert.deepEqual({ status: req(bug).status, last: req(bug).last_message_at, mails: sent(db, anna.id).length }, before);

// resolved: closed for the person (with the follow-up offer), the admin reopens by writing
assert.ok((await setStatus(db, { actor: admin, requestId: bug, status: "resolved" })).ok);
assert.equal(req(bug).resolved_by, "developer");
assert.match(sent(db, anna.id).at(-1).text, /resolved/);
r = await postMessage(db, { actor: anna, requestId: bug, body: "still broken" });
assert.equal(r.followUp, true);
assert.ok(r.error);
r = await postMessage(db, { actor: admin, requestId: bug, body: "Sorry, reopening" });
assert.equal(r.status, "answered");
assert.equal(req(bug).resolved_by, null);

// a noted idea is closed for the person without a follow-up offer
assert.ok((await setStatus(db, { actor: admin, requestId: idea, status: "noted" })).ok);
r = await postMessage(db, { actor: anna, requestId: idea, body: "also..." });
assert.equal(r.followUp, false);

// --- statuses and types
assert.match((await setStatus(db, { actor: admin, requestId: idea, status: "resolved" })).error, /never be resolved|never resolved/);
assert.match((await setStatus(db, { actor: admin, requestId: bug, status: "noted" })).error, /Only an idea/);
assert.equal((await setStatus(db, { actor: anna, requestId: bug, status: "resolved" })).error, "Not allowed.");
assert.equal((await setStatus(db, { actor: admin, requestId: bug, status: "weird" })).error, "Unknown status.");
const many = await setStatusMany(db, { actor: admin, ids: [bug, idea], status: "resolved" });
assert.deepEqual({ u: many.updated, s: many.skipped }, { u: 1, s: 1 }, "the idea is skipped, not resolved");
assert.equal(req(idea).status, "noted");

// changing the type never changes the status
assert.equal(req(bug).status, "resolved");
assert.ok((await setType(db, { actor: admin, requestId: bug, type: "idea" })).ok);
assert.equal(req(bug).type, "idea");
assert.equal(req(bug).status, "resolved");
assert.equal((await setType(db, { actor: anna, requestId: bug, type: "bug" })).error, "Not allowed.");
assert.equal((await setType(db, { actor: admin, requestId: bug, type: "x" })).error, "Unknown type.");

// reading clears the mark of the reader's side only
req(bug).admin_unread = true;
req(bug).user_unread = true;
await markRead(db, { actor: admin, requestId: bug });
assert.deepEqual([req(bug).admin_unread, req(bug).user_unread], [false, true]);
await markRead(db, { actor: anna, requestId: bug });
assert.equal(req(bug).user_unread, false);
assert.equal((await markRead(db, { actor: boris, requestId: bug })).error, "Request not found.");

// --- folders
const f = await createFolder(db, { actor: anna, name: "  Drift   Arena " });
assert.equal(f.name, "Drift Arena");
assert.ok((await createFolder(db, { actor: anna, name: "Second" })).ok);
assert.equal(only(db, "support_folders")[1].position, 1);
assert.ok((await createFolder(db, { actor: anna, name: "  " })).error);
assert.equal((await renameFolder(db, { actor: boris, folderId: f.id, name: "Mine now" })).error, "Folder not found.");
assert.equal((await renameFolder(db, { actor: anna, folderId: f.id, name: "Arena" })).name, "Arena");
// moving and ordering: own requests only
const bobReq = (await createRequest(db, { actor: boris, type: "question", title: "B", text: "?" })).id;
assert.ok((await placeRequests(db, { actor: anna, folderId: f.id, orderedIds: [idea, bug, bobReq] })).ok);
assert.deepEqual([req(idea).folder_id, req(idea).position, req(bug).position], [f.id, 0, 1]);
assert.equal(req(bobReq).folder_id, null, "somebody else's request is not moved");
assert.equal((await placeRequests(db, { actor: boris, folderId: f.id, orderedIds: [bobReq] })).error, "Folder not found.");
assert.ok((await placeRequests(db, { actor: anna, folderId: null, orderedIds: [bug] })).ok);
assert.equal(req(bug).folder_id, null);
assert.equal((await deleteFolder(db, { actor: boris, folderId: f.id })).error, "Folder not found.");
assert.ok((await deleteFolder(db, { actor: anna, folderId: f.id })).ok);

// --- screenshot links
assert.deepEqual(await screenshotLinks(db, []), {});
assert.deepEqual(await screenshotLinks(db, [{ path: "a/b.png" }]), { "a/b.png": "https://x/a/b.png" });

console.log("support server ok");
