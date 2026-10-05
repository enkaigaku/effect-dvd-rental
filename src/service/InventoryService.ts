import { Context, Effect, Layer } from "effect";
import { InventoryRepository } from "../repository/InventoryRepository.js";
import { FilmId, StoreId } from "../schema/Ids.js";

// ============================================================
// Inventory Service
// ============================================================

export class InventoryService extends Context.Service<InventoryService>()("InventoryService", {
  make: Effect.gen(function* () {
    const repo = yield* InventoryRepository;

    return {
      // Check film availability at a store
      checkAvailability: Effect.fn("InventoryService.checkAvailability")(function* (filmId: FilmId, storeId: StoreId) {
        yield* Effect.logDebug(`Checking availability: film=${filmId}, store=${storeId}`);
        return yield* repo.getFilmAvailability(filmId, storeId);
      }),

      // Get availability across all stores
      checkAvailabilityAllStores: Effect.fn("InventoryService.checkAvailabilityAllStores")(function* (filmId: FilmId) {
        yield* Effect.logDebug(`Checking availability for film=${filmId} at all stores`);
        return yield* repo.getFilmAvailabilityAllStores(filmId);
      }),

      // Find available inventory for rental
      findAvailableInventory: Effect.fn("InventoryService.findAvailableInventory")(function* (filmId: FilmId, storeId: StoreId) {
        yield* Effect.logDebug(`Finding available inventory: film=${filmId}, store=${storeId}`);
        return yield* repo.findAvailableInventory(filmId, storeId);
      }),

      // Get all stores
      getStores: Effect.fn("InventoryService.getStores")(function* () {
        yield* Effect.logDebug("Getting all stores");
        return yield* repo.getStores();
      }),

      // Get store by ID
      getStoreById: Effect.fn("InventoryService.getStoreById")(function* (storeId: StoreId) {
        yield* Effect.logDebug(`Getting store: ${storeId}`);
        return yield* repo.getStoreById(storeId);
      }),
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(InventoryRepository.layer));
}
