import { Schema } from "effect";
import { CustomerId, FilmId, InventoryId, PaymentId, RentalId, StaffId, StoreId } from "./Ids.js";

// ============================================================
// Checkout Schemas
// ============================================================

export const RentalIneligibility = Schema.Struct({
  code: Schema.Literals(["ACCOUNT_INACTIVE", "OVERDUE_RENTALS", "BALANCE_LIMIT_EXCEEDED", "RENTAL_LIMIT_EXCEEDED"]),
  message: Schema.String,
});
export type RentalIneligibility = typeof RentalIneligibility.Type;

// Input for a quote or a checkout: several films for one customer at one store
export class CheckoutInput extends Schema.Class<CheckoutInput>("CheckoutInput")({
  customerId: CustomerId,
  storeId: StoreId,
  filmIds: Schema.Array(FilmId).check(Schema.isMinLength(1), Schema.isMaxLength(10), Schema.isUnique()),
}) {}

export class CheckoutLine extends Schema.Class<CheckoutLine>("CheckoutLine")({
  filmId: FilmId,
  filmTitle: Schema.String,
  rentalRate: Schema.Number,
  discount: Schema.Number,
  amount: Schema.Number,
  promotion: Schema.NullOr(Schema.String),
}) {}

// What a checkout would cost; nothing is reserved or charged
export class CheckoutQuote extends Schema.Class<CheckoutQuote>("CheckoutQuote")({
  customerId: CustomerId,
  storeId: StoreId,
  lines: Schema.Array(CheckoutLine),
  subtotal: Schema.Number,
  discount: Schema.Number,
  total: Schema.Number,
}) {}

export class CheckoutRental extends Schema.Class<CheckoutRental>("CheckoutRental")({
  rentalId: RentalId,
  inventoryId: InventoryId,
  filmId: FilmId,
  filmTitle: Schema.String,
  dueDate: Schema.DateFromString,
  rentalRate: Schema.Number,
  discount: Schema.Number,
  amountPaid: Schema.Number,
  promotion: Schema.NullOr(Schema.String),
  // null when the line was free
  paymentId: Schema.NullOr(PaymentId),
}) {}

export class CheckoutReceipt extends Schema.Class<CheckoutReceipt>("CheckoutReceipt")({
  customerId: CustomerId,
  storeId: StoreId,
  staffId: StaffId,
  checkedOutAt: Schema.DateFromString,
  rentals: Schema.Array(CheckoutRental),
  subtotal: Schema.Number,
  discount: Schema.Number,
  total: Schema.Number,
}) {}
