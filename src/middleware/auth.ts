import { Effect, Context, Redacted } from "effect";
import * as jose from "jose";
import { HttpServerRequest } from "effect/http";
import { JwtConfig } from "../config/AppConfig.js";

// ============================================================
// Auth Context for carrying authenticated user info
// ============================================================

export interface AuthUser {
  readonly id: number;
  readonly type: "customer" | "staff";
  readonly email?: string;
  readonly username?: string;
  readonly storeId?: number;
}

export class CurrentUser extends Context.Service<CurrentUser, AuthUser>()("CurrentUser") {}

// ============================================================
// JWT Verification (uses Effect Config)
// ============================================================

export const verifyJwtToken = (token: string) =>
  Effect.gen(function* () {
    const config = yield* JwtConfig;
    const secretValue = Redacted.value(config.secret);
    const jwtSecret = new TextEncoder().encode(secretValue);
    
    const result = yield* Effect.tryPromise({
      try: async () => jose.jwtVerify(token, jwtSecret),
      catch: () => new Error("Invalid or expired token"),
    });
    
    return {
      id: Number(result.payload.sub),
      type: result.payload["type"] as "customer" | "staff",
      email: result.payload["email"] as string | undefined,
      username: result.payload["username"] as string | undefined,
      storeId: result.payload["storeId"] as number | undefined,
    } as AuthUser;
  });

// ============================================================
// Auth Extraction Helper
// ============================================================

export const extractBearerToken = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const authHeader = request.headers["authorization"];
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return yield* Effect.fail(new Error("Missing or invalid Authorization header"));
  }
  
  return authHeader.substring(7);
});

export const requireAuth = Effect.gen(function* () {
  const token = yield* extractBearerToken;
  const user = yield* verifyJwtToken(token);
  return user;
});

// ============================================================
// Auth Layer Provider
// ============================================================

export const withAuth = <A, E, R>(effect: Effect.Effect<A, E, R | CurrentUser>) =>
  Effect.gen(function* () {
    const user = yield* requireAuth;
    return yield* effect.pipe(
      Effect.provideService(CurrentUser, user)
    );
  });

// ============================================================
// Role-based Auth Helpers
// ============================================================

export const requireCustomer = Effect.gen(function* () {
  const user = yield* requireAuth;
  if (user.type !== "customer") {
    return yield* Effect.fail(new Error("Customer authentication required"));
  }
  return user;
});

export const requireStaff = Effect.gen(function* () {
  const user = yield* requireAuth;
  if (user.type !== "staff") {
    return yield* Effect.fail(new Error("Staff authentication required"));
  }
  return user;
});
