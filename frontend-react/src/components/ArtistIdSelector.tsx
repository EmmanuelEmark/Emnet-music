
import {
  useEffect,
  useState,
} from "react";

import ArtistSelector from "./ArtistSelector";

import {
  resolveSelectedArtists,
  type SelectableArtist,
} from "../services/artistSelectionApi";

type Props = {
  label?: string;
  description?: string;

  ids: string[];

  onChange: (ids: string[]) => void;

  excludedArtistIds?: string[];

  disabled?: boolean;

  maxArtists?: number;
};

export default function ArtistIdSelector({
  label,
  description,
  ids,
  onChange,
  excludedArtistIds,
  disabled = false,
  maxArtists = 10,
}: Props) {
  const [artists, setArtists] =
    useState<SelectableArtist[]>([]);

  const [error, setError] =
    useState("");

  const [retry, setRetry] =
    useState(0);

  const selectionKey = ids.join(",");

  useEffect(() => {
    const selectedIds = selectionKey
      .split(",")
      .filter(Boolean);

    if (selectedIds.length === 0) {
      setArtists([]);
      setError("");
      return;
    }

    const controller =
      new AbortController();

    setError("");

    async function loadArtists() {
      try {
        const result =
          await resolveSelectedArtists(
            selectedIds,
            controller.signal
          );

        if (!controller.signal.aborted) {
          setArtists(result);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load artists."
          );
        }
      }
    }

    void loadArtists();

    return () => {
      controller.abort();
    };
  }, [selectionKey, retry]);

  // Preserve selected IDs even when an
  // artist profile is no longer available.

  const selectedArtists = ids.map(
    (id) =>
      artists.find(
        (artist) => artist._id === id
      ) || {
        _id: id,
        stageName: "Artist unavailable",
      }
  );

  return (
    <div>
      {error && (
        <div className="em-selector-error">
          <p>{error}</p>

          <button
            type="button"
            className="em-selector-add"
            onClick={() =>
              setRetry((value) => value + 1)
            }
          >
            Retry
          </button>
        </div>
      )}

      <ArtistSelector
        label={label}
        description={description}
        selectedArtists={selectedArtists}
        excludedArtistIds={excludedArtistIds}
        disabled={disabled}
        maxArtists={maxArtists}
        onChange={(selected) => {
          setArtists(selected);

          onChange(
            selected.map(
              (artist) => artist._id
            )
          );
        }}
      />
    </div>
  );
}
