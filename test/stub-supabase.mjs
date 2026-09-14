// Minimal stand-in for the Supabase REST API, just enough to exercise the three
// SDK routes end to end. It is a test fixture, not a Supabase implementation:
// it understands only the specific queries the routes make.
import http from "node:http";

const GAME = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  owner_id: "11111111-1111-1111-1111-111111111111",
  name: "Basketball VR",
};
const VALID_KEY = "test-key-123";

const PLACEMENTS = [
  { id: "bbbbbbbb-0000-4000-8000-000000000001", external_id: "plc_arena_north" },
  { id: "bbbbbbbb-0000-4000-8000-000000000002", external_id: "plc_arena_south" },
];

const ASSIGNMENTS = [
  {
    placements: { external_id: "plc_arena_north" },
    creatives: {
      id: "cccccccc-0000-4000-8000-000000000001",
      storage_path: "anton/nike-16x9.png",
      status: "approved",
    },
  },
];

export const calls = [];
const seenImpressions = new Set();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const body = await readBody(req);
  calls.push({ method: req.method, path: url.pathname, search: url.search });

  const send = (status, payload) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  };

  if (url.pathname === "/rest/v1/games") {
    const key = url.searchParams.get("api_key") ?? "";
    return send(200, key === `eq.${VALID_KEY}` ? [GAME] : []);
  }

  if (url.pathname === "/rest/v1/assignments") {
    return send(200, ASSIGNMENTS);
  }

  if (url.pathname === "/rest/v1/placements") {
    if (req.method === "POST") {
      return send(201, body.map((row) => ({ external_id: row.external_id })));
    }
    return send(200, PLACEMENTS);
  }

  if (url.pathname === "/rest/v1/impressions") {
    // Mimic ignoreDuplicates against the unique index.
    const fresh = body.filter((row) => {
      const key = [row.game_id, row.session_id, row.placement_id, row.creative_id].join("|");
      if (seenImpressions.has(key)) return false;
      seenImpressions.add(key);
      return true;
    });
    return send(201, fresh.map((_, i) => ({ id: i + 1 })));
  }

  send(404, { message: `stub has no route for ${url.pathname}` });
});

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : null);
      } catch {
        resolve(null);
      }
    });
  });
}

server.listen(54321, () => console.log("stub supabase on :54321"));
