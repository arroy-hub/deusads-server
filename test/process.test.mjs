// Dates, fit warnings, CSV and notification helpers. Run: node test/process.test.mjs
import assert from "node:assert/strict";
import { bookingLabel, dateRangeText, fitNote, parseDateRange, bookingErrorMessage, utcToday } from "../lib/booking-rules.js";
import { csvCell, toCsv } from "../lib/csv.js";
import { cleanCompany } from "../lib/admin-rules.js";
import { emailParts, notify, notifyMany } from "../lib/notify.js";
import { resetScheduleThrottle, syncBookingSchedule } from "../lib/schedule.js";

const today = "2026-10-09";

// --- utcToday
assert.equal(utcToday(new Date("2026-10-09T23:59:59Z")), "2026-10-09");

// --- date ranges
assert.deepEqual(parseDateRange("", "", today), { startsOn: null, endsOn: null });
assert.deepEqual(parseDateRange(undefined, undefined, today), { startsOn: null, endsOn: null });
assert.deepEqual(parseDateRange("2026-10-12", "2026-10-20", today), { startsOn: "2026-10-12", endsOn: "2026-10-20" });
assert.deepEqual(parseDateRange("2026-10-09", "2026-10-09", today), { startsOn: "2026-10-09", endsOn: "2026-10-09" });
assert.deepEqual(parseDateRange("", "2026-10-09", today), { startsOn: null, endsOn: "2026-10-09" });
assert.match(parseDateRange("2026-10-08", "", today).error, /past/);
assert.match(parseDateRange("2026-10-12", "2026-10-11", today).error, /before the start/);
assert.match(parseDateRange("", "2026-10-08", today).error, /before the start/);
assert.match(parseDateRange("2026-13-40", "", today).error, /real dates/);
assert.match(parseDateRange("12/10/2026", "", today).error, /real dates/);
assert.match(parseDateRange("2026-02-30", "", today).error, /real dates/);
assert.equal(parseDateRange("2026-10-09", "2027-10-09", today).startsOn, "2026-10-09"); // 366 days: allowed
assert.match(parseDateRange("2026-10-09", "2027-10-10", today).error, /at most 366/);
assert.match(parseDateRange("", "2028-01-01", today).error, /at most 366/);

// --- labels
const row = (over) => ({ status: "pending", admin_decision: "pending", developer_decision: "pending", ...over });
assert.equal(bookingLabel(row({ status: "approved" }), today), "Live");
assert.equal(bookingLabel(row({ status: "approved", ends_on: "2026-10-20" }), today), "Live until 20 Oct");
assert.equal(bookingLabel(row({ status: "approved", starts_on: "2026-10-12" }), today), "Scheduled from 12 Oct");
assert.equal(bookingLabel(row({ status: "approved", ends_on: "2026-10-08" }), today), "Ended");
assert.equal(bookingLabel(row({ status: "approved", ends_on: "2026-10-09" }), today), "Live until 9 Oct");
assert.equal(bookingLabel(row({ status: "ended" }), today), "Ended");
assert.equal(bookingLabel(row({ status: "rejected" }), today), "Rejected");
assert.equal(bookingLabel(row({ admin_decision: "approved" }), today), "Waiting for the developer");
assert.equal(bookingLabel(row({ status: "approved", startsOn: "2026-10-12" }), today), "Scheduled from 12 Oct"); // camelCase rows too
assert.equal(dateRangeText("2026-10-12", "2026-10-20"), "12 Oct – 20 Oct");
assert.equal(dateRangeText("2026-10-12", null), "from 12 Oct");
assert.equal(dateRangeText(null, "2026-10-20"), "until 20 Oct");
assert.equal(dateRangeText(null, null), "");

// --- fit
assert.equal(fitNote({ width: 1600, height: 900, aspect: 1.78 }), null);
assert.equal(fitNote({ width: 1000, height: 1000, aspect: 1.1 }), null); // within 15%
assert.match(fitNote({ width: 1000, height: 1000, aspect: 2 }), /cropped/);
assert.match(fitNote({ width: 1000, height: 1000, aspect: 2 }), /1\.00:1.*2\.00:1/);
for (const bad of [{}, { width: 0, height: 10, aspect: 1 }, { width: 10, height: 10, aspect: null }, { width: "x", height: 1, aspect: 1 }]) {
  assert.equal(fitNote(bad), null, JSON.stringify(bad));
}
assert.match(bookingErrorMessage({ message: "BOOKING_EXPIRED" }), /end date/);

