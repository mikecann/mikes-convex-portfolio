import { parseDurationToSeconds } from "./videoUtils";

// Jev (TypeSafe's decision model, via the Convex AI Gateway) decides whether a new
// Convex channel video is one of Mike's. Pure helpers live here so they can be tested.

export const JEV_MODEL = "typesafe/jev-1.13";
export const DECISIONS_URL = "https://ai-gateway.convex.dev/alpha/decisions";

// Jev only auto-decides when it is at least this sure. Anything in between stays
// "undecided" and lands in the moderation email for Mike. Tuned against Mike's
// past decisions, see docs/ownership-backtest.md.
export const AUTO_DECIDE_THRESHOLD = 0.9;

// How many of Mike's latest decisions of each kind Jev sees as examples.
export const EXAMPLES_PER_SIDE = 25;

// When Jev leans "mine" but isn't sure, Cloudflare's Clef (a decision model that can see
// images) checks the thumbnail for Mike's black Convex cap. Only a near-certain yes
// tips it to "mine". See docs/ownership-backtest.md.
export const CAP_CHECK_MODEL = "cloudflare/clef";
export const CAP_THRESHOLD = 0.97;

const MAX_DESCRIPTION_CHARS = 2500;

export type Ownership = "mine" | "notMine";

interface UploadSummary {
  title: string;
  duration?: string;
  // YouTube upload settings. Each uploader's defaults differ, so they work like a fingerprint.
  categoryId?: string;
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
  wasLiveStream?: boolean;
}

export interface VideoForJudging extends UploadSummary {
  description: string;
  publishedAt: string;
}

export interface OwnershipExample extends UploadSummary {
  isMikes: Ownership;
}

const YOUTUBE_CATEGORIES: Record<string, string> = {
  "22": "People & Blogs",
  "24": "Entertainment",
  "27": "Education",
  "28": "Science & Technology",
};

export function uploadFingerprint(video: UploadSummary): string {
  const category = video.categoryId
    ? (YOUTUBE_CATEGORIES[video.categoryId] ?? `category ${video.categoryId}`)
    : "unknown category";
  return [
    category,
    `language ${video.defaultLanguage ?? "unset"}`,
    `audio ${video.defaultAudioLanguage ?? "unset"}`,
    video.wasLiveStream ? "live stream" : "upload",
  ].join(", ");
}

function summarise(video: UploadSummary) {
  return {
    title: video.title,
    length: formatDuration(video.duration) ?? "unknown",
    uploadSettings: uploadFingerprint(video),
  };
}

export function formatDuration(duration?: string): string | undefined {
  const total = parseDurationToSeconds(duration);
  if (total === 0) return undefined;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean).join(" ");
}

export function buildOwnershipRequest(
  video: VideoForJudging,
  examples: OwnershipExample[]
) {
  const description =
    video.description.length > MAX_DESCRIPTION_CHARS
      ? `${video.description.slice(0, MAX_DESCRIPTION_CHARS)}...`
      : video.description;

  return {
    model: JEV_MODEL,
    state: {
      video: {
        ...summarise(video),
        description: description || "(no description)",
        publishedAt: video.publishedAt.slice(0, 10),
      },
    },
    questions: {
      owner: {
        type: "choice",
        instructions: {
          task: "This video was uploaded to the official Convex YouTube channel, which several people upload to. Decide whether Mike Cann made it. Compare it with the recent videos below, which Mike has already sorted. Upload settings are strong evidence because each person uploads with their own defaults, but they change over time, so weigh the most recent examples most.",
          mikesRecentVideos: examples
            .filter((e) => e.isMikes === "mine")
            .map(summarise),
          otherPeoplesRecentVideos: examples
            .filter((e) => e.isMikes === "notMine")
            .map(summarise),
        },
        criteria: {
          mine: "Mike Cann made it. Mike is a developer advocate at Convex and makes most of the channel's regular uploads: tutorials and builds, Convex release round-ups, short tips, AI coding experiments, personal projects, series, and chats he hosts with Convex founders and engineers.",
          notMine:
            "Someone else made it: live streams, meetups, events, AMAs, podcasts, talks, customer and startup stories, and other people's tutorials.",
        },
      },
    },
  };
}

export interface JevChoiceAnswer {
  choice: string;
  confidence?: number;
  probabilities?: Record<string, number>;
}

// Probability that the video is Mike's. Jev's rounded probabilities can disagree with
// its own pick, so trust the probabilities when present (same as the Magic Jev Ball).
// Without any score, return 0.5 so the video is left for Mike.
export function probabilityMine(answer: JevChoiceAnswer): number {
  if (answer.probabilities && typeof answer.probabilities.mine === "number") {
    return answer.probabilities.mine;
  }
  if (typeof answer.confidence === "number") {
    if (answer.choice === "mine") return answer.confidence;
    if (answer.choice === "notMine") return 1 - answer.confidence;
  }
  return 0.5;
}

export function decideOwnership(
  pMine: number,
  capProbability?: number
): Ownership | "undecided" {
  if (pMine >= AUTO_DECIDE_THRESHOLD) return "mine";
  if (1 - pMine >= AUTO_DECIDE_THRESHOLD) return "notMine";
  if (shouldCheckThumbnail(pMine) && (capProbability ?? 0) >= CAP_THRESHOLD) return "mine";
  return "undecided";
}

// Only worth looking at the thumbnail when Jev leans "mine" but couldn't decide.
export function shouldCheckThumbnail(pMine: number): boolean {
  return pMine >= 0.5 && pMine < AUTO_DECIDE_THRESHOLD;
}

// The Convex AI Gateway takes images as OpenAI-style parts inside `state`.
export function buildCapCheckRequest(thumbnailDataUrl: string) {
  return {
    model: CAP_CHECK_MODEL,
    state: [
      { type: "image_url", image_url: { url: thumbnailDataUrl } },
      { type: "text", text: "The image is a YouTube thumbnail." },
    ],
    questions: {
      convexCap: {
        type: "noul",
        instructions:
          "Is someone in this image wearing a black baseball cap with the white Convex logo on it?",
      },
    },
  };
}
