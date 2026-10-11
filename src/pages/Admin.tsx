import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Id } from "../../convex/_generated/dataModel";

type TabType = "videos" | "articles" | "projects" | "codeContributions";
type SortOrder = "newest" | "oldest";
type OwnershipFilter = "all" | "undecided" | "mine" | "notMine";
type VisibilityFilter = "all" | "visible" | "hidden";

export function Admin() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("videos");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("visible");

  // Check for auth token on mount
  useEffect(() => {
    const authToken = localStorage.getItem("authToken");
    if (!authToken) {
      navigate("/login");
    } else {
      setToken(authToken);
    }
  }, [navigate]);

  // Verify the token with backend
  const session = useQuery(
    api.auth.verifySession,
    token ? { token } : "skip"
  );

  // Loading state
  if (!token || session === undefined) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  // Session invalid or expired
  if (session === null) {
    localStorage.removeItem("authToken");
    navigate("/login");
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <AdminHeader token={token} />
      <main className="container mx-auto px-4 py-8">
        <RefreshButtons token={token} />
        <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
        <FilterControls
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
          ownershipFilter={ownershipFilter}
          onOwnershipFilterChange={setOwnershipFilter}
          showOwnershipFilter={activeTab === "videos"}
          visibilityFilter={visibilityFilter}
          onVisibilityFilterChange={setVisibilityFilter}
          showVisibilityFilter={activeTab === "projects"}
        />
        <ContentManager
          activeTab={activeTab}
          sortOrder={sortOrder}
          ownershipFilter={ownershipFilter}
          visibilityFilter={visibilityFilter}
          token={token}
        />
      </main>
    </div>
  );
}

