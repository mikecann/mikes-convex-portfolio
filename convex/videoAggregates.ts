import { TableAggregate } from "@convex-dev/aggregate";
import { components } from "./_generated/api";
import { DataModel, Doc } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";
import { getVideoType } from "./lib/videoUtils";

// Video type namespace: "longform" | "shorts"
type VideoType = "longform" | "shorts";

// Aggregate for video views by type
export const viewsAggregate = new TableAggregate<{
  Namespace: VideoType;
  Key: number;
  DataModel: DataModel;
  TableName: "videos";
}>(components.videoViews, {
  namespace: (doc) => getVideoType(doc),
  sortKey: (doc) => doc._creationTime,
  sumValue: (doc) => doc.viewCount ?? 0,
});

// Aggregate for video likes by type
export const likesAggregate = new TableAggregate<{
  Namespace: VideoType;
  Key: number;
  DataModel: DataModel;
  TableName: "videos";
}>(components.videoLikes, {
  namespace: (doc) => getVideoType(doc),
  sortKey: (doc) => doc._creationTime,
  sumValue: (doc) => doc.likeCount ?? 0,
});

// Aggregate for video comments by type
export const commentsAggregate = new TableAggregate<{
  Namespace: VideoType;
  Key: number;
  DataModel: DataModel;
  TableName: "videos";
}>(components.videoComments, {
  namespace: (doc) => getVideoType(doc),
  sortKey: (doc) => doc._creationTime,
  sumValue: (doc) => doc.commentCount ?? 0,
});

// Helper to check if video should be in aggregates (visible only = isMikes === "mine")
function shouldIncludeInAggregates(doc: Doc<"videos">): boolean {
  return doc.isMikes === "mine";
}

// Helper to insert a video into all aggregates (only if visible)
export async function insertVideoAggregates(
  ctx: MutationCtx,
  doc: Doc<"videos">
) {
  if (!shouldIncludeInAggregates(doc)) return;

  await Promise.all([
    viewsAggregate.insert(ctx, doc),
    likesAggregate.insert(ctx, doc),
    commentsAggregate.insert(ctx, doc),
  ]);
}

// Helper to update a video in all aggregates
export async function replaceVideoAggregates(
  ctx: MutationCtx,
  oldDoc: Doc<"videos">,
  newDoc: Doc<"videos">
) {
  const wasVisible = shouldIncludeInAggregates(oldDoc);
  const isVisible = shouldIncludeInAggregates(newDoc);

  if (wasVisible && isVisible) {
    // Both visible - just replace
    await Promise.all([
      viewsAggregate.replace(ctx, oldDoc, newDoc),
      likesAggregate.replace(ctx, oldDoc, newDoc),
      commentsAggregate.replace(ctx, oldDoc, newDoc),
    ]);
  } else if (wasVisible && !isVisible) {
    // Was "mine", now not "mine" - delete from aggregates
    await Promise.all([
      viewsAggregate.delete(ctx, oldDoc),
      likesAggregate.delete(ctx, oldDoc),
      commentsAggregate.delete(ctx, oldDoc),
    ]);
  } else if (!wasVisible && isVisible) {
    // Was not "mine", now "mine" - insert into aggregates
    await Promise.all([
      viewsAggregate.insert(ctx, newDoc),
      likesAggregate.insert(ctx, newDoc),
      commentsAggregate.insert(ctx, newDoc),
    ]);
  }
  // If both not "mine", do nothing
}

// Ownership changes used to skip the aggregates, so some "mine" videos are missing from
// them. These tolerant variants don't throw when a video is (or isn't) already there.
export async function syncVideoAggregatesAfterOwnershipChange(
  ctx: MutationCtx,
  oldDoc: Doc<"videos">,
  newDoc: Doc<"videos">
) {
  const wasVisible = shouldIncludeInAggregates(oldDoc);
  const isVisible = shouldIncludeInAggregates(newDoc);
  if (wasVisible === isVisible) return;

  if (isVisible) {
    await Promise.all([
      viewsAggregate.insertIfDoesNotExist(ctx, newDoc),
      likesAggregate.insertIfDoesNotExist(ctx, newDoc),
      commentsAggregate.insertIfDoesNotExist(ctx, newDoc),
    ]);
  } else {
    await Promise.all([
      viewsAggregate.deleteIfExists(ctx, oldDoc),
      likesAggregate.deleteIfExists(ctx, oldDoc),
      commentsAggregate.deleteIfExists(ctx, oldDoc),
    ]);
  }
}

// Helper to delete a video from all aggregates
export async function deleteVideoAggregates(
  ctx: MutationCtx,
  doc: Doc<"videos">
) {
  if (!shouldIncludeInAggregates(doc)) return;

  await Promise.all([
    viewsAggregate.delete(ctx, doc),
    likesAggregate.delete(ctx, doc),
    commentsAggregate.delete(ctx, doc),
  ]);
}

// Get stats for a specific video type (longform or shorts)
async function getStatsByType(ctx: QueryCtx, videoType: VideoType) {
  const [views, likes, comments, count] = await Promise.all([
    viewsAggregate.sum(ctx, { namespace: videoType }),
    likesAggregate.sum(ctx, { namespace: videoType }),
    commentsAggregate.sum(ctx, { namespace: videoType }),
    viewsAggregate.count(ctx, { namespace: videoType }),
  ]);

  return { views, likes, comments, count };
}

// Get all video stats (combined longform + shorts)
export async function getVideoStats(ctx: QueryCtx) {
  const [longformStats, shortsStats] = await Promise.all([
    getStatsByType(ctx, "longform"),
    getStatsByType(ctx, "shorts"),
  ]);

  return {
    totalViews: longformStats.views + shortsStats.views,
    totalLikes: longformStats.likes + shortsStats.likes,
    totalComments: longformStats.comments + shortsStats.comments,
    videoCount: longformStats.count + shortsStats.count,
  };
}

// Get stats by video type
export async function getVideoStatsByType(
  ctx: QueryCtx,
  videoType: "longform" | "shorts"
) {
  const stats = await getStatsByType(ctx, videoType);

  return {
    totalViews: stats.views,
    totalLikes: stats.likes,
    totalComments: stats.comments,
    videoCount: stats.count,
  };
}
