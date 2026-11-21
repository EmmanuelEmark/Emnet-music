
import { useEffect, useState } from "react";
import { Link } from "react-router";

import {
  ArrowLeft,
  Disc3,
  Heart,
  Music2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

import {
  getReleaseArtworkUrl,
  getIsSongLiked,
  setSongLiked,
} from "../services/audioMediaApi";

import "./NowPlayingPage.css";

export type NowPlayingSong = {
  id: string;
  title: string;
  artist: string;
  cover: string;
  audioUrl: string;
  genre: string;
  duration: number;
  releaseId?: string;
};

type Props = {
  currentSong: NowPlayingSong | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  onToggle: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek: (seconds: number) => void;
  onVolumeChange: (volume: number) => void;
  audioError?: string;
};

function formatTime(value: number): string {
  if (!Number.isFinite(value)) return "0:00";

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}


export default function NowPlayingPage({
  currentSong,
  isPlaying,
  currentTime,
  duration,
  volume,
  onToggle,
  onNext,
  onPrevious,
  onSeek,
  onVolumeChange,
  audioError = "",
}: Props) {

  const { user } = useAuth();

  const [artwork, setArtwork] = useState("");
  const [artworkFailed, setArtworkFailed] = useState(false);

  const [liked, setLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [likeError, setLikeError] = useState("");

  const songId = currentSong?.id;
  const releaseId = currentSong?.releaseId;
  const fallbackCover = currentSong?.cover || "";

  // Load real album artwork, including artwork stored in R2.
  useEffect(() => {
    const controller = new AbortController();

    setArtwork(fallbackCover);
    setArtworkFailed(false);

    if (releaseId) {
      getReleaseArtworkUrl(releaseId, controller.signal)
        .then((url) => {
          if (!controller.signal.aborted) {
            setArtwork(url);
            setArtworkFailed(false);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setArtwork(fallbackCover);
          }
        });
    }

    return () => controller.abort();
  }, [releaseId, fallbackCover]);

  // Check whether this listener has liked the current song.
  useEffect(() => {
    const controller = new AbortController();

    setLiked(false);
    setLikeError("");
    setLikeLoading(false);

    if (
      !songId ||
      !user ||
      !["listener", "artist"].includes(user.role)
    ) {
      return () => controller.abort();
    }

    getIsSongLiked(songId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setLiked(result);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setLikeError(
            error instanceof Error
              ? error.message
              : "Unable to check liked songs."
          );
        }
      });

    return () => controller.abort();
  }, [songId, user?.id, user?.role]);

  async function toggleLike() {
    if (!songId || likeLoading) return;

    const nextLiked = !liked;

    try {
      setLikeLoading(true);
      setLikeError("");

      await setSongLiked(songId, nextLiked);

      setLiked(nextLiked);
    } catch (error) {
      setLikeError(
        error instanceof Error
          ? error.message
          : "Unable to update liked song."
      );
    } finally {
      setLikeLoading(false);
    }
  }

  if (!currentSong) {
    return (
      <div className="page-content em-now-page">
        <div className="em-now-empty">
          <Disc3 size={58} />

          <h1>Nothing playing yet</h1>

          <p>
            Select a song from Home, Explore, Search,
            or your Library to start listening.
          </p>

          <Link to="/" className="em-now-back-button">
            Explore music
          </Link>
        </div>
      </div>
    );
  }

  const canLike =
    user &&
    (user.role === "listener" ||
      user.role === "artist");

  return (
    <div className="page-content em-now-page">
      <Link to="/" className="em-now-back">
        <ArrowLeft size={18} />
        Back to music
      </Link>

      <div className="em-now-container">
        {/* ALBUM ARTWORK */}

        <div className="em-now-artwork">
          {artwork && !artworkFailed ? (
            <img
              src={artwork}
              alt={`${currentSong.title} artwork`}
              onError={() => setArtworkFailed(true)}
            />
          ) : (
            <div className="em-now-artwork-empty">
              <Music2 size={90} strokeWidth={1.2} />
            </div>
          )}
        </div>

        {/* SONG INFORMATION */}

        <div className="em-now-information">
          <span className="em-now-eyebrow">
            <Disc3 size={16} />
            NOW PLAYING
          </span>

          <div className="em-now-song-heading">
            <div>
              <h1>{currentSong.title}</h1>
              <p>{currentSong.artist}</p>
            </div>

            {canLike ? (
              <button
                type="button"
                className={`em-now-like ${
                  liked ? "is-liked" : ""
                }`}
                onClick={() => void toggleLike()}
                disabled={likeLoading}
                aria-pressed={liked}
                aria-label={
                  liked ? "Unlike song" : "Like song"
                }
                title={
                  liked ? "Unlike song" : "Like song"
                }
              >
                <Heart
                  size={27}
                  fill={liked ? "currentColor" : "none"}
                />
              </button>
            ) : !user ? (
              <Link
                to="/login"
                className="em-now-login-like"
              >
                <Heart size={20} />
                Log in to like
              </Link>
            ) : null}
          </div>

          {likeError && (
            <p className="em-now-error" role="alert">
              {likeError}
            </p>
          )}


          {audioError && (
            <p className="em-now-error" role="alert">
              {audioError}
            </p>
          )}


          <span className="em-now-genre">
            {currentSong.genre}
          </span>

          {/* PLAYBACK PROGRESS */}

          <div className="em-now-progress">
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
                onSeek(Number(event.target.value))
              }
              disabled={duration <= 0}
              aria-label="Seek through song"
            />

            <div className="em-now-time">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* MUSIC CONTROLS */}

          <div className="em-now-controls">
            <button
              type="button"
              onClick={onPrevious}
              aria-label="Previous song"
            >
              <SkipBack size={25} fill="currentColor" />
            </button>

            <button
              type="button"
              className="em-now-main-play"
              onClick={onToggle}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause
                  size={27}
                  fill="currentColor"
                />
              ) : (
                <Play
                  size={27}
                  fill="currentColor"
                />
              )}
            </button>

            <button
              type="button"
              onClick={onNext}
              aria-label="Next song"
            >
              <SkipForward
                size={25}
                fill="currentColor"
              />
            </button>
          </div>

          {/* VOLUME */}

          <div className="em-now-volume">
            <button
              type="button"
              onClick={() =>
                onVolumeChange(
                  volume === 0 ? 0.8 : 0
                )
              }
              aria-label="Toggle mute"
            >
              {volume === 0 ? (
                <VolumeX size={20} />
              ) : (
                <Volume2 size={20} />
              )}
            </button>

            <input
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
      </div>
    </div>
  );
}
