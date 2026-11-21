
import {
  useEffect,
  useState,
} from "react";

import {
  CheckCircle2,
  Clapperboard,
  Disc3,
  LoaderCircle,
  Music2,
  Pause,
  Play,
  Search,
  SearchX,
  Users,
  X,
} from "lucide-react";

import {
  searchMusic,
  type SearchArtist,
  type SearchRelease,
  type SearchVideo,
  type SearchResults,
} from "../services/searchApi";

import type { LibrarySong } from "../services/libraryApi";
import { Link } from "react-router";

import "./SearchPage.css";

type SearchTab =
  | "all"
  | "songs"
  | "artists"
  | "releases"
  | "videos";

type Props = {
  onPlay: (song: LibrarySong) => void;
  currentSongId?: string;
  isPlaying: boolean;
};

const EMPTY_RESULTS: SearchResults = {
  songs: [],
  artists: [],
  releases: [],
  videos: [],
};

function Cover({
  src,
  alt,
  circle = false,
}: {
  src: string;
  alt: string;
  circle?: boolean;
}) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  return (
    <div
      className={
        circle
          ? "search-cover search-cover-circle"
          : "search-cover"
      }
    >
      {src && !broken ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <Music2 size={30} />
      )}
    </div>
  );
}

export default function SearchPage({
  onPlay,
  currentSongId,
  isPlaying,
}: Props) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<SearchTab>("all");

  const [results, setResults] =
    useState<SearchResults>(EMPTY_RESULTS);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  // Wait briefly after typing before searching.
  useEffect(() => {
    const term = query.trim();

    if (!term) {
      setResults(EMPTY_RESULTS);
      setLoading(false);
      setError("");
      setSearched(false);
      return;
    }

    const controller = new AbortController();

    setLoading(true);
    setError("");
    setSearched(false);

    const timer = window.setTimeout(async () => {
      try {
        const data = await searchMusic(
          term,
          controller.signal
        );

        if (!controller.signal.aborted) {
          setResults(data);
          setSearched(true);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Something went wrong while searching."
          );
          setResults(EMPTY_RESULTS);
          setSearched(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 450);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const total =
    results.songs.length +
    results.artists.length +
    results.releases.length +
    results.videos.length;

  const tabs: {
    id: SearchTab;
    label: string;
    count: number;
  }[] = [
    { id: "all", label: "All", count: total },
    {
      id: "songs",
      label: "Songs",
      count: results.songs.length,
    },
    {
      id: "artists",
      label: "Artists",
      count: results.artists.length,
    },
    {
      id: "releases",
      label: "Releases",
      count: results.releases.length,
    },
    {
      id: "videos",
      label: "Videos",
      count: results.videos.length,
    },
  ];

  const showSongs =
    tab === "all" || tab === "songs";

  const showArtists =
    tab === "all" || tab === "artists";

  const showReleases =
    tab === "all" || tab === "releases";

  const showVideos =
    tab === "all" || tab === "videos";

  function renderSongs(songs: LibrarySong[]) {
    return (
      <div className="search-song-list">
        {songs.map((song) => {
          const active =
            currentSongId === song.id &&
            isPlaying;

          return (
            <div
              className="search-song"
              key={song.id}
            >
              <Cover
                src={song.cover}
                alt={`${song.title} artwork`}
              />

              <div className="search-song-info">
                <strong>{song.title}</strong>
                <span>{song.artist}</span>
              </div>

              <span className="search-genre">
                {song.genre}
              </span>

              <button
                type="button"
                className="search-play"
                onClick={() => onPlay(song)}
                disabled={!song.audioUrl}
                aria-label={
                  active
                    ? `Pause ${song.title}`
                    : `Play ${song.title}`
                }
                title={
                  song.audioUrl
                    ? "Play song"
                    : "Audio unavailable"
                }
              >
                {active ? (
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
            </div>
          );
        })}
      </div>
    );
  }


  
  
function renderArtists(artists: SearchArtist[]) {
  return (
    <div className="search-card-grid search-artist-grid">
      {artists.map((artist) => (
        <Link
          key={artist.id}
          to={`/artists/${artist.id}`}
          className="search-result-card search-artist-link"
        >
          <Cover
            src={artist.profileImage}
            alt={artist.stageName}
            circle
          />

          <div className="search-card-info">
            <strong>
              {artist.stageName}

              {artist.verified && (
                <CheckCircle2
                  size={16}
                  className="search-verified"
                />
              )}
            </strong>

            <span>
              {artist.followersCount.toLocaleString()}
              {" "}followers
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}





  function renderReleases(releases: SearchRelease[]) {
    return (
      <div className="search-card-grid">
        {releases.map((release) => (
          <article
            key={release.id}
            className="search-result-card"
          >
            <Cover
              src={release.coverImage}
              alt={`${release.title} cover`}
            />

            <div className="search-card-info">
              <strong>{release.title}</strong>
              <span>{release.artists}</span>
              <small>{release.releaseType}</small>
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderVideos(videos: SearchVideo[]) {
    return (
      <div className="search-card-grid">
        {videos.map((video) => (
          <article
            key={video.id}
            className="search-result-card"
          >
            <div className="search-video-art">
              <Cover
                src={video.thumbnail}
                alt={`${video.title} thumbnail`}
              />
              <span className="search-video-icon">
                <Clapperboard size={20} />
              </span>
            </div>

            <div className="search-card-info">
              <strong>{video.title}</strong>
              <span>{video.artists}</span>
              <small>Music video</small>
            </div>
          </article>
        ))}
      </div>
    );
  }

  return (
    <main className="page-content search-page">
      <div className="search-hero">
        <div className="search-hero-icon">
          <Search size={25} />
        </div>

        <span className="section-label">
          EMNET MUSIC DISCOVERY
        </span>

        <h1>Find your next favourite.</h1>

        <p>
          Search songs, artists, albums
          and music videos in one place.
        </p>

        <div className="search-input-box">
          <Search size={21} />

          <input
            type="search"
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder="What would you like to listen to?"
            aria-label="Search Emnet Music"
            maxLength={100}
            autoComplete="off"
          />

          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              <X size={19} />
            </button>
          )}
        </div>
      </div>

      {!query.trim() ? (
        <div className="search-empty-state">
          <Disc3 size={41} />
          <h2>Every great song starts with discovery.</h2>
          <p>
            Search by song title, artist name,
            album or music video.
          </p>
        </div>
      ) : (
        <>
          <div className="search-toolbar">
            <div>
              <h2>Search results</h2>
              <p>
                {loading
                  ? "Searching Emnet Music..."
                  : searched && !error
                    ? `${total} results for "${query.trim()}"`
                    : "Find what you love."}
              </p>
            </div>
          </div>

          <div className="search-tabs">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  tab === item.id
                    ? "search-tab active"
                    : "search-tab"
                }
                onClick={() => setTab(item.id)}
              >
                {item.label}
                <span>{item.count}</span>
              </button>
            ))}
          </div>

          {loading && (
            <div className="search-state">
              <LoaderCircle
                size={31}
                className="search-spin"
              />
              <h3>Searching...</h3>
            </div>
          )}

          {!loading && error && (
            <div
              className="search-state search-error"
              role="alert"
            >
              <SearchX size={31} />
              <h3>Search unavailable</h3>
              <p>{error}</p>
            </div>
          )}

          {!loading &&
            !error &&
            searched &&
            (tab === "all"
              ? total === 0
              : tabs.find(
                  (item) => item.id === tab
                )?.count === 0) && (
              <div className="search-state">
                <SearchX size={35} />
                <h3>No results found</h3>
                <p>
                  Try a different song, artist,
                  album or video title.
                </p>
              </div>
            )}

          {!loading && !error && searched && (
            <div className="search-results">
              {showSongs &&
                results.songs.length > 0 && (
                  <section className="search-section">
                    <div className="search-section-title">
                      <Music2 size={20} />
                      <h2>Songs</h2>
                    </div>
                    {renderSongs(results.songs)}
                  </section>
                )}

              {showArtists &&
                results.artists.length > 0 && (
                  <section className="search-section">
                    <div className="search-section-title">
                      <Users size={20} />
                      <h2>Artists</h2>
                    </div>
                    {renderArtists(results.artists)}
                  </section>
                )}

              {showReleases &&
                results.releases.length > 0 && (
                  <section className="search-section">
                    <div className="search-section-title">
                      <Disc3 size={20} />
                      <h2>Releases</h2>
                    </div>
                    {renderReleases(results.releases)}
                  </section>
                )}

              {showVideos &&
                results.videos.length > 0 && (
                  <section className="search-section">
                    <div className="search-section-title">
                      <Clapperboard size={20} />
                      <h2>Music videos</h2>
                    </div>
                    {renderVideos(results.videos)}
                  </section>
                )}
            </div>
          )}
        </>
      )}
    </main>
  );
}