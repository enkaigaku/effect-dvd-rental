import { Effect, Ref, Clock, Schedule, Duration, Option, Types } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { RateLimiterConfig } from "./AppConfig.js";
// ============================================================
// Rate Limiter Configuration (uses Effect Config)
// ============================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// ============================================================
// Rate Limiter Middleware Builder
// ============================================================

export const makeRateLimiterMiddleware = Effect.gen(function* () {
  // Load config
  const config = yield* RateLimiterConfig;
  const { windowMs, maxRequests } = config;
  
  // Shared state for storing request counts per IP
  const state = yield* Ref.make(new Map<string, RateLimitEntry>());

  // Background cleanup task to remove expired entries
  yield* Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    yield* Ref.update(state, (map) => {
      const newMap = new Map(map);
      for (const [ip, entry] of newMap.entries()) {
        if (now > entry.resetTime) {
          newMap.delete(ip);
        }
      }
      return newMap;
    });
  }).pipe(
    Effect.repeat(Schedule.spaced(Duration.millis(windowMs))),
    // Runs for as long as the middleware layer is alive
    Effect.forkScoped,
  );

  return (app: Effect.Effect<HttpServerResponse.HttpServerResponse, Types.unhandled>) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const ip = Option.getOrElse(request.remoteAddress, () => "unknown");
      const now = yield* Clock.currentTimeMillis;

      const isAllowed = yield* Ref.modify(state, (map) => {
        const newMap = new Map(map);
        const entry = newMap.get(ip);

        if (!entry || now > entry.resetTime) {
          newMap.set(ip, { count: 1, resetTime: now + windowMs });
          return [true, newMap] as const;
        }

        if (entry.count >= maxRequests) {
          return [false, newMap] as const;
        }

        newMap.set(ip, { ...entry, count: entry.count + 1 });
        return [true, newMap] as const;
      });

      if (!isAllowed) {
        // A constant body cannot fail to encode, so use the non-Effect variant
        return HttpServerResponse.jsonUnsafe(
          { error: "Too Many Requests" },
          {
            status: 429,
            headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) },
          },
        );
      }

      return yield* app;
    });
});

// ============================================================
// Rate Limiter Layer
// ============================================================

export const RateLimiterLive = HttpRouter.middleware(makeRateLimiterMiddleware, {
  global: true,
});
