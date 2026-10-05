import { HttpApiBuilder } from "effect/http-api";
import { Effect } from "effect";
import { Api, FilmNotFoundError, DatabaseQueryError } from "../api/index.js";
import { FilmService } from "../service/FilmService.js";
import { FilmDetail, FilmSearchParams } from "../schema/Film.js";
import { CategoryId, FilmId } from "../schema/Ids.js";

// ============================================================
// Film Handler Implementation
// ============================================================

export const FilmHandler = HttpApiBuilder.group(Api, "films", (handlers) =>
  handlers
    .handle("list", ({ query }) =>
      Effect.gen(function* () {
        const filmService = yield* FilmService;

        // Parse URL params (strings) to proper types
        const params = new FilmSearchParams({
          search: query.search,
          categoryId: query.categoryId ? Number(query.categoryId) as CategoryId : undefined,
          rating: query.rating as any,
          page: query.page ? Number(query.page) : 1,
          limit: query.limit ? Number(query.limit) : 20,
        });

        return yield* filmService.searchFilms(params);
      }).pipe(
        Effect.mapError(() => new DatabaseQueryError({ message: "Failed to fetch films" }))
      )
    )
    .handle("getById", ({ params }) =>
      Effect.gen(function* () {
        const filmService = yield* FilmService;
        const film = yield* filmService.getFilmById(params.filmId as FilmId);

        if (!film) {
          return yield* Effect.fail(
            new FilmNotFoundError({ message: "Film not found", filmId: params.filmId })
          );
        }

        return new FilmDetail({
          filmId: film.filmId,
          title: film.title,
          description: film.description,
          releaseYear: film.releaseYear,
          languageId: film.languageId,
          originalLanguageId: film.originalLanguageId,
          rentalDuration: film.rentalDuration,
          rentalRate: film.rentalRate,
          length: film.length,
          replacementCost: film.replacementCost,
          rating: film.rating,
          specialFeatures: film.specialFeatures,
          lastUpdate: film.lastUpdate,
          languageName: film.languageName,
          categoryName: film.categoryName,
        });
      }).pipe(
        Effect.catchTag("SqlError", () =>
          Effect.fail(new DatabaseQueryError({ message: "Database error" }))
        )
      )
    )
    .handle("getActors", ({ params }) =>
      Effect.gen(function* () {
        const filmService = yield* FilmService;
        return yield* filmService.getFilmActors(params.filmId as FilmId);
      }).pipe(
        Effect.mapError(() => new DatabaseQueryError({ message: "Failed to fetch actors" }))
      )
    )
    .handle("categories", () =>
      Effect.gen(function* () {
        const filmService = yield* FilmService;
        return yield* filmService.getCategories();
      }).pipe(
        Effect.mapError(() => new DatabaseQueryError({ message: "Failed to fetch categories" }))
      )
    )
);
