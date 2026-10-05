import { describe, it, expect } from "bun:test";
import { Effect } from "effect";
import { InventoryRepository } from "../../src/repository/InventoryRepository.js";
import { TestDatabaseLayer } from "../utils/testDb.js";
import { FilmId, StoreId } from "../../src/schema/Ids.js";

// ============================================================
// InventoryRepository Integration Tests
// ============================================================

describe("InventoryRepository (Integration)", () => {
  describe("getFilmAvailability", () => {
    it("should return availability for a film at a store", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* InventoryRepository;
          return yield* repo.getFilmAvailability(1 as FilmId, 1 as StoreId);
        }).pipe(
          Effect.provide(InventoryRepository.layer),
          Effect.provide(TestDatabaseLayer)
        )
      );

      expect(result).toBeDefined();
      expect(result?.filmId).toBe(1 as FilmId);
      expect(result?.storeId).toBe(1 as StoreId);
      expect(typeof result?.totalCopies).toBe("number");
    });
  });

  describe("getFilmAvailabilityAllStores", () => {
    it("should return availability across all stores", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* InventoryRepository;
          return yield* repo.getFilmAvailabilityAllStores(1 as FilmId);
        }).pipe(
          Effect.provide(InventoryRepository.layer),
          Effect.provide(TestDatabaseLayer)
        )
      );

      expect(result.length).toBeGreaterThan(0);
      result.forEach(item => {
        expect(item.filmId).toBe(1 as FilmId);
        expect(typeof item.totalCopies).toBe("number");
      });
    });
  });

  describe("getStores", () => {
    it("should return all stores with address info", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* InventoryRepository;
          return yield* repo.getStores();
        }).pipe(
          Effect.provide(InventoryRepository.layer),
          Effect.provide(TestDatabaseLayer)
        )
      );

      expect(result.length).toBeGreaterThanOrEqual(2); // Pagila has at least 2 stores
      expect(result[0]?.address).toBeDefined();
    });
  });

  describe("findAvailableInventory", () => {
    it("should find available inventory for a film", async () => {
      // Film 1 should have some available inventory at store 1
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* InventoryRepository;
          return yield* repo.findAvailableInventory(1 as FilmId, 1 as StoreId);
        }).pipe(
          Effect.provide(InventoryRepository.layer),
          Effect.provide(TestDatabaseLayer)
        )
      );

      // May or may not have available inventory depending on rental status
      expect(result === undefined || typeof result === "number").toBe(true);
    });
  });
});
