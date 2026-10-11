import { convexTest } from "convex-test";
import aggregate from "@convex-dev/aggregate/test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import {
  buildOwnershipRequest,
  decideOwnership,
  probabilityMine,
  uploadFingerprint,
  type OwnershipExample,
} from "../lib/ownershipJudge";
import { describeVerdict, moderationSubject } from "../lib/moderationCopy";
import { Id } from "../_generated/dataModel";

const modules = import.meta.glob("../**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  aggregate.register(t, "videoViews");
  aggregate.register(t, "videoLikes");
  aggregate.register(t, "videoComments");
  return t;
}

// How a YouTube refresh stores a new video: undecided, so not in the stats yet.
async function addUndecidedVideo(t: ReturnType<typeof setup>, youtubeId = "abc123") {
  return await t.run(async (ctx) =>
    ctx.db.insert("videos", {
      youtubeId,
      title: "Mike's AI Tip: use more than one AI review bot",
      description: "A short tip",
      thumbnailUrl: "https://example.com/thumb.jpg",
      publishedAt: "2026-10-01T10:00:00Z",
      viewCount: 500,
      isMikes: "undecided",
    })
  );
}

const getVideo = (t: ReturnType<typeof setup>, id: Id<"videos">) =>
  t.run(async (ctx) => await ctx.db.get(id));

describe("deciding ownership from Jev's probability", () => {
  it("marks a video mine only when Jev is at least 90% sure", () => {
    expect(decideOwnership(0.9)).toBe("mine");
    expect(decideOwnership(0.97)).toBe("mine");
    expect(decideOwnership(0.89)).toBe("undecided");
  });

  it("marks a video not mine only when Jev is at least 90% sure it isn't", () => {
    expect(decideOwnership(0.1)).toBe("notMine");
    expect(decideOwnership(0.02)).toBe("notMine");
    expect(decideOwnership(0.11)).toBe("undecided");
  });

  it("trusts Jev's probabilities over its pick when they disagree", () => {
    expect(probabilityMine({ choice: "notMine", probabilities: { mine: 0.6, notMine: 0.4 } })).toBe(0.6);
  });

  it("falls back to Jev's confidence, and leaves the video for Mike without any score", () => {
    expect(probabilityMine({ choice: "mine", confidence: 0.7 })).toBe(0.7);
    expect(probabilityMine({ choice: "notMine", confidence: 0.95 })).toBeCloseTo(0.05);
    expect(decideOwnership(probabilityMine({ choice: "mine" }))).toBe("undecided");
  });
});

describe("the request sent to Jev", () => {
  const examples: OwnershipExample[] = [
    { title: "Convex 1.46 makes optional validators much nicer", duration: "PT2M53S", categoryId: "28", defaultLanguage: "en", defaultAudioLanguage: "en-US", isMikes: "mine" },
    { title: "Realtime Real Talk AMA", duration: "PT1H7M23S", categoryId: "24", defaultLanguage: "en-US", defaultAudioLanguage: "en", wasLiveStream: true, isMikes: "notMine" },
  ];

  it("shows Jev Mike's recent decisions with their upload settings", () => {
    const body = buildOwnershipRequest(
      { title: "New video", description: "", publishedAt: "2026-10-10T00:00:00Z", duration: "PT1M5S", categoryId: "28" },
      examples
    );
    const { instructions } = body.questions.owner;
    expect(instructions.mikesRecentVideos).toEqual([
      { title: "Convex 1.46 makes optional validators much nicer", length: "2m 53s", uploadSettings: "Science & Technology, language en, audio en-US, upload" },
    ]);
    expect(instructions.otherPeoplesRecentVideos[0].uploadSettings).toBe(
      "Entertainment, language en-US, audio en, live stream"
    );
    expect(body.state.video).toMatchObject({ title: "New video", length: "1m 5s", description: "(no description)", publishedAt: "2026-10-10" });
  });

  it("trims long descriptions", () => {
    const body = buildOwnershipRequest(
      { title: "Long", description: "x".repeat(5000), publishedAt: "2026-10-10T00:00:00Z" },
      []
    );
    expect(body.state.video.description.length).toBeLessThan(2600);
  });

  it("describes missing upload settings as unset", () => {
    expect(uploadFingerprint({ title: "Old video" })).toBe(
      "unknown category, language unset, audio unset, upload"
    );
  });
});

describe("applying Jev's verdict", () => {
  it("marks a new video Mike's when Jev is sure, and counts it in the stats", async () => {
    const t = setup();
    const id = await addUndecidedVideo(t);

    const decision = await t.mutation(internal.ownership.applyJevVerdict, { id, probabilityMine: 0.96 });

    expect(decision).toBe("mine");
    expect(await getVideo(t, id)).toMatchObject({ isMikes: "mine", ownershipDecidedBy: "jev", jevProbabilityMine: 0.96 });
    expect(await t.query(api.videos.list)).toHaveLength(1);
    expect((await t.query(api.videos.stats)).videoCount).toBe(1);
  });

  it("hides a new video when Jev is sure it isn't Mike's", async () => {
    const t = setup();
    const id = await addUndecidedVideo(t);

    await t.mutation(internal.ownership.applyJevVerdict, { id, probabilityMine: 0.04 });

    expect(await getVideo(t, id)).toMatchObject({ isMikes: "notMine", ownershipDecidedBy: "jev" });
    expect(await t.query(api.videos.list)).toHaveLength(0);
  });

  it("leaves the video for Mike when Jev isn't sure, but remembers its guess", async () => {
    const t = setup();
    const id = await addUndecidedVideo(t);

    const decision = await t.mutation(internal.ownership.applyJevVerdict, { id, probabilityMine: 0.7 });

    expect(decision).toBe("undecided");
    const video = await getVideo(t, id);
    expect(video).toMatchObject({ isMikes: "undecided", jevProbabilityMine: 0.7 });
    expect(video?.ownershipDecidedBy).toBeUndefined();
  });

  it("never overrides a video Mike has already sorted", async () => {
    const t = setup();
    const id = await addUndecidedVideo(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(id, { isMikes: "notMine", ownershipDecidedBy: "mike" });
    });

    const decision = await t.mutation(internal.ownership.applyJevVerdict, { id, probabilityMine: 0.99 });

    expect(decision).toBeNull();
    expect(await getVideo(t, id)).toMatchObject({ isMikes: "notMine", ownershipDecidedBy: "mike" });
  });
});

