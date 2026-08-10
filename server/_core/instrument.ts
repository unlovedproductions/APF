import "dotenv/config";
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

const dsn = process.env.SENTRY_DSN?.trim();
const isProduction = process.env.NODE_ENV === "production";

const SENSITIVE_ATTR = /password|secret|token|authorization|cookie|dsn|api[_-]?key/i;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    integrations: [
      nodeProfilingIntegration(),
      Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] }),
    ],
    enableLogs: true,
    tracesSampleRate: isProduction ? 0.1 : 1.0,
    profileSessionSampleRate: isProduction ? 0.1 : 1.0,
    profileLifecycle: "trace",
    beforeSendLog: (log) => {
      if (isProduction && log.level === "debug") {
        return null;
      }
      const attrs = log.attributes;
      if (attrs) {
        for (const key of Object.keys(attrs)) {
          if (SENSITIVE_ATTR.test(key)) {
            delete attrs[key];
          }
        }
      }
      return log;
    },
  });
  Sentry.getGlobalScope().setAttributes({ service: "apf" });
}
