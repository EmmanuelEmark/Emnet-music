const crypto =
  require("crypto");

const jwt =
  require("jsonwebtoken");

const User =
  require("../models/User");

const AdminInvite =
  require("../models/AdminInvite");


/* ========================================
   CREATE TOKEN HASH
======================================== */

const hashInviteToken = (
  token
) => {

  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

};



/* ========================================
   CREATE ADMIN INVITATION
======================================== */

const createAdminInvitation =
  async (req, res) => {

    try {

      const {
        fullName,
        email,
      } = req.body;


      if (
        !fullName ||
        !email
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Full name and email are required.",
        });

      }


      const cleanName =
        fullName.trim();


      const cleanEmail =
        email
          .trim()
          .toLowerCase();


      if (!cleanName) {

        return res.status(400).json({
          success: false,
          message:
            "Full name is required.",
        });

      }


      const existingUser =
        await User.findOne({
          email: cleanEmail,
        });


      if (existingUser) {

        return res.status(400).json({
          success: false,
          message:
            "An account with this email already exists.",
        });

      }


      /*
        Remove previous unused invitations
        for the same email.

        This means creating a new invitation
        automatically invalidates the older one.
      */

      await AdminInvite.deleteMany({
        email: cleanEmail,
        used: false,
      });


      /*
        Generate a secure random token.
      */

      const inviteToken =
        crypto
          .randomBytes(32)
          .toString("hex");


      const tokenHash =
        hashInviteToken(
          inviteToken
        );


      /*
        Link expires exactly
        10 minutes from now.
      */

      const expiresAt =
        new Date(
          Date.now() +
          10 * 60 * 1000
        );


      const invitation =
        await AdminInvite.create({
          fullName:
            cleanName,

          email:
            cleanEmail,

          tokenHash,

          expiresAt,

          createdBy:
            req.user._id,
        });


      /*
        During development this becomes:

        http://localhost:3000/admin-signup?token=...

        Later FRONTEND_URL can be changed
        to your production domain.
      */

      const frontendUrl =
        process.env.FRONTEND_URL ||
        "http://localhost:3000";


      const invitationLink =
        `${frontendUrl}/admin-signup?token=${inviteToken}`;


      return res.status(201).json({
        success: true,

        message:
          "Admin invitation created successfully.",

        invitation: {
          id:
            invitation._id,

          fullName:
            invitation.fullName,

          email:
            invitation.email,

          expiresAt:
            invitation.expiresAt,

          used:
            invitation.used,

          invitationLink,
        },
      });


    } catch (error) {

      console.error(
        "Create admin invitation error:",
        error.message
      );


      return res.status(500).json({
        success: false,
        message:
          "Server error.",
      });

    }

  };



/* ========================================
   GET ADMIN INVITATIONS
======================================== */

const getAdminInvitations =
  async (req, res) => {

    try {

      const invitations =
        await AdminInvite
          .find()
          .select(
            "-tokenHash"
          )
          .populate(
            "createdBy",
            "fullName email"
          )
          .sort({
            createdAt: -1,
          });


      const now =
        new Date();


      const formatted =
        invitations.map(
          (invite) => {

            let status =
              "pending";


            if (invite.used) {

              status =
                "used";

            } else if (
              invite.expiresAt <= now
            ) {

              status =
                "expired";

            }


            return {
              id:
                invite._id,

              fullName:
                invite.fullName,

              email:
                invite.email,

              expiresAt:
                invite.expiresAt,

              used:
                invite.used,

              usedAt:
                invite.usedAt,

              createdAt:
                invite.createdAt,

              status,

              createdBy:
                invite.createdBy,
            };

          }
        );


      return res.status(200).json({
        success: true,
        invitations:
          formatted,
      });


    } catch (error) {

      console.error(
        "Get admin invitations error:",
        error.message
      );


      return res.status(500).json({
        success: false,
        message:
          "Server error.",
      });

    }

  };



/* ========================================
   VERIFY ADMIN INVITATION
======================================== */

