import { Schema } from "effect";
import { CategoryId } from "./Ids.js";

// ============================================================
// Category Schema
// ============================================================

export class Category extends Schema.Class<Category>("Category")({
  categoryId: CategoryId,
  name: Schema.String,
  lastUpdate: Schema.DateFromString,
}) {}
