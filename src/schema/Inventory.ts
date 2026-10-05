import { Schema } from "effect";
import { InventoryId, FilmId, StoreId } from "./Ids.js";

// ============================================================
// Inventory Schema
// ============================================================

export class Inventory extends Schema.Class<Inventory>("Inventory")({
  inventoryId: InventoryId,
  filmId: FilmId,
  storeId: StoreId,
  lastUpdate: Schema.DateFromString,
}) {}

// Inventory with film title for display
export class InventoryWithFilm extends Schema.Class<InventoryWithFilm>("InventoryWithFilm")({
  inventoryId: InventoryId,
  filmId: FilmId,
  filmTitle: Schema.String,
  storeId: StoreId,
  inStock: Schema.Boolean,
}) {}

// Film availability at a store
export class FilmAvailability extends Schema.Class<FilmAvailability>("FilmAvailability")({
  filmId: FilmId,
  filmTitle: Schema.String,
  storeId: StoreId,
  totalCopies: Schema.Number,
  availableCopies: Schema.Number,
}) {}
