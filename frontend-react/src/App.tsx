
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  Routes,
  Route,
  Link,
  NavLink,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router";

import {
  ArrowRight,
  Compass,
  Disc3,
  Headphones,
  Heart,
  Home,
  Search,
  Library,
  ListMusic,
  LogIn,
  Menu,
  Mic2,
  Music2,
  Pause,
  Play,
  Radio,
  SkipBack,
  SkipForward,
  UserRound,
  Volume2,
  VolumeX,
  X,
  LayoutDashboard,
} from "lucide-react";

import AuthPage from "./pages/AuthPage";
import { useAuth } from "./context/AuthContext";
import LibraryPage from "./pages/LibraryPage";
import SearchPage from "./pages/SearchPage";
import ArtistProfilePage from "./pages/ArtistProfilePage";
import HomeFeedPage from "./pages/HomeFeedPage";
import VideosPage from "./pages/VideosPage";
import VideoPlayerPage from "./pages/VideoPlayerPage";
import NowPlayingPage from "./pages/NowPlayingPage";
import ListenerProfilePage from "./pages/ListenerProfilePage";
import ArtistStudioPage from "./pages/ArtistStudioPage";
import ArtistMusicUploadPage from "./pages/ArtistMusicUploadPage";
import ArtistVideoUploadPage from "./pages/ArtistVideoUploadPage";
import ArtistApplicationPage from "./pages/ArtistApplicationPage";
import AdminDashboard from "./pages/Admin/AdminDashboard";
import AdminSignupPage from "./pages/AdminSignupPage";
import NotificationBell from "./components/NotificationBell";

import {
  getSongPlaybackUrl,
  getReleaseArtworkUrl,
} from "./services/audioMediaApi";

// ==========================================
// 1. BACKEND CONFIGURATION
// ==========================================

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

// ==========================================
// 2. TYPES AND HELPERS
// ==========================================

type Song = {
  id: string;
  title: string;
  artist: string;
  cover: string;
  audioUrl: string;
  genre: string;
  duration: number;
  releaseId?: string;
};

type RawSong = Record<string, unknown>;

function asObject(value: unknown): RawSong {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as RawSong;
  }

  return {};
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeSong(value: unknown): Song {
  const raw = asObject(value);

  const release = asObject(
    raw.releaseId || raw.release
  );

  const releaseId =
    typeof raw.releaseId === "string"
      ? raw.releaseId
      : typeof raw.release === "string"
        ? raw.release
        : String(
            release._id ||
            release.id ||
            ""
          );

  const artist = asObject(
    raw.artist ||
    raw.artistId ||
    (Array.isArray(raw.primaryArtists)
      ? raw.primaryArtists[0]
      : null)
  );

  const rawDuration = Number(raw.duration);

  return {
    id: String(raw._id || raw.id || ""),

    title:
      textValue(raw.title) ||
      "Untitled song",

    artist:
      textValue(artist.stageName) ||
      textValue(artist.name) ||
      textValue(raw.artistName) ||
      textValue(raw.stageName) ||
      "Unknown artist",

    cover:
      textValue(raw.coverImage) ||
      textValue(raw.coverUrl) ||
      textValue(raw.artworkUrl) ||
      textValue(raw.thumbnail) ||
      textValue(release.coverImage) ||
      textValue(release.coverUrl) ||
      "",

    audioUrl:
      textValue(raw.audioUrl) ||
      textValue(raw.audio) ||
      "",

    genre:
      textValue(raw.genre) ||
      "Music",

    duration:
      Number.isFinite(rawDuration)
        ? rawDuration
        : 0,

    releaseId,
  };
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);

  return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

// ==========================================
// 3. BRAND AND NAVIGATION
// ==========================================

const navigation = [
  {
    label: "Home",
    path: "/",
    icon: Home,
  },
  {
    label: "Explore",
    path: "/explore",
    icon: Compass,
  },
  {
    label: "Videos",
    path: "/videos",
    icon: Radio,
  },
  {
    label: "Library",
    path: "/library",
    icon: Library,
  },
];

function Brand() {
  return (
    <Link
      to="/"
      className="brand"
      aria-label="Emnet Music Home"
    >
      <span className="brand-icon">
  <img
    src="/emnet-header-logo-transparent.png"
    alt=""
    className="brand-logo-image"
  />
</span>

      <span className="brand-name">
        EMNET <strong>MUSIC</strong>

        <small>
          Excitement starts here.
        </small>
      </span>
    </Link>
  );
}

// ==========================================
// 4. SIDEBAR
// ==========================================

