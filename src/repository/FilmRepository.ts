import { Context, Effect, Layer } from "effect";
import { SqlClient } from "effect/sql";
import { Film, FilmSearchParams, PaginatedFilms } from "../schema/Film.js";
import { ActorWithName } from "../schema/Actor.js";
import { Category } from "../schema/Category.js";
import { FilmId } from "../schema/Ids.js";

// ============================================================
// Film Repository
// ============================================================

export class FilmRepository extends Context.Service<FilmRepository>()("FilmRepository", {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return {
      // Find film by ID with language info
      findById: (filmId: FilmId) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT 
              f.film_id,
              f.title,
              f.description,
              f.release_year,
              f.language_id,
              f.original_language_id,
              f.rental_duration,
              f.rental_rate,
              f.length,
              f.replacement_cost,
              f.rating,
              f.special_features,
              f.last_update,
              l.name as language_name,
              c.name as category_name
            FROM film f
            JOIN language l ON f.language_id = l.language_id
            LEFT JOIN film_category fc ON f.film_id = fc.film_id
            LEFT JOIN category c ON fc.category_id = c.category_id
            WHERE f.film_id = ${filmId}
          `;
          
          if (!rows[0]) return undefined;
          
          const row = rows[0] as any;
          return {
            filmId: row.film_id,
            title: row.title,
            description: row.description,
            releaseYear: row.release_year,
            languageId: row.language_id,
            originalLanguageId: row.original_language_id,
            rentalDuration: row.rental_duration,
            rentalRate: Number(row.rental_rate),
            length: row.length,
            replacementCost: Number(row.replacement_cost),
            rating: row.rating,
            specialFeatures: row.special_features,
            lastUpdate: row.last_update,
            languageName: row.language_name?.trim() ?? "Unknown",
            categoryName: row.category_name,
          };
        }),

      // Search films with pagination
      search: (params: FilmSearchParams) =>
        Effect.gen(function* () {
          const page = params.page ?? 1;
          const limit = params.limit ?? 20;
          const offset = (page - 1) * limit;

          // Build dynamic query based on params
          let baseQuery = sql`
            SELECT 
              f.film_id,
              f.title,
              f.description,
              f.release_year,
              f.language_id,
              f.original_language_id,
              f.rental_duration,
              f.rental_rate,
              f.length,
              f.replacement_cost,
              f.rating,
              f.special_features,
              f.last_update
            FROM film f
          `;

          // Join category if filtering by category
          if (params.categoryId) {
            baseQuery = sql`
              SELECT 
                f.film_id,
                f.title,
                f.description,
                f.release_year,
                f.language_id,
                f.original_language_id,
                f.rental_duration,
                f.rental_rate,
                f.length,
                f.replacement_cost,
                f.rating,
                f.special_features,
                f.last_update
              FROM film f
              JOIN film_category fc ON f.film_id = fc.film_id
              WHERE fc.category_id = ${params.categoryId}
              ORDER BY f.title
              LIMIT ${limit} OFFSET ${offset}
            `;
          } else if (params.search) {
            const searchPattern = `%${params.search}%`;
            baseQuery = sql`
              SELECT 
                f.film_id,
                f.title,
                f.description,
                f.release_year,
                f.language_id,
                f.original_language_id,
                f.rental_duration,
                f.rental_rate,
                f.length,
                f.replacement_cost,
                f.rating,
                f.special_features,
                f.last_update
              FROM film f
              WHERE f.title ILIKE ${searchPattern} OR f.description ILIKE ${searchPattern}
              ORDER BY f.title
              LIMIT ${limit} OFFSET ${offset}
            `;
          } else if (params.rating) {
            baseQuery = sql`
              SELECT 
                f.film_id,
                f.title,
                f.description,
                f.release_year,
                f.language_id,
                f.original_language_id,
                f.rental_duration,
                f.rental_rate,
                f.length,
                f.replacement_cost,
                f.rating,
                f.special_features,
                f.last_update
              FROM film f
              WHERE f.rating = ${params.rating}::mpaa_rating
              ORDER BY f.title
              LIMIT ${limit} OFFSET ${offset}
            `;
          } else {
            baseQuery = sql`
              SELECT 
                f.film_id,
                f.title,
                f.description,
                f.release_year,
                f.language_id,
                f.original_language_id,
                f.rental_duration,
                f.rental_rate,
                f.length,
                f.replacement_cost,
                f.rating,
                f.special_features,
                f.last_update
              FROM film f
              ORDER BY f.title
              LIMIT ${limit} OFFSET ${offset}
            `;
          }

          const rows = yield* baseQuery;

          // Get total count
          const countResult = yield* sql`SELECT COUNT(*) as count FROM film`;
          const total = Number(countResult[0]?.["count"] ?? 0);

          return new PaginatedFilms({
            data: rows.map((row: any) => new Film({
              filmId: row.film_id,
              title: row.title,
              description: row.description,
              releaseYear: row.release_year,
              languageId: row.language_id,
              originalLanguageId: row.original_language_id,
              rentalDuration: row.rental_duration,
              rentalRate: Number(row.rental_rate),
              length: row.length,
              replacementCost: Number(row.replacement_cost),
              rating: row.rating,
              specialFeatures: row.special_features,
              lastUpdate: row.last_update,
            })),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
          });
        }),

      // Get actors for a film
      getActorsByFilmId: (filmId: FilmId) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT 
              a.actor_id,
              a.first_name,
              a.last_name,
              CONCAT(a.first_name, ' ', a.last_name) as full_name
            FROM actor a
            JOIN film_actor fa ON a.actor_id = fa.actor_id
            WHERE fa.film_id = ${filmId}
            ORDER BY a.last_name, a.first_name
          `;
          return rows.map((row: any) => new ActorWithName({
            actorId: row.actor_id,
            firstName: row.first_name,
            lastName: row.last_name,
            fullName: row.full_name,
          }));
        }),

      // Get all categories
      getCategories: () =>
        Effect.gen(function* () {
          const rows = yield* sql`
            SELECT category_id, name, last_update
            FROM category
            ORDER BY name
          `;
          return rows.map((row: any) => new Category({
            categoryId: row.category_id,
            name: row.name,
            lastUpdate: row.last_update,
          }));
        }),
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
