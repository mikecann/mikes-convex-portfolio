import { query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { getVisibleArticles, upsertArticle, getArticleBySlug } from "./model/articles";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await getVisibleArticles(ctx);
  },
});

export const getBySlug = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await getArticleBySlug(ctx, slug);
  },
});

export const upsert = internalMutation({
  args: {
    slug: v.string(),
    title: v.string(),
    description: v.string(),
    thumbnailUrl: v.optional(v.string()),
    publishedAt: v.string(),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    return await upsertArticle(ctx, args);
  },
});

// Internal so only tests, other functions and `npx convex run` can call it
export const add = internalMutation({
  args: {
    slug: v.string(),
    title: v.string(),
    description: v.string(),
    thumbnailUrl: v.optional(v.string()),
    publishedAt: v.string(),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    return await upsertArticle(ctx, args);
  },
});
