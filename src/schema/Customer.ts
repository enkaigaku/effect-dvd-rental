import { Schema } from "effect";
import { CustomerId, StoreId, AddressId } from "./Ids.js";

// ============================================================
// Customer Schemas
// ============================================================

export class Customer extends Schema.Class<Customer>("Customer")({
  customerId: CustomerId,
  storeId: StoreId,
  firstName: Schema.String,
  lastName: Schema.String,
  email: Schema.NullOr(Schema.String),
  addressId: AddressId,
  activebool: Schema.Boolean,
  createDate: Schema.DateFromString,
  lastUpdate: Schema.NullOr(Schema.DateFromString),
  active: Schema.NullOr(Schema.Number),
}) {}

// Customer with full name for display
export class CustomerInfo extends Schema.Class<CustomerInfo>("CustomerInfo")({
  customerId: CustomerId,
  fullName: Schema.String,
  email: Schema.NullOr(Schema.String),
  storeId: StoreId,
  isActive: Schema.Boolean,
}) {}
