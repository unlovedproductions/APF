import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  const serviceKey = opts.req.headers["x-service-key"];
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET;

  if (serviceKey && internalSecret && serviceKey === internalSecret) {
    const serviceUserId = Number(process.env.APF_USER_ID || 1);
    user = { id: serviceUserId, openId: "system", role: "admin" } as User;
  } else {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
