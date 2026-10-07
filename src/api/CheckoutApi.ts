import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api";
import { Schema } from "effect";
import { CheckoutInput, CheckoutQuote, CheckoutReceipt } from "../schema/Checkout.js";
import { CustomerNotFoundError, CustomerNotEligibleError, RentalError } from "./RentalApi.js";

// ============================================================
// Checkout API Error Schemas
// ============================================================

export class CheckoutUnauthorizedError extends Schema.TaggedError<CheckoutUnauthorizedError>()(
  "CheckoutUnauthorizedError",
  { message: Schema.String },
  { httpApiStatus: 401 }
) {}

export class CheckoutForbiddenError extends Schema.TaggedError<CheckoutForbiddenError>()(
  "CheckoutForbiddenError",
  { message: Schema.String },
  { httpApiStatus: 403 }
) {}

export class FilmsNotFoundError extends Schema.TaggedError<FilmsNotFoundError>()(
  "FilmsNotFoundError",
  { message: Schema.String, filmIds: Schema.Array(Schema.Number) },
  { httpApiStatus: 404 }
) {}

export class FilmsUnavailableError extends Schema.TaggedError<FilmsUnavailableError>()(
  "FilmsUnavailableError",
  { message: Schema.String, storeId: Schema.Number, filmIds: Schema.Array(Schema.Number) },
  { httpApiStatus: 409 }
) {}

const checkoutErrors = [
  CheckoutUnauthorizedError,
  CheckoutForbiddenError,
  CustomerNotFoundError,
  FilmsNotFoundError,
  CustomerNotEligibleError,
  FilmsUnavailableError,
  RentalError,
] as const;

// ============================================================
// Checkout API Definition
// ============================================================

export class CheckoutApi extends HttpApiGroup.make("checkout").add(
  HttpApiEndpoint.post("quote", "/checkout/quote", {
    payload: CheckoutInput,
    success: CheckoutQuote,
    error: checkoutErrors,
  })
    .annotate(OpenApi.Summary, "Quote a checkout")
    .annotate(
      OpenApi.Description,
      "Price a basket of 1-10 films for a customer and check it could be rented, without reserving copies or taking payment. Fails with the same errors as checkout. Requires staff authentication.",
    ),
  HttpApiEndpoint.post("checkout", "/checkout", {
    payload: CheckoutInput,
    success: CheckoutReceipt,
    error: checkoutErrors,
  })
    .annotate(OpenApi.Summary, "Check out films")
    .annotate(
      OpenApi.Description,
      "Rent 1-10 films to a customer and take payment in one transaction: either every film is rented and paid for, or nothing is. Applies promotions (3 for 2: the cheapest disc in every group of three is free). Staff can only check out at their own store.",
    ),
) {}
