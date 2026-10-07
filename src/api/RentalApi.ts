import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api";
import { Schema } from "effect";
import { RentalDetail, CreateRentalInput, RentalCreated, RentalReturned } from "../schema/Rental.js";
import { CustomerInfo } from "../schema/Customer.js";
import { RentalIneligibility } from "../schema/Checkout.js";

// ============================================================
// Rental API Error Schemas
// ============================================================

export class RentalNotFoundError extends Schema.TaggedError<RentalNotFoundError>()(
  "RentalNotFoundError",
  { message: Schema.String, rentalId: Schema.Number },
  { httpApiStatus: 404 }
) {}

export class CustomerNotFoundError extends Schema.TaggedError<CustomerNotFoundError>()(
  "CustomerNotFoundError",
  { message: Schema.String, customerId: Schema.Number },
  { httpApiStatus: 404 }
) {}

export class NoInventoryError extends Schema.TaggedError<NoInventoryError>()(
  "NoInventoryError",
  { message: Schema.String, filmId: Schema.Number, storeId: Schema.Number },
  { httpApiStatus: 409 }
) {}

// The customer exists but may not rent right now; `reasons` lists every rule broken
export class CustomerNotEligibleError extends Schema.TaggedError<CustomerNotEligibleError>()(
  "CustomerNotEligibleError",
  { message: Schema.String, customerId: Schema.Number, reasons: Schema.Array(RentalIneligibility) },
  { httpApiStatus: 422 }
) {}

export class RentalError extends Schema.TaggedError<RentalError>()(
  "RentalError",
  { message: Schema.String },
  { httpApiStatus: 500 }
) {}

// ============================================================
// Rental API Definition
// ============================================================

export class RentalApi extends HttpApiGroup.make("rentals").add(
  HttpApiEndpoint.post("create", "/rentals", {
    payload: CreateRentalInput,
    success: RentalCreated,
    error: [CustomerNotFoundError, CustomerNotEligibleError, NoInventoryError, RentalError],
  })
    .annotate(OpenApi.Summary, "Create a rental")
    .annotate(OpenApi.Description, "Rent a film to a customer without taking payment. Checks rental eligibility (active account, no overdue rentals, balance and open-rental limits) and inventory availability. Requires staff authentication."),
  HttpApiEndpoint.put("return", "/rentals/:rentalId/return", {
    params: { rentalId: Schema.FiniteFromString },
    success: RentalReturned,
    error: [RentalNotFoundError, RentalError],
  })
    .annotate(OpenApi.Summary, "Return a rental")
    .annotate(OpenApi.Description, "Mark a rental as returned. A late fee (one rental rate per day overdue) is charged to the customer's balance. Requires staff authentication."),
  HttpApiEndpoint.get("getById", "/rentals/:rentalId", {
    params: { rentalId: Schema.FiniteFromString },
    success: RentalDetail,
    error: [RentalNotFoundError, RentalError],
  })
    .annotate(OpenApi.Summary, "Get rental details")
    .annotate(OpenApi.Description, "Get detailed information about a specific rental. Requires authentication."),
  HttpApiEndpoint.get("customerRentals", "/customers/:customerId/rentals", {
    params: { customerId: Schema.FiniteFromString },
    success: Schema.Array(RentalDetail),
    error: [CustomerNotFoundError, RentalError],
  })
    .annotate(OpenApi.Summary, "Get customer rental history")
    .annotate(OpenApi.Description, "Get rental history for a specific customer. Requires authentication."),
  HttpApiEndpoint.get("customerInfo", "/customers/:customerId", {
    params: { customerId: Schema.FiniteFromString },
    success: CustomerInfo,
    error: [CustomerNotFoundError, RentalError],
  })
    .annotate(OpenApi.Summary, "Get customer info")
    .annotate(OpenApi.Description, "Get customer information by ID. Requires authentication.")
) {}
