import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    JWT_SECRET: z.string().optional(),
    INTERNAL_SERVICE_SECRET: z.string().optional(),
    APF_USER_ID: z.string().optional(),
    PORT: z.string().optional(),
    CORS_ORIGINS: z.string().optional(),
    VITE_APP_ID: z.string().optional(),
    OAUTH_SERVER_URL: z.string().optional(),
    OWNER_OPEN_ID: z.string().optional(),
    BUILT_IN_FORGE_API_URL: z.string().optional(),
    BUILT_IN_FORGE_API_KEY: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "production") {
      if (!data.JWT_SECRET?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "JWT_SECRET is required in production",
          path: ["JWT_SECRET"],
        });
      }
      const origins = (data.CORS_ORIGINS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (origins.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CORS_ORIGINS is required in production",
          path: ["CORS_ORIGINS"],
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  console.error("[APF] Invalid environment:", msg);
  process.exit(1);
}

const env = parsed.data;
const isProduction = env.NODE_ENV === "production";

export const ENV = {
  appId: env.VITE_APP_ID ?? "",
  cookieSecret: env.JWT_SECRET?.trim() || (isProduction ? "" : "local-dev-secret"),
  databaseUrl: env.DATABASE_URL,
  oAuthServerUrl: env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: env.OWNER_OPEN_ID ?? "",
  isProduction,
  forgeApiUrl: env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: env.BUILT_IN_FORGE_API_KEY ?? "",
  corsOrigins: (env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3100")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  internalServiceSecret: env.INTERNAL_SERVICE_SECRET ?? "",
  port: env.PORT ? parseInt(env.PORT, 10) : undefined,
};
