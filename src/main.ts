import { Effect, Layer } from "effect";
import { BunRuntime } from "@effect/platform-bun";
import { HttpRouter } from "effect/http";
import { ApiLive, DocsLive } from "./handler/index.js";
import { ServerLive } from "./config/Server.js";
import { CorsLive, allowedOrigins } from "./config/Cors.js";
import { RateLimiterLive } from "./config/RateLimiter.js";
import { ServicesLive } from "./config/Services.js";
import { TracingLive } from "./config/Telemetry.js";
import { LoggerLive } from "./config/Logger.js";
import { ServerConfig, LogConfig, RateLimiterConfig } from "./config/AppConfig.js";

// ============================================================
// Bootstrap
// ============================================================

const HttpLive = HttpRouter.serve(
  Layer.mergeAll(ApiLive, DocsLive, CorsLive, RateLimiterLive),
  // Keep the v3 output: no per-request access log, no "Listening on" line
  { disableLogger: true, disableListenLog: true },
).pipe(
  Layer.provide(ServicesLive),
  Layer.provide(ServerLive),
);

// Print startup info (reads from Effect Config)
const printStartupInfo = Effect.gen(function* () {
  const server = yield* ServerConfig;
  const log = yield* LogConfig;
  const rateLimit = yield* RateLimiterConfig;
  
  yield* Effect.logInfo("🚀 DVD Rental API starting...");
  yield* Effect.logInfo(`📍 Server: http://localhost:${server.port}`);
  yield* Effect.logInfo(`📖 Swagger: http://localhost:${server.port}/docs`);
  yield* Effect.logInfo(`📊 Log level: ${log.level}`);
  yield* Effect.logInfo(`🌐 CORS: ${allowedOrigins.join(", ")}`);
  yield* Effect.logInfo(`🛡️  Rate limit: ${rateLimit.maxRequests} req/${rateLimit.windowMs / 1000}s`);
  yield* Effect.logInfo("🔭 Jaeger: http://localhost:16686");
  yield* Effect.logInfo("📚 Endpoints:");
  yield* Effect.logInfo("   Health:     GET  /health, /ready");
  yield* Effect.logInfo("   Films:      GET  /films, /films/:id, /films/:id/actors, /films/:id/availability");
  yield* Effect.logInfo("   Categories: GET  /categories");
  yield* Effect.logInfo("   Stores:     GET  /stores, /stores/:id, /stores/:storeId/films/:filmId/availability");
  yield* Effect.logInfo("   Rentals:    POST /rentals, PUT /rentals/:id/return, GET /customers/:id/rentals");
  yield* Effect.logInfo("   Checkout:   POST /checkout/quote, POST /checkout");
  yield* Effect.logInfo("   Payments:   POST /payments, GET /payments/:id, /customers/:id/payments, /customers/:id/balance");
  yield* Effect.logInfo("   Customer:   POST /customer/login, /customer/register, GET /customer/profile/:id");
  yield* Effect.logInfo("   Staff:      POST /staff/login, GET /staff, /staff/profile/:id");
});

// Startup layer that prints info and then launches the HTTP server.
// Logger and tracing are provided outermost so the startup banner, the server
// and every request use them.
const StartupLive = Layer.effectDiscard(printStartupInfo).pipe(
  Layer.provideMerge(HttpLive),
  Layer.provide(TracingLive),
  Layer.provide(LoggerLive),
);

const app = Layer.launch(StartupLive);

BunRuntime.runMain(app);

