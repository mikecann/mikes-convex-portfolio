import { getServiceToken } from "convex/server";
import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { setVideoOwnership } from "./model/videos";
import {
  buildOwnershipRequest,
  decideOwnership,
  EXAMPLES_PER_SIDE,
  JEV_DECISIONS_URL,
  probabilityMine,
  type JevChoiceAnswer,
  type OwnershipExample,
  type VideoForJudging,
} from "./lib/ownershipJudge";

const isUndecided = (video: Doc<"videos">) =>
  (video.isMikes ?? "undecided") === "undecided";

// The latest sorted videos of each kind, which Jev uses as examples.
export const recentDecisions = internalQuery({
  args: {},
  handler: async (ctx): Promise<OwnershipExample[]> => {
    const latest = async (isMikes: "mine" | "notMine") => {
      const videos = await ctx.db
        .query("videos")
        .withIndex("by_isMikes", (q) => q.eq("isMikes", isMikes))
        .collect();
      return videos
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
        .slice(0, EXAMPLES_PER_SIDE)
        .map((video) => ({
          title: video.title,
          duration: video.duration,
          categoryId: video.categoryId,
          defaultLanguage: video.defaultLanguage,
          defaultAudioLanguage: video.defaultAudioLanguage,
          wasLiveStream: video.wasLiveStream,
          isMikes,
        }));
    };
    return [...(await latest("mine")), ...(await latest("notMine"))];
  },
});

// Ask Jev about each undecided video, then let Mike know what it did.
export const judgeVideos = internalAction({
  args: { videoIds: v.array(v.id("videos")), notify: v.optional(v.boolean()) },
  handler: async (ctx, { videoIds, notify }) => {
    const examples = await ctx.runQuery(internal.ownership.recentDecisions, {});
    for (const id of videoIds) {
      const video = await ctx.runQuery(internal.videos.getById, { id });
      if (!video || !isUndecided(video)) continue;
      try {
        const pMine = await askJev(video, examples);
        await ctx.runMutation(internal.ownership.applyJevVerdict, {
          id,
          probabilityMine: pMine,
        });
      } catch (error) {
        // Leave it undecided so it still shows up in the email for Mike.
        console.error(`Jev couldn't judge "${video.title}":`, error);
      }
    }

    if (notify) {
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.sendModerationNotification,
        { newVideoIds: videoIds }
      );
    }
  },
});

export const applyJevVerdict = internalMutation({
  args: { id: v.id("videos"), probabilityMine: v.number() },
  handler: async (ctx, { id, probabilityMine }) => {
    const video = await ctx.db.get(id);
    // Mike may have sorted it while Jev was thinking. His decision wins.
    if (!video || !isUndecided(video)) return null;

    await ctx.db.patch(id, { jevProbabilityMine: probabilityMine });
    const decision = decideOwnership(probabilityMine);
    if (decision !== "undecided") {
      await setVideoOwnership(ctx, video, decision, "jev");
    }
    return decision;
  },
});

async function askJev(
  video: VideoForJudging,
  examples: OwnershipExample[]
): Promise<number> {
  const res = await fetch(JEV_DECISIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getServiceToken("ai-gateway")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildOwnershipRequest(video, examples)),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Jev request failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return probabilityMine(body.answers.owner as JevChoiceAnswer);
}
