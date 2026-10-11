"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { extractProjectLinks } from "./model/projects";
import { extractProjectsWithLLM } from "./lib/extractProjects";
import { getProjectThumbnail } from "./lib/githubReadme";

interface ParsedArticle {
  slug: string;
  title: string;
  description: string;
  thumbnailUrl?: string;
  publishedAt: string;
  url: string;
}

/**
 * Parse the HTML from the Convex Stack author page to extract article data
 */
function parseArticlesFromHtml(html: string): ParsedArticle[] {
  const articles: ParsedArticle[] = [];

  // Pattern for article cards
  const cardPattern =
    /<article[^>]*>[\s\S]*?<a[^>]*href="(\/[a-z0-9-]+)"[\s\S]*?<h[23][^>]*>([^<]+)<\/h[23]>[\s\S]*?(?:<p[^>]*>([^<]*)<\/p>)?[\s\S]*?<\/article>/gi;

  let match;
  while ((match = cardPattern.exec(html)) !== null) {
    const [, path, title, description] = match;
    if (path && title && !path.startsWith("/author")) {
      const slug = path.replace(/^\//, "");
      articles.push({
        slug,
        title: decodeHtmlEntities(title.trim()),
        description: description ? decodeHtmlEntities(description.trim()) : "",
        url: `https://stack.convex.dev${path}`,
        publishedAt: new Date().toISOString(), // Will be updated if we can extract date
      });
    }
  }

  // If no articles found with card pattern, try simpler extraction
  if (articles.length === 0) {
    // Look for links to articles
    const seenSlugs = new Set<string>();
    const linkMatches = html.matchAll(
      /<a[^>]*href="(\/[a-z][a-z0-9-]*)"[^>]*>[\s\S]*?([^<]+)[\s\S]*?<\/a>/gi
    );

    for (const linkMatch of linkMatches) {
      const path = linkMatch[1];
      // Skip author pages, category pages, etc.
      if (
        path.startsWith("/author") ||
        path.startsWith("/tag") ||
        path === "/" ||
        path.includes("#")
      ) {
        continue;
      }

      const slug = path.replace(/^\//, "");
      if (seenSlugs.has(slug)) continue;
      seenSlugs.add(slug);

      articles.push({
        slug,
        title: slug
          .split("-")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" "),
        description: "",
        url: `https://stack.convex.dev${path}`,
        publishedAt: new Date().toISOString(),
      });
    }
  }

  return articles;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export const refresh = internalAction({
  args: {},
  handler: async (ctx) => {
    const authorSlug = "mike-cann";

    try {
      // Fetch the author page
      const response = await fetch(
        `https://stack.convex.dev/author/${authorSlug}`
      );

      if (!response.ok) {
        console.error(
          `Failed to fetch Stack author page: ${response.status}`
        );
        return { success: false, error: `HTTP ${response.status}` };
      }

      const html = await response.text();
      const articles = parseArticlesFromHtml(html);

      console.log(`Found ${articles.length} articles on Stack`);

      // Store each article
      let processedCount = 0;
      for (const article of articles) {
        // Fetch individual article page to get more details
        try {
          const articleResponse = await fetch(article.url);
          if (articleResponse.ok) {
            const articleHtml = await articleResponse.text();

            // Try to extract thumbnail
            const ogImageMatch = articleHtml.match(
              /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i
            );
            if (ogImageMatch) {
              article.thumbnailUrl = ogImageMatch[1];
            }

            // Try to extract description if missing
            if (!article.description) {
              const ogDescMatch = articleHtml.match(
                /<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i
              );
              if (ogDescMatch) {
                article.description = decodeHtmlEntities(ogDescMatch[1]);
              }
            }

            // Try to extract title if it looks auto-generated
            const ogTitleMatch = articleHtml.match(
              /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i
            );
            if (ogTitleMatch) {
              article.title = decodeHtmlEntities(ogTitleMatch[1]);
            }

            // Try to extract publish date from title attribute (format: "November 12, 2024 at 0:11 AM" or "December 6, 2024 at 18:12 PM")
            const dateMatch = articleHtml.match(
              /title="([A-Z][a-z]+ \d{1,2}, \d{4}(?:\s+at\s+\d{1,2}:\d{2}\s*[AP]M)?)"/i
            );
            if (dateMatch) {
              try {
                // Parse date format like "November 12, 2024" or "November 12, 2024 at 0:11 AM"
                let dateStr = dateMatch[1];
                // Remove " at HH:MM AM/PM" part and just use the date
                dateStr = dateStr.replace(/\s+at\s+\d{1,2}:\d{2}\s*[AP]M/i, "");
                const parsedDate = new Date(dateStr);
                if (!isNaN(parsedDate.getTime())) {
                  article.publishedAt = parsedDate.toISOString();
                }
              } catch {
                // Keep the default if parsing fails
              }
            }

            // Fallback: try time element with datetime
            if (!dateMatch) {
              const timeMatch = articleHtml.match(
                /<time[^>]*datetime="([^"]+)"/i
              );
              if (timeMatch) {
                article.publishedAt = timeMatch[1];
              }
            }

            // Extract text content from HTML for LLM analysis
            const textContent = articleHtml
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim();

            // Extract projects from article content using LLM
            // Stack articles are always "mine" since they come from the mike-cann endpoint
            const llmProjects = await extractProjectsWithLLM(
              textContent,
              article.title
            );

            if (llmProjects.length > 0) {
              // Use LLM-extracted projects
              for (const project of llmProjects) {
                // Skip projects without source or demo URL
                if (!project.sourceUrl && !project.demoUrl) {
                  console.log(`Skipping project "${project.name}" - no source or demo URL`);
                  continue;
                }
                // Try to get thumbnail from GitHub README, fall back to article thumbnail
                const projectThumbnail = await getProjectThumbnail(
                  project.sourceUrl,
                  article.thumbnailUrl
                );
                await ctx.runMutation(internal.projects.upsert, {
                  name: project.name,
                  description: project.description.slice(0, 200),
                  sourceUrl: project.sourceUrl,
                  demoUrl: project.demoUrl,
                  thumbnailUrl: projectThumbnail,
                  sourceType: "article",
                  sourceId: article.slug,
                  extractedAt: new Date().toISOString(),
                  publishedAt: article.publishedAt,
                });
              }
            } else {
              // Fallback to regex extraction if LLM returns nothing
              const projectLinks = extractProjectLinks(articleHtml);
              if (projectLinks.sourceUrl || projectLinks.demoUrl) {
                // Try to get thumbnail from GitHub README, fall back to article thumbnail
                const projectThumbnail = await getProjectThumbnail(
                  projectLinks.sourceUrl,
                  article.thumbnailUrl
                );
                await ctx.runMutation(internal.projects.upsert, {
                  name: projectLinks.projectName || article.title,
                  description: article.description.slice(0, 200),
                  sourceUrl: projectLinks.sourceUrl,
                  demoUrl: projectLinks.demoUrl,
                  thumbnailUrl: projectThumbnail,
                  sourceType: "article",
                  sourceId: article.slug,
                  extractedAt: new Date().toISOString(),
                  publishedAt: article.publishedAt,
                });
              }
            }
          }
        } catch (articleError) {
          console.warn(`Failed to fetch article ${article.slug}:`, articleError);
        }

        // Upsert the article
        await ctx.runMutation(internal.articles.upsert, {
          slug: article.slug,
          title: article.title,
          description: article.description,
          thumbnailUrl: article.thumbnailUrl,
          publishedAt: article.publishedAt,
          url: article.url,
        });

        processedCount++;
      }

      console.log(`Stack refresh complete. Processed ${processedCount} articles.`);
      return { success: true, articlesProcessed: processedCount };
    } catch (error) {
      console.error("Error refreshing Stack articles:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

// Manual refresh, internal so it can't be triggered from the public API.
// Run with `npx convex run stack:manualRefresh`; the admin page uses admin.triggerStackRefresh.
export const manualRefresh = internalAction({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; articlesProcessed?: number; error?: string }> => {
    return await ctx.runAction(internal.stack.refresh, {});
  },
});
