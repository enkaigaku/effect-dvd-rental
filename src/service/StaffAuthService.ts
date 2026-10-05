import { Context, Effect, Layer, Data, Redacted } from "effect";
import * as bcrypt from "bcrypt";
import * as jose from "jose";
import { SqlClient } from "effect/sql";
import { StaffId, StoreId } from "../schema/Ids.js";
import { JwtConfig } from "../config/AppConfig.js";

// ============================================================
// Staff Auth Errors
// ============================================================

export class StaffNotFoundError extends Data.TaggedError("StaffNotFoundError")<{
  readonly username: string;
}> {}

export class StaffInvalidPasswordError extends Data.TaggedError("StaffInvalidPasswordError")<{
  readonly message?: string;
}> {}

export class StaffInactiveError extends Data.TaggedError("StaffInactiveError")<{
  readonly username: string;
}> {}

// ============================================================
// Staff Auth Types
// ============================================================

export interface StaffAuthResult {
  staffId: StaffId;
  username: string;
  firstName: string;
  lastName: string;
  storeId: StoreId;
  token: string;
}

export interface StaffProfile {
  staffId: StaffId;
  username: string;
  email: string | null;
  firstName: string;
  lastName: string;
  storeId: StoreId;
  isActive: boolean;
}

// ============================================================
// Staff Auth Service (uses Effect Config for JWT)
// ============================================================

export class StaffAuthService extends Context.Service<StaffAuthService>()("StaffAuthService", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const jwtConfigData = yield* JwtConfig;
    const jwtSecretValue = Redacted.value(jwtConfigData.secret);
    const jwtSecret = new TextEncoder().encode(jwtSecretValue);

    return {
      // Staff login
      login: Effect.fn("StaffAuthService.login")(function* (username: string, password: string) {
          yield* Effect.logInfo(`Staff login attempt: ${username}`);

          const rows = yield* sql`
            SELECT staff_id, username, first_name, last_name, email, store_id, active, password_hash
            FROM staff
            WHERE username = ${username}
          `;

          if (!rows[0]) {
            return yield* Effect.fail(new StaffNotFoundError({ username }));
          }

          const staff = rows[0] as any;

          if (!staff.active) {
            return yield* Effect.fail(new StaffInactiveError({ username }));
          }

          const isValid = yield* Effect.promise(() =>
            bcrypt.compare(password, staff.password_hash ?? "")
          );

          if (!isValid) {
            return yield* Effect.fail(new StaffInvalidPasswordError({}));
          }

          const token = yield* Effect.promise(() =>
            new jose.SignJWT({ 
              sub: String(staff.staff_id), 
              username: staff.username,
              storeId: staff.store_id,
              type: "staff"
            })
              .setProtectedHeader({ alg: "HS256" })
              .setIssuedAt()
              .setExpirationTime("8h") // Shorter expiry for staff
              .sign(jwtSecret)
          );

          yield* Effect.logInfo(`Staff logged in: ${staff.staff_id}`);

          return {
            staffId: staff.staff_id,
            username: staff.username,
            firstName: staff.first_name,
            lastName: staff.last_name,
            storeId: staff.store_id,
            token,
          } as StaffAuthResult;
      }),

      // Get staff profile
      getProfile: Effect.fn("StaffAuthService.getProfile")(function* (staffId: StaffId) {
          const rows = yield* sql`
            SELECT staff_id, username, email, first_name, last_name, store_id, active
            FROM staff
            WHERE staff_id = ${staffId}
          `;

          if (!rows[0]) return undefined;

          const row = rows[0] as any;
          return {
            staffId: row.staff_id,
            username: row.username,
            email: row.email,
            firstName: row.first_name,
            lastName: row.last_name,
            storeId: row.store_id,
            isActive: row.active,
          } as StaffProfile;
      }),

      // Update password
      updatePassword: Effect.fn("StaffAuthService.updatePassword")(function* (staffId: StaffId, currentPassword: string, newPassword: string) {
          const rows = yield* sql`
            SELECT password_hash FROM staff WHERE staff_id = ${staffId}
          `;

          if (!rows[0]) {
            return yield* Effect.fail(new StaffNotFoundError({ username: "" }));
          }

          const isValid = yield* Effect.promise(() =>
            bcrypt.compare(currentPassword, (rows[0] as any).password_hash ?? "")
          );

          if (!isValid) {
            return yield* Effect.fail(new StaffInvalidPasswordError({}));
          }

          const newHash = yield* Effect.promise(() => bcrypt.hash(newPassword, 10));

          yield* sql`
            UPDATE staff SET password_hash = ${newHash}
            WHERE staff_id = ${staffId}
          `;

          yield* Effect.logInfo(`Staff password updated: ${staffId}`);
          return true;
      }),

      // Verify JWT token
      verifyToken: Effect.fn("StaffAuthService.verifyToken")(function* (token: string) {
          const result = yield* Effect.tryPromise({
            try: () => jose.jwtVerify(token, jwtSecret),
            catch: () => new Error("Invalid token"),
          });

          return {
            staffId: Number(result.payload.sub),
            username: result.payload["username"] as string,
            storeId: result.payload["storeId"] as number,
            type: result.payload["type"] as string,
          };
      }),

      // List all staff members
      listStaff: Effect.fn("StaffAuthService.listStaff")(function* () {
          const rows = yield* sql`
            SELECT staff_id, username, email, first_name, last_name, store_id, active
            FROM staff
            ORDER BY staff_id
          `;

          return rows.map((row: any) => ({
            staffId: row.staff_id,
            username: row.username,
            email: row.email,
            firstName: row.first_name,
            lastName: row.last_name,
            storeId: row.store_id,
            isActive: row.active,
          } as StaffProfile));
      }),
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
