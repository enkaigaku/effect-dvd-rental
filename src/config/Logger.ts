import { Effect, Layer, Logger, LogLevel, References } from "effect";
import { LogConfig } from "./AppConfig.js";

// ============================================================
// Logger Configuration
// ============================================================

// Parse log level string to LogLevel (LOG_LEVEL=warning is kept for
// compatibility with existing .env files; v4 names the level "Warn")
const parseLogLevel = (level: string): LogLevel.LogLevel => {
  switch (level.toLowerCase()) {
    case "trace": return "Trace";
    case "debug": return "Debug";
    case "info": return "Info";
    case "warn":
    case "warning": return "Warn";
    case "error": return "Error";
    case "fatal": return "Fatal";
    case "none": return "None";
    default: return "Info";
  }
};

// ============================================================
// Pretty Logger with Local Timestamps
// ============================================================

const LocalPrettyLogger = Logger.consolePretty({
  formatDate: (date) => date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }),
});

// ============================================================
// Exported Logger Layer (uses Effect Config)
// ============================================================

export const LoggerLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* LogConfig;
    const logLevel = parseLogLevel(config.level);

    return Layer.mergeAll(
      // Replace the default loggers; tracerLogger keeps log lines attached to
      // the current span as events, as the v3 default logger setup did
      Logger.layer([LocalPrettyLogger, Logger.tracerLogger]),
      Layer.succeed(References.MinimumLogLevel, logLevel)
    );
  })
);
