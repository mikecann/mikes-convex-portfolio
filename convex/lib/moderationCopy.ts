import { Id } from "../_generated/dataModel";

// Wording for the moderation email, kept here so it can be tested without Resend.

export interface VideoForNotification {
  _id: Id<"videos">;
  title: string;
  thumbnailUrl: string;
  youtubeId: string;
  publishedAt: string;
  isMikes?: "undecided" | "mine" | "notMine";
  ownershipDecidedBy?: "mike" | "jev";
  jevProbabilityMine?: number;
  thumbnailCapProbability?: number;
}

export const needsMike = (video: VideoForNotification) =>
  (video.isMikes ?? "undecided") === "undecided";

const percent = (p: number) => `${Math.round(p * 100)}%`;

export function describeVerdict(video: VideoForNotification): string {
  const pMine = video.jevProbabilityMine;
  if (needsMike(video)) {
    return pMine === undefined
      ? "Needs you: Jev couldn't check it"
      : `Needs you: Jev was only ${percent(pMine)} sure it's yours`;
  }
  const yours = video.isMikes === "mine";
  if (video.ownershipDecidedBy === "jev" && pMine !== undefined) {
    if (!yours) return `Jev marked it not yours (${percent(1 - pMine)} sure)`;
    return pMine < 0.9 && video.thumbnailCapProbability !== undefined
      ? `Jev marked it yours (${percent(pMine)} sure, and your Convex cap is on the thumbnail)`
      : `Jev marked it yours (${percent(pMine)} sure)`;
  }
  return yours ? "You marked it yours" : "You marked it not yours";
}

export function moderationSubject(videos: VideoForNotification[]): string {
  const waiting = videos.filter(needsMike).length;
  const sortedByJev = videos.filter((video) => video.ownershipDecidedBy === "jev").length;
  const plural = (n: number) => `${n} new video${n === 1 ? "" : "s"}`;
  if (waiting > 0) return `${plural(waiting)} need${waiting === 1 ? "s" : ""} you`;
  if (sortedByJev === videos.length) return `Jev sorted ${plural(videos.length)}`;
  return `${plural(videos.length)}, nothing needs you`;
}