function AdminHeader({ token }: { token: string }) {
  const navigate = useNavigate();
  const logout = useMutation(api.auth.logout);

  const handleLogout = async () => {
    try {
      await logout({ token });
    } finally {
      localStorage.removeItem("authToken");
      navigate("/login");
    }
  };

  return (
    <header className="border-b border-gray-800 bg-[#111111]">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-gray-400 hover:text-white transition-colors">
            &larr; Back to Site
          </Link>
          <h1 className="text-xl font-bold text-orange-500">Admin Dashboard</h1>
        </div>
        <button
          onClick={handleLogout}
          className="text-gray-400 hover:text-white transition-colors text-sm"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}

function RefreshButtons({ token }: { token: string }) {
  const triggerYouTubeRefresh = useMutation(api.admin.triggerYouTubeRefresh);
  const triggerStackRefresh = useMutation(api.admin.triggerStackRefresh);
  const triggerXRefresh = useMutation(api.admin.triggerXRefresh);
  const triggerGitHubRefresh = useMutation(api.admin.triggerGitHubRefresh);
  const sendTestEmail = useAction(api.admin.sendTestEmail);
  const askJevAboutUndecided = useMutation(api.admin.askJevAboutUndecided);
  const [youtubeLoading, setYoutubeLoading] = useState(false);
  const [stackLoading, setStackLoading] = useState(false);
  const [xLoading, setXLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailResult, setEmailResult] = useState<string | null>(null);
  const [jevLoading, setJevLoading] = useState(false);

  const handleYouTubeRefresh = async () => {
    setYoutubeLoading(true);
    try {
      await triggerYouTubeRefresh({ token });
    } finally {
      setYoutubeLoading(false);
    }
  };

  const handleStackRefresh = async () => {
    setStackLoading(true);
    try {
      await triggerStackRefresh({ token });
    } finally {
      setStackLoading(false);
    }
  };

  const handleXRefresh = async () => {
    setXLoading(true);
    try {
      await triggerXRefresh({ token });
    } finally {
      setXLoading(false);
    }
  };

  const handleGitHubRefresh = async () => {
    setGithubLoading(true);
    try {
      await triggerGitHubRefresh({ token });
    } finally {
      setGithubLoading(false);
    }
  };

  const handleAskJev = async () => {
    setJevLoading(true);
    setEmailResult(null);
    try {
      const result = await askJevAboutUndecided({ token });
      setEmailResult(result.message);
      setTimeout(() => setEmailResult(null), 5000);
    } catch (error) {
      setEmailResult(error instanceof Error ? error.message : "Failed to ask Jev");
      setTimeout(() => setEmailResult(null), 5000);
    } finally {
      setJevLoading(false);
    }
  };

  const handleTestEmail = async () => {
    setEmailLoading(true);
    setEmailResult(null);
    try {
      const result = await sendTestEmail({ token });
      setEmailResult(result.message);
      setTimeout(() => setEmailResult(null), 5000);
    } catch (error) {
      setEmailResult(error instanceof Error ? error.message : "Failed to send");
      setTimeout(() => setEmailResult(null), 5000);
    } finally {
      setEmailLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 mb-8">
      <div className="flex flex-wrap gap-4">
        <button
          onClick={handleYouTubeRefresh}
          disabled={youtubeLoading}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          {youtubeLoading ? (
            <span className="animate-spin">&#9696;</span>
          ) : (
            <span>&#9654;</span>
          )}
          Refresh YouTube
        </button>
        <button
          onClick={handleStackRefresh}
          disabled={stackLoading}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          {stackLoading ? (
            <span className="animate-spin">&#9696;</span>
          ) : (
            <span>&#128196;</span>
          )}
          Refresh Stack
        </button>
        <button
          onClick={handleXRefresh}
          disabled={xLoading}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          {xLoading ? (
            <span className="animate-spin">&#9696;</span>
          ) : (
            <span>𝕏</span>
          )}
          Refresh X
        </button>
        <button
          onClick={handleGitHubRefresh}
          disabled={githubLoading}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          {githubLoading ? (
            <span className="animate-spin">&#9696;</span>
          ) : (
            <span>&lt;/&gt;</span>
          )}
          Refresh GitHub
        </button>
        <button
          onClick={handleTestEmail}
          disabled={emailLoading}
          className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          {emailLoading ? (
            <span className="animate-spin">&#9696;</span>
          ) : (
            <span>&#9993;</span>
          )}
          Test Email
        </button>
        <button
          onClick={handleAskJev}
          disabled={jevLoading}
          className="flex items-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-800 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg font-medium transition-colors"
        >
          {jevLoading ? (
            <span className="animate-spin">&#9696;</span>
          ) : (
            <span>&#10024;</span>
          )}
          Ask Jev About Undecided
        </button>
      </div>
      {emailResult && (
        <div className="text-sm text-orange-400 bg-orange-900/20 px-4 py-2 rounded-lg">
          {emailResult}
        </div>
      )}
    </div>
  );
}

function TabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}) {
  const tabs: { id: TabType; label: string }[] = [
    { id: "videos", label: "Videos" },
    { id: "articles", label: "Articles" },
    { id: "projects", label: "Projects" },
    { id: "codeContributions", label: "Code Contributions" },
  ];

  return (
    <div className="flex gap-1 mb-6 border-b border-gray-800">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === tab.id
              ? "text-orange-500 border-b-2 border-orange-500"
              : "text-gray-400 hover:text-white"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function FilterControls({
  sortOrder,
  onSortOrderChange,
  ownershipFilter,
  onOwnershipFilterChange,
  showOwnershipFilter,
  visibilityFilter,
  onVisibilityFilterChange,
  showVisibilityFilter,
}: {
  sortOrder: SortOrder;
  onSortOrderChange: (order: SortOrder) => void;
  ownershipFilter: OwnershipFilter;
  onOwnershipFilterChange: (filter: OwnershipFilter) => void;
  showOwnershipFilter: boolean;
  visibilityFilter: VisibilityFilter;
  onVisibilityFilterChange: (filter: VisibilityFilter) => void;
  showVisibilityFilter: boolean;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-400">Sort:</label>
        <select
          value={sortOrder}
          onChange={(e) => onSortOrderChange(e.target.value as SortOrder)}
          className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-white focus:border-orange-500 focus:outline-none"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>
      {showOwnershipFilter && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">Ownership:</label>
          <select
            value={ownershipFilter}
            onChange={(e) => onOwnershipFilterChange(e.target.value as OwnershipFilter)}
            className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-white focus:border-orange-500 focus:outline-none"
          >
            <option value="all">All videos</option>
            <option value="undecided">Undecided</option>
            <option value="mine">Mine</option>
            <option value="notMine">Not Mine</option>
          </select>
        </div>
      )}
      {showVisibilityFilter && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-400">Visibility:</label>
          <select
            value={visibilityFilter}
            onChange={(e) => onVisibilityFilterChange(e.target.value as VisibilityFilter)}
            className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-white focus:border-orange-500 focus:outline-none"
          >
            <option value="visible">Visible only</option>
            <option value="all">All projects</option>
            <option value="hidden">Hidden only</option>
          </select>
        </div>
      )}
    </div>
  );
}