function Sidebar({
  close,
}: {
  close: () => void;
}) {
  return (
    <div className="sidebar-inner">
      <Brand />

      <div className="sidebar-body">
        <p className="nav-heading">
          MENU
        </p>

        <nav className="nav-list">
          {navigation.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/"}
                onClick={close}
                className={({ isActive }) =>
                  `nav-item ${
                    isActive ? "active" : ""
                  }`
                }
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <p className="nav-heading library-heading">
          YOUR MUSIC
        </p>

        <nav className="nav-list">
          <NavLink
            to="/library"
            onClick={close}
            className="nav-item"
          >
            <Heart size={19} />
            <span>Liked songs</span>
          </NavLink>

          <NavLink
            to="/library"
            onClick={close}
            className="nav-item"
          >
            <ListMusic size={19} />
            <span>Playlists</span>
          </NavLink>
        </nav>
      </div>

      <div className="sidebar-bottom">
        <div className="sidebar-promo">
          <div className="promo-symbol">
            <Headphones size={23} />
          </div>

          <h3>
            Your music. Your world.
          </h3>

          <p>
            Discover sounds that match
            every moment.
          </p>

          <Link
            to="/explore"
            onClick={close}
          >
            Explore music
            <ArrowRight size={15} />
          </Link>
        </div>

        <p className="sidebar-copy">
          © {new Date().getFullYear()} Emnet Music
        </p>
      </div>
    </div>
  );
}

// ==========================================
// 5. HEADER ICON DESIGN
// ==========================================

const headerCircleStyle: CSSProperties = {
  width: 42,
  height: 42,
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "50%",
  border: "1px solid rgba(75,227,123,0.3)",
  background: "#203226",
  color: "#4be37b",
  overflow: "hidden",
  textDecoration: "none",
  position: "relative",
};

const headerPhotoStyle: CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
  objectFit: "cover",
  borderRadius: "50%",
};

// ==========================================
// 6. LISTENER HEADER PROFILE PICTURE
// ==========================================

function HeaderProfilePhoto({
  image,
  name,
}: {
  image?: string;
  name: string;
}) {
  const [imageFailed, setImageFailed] =
    useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [image]);

  const photoUrl =
    image?.startsWith("/") &&
    !image.startsWith("//")
      ? `${API_BASE_URL}${image}`
      : image || "";

  return (
    <Link
      to="/profile"
      style={headerCircleStyle}
      title="My profile"
      aria-label={`Open ${name}'s profile`}
    >
      {photoUrl && !imageFailed ? (
        <img
          src={photoUrl}
          alt=""
          style={headerPhotoStyle}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <UserRound size={23} />
      )}
    </Link>
  );
}

// ==========================================
// 7. HEADER
// ==========================================

function Header({
  openMenu,
  artistProfileId,
}: {
  openMenu: () => void;
  artistProfileId: string;
}) {
  const location = useLocation();

  const { user } = useAuth();

  const pageNames: Record<string, string> = {
    "/": "Home",
    "/explore": "Explore",
    "/search": "Search",
    "/videos": "Videos",
    "/now-playing": "Now playing",
    "/profile": "My profile",
    "/become-an-artist": "Become an Artist",
    "/artist/apply": "Artist application",
    "/artist/studio": "Artist Studio",
    "/artist/studio/music": "My Music",
    "/artist/studio/videos": "My Videos",
    "/library": "Library",
    "/login": "Login",
    "/register": "Create account",
  };

  const pageName =
  pageNames[location.pathname] ||
  (
    location.pathname.startsWith(
      "/artist/studio/videos/"
    )
      ? "Video Details"

      : location.pathname.startsWith(
          "/artist/studio/music/"
        )
        ? "Release Details"

        : location.pathname.startsWith(
            "/videos/"
          )
          ? "Watch video"

          : "Music"
  );

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="icon-btn mobile-menu-btn"
          onClick={openMenu}
          aria-label="Open navigation"
        >
          <Menu size={23} />
        </button>

        <span className="breadcrumb">
          Discover
          <span>/</span>
          <strong>{pageName}</strong>
        </span>
      </div>

      <div className="topbar-right">
        {/* SEARCH: SIGNED-IN LISTENERS AND ARTISTS */}

        {user &&
          (user.role === "listener" ||
            user.role === "artist") && (
            <Link
              to="/search"
              className="icon-btn header-search-btn"
              aria-label="Search music"
              title="Search music"
            >
              <Search
                size={21}
                strokeWidth={2.2}
              />
              <span>Search</span>
            </Link>
          )}

          {user &&
  (user.role === "listener" ||
    user.role === "artist") && <NotificationBell />}

        {/* LISTENER ICONS */}

        {user?.role === "listener" && (
          <div
            className="em-header-listener-actions"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Link
              to="/become-an-artist"
              style={headerCircleStyle}
              title="Become an Artist"
              aria-label="Become an Artist"
            >
              <Mic2 size={21} />
            </Link>

            <HeaderProfilePhoto
              image={user.profileImage}
              name={user.fullName}
            />
          </div>
        )}


          {/* ARTIST STUDIO HEADER ICON */}

          {user?.role === "artist" && (
            <Link
              to="/artist/studio"
              style={headerCircleStyle}
              title="Open Artist Studio"
              aria-label="Open Artist Studio"
            >
              <LayoutDashboard size={21} />
            </Link>
          )}


        {/* ARTIST AND STAFF HEADER */}

        {/* ARTIST PROFILE ICON */}

{user?.role === "artist" && (
  <Link
    to={
      artistProfileId
        ? `/artists/${artistProfileId}`
        : "/artist/studio"
    }
    className="artist-header-profile-link"
    title="My artist profile"
    aria-label="Open my artist profile"
  >
    <UserRound size={22} />
  </Link>
)}

        {/* GUEST LOGIN */}

        {!user && (
          <Link
            className="login-btn"
            to="/login"
          >
            <LogIn size={17} />
            <span>Log in</span>
          </Link>
        )}
      </div>
    </header>
  );
}

// ==========================================
// 8. BECOME AN ARTIST PAGE
// ==========================================

