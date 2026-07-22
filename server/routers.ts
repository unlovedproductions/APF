import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as db from "./db";
import { fetchAndProcessWarriorPlusOffers } from "./warriorplus";
import { fetchAndProcessClickBankProducts } from "./clickbank";
import { fetchAndProcessShareASale } from "./shareasale";
import { fetchAndProcessCjProducts } from "./cj";
import { fetchAndProcessAwinProducts } from "./awin";
import { fetchAndProcessImpactCatalogItems } from "./impact";
import { fetchAndProcessAmazonCreatorsProducts } from "./amazon";
import { TRPCError } from "@trpc/server";
import { exportProductsToShadowCast, runDigistore24RefreshWorkflow, runPostRefreshWorkflow } from "./apfWorkflows";

const PLATFORM_VALUES = [
  "warriorplus",
  "digistore24",
  "clickbank",
  "shareasale",
  "cj",
  "awin",
  "impact",
  "amazon",
] as const;
const PLATFORM_SCHEMA = z.enum(PLATFORM_VALUES);

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // ============ API Credentials ============
  credentials: router({
    save: protectedProcedure
      .input(z.object({
        platform: PLATFORM_SCHEMA,
        apiKey: z.string().min(1, "API key is required"),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          await db.saveApiCredential(ctx.user.id, input.platform, input.apiKey);
          return { success: true };
        } catch (error) {
          console.error("[Credentials] Error saving API key:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to save API credentials",
          });
        }
      }),

    get: protectedProcedure
      .input(z.object({
        platform: PLATFORM_SCHEMA,
      }))
      .query(async ({ input, ctx }) => {
        try {
          const credential = await db.getActiveApiCredential(ctx.user.id, input.platform);
          if (!credential) {
            return null;
          }
          // Don't return the actual API key to the frontend
          return { platform: credential.platform, isActive: credential.isActive };
        } catch (error) {
          console.error("[Credentials] Error getting API key:", error);
          return null;
        }
      }),
  }),

  // ============ Products ============
  products: router({
    list: protectedProcedure
      .input(z.object({
        platform: PLATFORM_SCHEMA,
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }))
      .query(async ({ input, ctx }) => {
        try {
          const products = await db.getProductsByUser(ctx.user.id, input.platform, input.limit, input.offset);
          const withStatus = await Promise.all(
            products.map(async (product) => ({
              ...product,
              enrichmentStatus: await db.getProductEnrichmentStatus(product.id),
            })),
          );
          return withStatus;
        } catch (error) {
          console.error("[Products] Error listing products:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch products",
          });
        }
      }),

    search: protectedProcedure
      .input(z.object({
        platform: PLATFORM_SCHEMA,
        query: z.string().min(1),
      }))
      .query(async ({ input, ctx }) => {
        try {
          const products = await db.searchProducts(ctx.user.id, input.platform, input.query);
          return products;
        } catch (error) {
          console.error("[Products] Error searching products:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to search products",
          });
        }
      }),

    getByCategory: protectedProcedure
      .input(z.object({
        platform: PLATFORM_SCHEMA,
        category: z.string().min(1),
      }))
      .query(async ({ input, ctx }) => {
        try {
          const products = await db.getProductsByCategory(ctx.user.id, input.platform, input.category);
          return products;
        } catch (error) {
          console.error("[Products] Error getting products by category:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch products",
          });
        }
      }),

    getDetail: protectedProcedure
      .input(z.object({
        productId: z.number(),
      }))
      .query(async ({ input, ctx }) => {
        try {
          const product = await db.getProductById(input.productId);
          if (!product || (ctx.user.id !== 0 && product.userId !== ctx.user.id)) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Product not found",
            });
          }
          const enrichmentStatus = await db.getProductEnrichmentStatus(product.id);
          return {
            ...product,
            enrichmentStatus,
          };
        } catch (error) {
          console.error("[Products] Error getting product detail:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch product details",
          });
        }
      }),

    refresh: protectedProcedure
      .input(z.object({
        platform: PLATFORM_SCHEMA,
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          // Digistore24 requires an authenticated browser session, so it uses
          // the local Firefox workflow instead of the placeholder API importer.
          if (input.platform === "digistore24") {
            console.log("[Products] Refreshing Digistore24 through local Firefox workflow");
            const workflow = await runDigistore24RefreshWorkflow(ctx.user.id);

            await db.logDataRefresh(
              ctx.user.id,
              input.platform,
              workflow.partial ? "partial" : "success",
              workflow.productsCount,
              workflow.postError || undefined,
            );

            return workflow;
          }

          // Public marketplaces do not need stored API credentials.
          const publicPlatforms = ["clickbank"];
          const credential = await db.getActiveApiCredential(ctx.user.id, input.platform);

          if (!credential && !publicPlatforms.includes(input.platform)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `No API credentials found for ${input.platform}. Please add your API key first.`,
            });
          }

          // Fetch and process products based on platform
          let processedProducts;
          if (input.platform === "warriorplus") {
            processedProducts = await fetchAndProcessWarriorPlusOffers(credential!.apiKey);
          } else if (input.platform === "clickbank") {
            console.log("[Products] Refreshing ClickBank public marketplace/feed");
            processedProducts = await fetchAndProcessClickBankProducts();
          } else if (input.platform === "shareasale") {
            // Note: ShareASale requires affiliateId, token, and secretKey.
            const [affiliateId, token, secretKey] = credential!.apiKey.split(":");
            if (!affiliateId || !token || !secretKey) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "ShareASale credentials must be in format affiliateId:token:secretKey",
              });
            }
            const awinCredential = await db.getActiveApiCredential(ctx.user.id, "awin");
            if (awinCredential) {
              console.warn("[Products] ShareASale refresh requested while Awin credentials exist. Awin should be preferred for physical feeds.");
            }
            processedProducts = await fetchAndProcessShareASale(affiliateId, token, secretKey);
          } else if (input.platform === "cj") {
            const [companyId, personalAccessToken] = credential!.apiKey.split(":");
            if (!companyId || !personalAccessToken) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "CJ credentials must be in format companyId:personalAccessToken",
              });
            }
            processedProducts = await fetchAndProcessCjProducts(companyId, personalAccessToken);
          } else if (input.platform === "awin") {
            const [publisherId, productFeedApiKey] = credential!.apiKey.split(":");
            if (!publisherId || !productFeedApiKey) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Awin credentials must be in format publisherId:productFeedApiKey",
              });
            }
            processedProducts = await fetchAndProcessAwinProducts(publisherId, productFeedApiKey);
          } else if (input.platform === "impact") {
            const [accountSid, authToken] = credential!.apiKey.split(":");
            if (!accountSid || !authToken) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Impact credentials must be in format accountSid:authToken",
              });
            }
            processedProducts = await fetchAndProcessImpactCatalogItems(accountSid, authToken);
          } else if (input.platform === "amazon") {
            const parts = credential!.apiKey.split(":");
            const partnerTag = parts[0];
            const clientId = parts[1];
            const clientSecret = parts[2];
            const credentialVersion = parts[3] || "3.1";
            const marketplace = parts[4] || "www.amazon.com";

            if (!partnerTag || !clientId || !clientSecret) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Amazon credentials must be in format partnerTag:clientId:clientSecret[:credentialVersion[:marketplace]]",
              });
            }

            processedProducts = await fetchAndProcessAmazonCreatorsProducts({
              partnerTag,
              clientId,
              clientSecret,
              credentialVersion,
              marketplace,
            });
          } else {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Unknown platform",
            });
          }

          // Store in database
          await db.upsertProducts(ctx.user.id, input.platform, processedProducts);

          const postWorkflow = await runPostRefreshWorkflow(input.platform, ctx.user.id);

          // Log the refresh
          await db.logDataRefresh(ctx.user.id, input.platform, "success", processedProducts.length);

          return {
            success: true,
            productsCount: processedProducts.length,
            steps: postWorkflow.steps,
          };
        } catch (error) {
          console.error("[Products] Error refreshing products:", error);

          // Log the error
          await db.logDataRefresh(
            ctx.user.id,
            input.platform,
            "failed",
            0,
            error instanceof Error ? error.message : "Unknown error"
          );

          if (error instanceof TRPCError) {
            throw error;
          }

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Failed to refresh products",
          });
        }
      }),

    exportToShadowCast: protectedProcedure
      .input(z.object({
        productIds: z.array(z.number()).min(1).max(100),
        force: z.boolean().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          return await exportProductsToShadowCast(ctx.user.id, input.productIds, {
            force: input.force === true,
          });
        } catch (error) {
          console.error("[Products] Error exporting to ShadowCast:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Failed to export products to ShadowCast",
          });
        }
      }),

    shadowCastPayload: protectedProcedure
      .input(z.object({
        productId: z.number(),
      }))
      .query(async ({ input, ctx }) => {
        try {
          const product = await db.getProductById(input.productId);
          if (!product || (ctx.user.id !== 0 && product.userId !== ctx.user.id)) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Product not found",
            });
          }
          const directLibUrl = pathToFileURL(path.resolve(process.cwd(), "scripts/shadowcast-direct-lib.mjs")).href;
          const directLib = await import(directLibUrl) as {
            buildPayload: (productId: number) => Promise<any>;
          };
          return await directLib.buildPayload(input.productId);
        } catch (error) {
          console.error("[Products] Error building ShadowCast payload:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Failed to build ShadowCast payload",
          });
        }
      }),
  }),

  // ============ Bookmarks ============
  bookmarks: router({
    list: protectedProcedure
      .query(async ({ ctx }) => {
        try {
          const bookmarks = await db.getBookmarks(ctx.user.id);
          // Enrich with product details
          const enriched = await Promise.all(
            bookmarks.map(async (bookmark) => {
              const product = await db.getProductById(bookmark.productId);
              const enrichmentStatus = product
                ? await db.getProductEnrichmentStatus(product.id)
                : "pending";
              return { ...bookmark, product, enrichmentStatus };
            })
          );
          return enriched;
        } catch (error) {
          console.error("[Bookmarks] Error listing bookmarks:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to fetch bookmarks",
          });
        }
      }),

    add: protectedProcedure
      .input(z.object({
        productId: z.number(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          // Verify product exists and belongs to user
          const product = await db.getProductById(input.productId);
          if (!product || (ctx.user.id !== 0 && product.userId !== ctx.user.id)) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Product not found",
            });
          }

          await db.addBookmark(ctx.user.id, input.productId, input.notes);
          return { success: true };
        } catch (error) {
          console.error("[Bookmarks] Error adding bookmark:", error);
          if (error instanceof TRPCError) throw error;
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to add bookmark",
          });
        }
      }),

    remove: protectedProcedure
      .input(z.object({
        productId: z.number(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          await db.removeBookmark(ctx.user.id, input.productId);
          return { success: true };
        } catch (error) {
          console.error("[Bookmarks] Error removing bookmark:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to remove bookmark",
          });
        }
      }),

    updateStatus: protectedProcedure
      .input(z.object({
        productId: z.number(),
        status: z.enum(["interested", "researching", "promoting", "archived"]),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          await db.updateBookmarkStatus(ctx.user.id, input.productId, input.status);
          return { success: true };
        } catch (error) {
          console.error("[Bookmarks] Error updating bookmark status:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update bookmark status",
          });
        }
      }),

    isBookmarked: protectedProcedure
      .input(z.object({
        productId: z.number(),
      }))
      .query(async ({ input, ctx }) => {
        try {
          const isBookmarked = await db.isProductBookmarked(ctx.user.id, input.productId);
          return isBookmarked;
        } catch (error) {
          console.error("[Bookmarks] Error checking bookmark status:", error);
          return false;
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
