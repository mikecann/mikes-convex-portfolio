import { mutation, query, action, internalQuery, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { setVideoOwnership } from "./model/videos";

const ADMIN_EMAIL = "mike.cann@gmail.com";

// Helper to check if user is authenticated and is admin
async function requireAuth(ctx: QueryCtx | MutationCtx, token: string) {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first();

  if (!session) {
    throw new Error("Unauthorized: Must be logged in");
  }

  // Check if expired (don't try to delete, just throw error)
  if (session.expiresAt < Date.now()) {
    throw new Error("Unauthorized: Session expired");
  }

  if (session.email !== ADMIN_EMAIL) {
    throw new Error("Unauthorized: Admin access required");
  }

  return session;
}

// Internal query to verify a token (for use in actions)
export const verifyToken = internalQuery({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();

    if (!session || session.expiresAt < Date.now() || session.email !== ADMIN_EMAIL) {
      throw new Error("Unauthorized");
    }

    return { valid: true };
  },
});

// Admin query to get ALL content (including hidden)
export const getAllContent = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireAuth(ctx, token);
    return {
      // Sort videos by publishedAt descending (newest first)
      videos: await ctx.db
        .query("videos")
        .withIndex("by_publishedAt")
        .order("desc")
        .collect(),
      // Sort articles by publishedAt descending (newest first)
      articles: await ctx.db
        .query("articles")
        .withIndex("by_publishedAt")
        .order("desc")
        .collect(),
      // Sort tweets by publishedAt descending (newest first)
      tweets: await ctx.db
        .query("tweets")
        .withIndex("by_publishedAt")
        .order("desc")
        .collect(),
      // Sort code contributions by committedAt descending (newest first)
      codeContributions: await ctx.db
        .query("codeContributions")
        .withIndex("by_committedAt")
        .order("desc")
        .collect(),
      // Projects don't have publishedAt, so use default _creationTime
      projects: await ctx.db.query("projects").order("desc").collect(),
    };
  },
});

// Trigger YouTube refresh (admin only)
export const triggerYouTubeRefresh = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireAuth(ctx, token);
    // Schedule the refresh action
    await ctx.scheduler.runAfter(0, internal.youtube.refreshAll, {});
    return { success: true, message: "YouTube refresh triggered" };
  },
});

// Trigger Stack refresh (admin only)
export const triggerStackRefresh = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireAuth(ctx, token);
    // Schedule the refresh action
    await ctx.scheduler.runAfter(0, internal.stack.refresh, {});
    return { success: true, message: "Stack refresh triggered" };
  },
});

// Trigger X refresh (admin only)
export const triggerXRefresh = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireAuth(ctx, token);
    // Schedule the refresh action
    await ctx.scheduler.runAfter(0, internal.x.refresh, {});
    return { success: true, message: "X refresh triggered" };
  },
});

// Trigger GitHub contribution refresh (admin only)
export const triggerGitHubRefresh = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireAuth(ctx, token);
    await ctx.scheduler.runAfter(0, internal.github.refreshCodeContributions, {});
    return { success: true, message: "GitHub contribution refresh triggered" };
  },
});

// Set video ownership status (mine/notMine)
// When marked as "mine", schedules project extraction
export const setVideoIsMikes = mutation({
  args: {
    token: v.string(),
    id: v.id("videos"),
    isMikes: v.union(v.literal("mine"), v.literal("notMine")),
  },
  handler: async (ctx, { token, id, isMikes }) => {
    await requireAuth(ctx, token);
    const video = await ctx.db.get(id);
    if (!video) throw new Error("Video not found");

    const { becameMine } = await setVideoOwnership(ctx, video, isMikes, "mike");
    if (becameMine) {
      return { success: true, message: "Video marked as mine, project extraction scheduled" };
    }

    return { success: true, message: `Video marked as ${isMikes}` };
  },
});

// Ask Jev to sort every video that is still undecided (admin only)
export const askJevAboutUndecided = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireAuth(ctx, token);
    const undecided = await ctx.db
      .query("videos")
      .withIndex("by_isMikes", (q) => q.eq("isMikes", "undecided"))
      .collect();
    if (undecided.length > 0) {
      await ctx.scheduler.runAfter(0, internal.ownership.judgeVideos, {
        videoIds: undecided.map((video) => video._id),
      });
    }
    return { success: true, message: `Asked Jev about ${undecided.length} undecided videos` };
  },
});

// Clear all projects (admin only)
export const clearAllProjects = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireAuth(ctx, token);
    const projects = await ctx.db.query("projects").collect();
    let deleted = 0;
    for (const project of projects) {
      await ctx.db.delete(project._id);
      deleted++;
    }
    return { success: true, deleted };
  },
});

// Toggle project visibility (admin only)
export const setProjectHidden = mutation({
  args: {
    token: v.string(),
    id: v.id("projects"),
    isHidden: v.boolean(),
  },
  handler: async (ctx, { token, id, isHidden }) => {
    await requireAuth(ctx, token);
    const project = await ctx.db.get(id);
    if (!project) throw new Error("Project not found");

    await ctx.db.patch(id, { isHidden });
    return { success: true, message: isHidden ? "Project hidden" : "Project visible" };
  },
});

// Update project links (admin only)
export const updateProjectLinks = mutation({
  args: {
    token: v.string(),
    id: v.id("projects"),
    sourceUrl: v.optional(v.string()),
    demoUrl: v.optional(v.string()),
  },
  handler: async (ctx, { token, id, sourceUrl, demoUrl }) => {
    await requireAuth(ctx, token);
    const project = await ctx.db.get(id);
    if (!project) throw new Error("Project not found");

    // Only update fields that are provided (allow clearing with empty string)
    const updates: { sourceUrl?: string; demoUrl?: string } = {};
    if (sourceUrl !== undefined) {
      updates.sourceUrl = sourceUrl || undefined; // Convert empty string to undefined
    }
    if (demoUrl !== undefined) {
      updates.demoUrl = demoUrl || undefined; // Convert empty string to undefined
    }

    await ctx.db.patch(id, updates);
    return { success: true, message: "Project links updated" };
  },
});

// Delete a single project (admin only)
export const deleteProject = mutation({
  args: { token: v.string(), id: v.id("projects") },
  handler: async (ctx, { token, id }) => {
    await requireAuth(ctx, token);
    const project = await ctx.db.get(id);
    if (!project) throw new Error("Project not found");

    await ctx.db.delete(id);
    return { success: true, message: "Project deleted" };
  },
});

// Send a test moderation email with a random video (admin only)
export const sendTestEmail = action({
  args: { token: v.string() },
  handler: async (
    ctx,
    { token }
  ): Promise<{ success: boolean; message: string }> => {
    // Get all videos to pick a random one
    const allVideos = await ctx.runQuery(internal.videos.listAll, {});

    if (allVideos.length === 0) {
      return { success: false, message: "No videos found to test with" };
    }

    // Verify the token is valid by checking one of the videos
    // This will throw if the session is invalid
    try {
      await ctx.runQuery(internal.admin.verifyToken, { token });
    } catch {
      throw new Error("Unauthorized");
    }

    const randomVideo = allVideos[Math.floor(Math.random() * allVideos.length)];

    // Send the test notification
    const result = await ctx.runAction(
      internal.notifications.sendModerationNotification,
      { newVideoIds: [randomVideo._id] }
    );

    if (result.sent) {
      return {
        success: true,
        message: `Test email sent for video: "${randomVideo.title}"`,
      };
    } else {
      return {
        success: false,
        message: `Failed to send email: ${result.reason}`,
      };
    }
  },
});
