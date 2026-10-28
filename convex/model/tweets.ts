import { QueryCtx, MutationCtx } from "../_generated/server";

export interface TweetData {
  tweetId: string;
  text: string;
  publishedAt: string;
  url: string;
  mediaUrls?: string[];
  retweetCount?: number;
  replyCount?: number;
  likeCount?: number;
  viewCount?: number;
  isReply?: boolean;
}

export async function getTweetByTweetId(ctx: QueryCtx, tweetId: string) {
  return await ctx.db
    .query("tweets")
    .withIndex("by_tweetId", (q) => q.eq("tweetId", tweetId))
    .first();
}

export async function getAllTweets(ctx: QueryCtx) {
  return await ctx.db
    .query("tweets")
    .withIndex("by_publishedAt")
    .order("desc")
    .collect();
}

export async function getVisibleTweets(ctx: QueryCtx) {
  // All tweets are "mine" since we only fetch from the authenticated user
  return await getAllTweets(ctx);
}

export async function upsertTweet(ctx: MutationCtx, tweetData: TweetData) {
  const existing = await getTweetByTweetId(ctx, tweetData.tweetId);
  if (existing) {
    await ctx.db.patch(existing._id, tweetData);
    return existing._id;
  }
  return await ctx.db.insert("tweets", tweetData);
}

export async function deleteAllTweets(ctx: MutationCtx) {
  const tweets = await ctx.db.query("tweets").collect();
  for (const tweet of tweets) {
    await ctx.db.delete(tweet._id);
  }
}
