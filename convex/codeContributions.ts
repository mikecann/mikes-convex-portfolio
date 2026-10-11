import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getAllCodeContributions,
  upsertCodeContribution,
} from "./model/codeContributions";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await getAllCodeContributions(ctx);
  },
});

export const upsert = internalMutation({
  args: {
    sha: v.string(),
    shortSha: v.string(),
    title: v.string(),
    rawTitle: v.string(),
    committedAt: v.string(),
    url: v.string(),
    repository: v.string(),
    authorName: v.string(),
  },
  handler: async (ctx, args) => {
    return await upsertCodeContribution(ctx, args);
  },
});

// Internal so only tests, other functions and `npx convex run` can call it
export const add = internalMutation({
  args: {
    sha: v.string(),
    shortSha: v.string(),
    title: v.string(),
    rawTitle: v.string(),
    committedAt: v.string(),
    url: v.string(),
    repository: v.string(),
    authorName: v.string(),
  },
  handler: async (ctx, args) => {
    return await upsertCodeContribution(ctx, args);
  },
});
