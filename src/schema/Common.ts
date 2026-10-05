import { Schema } from "effect";

// ============================================================
// Pagination Query Parameters
// ============================================================

const PositiveInt = Schema.FiniteFromString.check(Schema.isInt(), Schema.isGreaterThan(0));

export class PaginationQuery extends Schema.Class<PaginationQuery>("PaginationQuery")({
  page: Schema.optional(PositiveInt),
  limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(100))),
}) {}

// ============================================================
// Generic Paginated Response (Helper to create schemas)
// ============================================================

export const PaginatedResponse = <S extends Schema.Top>(itemSchema: S) =>
  Schema.Struct({
    items: Schema.Array(itemSchema),
    total: Schema.Number,
    page: Schema.Number,
    limit: Schema.Number,
    totalPages: Schema.Number,
  });
