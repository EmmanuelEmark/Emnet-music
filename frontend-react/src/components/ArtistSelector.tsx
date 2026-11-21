
import {
  useEffect,
  useId,
  useState,
} from "react";

import {
  BadgeCheck,
  Check,
  LoaderCircle,
  Plus,
  Search,
  UserRound,
  X,
} from "lucide-react";

import {
  searchArtists,
  type SelectableArtist,
} from "../services/artistSelectionApi";

import "./ArtistSelector.css";

// ==========================================
// COMPONENT PROPERTIES
// ==========================================

type ArtistSelectorProps = {
  label?: string;
  description?: string;

  selectedArtists: SelectableArtist[];

  onChange: (
    artists: SelectableArtist[]
  ) => void;

  excludedArtistIds?: string[];

  disabled?: boolean;

  maxArtists?: number;
};

const EMPTY_IDS: string[] = [];

// ==========================================
// ARTIST AVATAR
// ==========================================

function ArtistAvatar({
  artist,
}: {
  artist: SelectableArtist;
}) {
  const [failed, setFailed] =
    useState(false);

  const image =
    artist.profileImage || "";

  useEffect(() => {
    setFailed(false);
  }, [image]);

  return (
    <span className="em-selector-avatar">
      {image &&
      /^https?:\/\//i.test(image) &&
      !failed ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          onError={() =>
            setFailed(true)
          }
        />
      ) : (
        <UserRound size={21} />
      )}
    </span>
  );
}

// ==========================================
// REUSABLE ARTIST SELECTOR
// ==========================================

export default function ArtistSelector({
  label = "Featured Artists",

  description =
    "Search and select artists by their stage names.",

  selectedArtists,

  onChange,

  excludedArtistIds = EMPTY_IDS,

  disabled = false,

  maxArtists = 10,
}: ArtistSelectorProps) {
  const inputId = useId();

  const [query, setQuery] =
    useState("");

  const [results, setResults] =
    useState<SelectableArtist[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const trimmedQuery =
    query.trim();

  const limitReached =
    selectedArtists.length >=
    maxArtists;

  // ========================================
  // SEARCH AFTER TYPING PAUSES
  // ========================================

  useEffect(() => {
    if (
      disabled ||
      trimmedQuery.length < 2
    ) {
      setResults([]);
      setLoading(false);
      setError("");

      return;
    }

    const controller =
      new AbortController();

    let cancelled = false;

    setResults([]);
    setLoading(true);
    setError("");

    const timer = window.setTimeout(
      async () => {
        try {
          const artists =
            await searchArtists(
              trimmedQuery,
              controller.signal
            );

          if (!cancelled) {
            setResults(artists);
          }
        } catch (err) {
          if (
            cancelled ||
            controller.signal.aborted
          ) {
            return;
          }

          setError(
            err instanceof Error
              ? err.message
              : "Unable to search for artists."
          );
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      },
      350
    );

    return () => {
      cancelled = true;

      window.clearTimeout(timer);

      controller.abort();
    };

  }, [trimmedQuery, disabled]);

  // ========================================
  // ADD ARTIST
  // ========================================

  function addArtist(
    artist: SelectableArtist
  ) {
    if (
      disabled ||
      limitReached ||
      excludedArtistIds.includes(
        artist._id
      ) ||
      selectedArtists.some(
        (item) =>
          item._id === artist._id
      )
    ) {
      return;
    }

    onChange([
      ...selectedArtists,
      artist,
    ]);

    setQuery("");
    setResults([]);
    setError("");
  }

  // ========================================
  // REMOVE ARTIST
  // ========================================

  function removeArtist(
    artistId: string
  ) {
    if (disabled) return;

    onChange(
      selectedArtists.filter(
        (artist) =>
          artist._id !== artistId
      )
    );
  }

  const visibleResults =
    results.filter(
      (artist) =>
        !excludedArtistIds.includes(
          artist._id
        )
    );

  // ========================================
  // COMPONENT INTERFACE
  // ========================================

  return (
    <div className="em-artist-selector">

      <div className="em-selector-heading">
        <label htmlFor={inputId}>
          {label}
        </label>

        <span>
          {selectedArtists.length}
          /{maxArtists} selected
        </span>
      </div>

      <p className="em-selector-description">
        {description}
      </p>

      {/* SELECTED ARTISTS */}

      {selectedArtists.length > 0 && (
        <div className="em-selector-selected">

          {selectedArtists.map(
            (artist) => (
              <div
                key={artist._id}
                className="em-selector-chip"
              >
                <ArtistAvatar
                  artist={artist}
                />

                <span>
                  {artist.stageName}
                </span>

                {artist.verified && (
                  <BadgeCheck
                    size={15}
                    className="em-selector-verified"
                  />
                )}

                {!disabled && (
                  <button
                    type="button"
                    aria-label={
                      `Remove ${artist.stageName}`
                    }
                    onClick={() =>
                      removeArtist(
                        artist._id
                      )
                    }
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            )
          )}
        </div>
      )}

      {/* SEARCH INPUT */}

      {!disabled && (
        <>
          <div className="em-selector-search">
            <Search size={19} />

            <input
              id={inputId}
              type="search"
              value={query}
              maxLength={100}
              disabled={limitReached}
              placeholder={
                limitReached
                  ? "Artist limit reached"
                  : "Search by artist stage name..."
              }
              autoComplete="off"
              onChange={(event) =>
                setQuery(
                  event.target.value
                )
              }
            />

            {loading && (
              <LoaderCircle
                size={18}
                className="em-selector-spinner"
              />
            )}
          </div>

          {/* SEARCH STATUS */}

          <div aria-live="polite">
            {error && (
              <p className="em-selector-error">
                {error}
              </p>
            )}

            {trimmedQuery.length === 1 && (
              <p className="em-selector-hint">
                Enter at least two characters.
              </p>
            )}

            {loading && (
              <p className="em-selector-hint">
                Searching artists...
              </p>
            )}

            {!loading &&
              !error &&
              trimmedQuery.length >= 2 &&
              visibleResults.length === 0 && (
                <p className="em-selector-hint">
                  No matching artists found.
                </p>
              )}
          </div>

          {/* SEARCH RESULTS */}

          {!loading &&
            visibleResults.length > 0 && (
              <div className="em-selector-results">

                {visibleResults.map(
                  (artist) => {
                    const selected =
                      selectedArtists.some(
                        (item) =>
                          item._id ===
                          artist._id
                      );

                    return (
                      <div
                        key={artist._id}
                        className="em-selector-result"
                      >
                        <ArtistAvatar
                          artist={artist}
                        />

                        <div className="em-selector-info">
                          <strong>
                            {artist.stageName}

                            {artist.verified && (
                              <BadgeCheck
                                size={16}
                                className="em-selector-verified"
                              />
                            )}
                          </strong>

                          <small>
                            {artist.country ||
                              "Emnet Music artist"}
                          </small>
                        </div>

                        <button
                          type="button"
                          className="em-selector-add"
                          disabled={
                            selected ||
                            limitReached
                          }
                          onClick={() =>
                            addArtist(
                              artist
                            )
                          }
                        >
                          {selected ? (
                            <>
                              <Check size={15} />
                              Added
                            </>
                          ) : (
                            <>
                              <Plus size={15} />
                              Add
                            </>
                          )}
                        </button>
                      </div>
                    );
                  }
                )}
              </div>
            )}
        </>
      )}

      {disabled &&
        selectedArtists.length === 0 && (
          <p className="em-selector-hint">
            No additional artists.
          </p>
        )}
    </div>
  );
}
