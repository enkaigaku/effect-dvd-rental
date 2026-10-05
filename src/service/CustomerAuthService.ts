import { Context, Effect, Layer, Data, Redacted } from "effect";
import * as bcrypt from "bcrypt";
import * as jose from "jose";
import { SqlClient } from "effect/sql";
import { CustomerId, StoreId } from "../schema/Ids.js";
import { JwtConfig } from "../config/AppConfig.js";

// ============================================================
// Customer Auth Errors
// ============================================================

export class CustomerNotFoundError extends Data.TaggedError("CustomerNotFoundError")<{
  readonly email: string;
}> {}

export class InvalidPasswordError extends Data.TaggedError("InvalidPasswordError")<{
  readonly message?: string;
}> {}

export class EmailAlreadyExistsError extends Data.TaggedError("EmailAlreadyExistsError")<{
  readonly email: string;
}> {}

// ============================================================
// Customer Auth Types
// ============================================================

export interface CustomerAuthResult {
  customerId: CustomerId;
  email: string;
  firstName: string;
  lastName: string;
  token: string;
}

export interface CustomerProfile {
  customerId: CustomerId;
  email: string;
  firstName: string;
  lastName: string;
  storeId: StoreId;
  isActive: boolean;
  createDate: Date;
}

// ============================================================
// Customer Auth Service (uses Effect Config for JWT)
// ============================================================

export class CustomerAuthService extends Context.Service<CustomerAuthService>()("CustomerAuthService", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const jwtConfigData = yield* JwtConfig;
    const jwtSecretValue = Redacted.value(jwtConfigData.secret);
    const jwtSecret = new TextEncoder().encode(jwtSecretValue);

    return {
      // Customer login
      login: Effect.fn("CustomerAuthService.login")(function* (email: string, password: string) {
          yield* Effect.logInfo(`Customer login attempt: ${email}`);

          const rows = yield* sql`
            SELECT customer_id, email, first_name, last_name, password_hash, activebool
            FROM customer
            WHERE email = ${email}
          `;

          if (!rows[0]) {
            return yield* Effect.fail(new CustomerNotFoundError({ email }));
          }

          const customer = rows[0] as any;

          if (!customer.activebool) {
            return yield* Effect.fail(new CustomerNotFoundError({ email }));
          }

          const isValid = yield* Effect.promise(() =>
            bcrypt.compare(password, customer.password_hash ?? "")
          );

          if (!isValid) {
            return yield* Effect.fail(new InvalidPasswordError({}));
          }

          const token = yield* Effect.promise(() =>
            new jose.SignJWT({ 
              sub: String(customer.customer_id), 
              email: customer.email,
              type: "customer"
            })
              .setProtectedHeader({ alg: "HS256" })
              .setIssuedAt()
              .setExpirationTime("7d")
              .sign(jwtSecret)
          );

          yield* Effect.logInfo(`Customer logged in: ${customer.customer_id}`);

          return {
            customerId: customer.customer_id,
            email: customer.email,
            firstName: customer.first_name,
            lastName: customer.last_name,
            token,
          } as CustomerAuthResult;
      }),

      // Customer registration (for new customers without full address)
      register: Effect.fn("CustomerAuthService.register")(function* (email: string, password: string, firstName: string, lastName: string, storeId: StoreId = 1 as StoreId) {
          yield* Effect.logInfo(`Customer registration: ${email}`);

          // Check if email already exists
          const existing = yield* sql`
            SELECT customer_id FROM customer WHERE email = ${email}
          `;

          if (existing[0]) {
            return yield* Effect.fail(new EmailAlreadyExistsError({ email }));
          }

          // Hash password
          const passwordHash = yield* Effect.promise(() => bcrypt.hash(password, 10));

          // Create customer with a default address (address_id = 1)
          // In production, you'd handle address creation separately
          const result = yield* sql`
            INSERT INTO customer (store_id, first_name, last_name, email, address_id, password_hash, activebool)
            VALUES (${storeId}, ${firstName}, ${lastName}, ${email}, 1, ${passwordHash}, true)
            RETURNING customer_id
          `;

          const customerId = result[0]?.["customer_id"] as number;

          // Generate token
          const token = yield* Effect.promise(() =>
            new jose.SignJWT({ 
              sub: String(customerId), 
              email,
              type: "customer"
            })
              .setProtectedHeader({ alg: "HS256" })
              .setIssuedAt()
              .setExpirationTime("7d")
              .sign(jwtSecret)
          );

          yield* Effect.logInfo(`Customer registered: ${customerId}`);

          return {
            customerId,
            email,
            firstName,
            lastName,
            token,
          } as CustomerAuthResult;
      }),

      // Get customer profile
      getProfile: Effect.fn("CustomerAuthService.getProfile")(function* (customerId: CustomerId) {
          const rows = yield* sql`
            SELECT customer_id, email, first_name, last_name, store_id, activebool, create_date
            FROM customer
            WHERE customer_id = ${customerId}
          `;

          if (!rows[0]) return undefined;

          const row = rows[0] as any;
          return {
            customerId: row.customer_id,
            email: row.email,
            firstName: row.first_name,
            lastName: row.last_name,
            storeId: row.store_id,
            isActive: row.activebool,
            createDate: row.create_date,
          } as CustomerProfile;
      }),

      // Update password
      updatePassword: Effect.fn("CustomerAuthService.updatePassword")(function* (customerId: CustomerId, currentPassword: string, newPassword: string) {
          const rows = yield* sql`
            SELECT password_hash FROM customer WHERE customer_id = ${customerId}
          `;

          if (!rows[0]) {
            return yield* Effect.fail(new CustomerNotFoundError({ email: "" }));
          }

          const isValid = yield* Effect.promise(() =>
            bcrypt.compare(currentPassword, (rows[0] as any).password_hash ?? "")
          );

          if (!isValid) {
            return yield* Effect.fail(new InvalidPasswordError({}));
          }

          const newHash = yield* Effect.promise(() => bcrypt.hash(newPassword, 10));

          yield* sql`
            UPDATE customer SET password_hash = ${newHash}, last_update = NOW()
            WHERE customer_id = ${customerId}
          `;

          yield* Effect.logInfo(`Customer password updated: ${customerId}`);
          return true;
      }),

      // Verify JWT token
      verifyToken: Effect.fn("CustomerAuthService.verifyToken")(function* (token: string) {
          const result = yield* Effect.tryPromise({
            try: () => jose.jwtVerify(token, jwtSecret),
            catch: () => new Error("Invalid token"),
          });

          return {
            customerId: Number(result.payload.sub),
            email: result.payload["email"] as string,
            type: result.payload["type"] as string,
          };
      }),
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
