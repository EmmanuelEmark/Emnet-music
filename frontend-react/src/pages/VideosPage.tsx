
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Clapperboard,
  Film,
  Play,
  Radio,
  RefreshCcw,
} from "lucide-react";

import {
  getPublicVideos,
  getVideoArtistNames,
  formatVideoDuration,
  type MusicVideo,
} from "../services/videoApi";

import "./VideosPage.css";
import VideoThumbnail from "../components/VideoThumbnail";

const types = [
  { value: "all", label: "All videos" },
  { value: "music_video", label: "Music videos" },
  { value: "live_performance", label: "Live performances" },
  { value: "interview", label: "Interviews" },
  { value: "other", label: "Other videos" },
];

function VideoCard({ video }: { video: MusicVideo }) {
  return (
    <Link
      to={`/videos/${video.id}`}
      className="em-video-card"
      aria-label={`Watch ${video.title}`}
    >
      <div className="em-video-thumbnail">
            
      <VideoThumbnail
        videoId={video.id}
        fallbackUrl={video.thumbnailUrl}
        alt={`${video.title} thumbnail`}
      />


        <span className="em-video-play">
          <Play size={24} fill="currentColor" />
        </span>

        {video.duration > 0 && (
          <span className="em-video-duration">
            {formatVideoDuration(video.duration)}
          </span>
        )}
      </div>

      <div className="em-video-card-info">
        <strong>{video.title}</strong>
        <span>{getVideoArtistNames(video)}</span>
        <small>
          {video.videoType.replace(/_/g, " ")}
        </small>
      </div>
    </Link>
  );
}

export default function VideosPage() {
  const [videos, setVideos] = useState<MusicVideo[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        setLoading(true);
        setError("");

        const result = await getPublicVideos(
          controller.signal
        );

        if (!controller.signal.aborted) {
          setVideos(result);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load videos."
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
  }, [retry]);

  const filteredVideos = useMemo(() => {
    if (filter === "all") return videos;

    return videos.filter(
      (video) => video.videoType === filter
    );
  }, [videos, filter]);

  return (
    <div className="page-content em-videos-page">
      <section className="em-videos-hero">
        <span className="em-videos-eyebrow">
          <Radio size={16} />
          EMNET MUSIC VIDEOS
        </span>

        <h1>
          Watch music
          <span> come alive.</span>
        </h1>

        <p>
          Discover music videos, live performances
          and exclusive artist experiences.
        </p>
      </section>

      <section className="em-videos-content">
        <div className="em-videos-heading">
          <div>
            <h2>Discover videos</h2>
            <p>
              {loading
                ? "Loading videos..."
                : `${filteredVideos.length} videos`}
            </p>
          </div>
        </div>

        <div
          className="em-videos-filters"
          aria-label="Video category"
        >
          {types.map((type) => (
            <button
              key={type.value}
              type="button"
              className={
                filter === type.value ? "active" : ""
              }
              onClick={() => setFilter(type.value)}
              aria-pressed={filter === type.value}
            >
              {type.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="em-videos-message">
            <Film size={32} />
            <p>Loading music videos...</p>
          </div>
        ) : error ? (
          <div className="em-videos-message" role="alert">
            <Clapperboard size={32} />
            <h3>Couldn't load videos</h3>
            <p>{error}</p>
            <button
              type="button"
              onClick={() => setRetry((n) => n + 1)}
            >
              <RefreshCcw size={16} />
              Try again
            </button>
          </div>
        ) : filteredVideos.length ? (
          <div className="em-videos-grid">
            {filteredVideos.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
              />
            ))}
          </div>
        ) : (
          <div className="em-videos-message">
            <Clapperboard size={32} />
            <h3>No videos available yet</h3>
            <p>
              Approved videos in this category
              will appear here.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
