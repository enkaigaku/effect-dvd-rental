/**
 * API snapshot ("golden master") for the Effect 3 → 4 migration.
 *
 * Sends a fixed list of requests to a running server and writes every
 * status code, selected headers and body to a JSON file, plus the OpenAPI
 * spec embedded in /docs. Run it before and after a change and diff the
 * two outputs.
 *
 * Requires a freshly migrated database (the mutation cases at the end
 * create a rental, a payment and a customer) and a rate limit high enough
 * for ~100 requests:
 *
 *   RATE_LIMIT_MAX_REQUESTS=10000 bun src/main.ts
 *   bun tests/snapshot/api-snapshot.ts snapshots/out
 */
import { generateCustomerToken, generateStaffToken } from "../utils/auth.js";

const BASE_URL = process.env["API_BASE_URL"] ?? "http://localhost:8080";
const outDir = process.argv[2] ?? "snapshot-out";

interface Case {
  readonly name: string;
  readonly method?: string;
  readonly path: string;
  readonly token?: string;
  readonly body?: unknown;
  readonly rawBody?: string;
  readonly headers?: Record<string, string>;
  /** Keys whose values change between runs (ids, timestamps) */
  readonly volatile?: ReadonlyArray<string>;
}

const KEPT_HEADERS = [
  "content-type",
  "retry-after",
  "access-control-allow-origin",
  "access-control-allow-methods",
  "access-control-allow-headers",
  "access-control-allow-credentials",
];

const ALWAYS_VOLATILE = ["token"];

const normalize = (value: unknown, keys: ReadonlyArray<string>): unknown => {
  if (Array.isArray(value)) return value.map((v) => normalize(v, keys));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, keys.includes(k) ? `<${k}>` : normalize(v, keys)]),
    );
  }
  return value;
};

const run = async (c: Case, ids: Record<string, string>) => {
  const path = c.path.replace(/\{(\w+)\}/g, (_, key: string) => ids[key] ?? `{${key}}`);
  const headers: Record<string, string> = { ...c.headers };
  if (c.body !== undefined || c.rawBody !== undefined) headers["content-type"] = "application/json";
  if (c.token) headers["authorization"] = c.token.startsWith("Bearer") ? c.token : `Bearer ${c.token}`;

  const response = await fetch(`${BASE_URL}${path}`, {
    method: c.method ?? "GET",
    headers,
    ...(c.rawBody !== undefined
      ? { body: c.rawBody }
      : c.body !== undefined
        ? { body: JSON.stringify(c.body) }
        : {}),
  });

  const text = await response.text();
  let body: unknown = text;
  try {
    body = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    // keep text
  }

  const keptHeaders = Object.fromEntries(
    KEPT_HEADERS.flatMap((h) => {
      const v = response.headers.get(h);
      return v === null ? [] : [[h, v]];
    }),
  );

  return {
    request: `${c.method ?? "GET"} ${path}`,
    status: response.status,
    headers: keptHeaders,
    body: normalize(body, [...ALWAYS_VOLATILE, ...(c.volatile ?? [])]),
    raw: body,
  };
};

const customer1 = await generateCustomerToken(1, "MARY.SMITH@sakilacustomer.org");
const customer2 = await generateCustomerToken(2, "PATRICIA.JOHNSON@sakilacustomer.org");
const staff1 = await generateStaffToken(1, "Mike", 1);
const staff2 = await generateStaffToken(2, "Jon", 2);

