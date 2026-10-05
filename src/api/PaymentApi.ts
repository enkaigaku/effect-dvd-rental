import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api";
import { Schema } from "effect";
import { PaymentDetail, CreatePaymentInput, PaymentCreated, CustomerBalance } from "../schema/Payment.js";

// ============================================================
// Payment API Error Schemas
// ============================================================

export class PaymentNotFoundError extends Schema.TaggedError<PaymentNotFoundError>()(
  "PaymentNotFoundError",
  { message: Schema.String, paymentId: Schema.Number },
  { httpApiStatus: 404 }
) {}

export class InvalidPaymentError extends Schema.TaggedError<InvalidPaymentError>()(
  "InvalidPaymentError",
  { message: Schema.String },
  { httpApiStatus: 400 }
) {}

export class PaymentError extends Schema.TaggedError<PaymentError>()(
  "PaymentError",
  { message: Schema.String },
  { httpApiStatus: 500 }
) {}

// ============================================================
// Payment API Definition
// ============================================================

export class PaymentApi extends HttpApiGroup.make("payments").add(
  HttpApiEndpoint.post("create", "/payments", {
    payload: CreatePaymentInput,
    success: PaymentCreated,
    error: [InvalidPaymentError, PaymentError],
  })
    .annotate(OpenApi.Summary, "Create a payment")
    .annotate(OpenApi.Description, "Record a payment for a rental."),
  HttpApiEndpoint.get("getById", "/payments/:paymentId", {
    params: { paymentId: Schema.FiniteFromString },
    success: PaymentDetail,
    // PaymentError: the handler maps auth failures to it
    error: [PaymentNotFoundError, PaymentError],
  })
    .annotate(OpenApi.Summary, "Get payment details")
    .annotate(OpenApi.Description, "Get detailed information about a specific payment."),
  HttpApiEndpoint.get("customerPayments", "/customers/:customerId/payments", {
    params: { customerId: Schema.FiniteFromString },
    success: Schema.Array(PaymentDetail),
    error: PaymentError,
  })
    .annotate(OpenApi.Summary, "Get customer payment history")
    .annotate(OpenApi.Description, "Get payment history for a specific customer."),
  HttpApiEndpoint.get("customerBalance", "/customers/:customerId/balance", {
    params: { customerId: Schema.FiniteFromString },
    success: CustomerBalance,
    error: PaymentError,
  })
    .annotate(OpenApi.Summary, "Get customer balance")
    .annotate(OpenApi.Description, "Get outstanding balance for a customer.")
) {}