const verifyAdminInvitation =
  async (req, res) => {

    try {

      const {
        token,
      } = req.params;


      if (!token) {

        return res.status(400).json({
          success: false,
          message:
            "Invitation token is required.",
        });

      }


      const tokenHash =
        hashInviteToken(
          token
        );


      const invitation =
        await AdminInvite.findOne({
          tokenHash,
        });


      if (!invitation) {

        return res.status(404).json({
          success: false,
          message:
            "Invalid invitation link.",
        });

      }


      if (invitation.used) {

        return res.status(400).json({
          success: false,
          message:
            "This invitation has already been used.",
        });

      }


      if (
        invitation.expiresAt <=
        new Date()
      ) {

        return res.status(410).json({
          success: false,
          message:
            "This invitation link has expired.",
        });

      }


      const existingUser =
        await User.findOne({
          email:
            invitation.email,
        });


      if (existingUser) {

        return res.status(400).json({
          success: false,
          message:
            "An account with this email already exists.",
        });

      }


      return res.status(200).json({
        success: true,

        message:
          "Invitation is valid.",

        invitation: {
          fullName:
            invitation.fullName,

          email:
            invitation.email,

          expiresAt:
            invitation.expiresAt,
        },
      });


    } catch (error) {

      console.error(
        "Verify admin invitation error:",
        error.message
      );


      return res.status(500).json({
        success: false,
        message:
          "Server error.",
      });

    }

  };



/* ========================================
   ACCEPT ADMIN INVITATION
======================================== */

const acceptAdminInvitation =
  async (req, res) => {

    try {

      const {
        token,
      } = req.params;


      const {
        password,
        dateOfBirth,
      } = req.body;


      if (
        !password ||
        !dateOfBirth
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Password and date of birth are required.",
        });

      }


      if (
        password.length < 8
      ) {

        return res.status(400).json({
          success: false,
          message:
            "Password must be at least 8 characters.",
        });

      }


      if (!token) {

        return res.status(400).json({
          success: false,
          message:
            "Invitation token is required.",
        });

      }


      const tokenHash =
        hashInviteToken(
          token
        );


      const invitation =
        await AdminInvite.findOne({
          tokenHash,
        });


      if (!invitation) {

        return res.status(404).json({
          success: false,
          message:
            "Invalid invitation link.",
        });

      }


      if (invitation.used) {

        return res.status(400).json({
          success: false,
          message:
            "This invitation has already been used.",
        });

      }


      if (
        invitation.expiresAt <=
        new Date()
      ) {

        return res.status(410).json({
          success: false,
          message:
            "This invitation link has expired.",
        });

      }


      const existingUser =
        await User.findOne({
          email:
            invitation.email,
        });


      if (existingUser) {

        return res.status(400).json({
          success: false,
          message:
            "An account with this email already exists.",
        });

      }


      /*
        Create the invited account
        directly as an admin.
      */

      const admin =
        new User({
          fullName:
            invitation.fullName,

          email:
            invitation.email,

          password,

          dateOfBirth,

          role:
            "admin",

          accountStatus:
            "active",
        });


      /*
        User.js will hash the password
        automatically in its pre-save hook.
      */

      await admin.save();


      /*
        Invitation can never be reused.
      */

      invitation.used =
        true;


      invitation.usedAt =
        new Date();


      await invitation.save();


      /*
        Automatically log in
        the newly-created admin.
      */

      const authToken =
        jwt.sign(
          {
            userId:
              admin._id,

            role:
              admin.role,
          },

          process.env.JWT_SECRET,

          {
            expiresIn: "7d",
          }
        );


      return res.status(201).json({
        success: true,

        message:
          "Admin account created successfully.",

        token:
          authToken,

        user: {
          id:
            admin._id,

          fullName:
            admin.fullName,

          email:
            admin.email,

          role:
            admin.role,

          emailVerified:
            admin.emailVerified,

          profileImage:
            admin.profileImage,
        },
      });


    } catch (error) {

      console.error(
        "Accept admin invitation error:",
        error.message
      );


      return res.status(500).json({
        success: false,
        message:
          "Server error.",
      });

    }

  };



module.exports = {
  createAdminInvitation,
  getAdminInvitations,
  verifyAdminInvitation,
  acceptAdminInvitation,
};