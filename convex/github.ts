"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { cleanCommitTitle } from "./model/codeContributions";

const CONVEX_BACKEND_REPO = "get-convex/convex-backend";
const CONTRIBUTION_AUTHOR = "mikecann";
const MAX_PAGES = 5;

interface GitHubCommitListItem {
  sha: string;
  html_url: string;
  commit: {
    author: {
      name: string;
      date: string;
    } | null;
    message: string;
  };
}

function getNextLink(linkHeader: string | null) {
  if (!linkHeader) return null;

  const nextLink = linkHeader
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.endsWith('rel="next"'));

  const match = nextLink?.match(/<([^>]+)>/);
  return match?.[1] ?? null;
}

async function fetchGitHubCommits() {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "mikes-convex-portfolio",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  let url: string | null =
    `https://api.github.com/repos/${CONVEX_BACKEND_REPO}/commits` +
    `?author=${CONTRIBUTION_AUTHOR}&per_page=100`;
  const commits: GitHubCommitListItem[] = [];
  let pageCount = 0;

  while (url && pageCount < MAX_PAGES) {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub commits request failed: ${response.status} ${body}`);
    }

    const page = (await response.json()) as GitHubCommitListItem[];
    commits.push(...page);

    url = getNextLink(response.headers.get("Link"));
    pageCount++;
  }

  return commits;
}

export const refreshCodeContributions = internalAction({
  args: {},
  handler: async (ctx) => {
    const commits = await fetchGitHubCommits();

    for (const commit of commits) {
      const rawTitle = commit.commit.message.split("\n")[0]?.trim();
      if (!rawTitle) continue;

      await ctx.runMutation(internal.codeContributions.upsert, {
        sha: commit.sha,
        shortSha: commit.sha.slice(0, 7),
        title: cleanCommitTitle(rawTitle),
        rawTitle,
        committedAt: commit.commit.author?.date ?? new Date().toISOString(),
        url: commit.html_url,
        repository: CONVEX_BACKEND_REPO,
        authorName: commit.commit.author?.name ?? "Mike Cann",
      });
    }

    console.log(`GitHub refresh complete. Processed ${commits.length} commits.`);
    return { success: true, commitsProcessed: commits.length };
  },
});

// Manual refresh, internal so it can't be triggered from the public API.
// Run with `npx convex run github:manualRefreshCodeContributions`; the admin page uses admin.triggerGitHubRefresh.
export const manualRefreshCodeContributions = internalAction({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; commitsProcessed: number }> => {
    return await ctx.runAction(internal.github.refreshCodeContributions, {});
  },
});
