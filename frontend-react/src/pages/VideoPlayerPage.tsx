
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";

import {
  ArrowLeft,
  BadgeCheck,
  Clapperboard,
  Film,
  RefreshCcw,
} from "lucide-react";

import {
  getPublicVideoById,
  getVideoPlaybackUrl,
  getVideoThumbnailUrl,
  getVideoArtistNames,
  type MusicVideo,
} from "../services/videoApi";

import "./VideoPlayerPage.css";

export default function VideoPlayerPage() {
  const { videoId } = useParams<{ videoId: string }>();

  const [video, setVideo] = useState<MusicVideo | null>(
    null
  );

  const [playbackUrl, setPlaybackUrl] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [playbackError, setPlaybackError] = useState("");

  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!videoId) {
      setError("No video was selected.");
      setVideo(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadVideo() {
      try {
        setLoading(true);
        setError("");
        setPlaybackError("");
        setVideo(null);
        setPlaybackUrl("");
        setThumbnailUrl("");

        // First retrieve the approved video details.
        const result = await getPublicVideoById(
          videoId!,
          controller.signal
        );

        if (controller.signal.aborted) return;

        setVideo(result);
        setThumbnailUrl(result.thumbnailUrl);

        // Resolve the playback and thumbnail URLs.
        // Each endpoint handles both R2 and legacy media.
        const [playbackResult, thumbnailResult] =
          await Promise.allSettled([
            getVideoPlaybackUrl(
              result.id,
              controller.signal
            ),
            getVideoThumbnailUrl(
              result.id,
              controller.signal
            ),
          ]);

        if (controller.signal.aborted) return;

        if (playbackResult.status === "fulfilled") {
          setPlaybackUrl(playbackResult.value);
        } else {
          setPlaybackError(
            playbackResult.reason instanceof Error
              ? playbackResult.reason.message
              : "Unable to prepare video playback."
          );
        }

        if (thumbnailResult.status === "fulfilled") {
          setThumbnailUrl(thumbnailResult.value);
        }
      } catch (err) {
        if (controller.signal.aborted) return;

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load the selected video."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadVideo();

    return () => controller.abort();
  }, [videoId, retryCount]);

  const artists = video
    ? [
        ...video.primaryArtists,
        ...video.featuredArtists,
      ]
    : [];

  return (
    <div className="page-content em-watch-page">
      <Link
        to="/videos"
        className="em-watch-back"
      >
        <ArrowLeft size={18} />
        Back to videos
      </Link>

      {loading ? (
        <div className="em-watch-message">
          <Film size={32} />
          <p>Preparing your video...</p>
        </div>
      ) : error ? (
        <div className="em-watch-message" role="alert">
          <Clapperboard size={32} />

          <h2>Video unavailable</h2>

          <p>{error}</p>

          <button
            type="button"
            onClick={() =>
              setRetryCount((count) => count + 1)
            }
          >
            <RefreshCcw size={16} />
            Try again
          </button>
        </div>
      ) : video ? (
        <>
          {/* VIDEO PLAYER */}

          <div className="em-watch-player">
            {playbackUrl ? (
              <video
                key={playbackUrl}
                src={playbackUrl}
                poster={thumbnailUrl || undefined}
                controls
                playsInline
                preload="metadata"
                onError={() =>
                  setPlaybackError(
                    "Video playback failed. Try reloading the video."
                  )
                }
              >
                Your browser does not support
                HTML5 video playback.
              </video>
            ) : (
              <div className="em-watch-unavailable">
                <Clapperboard size={44} />

                <h2>Playback unavailable</h2>

                <p>
                  {playbackError ||
                    "No playable video URL was returned."}
                </p>

                <button
                  type="button"
                  onClick={() =>
                    setRetryCount((count) => count + 1)
                  }
                >
                  <RefreshCcw size={16} />
                  Try again
                </button>
              </div>
            )}
          </div>

          {playbackUrl && playbackError && (
            <div
              className="em-watch-playback-alert"
              role="alert"
            >
              <p>{playbackError}</p>
              <button
                type="button"
                onClick={() =>
                  setRetryCount((count) => count + 1)
                }
              >
                <RefreshCcw size={16} />
                Reload video
              </button>
            </div>
          )}

          {/* VIDEO DETAILS */}

          <div className="em-watch-details">
            <span className="em-watch-category">
              {video.videoType.replace(/_/g, " ")}
            </span>

            <h1>{video.title}</h1>

            <p className="em-watch-byline">
              {getVideoArtistNames(video)}
            </p>

            {video.linkedSongTitle && (
              <p className="em-watch-linked">
                Song: {video.linkedSongTitle}
              </p>
            )}

            {video.linkedReleaseTitle && (
              <p className="em-watch-linked">
                Release: {video.linkedReleaseTitle}
              </p>
            )}
          </div>

          {/* ARTIST PROFILES */}

          {artists.length > 0 && (
            <section className="em-watch-artists">
              <h2>Artists</h2>

              <div className="em-watch-artist-list">
                {artists.map((artist) => (
                  <Link
                    key={artist.id}
                    to={`/artists/${artist.id}`}
                    className="em-watch-artist"
                  >
                    <div className="em-watch-avatar">
                      {artist.profileImage ? (
                        <img
                          src={artist.profileImage}
                          alt={artist.stageName}
                        />
                      ) : (
                        <Clapperboard size={19} />
                      )}
                    </div>

                    <span>
                      {artist.stageName}

                      {artist.verified && (
                        <BadgeCheck size={16} />
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
