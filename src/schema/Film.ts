import { Effect, Schema } from "effect";
import { FilmId, CategoryId } from "./Ids.js";

// ============================================================
// Film Schemas
// ============================================================

// MPAA Rating enum
export const MpaaRating = Schema.Literals(["G", "PG", "PG-13", "R", "NC-17"]);
export type MpaaRating = typeof MpaaRating.Type;

// Film entity
export class Film extends Schema.Class<Film>("Film")({
  filmId: FilmId,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  releaseYear: Schema.NullOr(Schema.Number),
  languageId: Schema.Number,
  originalLanguageId: Schema.NullOr(Schema.Number),
  rentalDuration: Schema.Number,
  rentalRate: Schema.Number,
  length: Schema.NullOr(Schema.Number),
  replacementCost: Schema.Number,
  rating: Schema.NullOr(MpaaRating),
  specialFeatures: Schema.NullOr(Schema.Array(Schema.String)),
  lastUpdate: Schema.DateFromString,
}) {}

// Film with category info
export class FilmWithCategory extends Schema.Class<FilmWithCategory>("FilmWithCategory")({
  ...Film.fields,
  categoryName: Schema.NullOr(Schema.String),
}) {}

// Film detail (includes language name)
export class FilmDetail extends Schema.Class<FilmDetail>("FilmDetail")({
  ...Film.fields,
  languageName: Schema.String,
  categoryName: Schema.NullOr(Schema.String),
}) {}

// Film search parameters
export class FilmSearchParams extends Schema.Class<FilmSearchParams>("FilmSearchParams")({
  search: Schema.optional(Schema.String),
  categoryId: Schema.optional(CategoryId),
  rating: Schema.optional(MpaaRating),
  page: Schema.Number.pipe(
    Schema.withDecodingDefaultType(Effect.succeed(1)),
    Schema.withConstructorDefault(Effect.succeed(1)),
  ),
  limit: Schema.Number.pipe(
    Schema.withDecodingDefaultType(Effect.succeed(20)),
    Schema.withConstructorDefault(Effect.succeed(20)),
  ),
}) {}

// Paginated films response
export class PaginatedFilms extends Schema.Class<PaginatedFilms>("PaginatedFilms")({
  data: Schema.Array(Film),
  total: Schema.Number,
  page: Schema.Number,
  limit: Schema.Number,
  totalPages: Schema.Number,
}) {}
