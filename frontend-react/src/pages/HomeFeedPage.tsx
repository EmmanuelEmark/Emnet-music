
import {
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { Link } from "react-router";

import {
  ArrowRight,
  BadgeCheck,
  Clapperboard,
  Disc3,
  Headphones,
  Music2,
  Radio,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

import {
  fetchHomeFeed,
  type HomeFeed,
  type HomeSong,
  type HomeRelease,
  type HomeArtist,
  type HomeVideo,
} from "../services/homeApi";

import {
  getReleaseArtworkUrl,
} from "../services/audioMediaApi";

import type { LibrarySong } from "../services/libraryApi";

import VideoThumbnail from "../components/VideoThumbnail";

import "./HomeFeedPage.css";

type Props = {
  onPlay: (song: LibrarySong) => void;
};

function Artwork({
  src,
  alt,
  variant = "square",
  releaseId = "",
}: {
  src: string;
  alt: string;
  variant?: "square" | "circle" | "video";
  releaseId?: string;
}) {
  const [resolvedSrc, setResolvedSrc] = useState(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    setResolvedSrc(src);
    setFailed(false);

    // Artist profile pictures and other images
    // continue using their existing URLs.
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
            "Home artwork retrieval failed:",
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

  return (
    <div className={`home-art home-art-${variant}`}>
      {resolvedSrc && !failed ? (
        <img
          src={resolvedSrc}
          alt={alt}
          loading="lazy"
          onError={() => {
            console.error(
              "Home artwork image failed to load:",
              releaseId
            );

            if (resolvedSrc !== src && src) {
              setResolvedSrc(src);
            } else {
              setFailed(true);
            }
          }}
        />
      ) : (
        <Music2 size={34} />
      )}
    </div>
  );
}

function Section({
  title,
  description,
  icon,
  children,
  action,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="home-feed-section">
      <div className="home-feed-section-heading">
        <div>
          <div className="home-feed-title">
            {icon}
            <h2>{title}</h2>
          </div>

          <p>{description}</p>
        </div>

        {action}
      </div>

      {children}
    </section>
  );
}

function EmptySection({
  message,
}: {
  message: string;
}) {
  return (
    <div className="home-feed-empty">
      <Disc3 size={28} />
      <p>{message}</p>
    </div>
  );
}

function SongCard({
  song,
  onPlay,
}: {
  song: HomeSong;
  onPlay: (song: LibrarySong) => void;
}) {
  return (
    <button
  type="button"
  className="home-feed-song-card"
  onClick={() => onPlay(song)}
  disabled={!song.id}
  aria-label={`Play ${song.title} by ${song.artist}`}
>
      <Artwork
  src={song.cover}
  alt={`${song.title} cover`}
  releaseId={song.releaseId}
/>

      <div className="home-feed-song-info">
        <strong title={song.title}>
          {song.title}
        </strong>

        <span title={song.artist}>
          {song.artist}
        </span>
      </div>
    </button>
  );
}

function ReleaseCard({
  release,
}: {
  release: HomeRelease;
}) {
  return (
    <article className="home-feed-release-card">
      <Artwork
  src={release.coverImage}
  alt={`${release.title} artwork`}
  releaseId={release.id}
/>

      <div className="home-feed-release-info">
        <span className="home-feed-type">
          {release.releaseType}
        </span>

        <strong>{release.title}</strong>

        <p>{release.artistNames}</p>
      </div>
    </article>
  );
}

function ArtistCard({
  artist,
}: {
  artist: HomeArtist;
}) {
  return (
    <Link
      to={`/artists/${artist.id}`}
      className="home-feed-artist-card"
    >
      <Artwork
        src={artist.profileImage}
        alt={artist.stageName}
        variant="circle"
      />

      <strong>
        {artist.stageName}

        {artist.verified && (
          <BadgeCheck
            size={16}
            className="home-feed-verified"
          />
        )}
      </strong>

      <span>
        {artist.followersCount.toLocaleString()}
        {" "}followers
      </span>

      <span className="home-feed-view-artist">
        View profile
        <ArrowRight size={14} />
      </span>
    </Link>
  );
}


function VideoCard({
  video,
}: {
  video: HomeVideo;
}) {
  return (
    <Link
      to={`/videos/${video.id}`}
      className="home-feed-video-card"
      aria-label={`Watch ${video.title}`}
    >
          
    <VideoThumbnail
      videoId={video.id}
      fallbackUrl={video.thumbnail}
      alt={`${video.title} thumbnail`}
    />


      <div className="home-feed-video-details">
        <span className="home-feed-type">
          Music video
        </span>

        <strong>{video.title}</strong>

        <p>{video.artistNames}</p>
      </div>
    </Link>
  );
}

function TrendingRow({
  song,
  position,
  onPlay,
}: {
  song: HomeSong;
  position: number;
  onPlay: (song: LibrarySong) => void;
}) {
  return (
    <button
  type="button"
  className="home-feed-trending-row"
  onClick={() => onPlay(song)}
  disabled={!song.id}
  aria-label={`Play ${song.title}`}
>
      <span className="home-feed-rank">
        {String(position).padStart(2, "0")}
      </span>

      <Artwork
  src={song.cover}
  alt={`${song.title} artwork`}
  releaseId={song.releaseId}
/>

      <div className="home-feed-trending-info">
        <strong>{song.title}</strong>
        <span>{song.artist}</span>
      </div>

      <div className="home-feed-play-count">
        <TrendingUp size={14} />
        <span>
          {song.recentPlays.toLocaleString()}
          {" "}plays
        </span>
      </div>
    </button>
  );
}

export default function HomeFeedPage({
  onPlay,
}: Props) {
  const { user, loading: authLoading } = useAuth();

  const [feed, setFeed] = useState<HomeFeed | null>(
    null
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;

    const controller = new AbortController();

    async function loadHome() {
      try {
        setLoading(true);
        setError("");

        const data = await fetchHomeFeed(
          controller.signal
        );

        if (!controller.signal.aborted) {
          setFeed(data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load the Home feed."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadHome();

    return () => controller.abort();
  }, [authLoading, user?.id, user?.role]);

  const albums =
    feed?.newReleases.filter((release) => {
      const type = release.releaseType.toLowerCase();

      return (
        type === "album" ||
        type === "ep"
      );
    }) || [];

  return (
    <div className="page-content home-feed-page">
      {/* HERO */}

      <section className="home-feed-hero">
        <div className="home-feed-hero-copy">
          <span className="home-feed-eyebrow">
            <span className="home-feed-dot" />
            WELCOME TO EMNET MUSIC
          </span>

          <h1>
            Feel the music.
            <span> Live the moment.</span>
          </h1>

          <p>
            Discover new songs, explore trending hits,
            and connect with artists you love.
            Your next favourite sound starts here.
          </p>

          <div className="home-feed-hero-actions">
            <Link
              to="/explore"
              className="home-feed-primary-btn"
            >
              Explore music
              <ArrowRight size={17} />
            </Link>

            <Link
              to="/videos"
              className="home-feed-secondary-btn"
            >
              Music videos
            </Link>
          </div>
        </div>

        <div
          className="home-feed-hero-visual"
          aria-hidden="true"
        >
          <div className="home-feed-disc">
            <Disc3 size={110} strokeWidth={1} />
          </div>

          <div className="home-feed-equalizer">
            {[35, 65, 45, 85, 50, 70, 30].map(
              (height, index) => (
                <span
                  key={index}
                  style={{ height: `${height}%` }}
                />
              )
            )}
          </div>
        </div>
      </section>

      {/* STATUS */}

      {loading && (
        <div className="home-feed-status">
          <Disc3 size={29} className="spin" />
          <p>Loading your music...</p>
        </div>
      )}

      {!loading && error && (
        <div className="home-feed-status" role="alert">
          <Music2 size={31} />
          <h3>Couldn't load the Home feed</h3>
          <p>{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && feed && (
        <>
          {/* LATEST SONGS */}

          <Section
            title="Latest songs"
            description="Fresh sounds recently added to Emnet Music."
            icon={<Music2 size={22} />}
            action={
              <Link
                to="/explore"
                className="home-feed-see-all"
              >
                See all
                <ArrowRight size={16} />
              </Link>
            }
          >
            {feed.latestSongs.length ? (
              <div className="home-feed-song-grid">
                {feed.latestSongs.map((song) => (
                  <SongCard
                    key={song.id}
                    song={song}
                    onPlay={onPlay}
                  />
                ))}
              </div>
            ) : (
              <EmptySection
                message="New songs will appear here when artists release music."
              />
            )}
          </Section>

          {/* NEW ALBUMS AND EPS */}

          <Section
            title="New albums & EPs"
            description="Discover recently released music collections."
            icon={<Disc3 size={22} />}
          >
            {albums.length ? (
              <div className="home-feed-release-grid">
                {albums.map((release) => (
                  <ReleaseCard
                    key={release.id}
                    release={release}
                  />
                ))}
              </div>
            ) : (
              <EmptySection
                message="No new albums or EPs are available yet."
              />
            )}
          </Section>

          {/* TRENDING */}

          <Section
            title="Trending songs"
            description="The most played songs during the last 7 days."
            icon={<TrendingUp size={22} />}
          >
            {feed.trendingSongs.length ? (
              <div className="home-feed-trending-list">
                {feed.trendingSongs.map((song, index) => (
                  <TrendingRow
                    key={song.id}
                    song={song}
                    position={index + 1}
                    onPlay={onPlay}
                  />
                ))}
              </div>
            ) : (
              <EmptySection
                message="Trending songs will appear when listening activity is recorded."
              />
            )}
          </Section>

          {/* RECOMMENDATIONS */}

          <Section
            title="Recommended songs"
            description={
              user
                ? "Music suggestions based on available listening preferences."
                : "Discover more music from our catalogue."
            }
            icon={<Sparkles size={22} />}
          >
            {feed.recommendedSongs.length ? (
              <div className="home-feed-song-grid">
                {feed.recommendedSongs.map((song) => (
                  <SongCard
                    key={song.id}
                    song={song}
                    onPlay={onPlay}
                  />
                ))}
              </div>
            ) : (
              <EmptySection
                message="More recommendations will appear as new music becomes available."
              />
            )}
          </Section>

          {/* FEATURED ARTISTS */}

          <Section
            title="Featured artists"
            description="Discover artists in the Emnet Music spotlight."
            icon={<Users size={22} />}
          >
            {feed.featuredArtists.length ? (
              <div className="home-feed-artists-grid">
                {feed.featuredArtists.map((artist) => (
                  <ArtistCard
                    key={artist.id}
                    artist={artist}
                  />
                ))}
              </div>
            ) : (
              <EmptySection
                message="Featured artists will appear here when selected."
              />
            )}
          </Section>

          {/* LATEST VIDEOS */}

          <Section
            title="Latest music videos"
            description="Discover the newest visuals from Emnet Music artists."
            icon={<Clapperboard size={22} />}
            action={
              <Link
                to="/videos"
                className="home-feed-see-all"
              >
                Videos
                <ArrowRight size={16} />
              </Link>
            }
          >
            {feed.latestVideos.length ? (
              <div className="home-feed-videos-grid">
                {feed.latestVideos.map((video) => (
                  <VideoCard
                    key={video.id}
                    video={video}
                  />
                ))}
              </div>
            ) : (
              <EmptySection
                message="New music videos will appear here."
              />
            )}
          </Section>

          {/* FOOTER CTA */}

          <div className="home-feed-bottom-banner">
            <div>
              <Radio size={27} />
              <h2>Good music. Brighter days.</h2>
              <p>
                Keep discovering your next favourite sound.
              </p>
            </div>

            <Link to="/explore">
              <Headphones size={17} />
              Keep exploring
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
