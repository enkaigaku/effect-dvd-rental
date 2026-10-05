import { Effect, Schema } from "effect";
import { PaymentId, CustomerId, StaffId, RentalId } from "./Ids.js";

// ============================================================
// Payment Schemas
// ============================================================

export class Payment extends Schema.Class<Payment>("Payment")({
  paymentId: PaymentId,
  customerId: CustomerId,
  staffId: StaffId,
  rentalId: RentalId,
  amount: Schema.Number,
  paymentDate: Schema.DateFromString,
}) {}

// Payment with rental info for display
export class PaymentDetail extends Schema.Class<PaymentDetail>("PaymentDetail")({
  paymentId: PaymentId,
  customerId: CustomerId,
  customerName: Schema.String,
  rentalId: RentalId,
  filmTitle: Schema.String,
  amount: Schema.Number,
  paymentDate: Schema.DateFromString,
}) {}

// Input for creating a payment
export class CreatePaymentInput extends Schema.Class<CreatePaymentInput>("CreatePaymentInput")({
  customerId: CustomerId,
  rentalId: RentalId,
  amount: Schema.Number,
  staffId: StaffId.pipe(
    Schema.withDecodingDefaultType(Effect.succeed(1 as StaffId)),
    Schema.withConstructorDefault(Effect.succeed(1 as StaffId)),
  ),
}) {}

// Payment response after creation
export class PaymentCreated extends Schema.Class<PaymentCreated>("PaymentCreated")({
  paymentId: PaymentId,
  customerId: CustomerId,
  rentalId: RentalId,
  amount: Schema.Number,
  paymentDate: Schema.DateFromString,
}) {}

// Customer balance response
export class CustomerBalance extends Schema.Class<CustomerBalance>("CustomerBalance")({
  customerId: CustomerId,
  customerName: Schema.String,
  balance: Schema.Number,
}) {}
