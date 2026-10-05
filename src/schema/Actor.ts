import { Schema } from "effect";
import { ActorId } from "./Ids.js";

// ============================================================
// Actor Schema
// ============================================================

export class Actor extends Schema.Class<Actor>("Actor")({
  actorId: ActorId,
  firstName: Schema.String,
  lastName: Schema.String,
  lastUpdate: Schema.DateFromString,
}) {}

// Actor with full name computed
export class ActorWithName extends Schema.Class<ActorWithName>("ActorWithName")({
  actorId: ActorId,
  firstName: Schema.String,
  lastName: Schema.String,
  fullName: Schema.String,
}) {}