function BecomeArtistPage() {
  return (
    <div
      className="page-content inner-page"
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        paddingBottom: 90,
      }}
    >
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          padding: "clamp(30px, 6vw, 75px) 24px",
          borderRadius: 24,
          border: "1px solid #2c5738",
          background:
            "radial-gradient(circle at 50% 0%, #275737 0%, #142b1c 44%, #0d1811 100%)",
          textAlign: "center",
          color: "#fff",
        }}
      >
        <div
          style={{
            width: 90,
            height: 90,
            margin: "0 auto 26px",
            borderRadius: "50%",
            background: "#2a5d39",
            display: "grid",
            placeItems: "center",
            color: "#4be37b",
            border: "1px solid #4be37b",
          }}
        >
          <Mic2 size={44} />
        </div>

        <p
          style={{
            color: "#79e99d",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 2,
            marginBottom: 16,
          }}
        >
          EMNET MUSIC FOR ARTISTS
        </p>

        <h1
          style={{
            color: "#ffffff",
            fontSize: "clamp(34px, 6vw, 58px)",
            letterSpacing: "-1.7px",
            lineHeight: 1.15,
            margin: "0 auto 20px",
          }}
        >
          Become an Artist
        </h1>

        <h2
          style={{
            maxWidth: 800,
            margin: "0 auto 22px",
            color: "#8df3a9",
            fontSize: "clamp(22px, 3.5vw, 34px)",
            lineHeight: 1.3,
          }}
        >
          Your music deserves to be heard
          beyond your world.
        </h2>

        <p
          style={{
            maxWidth: 640,
            margin: "0 auto 15px",
            color: "#c2d8c9",
            fontSize: 15,
            lineHeight: 1.9,
          }}
        >
          Every great artist started with a dream
          and a song. Your sound has the power
          to reach new people, inspire hearts,
          and travel farther than you ever imagined.
        </p>

        <p
          style={{
            maxWidth: 640,
            margin: "0 auto 32px",
            color: "#c2d8c9",
            fontSize: 15,
            lineHeight: 1.8,
          }}
        >
          Take the next step. Let the world
          discover your music on Emnet Music.
        </p>

        <Link
          to="/artist/apply"
          className="primary-btn"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: "16px 25px",
            background: "#4be37b",
            color: "#0e2214",
            borderRadius: 12,
            textDecoration: "none",
            fontWeight: 800,
            fontSize: 14,
          }}
        >
          Apply to Become an Artist
          <ArrowRight size={19} />
        </Link>

        <p
          style={{
            marginTop: 20,
            color: "#9dbba5",
            fontSize: 12,
          }}
        >
          Your journey starts here.
        </p>
      </section>

      <div
        style={{
          textAlign: "center",
          marginTop: 34,
          color: "#a9c3b0",
          lineHeight: 1.8,
          fontSize: 14,
        }}
      >
        <p>
          Your creativity matters. Your voice matters.
          And your next opportunity could begin
          with one song.
        </p>
      </div>
    </div>
  );
}

// ==========================================
// 9. COVER ART
// ==========================================