function ContentManager({
  activeTab,
  sortOrder,
  ownershipFilter,
  visibilityFilter,
  token,
}: {
  activeTab: TabType;
  sortOrder: SortOrder;
  ownershipFilter: OwnershipFilter;
  visibilityFilter: VisibilityFilter;
  token: string;
}) {
  const content = useQuery(api.admin.getAllContent, { token });

  // Optimistic update for video ownership
  const setVideoIsMikes = useMutation(
    api.admin.setVideoIsMikes
  ).withOptimisticUpdate((localStore, args) => {
    const currentContent = localStore.getQuery(api.admin.getAllContent, { token });
    if (currentContent) {
      const updatedVideos = currentContent.videos.map((v) =>
        v._id === args.id
          ? { ...v, isMikes: args.isMikes, ownershipDecidedBy: "mike" as const }
          : v
      );
      localStore.setQuery(api.admin.getAllContent, { token }, {
        ...currentContent,
        videos: updatedVideos,
      });
    }
  });

  if (!content) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  const handleSetOwnership = async (
    id: string,
    isMikes: "mine" | "notMine"
  ) => {
    await setVideoIsMikes({ token, id: id as Id<"videos">, isMikes });
  };

  if (activeTab === "videos") {
    // Videos have ownership status
    type VideoItem = {
      _id: string;
      _creationTime: number;
      title?: string;
      isMikes?: "undecided" | "mine" | "notMine";
      ownershipDecidedBy?: "mike" | "jev";
      jevProbabilityMine?: number;
      thumbnailCapProbability?: number;
      thumbnailUrl?: string;
      publishedAt: string;
    };

    // Apply ownership filter
    let items: VideoItem[] = content.videos.filter((item) => {
      if (ownershipFilter === "undecided") return item.isMikes === "undecided" || !item.isMikes;
      if (ownershipFilter === "mine") return item.isMikes === "mine";
      if (ownershipFilter === "notMine") return item.isMikes === "notMine";
      return true;
    });

    // Apply sort order by publishedAt date (data comes pre-sorted from backend, but user can change sort order)
    if (sortOrder === "oldest") {
      items = [...items].reverse();
    }

    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {items.length === 0 ? (
          <p className="col-span-full text-gray-400 text-center py-8">No videos found.</p>
        ) : (
          items.map((item) => (
            <VideoCard
              key={item._id}
              item={item}
              onSetOwnership={handleSetOwnership}
            />
          ))
        )}
      </div>
    );
  }

  if (activeTab === "projects") {
    // Projects have hide/edit capabilities
    type ProjectItem = {
      _id: string;
      _creationTime: number;
      name: string;
      description?: string;
      sourceUrl?: string;
      demoUrl?: string;
      thumbnailUrl?: string;
      isHidden?: boolean;
      sourceType: "video" | "article";
      sourceId: string;
    };

    // Apply visibility filter
    let items: ProjectItem[] = content.projects.filter((item) => {
      if (visibilityFilter === "visible") return !item.isHidden;
      if (visibilityFilter === "hidden") return item.isHidden;
      return true;
    });

    // Apply sort order (create copy to avoid mutating query cache)
    items = [...items].sort((a, b) => {
      return sortOrder === "newest"
        ? b._creationTime - a._creationTime
        : a._creationTime - b._creationTime;
    });

    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.length === 0 ? (
          <p className="col-span-full text-gray-400 text-center py-8">No projects found.</p>
        ) : (
          items.map((item) => (
            <ProjectAdminCard
              key={item._id}
              project={item}
              token={token}
            />
          ))
        )}
      </div>
    );
  }

  if (activeTab === "codeContributions") {
    const items = sortOrder === "oldest"
      ? [...content.codeContributions].reverse()
      : content.codeContributions;

    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.length === 0 ? (
          <p className="col-span-full text-gray-400 text-center py-8">
            No code contributions found.
          </p>
        ) : (
          items.map((item) => (
            <CodeContributionAdminCard
              key={item._id}
              item={item}
            />
          ))
        )}
      </div>
    );
  }

  // Articles (read-only)
  // Data comes pre-sorted from backend (newest first), reverse if user wants oldest first
  const items = sortOrder === "oldest"
    ? [...content.articles].reverse()
    : content.articles;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {items.length === 0 ? (
        <p className="col-span-full text-gray-400 text-center py-8">No articles found.</p>
      ) : (
        items.map((item) => (
          <SimpleContentCard
            key={item._id}
            item={item}
          />
        ))
      )}
    </div>
  );
}

function CodeContributionAdminCard({
  item,
}: {
  item: {
    _id: string;
    title: string;
    shortSha: string;
    url: string;
    repository: string;
    committedAt: string;
  };
}) {
  const formattedDate = new Date(item.committedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-3 rounded-lg border border-gray-700 bg-gray-900 p-4 transition-colors hover:border-emerald-500/70"
    >
      <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
        <span>{formattedDate}</span>
        <span className="font-mono text-gray-400">{item.shortSha}</span>
      </div>
      <h3 className="line-clamp-3 text-sm font-medium text-white">
        {item.title}
      </h3>
      <p className="truncate text-xs text-gray-500">{item.repository}</p>
    </a>
  );
}

