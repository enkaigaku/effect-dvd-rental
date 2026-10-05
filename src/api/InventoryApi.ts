import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api";
import { Schema } from "effect";
import { FilmAvailability } from "../schema/Inventory.js";
import { StoreWithAddress } from "../schema/Store.js";

// ============================================================
// Inventory API Error Schemas
// ============================================================

export class StoreNotFoundError extends Schema.TaggedError<StoreNotFoundError>()(
  "StoreNotFoundError",
  { message: Schema.String, storeId: Schema.Number },
  { httpApiStatus: 404 }
) {}

export class InventoryError extends Schema.TaggedError<InventoryError>()(
  "InventoryError",
  { message: Schema.String },
  { httpApiStatus: 500 }
) {}

// ============================================================
// Inventory API Definition
// ============================================================

export class InventoryApi extends HttpApiGroup.make("inventory").add(
  HttpApiEndpoint.get("stores", "/stores", {
    success: Schema.Array(StoreWithAddress),
    error: InventoryError,
  })
    .annotate(OpenApi.Summary, "List all stores")
    .annotate(OpenApi.Description, "Get a list of all rental stores with address information."),
  HttpApiEndpoint.get("storeById", "/stores/:storeId", {
    params: { storeId: Schema.FiniteFromString },
    success: StoreWithAddress,
    error: [StoreNotFoundError, InventoryError],
  })
    .annotate(OpenApi.Summary, "Get store details")
    .annotate(OpenApi.Description, "Get detailed information about a specific store."),
  HttpApiEndpoint.get("filmAvailability", "/films/:filmId/availability", {
    params: { filmId: Schema.FiniteFromString },
    success: Schema.Array(FilmAvailability),
    error: InventoryError,
  })
    .annotate(OpenApi.Summary, "Check film availability")
    .annotate(OpenApi.Description, "Check availability of a film across all stores."),
  HttpApiEndpoint.get("filmAvailabilityAtStore", "/stores/:storeId/films/:filmId/availability", {
    params: {
      storeId: Schema.FiniteFromString,
      filmId: Schema.FiniteFromString,
    },
    success: FilmAvailability,
    error: [StoreNotFoundError, InventoryError],
  })
    .annotate(OpenApi.Summary, "Check film availability at store")
    .annotate(OpenApi.Description, "Check availability of a specific film at a specific store.")
) {}