// --- company names
assert.equal(cleanCompany("  Acme   Games  "), "Acme Games");
assert.equal(cleanCompany("A"), null);
assert.equal(cleanCompany("   "), null);
assert.equal(cleanCompany(null), null);
assert.equal(cleanCompany("x".repeat(500)).length, 120);

// --- csv
assert.equal(csvCell("plain"), "plain");
assert.equal(csvCell("a,b"), '"a,b"');
assert.equal(csvCell('say "hi"'), '"say ""hi"""');
assert.equal(csvCell("two\nlines"), '"two\nlines"');
assert.equal(csvCell(null), "");
assert.equal(csvCell(undefined), "");
assert.equal(csvCell(0), "0");
assert.equal(csvCell(-5), "-5"); // numbers are data, not formulas
for (const attack of ["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"]) {
  assert.ok(csvCell(attack).replace(/^"/, "").startsWith("'"), `neutralised: ${JSON.stringify(attack)}`);
}
assert.equal(csvCell("=HYPERLINK(\"http://x\")"), '"\'=HYPERLINK(""http://x"")"');
const csv = toCsv(["Day", "Impressions"], [["2026-10-09", 5], ["2026-10-10", 0]]);
assert.equal(csv, "﻿Day,Impressions\r\n2026-10-09,5\r\n2026-10-10,0\r\n");
assert.equal(toCsv(["A"], []), "﻿A\r\n");

// --- email text
const mail = emailParts("Your booking is live", "/dashboard/advertising", "https://example.test");
assert.equal(mail.subject, "DeusADS: Your booking is live");
assert.match(mail.body, /https:\/\/example\.test\/dashboard\/advertising/);
assert.match(emailParts("x", null, "https://example.test").body, /https:\/\/example\.test\/dashboard/);
assert.ok(emailParts("y".repeat(400), null).subject.length <= 150);

// --- notify never throws and never emails without configuration
const inserted = [];
const okService = {
  from: (table) => ({
    insert: async (row) => (inserted.push([table, row]), { error: null }),
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { email: "a@b.test" } }) }) }),
  }),
};
delete process.env.RESEND_API_KEY;
await notify(okService, { accountId: "u1", text: "hello", link: "/x" });
assert.deepEqual(inserted, [["notifications", { account_id: "u1", text: "hello", link: "/x" }]]);
await notify(okService, { accountId: "", text: "no one" });
await notify(okService, { accountId: "u1", text: "" });
assert.equal(inserted.length, 1, "nothing is stored without an account or text");
await notify(okService, { accountId: "u2", text: "z".repeat(1000) });
assert.equal(inserted[1][1].text.length, 300);

const failing = { from: () => ({ insert: async () => { throw new Error("db down"); } }) };
await notify(failing, { accountId: "u1", text: "still fine" });
const missingTable = { from: () => ({ insert: async () => ({ error: { code: "42P01" } }) }) };
await notify(missingTable, { accountId: "u1", text: "still fine" });

inserted.length = 0;
await notifyMany(okService, ["u1", "u1", "u2", null], "both", "/y");
assert.equal(inserted.length, 2, "duplicates and empty ids are dropped");

// --- schedule sync: throttled, never throws, tolerant of a missing function
let calls = 0;
const rpcDb = (result) => ({ rpc: async (name) => (calls++, name === "sync_booking_schedule" ? result : { error: { code: "x" } }) });
resetScheduleThrottle();
assert.equal(await syncBookingSchedule(rpcDb({ data: 1, error: null }), 1_000_000), true);
assert.equal(await syncBookingSchedule(rpcDb({ data: 1, error: null }), 1_030_000), false, "throttled within a minute");
assert.equal(calls, 1);
assert.equal(await syncBookingSchedule(rpcDb({ data: 1, error: null }), 1_061_000), true, "runs again after a minute");
assert.equal(calls, 2);
resetScheduleThrottle();
assert.equal(await syncBookingSchedule(rpcDb({ error: { code: "PGRST202" } }), 5_000_000), false, "missing function: quiet");
resetScheduleThrottle();
assert.equal(await syncBookingSchedule({ rpc: async () => { throw new Error("network"); } }, 6_000_000), false, "a throwing client does not propagate");
resetScheduleThrottle();
assert.equal(await syncBookingSchedule({}, 7_000_000), false, "a client without rpc is ignored");

console.log("process: all checks passed");