function VideoCard({
  item,
  onSetOwnership,
}: {
  item: {
    _id: string;
    title?: string;
    isMikes?: "undecided" | "mine" | "notMine";
    ownershipDecidedBy?: "mike" | "jev";
    jevProbabilityMine?: number;
    thumbnailCapProbability?: number;
    thumbnailUrl?: string;
  };
  onSetOwnership: (id: string, isMikes: "mine" | "notMine") => void;
}) {
  const title = item.title || "Untitled";
  const status = item.isMikes ?? "undecided";
  const jevNote = describeJevNote(
    status,
    item.ownershipDecidedBy,
    item.jevProbabilityMine,
    item.thumbnailCapProbability
  );

  const statusColors = {
    undecided: "bg-yellow-600",
    mine: "bg-green-600",
    notMine: "bg-red-600",
  };

  const statusLabels = {
    undecided: "Undecided",
    mine: "Mine",
    notMine: "Not Mine",
  };

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border transition-all ${
        status === "notMine"
          ? "border-gray-800 bg-gray-900/50 opacity-60"
          : "border-gray-700 bg-gray-900"
      }`}
    >
      {item.thumbnailUrl ? (
        <div className="relative aspect-video overflow-hidden">
          <img
            src={item.thumbnailUrl}
            alt={title}
            className="h-full w-full object-cover"
          />
          <div
            className={`absolute right-2 top-2 rounded px-2 py-1 text-xs font-medium text-white ${statusColors[status]}`}
          >
            {statusLabels[status]}
            {item.ownershipDecidedBy === "jev" && " · Jev"}
          </div>
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center bg-gray-800">
          <span className="text-gray-500">No thumbnail</span>
        </div>
      )}
      <div className="flex flex-col gap-3 p-3">
        <h3
          className={`line-clamp-2 text-sm font-medium ${
            status === "notMine" ? "text-gray-500" : "text-white"
          }`}
        >
          {title}
        </h3>
        {jevNote && <p className="text-xs text-sky-400">{jevNote}</p>}
        <div className="flex gap-2">
          <button
            onClick={() => onSetOwnership(item._id, "mine")}
            disabled={status === "mine"}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              status === "mine"
                ? "bg-green-800 text-green-300 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
          >
            Mine
          </button>
          <button
            onClick={() => onSetOwnership(item._id, "notMine")}
            disabled={status === "notMine"}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              status === "notMine"
                ? "bg-red-800 text-red-300 cursor-not-allowed"
                : "bg-red-600 hover:bg-red-700 text-white"
            }`}
          >
            Not Mine
          </button>
        </div>
      </div>
    </div>
  );
}

function describeJevNote(
  status: "undecided" | "mine" | "notMine",
  decidedBy?: "mike" | "jev",
  pMine?: number,
  pCap?: number
): string | null {
  if (pMine === undefined) return null;
  const percent = (p: number) => `${Math.round(p * 100)}%`;
  if (status === "undecided") return `Jev wasn't sure: ${percent(pMine)} yours`;
  if (decidedBy !== "jev") return null;
  if (status === "notMine") return `Jev is ${percent(1 - pMine)} sure it's not yours`;
  return pMine < 0.9 && pCap !== undefined
    ? `Jev is ${percent(pMine)} sure it's yours, and your cap is on the thumbnail`
    : `Jev is ${percent(pMine)} sure it's yours`;
}

function SimpleContentCard({
  item,
}: {
  item: {
    _id: string;
    title?: string;
    name?: string;
    thumbnailUrl?: string;
  };
}) {
  const title = item.title || item.name || "Untitled";

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-900">
      {item.thumbnailUrl ? (
        <div className="relative aspect-video overflow-hidden">
          <img
            src={item.thumbnailUrl}
            alt={title}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="flex aspect-video items-center justify-center bg-gray-800">
          <span className="text-gray-500">No thumbnail</span>
        </div>
      )}
      <div className="flex flex-col gap-3 p-3">
        <h3 className="line-clamp-2 text-sm font-medium text-white">
          {title}
        </h3>
      </div>
    </div>
  );
}

