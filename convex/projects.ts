import { query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { getVisibleProjects, getAllProjects, upsertProject } from "./model/projects";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await getVisibleProjects(ctx);
  },
});

export const upsert = internalMutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    demoUrl: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    sourceType: v.union(v.literal("video"), v.literal("article")),
    sourceId: v.string(),
    extractedAt: v.string(),
    publishedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await upsertProject(ctx, args);
  },
});

// Internal so only tests, other functions and `npx convex run` can call it
export const add = internalMutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    demoUrl: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    sourceType: v.union(v.literal("video"), v.literal("article")),
    sourceId: v.string(),
    extractedAt: v.string(),
    publishedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await upsertProject(ctx, args);
  },
});

// Clear all projects
export const clearAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db.query("projects").collect();
    let count = 0;
    for (const project of projects) {
      await ctx.db.delete(project._id);
      count++;
    }
    console.log(`Deleted ${count} projects`);
    return { deleted: count };
  },
});

// Internal query to list all projects
export const listAll = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await getAllProjects(ctx);
  },
});

// Internal mutation to update a project's thumbnail
export const updateThumbnail = internalMutation({
  args: {
    id: v.id("projects"),
    thumbnailUrl: v.optional(v.string()),
  },
  handler: async (ctx, { id, thumbnailUrl }) => {
    await ctx.db.patch(id, { thumbnailUrl });
  },
});

// Internal mutation to update a project's publishedAt
export const updatePublishedAt = internalMutation({
  args: {
    id: v.id("projects"),
    publishedAt: v.string(),
  },
  handler: async (ctx, { id, publishedAt }) => {
    await ctx.db.patch(id, { publishedAt });
  },
});
