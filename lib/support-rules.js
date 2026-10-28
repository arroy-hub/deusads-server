// The rules of the support system (Help & feedback and the admin's Support). Pure data and functions, so the
// pages, the server actions and the tests read the same rules (test/support-rules.test.mjs).

export const TYPES = ["bug", "question", "idea"];
export const STATUSES = ["new", "answered", "noted", "resolved"];
export const TYPE_LABEL = { bug: "Problem", question: "Question", idea: "Idea" };
export const STATUS_LABEL = { new: "New", answered: "Answered", noted: "Noted", resolved: "Resolved" };

export const LIMITS = {
  title: 140,
  text: 6000,
  screenshots: 5,
  screenshotBytes: 5 * 1024 * 1024,
  requestsPerHour: 5,
  assistantPerDay: 30,
  folderName: 40,
};

export const isType = (v) => TYPES.includes(v);
export const isStatus = (v) => STATUSES.includes(v);

/**
 * The statuses a type may have. "Noted" is only for ideas, "Resolved" is never for ideas. The database does not
 * check this: changing the type of a request never changes its status, so a resolved problem turned into an
 * idea stays resolved. The rule is applied whenever somebody *sets* a status.
 */
export function allowedStatuses(type) {
  return type === "idea" ? ["new", "answered", "noted"] : ["new", "answered", "resolved"];
}

export const canSetStatus = (type, status) => allowedStatuses(type).includes(status);

/** Why a person cannot write in a request, or null when they can. Admins can always write (it reopens). */
export function lockOf(request) {
  if (request.status === "resolved") {
    return { why: "This request is resolved, so it is closed for new messages.", followUp: true };
  }
  if (request.type === "idea" && request.status === "noted") {
    return { why: "This idea is noted. The developer will write here if something changes.", followUp: false };
  }
  return null;
}

/** What a new message does to the status. An admin reply (not a note) answers at once, also a resolved request. */
export function statusAfterMessage(request, { from, note = false }) {
  if (from === "admin") return note ? request.status : "answered";
  if (from === "user") return request.status === "answered" ? "new" : request.status;
  return request.status;
}

/** Changing the type never changes the status or whether the request counts as active. */
export function changeType(request, type) {
  if (!isType(type)) return null;
  return { ...request, type };
}

/** The colour name of a request: by type, and every resolved request is green. */
export function toneOf(request) {
  if (request.status === "resolved") return "live";
  return request.type === "bug" ? "ans" : "sched";
}

/** Share of the progress bar in a strip. */
export const PROGRESS = { new: 14, answered: 55, noted: 70, resolved: 100 };

/** Hours a request has waited since it was created (only "new" requests wait for the admin). */
export function waitHours(request, now = Date.now()) {
  const from = Date.parse(request.created_at);
  if (!Number.isFinite(from)) return 0;
  return Math.max(0, (now - from) / 3600000);
}

