import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

describe("videos", () => {
  it("returns empty array when no videos exist", async () => {
    const t = convexTest(schema, modules);
    const videos = await t.query(api.videos.list);
    expect(videos).toEqual([]);
  });

  it("returns videos after adding them", async () => {
    const t = convexTest(schema, modules);

    const result = await t.mutation(internal.videos.add, {
      youtubeId: "abc123",
      title: "Test Video",
      description: "A test video description",
      thumbnailUrl: "https://example.com/thumb.jpg",
      publishedAt: "2024-01-15T10:00:00Z",
      viewCount: 1000,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(result.id, { isMikes: "mine" });
    });

    const videos = await t.query(api.videos.list);
    expect(videos).toHaveLength(1);
    expect(videos[0].title).toBe("Test Video");
    expect(videos[0].youtubeId).toBe("abc123");
    expect(videos[0].viewCount).toBe(1000);
  });

  it("upserts video with same youtubeId", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.videos.add, {
      youtubeId: "abc123",
      title: "Original Title",
      description: "Original description",
      thumbnailUrl: "https://example.com/thumb.jpg",
      publishedAt: "2024-01-15T10:00:00Z",
    });

    const result = await t.mutation(internal.videos.add, {
      youtubeId: "abc123",
      title: "Updated Title",
      description: "Updated description",
      thumbnailUrl: "https://example.com/thumb.jpg",
      publishedAt: "2024-01-15T10:00:00Z",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(result.id, { isMikes: "mine" });
    });

    const videos = await t.query(api.videos.list);
    expect(videos).toHaveLength(1);
    expect(videos[0].title).toBe("Updated Title");
  });
});

describe("articles", () => {
  it("returns empty array when no articles exist", async () => {
    const t = convexTest(schema, modules);
    const articles = await t.query(api.articles.list);
    expect(articles).toEqual([]);
  });

  it("returns articles after adding them", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.articles.add, {
      slug: "test-article",
      title: "Test Article",
      description: "A test article description",
      thumbnailUrl: "https://example.com/article.jpg",
      publishedAt: "2024-01-15T10:00:00Z",
      url: "https://stack.convex.dev/test-article",
    });

    const articles = await t.query(api.articles.list);
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe("Test Article");
    expect(articles[0].slug).toBe("test-article");
  });

  it("upserts article with same slug", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.articles.add, {
      slug: "test-article",
      title: "Original Title",
      description: "Original description",
      publishedAt: "2024-01-15T10:00:00Z",
      url: "https://stack.convex.dev/test-article",
    });

    await t.mutation(internal.articles.add, {
      slug: "test-article",
      title: "Updated Title",
      description: "Updated description",
      publishedAt: "2024-01-15T10:00:00Z",
      url: "https://stack.convex.dev/test-article",
    });

    const articles = await t.query(api.articles.list);
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe("Updated Title");
  });
});

describe("projects", () => {
  it("returns empty array when no projects exist", async () => {
    const t = convexTest(schema, modules);
    const projects = await t.query(api.projects.list);
    expect(projects).toEqual([]);
  });

  it("returns projects after adding them", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.projects.add, {
      name: "My Project",
      description: "A cool project",
      sourceUrl: "https://github.com/user/project",
      demoUrl: "https://project.vercel.app",
      sourceType: "video",
      sourceId: "abc123",
      extractedAt: "2024-01-15T10:00:00Z",
    });

    const projects = await t.query(api.projects.list);
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("My Project");
    expect(projects[0].sourceUrl).toBe("https://github.com/user/project");
    expect(projects[0].demoUrl).toBe("https://project.vercel.app");
  });
});

describe("code contributions", () => {
  it("returns empty array when no code contributions exist", async () => {
    const t = convexTest(schema, modules);
    const codeContributions = await t.query(api.codeContributions.list);
    expect(codeContributions).toEqual([]);
  });

  it("returns code contributions after adding them", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.codeContributions.add, {
      sha: "abcdef1234567890",
      shortSha: "abcdef1",
      title: "Use copy mode for Convex AI skill installs",
      rawTitle: "Use copy mode for Convex AI skill installs (#52356)",
      committedAt: "2026-06-05T00:16:39Z",
      url: "https://github.com/get-convex/convex-backend/commit/abcdef1",
      repository: "get-convex/convex-backend",
      authorName: "Mike Cann",
    });

    const codeContributions = await t.query(api.codeContributions.list);
    expect(codeContributions).toHaveLength(1);
    expect(codeContributions[0].title).toBe(
      "Use copy mode for Convex AI skill installs"
    );
    expect(codeContributions[0].shortSha).toBe("abcdef1");
  });

  it("upserts code contribution with same sha", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.codeContributions.add, {
      sha: "abcdef1234567890",
      shortSha: "abcdef1",
      title: "Original title",
      rawTitle: "Original title (#1)",
      committedAt: "2026-06-05T00:16:39Z",
      url: "https://github.com/get-convex/convex-backend/commit/abcdef1",
      repository: "get-convex/convex-backend",
      authorName: "Mike Cann",
    });

    await t.mutation(internal.codeContributions.add, {
      sha: "abcdef1234567890",
      shortSha: "abcdef1",
      title: "Updated title",
      rawTitle: "Updated title (#2)",
      committedAt: "2026-06-05T00:16:39Z",
      url: "https://github.com/get-convex/convex-backend/commit/abcdef1",
      repository: "get-convex/convex-backend",
      authorName: "Mike Cann",
    });

    const codeContributions = await t.query(api.codeContributions.list);
    expect(codeContributions).toHaveLength(1);
    expect(codeContributions[0].title).toBe("Updated title");
  });
});
