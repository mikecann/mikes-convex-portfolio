import { query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { getVisibleTweets, upsertTweet, getTweetByTweetId } from "./model/tweets";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await getVisibleTweets(ctx);
  },
});

export const getByTweetId = internalQuery({
  args: { tweetId: v.string() },
  handler: async (ctx, { tweetId }) => {
    return await getTweetByTweetId(ctx, tweetId);
  },
});

export const upsert = internalMutation({
  args: {
    tweetId: v.string(),
    text: v.string(),
    publishedAt: v.string(),
    url: v.string(),
    mediaUrls: v.optional(v.array(v.string())),
    retweetCount: v.optional(v.number()),
    replyCount: v.optional(v.number()),
    likeCount: v.optional(v.number()),
    viewCount: v.optional(v.number()),
    isReply: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await upsertTweet(ctx, args);
  },
});

// Internal so only tests, other functions and `npx convex run` can call it
export const add = internalMutation({
  args: {
    tweetId: v.string(),
    text: v.string(),
    publishedAt: v.string(),
    url: v.string(),
    mediaUrls: v.optional(v.array(v.string())),
    retweetCount: v.optional(v.number()),
    replyCount: v.optional(v.number()),
    likeCount: v.optional(v.number()),
    viewCount: v.optional(v.number()),
    isReply: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await upsertTweet(ctx, args);
  },
});
