
import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { Link } from "react-router";

import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Clapperboard,
  Disc3,
  ExternalLink,
  LayoutDashboard,
  Mic2,
  Music2,
  RefreshCcw,
  UserRound,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

import "./ArtistStudioPage.css";

// ==========================================
// BACKEND CONFIGURATION
// ==========================================

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

const TOKEN_KEY = "emnet_session_token";

// ==========================================
// TYPES
// ==========================================

type Artist = {
  _id?: string;
  id?: string;
  stageName?: string;
  bio?: string;
  country?: string;
  approvalStatus?: string;
  verified?: boolean;
  profileImage?: string;
};

type Release = {
  _id?: string;
  id?: string;
  title?: string;
  releaseType?: string;
  status?: string;
  createdAt?: string;
};

type Video = {
  _id?: string;
  id?: string;
  title?: string;
  status?: string;
  createdAt?: string;
};

type ApiObject = Record<string, unknown>;

// ==========================================
// HELPERS
// ==========================================

function isObject(
  value: unknown
): value is ApiObject {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function getRecord(
  value: unknown
): ApiObject {
  return isObject(value) ? value : {};
}

function getString(
  value: unknown
): string {
  return typeof value === "string"
    ? value
    : "";
}

function getId(
  value: { _id?: string; id?: string }
): string {
  return value._id || value.id || "";
}

function formatDate(
  value?: string
): string {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function resolveImageUrl(
  value?: string
): string {
  if (!value) return "";

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (value.startsWith("/") &&
      !value.startsWith("//")) {
    return `${API_BASE_URL}${value}`;
  }

  return "";
}

function extractCollection<T>(
  payload: unknown,
  key: string
): T[] {
  const root = getRecord(payload);
  const nested = getRecord(root.data);

  const collection =
    Array.isArray(payload)
      ? payload
      : Array.isArray(root[key])
        ? root[key]
        : Array.isArray(root.data)
          ? root.data
          : Array.isArray(nested[key])
            ? nested[key]
            : null;

  if (!collection) {
    throw new Error(
      `The server returned an unexpected ${key} response.`
    );
  }

  return collection as T[];
}

async function fetchAuthenticated(
  path: string,
  token: string,
  signal: AbortSignal
): Promise<unknown> {
  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal,
    }
  );

  const payload: unknown =
    await response.json().catch(() => null);

  const result = getRecord(payload);

  if (
    !response.ok ||
    result.success === false
  ) {
    throw new Error(
      getString(result.message) ||
      `Request failed (${response.status}).`
    );
  }

  return payload;
}

// ==========================================
// DASHBOARD STATISTIC
// ==========================================

function StudioStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="em-studio-stat">
      <span className="em-studio-stat-icon">
        {icon}
      </span>

      <span className="em-studio-stat-label">
        {label}
      </span>

      <strong>{value}</strong>
    </div>
  );
}

// ==========================================
// ARTIST STUDIO DASHBOARD
// ==========================================

