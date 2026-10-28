import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Simple auth sessions
  sessions: defineTable({
    token: v.string(),
    email: v.string(),
    expiresAt: v.number(),
  }).index("by_token", ["token"]),

  videos: defineTable({
    youtubeId: v.string(),
    title: v.string(),
    description: v.string(),
    thumbnailUrl: v.string(),
    publishedAt: v.string(),
    viewCount: v.optional(v.number()),
    likeCount: v.optional(v.number()),
    commentCount: v.optional(v.number()),
    duration: v.optional(v.string()),
    // Ownership status: "undecided" for new videos, "mine" or "notMine" after admin review
    // Videos are only visible if isMikes === "mine"
    isMikes: v.optional(
      v.union(v.literal("undecided"), v.literal("mine"), v.literal("notMine"))
    ),
    // Who set isMikes. Missing means Mike (every decision before Jev existed).
    ownershipDecidedBy: v.optional(v.union(v.literal("mike"), v.literal("jev"))),
    // Jev's probability that the video is Mike's, kept even when it was too unsure to decide.
    jevProbabilityMine: v.optional(v.number()),
    // Clef's probability that Mike's black Convex cap is on the thumbnail. Only checked
    // when Jev leans "mine" but isn't sure.
    thumbnailCapProbability: v.optional(v.number()),
    // YouTube upload settings. Each uploader's defaults differ, so Jev uses them as a fingerprint.
    categoryId: v.optional(v.string()),
    defaultLanguage: v.optional(v.string()),
    defaultAudioLanguage: v.optional(v.string()),
    wasLiveStream: v.optional(v.boolean()),
  })
    .index("by_youtubeId", ["youtubeId"])
    .index("by_publishedAt", ["publishedAt"])
    .index("by_isMikes", ["isMikes"]),

  // Articles from stack.convex.dev/author/mike-cann are always "mine" and visible
  articles: defineTable({
    slug: v.string(),
    title: v.string(),
    description: v.string(),
    thumbnailUrl: v.optional(v.string()),
    publishedAt: v.string(),
    url: v.string(),
  })
    .index("by_slug", ["slug"])
    .index("by_publishedAt", ["publishedAt"]),

  // Tweets from X (Twitter) - only user's own posts
  tweets: defineTable({
    tweetId: v.string(),
    text: v.string(),
    publishedAt: v.string(),
    url: v.string(),
    mediaUrls: v.optional(v.array(v.string())),
    retweetCount: v.optional(v.number()),
    replyCount: v.optional(v.number()),
    likeCount: v.optional(v.number()),
    viewCount: v.optional(v.number()),
    // True when the post replies to another post, including my own thread replies. Older
    // rows synced before this field existed don't have it.
    isReply: v.optional(v.boolean()),
  })
    .index("by_tweetId", ["tweetId"])
    .index("by_publishedAt", ["publishedAt"]),

  // Public commits from the open source Convex backend repo
  codeContributions: defineTable({
    sha: v.string(),
    shortSha: v.string(),
    title: v.string(),
    rawTitle: v.string(),
    committedAt: v.string(),
    url: v.string(),
    repository: v.string(),
    authorName: v.string(),
  })
    .index("by_sha", ["sha"])
    .index("by_committedAt", ["committedAt"]),

  // Projects are created from "mine" content, can be hidden by admin
  projects: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    demoUrl: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    sourceType: v.union(v.literal("video"), v.literal("article")),
    sourceId: v.string(),
    extractedAt: v.string(),
    // Publication date from the source video/article (for sorting)
    publishedAt: v.optional(v.string()),
    // Normalized name for fuzzy duplicate detection (lowercase, hyphenated)
    normalizedName: v.optional(v.string()),
    // Admin can hide projects
    isHidden: v.optional(v.boolean()),
  })
    .index("by_name", ["name"])
    .index("by_sourceType", ["sourceType"])
    .index("by_sourceId", ["sourceId"])
    .index("by_sourceUrl", ["sourceUrl"])
    .index("by_normalizedName", ["normalizedName"])
    .index("by_publishedAt", ["publishedAt"]),
});