function ProjectAdminCard({
  project,
  token,
}: {
  project: {
    _id: string;
    name: string;
    description?: string;
    sourceUrl?: string;
    demoUrl?: string;
    thumbnailUrl?: string;
    isHidden?: boolean;
    sourceType: "video" | "article";
    sourceId: string;
  };
  token: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [sourceUrl, setSourceUrl] = useState(project.sourceUrl || "");
  const [demoUrl, setDemoUrl] = useState(project.demoUrl || "");
  const [isSaving, setIsSaving] = useState(false);

  // Generate link to the source video or article
  const sourceContentUrl =
    project.sourceType === "video"
      ? `https://www.youtube.com/watch?v=${project.sourceId}`
      : `https://stack.convex.dev/${project.sourceId}`;

  const setProjectHidden = useMutation(api.admin.setProjectHidden);
  const updateProjectLinks = useMutation(api.admin.updateProjectLinks);
  const deleteProject = useMutation(api.admin.deleteProject);

  const handleToggleHidden = async () => {
    await setProjectHidden({
      token,
      id: project._id as Id<"projects">,
      isHidden: !project.isHidden,
    });
  };

  const handleSaveLinks = async () => {
    setIsSaving(true);
    try {
      await updateProjectLinks({
        token,
        id: project._id as Id<"projects">,
        sourceUrl: sourceUrl || undefined,
        demoUrl: demoUrl || undefined,
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm(`Are you sure you want to delete "${project.name}"?`)) {
      await deleteProject({ token, id: project._id as Id<"projects"> });
    }
  };

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border transition-all ${
        project.isHidden
          ? "border-gray-800 bg-gray-900/50 opacity-60"
          : "border-gray-700 bg-gray-900"
      }`}
    >
      {project.thumbnailUrl ? (
        <div className="relative aspect-video overflow-hidden">
          <img
            src={project.thumbnailUrl}
            alt={project.name}
            className="h-full w-full object-cover"
          />
          {project.isHidden && (
            <div className="absolute right-2 top-2 rounded bg-red-600 px-2 py-1 text-xs font-medium text-white">
              Hidden
            </div>
          )}
        </div>
      ) : (
        <div className="relative flex aspect-video items-center justify-center bg-gray-800">
          <span className="text-gray-500">No thumbnail</span>
          {project.isHidden && (
            <div className="absolute right-2 top-2 rounded bg-red-600 px-2 py-1 text-xs font-medium text-white">
              Hidden
            </div>
          )}
        </div>
      )}
      <div className="flex flex-col gap-3 p-3">
        <h3
          className={`line-clamp-2 text-sm font-medium ${
            project.isHidden ? "text-gray-500" : "text-white"
          }`}
        >
          {project.name}
        </h3>
        {project.description && (
          <p className="line-clamp-2 text-xs text-gray-400">
            {project.description}
          </p>
        )}

        {isEditing ? (
          <div className="flex flex-col gap-2">
            <div>
              <label className="text-xs text-gray-400">Source URL</label>
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://github.com/..."
                className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400">Demo URL</label>
              <input
                type="url"
                value={demoUrl}
                onChange={(e) => setDemoUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveLinks}
                disabled={isSaving}
                className="flex-1 rounded bg-orange-500 px-2 py-1 text-xs font-medium text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-orange-800"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  setSourceUrl(project.sourceUrl || "");
                  setDemoUrl(project.demoUrl || "");
                }}
                className="flex-1 rounded bg-gray-700 px-2 py-1 text-xs font-medium text-white hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 text-xs">
            <a
              href={sourceContentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-orange-400 hover:text-orange-300"
            >
              <span>{project.sourceType === "video" ? "▶" : "📄"}</span>
              <span className="truncate">
                {project.sourceType === "video" ? "YouTube Video" : "Stack Article"}
              </span>
            </a>
            {project.sourceUrl && (
              <a
                href={project.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-blue-400 hover:text-blue-300"
              >
                {project.sourceUrl}
              </a>
            )}
            {project.demoUrl && (
              <a
                href={project.demoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-green-400 hover:text-green-300"
              >
                {project.demoUrl}
              </a>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="flex-1 rounded bg-gray-700 px-2 py-1.5 text-xs font-medium text-white hover:bg-gray-600"
          >
            {isEditing ? "Cancel Edit" : "Edit Links"}
          </button>
          <button
            onClick={handleToggleHidden}
            className={`flex-1 rounded px-2 py-1.5 text-xs font-medium text-white transition-colors ${
              project.isHidden
                ? "bg-green-600 hover:bg-green-700"
                : "bg-yellow-600 hover:bg-yellow-700"
            }`}
          >
            {project.isHidden ? "Show" : "Hide"}
          </button>
          <button
            onClick={handleDelete}
            className="rounded bg-red-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