export default function ArtistStudioPage() {
  const { user } = useAuth();

  const [artist, setArtist] =
    useState<Artist | null>(null);

  const [releases, setReleases] =
    useState<Release[]>([]);

  const [videos, setVideos] =
    useState<Video[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [reloadCount, setReloadCount] =
    useState(0);

  // ========================================
  // LOAD ARTIST DATA
  // ========================================

  useEffect(() => {
    const controller =
      new AbortController();

    async function loadDashboard() {
      const token =
        sessionStorage.getItem(
          TOKEN_KEY
        );

      if (!token) {
        setError(
          "Please log in to access Artist Studio."
        );
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const [
          artistPayload,
          releasesPayload,
          videosPayload,
        ] = await Promise.all([
          fetchAuthenticated(
            "/api/artists/me",
            token,
            controller.signal
          ),

          fetchAuthenticated(
            "/api/releases/mine",
            token,
            controller.signal
          ),

          fetchAuthenticated(
            "/api/videos/mine",
            token,
            controller.signal
          ),
        ]);

        const artistData =
          getRecord(artistPayload);

        const artistRecord =
          getRecord(artistData.artist);

        if (
          !getString(artistRecord._id) &&
          !getString(artistRecord.id)
        ) {
          throw new Error(
            "Your artist profile could not be found."
          );
        }

        const myReleases =
          extractCollection<Release>(
            releasesPayload,
            "releases"
          );

        const myVideos =
          extractCollection<Video>(
            videosPayload,
            "videos"
          );

        if (controller.signal.aborted) {
          return;
        }

        setArtist(
          artistRecord as Artist
        );

        setReleases(myReleases);
        setVideos(myVideos);
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load Artist Studio."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => controller.abort();
  }, [reloadCount]);

  // ========================================
  // LOADING STATE
  // ========================================

  if (loading) {
    return (
      <div className="page-content em-studio-page">
        <div className="em-studio-message">
          <Disc3 className="spin" size={35} />
          <h2>Loading Artist Studio</h2>
          <p>
            Preparing your artist dashboard...
          </p>
        </div>
      </div>
    );
  }

  // ========================================
  // ERROR STATE
  // ========================================

  if (error || !artist) {
    return (
      <div className="page-content em-studio-page">
        <div className="em-studio-message">
          <Music2 size={35} />

          <h2>
            Artist Studio is unavailable
          </h2>

          <p role="alert">
            {error ||
              "Unable to find your artist account."}
          </p>

          <button
            type="button"
            onClick={() =>
              setReloadCount(
                (count) => count + 1
              )
            }
          >
            <RefreshCcw size={17} />
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ========================================
  // DASHBOARD METRICS
  // ========================================

  const approvedReleases =
    releases.filter(
      (release) =>
        release.status === "approved"
    ).length;

  const pendingReleases =
    releases.filter(
      (release) =>
        release.status === "pending"
    ).length;

  const approvedVideos =
    videos.filter(
      (video) =>
        video.status === "approved"
    ).length;

  const artistId = getId(artist);

  const artistImage =
    resolveImageUrl(artist.profileImage);

  const latestReleases = [...releases]
    .sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime()
    )
    .slice(0, 5);

  const latestVideos = [...videos]
    .sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime()
    )
    .slice(0, 5);

  // ========================================
  // ARTIST STUDIO UI
  // ========================================

  return (
    <div className="page-content em-studio-page">
      <div className="em-studio-page-title">
        <div>
          <span className="em-studio-kicker">
            <LayoutDashboard size={16} />
            EMNET MUSIC ARTIST STUDIO
          </span>

          <h1>Artist Studio</h1>

          <p>
            Manage your music career
            from one place.
          </p>
        </div>

        <button
          type="button"
          className="em-studio-refresh"
          onClick={() =>
            setReloadCount(
              (count) => count + 1
            )
          }
        >
          <RefreshCcw size={17} />
          Refresh
        </button>
      </div>

      {/* ARTIST HERO */}

      <section className="em-studio-hero">
        <div className="em-studio-avatar">
          {artistImage ? (
            <img
              src={artistImage}
              alt={`${artist.stageName || "Artist"} profile`}
              onError={(event) => {
                event.currentTarget.style.display =
                  "none";
              }}
            />
          ) : (
            <Mic2 size={38} />
          )}
        </div>

        <div className="em-studio-hero-info">
          <span className="em-studio-role">
            <BadgeCheck size={15} />
            ARTIST ACCOUNT
          </span>

          <h2>
            {artist.stageName ||
              user?.fullName ||
              "My Artist Account"}
          </h2>

          {artist.country && (
            <p>
              {artist.country}
            </p>
          )}

          <span className="em-studio-approval">
            Account status:{" "}
            <strong>
              {artist.approvalStatus ||
                "Unknown"}
            </strong>
          </span>
        </div>

        {artistId && (
          <Link
            to={`/artists/${artistId}`}
            className="em-studio-public-link"
          >
            View public profile
            <ExternalLink size={16} />
          </Link>
        )}
      </section>

      {/* INTRODUCTION */}

      <section className="em-studio-intro">
        <h2>
          Welcome to your music career.
        </h2>

        <p>
          This is where your sound grows.
          Manage your releases, monitor your
          content, and share your creativity
          with the world.
        </p>

        {artist.bio && (
          <p className="em-studio-bio">
            {artist.bio}
          </p>
        )}
      </section>

      {/* STATISTICS */}

      <section className="em-studio-section">
        <div className="em-studio-section-heading">
          <div>
            <h2>Music overview</h2>

            <p>
              Your current content on Emnet Music.
            </p>
          </div>
        </div>

        <div className="em-studio-stats">
          <StudioStat
            icon={<Disc3 size={22} />}
            label="Total releases"
            value={releases.length}
          />

          <StudioStat
            icon={<BadgeCheck size={22} />}
            label="Approved releases"
            value={approvedReleases}
          />

          <StudioStat
            icon={<CalendarDays size={22} />}
            label="Pending releases"
            value={pendingReleases}
          />

          <StudioStat
            icon={<Clapperboard size={22} />}
            label="Music videos"
            value={videos.length}
          />
        </div>
      </section>

      {/* ARTIST WORKSPACE */}

      <section className="em-studio-section">
        <div className="em-studio-section-heading">
          <div>
            <h2>Your workspace</h2>

            <p>
              Your artist tools and music
              management areas.
            </p>
          </div>
        </div>

        <div className="em-studio-workspace">
          <div className="em-studio-workspace-card">
            <span className="em-studio-workspace-icon">
              <UserRound size={26} />
            </span>

            <h3>Artist Profile</h3>

            <p>
              Your stage name, biography,
              country and artist images.
            </p>

            {artistId && (
              <Link to={`/artists/${artistId}`}>
                View public profile
                <ArrowRight size={16} />
              </Link>
            )}
          </div>

          <div className="em-studio-workspace-card">
            <span className="em-studio-workspace-icon">
              <Disc3 size={26} />
            </span>

            <h3>Music & Releases</h3>

            <p>
              Create singles, EPs and albums,
              add songs and submit music
              for review.
            </p>

            <Link to="/artist/studio/music">
              Manage music & releases
              <ArrowRight size={16} />
            </Link>
          </div>

          <div className="em-studio-workspace-card">
            <span className="em-studio-workspace-icon">
              <Clapperboard size={26} />
            </span>

            <h3>Music Videos</h3>

            <p>
              Upload music videos and track
              their approval status.
            </p>

            <span className="em-studio-workspace-note">
              Management page comes next
            </span>
          </div>

          <div className="em-studio-workspace-card">
            <span className="em-studio-workspace-icon">
              <Music2 size={26} />
            </span>

            <h3>Listening Experience</h3>

            <p>
              You can still enjoy music,
              playlists, videos and the
              features you had as a listener.
            </p>

            <Link to="/">
              Explore music
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* RECENT RELEASES */}

      <section className="em-studio-section">
        <div className="em-studio-section-heading">
          <div>
            <h2>Recent releases</h2>

            <p>
              Your latest singles, EPs
              and albums.
            </p>
          </div>
        </div>

        {latestReleases.length === 0 ? (
          <div className="em-studio-empty">
            <Disc3 size={29} />

            <h3>No releases yet</h3>

            <p>
              Your releases will appear
              here when you create them.
            </p>
          </div>
        ) : (
          <div className="em-studio-content-list">
            {latestReleases.map(
              (release, index) => (
                <div
                  key={getId(release) || index}
                  className="em-studio-content-row"
                >
                  <span className="em-studio-content-icon">
                    <Disc3 size={21} />
                  </span>

                  <div>
                    <strong>
                      {release.title ||
                        "Untitled release"}
                    </strong>

                    <p>
                      {release.releaseType ||
                        "Release"}
                      {" · "}
                      {formatDate(
                        release.createdAt
                      )}
                    </p>
                  </div>

                  <span className="em-studio-content-status">
                    {release.status ||
                      "Unknown"}
                  </span>
                </div>
              )
            )}
          </div>
        )}
      </section>

      {/* RECENT VIDEOS */}

      <section className="em-studio-section">
        <div className="em-studio-section-heading">
          <div>
            <h2>Recent videos</h2>

            <p>
              Your uploaded music videos.
              {approvedVideos > 0 &&
                ` ${approvedVideos} approved.`}
            </p>
          </div>
        </div>

        {latestVideos.length === 0 ? (
          <div className="em-studio-empty">
            <Clapperboard size={29} />

            <h3>No music videos yet</h3>

            <p>
              Your music videos will appear
              here when you create them.
            </p>
          </div>
        ) : (
          <div className="em-studio-content-list">
            {latestVideos.map(
              (video, index) => (
                <div
                  key={getId(video) || index}
                  className="em-studio-content-row"
                >
                  <span className="em-studio-content-icon">
                    <Clapperboard size={21} />
                  </span>

                  <div>
                    <strong>
                      {video.title ||
                        "Untitled video"}
                    </strong>

                    <p>
                      {formatDate(
                        video.createdAt
                      )}
                    </p>
                  </div>

                  <span className="em-studio-content-status">
                    {video.status ||
                      "Unknown"}
                  </span>
                </div>
              )
            )}
          </div>
        )}
      </section>
    </div>
  );
}