const cases: ReadonlyArray<Case> = [
  // ---------------- health ----------------
  { name: "health", path: "/health" },
  { name: "ready", path: "/ready" },
  { name: "unknown route", path: "/does-not-exist" },

  // ---------------- films ----------------
  { name: "films list", path: "/films" },
  { name: "films page 2 limit 5", path: "/films?page=2&limit=5" },
  { name: "films search", path: "/films?search=ACADEMY&limit=3" },
  { name: "films by category", path: "/films?categoryId=1&limit=3" },
  { name: "films by rating", path: "/films?rating=PG&limit=3" },
  { name: "films page=abc", path: "/films?page=abc" },
  { name: "films limit=0", path: "/films?limit=0" },
  { name: "film 1", path: "/films/1" },
  { name: "film 99999", path: "/films/99999" },
  { name: "film abc", path: "/films/abc" },
  { name: "film 1.5", path: "/films/1.5" },
  { name: "film -1", path: "/films/-1" },
  { name: "film empty-ish 0", path: "/films/0" },
  { name: "film 1 actors", path: "/films/1/actors" },
  { name: "film abc actors", path: "/films/abc/actors" },
  { name: "film 99999 actors", path: "/films/99999/actors" },
  { name: "categories", path: "/categories" },

  // ---------------- inventory ----------------
  { name: "stores", path: "/stores" },
  { name: "store 1", path: "/stores/1" },
  { name: "store 999", path: "/stores/999" },
  { name: "store abc", path: "/stores/abc" },
  { name: "film 1 availability", path: "/films/1/availability" },
  { name: "film abc availability", path: "/films/abc/availability" },
  { name: "store 1 film 1 availability", path: "/stores/1/films/1/availability" },
  { name: "store 1 film 99999 availability", path: "/stores/1/films/99999/availability" },
  { name: "store 1 film abc availability", path: "/stores/1/films/abc/availability" },

  // ---------------- rentals (read) ----------------
  { name: "rental 76 no token", path: "/rentals/76" },
  { name: "rental 76 bad token", path: "/rentals/76", token: "Bearer not-a-jwt" },
  { name: "rental 76 customer", path: "/rentals/76", token: customer1 },
  { name: "rental 76 staff", path: "/rentals/76", token: staff1 },
  { name: "rental 99999999 staff", path: "/rentals/99999999", token: staff1 },
  { name: "rental abc staff", path: "/rentals/abc", token: staff1 },
  { name: "customer 1 rentals no token", path: "/customers/1/rentals" },
  { name: "customer 1 rentals own", path: "/customers/1/rentals", token: customer1 },
  { name: "customer 1 rentals other customer", path: "/customers/1/rentals", token: customer2 },
  { name: "customer 1 rentals staff", path: "/customers/1/rentals", token: staff1 },
  { name: "customer 99999 rentals staff", path: "/customers/99999/rentals", token: staff1 },
  { name: "customer 1 info staff", path: "/customers/1", token: staff1 },
  { name: "customer 1 info other customer", path: "/customers/1", token: customer2 },
  { name: "customer 99999 info staff", path: "/customers/99999", token: staff1 },

  // ---------------- payments (read) ----------------
  { name: "payment 16677 no token", path: "/payments/16677" },
  { name: "payment 16677 staff", path: "/payments/16677", token: staff1 },
  { name: "payment 99999999 staff", path: "/payments/99999999", token: staff1 },
  { name: "customer 1 payments own", path: "/customers/1/payments", token: customer1 },
  { name: "customer 1 payments other customer", path: "/customers/1/payments", token: customer2 },
  { name: "customer 1 balance own", path: "/customers/1/balance", token: customer1 },
  { name: "customer 1 balance staff", path: "/customers/1/balance", token: staff1 },
  { name: "customer 99999 balance staff", path: "/customers/99999/balance", token: staff1 },

  // ---------------- customer auth ----------------
  {
    name: "customer login ok",
    method: "POST",
    path: "/customer/login",
    body: { email: "MARY.SMITH@sakilacustomer.org", password: "changeme" },
  },
  {
    name: "customer login wrong password",
    method: "POST",
    path: "/customer/login",
    body: { email: "MARY.SMITH@sakilacustomer.org", password: "nope" },
  },
  {
    name: "customer login unknown email",
    method: "POST",
    path: "/customer/login",
    body: { email: "nobody@example.com", password: "changeme" },
  },
  { name: "customer login missing field", method: "POST", path: "/customer/login", body: { email: "x" } },
  { name: "customer login malformed json", method: "POST", path: "/customer/login", rawBody: "{not json" },
  { name: "customer profile own", path: "/customer/profile/1", token: customer1 },
  { name: "customer profile other", path: "/customer/profile/1", token: customer2 },
  { name: "customer profile no token", path: "/customer/profile/1" },
  { name: "customer profile staff token", path: "/customer/profile/1", token: staff1 },
  {
    name: "customer password wrong current",
    method: "PUT",
    path: "/customer/password/1",
    token: customer1,
    body: { currentPassword: "nope", newPassword: "x" },
  },

  // ---------------- staff auth ----------------
  { name: "staff login ok", method: "POST", path: "/staff/login", body: { username: "Mike", password: "changeme" } },
  { name: "staff login wrong password", method: "POST", path: "/staff/login", body: { username: "Mike", password: "nope" } },
  { name: "staff login unknown", method: "POST", path: "/staff/login", body: { username: "ghost", password: "x" } },
  { name: "staff list no token", path: "/staff" },
  { name: "staff list customer token", path: "/staff", token: customer1 },
  { name: "staff list staff", path: "/staff", token: staff1 },
  { name: "staff profile 2", path: "/staff/profile/2", token: staff1 },
  { name: "staff profile 999", path: "/staff/profile/999", token: staff1 },
  {
    name: "staff password other staff",
    method: "PUT",
    path: "/staff/password/1",
    token: staff2,
    body: { currentPassword: "changeme", newPassword: "x" },
  },
  {
    name: "staff password wrong current",
    method: "PUT",
    path: "/staff/password/1",
    token: staff1,
    body: { currentPassword: "nope", newPassword: "x" },
  },

  // ---------------- CORS ----------------
  {
    name: "cors preflight allowed origin",
    method: "OPTIONS",
    path: "/films",
    headers: {
      origin: "http://localhost:3000",
      "access-control-request-method": "GET",
      "access-control-request-headers": "authorization",
    },
  },
  { name: "cors simple allowed origin", path: "/health", headers: { origin: "http://localhost:3000" } },
  { name: "cors simple other origin", path: "/health", headers: { origin: "http://evil.example" } },

  // ---------------- mutations (keep last) ----------------
  { name: "create rental no token", method: "POST", path: "/rentals", body: { filmId: 1, customerId: 1, storeId: 1 } },
  {
    name: "create rental customer token",
    method: "POST",
    path: "/rentals",
    token: customer1,
    body: { filmId: 1, customerId: 1, storeId: 1 },
  },
  { name: "create rental missing field", method: "POST", path: "/rentals", token: staff1, body: { filmId: 1 } },
  {
    name: "create rental unknown customer",
    method: "POST",
    path: "/rentals",
    token: staff1,
    body: { filmId: 1, customerId: 99999, storeId: 1 },
  },
  {
    name: "create rental film without copies",
    method: "POST",
    path: "/rentals",
    token: staff1,
    body: { filmId: 2, customerId: 1, storeId: 1 },
  },
  {
    name: "create rental ok",
    method: "POST",
    path: "/rentals",
    token: staff1,
    body: { filmId: 1, customerId: 1, storeId: 1 },
    volatile: ["rentalId", "rentalDate", "dueDate", "inventoryId"],
  },
  {
    name: "return rental ok",
    method: "PUT",
    path: "/rentals/{rentalId}/return",
    token: staff1,
    volatile: ["rentalId", "returnDate"],
  },
  {
    name: "return rental again",
    method: "PUT",
    path: "/rentals/{rentalId}/return",
    token: staff1,
    volatile: ["message"],
  },
  { name: "return rental unknown", method: "PUT", path: "/rentals/99999999/return", token: staff1 },
  {
    name: "create payment zero",
    method: "POST",
    path: "/payments",
    token: staff1,
    body: { customerId: 1, rentalId: 76, amount: 0 },
  },
  {
    name: "create payment customer token",
    method: "POST",
    path: "/payments",
    token: customer1,
    body: { customerId: 1, rentalId: 76, amount: 1 },
  },
  {
    name: "create payment ok",
    method: "POST",
    path: "/payments",
    token: staff1,
    body: { customerId: 1, rentalId: 76, amount: 1.5 },
    volatile: ["paymentId", "paymentDate"],
  },
  {
    name: "register ok",
    method: "POST",
    path: "/customer/register",
    body: { email: "snapshot@example.com", password: "pw", firstName: "Snap", lastName: "Shot" },
    volatile: ["customerId"],
  },
  {
    name: "register duplicate",
    method: "POST",
    path: "/customer/register",
    body: { email: "snapshot@example.com", password: "pw", firstName: "Snap", lastName: "Shot" },
  },
];

const ids: Record<string, string> = {};
const results: Record<string, unknown> = {};
for (const c of cases) {
  const { raw, ...result } = await run(c, ids);
  if (c.name === "create rental ok" && raw && typeof raw === "object" && "rentalId" in raw) {
    ids["rentalId"] = String(raw.rentalId);
  }
  results[c.name] = result;
}

const docs = await fetch(`${BASE_URL}/docs`).then((r) => r.text());
const specMatch = docs.match(/<script id="swagger-spec" type="application\/json">([\s\S]*?)<\/script>/);
const spec = specMatch?.[1] ? JSON.parse(specMatch[1]) : null;

await Bun.write(`${outDir}/responses.json`, JSON.stringify(results, null, 2) + "\n");
await Bun.write(`${outDir}/openapi.json`, JSON.stringify(spec, null, 2) + "\n");

const statuses = Object.values(results).map((r) => (r as { status: number }).status);
console.log(`Wrote ${statuses.length} responses and the OpenAPI spec to ${outDir}/`);