describe("Jev's examples", () => {
  it("only uses videos Mike sorted himself, not Jev's own calls", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      const base = { description: "", thumbnailUrl: "", publishedAt: "2026-10-01T00:00:00Z" };
      await ctx.db.insert("videos", { ...base, youtubeId: "a", title: "Sorted by Mike", isMikes: "mine", ownershipDecidedBy: "mike" });
      await ctx.db.insert("videos", { ...base, youtubeId: "b", title: "Sorted before Jev existed", isMikes: "notMine" });
      await ctx.db.insert("videos", { ...base, youtubeId: "c", title: "Sorted by Jev", isMikes: "mine", ownershipDecidedBy: "jev" });
    });

    const examples = await t.query(internal.ownership.recentDecisions, {});

    expect(examples.map((e) => e.title).sort()).toEqual(["Sorted before Jev existed", "Sorted by Mike"]);
  });
});

describe("Mike sorting a video in the admin", () => {
  async function adminToken(t: ReturnType<typeof setup>) {
    const token = "test-token";
    await t.run(async (ctx) => {
      await ctx.db.insert("sessions", { token, email: "mike.cann@gmail.com", expiresAt: Date.now() + 60_000 });
    });
    return token;
  }

  it("keeps the stats in sync both ways", async () => {
    const t = setup();
    const token = await adminToken(t);
    const id = await addUndecidedVideo(t);

    await t.mutation(api.admin.setVideoIsMikes, { token, id, isMikes: "mine" });
    expect((await t.query(api.videos.stats)).videoCount).toBe(1);
    expect(await getVideo(t, id)).toMatchObject({ ownershipDecidedBy: "mike" });

    await t.mutation(api.admin.setVideoIsMikes, { token, id, isMikes: "notMine" });
    expect((await t.query(api.videos.stats)).videoCount).toBe(0);
  });

  it("removes the video's projects when Mike says it isn't his after all", async () => {
    const t = setup();
    const token = await adminToken(t);
    const id = await addUndecidedVideo(t);
    await t.mutation(internal.ownership.applyJevVerdict, { id, probabilityMine: 0.95 });
    await t.run(async (ctx) => {
      await ctx.db.insert("projects", {
        name: "Someone else's project",
        sourceUrl: "https://github.com/someone/project",
        sourceType: "video",
        sourceId: "abc123",
        extractedAt: "2026-10-01T00:00:00Z",
      });
    });

    await t.mutation(api.admin.setVideoIsMikes, { token, id, isMikes: "notMine" });

    expect(await t.query(api.projects.list)).toHaveLength(0);
  });

  it("can unmark a video that is missing from the stats without erroring", async () => {
    const t = setup();
    const token = await adminToken(t);
    const id = await addUndecidedVideo(t);
    // How older "mine" videos look: marked mine without ever being added to the stats.
    await t.run(async (ctx) => {
      await ctx.db.patch(id, { isMikes: "mine" });
    });

    await t.mutation(api.admin.setVideoIsMikes, { token, id, isMikes: "notMine" });

    expect(await getVideo(t, id)).toMatchObject({ isMikes: "notMine" });
  });
});

describe("the moderation email", () => {
  const base = {
    _id: "x" as Id<"videos">,
    title: "A video",
    thumbnailUrl: "",
    youtubeId: "abc",
    publishedAt: "2026-10-01T00:00:00Z",
  };

  it("says what Jev did and how sure it was", () => {
    expect(describeVerdict({ ...base, isMikes: "mine", ownershipDecidedBy: "jev", jevProbabilityMine: 0.96 })).toBe(
      "Jev marked it yours (96% sure)"
    );
    expect(describeVerdict({ ...base, isMikes: "notMine", ownershipDecidedBy: "jev", jevProbabilityMine: 0.03 })).toBe(
      "Jev marked it not yours (97% sure)"
    );
    expect(describeVerdict({ ...base, isMikes: "undecided", jevProbabilityMine: 0.62 })).toBe(
      "Needs you: Jev was only 62% sure it's yours"
    );
    expect(describeVerdict({ ...base, isMikes: "undecided" })).toBe("Needs you: Jev couldn't check it");
  });

  it("only asks Mike to act when something is waiting for him", () => {
    const sorted = { ...base, isMikes: "mine" as const, ownershipDecidedBy: "jev" as const, jevProbabilityMine: 0.95 };
    const waiting = { ...base, isMikes: "undecided" as const };
    expect(moderationSubject([sorted, sorted])).toBe("Jev sorted 2 new videos");
    expect(moderationSubject([sorted, waiting])).toBe("1 new video needs you");
    expect(moderationSubject([waiting, waiting])).toBe("2 new videos need you");
    const sortedByMike = { ...base, isMikes: "notMine" as const, ownershipDecidedBy: "mike" as const };
    expect(moderationSubject([sorted, sortedByMike])).toBe("2 new videos, nothing needs you");
  });
});
