import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),
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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  if (process.env.NODE_ENV === "production") {
    console.error("[APF] Invalid environment:", msg);
    process.exit(1);
  }
  console.warn("[APF] Environment validation warnings:", msg);
}

const env = parsed.success ? parsed.data : process.env;

export const ENV = {
  appId: env.VITE_APP_ID ?? "",
  cookieSecret: env.JWT_SECRET ?? "",
  databaseUrl: env.DATABASE_URL ?? "",
  oAuthServerUrl: env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: env.BUILT_IN_FORGE_API_KEY ?? "",
  corsOrigins: (env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:3100")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  internalServiceSecret: env.INTERNAL_SERVICE_SECRET ?? "",
};
