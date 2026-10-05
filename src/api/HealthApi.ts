import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { Schema } from "effect"

// ============================================================
// Health Check API Definition
// ============================================================

const HealthResponse = Schema.Struct({
  status: Schema.Literal("ok"),
})

const ReadyResponse = Schema.Struct({
  status: Schema.Literal("ready"),
})

export class HealthApi extends HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("healthCheck", "/health", {
    success: HealthResponse,
  }).annotate(OpenApi.Summary, "Health check endpoint"),
  HttpApiEndpoint.get("readiness", "/ready", {
    success: ReadyResponse,
  }).annotate(OpenApi.Summary, "Readiness check endpoint")
) {}
