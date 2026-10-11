/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as articles from "../articles.js";
import type * as auth from "../auth.js";
import type * as codeContributions from "../codeContributions.js";
import type * as crons from "../crons.js";
import type * as github from "../github.js";
import type * as lib_extractProjects from "../lib/extractProjects.js";
import type * as lib_githubReadme from "../lib/githubReadme.js";
import type * as lib_moderationCopy from "../lib/moderationCopy.js";
import type * as lib_normalization from "../lib/normalization.js";
import type * as lib_ownershipJudge from "../lib/ownershipJudge.js";
import type * as lib_videoUtils from "../lib/videoUtils.js";
import type * as migrations_backfillVideoAggregates from "../migrations/backfillVideoAggregates.js";
import type * as migrations_migrateIsHiddenToIsMikes from "../migrations/migrateIsHiddenToIsMikes.js";
import type * as model_articles from "../model/articles.js";
import type * as model_codeContributions from "../model/codeContributions.js";
import type * as model_projects from "../model/projects.js";
import type * as model_tweets from "../model/tweets.js";
import type * as model_videos from "../model/videos.js";
import type * as notifications from "../notifications.js";
import type * as ownership from "../ownership.js";
import type * as projects from "../projects.js";
import type * as stack from "../stack.js";
import type * as tweets from "../tweets.js";
import type * as videoAggregates from "../videoAggregates.js";
import type * as videos from "../videos.js";
import type * as x from "../x.js";
import type * as youtube from "../youtube.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  articles: typeof articles;
  auth: typeof auth;
  codeContributions: typeof codeContributions;
  crons: typeof crons;
  github: typeof github;
  "lib/extractProjects": typeof lib_extractProjects;
  "lib/githubReadme": typeof lib_githubReadme;
  "lib/moderationCopy": typeof lib_moderationCopy;
  "lib/normalization": typeof lib_normalization;
  "lib/ownershipJudge": typeof lib_ownershipJudge;
  "lib/videoUtils": typeof lib_videoUtils;
  "migrations/backfillVideoAggregates": typeof migrations_backfillVideoAggregates;
  "migrations/migrateIsHiddenToIsMikes": typeof migrations_migrateIsHiddenToIsMikes;
  "model/articles": typeof model_articles;
  "model/codeContributions": typeof model_codeContributions;
  "model/projects": typeof model_projects;
  "model/tweets": typeof model_tweets;
  "model/videos": typeof model_videos;
  notifications: typeof notifications;
  ownership: typeof ownership;
  projects: typeof projects;
  stack: typeof stack;
  tweets: typeof tweets;
  videoAggregates: typeof videoAggregates;
  videos: typeof videos;
  x: typeof x;
  youtube: typeof youtube;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  videoViews: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"videoViews">;
  videoLikes: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"videoLikes">;
  videoComments: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"videoComments">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
};
