"use node";

import { action, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { extractProjectLinks } from "./model/projects";
import { extractProjectsWithLLM } from "./lib/extractProjects";
import { getProjectThumbnail, fetchReadmeImage } from "./lib/githubReadme";

interface YouTubeChannelResponse {
  items: Array<{
    contentDetails: {
      relatedPlaylists: {
        uploads: string;
      };
    };
  }>;
}

interface YouTubePlaylistItemsResponse {
  items: Array<{
    snippet: {
      resourceId: {
        videoId: string;
      };
    };
  }>;
  nextPageToken?: string;
}

interface YouTubeVideosResponse {
  items: Array<{
    id: string;
    snippet: {
      title: string;
      description: string;
      publishedAt: string;
      categoryId?: string;
      defaultLanguage?: string;
      defaultAudioLanguage?: string;
      thumbnails: {
        high?: { url: string };
        medium?: { url: string };
        default?: { url: string };
      };
    };
    statistics?: {
      viewCount?: string;
      likeCount?: string;
      commentCount?: string;
    };
    contentDetails?: {
      duration?: string;
    };
    // Only present on videos that were live streams.
    liveStreamingDetails?: object;
  }>;
}

// Upload settings Jev uses to tell who uploaded a video, see lib/ownershipJudge.ts.
function uploadSettings(video: YouTubeVideosResponse["items"][number]) {
  return {
    categoryId: video.snippet.categoryId,
    defaultLanguage: video.snippet.defaultLanguage,
    defaultAudioLanguage: video.snippet.defaultAudioLanguage,
    wasLiveStream: video.liveStreamingDetails !== undefined,
  };
}

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

// Fetch all videos with pagination (for full refresh)
export const refreshAll = internalAction({
  args: {},
  handler: async (ctx) => {
    const apiKey = process.env.YOUTUBE_API_KEY;
    const channelId = "UCoC_9mdiPwIu1sDxDtGQggQ";

    if (!apiKey || !channelId) {
      console.log(
        "YouTube API key or channel ID not configured. Skipping refresh."
      );
      return { success: false, error: "Missing configuration" };
    }

    try {
      // Step 1: Get the uploads playlist ID
      const channelResponse = await fetch(
        `${YOUTUBE_API_BASE}/channels?part=contentDetails&id=${channelId}&key=${apiKey}`
      );
      const channelData: YouTubeChannelResponse = await channelResponse.json();

      if (!channelData.items || channelData.items.length === 0) {
        console.error("Channel not found");
        return { success: false, error: "Channel not found" };
      }

      const uploadsPlaylistId =
        channelData.items[0].contentDetails.relatedPlaylists.uploads;

      // Step 2: Get all video IDs from the uploads playlist (paginated)
      const videoIds: string[] = [];
      let nextPageToken: string | undefined;

      do {
        const pageTokenParam = nextPageToken ? `&pageToken=${nextPageToken}` : "";
        const playlistResponse = await fetch(
          `${YOUTUBE_API_BASE}/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50${pageTokenParam}&key=${apiKey}`
        );
        const playlistData: YouTubePlaylistItemsResponse =
          await playlistResponse.json();

        if (playlistData.items && playlistData.items.length > 0) {
          for (const item of playlistData.items) {
            videoIds.push(item.snippet.resourceId.videoId);
          }
        }

        nextPageToken = playlistData.nextPageToken;
      } while (nextPageToken);

      if (videoIds.length === 0) {
        console.log("No videos found in playlist");
        return { success: true, videosProcessed: 0 };
      }

      console.log(`Found ${videoIds.length} videos in playlist`);

      // Step 3: Get full video details (in batches of 50)
      const allVideos: YouTubeVideosResponse["items"] = [];

      for (let i = 0; i < videoIds.length; i += 50) {
        const batch = videoIds.slice(i, i + 50);
        const videosResponse = await fetch(
          `${YOUTUBE_API_BASE}/videos?part=snippet,statistics,contentDetails,liveStreamingDetails&id=${batch.join(",")}&key=${apiKey}`
        );
        const videosData: YouTubeVideosResponse = await videosResponse.json();

        if (videosData.items) {
          allVideos.push(...videosData.items);
        }
      }

      // Step 4: Store each video and conditionally extract projects
      let processedCount = 0;
      let projectsExtracted = 0;
      const newVideoIds: Id<"videos">[] = [];

      for (const video of allVideos) {
        const thumbnail =
          video.snippet.thumbnails.high?.url ||
          video.snippet.thumbnails.medium?.url ||
          video.snippet.thumbnails.default?.url ||
          "";

        // Check if video already exists and get its isMikes status
        const existingVideo = await ctx.runQuery(internal.videos.getByYoutubeId, {
          youtubeId: video.id,
        });

        // Upsert the video (preserves isMikes status if existing)
        const upsertResult = await ctx.runMutation(internal.videos.upsert, {
          youtubeId: video.id,
          title: video.snippet.title,
          description: video.snippet.description,
          thumbnailUrl: thumbnail,
          publishedAt: video.snippet.publishedAt,
          viewCount: video.statistics?.viewCount
            ? parseInt(video.statistics.viewCount, 10)
            : undefined,
          likeCount: video.statistics?.likeCount
            ? parseInt(video.statistics.likeCount, 10)
            : undefined,
          commentCount: video.statistics?.commentCount
            ? parseInt(video.statistics.commentCount, 10)
            : undefined,
          duration: video.contentDetails?.duration,
          ...uploadSettings(video),
        });

        // Track new videos for notification
        if (upsertResult.isNew) {
          newVideoIds.push(upsertResult.id);
        }

        // Only extract projects if video is marked as "mine"
        // New videos start as "undecided" and skip project extraction
        const isMine = existingVideo?.isMikes === "mine";
        if (!isMine) {
          processedCount++;
          continue;
        }

        // Extract and store projects from video description using LLM
        const llmProjects = await extractProjectsWithLLM(
          video.snippet.description,
          video.snippet.title
        );

        if (llmProjects.length > 0) {
          // Use LLM-extracted projects
          for (const project of llmProjects) {
            // Skip projects without source or demo URL
            if (!project.sourceUrl && !project.demoUrl) {
              console.log(`Skipping project "${project.name}" - no source or demo URL`);
              continue;
            }
            // Try to get thumbnail from GitHub README, fall back to video thumbnail
            const projectThumbnail = await getProjectThumbnail(
              project.sourceUrl,
              thumbnail
            );
            await ctx.runMutation(internal.projects.upsert, {
              name: project.name,
              description: project.description.slice(0, 200),
              sourceUrl: project.sourceUrl,
              demoUrl: project.demoUrl,
              thumbnailUrl: projectThumbnail,
              sourceType: "video",
              sourceId: video.id,
              extractedAt: new Date().toISOString(),
              publishedAt: video.snippet.publishedAt,
            });
            projectsExtracted++;
          }
        } else {
          // Fallback to regex extraction if LLM returns nothing
          const projectLinks = extractProjectLinks(video.snippet.description);
          if (projectLinks.sourceUrl || projectLinks.demoUrl) {
            // Try to get thumbnail from GitHub README, fall back to video thumbnail
            const projectThumbnail = await getProjectThumbnail(
              projectLinks.sourceUrl,
              thumbnail
            );
            await ctx.runMutation(internal.projects.upsert, {
              name: projectLinks.projectName || video.snippet.title,
              description: video.snippet.description.slice(0, 200),
              sourceUrl: projectLinks.sourceUrl,
              demoUrl: projectLinks.demoUrl,
              thumbnailUrl: projectThumbnail,
              sourceType: "video",
              sourceId: video.id,
              extractedAt: new Date().toISOString(),
              publishedAt: video.snippet.publishedAt,
            });
            projectsExtracted++;
          }
        }

        processedCount++;
      }

      // Jev sorts new videos it is sure about, then emails Mike what it did
      if (newVideoIds.length > 0) {
        await ctx.scheduler.runAfter(0, internal.ownership.judgeVideos, {
          videoIds: newVideoIds,
          notify: true,
        });
      }

      console.log(`YouTube full refresh complete. Processed ${processedCount} videos, ${newVideoIds.length} new.`);
      return { success: true, videosProcessed: processedCount, newVideos: newVideoIds.length };
    } catch (error) {
      console.error("Error refreshing YouTube videos:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// Fetch only the latest 20 videos (for frequent refresh)
export const refreshLatest = internalAction({
  args: {},
  handler: async (ctx) => {
    const apiKey = process.env.YOUTUBE_API_KEY;
    const channelId = "UCoC_9mdiPwIu1sDxDtGQggQ";

    if (!apiKey || !channelId) {
      console.log(
        "YouTube API key or channel ID not configured. Skipping refresh."
      );
      return { success: false, error: "Missing configuration" };
    }

    try {
      // Step 1: Get the uploads playlist ID
      const channelResponse = await fetch(
        `${YOUTUBE_API_BASE}/channels?part=contentDetails&id=${channelId}&key=${apiKey}`
      );
      const channelData: YouTubeChannelResponse = await channelResponse.json();

      if (!channelData.items || channelData.items.length === 0) {
        console.error("Channel not found");
        return { success: false, error: "Channel not found" };
      }

      const uploadsPlaylistId =
        channelData.items[0].contentDetails.relatedPlaylists.uploads;

      // Step 2: Get video IDs from the uploads playlist (latest 20 only)
      const playlistResponse = await fetch(
        `${YOUTUBE_API_BASE}/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=20&key=${apiKey}`
      );
      const playlistData: YouTubePlaylistItemsResponse =
        await playlistResponse.json();

      if (!playlistData.items || playlistData.items.length === 0) {
        console.log("No videos found in playlist");
        return { success: true, videosProcessed: 0 };
      }

      const videoIds = playlistData.items.map(
        (item) => item.snippet.resourceId.videoId
      );

      // Step 3: Get full video details
      const videosResponse = await fetch(
        `${YOUTUBE_API_BASE}/videos?part=snippet,statistics,contentDetails,liveStreamingDetails&id=${videoIds.join(",")}&key=${apiKey}`
      );
      const videosData: YouTubeVideosResponse = await videosResponse.json();

      // Step 4: Store each video and conditionally extract projects
      let processedCount = 0;
      let projectsExtracted = 0;
      const newVideoIds: Id<"videos">[] = [];

      for (const video of videosData.items) {
        const thumbnail =
          video.snippet.thumbnails.high?.url ||
          video.snippet.thumbnails.medium?.url ||
          video.snippet.thumbnails.default?.url ||
          "";

        // Check if video already exists and get its isMikes status
        const existingVideo = await ctx.runQuery(internal.videos.getByYoutubeId, {
          youtubeId: video.id,
        });

        // Upsert the video (preserves isMikes status if existing)
        const upsertResult = await ctx.runMutation(internal.videos.upsert, {
          youtubeId: video.id,
          title: video.snippet.title,
          description: video.snippet.description,
          thumbnailUrl: thumbnail,
          publishedAt: video.snippet.publishedAt,
          viewCount: video.statistics?.viewCount
            ? parseInt(video.statistics.viewCount, 10)
            : undefined,
          likeCount: video.statistics?.likeCount
            ? parseInt(video.statistics.likeCount, 10)
            : undefined,
          commentCount: video.statistics?.commentCount
            ? parseInt(video.statistics.commentCount, 10)
            : undefined,
          duration: video.contentDetails?.duration,
          ...uploadSettings(video),
        });

        // Track new videos for notification
        if (upsertResult.isNew) {
          newVideoIds.push(upsertResult.id);
        }

        // Only extract projects if video is marked as "mine"
        // New videos start as "undecided" and skip project extraction
        const isMine = existingVideo?.isMikes === "mine";
        if (!isMine) {
          processedCount++;
          continue;
        }

        // Extract and store projects from video description using LLM
        const llmProjects = await extractProjectsWithLLM(
          video.snippet.description,
          video.snippet.title
        );

        if (llmProjects.length > 0) {
          // Use LLM-extracted projects
          for (const project of llmProjects) {
            // Skip projects without source or demo URL
            if (!project.sourceUrl && !project.demoUrl) {
              console.log(`Skipping project "${project.name}" - no source or demo URL`);
              continue;
            }
            // Try to get thumbnail from GitHub README, fall back to video thumbnail
            const projectThumbnail = await getProjectThumbnail(
              project.sourceUrl,
              thumbnail
            );
            await ctx.runMutation(internal.projects.upsert, {
              name: project.name,
              description: project.description.slice(0, 200),
              sourceUrl: project.sourceUrl,
              demoUrl: project.demoUrl,
              thumbnailUrl: projectThumbnail,
              sourceType: "video",
              sourceId: video.id,
              extractedAt: new Date().toISOString(),
              publishedAt: video.snippet.publishedAt,
            });
            projectsExtracted++;
          }
        } else {
          // Fallback to regex extraction if LLM returns nothing
          const projectLinks = extractProjectLinks(video.snippet.description);
          if (projectLinks.sourceUrl || projectLinks.demoUrl) {
            // Try to get thumbnail from GitHub README, fall back to video thumbnail
            const projectThumbnail = await getProjectThumbnail(
              projectLinks.sourceUrl,
              thumbnail
            );
            await ctx.runMutation(internal.projects.upsert, {
              name: projectLinks.projectName || video.snippet.title,
              description: video.snippet.description.slice(0, 200),
              sourceUrl: projectLinks.sourceUrl,
              demoUrl: projectLinks.demoUrl,
              thumbnailUrl: projectThumbnail,
              sourceType: "video",
              sourceId: video.id,
              extractedAt: new Date().toISOString(),
              publishedAt: video.snippet.publishedAt,
            });
            projectsExtracted++;
          }
        }

        processedCount++;
      }

      // Jev sorts new videos it is sure about, then emails Mike what it did
      if (newVideoIds.length > 0) {
        await ctx.scheduler.runAfter(0, internal.ownership.judgeVideos, {
          videoIds: newVideoIds,
          notify: true,
        });
      }

      console.log(`YouTube latest refresh complete. Processed ${processedCount} videos, ${newVideoIds.length} new.`);
      return { success: true, videosProcessed: processedCount, newVideos: newVideoIds.length };
    } catch (error) {
      console.error("Error refreshing latest YouTube videos:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// Manual trigger for testing (full refresh)
export const manualRefresh = action({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; videosProcessed?: number; error?: string }> => {
    return await ctx.runAction(internal.youtube.refreshAll, {});
  },
});

// Extract projects for a single video (called when admin marks video as "mine")
export const extractProjectsForVideo = internalAction({
  args: { youtubeId: v.string() },
  handler: async (ctx, { youtubeId }) => {
    // Get the video from the database
    const video = await ctx.runQuery(internal.videos.getByYoutubeId, { youtubeId });
    if (!video) {
      console.error(`Video not found: ${youtubeId}`);
      return { success: false, error: "Video not found" };
    }

    const thumbnail = video.thumbnailUrl || "";

    // Extract and store projects from video description using LLM
    const llmProjects = await extractProjectsWithLLM(video.description, video.title);

    let projectsExtracted = 0;

    if (llmProjects.length > 0) {
      // Use LLM-extracted projects
      for (const project of llmProjects) {
        // Skip projects without source or demo URL
        if (!project.sourceUrl && !project.demoUrl) {
          console.log(`Skipping project "${project.name}" - no source or demo URL`);
          continue;
        }
        // Try to get thumbnail from GitHub README, fall back to video thumbnail
        const projectThumbnail = await getProjectThumbnail(
          project.sourceUrl,
          thumbnail
        );
        await ctx.runMutation(internal.projects.upsert, {
          name: project.name,
          description: project.description.slice(0, 200),
          sourceUrl: project.sourceUrl,
          demoUrl: project.demoUrl,
          thumbnailUrl: projectThumbnail,
          sourceType: "video",
          sourceId: video.youtubeId,
          extractedAt: new Date().toISOString(),
          publishedAt: video.publishedAt,
        });
        projectsExtracted++;
      }
    } else {
      // Fallback to regex extraction if LLM returns nothing
      const projectLinks = extractProjectLinks(video.description);
      if (projectLinks.sourceUrl || projectLinks.demoUrl) {
        // Try to get thumbnail from GitHub README, fall back to video thumbnail
        const projectThumbnail = await getProjectThumbnail(
          projectLinks.sourceUrl,
          thumbnail
        );
        await ctx.runMutation(internal.projects.upsert, {
          name: projectLinks.projectName || video.title,
          description: video.description.slice(0, 200),
          sourceUrl: projectLinks.sourceUrl,
          demoUrl: projectLinks.demoUrl,
          thumbnailUrl: projectThumbnail,
          sourceType: "video",
          sourceId: video.youtubeId,
          extractedAt: new Date().toISOString(),
          publishedAt: video.publishedAt,
        });
        projectsExtracted++;
      }
    }

    console.log(
      `Project extraction complete for video "${video.title}". Extracted ${projectsExtracted} projects.`
    );
    return { success: true, projectsExtracted };
  },
});

// Batch extract projects from all "mine" videos
// Use this to backfill projects after migration or if extraction was missed
export const batchExtractProjects = internalAction({
  args: {},
  handler: async (ctx) => {
    // Get all videos marked as "mine"
    const mineVideos = await ctx.runQuery(internal.videos.listMine);

    console.log(`Found ${mineVideos.length} videos marked as "mine"`);

    let totalProjects = 0;
    let videosProcessed = 0;
    let videosWithProjects = 0;

    for (const video of mineVideos) {
      const result = await ctx.runAction(internal.youtube.extractProjectsForVideo, {
        youtubeId: video.youtubeId,
      });

      if (result.success && result.projectsExtracted && result.projectsExtracted > 0) {
        totalProjects += result.projectsExtracted;
        videosWithProjects++;
      }
      videosProcessed++;

      // Log progress every 10 videos
      if (videosProcessed % 10 === 0) {
        console.log(`Processed ${videosProcessed}/${mineVideos.length} videos...`);
      }
    }

    console.log(
      `Batch extraction complete: ${videosProcessed} videos processed, ${videosWithProjects} had projects, ${totalProjects} total projects extracted`
    );
    return { videosProcessed, videosWithProjects, totalProjects };
  },
});

// Manual trigger for batch extraction (admin use)
export const manualBatchExtract = action({
  args: {},
  handler: async (ctx): Promise<{ videosProcessed: number; videosWithProjects: number; totalProjects: number }> => {
    return await ctx.runAction(internal.youtube.batchExtractProjects, {});
  },
});

// Re-parse thumbnails for all projects from GitHub READMEs
export const reparseThumbnails = internalAction({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.runQuery(internal.projects.listAll);

    console.log(`Found ${projects.length} projects to re-parse thumbnails`);

    let updated = 0;
    let skipped = 0;
    let noImage = 0;

    for (const project of projects) {
      // Only process projects with GitHub source URLs
      if (!project.sourceUrl || !project.sourceUrl.includes("github.com")) {
        skipped++;
        continue;
      }

      try {
        const readmeImage = await fetchReadmeImage(project.sourceUrl);

        if (readmeImage) {
          await ctx.runMutation(internal.projects.updateThumbnail, {
            id: project._id,
            thumbnailUrl: readmeImage,
          });
          console.log(`Updated thumbnail for "${project.name}": ${readmeImage}`);
          updated++;
        } else {
          console.log(`No README image found for "${project.name}"`);
          noImage++;
        }
      } catch (error) {
        console.error(`Error fetching README for "${project.name}":`, error);
        noImage++;
      }
    }

    console.log(
      `Thumbnail re-parse complete: ${updated} updated, ${noImage} no image found, ${skipped} skipped (no GitHub URL)`
    );
    return { updated, noImage, skipped };
  },
});

// Backfill publishedAt for all projects from their source videos/articles
export const backfillProjectDates = internalAction({
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.runQuery(internal.projects.listAll);

    console.log(`Found ${projects.length} projects to backfill dates`);

    let updated = 0;
    let skipped = 0;
    let notFound = 0;

    for (const project of projects) {
      // Skip if already has publishedAt
      if (project.publishedAt) {
        skipped++;
        continue;
      }

      let publishedAt: string | undefined;

      if (project.sourceType === "video") {
        // Look up the video
        const video = await ctx.runQuery(internal.videos.getByYoutubeId, {
          youtubeId: project.sourceId,
        });
        if (video) {
          publishedAt = video.publishedAt;
        }
      } else if (project.sourceType === "article") {
        // Look up the article
        const article = await ctx.runQuery(internal.articles.getBySlug, {
          slug: project.sourceId,
        });
        if (article) {
          publishedAt = article.publishedAt;
        }
      }

      if (publishedAt) {
        await ctx.runMutation(internal.projects.updatePublishedAt, {
          id: project._id,
          publishedAt,
        });
        console.log(`Updated "${project.name}" with publishedAt: ${publishedAt}`);
        updated++;
      } else {
        console.log(`Could not find source for "${project.name}" (${project.sourceType}: ${project.sourceId})`);
        notFound++;
      }
    }

    console.log(
      `Date backfill complete: ${updated} updated, ${skipped} already had date, ${notFound} source not found`
    );
    return { updated, skipped, notFound };
  },
});
