
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

import { Link } from "react-router";

import {
  ArrowLeft,
  CheckCircle2,
  Disc3,
  Heart,
  ListMusic,
  Lock,
  Music2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

import {
  getLikedSongs,
  getFollowedArtists,
  getPlaylists,
  getPlaylist,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
  unlikeSong,
  unfollowArtist,
  addSongToPlaylist,
  removeSongFromPlaylist,
  type LibrarySong,
  type FollowedArtist,
  type Playlist,
  type PlaylistInput,
} from "../services/libraryApi";

import "./LibraryPage.css";

type Tab = "likes" | "playlists" | "artists";

type Props = {
  onPlay: (song: LibrarySong) => void;
  currentSongId?: string;
  isPlaying: boolean;
};

function SongArtwork({
  song,
}: {
  song: LibrarySong;
}) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [song.cover]);

  return (
    <div className="lib-artwork">
      {song.cover && !broken ? (
        <img
          src={song.cover}
          alt={`${song.title} artwork`}
          onError={() => setBroken(true)}
          loading="lazy"
        />
      ) : (
        <Music2 size={25} />
      )}
    </div>
  );
}

function ArtistArtwork({
  artist,
}: {
  artist: FollowedArtist;
}) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [artist.profileImage]);

  return (
    <div className="lib-artist-art">
      {artist.profileImage && !broken ? (
        <img
          src={artist.profileImage}
          alt={artist.stageName}
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <UserRound size={28} />
      )}
    </div>
  );
}

