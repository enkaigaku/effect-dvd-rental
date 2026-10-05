import { HttpApiBuilder } from "effect/http-api"
import { Effect } from "effect"
import { Api } from "../api/index.js"

// ============================================================
// Health Handler Implementation
// ============================================================

export const HealthHandler = HttpApiBuilder.group(Api, "health", (handlers) =>
  handlers
    .handle("healthCheck", () =>
      Effect.succeed({ status: "ok" as const })
    )
    .handle("readiness", () =>
      Effect.succeed({ status: "ready" as const })
    )
)
