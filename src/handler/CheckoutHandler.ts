import { HttpApiBuilder } from "effect/http-api";
import { Effect } from "effect";
import {
  Api,
  CheckoutForbiddenError,
  CheckoutUnauthorizedError,
  CustomerNotEligibleError,
  CustomerNotFoundError,
  FilmsNotFoundError,
  FilmsUnavailableError,
  RentalError,
} from "../api/index.js";
import { SqlError } from "effect/sql";
import { RentalService } from "../service/RentalService.js";
import * as Service from "../service/RentalService.js";
import { requireStaff } from "../middleware/auth.js";
import { CheckoutInput } from "../schema/Checkout.js";
import { StaffId } from "../schema/Ids.js";

// ============================================================
// Checkout Handler Implementation
// ============================================================

// requireStaff fails with a plain Error; split it into 401 (no or bad token)
// and 403 (valid token, but not staff)
const authorizeStaff = requireStaff.pipe(
  Effect.mapError((err) => {
    const message = err instanceof Error ? err.message : "Authentication required";
    return message === "Staff authentication required"
      ? new CheckoutForbiddenError({ message })
      : new CheckoutUnauthorizedError({ message });
  }),
);

// Service errors → HTTP errors. Database failures are logged and turned into
// a generic 500 so SQL details never reach the client.
type CheckoutFailure =
  | CheckoutUnauthorizedError
  | CheckoutForbiddenError
  | Service.CustomerNotFoundError
  | Service.CustomerNotEligibleError
  | Service.FilmsNotFoundError
  | Service.FilmsUnavailableError
  | SqlError.SqlError;

const toApiErrors = <A, R>(input: CheckoutInput, effect: Effect.Effect<A, CheckoutFailure, R>) =>
  effect.pipe(Effect.catchTags({
    CustomerNotFoundError: () =>
      Effect.fail(
        new CustomerNotFoundError({ message: `Customer ${input.customerId} not found`, customerId: input.customerId }),
      ),
    CustomerNotEligibleError: (err) =>
      Effect.fail(
        new CustomerNotEligibleError({
          message: `Customer ${input.customerId} is not eligible to rent`,
          customerId: input.customerId,
          reasons: err.reasons,
        }),
      ),
    FilmsNotFoundError: (err) =>
      Effect.fail(
        new FilmsNotFoundError({ message: `Films not found: ${err.filmIds.join(", ")}`, filmIds: err.filmIds }),
      ),
    FilmsUnavailableError: (err) =>
      Effect.fail(
        new FilmsUnavailableError({
          message: `No copy available at store ${input.storeId} for films: ${err.filmIds.join(", ")}`,
          storeId: input.storeId,
          filmIds: err.filmIds,
        }),
      ),
    SqlError: (err) =>
      Effect.logError("Checkout failed", err).pipe(
        Effect.andThen(Effect.fail(new RentalError({ message: "Checkout failed" }))),
      ),
  }));

export const CheckoutHandler = HttpApiBuilder.group(Api, "checkout", (handlers) =>
  handlers
    // Protected: Staff only - price a basket without renting it
    .handle("quote", ({ payload }) =>
      toApiErrors(payload, Effect.gen(function* () {
        yield* authorizeStaff;
        const rentalService = yield* RentalService;
        return yield* rentalService.quoteCheckout(payload);
      })),
    )
    // Protected: Staff only, at their own store - rent and pay
    .handle("checkout", ({ payload }) =>
      toApiErrors(payload, Effect.gen(function* () {
        const staff = yield* authorizeStaff;
        if (staff.storeId !== payload.storeId) {
          return yield* Effect.fail(
            new CheckoutForbiddenError({ message: `Staff can only check out at their own store (${staff.storeId})` }),
          );
        }
        const rentalService = yield* RentalService;
        return yield* rentalService.checkout(payload, staff.id as StaffId);
      })),
    ),
);
