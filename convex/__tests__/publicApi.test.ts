import { describe, expect, it } from "vitest";

// Every public mutation or action can be called by anyone holding the
// deployment URL, which ships in the frontend bundle. Writes and anything that
// spends third-party API quota must be internal, or check the admin session
// token. Adding to this list means confirming the new function is protected.
const ALLOWED_PUBLIC_WRITES = [
  "admin:askJevAboutUndecided",
  "admin:clearAllProjects",
  "admin:deleteProject",
  "admin:sendTestEmail",
  "admin:setProjectHidden",
  "admin:setVideoIsMikes",
  "admin:triggerGitHubRefresh",
  "admin:triggerStackRefresh",
  "admin:triggerXRefresh",
  "admin:triggerYouTubeRefresh",
  "admin:updateProjectLinks",
  "auth:login",
  "auth:logout",
];

type RegisteredFunction = {
  isPublic?: boolean;
  isMutation?: boolean;
  isAction?: boolean;
};

const modules = import.meta.glob<Record<string, unknown>>(
  ["../**/*.ts", "!../_generated/**", "!../__tests__/**", "!../*.config.ts"],
  { eager: true }
);

function publicWrites() {
  const names: string[] = [];
  for (const [path, exports] of Object.entries(modules)) {
    const moduleName = path.replace(/^\.\.\//, "").replace(/\.ts$/, "");
    for (const [exportName, value] of Object.entries(exports)) {
      const fn = value as RegisteredFunction | null;
      if (fn?.isPublic && (fn.isMutation || fn.isAction)) {
        names.push(`${moduleName}:${exportName}`);
      }
    }
  }
  return names.sort();
}

describe("public API surface", () => {
  it("only exposes protected admin and auth functions as public writes", () => {
    expect(publicWrites()).toEqual(ALLOWED_PUBLIC_WRITES);
  });
});
