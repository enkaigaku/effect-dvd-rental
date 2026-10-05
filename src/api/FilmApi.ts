import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api";
import { Schema } from "effect";
import { FilmDetail, PaginatedFilms } from "../schema/Film.js";
import { ActorWithName } from "../schema/Actor.js";
import { Category } from "../schema/Category.js";

// ============================================================
// Film API Error Schemas
// ============================================================

export class FilmNotFoundError extends Schema.TaggedError<FilmNotFoundError>()(
  "FilmNotFoundError",
  { message: Schema.String, filmId: Schema.Number },
  { httpApiStatus: 404 }
) {}

export class DatabaseQueryError extends Schema.TaggedError<DatabaseQueryError>()(
  "DatabaseQueryError",
  { message: Schema.String },
  { httpApiStatus: 500 }
) {}

// URL params must be string-encodeable
const FilmListParams = {
  search: Schema.optional(Schema.String),
  categoryId: Schema.optional(Schema.String),
  rating: Schema.optional(Schema.String),
  page: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.String),
};

// ============================================================
// Film API Definition
// ============================================================

export class FilmApi extends HttpApiGroup.make("films").add(
  HttpApiEndpoint.get("list", "/films", {
    query: FilmListParams,
    success: PaginatedFilms,
    error: DatabaseQueryError,
  })
    .annotate(OpenApi.Summary, "List all films")
    .annotate(OpenApi.Description, "Get a paginated list of films. Supports filtering by category, rating, and search term."),
  HttpApiEndpoint.get("getById", "/films/:filmId", {
    params: { filmId: Schema.FiniteFromString },
    success: FilmDetail,
    error: [FilmNotFoundError, DatabaseQueryError],
  })
    .annotate(OpenApi.Summary, "Get film details")
    .annotate(OpenApi.Description, "Get detailed information about a specific film including language and category."),
  HttpApiEndpoint.get("getActors", "/films/:filmId/actors", {
    params: { filmId: Schema.FiniteFromString },
    success: Schema.Array(ActorWithName),
    error: [FilmNotFoundError, DatabaseQueryError],
  })
    .annotate(OpenApi.Summary, "Get film actors")
    .annotate(OpenApi.Description, "Get the list of actors appearing in a specific film."),
  HttpApiEndpoint.get("categories", "/categories", {
    success: Schema.Array(Category),
    error: DatabaseQueryError,
  })
    .annotate(OpenApi.Summary, "List all categories")
    .annotate(OpenApi.Description, "Get a list of all film categories.")
) {}
