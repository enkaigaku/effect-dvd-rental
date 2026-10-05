import { Effect, Schema } from "effect";
import { RentalId, InventoryId, CustomerId, StaffId, FilmId, StoreId } from "./Ids.js";

// ============================================================
// Rental Schemas
// ============================================================

export class Rental extends Schema.Class<Rental>("Rental")({
  rentalId: RentalId,
  rentalDate: Schema.DateFromString,
  inventoryId: InventoryId,
  customerId: CustomerId,
  returnDate: Schema.NullOr(Schema.DateFromString),
  staffId: StaffId,
  lastUpdate: Schema.DateFromString,
}) {}

// Rental with film and customer info for display
export class RentalDetail extends Schema.Class<RentalDetail>("RentalDetail")({
  rentalId: RentalId,
  rentalDate: Schema.DateFromString,
  returnDate: Schema.NullOr(Schema.DateFromString),
  filmTitle: Schema.String,
  customerName: Schema.String,
  customerEmail: Schema.NullOr(Schema.String),
  storeName: Schema.String,
  isReturned: Schema.Boolean,
}) {}

// Input for creating a rental
export class CreateRentalInput extends Schema.Class<CreateRentalInput>("CreateRentalInput")({
  filmId: FilmId,
  customerId: CustomerId,
  storeId: StoreId,
  staffId: StaffId.pipe(
    Schema.withDecodingDefaultType(Effect.succeed(1 as StaffId)),
    Schema.withConstructorDefault(Effect.succeed(1 as StaffId)),
  ),
}) {}

// Rental response after creation
export class RentalCreated extends Schema.Class<RentalCreated>("RentalCreated")({
  rentalId: RentalId,
  rentalDate: Schema.DateFromString,
  inventoryId: InventoryId,
  filmTitle: Schema.String,
  customerId: CustomerId,
  dueDate: Schema.DateFromString,
}) {}

// Return rental response
export class RentalReturned extends Schema.Class<RentalReturned>("RentalReturned")({
  rentalId: RentalId,
  returnDate: Schema.DateFromString,
  rentalDays: Schema.Number,
  lateFee: Schema.Number,
}) {}