function CoverArt({
  src,
  alt,
  className = "",
  releaseId = "",
}: {
  src: string;
  alt: string;
  className?: string;
  releaseId?: string;
}) {
  const [resolvedSrc, setResolvedSrc] =
    useState(src);

  const [failed, setFailed] =
    useState(false);

  useEffect(() => {
    const controller = new AbortController();

    setResolvedSrc(src);
    setFailed(false);

    if (!releaseId) {
      return () => controller.abort();
    }

    
async function loadArtwork() {
  try {
    const url = await getReleaseArtworkUrl(
      releaseId,
      controller.signal
    );

    if (!controller.signal.aborted) {
      setResolvedSrc(url);
      setFailed(false);
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      console.error(
        "Unable to load release artwork:",
        releaseId,
        error
      );

      setResolvedSrc(src);
      setFailed(false);
    }
  }
}


    void loadArtwork();

    return () => controller.abort();
  }, [src, releaseId]);

  if (!resolvedSrc || failed) {
    return (
      <div
        className={`cover-placeholder ${className}`}
      >
        <Disc3
          size={49}
          strokeWidth={1.15}
        />
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => {
        if (resolvedSrc !== src && src) {
          setResolvedSrc(src);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

// ==========================================
// 10. SONG CARD
// ==========================================

function SongCard({
  song,
  onPlay,
  isCurrent,
  isPlaying,
}: {
  song: Song;
  onPlay: (song: Song) => void;
  isCurrent: boolean;
  isPlaying: boolean;
}) {
  const active = isCurrent && isPlaying;

  return (
    <button
      type="button"
      className={`song-card song-card-clickable ${
        active ? "song-card-playing" : ""
      }`}
      onClick={() => onPlay(song)}
      aria-label={
        active
          ? `Pause ${song.title}`
          : `Play ${song.title}`
      }
    >
      <div className="song-cover-wrap">
        <CoverArt
          src={song.cover}
          alt={`${song.title} cover`}
          className="song-cover"
          releaseId={song.releaseId}
        />
      </div>

      <div className="song-info">
        <h3 title={song.title}>
          {song.title}
        </h3>

        <p title={song.artist}>
          {song.artist}
        </p>
      </div>

      <span className="song-genre">
        {song.genre}
      </span>
    </button>
  );
}

// ==========================================
// 11. EXPLORE PAGE
// ==========================================

function ExplorePage({
  songs,
  loading,
  error,
  onPlay,
  currentSong,
  isPlaying,
}: {
  songs: Song[];
  loading: boolean;
  error: string;
  onPlay: (song: Song) => void;
  currentSong: Song | null;
  isPlaying: boolean;
}) {
  return (
    <div className="page-content inner-page">
      <div className="page-heading">
        <span className="section-label">
          THE SOUND OF DISCOVERY
        </span>

        <h1>
          Explore music
        </h1>

        <p>
          Discover available music
          from Emnet Music.
        </p>
      </div>

      <div className="genre-strip">
        <span className="genre-active">
          All music
        </span>
      </div>

      <div className="section-header">
        <div>
          <h2>Music catalogue</h2>
          <p>
            {songs.length} songs loaded
          </p>
        </div>
      </div>

      {loading ? (
        <div className="message-state">
          <Disc3
            className="spin"
            size={26}
          />
          <p>Loading music...</p>
        </div>
      ) : error ? (
        <div className="message-state">
          <Music2 size={30} />
          <h3>
            Couldn't load the catalogue
          </h3>
          <p>{error}</p>
        </div>
      ) : songs.length > 0 ? (
        <div className="song-grid">
          {songs.map((song) => (
            <SongCard
              key={song.id}
              song={song}
              onPlay={onPlay}
              isCurrent={
                currentSong?.id === song.id
              }
              isPlaying={isPlaying}
            />
          ))}
        </div>
      ) : (
        <div className="message-state">
          <Disc3 size={32} />
          <h3>
            No songs to display yet
          </h3>
          <p>
            Published music will appear here.
          </p>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 12. INFORMATION PAGE
// ==========================================

function InfoPage({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="page-content inner-page">
      <div className="page-heading">
        <span className="section-label">
          EMNET MUSIC
        </span>

        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      <div className="info-panel">
        <div className="info-icon">
          {icon}
        </div>

        <h2>
          We're building this experience
        </h2>

        <p>
          This page is part of the
          new frontend.
        </p>

        <Link
          to="/"
          className="primary-btn"
        >
          Back to Home
          <ArrowRight size={17} />
        </Link>
      </div>
    </div>
  );
}

// ==========================================
// 13. SHARED MUSIC PLAYER
// ==========================================

function MusicPlayer({
  currentSong,
  isPlaying,
  onToggle,
  onNext,
  onPrevious,
  currentTime,
  duration,
  onSeek,
  volume,
  onVolumeChange,
}: {
  currentSong: Song | null;
  isPlaying: boolean;
  onToggle: () => void;
  onNext: () => void;
  onPrevious: () => void;
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  volume: number;
  onVolumeChange: (volume: number) => void;
}) {
  const song = currentSong;

  return (
    <div className="player-bar">
      {/* SONG DETAILS */}

      <Link
        to={song ? "/now-playing" : "/"}
        className="player-track"
        aria-label={
          song
            ? `Open Now Playing for ${song.title}`
            : "Go to Home"
        }
      >
        {song ? (
          <CoverArt
            src={song.cover}
            alt={song.title}
            className="player-art"
            releaseId={song.releaseId}
          />
        ) : (
          <div className="player-art player-empty-art">
            <Music2 size={23} />
          </div>
        )}

        <div className="player-song-info">
          <strong>
            {song?.title || "No song selected"}
          </strong>

          <span>
            {song?.artist || "Start listening"}
          </span>
        </div>
      </Link>

      {/* PLAYBACK CONTROLS */}

      <div className="player-center">
        <div className="player-controls">
          <button
            type="button"
            aria-label="Previous song"
            onClick={onPrevious}
            disabled={!song}
          >
            <SkipBack
              size={19}
              fill="currentColor"
            />
          </button>

          <button
            type="button"
            className="main-play-btn"
            aria-label={
              isPlaying ? "Pause" : "Play"
            }
            onClick={onToggle}
            disabled={!song}
          >
            {isPlaying ? (
              <Pause
                size={19}
                fill="currentColor"
              />
            ) : (
              <Play
                size={19}
                fill="currentColor"
              />
            )}
          </button>

          <button
            type="button"
            aria-label="Next song"
            onClick={onNext}
            disabled={!song}
          >
            <SkipForward
              size={19}
              fill="currentColor"
            />
          </button>
        </div>

        {/* PROGRESS BAR */}

        <div className="player-timeline">
          <span>
            {formatTime(currentTime)}
          </span>

          <input
            type="range"
            min="0"
            max={duration || 1}
            value={Math.min(
              currentTime,
              duration || 1
            )}
            step="1"
            onChange={(event) =>
              onSeek(
                Number(event.target.value)
              )
            }
            disabled={
              !song || duration <= 0
            }
            aria-label="Seek through song"
          />

          <span>
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* VOLUME */}

      <div className="player-right">
        <button
          type="button"
          className="volume-icon"
          onClick={() =>
            onVolumeChange(
              volume === 0 ? 0.8 : 0
            )
          }
          aria-label="Toggle mute"
        >
          {volume === 0 ? (
            <VolumeX size={19} />
          ) : (
            <Volume2 size={19} />
          )}
        </button>

        <input
          className="volume-slider"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(event) =>
            onVolumeChange(
              Number(event.target.value)
            )
          }
          aria-label="Volume"
        />
      </div>
    </div>
  );
}

// ==========================================
// 14. PROTECTED PAGE
// ==========================================

function ProtectedPage({
  children,
}: {
  children: ReactNode;
}) {
  const {
    user,
    loading,
  } = useAuth();

  if (loading) {
    return (
      <div className="message-state">
        Checking your session...
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  if (
    user.role === "admin" ||
    user.role === "superadmin"
  ) {
    return (
      <InfoPage
        icon={<Library size={32} />}
        title="Listener access only"
        description="Admin accounts are for managing Emnet Music, not personal listening."
      />
    );
  }

  return <>{children}</>;
}

// ==========================================
// 15. LISTENER-ONLY PAGE
// ==========================================

function ListenerOnlyPage({
  children,
}: {
  children: ReactNode;
}) {
  const {
    user,
    loading,
  } = useAuth();

  if (loading) {
    return (
      <div className="message-state">
        Checking your session...
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  if (user.role !== "listener") {
    return (
      <InfoPage
        icon={<Mic2 size={32} />}
        title="Listener account required"
        description="This page is available to Emnet Music listeners."
      />
    );
  }

  return <>{children}</>;
}

// ==========================================
// 16. MAIN APPLICATION
// ==========================================



// ==========================================
// ARTIST-ONLY PAGE
// ==========================================

function ArtistOnlyPage({
  children,
}: {
  children: ReactNode;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="message-state">
        Checking your artist account...
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate to="/login" replace />
    );
  }

  if (user.role !== "artist") {
    return (
      <Navigate to="/" replace />
    );
  }

  return <>{children}</>;
}


function ArtistProfileWithLogout({
  onPlay,
  currentSongId,
  isPlaying,
  ownArtistId,
  isArtist,
  onLogout,
}: {
  onPlay: (song: Song) => void;
  currentSongId?: string;
  isPlaying: boolean;
  ownArtistId: string;
  isArtist: boolean;
  onLogout: () => void;
}) {
  const { artistId } = useParams();

  const isOwnProfile =
    isArtist &&
    Boolean(ownArtistId) &&
    artistId === ownArtistId;

  return (
    <>
      <ArtistProfilePage
        onPlay={onPlay}
        currentSongId={currentSongId}
        isPlaying={isPlaying}
      />

      {isOwnProfile && (
        <div className="artist-profile-account-footer">
          <button
            type="button"
            className="artist-profile-logout"
            onClick={onLogout}
          >
            Log out
          </button>
        </div>
      )}
    </>
  );
}


 
function ArtistStudioPublicationNotice() {
  const location = useLocation();
  const navigate = useNavigate();

  // 1. Get the publication notification
  const [publication, setPublication] = useState<
    "music" | "video" | null
  >(() => {
    const state = asObject(location.state);

    if (state.publication === "music") {
      return "music";
    }

    if (state.publication === "video") {
      return "video";
    }

    return null;
  });

  // 2. Automatically remove the message after 30 seconds
  useEffect(() => {
    if (!publication) return;

    const timeoutId = window.setTimeout(() => {
      setPublication(null);
    }, 30000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [publication]);

  // 3. Clear the navigation state to prevent repeat messages
  useEffect(() => {
    if (!publication) return;

    navigate(location.pathname, {
      replace: true,
      state: null,
    });
  }, [publication, location.pathname, navigate]);

  if (!publication) return null;

  const isVideo = publication === "video";

  return (
    <div
      role="status"
      style={{
        margin: "24px 24px 0",
        padding: "20px 24px",
        background: "#163923",
        border: "1px solid #4be37b",
        borderRadius: 14,
        color: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div>
        <strong
          style={{
            display: "block",
            color: "#4be37b",
            fontSize: 17,
            marginBottom: 6,
          }}
        >
          Publication successful!
        </strong>

        <p style={{ margin: 0 }}>
          {isVideo
            ? "Your video is now live on Emnet Music."
            : "Your music is now live on Emnet Music."}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setPublication(null)}
        aria-label="Dismiss notification"
        style={{
          background: "transparent",
          border: "none",
          color: "#ffffff",
          fontSize: 24,
          cursor: "pointer",
        }}
      >
        ×
      </button>
    </div>
  );
}



function MusicApplication() {

 
const { user, logout } = useAuth();

const [artistProfileId, setArtistProfileId] =
  useState("");

useEffect(() => {
  if (user?.role !== "artist") {
    setArtistProfileId("");
    return;
  }

  const controller = new AbortController();

  async function loadArtistProfile() {
    try {
      const token = sessionStorage.getItem(
        "emnet_session_token"
      );

      if (!token) return;

      const response = await fetch(
        `${API_BASE_URL}/api/artists/me`,
        {
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(
          "Unable to retrieve artist profile."
        );
      }

      const payload = asObject(
        await response.json()
      );

      const data = asObject(payload.data);

      const artist = asObject(
        payload.artist || data.artist || payload.data
      );

      const id = String(
        artist._id || artist.id || ""
      );

      if (!controller.signal.aborted) {
        setArtistProfileId(id);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        console.error(
          "Artist profile lookup failed:",
          error
        );
      }
    }
  }

  void loadArtistProfile();

  return () => controller.abort();
}, [user?.id, user?.role]);

  // ========================================
  // APPLICATION STATE
  // ========================================

  const [songs, setSongs] =
    useState<Song[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [
    mobileMenuOpen,
    setMobileMenuOpen,
  ] = useState(false);

  const [
    currentSong,
    setCurrentSong,
  ] = useState<Song | null>(null);

  const [isPlaying, setIsPlaying] =
    useState(false);

  const [currentTime, setCurrentTime] =
    useState(0);

  const [duration, setDuration] =
    useState(0);

  const [volume, setVolume] =
    useState(0.8);

  // Tracks the latest request to play music.
  const playbackRequestRef = useRef(0);

  // Remember the position when a media URL needs refreshing.
const resumePositionRef = useRef<number | null>(null);

  // Stores errors for the Now Playing page.
  const [audioError, setAudioError] =
    useState("");

  // One audio element for the entire app.
  const audioRef =
    useRef<HTMLAudioElement>(null);

  // ========================================
  // LOAD MUSIC CATALOGUE
  // ========================================

  useEffect(() => {
    const controller =
      new AbortController();

    async function loadSongs() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `${API_BASE_URL}/api/songs`,
          {
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(
            `Backend returned HTTP ${response.status}`
          );
        }

        const payload: unknown =
          await response.json();

        const root = asObject(payload);
        const data = asObject(root.data);

        const collection =
          Array.isArray(payload)
            ? payload
            : Array.isArray(root.songs)
              ? root.songs
              : Array.isArray(root.data)
                ? root.data
                : Array.isArray(data.songs)
                  ? data.songs
                  : [];

        const parsed = collection
          .map(normalizeSong)
          .filter((song) => song.id);

        if (!controller.signal.aborted) {
          setSongs(parsed);
        }
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }

        console.error(
          "Music catalogue error:",
          err
        );

        setError(
          "Check that your backend is running " +
          "and GET /api/songs is accessible."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadSongs();

    return () => {
      controller.abort();
    };
  }, []);

  // ========================================
  // UPDATE AUDIO VOLUME
  // ========================================

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // ========================================
  // PLAY SELECTED AUDIO SOURCE
  // ========================================

  useEffect(() => {
    const audio = audioRef.current;

    if (
      !audio ||
      !currentSong?.audioUrl
    ) {
      return;
    }

    const requestId =
      playbackRequestRef.current;

    audio.load();

    audio.play().catch((err) => {
      // Ignore errors from a superseded song.
      if (
        requestId !==
        playbackRequestRef.current
      ) {
        return;
      }

      console.error(
        "Audio playback failed:",
        err
      );

      setIsPlaying(false);

      setAudioError(
        "Playback could not start automatically. " +
        "Press Play to try again."
      );
    });
  }, [currentSong?.audioUrl]);

  // ========================================
  // PLAY SONG
  // ========================================

  async function playSong(song: Song) {
    if (!song.id) return;

    // Clicking the current song toggles playback.
    if (currentSong?.id === song.id) {
      togglePlayback();
      return;
    }

    // Ignore older playback requests.
    const requestId =
      ++playbackRequestRef.current;

    try {
      setAudioError("");

      const playbackUrl =
        await getSongPlaybackUrl(song.id);

      if (
        requestId !==
        playbackRequestRef.current
      ) {
        return;
      }

      // Stop the previous song before switching.
      if (audioRef.current) {
        audioRef.current.pause();
      }

      setCurrentSong({
        ...song,
        audioUrl: playbackUrl,
      });
      resumePositionRef.current = null;

      setCurrentTime(0);
      setDuration(0);

    } catch (err) {
      if (
        requestId !==
        playbackRequestRef.current
      ) {
        return;
      }

      const message =
        err instanceof Error
          ? err.message
          : "Unable to prepare audio playback.";

      setAudioError(message);

      console.error(
        "Audio playback error:",
        err
      );
    }
  }

  // ========================================
  // PLAY / PAUSE
  // ========================================

  
async function togglePlayback() {
  const audio = audioRef.current;

  if (!audio || !currentSong) return;

  // Pause normally. Do not discard the source or position.
  if (!audio.paused) {
    audio.pause();
    setIsPlaying(false);
    return;
  }

  setAudioError("");

  try {
    // First attempt to resume the current audio source.
    await audio.play();
    setIsPlaying(true);
    return;
  } catch (firstError) {
    console.warn(
      "Current audio source could not resume:",
      firstError
    );
  }

  // The existing source failed. Request a fresh URL.
  const requestId = ++playbackRequestRef.current;
  const song = currentSong;

  try {
    const savedPosition = Number.isFinite(audio.currentTime)
      ? audio.currentTime
      : 0;

    const freshUrl = await getSongPlaybackUrl(song.id);

    // Ignore a refresh superseded by a newer song selection.
    if (requestId !== playbackRequestRef.current) {
      return;
    }

    resumePositionRef.current = savedPosition;

    // Updating this URL triggers our existing audio-loading effect.
    setCurrentSong({
      ...song,
      audioUrl: freshUrl,
    });

    // If the URL is unchanged, explicitly reload the source.
    if (freshUrl === song.audioUrl) {
      audio.load();
      audio.play().catch((error) => {
        console.error("Playback retry failed:", error);
        setIsPlaying(false);
        setAudioError("Unable to resume this song.");
      });
    }
  } catch (error) {
    if (requestId !== playbackRequestRef.current) {
      return;
    }

    console.error("Playback URL refresh failed:", error);

    setIsPlaying(false);
    setAudioError(
      error instanceof Error
        ? error.message
        : "Unable to refresh audio playback."
    );
  }
}

  // ========================================
  // NEXT / PREVIOUS SONG
  // ========================================

  function switchSong(direction: number) {
    if (!songs.length) {
      return;
    }

    const index = songs.findIndex(
      (song) =>
        song.id === currentSong?.id
    );

    const nextIndex =
      ((index + direction) %
        songs.length +
        songs.length) %
      songs.length;

    const nextSong = songs[nextIndex];

    if (!nextSong?.id) {
      return;
    }

    void playSong(nextSong);
  }

  // ========================================
  // SEEK AUDIO
  // ========================================

  function seek(seconds: number) {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (
      !Number.isFinite(seconds) ||
      !Number.isFinite(audio.duration)
    ) {
      return;
    }

    const safeTime = Math.max(
      0,
      Math.min(
        seconds,
        audio.duration
      )
    );

    audio.currentTime = safeTime;
    setCurrentTime(safeTime);
  }

  // ========================================
  // CHANGE VOLUME
  // ========================================

  function changeVolume(nextVolume: number) {
    const safeVolume = Math.max(
      0,
      Math.min(1, nextVolume)
    );

    setVolume(safeVolume);
  }

  // ========================================
  // MAIN APPLICATION INTERFACE
  // ========================================

  return (
    <div className="app-shell">
      {/* SIDEBAR */}

      <aside
        className={`sidebar ${
          mobileMenuOpen
            ? "sidebar-open"
            : ""
        }`}
      >
        <button
          type="button"
          className="mobile-close"
          onClick={() =>
            setMobileMenuOpen(false)
          }
          aria-label="Close navigation"
        >
          <X size={22} />
        </button>

        <Sidebar
          close={() =>
            setMobileMenuOpen(false)
          }
        />
      </aside>

      {/* MOBILE MENU BACKDROP */}

      {mobileMenuOpen && (
        <button
          type="button"
          className="menu-backdrop"
          onClick={() =>
            setMobileMenuOpen(false)
          }
          aria-label="Close navigation menu"
        />
      )}

      {/* MAIN CONTENT */}

      <div className="main-area">
        <Header
        openMenu={() =>
      setMobileMenuOpen(true)
      }
     artistProfileId={artistProfileId}
      />

        <main>
          <Routes>
            {/* HOME */}

            <Route
              path="/"
              element={
                <HomeFeedPage
                  onPlay={playSong}
                />
              }
            />

            {/* EXPLORE */}

            <Route
              path="/explore"
              element={
                <ExplorePage
                  songs={songs}
                  loading={loading}
                  error={error}
                  onPlay={playSong}
                  currentSong={currentSong}
                  isPlaying={isPlaying}
                />
              }
            />

            {/* NOW PLAYING */}

            <Route
              path="/now-playing"
              element={
                <NowPlayingPage
                  currentSong={currentSong}
                  isPlaying={isPlaying}
                  currentTime={currentTime}
                  duration={duration}
                  volume={volume}
                  onToggle={togglePlayback}
                  onNext={() =>
                    switchSong(1)
                  }
                  onPrevious={() =>
                    switchSong(-1)
                  }
                  onSeek={seek}
                  onVolumeChange={
                    changeVolume
                  }
                  audioError={audioError}
                />
              }
            />

            {/* VIDEOS */}

            <Route
              path="/videos"
              element={<VideosPage />}
            />

            {/* VIDEO PLAYER */}

            <Route
              path="/videos/:videoId"
              element={<VideoPlayerPage />}
            />



            {/* =====================================
                ARTIST MUSIC MANAGEMENT
            ===================================== */}

            <Route
              path="/artist/studio/music"
              element={
                <ArtistOnlyPage>
                  <ArtistMusicUploadPage />
                </ArtistOnlyPage>
              }
            />

            <Route
              path="/artist/studio/music/:releaseId"
              element={
                <ArtistOnlyPage>
                  <ArtistMusicUploadPage />
                </ArtistOnlyPage>
              }
            />


          {/* =====================================
              ARTIST VIDEO MANAGEMENT
          ===================================== */}

          <Route
            path="/artist/studio/videos"
            element={
              <ArtistOnlyPage>
                <ArtistVideoUploadPage />
              </ArtistOnlyPage>
            }
          />

          <Route
            path="/artist/studio/videos/:videoId"
            element={
              <ArtistOnlyPage>
                <ArtistVideoUploadPage />
              </ArtistOnlyPage>
            }
          />



            {/* ARTIST STUDIO DASHBOARD */}

                <Route
        path="/artist/studio"
        element={
          <ArtistOnlyPage>
            <ArtistStudioPublicationNotice />
            <ArtistStudioPage />
          </ArtistOnlyPage>
        }
      />


            {/* LISTENER PROFILE */}

            <Route
              path="/profile"
              element={
                <ListenerOnlyPage>
                  <ListenerProfilePage />
                </ListenerOnlyPage>
              }
            />

            {/* BECOME AN ARTIST */}

            <Route
              path="/become-an-artist"
              element={
                <ListenerOnlyPage>
                  <BecomeArtistPage />
                </ListenerOnlyPage>
              }
            />

            {/* ARTIST APPLICATION PLACEHOLDER */}

            
          {/* ARTIST APPLICATION */}

          <Route
            path="/artist/apply"
            element={
              <ListenerOnlyPage>
                <ArtistApplicationPage />
              </ListenerOnlyPage>
            }
          />


            {/* LIBRARY */}

            <Route
              path="/library"
              element={
                <ProtectedPage>
                  <LibraryPage
                    onPlay={playSong}
                    currentSongId={
                      currentSong?.id
                    }
                    isPlaying={isPlaying}
                  />
                </ProtectedPage>
              }
            />

            {/* SEARCH */}

            <Route
              path="/search"
              element={
                <ProtectedPage>
                  <SearchPage
                    onPlay={playSong}
                    currentSongId={
                      currentSong?.id
                    }
                    isPlaying={isPlaying}
                  />
                </ProtectedPage>
              }
            />

            {/* ARTIST PROFILE */}

            <Route
  path="/artists/:artistId"
  element={
    <ArtistProfileWithLogout
      onPlay={playSong}
      currentSongId={currentSong?.id}
      isPlaying={isPlaying}
      ownArtistId={artistProfileId}
      isArtist={user?.role === "artist"}
      onLogout={logout}
    />
  }
/>

            {/* LOGIN */}

            <Route
              path="/login"
              element={
                <AuthPage mode="login" />
              }
            />

            {/* REGISTER */}

            <Route
              path="/register"
              element={
                <AuthPage mode="register" />
              }
            />

            {/* NOT FOUND */}

            <Route
              path="*"
              element={
                <InfoPage
                  icon={<Music2 size={32} />}
                  title="Page not found"
                  description="This page doesn't exist."
                />
              }
            />
          </Routes>
        </main>
      </div>

      {/* ====================================
          SHARED AUDIO ELEMENT
      ==================================== */}

      <audio
        ref={audioRef}
        src={
          currentSong?.audioUrl ||
          undefined
        }
        preload="metadata"

        onTimeUpdate={(event) => {
          setCurrentTime(
            event.currentTarget.currentTime
          );
        }}

        onLoadedMetadata={(event) => {
          const metadataDuration =
            event.currentTarget.duration;

          setDuration(
            Number.isFinite(
              metadataDuration
            )
              ? metadataDuration
              : 0
          );

          const resumePosition = resumePositionRef.current;

        if (resumePosition !== null) {
          if (Number.isFinite(metadataDuration)) {
            event.currentTarget.currentTime = Math.min(
              resumePosition,
              Math.max(0, metadataDuration - 0.1)
            );
          }

          resumePositionRef.current = null;
        }
        }}

        onPlay={() => {
          setIsPlaying(true);
          setAudioError("");
        }}

        onPause={() => {
          setIsPlaying(false);
        }}

        onEnded={() => {
          switchSong(1);
        }}

        onError={() => {
          if (!currentSong) return;

          setIsPlaying(false);

          setAudioError(
            "Audio playback failed. " +
            "The media URL may have expired."
          );
        }}
      />

      {/* ====================================
          BOTTOM MUSIC PLAYER
      ==================================== */}

      <MusicPlayer
        currentSong={currentSong}
        isPlaying={isPlaying}
        onToggle={togglePlayback}
        onNext={() =>
          switchSong(1)
        }
        onPrevious={() =>
          switchSong(-1)
        }
        currentTime={currentTime}
        duration={duration}
        onSeek={seek}
        volume={volume}
        onVolumeChange={changeVolume}
      />

      {/* ====================================
          MOBILE BOTTOM NAVIGATION
      ==================================== */}

      <nav className="mobile-bottom-nav">
        <NavLink
          to="/"
          end
        >
          <Home size={20} />
          <span>Home</span>
        </NavLink>

        <NavLink to="/explore">
          <Compass size={20} />
          <span>Explore</span>
        </NavLink>

        <NavLink to="/videos">
          <Radio size={20} />
          <span>Videos</span>
        </NavLink>

        <NavLink to="/library">
          <Library size={20} />
          <span>Library</span>
        </NavLink>
      </nav>
    </div>
  );
}

// ==========================================
// APPLICATION ENTRY POINT
// ==========================================

export default function App() {
  const { user, loading } = useAuth();

  const location = useLocation();

  if (loading) {
    return (
      <div className="em-admin-access-state">
        <div className="em-admin-spinner" />

        <p>Loading Emnet Music...</p>
      </div>
    );
  }

  // ========================================
  // PUBLIC ADMINISTRATOR REGISTRATION
  // ========================================

  if (location.pathname === "/admin-signup") {
    return <AdminSignupPage />;
  }

  // ========================================
  // ADMINISTRATIVE APPLICATION
  // ========================================

  const isAdministrativeAccount =
    user?.role === "admin" ||
    user?.role === "superadmin";

  if (isAdministrativeAccount) {
    return (
      <Routes>
        <Route
          path="/admin/*"
          element={<AdminDashboard />}
        />

        <Route
          path="*"
          element={
            <Navigate to="/admin" replace />
          }
        />
      </Routes>
    );
  }

  // ========================================
  // ORDINARY MUSIC APPLICATION
  // ========================================

  return (
    <Routes>
      <Route
        path="/admin/*"
        element={
          <Navigate
            to={user ? "/" : "/login"}
            replace
          />
        }
      />

      <Route
        path="/*"
        element={<MusicApplication />}
      />
    </Routes>
  );
}