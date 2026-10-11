# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
bun run dev          # Start both Vite (frontend) and Convex (backend) dev servers
bun run build        # Type check and build for production
bun run typecheck    # TypeScript type checking only
bun run lint         # Run ESLint
bun test             # Run tests with Vitest (watch mode)
bun test --run       # Run tests once
```

## Running Single Tests

```bash
bun test convex/__tests__/content.test.ts    # Run specific test file
bun test -t "returns videos"                  # Run tests matching pattern
```

## Development Workflow

- **Always typecheck** before committing: `bun run typecheck`
- **Run tests regularly** during development, especially after modifying Convex functions
- **Write tests** for new Convex queries/mutations in `convex/__tests__/`
- This is a **TypeScript-first** codebase - maintain strict typing, avoid `any`

## Project Architecture

This is a content aggregation app built with **React + Vite** (frontend) and **Convex** (backend). It aggregates content from YouTube and Convex Stack articles for a specific creator.

### Data Flow

1. **Content Sources** (`convex/youtube.ts`, `convex/stack.ts`):
   - `youtube.ts` - Node action that fetches videos from YouTube Data API v3
   - `stack.ts` - Node action that scrapes articles from stack.convex.dev/author/{slug}
   - Both extract GitHub/demo links from content to create project entries

2. **Scheduled Refresh** (`convex/crons.ts`):
   - Hourly cron jobs trigger `youtube:refresh` and `stack:refresh`

3. **Data Layer** (`convex/model/`):
   - `projects.ts` - Project CRUD and link extraction logic (`extractProjectLinks`)
   - `videos.ts`, `articles.ts` - Domain-specific model helpers

4. **API Layer** (`convex/videos.ts`, `convex/articles.ts`, `convex/projects.ts`):
   - Public queries: `list` (filters to show only visible items)
   - Internal mutations: `upsert` (used by refresh actions) and `add` (for tests or `npx convex run`)
   - Never export an unauthenticated public `mutation` or `action`: anyone with the deployment URL can call it. Use `internalMutation`/`internalAction`, or take the admin session `token` and call `requireAuth`. `convex/__tests__/publicApi.test.ts` enforces this.

5. **Admin** (`convex/admin.ts`):
   - Protected by email check (`requireAuth` helper)
   - `setVideoIsMikes` - set video ownership status ("mine" or "notMine")
   - `getAllContent` - returns all items for admin review
   - `clearAllProjects` - delete all projects
   - `triggerYouTubeRefresh`, `triggerStackRefresh` - manual refresh

### Frontend Structure

- `src/main.tsx` - Clerk + Convex provider setup
- `src/pages/Home.tsx` - Public content display
- `src/pages/Admin.tsx` - Admin panel (requires Clerk auth)
- `src/components/` - UI components (ContentGrid, ContentCard, FilterBar, etc.)

### Authentication

- **Clerk** for frontend auth
- **Convex auth** configured in `convex/auth.config.ts`
- Admin access restricted to `mike.cann@gmail.com` in `convex/admin.ts`

### Database Schema

Three tables in `convex/schema.ts`:
- `videos` - indexed by `youtubeId`, `publishedAt`, and `isMikes`
  - `isMikes` field: "undecided" (new videos), "mine" (visible), or "notMine" (hidden)
  - Only videos with `isMikes === "mine"` are shown publicly
- `articles` - indexed by `slug` and `publishedAt` (always visible, from mike-cann endpoint)
- `projects` - indexed by `name`, `sourceType`, `sourceId`, `sourceUrl`, and `normalizedName`
  - Projects are only created from "mine" content, so always visible
  - Uses fuzzy name matching via `normalizedName` to prevent duplicates

## Environment Variables

See `.env.local.example` for required variables:
- `VITE_CONVEX_URL` - Convex deployment URL
- `VITE_CLERK_PUBLISHABLE_KEY` - Clerk frontend key
- `YOUTUBE_API_KEY` - YouTube Data API v3 key (set in Convex dashboard)
- `YOUTUBE_CHANNEL_ID` - Target YouTube channel ID
- `STACK_AUTHOR_SLUG` - Author slug for stack.convex.dev
- `CLERK_JWT_ISSUER_DOMAIN` - Clerk JWT issuer (set in Convex dashboard)

## Testing

Tests use `convex-test` with Vitest. Test files are in `convex/__tests__/` and test Convex functions directly without network calls.
