import { Schema } from "effect";

// ============================================================
// Branded ID Types
// ============================================================
// These provide compile-time safety to prevent mixing up IDs

export const CustomerId = Schema.Number.pipe(Schema.brand("CustomerId"));
export type CustomerId = typeof CustomerId.Type;

export const StaffId = Schema.Number.pipe(Schema.brand("StaffId"));
export type StaffId = typeof StaffId.Type;

export const FilmId = Schema.Number.pipe(Schema.brand("FilmId"));
export type FilmId = typeof FilmId.Type;

export const CategoryId = Schema.Number.pipe(Schema.brand("CategoryId"));
export type CategoryId = typeof CategoryId.Type;

export const ActorId = Schema.Number.pipe(Schema.brand("ActorId"));
export type ActorId = typeof ActorId.Type;

export const StoreId = Schema.Number.pipe(Schema.brand("StoreId"));
export type StoreId = typeof StoreId.Type;

export const InventoryId = Schema.Number.pipe(Schema.brand("InventoryId"));
export type InventoryId = typeof InventoryId.Type;

export const RentalId = Schema.Number.pipe(Schema.brand("RentalId"));
export type RentalId = typeof RentalId.Type;

export const PaymentId = Schema.Number.pipe(Schema.brand("PaymentId"));
export type PaymentId = typeof PaymentId.Type;

export const AddressId = Schema.Number.pipe(Schema.brand("AddressId"));
export type AddressId = typeof AddressId.Type;
