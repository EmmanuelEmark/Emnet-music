const Playlist = require("../models/Playlist");
const Song = require("../models/song");


const createPlaylist = async (req, res) => {
  try {
    const {
      name,
      description,
      isPublic,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Playlist name is required.",
      });
    }

    const playlist = await Playlist.create({
      userId: req.user._id,
      name: name.trim(),
      description: description || "",
      isPublic: isPublic || false,
      songs: [],
    });

    return res.status(201).json({
      success: true,
      message: "Playlist created successfully.",
      playlist,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const getMyPlaylists = async (req, res) => {
  try {
    const playlists = await Playlist.find({
      userId: req.user._id,
    })
      .sort({ createdAt: -1 })
      .populate({
        path: "songs",
        match: {
  status: "approved",
  visibilityStatus: "visible",
},
        populate: [
          {
            path: "primaryArtists",
            select: "stageName profileImage verified",
          },
          {
            path: "featuredArtists",
            select: "stageName profileImage verified",
          },
          {
            path: "releaseId",
            select:
              "title releaseType coverImage releaseDate status",
          },
        ],
      });


      const availablePlaylists = playlists.map((playlist) => {
  const data = playlist.toObject();

  data.songs = data.songs.filter(
    (song) =>
      song &&
      song.releaseId &&
      song.releaseId.status === "approved"
  );

  return data;
});


    return res.status(200).json({
  success: true,
  playlists: availablePlaylists,
});
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const getMyPlaylistById = async (req, res) => {
  try {
    const { playlistId } = req.params;

    const playlist = await Playlist.findOne({
      _id: playlistId,
      userId: req.user._id,
    }).populate({
      path: "songs",
      match: {
  status: "approved",
  visibilityStatus: "visible",
},
      populate: [
        {
          path: "primaryArtists",
          select: "stageName profileImage verified",
        },
        {
          path: "featuredArtists",
          select: "stageName profileImage verified",
        },
        {
          path: "releaseId",
          select:
            "title releaseType coverImage releaseDate status",
        },
      ],
    });

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist not found.",
      });
    }


    const availablePlaylist = playlist.toObject();

availablePlaylist.songs = availablePlaylist.songs.filter(
  (song) =>
    song &&
    song.releaseId &&
    song.releaseId.status === "approved"
);


   return res.status(200).json({
  success: true,
  playlist: availablePlaylist,
});

  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const addSongToPlaylist = async (req, res) => {
  try {
    const {
      playlistId,
      songId,
    } = req.params;

    const playlist = await Playlist.findOne({
      _id: playlistId,
      userId: req.user._id,
    });

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist not found.",
      });
    }

const song = await Song.findOne({
  _id: songId,
  status: "approved",
  visibilityStatus: "visible",
}).populate({
  path: "releaseId",
  select: "status",
});

if (
  !song ||
  !song.releaseId ||
  song.releaseId.status !== "approved"
) {
  return res.status(404).json({
    success: false,
    message: "Song is not available.",
  });
}

    
    const alreadyExists = playlist.songs.some(
      (id) => id.toString() === songId
    );

    if (alreadyExists) {
      return res.status(400).json({
        success: false,
        message: "Song is already in this playlist.",
      });
    }

    playlist.songs.push(songId);

    await playlist.save();

    return res.status(200).json({
      success: true,
      message: "Song added to playlist.",
      playlist,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const removeSongFromPlaylist = async (req, res) => {
  try {
    const {
      playlistId,
      songId,
    } = req.params;

    const playlist = await Playlist.findOne({
      _id: playlistId,
      userId: req.user._id,
    });

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist not found.",
      });
    }

    const exists = playlist.songs.some(
      (id) => id.toString() === songId
    );

    if (!exists) {
      return res.status(404).json({
        success: false,
        message: "Song is not in this playlist.",
      });
    }

    playlist.songs = playlist.songs.filter(
      (id) => id.toString() !== songId
    );

    await playlist.save();

    return res.status(200).json({
      success: true,
      message: "Song removed from playlist.",
      playlist,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const updatePlaylist = async (req, res) => {
  try {
    const { playlistId } = req.params;

    const {
      name,
      description,
      isPublic,
    } = req.body;

    const playlist = await Playlist.findOne({
      _id: playlistId,
      userId: req.user._id,
    });

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist not found.",
      });
    }

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Playlist name cannot be empty.",
        });
      }

      playlist.name = name.trim();
    }

    if (description !== undefined) {
      playlist.description = description;
    }

    if (isPublic !== undefined) {
      playlist.isPublic = isPublic;
    }

    await playlist.save();

    return res.status(200).json({
      success: true,
      message: "Playlist updated successfully.",
      playlist,
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


const deletePlaylist = async (req, res) => {
  try {
    const { playlistId } = req.params;

    const playlist = await Playlist.findOneAndDelete({
      _id: playlistId,
      userId: req.user._id,
    });

    if (!playlist) {
      return res.status(404).json({
        success: false,
        message: "Playlist not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Playlist deleted successfully.",
    });
  } catch (error) {
    console.error(error.message);

    return res.status(500).json({
      success: false,
      message: "Server error.",
    });
  }
};


module.exports = {
  createPlaylist,
  getMyPlaylists,
  getMyPlaylistById,
  addSongToPlaylist,
  removeSongFromPlaylist,
  updatePlaylist,
  deletePlaylist,
};