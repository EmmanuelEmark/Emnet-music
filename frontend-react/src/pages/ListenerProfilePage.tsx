
import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { Link } from "react-router";

import {
  ArrowRight,
  Bell,
  CalendarDays,
  Camera,
  CheckCircle2,
  CircleUserRound,
  Disc3,
  Heart,
  LockKeyhole,
  LogOut,
  Mail,
  Pencil,
  RefreshCcw,
  Save,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

import {
  getMyAccount,
  updateMyProfile,
  changeMyPassword,
  updateMyEmailPreferences,
  type ListenerAccount,
  type EmailPreferences,
} from "../services/profileApi";

import {
  uploadListenerAvatar,
  validateAvatarFile,
} from "../services/listenerAvatarApi";

import "./ListenerProfilePage.css";

// ========================================
// API CONFIGURATION
// ========================================

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

// ========================================
// HELPERS
// ========================================

function getProfileImageUrl(path: string): string {
  if (!path) return "";

  if (
    path.startsWith("/") &&
    !path.startsWith("//")
  ) {
    return `${API_BASE_URL}${path}`;
  }

  return path;
}

function formatAccountDate(value: string): string {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatBirthday(value: string): string {
  if (!value) return "Not provided";

  const date = new Date(
    `${value}T12:00:00.000Z`
  );

  if (Number.isNaN(date.getTime())) {
    return "Not provided";
  }

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function validateBirthday(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(
    `${value}T00:00:00.000Z`
  );

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    date.getTime() <= Date.now()
  );
}

// ========================================
// LISTENER PROFILE PAGE
// ========================================

export default function ListenerProfilePage() {
  const {
    user,
    logout,
    refreshUser,
  } = useAuth();

  // ========================================
  // ACCOUNT DATA
  // ========================================

  const [account, setAccount] =
    useState<ListenerAccount | null>(null);

  const [loading, setLoading] = useState(true);

  const [loadError, setLoadError] = useState("");

  const [retry, setRetry] = useState(0);

  // ========================================
  // PAGE MODE
  // ========================================

  const [isEditing, setIsEditing] =
    useState(false);

  const [isSaving, setIsSaving] =
    useState(false);

  const [successMessage, setSuccessMessage] =
    useState("");

  const [errorMessage, setErrorMessage] =
    useState("");

  // ========================================
  // PERSONAL INFORMATION
  // ========================================

  const [fullName, setFullName] =
    useState("");

  const [dateOfBirth, setDateOfBirth] =
    useState("");

  // ========================================
  // PROFILE PICTURE
  // ========================================

  const [selectedPhoto, setSelectedPhoto] =
    useState<File | null>(null);

  const [photoPreview, setPhotoPreview] =
    useState("");

  const [photoError, setPhotoError] =
    useState(false);

  // ========================================
  // PASSWORD
  // ========================================

  const [currentPassword, setCurrentPassword] =
    useState("");

  const [newPassword, setNewPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  // ========================================
  // EMAIL PREFERENCES
  // ========================================

  const [emailPreferences, setEmailPreferences] =
    useState<EmailPreferences>({
      birthdayGreetings: false,
      monthlyGreetings: false,
    });

  // ========================================
  // LOAD ACCOUNT ON PAGE OPEN
  // ========================================

  useEffect(() => {
    let active = true;

    async function loadAccount() {
      try {
        setLoading(true);
        setLoadError("");

        const result = await getMyAccount();

        if (!active) return;

        if (result.role !== "listener") {
          throw new Error(
            "This profile page is for listeners only."
          );
        }

        setAccount(result);

        setFullName(result.fullName);
        setDateOfBirth(result.dateOfBirth);

        setEmailPreferences(
          result.emailPreferences
        );
      } catch (error) {
        if (!active) return;

        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load your profile."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadAccount();

    return () => {
      active = false;
    };
  }, [retry]);

  // ========================================
  // CREATE PHOTO PREVIEW
  // ========================================

  useEffect(() => {
    if (!selectedPhoto) {
      setPhotoPreview("");
      return;
    }

    const previewUrl =
      URL.createObjectURL(selectedPhoto);

    setPhotoPreview(previewUrl);

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [selectedPhoto]);

  // ========================================
  // OPEN EDIT PROFILE
  // ========================================

  function openEditProfile() {
    if (!account) return;

    setFullName(account.fullName);

    setDateOfBirth(account.dateOfBirth);

    setEmailPreferences({
      ...account.emailPreferences,
    });

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");

    setSelectedPhoto(null);
    setPhotoPreview("");
    setPhotoError(false);

    setSuccessMessage("");
    setErrorMessage("");

    setIsEditing(true);
  }

  // ========================================
  // CANCEL EDITING
  // ========================================

  function cancelEditing() {
    if (isSaving) return;

    setSelectedPhoto(null);
    setPhotoPreview("");

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");

    setErrorMessage("");

    setIsEditing(false);
  }

  // ========================================
  // SELECT PROFILE PICTURE
  // ========================================

  function handlePhotoSelection(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    // Allow selecting the same file again.
    event.target.value = "";

    if (!file) return;

    try {
      validateAvatarFile(file);

      setSelectedPhoto(file);
      setPhotoError(false);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Invalid image selected."
      );
    }
  }

  // ========================================
  // SAVE CHANGES
  // ========================================

  async function handleSaveChanges(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!account || isSaving) return;

    setErrorMessage("");
    setSuccessMessage("");

    const cleanedName = fullName.trim();

    // Validate full name.
    if (
      !cleanedName ||
      cleanedName.length > 100
    ) {
      setErrorMessage(
        "Please enter a valid full name."
      );
      return;
    }

    // Date of birth is required by User.js.
    if (!validateBirthday(dateOfBirth)) {
      setErrorMessage(
        "Please enter a valid date of birth."
      );
      return;
    }

    // Check whether a password change was requested.
    const wantsPasswordChange = Boolean(
      currentPassword ||
      newPassword ||
      confirmPassword
    );

    if (wantsPasswordChange) {
      if (
        !currentPassword ||
        !newPassword ||
        !confirmPassword
      ) {
        setErrorMessage(
          "Complete all three password fields."
        );
        return;
      }

      if (newPassword.length < 8) {
        setErrorMessage(
          "New password must contain at least 8 characters."
        );
        return;
      }

      if (
        new TextEncoder().encode(
          newPassword
        ).length > 72
      ) {
        setErrorMessage(
          "New password must be 72 bytes or fewer."
        );
        return;
      }

      if (newPassword !== confirmPassword) {
        setErrorMessage(
          "New password and confirmation do not match."
        );
        return;
      }

      if (newPassword === currentPassword) {
        setErrorMessage(
          "Choose a different password."
        );
        return;
      }
    }

    // Determine which sections actually changed.
    const personalInformationChanged =
      cleanedName !== account.fullName ||
      dateOfBirth !== account.dateOfBirth;

    const preferencesChanged =
      emailPreferences.birthdayGreetings !==
        account.emailPreferences.birthdayGreetings ||
      emailPreferences.monthlyGreetings !==
        account.emailPreferences.monthlyGreetings;

    const changesCompleted: string[] = [];

    try {
      setIsSaving(true);

      // ======================================
      // 1. SAVE PERSONAL INFORMATION
      // ======================================

      if (personalInformationChanged) {
        await updateMyProfile({
          fullName: cleanedName,
          dateOfBirth,
        });

        changesCompleted.push(
          "Personal information"
        );
      }

      // ======================================
      // 2. SAVE EMAIL PREFERENCES
      // ======================================

      if (preferencesChanged) {
        await updateMyEmailPreferences(
          emailPreferences
        );

        changesCompleted.push(
          "Email preferences"
        );
      }

      // ======================================
      // 3. CHANGE PASSWORD
      // ======================================

      if (wantsPasswordChange) {
        await changeMyPassword(
          currentPassword,
          newPassword
        );

        changesCompleted.push("Password");

        // Never retain password fields after
        // a successful password update.
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }

      // ======================================
      // 4. UPLOAD PROFILE PICTURE
      // ======================================

      if (selectedPhoto) {
        await uploadListenerAvatar(
          selectedPhoto
        );

        changesCompleted.push(
          "Profile picture"
        );

        setSelectedPhoto(null);
      }

      // ======================================
      // 5. REFRESH PROFILE INFORMATION
      // ======================================

      const freshAccount = await getMyAccount();

      setAccount(freshAccount);

      setFullName(freshAccount.fullName);
      setDateOfBirth(freshAccount.dateOfBirth);

      setEmailPreferences(
        freshAccount.emailPreferences
      );

      setPhotoError(false);

      // Update user name and profile image
      // in the shared application header.
      await refreshUser();

      // Return to the normal Profile page.
      setIsEditing(false);

      setSuccessMessage(
        changesCompleted.length > 0
          ? `${changesCompleted.join(", ")} updated successfully.`
          : "No changes were made."
      );
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : "Unable to save your changes.";

      setErrorMessage(
        changesCompleted.length > 0
          ? `${changesCompleted.join(", ")} saved. However, another operation failed: ${reason}`
          : reason
      );

      // Synchronize saved changes in the form,
      // so retrying doesn't resend successful
      // account updates.
      try {
        const freshAccount =
          await getMyAccount();

        setAccount(freshAccount);

        if (
          changesCompleted.includes(
            "Profile picture"
          )
        ) {
          setSelectedPhoto(null);
        }

        if (
          changesCompleted.includes(
            "Password"
          )
        ) {
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
        }

        await refreshUser();
      } catch {
        // Keep the original error visible.
      }
    } finally {
      setIsSaving(false);
    }
  }

  // ========================================
  // LOADING STATE
  // ========================================

  if (loading) {
    return (
      <div className="page-content em-profile-page">
        <div className="em-profile-message">
          <Disc3
            size={36}
            className="spin"
          />

          <h2>Loading your profile...</h2>
        </div>
      </div>
    );
  }

  // ========================================
  // ERROR STATE
  // ========================================

  if (loadError || !account) {
    return (
      <div className="page-content em-profile-page">
        <div
          className="em-profile-message"
          role="alert"
        >
          <CircleUserRound size={42} />

          <h2>
            Unable to load your profile
          </h2>

          <p>
            {loadError ||
              "Your account information is unavailable."}
          </p>

          <button
            type="button"
            onClick={() =>
              setRetry((value) => value + 1)
            }
          >
            <RefreshCcw size={17} />
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ========================================
  // PROFILE IMAGE
  // ========================================

  const savedPhotoUrl =
    getProfileImageUrl(
      account.profileImage
    );

  const displayedPhoto =
    isEditing && photoPreview
      ? photoPreview
      : savedPhotoUrl;

  // ========================================
  // PAGE
  // ========================================

  return (
    <div className="page-content em-profile-page">

      {/* ====================================
          PAGE HEADER
      ==================================== */}

      <div className="em-profile-heading">
        <span className="em-profile-eyebrow">
          <UserRound size={16} />
          YOUR EMNET MUSIC ACCOUNT
        </span>

        <h1>
          {isEditing
            ? "Edit profile"
            : "My profile"}
        </h1>

        <p>
          {isEditing
            ? "Update your account information, picture, security and preferences."
            : "Your music, your account, your world."}
        </p>
      </div>

      {/* ====================================
          PROFILE HERO
      ==================================== */}

      <section className="em-profile-hero">
        <div className="em-profile-avatar">
          {displayedPhoto && !photoError ? (
            <img
              src={displayedPhoto}
              alt={`${account.fullName} profile`}
              onError={() =>
                setPhotoError(true)
              }
            />
          ) : (
            <UserRound size={46} />
          )}
        </div>

        <div className="em-profile-hero-info">
          <span className="em-profile-role">
            Music listener
          </span>

          <h2>
            {isEditing
              ? fullName || account.fullName
              : account.fullName ||
                user?.fullName}
          </h2>

          <p>{account.email}</p>

          <span className="em-profile-verification">
            {account.emailVerified ? (
              <>
                <CheckCircle2 size={15} />
                Verified email
              </>
            ) : (
              <>
                <Mail size={15} />
                Email not verified
              </>
            )}
          </span>
        </div>
      </section>

      {/* ====================================
          VIEW PROFILE
      ==================================== */}

      {!isEditing && (
        <>
          <section className="em-profile-panel">
            <div className="em-profile-panel-heading">
              <CircleUserRound size={23} />

              <div>
                <h2>
                  Profile information
                </h2>

                <p>
                  Your account details on
                  Emnet Music.
                </p>
              </div>
            </div>

            <div className="em-profile-view-grid">

              <div>
                <span>Full name</span>
                <strong>
                  {account.fullName}
                </strong>
              </div>

              <div>
                <span>Email address</span>
                <strong>
                  {account.email}
                </strong>
              </div>

              <div>
                <span>Date of birth</span>
                <strong>
                  {formatBirthday(
                    account.dateOfBirth
                  )}
                </strong>
              </div>

              <div>
                <span>Account type</span>
                <strong>
                  Listener
                </strong>
              </div>

              <div>
                <span>Member since</span>
                <strong>
                  {formatAccountDate(
                    account.createdAt
                  )}
                </strong>
              </div>

              <div>
                <span>Account status</span>
                <strong>
                  {account.accountStatus ||
                    "Not available"}
                </strong>
              </div>
            </div>

            <button
              type="button"
              className="em-profile-primary-button em-profile-edit-open"
              onClick={openEditProfile}
            >
              <Pencil size={18} />
              Edit profile
            </button>
          </section>

          {/* MUSIC LIBRARY LINKS */}

          <section className="em-profile-quick-links">
            <Link to="/library">
              <Heart size={23} />

              <span>
                <strong>
                  Liked songs
                </strong>

                <small>
                  Your favourite tracks
                </small>
              </span>

              <ArrowRight size={18} />
            </Link>

            <Link to="/library">
              <Disc3 size={23} />

              <span>
                <strong>
                  My playlists
                </strong>

                <small>
                  Your music collections
                </small>
              </span>

              <ArrowRight size={18} />
            </Link>

            <Link to="/library">
              <UserRound size={23} />

              <span>
                <strong>
                  Following
                </strong>

                <small>
                  Artists you follow
                </small>
              </span>

              <ArrowRight size={18} />
            </Link>
          </section>

          {/* SUCCESS MESSAGE */}

          {successMessage && (
            <p
              className="em-profile-success"
              role="status"
            >
              <CheckCircle2 size={18} />
              {successMessage}
            </p>
          )}

          {/* LOGOUT */}

          <button
            type="button"
            className="em-profile-logout"
            onClick={logout}
          >
            <LogOut size={19} />
            Log out of Emnet Music
          </button>
        </>
      )}

      {/* ====================================
          EDIT PROFILE
      ==================================== */}

      {isEditing && (
        <form
          onSubmit={handleSaveChanges}
          noValidate
        >

          {/* PROFILE PICTURE */}

          <section className="em-profile-panel">
            <div className="em-profile-panel-heading">
              <Camera size={23} />

              <div>
                <h2>
                  Profile picture
                </h2>

                <p>
                  Choose a picture directly
                  from your device.
                </p>
              </div>
            </div>

            <label className="em-profile-upload">
              <Camera size={19} />

              {selectedPhoto
                ? "Change selected photo"
                : "Choose profile picture"}

              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                onChange={
                  handlePhotoSelection
                }
                disabled={isSaving}
              />
            </label>

            {selectedPhoto && (
              <p className="em-profile-photo-note">
                Selected: {selectedPhoto.name}
              </p>
            )}

            <p className="em-profile-photo-note">
              JPG, PNG or WebP.
              Maximum file size: 5 MB.
            </p>
          </section>

          {/* PERSONAL INFORMATION */}

          <section className="em-profile-panel">
            <div className="em-profile-panel-heading">
              <UserRound size={23} />

              <div>
                <h2>
                  Personal information
                </h2>

                <p>
                  Change your name and
                  date of birth.
                </p>
              </div>
            </div>

            <div className="em-profile-form-grid">

              <label>
                Full name

                <input
                  type="text"
                  value={fullName}
                  maxLength={100}
                  onChange={(event) =>
                    setFullName(
                      event.target.value
                    )
                  }
                  disabled={isSaving}
                  required
                />
              </label>

              <label>
                Email address

                <input
                  type="email"
                  value={account.email}
                  readOnly
                  disabled
                />

                <small>
                  Email changes are not
                  available yet.
                </small>
              </label>

              <label>
                Date of birth

                <input
                  type="date"
                  value={dateOfBirth}
                  max={
                    new Date()
                      .toISOString()
                      .slice(0, 10)
                  }
                  onChange={(event) =>
                    setDateOfBirth(
                      event.target.value
                    )
                  }
                  disabled={isSaving}
                  required
                />
              </label>
            </div>
          </section>

          {/* CHANGE PASSWORD */}

          <section className="em-profile-panel">
            <div className="em-profile-panel-heading">
              <LockKeyhole size={23} />

              <div>
                <h2>
                  Change password
                </h2>

                <p>
                  Only complete this section
                  when you want a new password.
                </p>
              </div>
            </div>

            <div className="em-profile-form-grid">

              <label>
                Current password

                <input
                  type="password"
                  autoComplete="current-password"
                  value={
                    currentPassword
                  }
                  onChange={(event) =>
                    setCurrentPassword(
                      event.target.value
                    )
                  }
                  disabled={isSaving}
                />
              </label>

              <label>
                New password

                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(event) =>
                    setNewPassword(
                      event.target.value
                    )
                  }
                  disabled={isSaving}
                />
              </label>

              <label>
                Confirm new password

                <input
                  type="password"
                  autoComplete="new-password"
                  value={
                    confirmPassword
                  }
                  onChange={(event) =>
                    setConfirmPassword(
                      event.target.value
                    )
                  }
                  disabled={isSaving}
                />
              </label>
            </div>

            <p className="em-profile-helper">
              <ShieldCheck size={16} />
              Your new password must be
              at least 8 characters.
            </p>
          </section>

          {/* EMAIL PREFERENCES */}

          <section className="em-profile-panel">
            <div className="em-profile-panel-heading">
              <Bell size={23} />

              <div>
                <h2>
                  Email preferences
                </h2>

                <p>
                  Choose which greeting
                  emails you receive.
                </p>
              </div>
            </div>

            <div className="em-profile-preference">
              <div>
                <strong>
                  <CalendarDays size={18} />
                  Birthday greetings
                </strong>

                <p>
                  Receive a birthday greeting
                  from Emnet Music.
                </p>
              </div>

              <label className="em-profile-switch">
                <input
                  type="checkbox"
                  checked={
                    emailPreferences
                      .birthdayGreetings
                  }
                  onChange={(event) =>
                    setEmailPreferences(
                      (previous) => ({
                        ...previous,
                        birthdayGreetings:
                          event.target.checked,
                      })
                    )
                  }
                  disabled={isSaving}
                  aria-label="Birthday greeting emails"
                />

                <span />
              </label>
            </div>

            <div className="em-profile-preference">
              <div>
                <strong>
                  <Mail size={18} />
                  Monthly greetings
                </strong>

                <p>
                  Receive new-month greetings
                  from Emnet Music.
                </p>
              </div>

              <label className="em-profile-switch">
                <input
                  type="checkbox"
                  checked={
                    emailPreferences
                      .monthlyGreetings
                  }
                  onChange={(event) =>
                    setEmailPreferences(
                      (previous) => ({
                        ...previous,
                        monthlyGreetings:
                          event.target.checked,
                      })
                    )
                  }
                  disabled={isSaving}
                  aria-label="Monthly greeting emails"
                />

                <span />
              </label>
            </div>
          </section>

          {/* ERROR */}

          {errorMessage && (
            <p
              className="em-profile-error"
              role="alert"
            >
              {errorMessage}
            </p>
          )}

          {/* EDIT ACTIONS */}

          <div className="em-profile-edit-actions">
            <button
              type="button"
              className="em-profile-cancel"
              onClick={cancelEditing}
              disabled={isSaving}
            >
              <X size={18} />
              Cancel
            </button>

            <button
              type="submit"
              className="em-profile-primary-button"
              disabled={isSaving}
            >
              <Save size={18} />

              {isSaving
                ? "Saving changes..."
                : "Save changes"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
