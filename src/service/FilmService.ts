import { Context, Effect, Layer } from "effect";
import { FilmRepository } from "../repository/FilmRepository.js";
import { FilmSearchParams }from "../schema/Film.js";
import { FilmId } from "../schema/Ids.js";

// ============================================================
// Film Service
// ============================================================

export class FilmService extends Context.Service<FilmService>()("FilmService", {
  make: Effect.gen(function* () {
    const repo = yield* FilmRepository;

    return {
      // Get film by ID
      getFilmById: Effect.fn("FilmService.getFilmById")(function* (filmId: FilmId) {
        yield* Effect.logDebug(`Getting film by ID: ${filmId}`);
        const film = yield* repo.findById(filmId);
        if (!film) {
          yield* Effect.logWarning(`Film not found: ${filmId}`);
        }
        return film;
      }),

      // Search films with pagination
      searchFilms: Effect.fn("FilmService.searchFilms")(function* (params: FilmSearchParams) {
        yield* Effect.logDebug(`Searching films with params: ${JSON.stringify(params)}`);
        return yield* repo.search(params);
      }),

      // Get actors for a film
      getFilmActors: Effect.fn("FilmService.getFilmActors")(function* (filmId: FilmId) {
        yield* Effect.logDebug(`Getting actors for film: ${filmId}`);
        return yield* repo.getActorsByFilmId(filmId);
      }),

      // Get all categories
      getCategories: Effect.fn("FilmService.getCategories")(function* () {
        yield* Effect.logDebug("Getting all categories");
        return yield* repo.getCategories();
      }),
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(FilmRepository.layer));
}
