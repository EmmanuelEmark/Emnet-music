
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import {
  ArrowLeft,
  BadgeCheck,
  Clapperboard,
  Disc3,
  Heart,
  LoaderCircle,
  MapPin,
  Music2,
  Pause,
  Play,
  UserRound,
  Users,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

import { getFollowedArtists } from "../services/libraryApi";

import type { LibrarySong } from "../services/libraryApi";

import {
  followArtist,
  getPublicArtistProfile,
  unfollowArtist,
  type ArtistProfileData,
} from "../services/artistApi";

import "./ArtistProfilePage.css";

type Props = {
  onPlay: (song: LibrarySong) => void;
  currentSongId?: string;
  isPlaying: boolean;
};

function Artwork({
  src,
  alt,
  kind = "square",
}: {
  src: string;
  alt: string;
  kind?: "square" | "circle" | "video";
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <div className={`artist-artwork artist-artwork-${kind}`}>
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <Music2 size={30} />
      )}
    </div>
  );
}

export default function ArtistProfilePage({
  onPlay,
  currentSongId,
  isPlaying,
}: Props) {
  const { artistId } = useParams<{ artistId: string }>();
  const { user } = useAuth();

  const [profile, setProfile] =
    useState<ArtistProfileData | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [following, setFollowing] = useState(false);
  const [followReady, setFollowReady] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followError, setFollowError] = useState("");

  const canFollow =
    user?.role === "listener" ||
    user?.role === "artist";

  useEffect(() => {
    if (!artistId) {
      setLoading(false);
      setProfile(null);
      setError("Artist ID is missing.");
      return;
    }

    const controller = new AbortController();

    setLoading(true);
    setProfile(null);
    setError("");
    setFollowReady(false);
    setFollowing(false);
    setFollowError("");

    async function load() {
      try {
        const data = await getPublicArtistProfile(
          artistId!,
          controller.signal
        );

        if (!controller.signal.aborted) {
          setProfile(data);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load artist profile."
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [artistId]);

  useEffect(() => {
    if (!artistId || !canFollow) {
      setFollowReady(false);
      return;
    }

    let cancelled = false;

    async function checkFollowing() {
      try {
        const artists = await getFollowedArtists();

        if (!cancelled) {
          setFollowing(
            artists.some((artist) => artist.id === artistId)
          );
          setFollowReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          setFollowError(
            err instanceof Error
              ? err.message
              : "Unable to check follow status."
          );
          setFollowReady(false);
        }
      }
    }

    void checkFollowing();

    return () => {
      cancelled = true;
    };
  }, [artistId, canFollow, user?.id]);

  async function toggleFollow() {
    if (
      !artistId ||
      !profile ||
      !canFollow ||
      !followReady ||
      followBusy
    ) {
      return;
    }

    setFollowBusy(true);
    setFollowError("");

    try {
      if (following) {
        await unfollowArtist(artistId);
      } else {
        await followArtist(artistId);
      }

      const nextFollowing = !following;

      setFollowing(nextFollowing);

      setProfile((previous) => {
        if (!previous) return previous;

        return {
          ...previous,
          artist: {
            ...previous.artist,
            followersCount: Math.max(
              0,
              previous.artist.followersCount +
                (nextFollowing ? 1 : -1)
            ),
          },
        };
      });
    } catch (err) {
      setFollowError(
        err instanceof Error
          ? err.message
          : "Unable to update follow status."
      );
    } finally {
      setFollowBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="page-content artist-profile-state">
        <LoaderCircle size={32} className="artist-loading" />
        <p>Loading artist profile...</p>
      </div>
    );
  }

  if (!profile || error) {
    return (
      <div className="page-content artist-profile-state">
        <UserRound size={38} />
        <h2>Artist unavailable</h2>
        <p>{error || "This artist could not be found."}</p>
        <Link to="/explore">Explore music</Link>
      </div>
    );
  }

  const { artist, songs, releases, videos } = profile;

  return (
    <main className="page-content artist-profile-page">
      <Link className="artist-back" to="/search">
        <ArrowLeft size={17} />
        Back to Search
      </Link>

      <div className="artist-profile-hero">
        <div className="artist-cover">
          {artist.coverImage ? (
            <img
              src={artist.coverImage}
              alt={`${artist.stageName} cover`}
            />
          ) : (
            <Music2 size={58} />
          )}
        </div>

        <div className="artist-profile-header">
          <Artwork
            src={artist.profileImage}
            alt={artist.stageName}
            kind="circle"
          />

          <div className="artist-profile-main">
            <div className="artist-profile-title">
              <h1>{artist.stageName}</h1>

              {artist.verified && (
                <BadgeCheck
                  size={24}
                  className="artist-verified"
                  aria-label="Verified artist"
                />
              )}
            </div>

            <div className="artist-profile-meta">
              <span>
                <Users size={15} />
                {artist.followersCount.toLocaleString()}
                {" "}followers
              </span>

              {artist.country && (
                <span>
                  <MapPin size={15} />
                  {artist.country}
                </span>
              )}
            </div>
          </div>

          {canFollow ? (
            <button
              type="button"
              className={`artist-follow-btn ${
                following ? "is-following" : ""
              }`}
              disabled={!followReady || followBusy}
              onClick={() => void toggleFollow()}
            >
              <Heart
                size={17}
                fill={following ? "currentColor" : "none"}
              />

              {followBusy
                ? "Updating..."
                : !followReady
                  ? "Checking..."
                  : following
                    ? "Following"
                    : "Follow"}
            </button>
          ) : !user ? (
            <Link
              className="artist-follow-btn"
              to="/login"
            >
              Log in to follow
            </Link>
          ) : null}
        </div>

        {artist.bio && (
          <div className="artist-profile-bio">
            <h2>About the artist</h2>
            <p>{artist.bio}</p>
          </div>
        )}

        {followError && (
          <p className="artist-follow-error" role="alert">
            {followError}
          </p>
        )}
      </div>

      <div className="artist-profile-stats">
        <div>
          <Music2 size={20} />
          <strong>{songs.length}</strong>
          <span>Songs</span>
        </div>

        <div>
          <Disc3 size={20} />
          <strong>{releases.length}</strong>
          <span>Releases</span>
        </div>

        <div>
          <Clapperboard size={20} />
          <strong>{videos.length}</strong>
          <span>Videos</span>
        </div>
      </div>

      <section className="artist-content-section">
        <div className="artist-section-heading">
          <Music2 size={21} />
          <h2>Songs</h2>
        </div>

        {songs.length ? (
          <div className="artist-song-list">
            {songs.map((song) => {
              const active =
                currentSongId === song.id && isPlaying;

              return (
                <div className="artist-song-row" key={song.id}>
                  <Artwork
                    src={song.cover}
                    alt={song.title}
                  />

                  <div className="artist-song-info">
                    <strong>{song.title}</strong>
                    <span>{song.artist}</span>
                  </div>

                  <button
                    type="button"
                    className="artist-song-play"
                    disabled={!song.audioUrl}
                    onClick={() => onPlay(song)}
                    aria-label={
                      active
                        ? `Pause ${song.title}`
                        : `Play ${song.title}`
                    }
                  >
                    {active ? (
                      <Pause
                        size={18}
                        fill="currentColor"
                      />
                    ) : (
                      <Play
                        size={18}
                        fill="currentColor"
                      />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="artist-no-content">
            No available songs yet.
          </p>
        )}
      </section>

      <section className="artist-content-section">
        <div className="artist-section-heading">
          <Disc3 size={21} />
          <h2>Releases</h2>
        </div>

        {releases.length ? (
          <div className="artist-media-grid">
            {releases.map((release) => (
              <article
                className="artist-media-card"
                key={release.id}
              >
                <Artwork
                  src={release.coverImage}
                  alt={release.title}
                />
                <strong>{release.title}</strong>
                <span>{release.releaseType}</span>
              </article>
            ))}
          </div>
        ) : (
          <p className="artist-no-content">
            No available releases yet.
          </p>
        )}
      </section>

      <section className="artist-content-section">
        <div className="artist-section-heading">
          <Clapperboard size={21} />
          <h2>Music videos</h2>
        </div>

        {videos.length ? (
          <div className="artist-media-grid">
            {videos.map((video) => (
              <article
                className="artist-media-card"
                key={video.id}
              >
                <Artwork
                  src={video.thumbnail}
                  alt={video.title}
                  kind="video"
                />
                <strong>{video.title}</strong>
                <span>{video.artists}</span>
              </article>
            ))}
          </div>
        ) : (
          <p className="artist-no-content">
            No available music videos yet.
          </p>
        )}
      </section>
    </main>
  );
}
