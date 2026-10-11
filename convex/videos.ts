import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import {
  getVisibleVideos,
  upsertVideo,
  getVideoByYoutubeId,
} from "./model/videos";
import { getVideoStats, getVideoStatsByType } from "./videoAggregates";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await getVisibleVideos(ctx);
  },
});

// Internal query to get video by youtubeId (for use in actions)
export const getByYoutubeId = internalQuery({
  args: { youtubeId: v.string() },
  handler: async (ctx, { youtubeId }) => {
    return await getVideoByYoutubeId(ctx, youtubeId);
  },
});

// Internal query to get video by ID (for notifications)
export const getById = internalQuery({
  args: { id: v.id("videos") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

// Internal query to list all videos marked as "mine" (for batch processing)
export const listMine = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("videos")
      .withIndex("by_isMikes", (q) => q.eq("isMikes", "mine"))
      .collect();
  },
});

// Internal query to list all videos (for admin operations)
export const listAll = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("videos").collect();
  },
});

export const stats = query({
  args: {},
  handler: async (ctx) => {
    return await getVideoStats(ctx);
  },
});

export const statsByType = query({
  args: { videoType: v.union(v.literal("longform"), v.literal("shorts")) },
  handler: async (ctx, { videoType }) => {
    return await getVideoStatsByType(ctx, videoType);
  },
});

export const upsert = internalMutation({
  args: {
    youtubeId: v.string(),
    title: v.string(),
    description: v.string(),
    thumbnailUrl: v.string(),
    publishedAt: v.string(),
    viewCount: v.optional(v.number()),
    likeCount: v.optional(v.number()),
    commentCount: v.optional(v.number()),
    duration: v.optional(v.string()),
    categoryId: v.optional(v.string()),
    defaultLanguage: v.optional(v.string()),
    defaultAudioLanguage: v.optional(v.string()),
    wasLiveStream: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await upsertVideo(ctx, args);
  },
});

// Public mutation for testing purposes
export const add = mutation({
  args: {
    youtubeId: v.string(),
    title: v.string(),
    description: v.string(),
    thumbnailUrl: v.string(),
    publishedAt: v.string(),
    viewCount: v.optional(v.number()),
    likeCount: v.optional(v.number()),
    commentCount: v.optional(v.number()),
    duration: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await upsertVideo(ctx, args);
  },
});
