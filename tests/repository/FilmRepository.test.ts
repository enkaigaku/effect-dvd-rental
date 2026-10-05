import { describe, it, expect } from "bun:test";
import { Effect } from "effect";
import { FilmRepository } from "../../src/repository/FilmRepository.js";
import { FilmSearchParams } from "../../src/schema/Film.js";
import { TestDatabaseLayer } from "../utils/testDb.js";
import { FilmId } from "../../src/schema/Ids.js";

// ============================================================
// FilmRepository Integration Tests
// ============================================================

describe("FilmRepository (Integration)", () => {
  describe("findById", () => {
    it("should return a film when it exists", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* FilmRepository;
          return yield* repo.findById(1 as FilmId);
        }).pipe(
          Effect.provide(FilmRepository.layer),
          Effect.provide(TestDatabaseLayer)
        )
      );

      expect(result).toBeDefined();
      expect(result?.filmId).toBe(1);
      expect(result?.title).toBeDefined();
    });

    it("should return undefined for non-existent film", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* FilmRepository;
          return yield* repo.findById(99999 as FilmId);
        }).pipe(
          Effect.provide(FilmRepository.layer),
          Effect.provide(TestDatabaseLayer)
        )
      );

      expect(result).toBeUndefined();
    });
  });

  describe("search", () => {
    it("should return paginated films", async () => {
      const params = new FilmSearchParams({ page: 1, limit: 10 });

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* FilmRepository;
          return yield* repo.search(params);
        }).pipe(
          Effect.provide(FilmRepository.layer),
          Effect.provide(TestDatabaseLayer)
        )
      );

      expect(result.data.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
    });

    it("should filter by search term", async () => {
      const params = new FilmSearchParams({ search: "ACADEMY", page: 1, limit: 10 });

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* FilmRepository;
          return yield* repo.search(params);
        }).pipe(
          Effect.provide(FilmRepository.layer),
          Effect.provide(TestDatabaseLayer)
        )
      );

      expect(result.data.length).toBeGreaterThan(0);
      result.data.forEach(film => {
        expect(film.title.toUpperCase()).toContain("ACADEMY");
      });
    });
  });

  describe("getCategories", () => {
    it("should return all categories", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* FilmRepository;
          return yield* repo.getCategories();
        }).pipe(
          Effect.provide(FilmRepository.layer),
          Effect.provide(TestDatabaseLayer)
        )
      );

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]?.name).toBeDefined();
    });
  });
});
