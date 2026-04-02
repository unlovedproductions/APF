import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { fetchAndProcessWarriorPlusOffers } from "./warriorplus";
import { fetchAndProcessDigistore24Products } from "./digistore24";
import { TRPCError } from "@trpc/server";

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
        platform: z.enum(["warriorplus", "digistore24"]),
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
        platform: z.enum(["warriorplus", "digistore24"]),
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
        platform: z.enum(["warriorplus", "digistore24"]),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }))
      .query(async ({ input, ctx }) => {
        try {
          const products = await db.getProductsByUser(ctx.user.id, input.platform, input.limit, input.offset);
          return products;
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
        platform: z.enum(["warriorplus", "digistore24"]),
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
        platform: z.enum(["warriorplus", "digistore24"]),
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
          if (!product || product.userId !== ctx.user.id) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Product not found",
            });
          }
          return product;
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
        platform: z.enum(["warriorplus", "digistore24"]),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          // Get API credentials
          const credential = await db.getActiveApiCredential(ctx.user.id, input.platform);
          if (!credential) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `No API credentials found for ${input.platform}. Please add your API key first.`,
            });
          }

          // Fetch and process products based on platform
          let processedProducts;
          if (input.platform === "warriorplus") {
            processedProducts = await fetchAndProcessWarriorPlusOffers(credential.apiKey);
          } else if (input.platform === "digistore24") {
            // Note: Digistore24 doesn't require API key for marketplace scraping
            processedProducts = await fetchAndProcessDigistore24Products();
          } else {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Unknown platform",
            });
          }

          // Store in database
          await db.upsertProducts(ctx.user.id, input.platform, processedProducts);

          // Log the refresh
          await db.logDataRefresh(ctx.user.id, input.platform, "success", processedProducts.length);

          return {
            success: true,
            productsCount: processedProducts.length,
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
              return { ...bookmark, product };
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
          if (!product || product.userId !== ctx.user.id) {
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
