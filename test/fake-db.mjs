// An in-memory stand-in for the Supabase client, shared by the support tests.
import { randomUUID } from "node:crypto";

export function fake({ missing = [] } = {}) {
  const tables = { support_bot_settings: [], support_articles: [], support_bot_log: [], accounts: [], support_requests: [], support_messages: [], support_attachments: [], support_folders: [], notifications: [] };
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