export function waitLabel(hours) {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} d`;
}

const ORDER = ["new", "answered", "noted", "resolved"];

/**
 * People for the admin's tables: one row per person, the person whose request has waited longest first.
 * `inner` orders a person's own requests: a status first (not a filter), or "recent". People without a waiting
 * request come after those with one. `sort` is "wait" (default), "recent", "count" or "name".
 */
export function groupByPerson(requests, { sort = "wait", inner = "new", now = Date.now() } = {}) {
  const byPerson = new Map();
  for (const r of requests) {
    const key = r.owner_id;
    if (!byPerson.has(key)) byPerson.set(key, { ownerId: key, name: r.owner_name ?? "", role: r.owner_role ?? "", items: [] });
    byPerson.get(key).items.push(r);
  }
  const people = [...byPerson.values()];
  for (const p of people) {
    const rank = (r) => (inner === "recent" ? 0 : r.status === inner ? -1 : ORDER.indexOf(r.status));
    const age = (r) => waitHours(r, now);
    p.items.sort((a, b) => rank(a) - rank(b) || (a.status === "new" && b.status === "new" ? age(b) - age(a) : age(a) - age(b)));
    const waiting = p.items.filter((r) => r.status === "new");
    p.waiting = waiting.length;
    p.wait = waiting.length ? Math.max(...waiting.map(age)) : 0;
    p.recent = Math.min(...p.items.map(age));
  }
  const byName = (a, b) => a.name.localeCompare(b.name);
  const sorters = {
    name: byName,
    count: (a, b) => b.items.length - a.items.length || b.wait - a.wait || byName(a, b),
    recent: (a, b) => a.recent - b.recent || byName(a, b),
    wait: (a, b) => b.wait - a.wait || a.recent - b.recent || byName(a, b),
  };
  return people.sort(sorters[sort] ?? sorters.wait);
}

/**
 * Which bulk actions a selection allows. "Mark as resolved" is off when an idea is selected, "Mark as noted"
 * is off when anything but an idea is selected. Empty selection allows nothing.
 */
export function bulkAllowed(selected) {
  if (!selected.length) return { resolve: false, note: false, send: false };
  return {
    resolve: selected.every((r) => canSetStatus(r.type, "resolved")),
    note: selected.every((r) => canSetStatus(r.type, "noted")),
    send: true,
  };
}

/** A request is checked before it is stored: a cleaned copy, or a message for the person. */
export function cleanRequest({ type, title, text }) {
  if (!isType(type)) return { error: "Choose what you are sending: a problem, a question or an idea." };
  const t = String(title ?? "").replace(/\s+/g, " ").trim().slice(0, LIMITS.title);
  const body = String(text ?? "").trim().slice(0, LIMITS.text);
  if (!t && !body) return { error: "Write a few words about it." };
  return { type, title: t || body.replace(/\s+/g, " ").slice(0, 70), text: body };
}

export function cleanFolderName(name) {
  const n = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, LIMITS.folderName);
  return n || null;
}

/** Whether a person may still create a request, given the times of the ones they created in the last hour. */
export function requestRateProblem(recentCount) {
  return recentCount >= LIMITS.requestsPerHour ? "You have sent several requests in a short time. Please try again a bit later." : null;
}

/** Same for the assistant: its messages today. */
export function assistantRateProblem(todayCount, limit = LIMITS.assistantPerDay) {
  return todayCount >= limit ? "You have reached today's limit for the assistant. You can still message the developer directly." : null;
}

/** A screenshot is accepted by its real bytes, not by its name. Returns "png", "jpg", "webp" or null. */
export function screenshotKind(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  const riff = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return riff ? "webp" : null;
}

export function screenshotProblem({ size, bytes }) {
  if (!size) return "The file is empty.";
  if (size > LIMITS.screenshotBytes) return "A screenshot can be up to 5 MB.";
  return screenshotKind(bytes) ? null : "Use a PNG, JPG or WebP picture.";
}

/** Where a screenshot is kept in the private bucket: the owner's folder, then the request. */
export function screenshotPath(ownerId, requestId, kind, id) {
  return `${ownerId}/${requestId}/${id}.${kind}`;
}

/** The technical details that come with a request (page, browser, role, game, SDK): known keys only, short text. */
const CONTEXT_KEYS = ["Page", "Browser", "Role", "Game", "SDK"];
export function cleanContext(context) {
  const out = {};
  if (!context || typeof context !== "object") return out;
  for (const key of CONTEXT_KEYS) {
    const value = context[key];
    if (typeof value === "string" && value.trim()) out[key] = value.trim().slice(0, 200);
  }
  return out;
}

/** The text of a message: trimmed and cut to the limit. */
export const cleanBody = (text) => String(text ?? "").trim().slice(0, LIMITS.text);

/** Why a set of screenshots cannot be accepted, or null. `files` are { bytes } with the real contents. */
export function filesProblem(files) {
  const list = files ?? [];
  if (list.length > LIMITS.screenshots) return `Attach up to ${LIMITS.screenshots} screenshots.`;
  for (const file of list) {
    const problem = screenshotProblem({ size: file.bytes?.length ?? 0, bytes: file.bytes });
    if (problem) return problem;
  }
  return null;
}