export default function LibraryPage({
  onPlay,
  currentSongId,
  isPlaying,
}: Props) {
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>("likes");

  const [likedSongs, setLikedSongs] =
    useState<LibrarySong[]>([]);

  const [artists, setArtists] =
    useState<FollowedArtist[]>([]);

  const [playlists, setPlaylists] =
    useState<Playlist[]>([]);

  const [selectedPlaylist, setSelectedPlaylist] =
    useState<Playlist | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [form, setForm] = useState<PlaylistInput>({
    name: "",
    description: "",
    isPublic: false,
  });

  const [addingSongId, setAddingSongId] =
    useState<string | null>(null);

  const loadLibrary = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [likes, follows, lists] = await Promise.all([
        getLikedSongs(),
        getFollowedArtists(),
        getPlaylists(),
      ]);

      setLikedSongs(likes);
      setArtists(follows);
      setPlaylists(lists);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load your Library."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  async function reloadPlaylists(
    selectedId?: string
  ) {
    const lists = await getPlaylists();
    setPlaylists(lists);

    if (selectedId) {
      const detail = await getPlaylist(selectedId);
      setSelectedPlaylist(detail);
    }
  }

  function clearMessages() {
    setError("");
    setNotice("");
  }

  function startCreate() {
    clearMessages();
    setEditingId(null);
    setForm({
      name: "",
      description: "",
      isPublic: false,
    });
    setShowForm(true);
  }

  function startEdit(playlist: Playlist) {
    clearMessages();
    setEditingId(playlist.id);
    setForm({
      name: playlist.name,
      description: playlist.description,
      isPublic: playlist.isPublic,
    });
    setShowForm(true);
  }

  async function savePlaylist(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    clearMessages();

    if (!form.name.trim()) {
      setError("Playlist name is required.");
      return;
    }

    try {
      setBusy(true);

      const input = {
        ...form,
        name: form.name.trim(),
      };

      if (editingId) {
        await updatePlaylist(editingId, input);
        await reloadPlaylists(editingId);
        setNotice("Playlist updated successfully.");
      } else {
        await createPlaylist(input);
        await reloadPlaylists();
        setNotice("Playlist created successfully.");
      }

      setShowForm(false);
      setEditingId(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save playlist."
      );
    } finally {
      setBusy(false);
    }
  }

  async function openPlaylist(playlist: Playlist) {
    clearMessages();

    try {
      setBusy(true);
      const detail = await getPlaylist(playlist.id);
      setSelectedPlaylist(detail);
      setAddingSongId(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to open playlist."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDeletePlaylist(
    playlist: Playlist
  ) {
    const confirmed = window.confirm(
      `Delete "${playlist.name}"? This cannot be undone.`
    );

    if (!confirmed) return;

    clearMessages();

    try {
      setBusy(true);
      await deletePlaylist(playlist.id);
      setSelectedPlaylist(null);
      setShowForm(false);
      await reloadPlaylists();
      setNotice("Playlist deleted.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to delete playlist."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlike(songId: string) {
    clearMessages();

    try {
      setBusy(true);
      await unlikeSong(songId);
      setLikedSongs((previous) =>
        previous.filter((song) => song.id !== songId)
      );
      setNotice("Song removed from Liked Songs.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to unlike song."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleUnfollow(artistId: string) {
    clearMessages();

    try {
      setBusy(true);
      await unfollowArtist(artistId);
      setArtists((previous) =>
        previous.filter(
          (artist) => artist.id !== artistId
        )
      );
      setNotice("Artist unfollowed.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to unfollow artist."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleAddSong(songId: string) {
    if (!selectedPlaylist) return;

    clearMessages();

    try {
      setBusy(true);

      await addSongToPlaylist(
        selectedPlaylist.id,
        songId
      );

      await reloadPlaylists(selectedPlaylist.id);
      setAddingSongId(null);
      setNotice("Song added to playlist.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to add song."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveSong(songId: string) {
    if (!selectedPlaylist) return;

    clearMessages();

    try {
      setBusy(true);

      await removeSongFromPlaylist(
        selectedPlaylist.id,
        songId
      );

      await reloadPlaylists(selectedPlaylist.id);
      setNotice("Song removed from playlist.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to remove song."
      );
    } finally {
      setBusy(false);
    }
  }

  function songRow(
    song: LibrarySong,
    action: "unlike" | "remove" | "none"
  ) {
    const active =
      currentSongId === song.id && isPlaying;

    return (
      <div className="lib-song-row" key={song.id}>
        <SongArtwork song={song} />

        <div className="lib-song-details">
          <strong>{song.title}</strong>
          <span>{song.artist}</span>
        </div>

        <span className="lib-song-genre">
          {song.genre}
        </span>

        <button
          type="button"
          className="lib-play-btn"
          onClick={() => onPlay(song)}
          disabled={!song.audioUrl}
          aria-label={active ? "Pause song" : "Play song"}
          title={
            song.audioUrl
              ? "Play song"
              : "Audio unavailable"
          }
        >
          {active ? (
            <Pause size={18} fill="currentColor" />
          ) : (
            <Play size={18} fill="currentColor" />
          )}
        </button>

        {action !== "none" && (
          <button
            type="button"
            className="lib-icon-action"
            disabled={busy}
            onClick={() =>
              action === "unlike"
                ? void handleUnlike(song.id)
                : void handleRemoveSong(song.id)
            }
            aria-label={
              action === "unlike"
                ? "Unlike song"
                : "Remove from playlist"
            }
            title={
              action === "unlike"
                ? "Unlike song"
                : "Remove song"
            }
          >
            {action === "unlike" ? (
              <Heart size={19} fill="currentColor" />
            ) : (
              <X size={19} />
            )}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="page-content lib-page">
      <div className="lib-heading">
        <div>
          <span className="section-label">
            YOUR MUSIC COLLECTION
          </span>

          <h1>Your library</h1>

          <p>
            Welcome, {user?.fullName || "music lover"}.
            Everything you love, in one place.
          </p>
        </div>

        <button
          type="button"
          className="lib-refresh-btn"
          onClick={() => void loadLibrary()}
          disabled={loading || busy}
        >
          <RefreshCw size={17} />
          Refresh
        </button>
      </div>

      <div className="lib-stat-grid">
        <div className="lib-stat">
          <Heart size={21} />
          <strong>{likedSongs.length}</strong>
          <span>Liked songs</span>
        </div>

        <div className="lib-stat">
          <ListMusic size={21} />
          <strong>{playlists.length}</strong>
          <span>Playlists</span>
        </div>

        <div className="lib-stat">
          <Users size={21} />
          <strong>{artists.length}</strong>
          <span>Followed artists</span>
        </div>
      </div>

      <div className="lib-tabs">
        <button
          className={tab === "likes" ? "selected" : ""}
          onClick={() => {
            setTab("likes");
            setSelectedPlaylist(null);
            setShowForm(false);
          }}
          type="button"
        >
          <Heart size={17} /> Liked songs
        </button>

        <button
          className={tab === "playlists" ? "selected" : ""}
          onClick={() => setTab("playlists")}
          type="button"
        >
          <ListMusic size={17} /> Playlists
        </button>

        <button
          className={tab === "artists" ? "selected" : ""}
          onClick={() => {
            setTab("artists");
            setSelectedPlaylist(null);
            setShowForm(false);
          }}
          type="button"
        >
          <Users size={17} /> Artists
        </button>
      </div>

      {error && (
        <div className="lib-feedback lib-error" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="lib-feedback lib-success" role="status">
          <CheckCircle2 size={17} />
          {notice}
        </div>
      )}

      {loading ? (
        <div className="lib-empty">
          <Disc3 className="spin" size={30} />
          <h3>Loading your music...</h3>
        </div>
      ) : (
        <>
          {/* LIKED SONGS */}
          {tab === "likes" && (
            <section className="lib-section">
              <div className="lib-section-heading">
                <div>
                  <h2>Liked songs</h2>
                  <p>
                    Music you've saved to your collection.
                  </p>
                </div>
              </div>

              {likedSongs.length ? (
                <div className="lib-song-list">
                  {likedSongs.map((song) =>
                    songRow(song, "unlike")
                  )}
                </div>
              ) : (
                <div className="lib-empty">
                  <Heart size={36} />
                  <h3>No liked songs yet</h3>
                  <p>
                    Discover music and like songs to
                    see them here.
                  </p>
                  <Link to="/explore">
                    Explore music
                  </Link>
                </div>
              )}
            </section>
          )}

          {/* FOLLOWED ARTISTS */}
          {tab === "artists" && (
            <section className="lib-section">
              <div className="lib-section-heading">
                <div>
                  <h2>Followed artists</h2>
                  <p>
                    Artists whose music you enjoy.
                  </p>
                </div>
              </div>

              {artists.length ? (
                <div className="lib-artist-grid">
                  {artists.map((artist) => (
                    <div
                      className="lib-artist-card"
                      key={artist.id}
                    >
                      <ArtistArtwork artist={artist} />

                      <strong>
                        {artist.stageName}
                        {artist.verified && (
                          <CheckCircle2
                            size={15}
                            className="lib-verified"
                          />
                        )}
                      </strong>

                      <span>
                        {artist.followersCount.toLocaleString()}
                        {" "}followers
                      </span>

                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void handleUnfollow(artist.id)
                        }
                      >
                        Following · Unfollow
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="lib-empty">
                  <Users size={36} />
                  <h3>No followed artists yet</h3>
                  <p>
                    Artists you follow will appear here.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* PLAYLISTS */}
          {tab === "playlists" && (
            <section className="lib-section">
              <div className="lib-section-heading">
                <div>
                  {selectedPlaylist && (
                    <button
                      type="button"
                      className="lib-back-btn"
                      onClick={() => {
                        setSelectedPlaylist(null);
                        setAddingSongId(null);
                        setShowForm(false);
                      }}
                    >
                      <ArrowLeft size={17} />
                      All playlists
                    </button>
                  )}

                  <h2>
                    {selectedPlaylist
                      ? selectedPlaylist.name
                      : "My playlists"}
                  </h2>

                  <p>
                    {selectedPlaylist
                      ? selectedPlaylist.description ||
                        "Your personal collection of songs."
                      : "Create and organize your music."}
                  </p>
                </div>

                {!selectedPlaylist && (
                  <button
                    type="button"
                    className="lib-primary-btn"
                    onClick={startCreate}
                  >
                    <Plus size={17} />
                    New playlist
                  </button>
                )}
              </div>

              {showForm && (
                <form
                  className="lib-playlist-form"
                  onSubmit={(event) =>
                    void savePlaylist(event)
                  }
                >
                  <div className="lib-form-head">
                    <h3>
                      {editingId
                        ? "Edit playlist"
                        : "Create playlist"}
                    </h3>

                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      aria-label="Close form"
                    >
                      <X size={19} />
                    </button>
                  </div>

                  <label>
                    Playlist name
                    <input
                      type="text"
                      value={form.name}
                      maxLength={100}
                      required
                      onChange={(event) =>
                        setForm({
                          ...form,
                          name: event.target.value,
                        })
                      }
                      placeholder="My favourite songs"
                    />
                  </label>

                  <label>
                    Description
                    <textarea
                      value={form.description}
                      rows={3}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          description: event.target.value,
                        })
                      }
                      placeholder="Describe this playlist"
                    />
                  </label>

                  <label className="lib-check-label">
                    <input
                      type="checkbox"
                      checked={form.isPublic}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          isPublic: event.target.checked,
                        })
                      }
                    />
                    Make this playlist public
                  </label>

                  <button
                    type="submit"
                    className="lib-primary-btn"
                    disabled={busy}
                  >
                    <Save size={17} />
                    {busy
                      ? "Saving..."
                      : "Save playlist"}
                  </button>
                </form>
              )}

              {!selectedPlaylist && (
                <>
                  {playlists.length ? (
                    <div className="lib-playlist-grid">
                      {playlists.map((playlist) => (
                        <div
                          className="lib-playlist-card"
                          key={playlist.id}
                        >
                          <div className="lib-playlist-cover">
                            <ListMusic size={37} />
                          </div>

                          <div className="lib-playlist-info">
                            <strong>{playlist.name}</strong>
                            <span>
                              {playlist.songs.length} songs
                              {" · "}
                              {playlist.isPublic
                                ? "Public"
                                : "Private"}
                            </span>
                          </div>

                          <div className="lib-playlist-actions">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void openPlaylist(playlist)
                              }
                            >
                              Open
                            </button>

                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                startEdit(playlist)
                              }
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              className="lib-danger-btn"
                              disabled={busy}
                              onClick={() =>
                                void handleDeletePlaylist(
                                  playlist
                                )
                              }
                              aria-label="Delete playlist"
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="lib-empty">
                      <ListMusic size={36} />
                      <h3>Create your first playlist</h3>
                      <p>
                        Organize songs for every mood
                        and moment.
                      </p>
                      <button
                        className="lib-primary-btn"
                        type="button"
                        onClick={startCreate}
                      >
                        <Plus size={17} />
                        Create playlist
                      </button>
                    </div>
                  )}
                </>
              )}

              {selectedPlaylist && (
                <div className="lib-playlist-detail">
                  <div className="lib-detail-toolbar">
                    <span>
                      {selectedPlaylist.isPublic ? (
                        <Users size={16} />
                      ) : (
                        <Lock size={16} />
                      )}
                      {selectedPlaylist.isPublic
                        ? "Public playlist"
                        : "Private playlist"}
                    </span>

                    <button
                      type="button"
                      className="lib-primary-btn"
                      onClick={() =>
                        setAddingSongId(
                          addingSongId === "open"
                            ? null
                            : "open"
                        )
                      }
                    >
                      <Plus size={17} />
                      Add liked song
                    </button>
                  </div>

                  {addingSongId === "open" && (
                    <div className="lib-add-panel">
                      <h3>Select a liked song</h3>
                      {likedSongs.filter(
                        (song) =>
                          !selectedPlaylist.songs.some(
                            (existing) =>
                              existing.id === song.id
                          )
                      ).length ? (
                        likedSongs
                          .filter(
                            (song) =>
                              !selectedPlaylist.songs.some(
                                (existing) =>
                                  existing.id === song.id
                              )
                          )
                          .map((song) => (
                            <div
                              className="lib-add-row"
                              key={song.id}
                            >
                              <span>
                                {song.title}
                                <small>{song.artist}</small>
                              </span>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void handleAddSong(song.id)
                                }
                              >
                                <Plus size={16} />
                                Add
                              </button>
                            </div>
                          ))
                      ) : (
                        <p>
                          No additional liked songs
                          available to add.
                        </p>
                      )}
                    </div>
                  )}

                  {selectedPlaylist.songs.length ? (
                    <div className="lib-song-list">
                      {selectedPlaylist.songs.map((song) =>
                        songRow(song, "remove")
                      )}
                    </div>
                  ) : (
                    <div className="lib-empty">
                      <Disc3 size={36} />
                      <h3>This playlist is empty</h3>
                      <p>
                        Add a liked song to begin.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
