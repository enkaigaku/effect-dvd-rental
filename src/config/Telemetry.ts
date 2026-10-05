import { Effect } from "effect";
import { NodeSdk } from "@effect/opentelemetry";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { TelemetryConfig } from "./AppConfig.js";

// ============================================================
// OpenTelemetry Configuration (uses Effect Config)
// ============================================================

export const TracingLive = NodeSdk.layer(
  Effect.gen(function* () {
    const config = yield* TelemetryConfig;

    return {
      resource: {
        serviceName: "effect-dvd-rental",
        serviceVersion: "1.0.0",
      },
      spanProcessor: new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: `${config.endpoint}/v1/traces`,
        }),
      ),
    };
  })
);
