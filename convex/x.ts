"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

interface XTweetResponse {
  data: Array<{
    id: string;
    text: string;
    created_at: string;
    public_metrics?: {
      retweet_count?: number;
      reply_count?: number;
      like_count?: number;
      impression_count?: number;
    };
    attachments?: {
      media_keys?: string[];
    };
  }>;
  includes?: {
    media?: Array<{
      media_key: string;
      url?: string;
      preview_image_url?: string;
    }>;
  };
  meta?: {
    newest_id?: string;
    oldest_id?: string;
    result_count?: number;
    next_token?: string;
  };
}

const X_API_BASE = "https://api.twitter.com/2";

// Refresh tweets from X API
export const refresh = internalAction({
  args: {},
  handler: async (ctx) => {
    const bearerToken = process.env.X_BEARER_TOKEN;
    const userId = process.env.X_USER_ID;

    if (!bearerToken || !userId) {
      console.log("X API credentials not configured. Skipping refresh.");
      return { success: false, error: "Missing configuration" };
    }

    try {
      // Get user's latest tweets. X bills pay-per-use reads per post returned (up to
      // $0.005 each), so only fetch 20: that covers a day's posting with room to spare,
      // and older tweets are already stored. Raise it once by hand to backfill a gap.
      const url = `${X_API_BASE}/users/${userId}/tweets?max_results=20&tweet.fields=created_at,public_metrics,attachments&expansions=attachments.media_keys&media.fields=url,preview_image_url`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`X API error: ${response.status} - ${errorText}`);
        return { success: false, error: `HTTP ${response.status}` };
      }

      const data: XTweetResponse = await response.json();

      if (!data.data || data.data.length === 0) {
        console.log("No tweets found");
        return { success: true, tweetsProcessed: 0 };
      }

      console.log(`Found ${data.data.length} tweets`);

      // Build media map for quick lookup
      const mediaMap = new Map<string, string>();
      if (data.includes?.media) {
        for (const media of data.includes.media) {
          const url = media.url || media.preview_image_url;
          if (url) {
            mediaMap.set(media.media_key, url);
          }
        }
      }

      // Store each tweet
      let processedCount = 0;
      for (const tweet of data.data) {
        // Get media URLs for this tweet
        const mediaUrls: string[] = [];
        if (tweet.attachments?.media_keys) {
          for (const mediaKey of tweet.attachments.media_keys) {
            const url = mediaMap.get(mediaKey);
            if (url) {
              mediaUrls.push(url);
            }
          }
        }

        await ctx.runMutation(internal.tweets.upsert, {
          tweetId: tweet.id,
          text: tweet.text,
          publishedAt: tweet.created_at,
          url: `https://twitter.com/i/web/status/${tweet.id}`,
          mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
          retweetCount: tweet.public_metrics?.retweet_count,
          replyCount: tweet.public_metrics?.reply_count,
          likeCount: tweet.public_metrics?.like_count,
          viewCount: tweet.public_metrics?.impression_count,
        });

        processedCount++;
      }

      console.log(`X refresh complete. Processed ${processedCount} tweets.`);
      return { success: true, tweetsProcessed: processedCount };
    } catch (error) {
      console.error("Error refreshing X tweets:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// Manual refresh, internal so it can't be triggered from the public API.
// Run with `npx convex run x:manualRefresh`; the admin page uses admin.triggerXRefresh.
export const manualRefresh = internalAction({
  args: {},
  handler: async (
    ctx
  ): Promise<{ success: boolean; tweetsProcessed?: number; error?: string }> => {
    return await ctx.runAction(internal.x.refresh, {});
  },
});

// Get X user ID from username. Internal because it spends X API quota.
// Run with `npx convex run x:getUserId`.
export const getUserId = internalAction({
  args: {},
  handler: async (ctx) => {
    const bearerToken = process.env.X_BEARER_TOKEN;
    const username = "mikeysee";

    if (!bearerToken) {
      console.log("X_BEARER_TOKEN not configured");
      return { success: false, error: "Missing X_BEARER_TOKEN" };
    }

    try {
      const url = `${X_API_BASE}/users/by/username/${username}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`X API error: ${response.status} - ${errorText}`);
        return { success: false, error: `HTTP ${response.status}: ${errorText}` };
      }

      const data = await response.json();

      console.log("User data:", JSON.stringify(data, null, 2));

      if (data.data?.id) {
        console.log(`\n✅ Your X_USER_ID is: ${data.data.id}`);
        console.log(`\nAdd this to your Convex environment variables:`);
        console.log(`X_USER_ID=${data.data.id}`);
        return {
          success: true,
          userId: data.data.id,
          username: data.data.username,
          name: data.data.name,
        };
      }

      return { success: false, error: "User ID not found in response" };
    } catch (error) {
      console.error("Error fetching user ID:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
