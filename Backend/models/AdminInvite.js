const mongoose =
  require("mongoose");


const adminInviteSchema =
  new mongoose.Schema(
    {
      fullName: {
        type: String,
        required: true,
        trim: true,
      },


      email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
      },


      tokenHash: {
        type: String,
        required: true,
        unique: true,
      },


      expiresAt: {
        type: Date,
        required: true,
      },


      used: {
        type: Boolean,
        default: false,
      },


      usedAt: {
        type: Date,
        default: null,
      },


      createdBy: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref: "User",

        required: true,
      },
    },
    {
      timestamps: true,
    }
  );


const AdminInvite =
  mongoose.models.AdminInvite ||
  mongoose.model(
    "AdminInvite",
    adminInviteSchema
  );


module.exports =
  AdminInvite;