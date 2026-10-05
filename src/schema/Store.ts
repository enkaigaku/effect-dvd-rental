import { Schema } from "effect";
import { StoreId, StaffId, AddressId } from "./Ids.js";

// ============================================================
// Store Schema
// ============================================================

export class Store extends Schema.Class<Store>("Store")({
  storeId: StoreId,
  managerStaffId: StaffId,
  addressId: AddressId,
  lastUpdate: Schema.DateFromString,
}) {}

// Store with address info for display
export class StoreWithAddress extends Schema.Class<StoreWithAddress>("StoreWithAddress")({
  storeId: StoreId,
  address: Schema.String,
  city: Schema.String,
  country: Schema.String,
  managerName: Schema.NullOr(Schema.String),
}) {}
