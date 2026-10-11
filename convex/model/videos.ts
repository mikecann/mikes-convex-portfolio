import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  insertVideoAggregates,
  replaceVideoAggregates,
  deleteVideoAggregates,
  syncVideoAggregatesAfterOwnershipChange,
} from "../videoAggregates";

export interface UpsertVideoResult {
  id: Id<"videos">;
  isNew: boolean;
}

export interface VideoData {
  youtubeId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  publishedAt: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  duration?: string;
  categoryId?: string;
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
  wasLiveStream?: boolean;
}

export async function getVideoByYoutubeId(ctx: QueryCtx, youtubeId: string) {
  return await ctx.db
    .query("videos")
    .withIndex("by_youtubeId", (q) => q.eq("youtubeId", youtubeId))
    .first();
}

export async function getAllVideos(ctx: QueryCtx) {
  return await ctx.db
    .query("videos")
    .withIndex("by_publishedAt")
    .order("desc")
    .collect();
}

export async function getVisibleVideos(ctx: QueryCtx) {
  // Only videos marked as "mine" are visible
  // Query by isMikes index, then sort by publishedAt in memory
  const videos = await ctx.db
    .query("videos")
    .withIndex("by_isMikes", (q) => q.eq("isMikes", "mine"))
    .collect();

  // Sort by publishedAt descending (newest first)
  return videos.sort((a, b) =>
    new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

export async function upsertVideo(
  ctx: MutationCtx,
  videoData: VideoData
): Promise<UpsertVideoResult> {
  const existing = await getVideoByYoutubeId(ctx, videoData.youtubeId);
  if (existing) {
    // Update existing video and sync aggregates
    // Note: We preserve the existing isMikes status
    await ctx.db.patch(existing._id, videoData);
    const newDoc = await ctx.db.get(existing._id);
    if (newDoc) {
      await replaceVideoAggregates(ctx, existing, newDoc);
    }
    return { id: existing._id, isNew: false };
  }
  // Insert new video with isMikes: "undecided" and sync aggregates
  const id = await ctx.db.insert("videos", {
    ...videoData,
    isMikes: "undecided",
  });
  const newDoc = await ctx.db.get(id);
  if (newDoc) {
    await insertVideoAggregates(ctx, newDoc);
  }
  return { id, isNew: true };
}

export async function deleteAllVideos(ctx: MutationCtx) {
  const videos = await ctx.db.query("videos").collect();
  for (const video of videos) {
    await deleteVideoAggregates(ctx, video);
    await ctx.db.delete(video._id);
  }
}

// The one place a video's ownership changes, whether Mike or Jev decided it.
// Keeps the stats aggregates in sync and extracts projects for newly "mine" videos.
export async function setVideoOwnership(
  ctx: MutationCtx,
  video: Doc<"videos">,
  isMikes: "mine" | "notMine",
  decidedBy: "mike" | "jev"
) {
  await ctx.db.patch(video._id, { isMikes, ownershipDecidedBy: decidedBy });
  const updated = await ctx.db.get(video._id);
  if (updated) {
    await syncVideoAggregatesAfterOwnershipChange(ctx, video, updated);
  }

  const becameMine = isMikes === "mine" && video.isMikes !== "mine";
  if (becameMine) {
    await ctx.scheduler.runAfter(0, internal.youtube.extractProjectsForVideo, {
      youtubeId: video.youtubeId,
    });
  }
  return { becameMine };
}
