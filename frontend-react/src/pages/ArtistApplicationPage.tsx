
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

import { Link } from "react-router";

import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  Disc3,
  Globe2,
  Mic2,
  Music2,
  RefreshCcw,
  Send,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";

import {
  getArtistApplicationStatus,
  submitArtistApplication,
  type ArtistApplication,
} from "../services/artistApplicationApi";

import "./ArtistApplicationPage.css";

// ========================================
// HELPERS
// ========================================

function formatApplicationDate(value: string) {
  if (!value) return "Not available";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ========================================
// ARTIST APPLICATION PAGE
// ========================================

export default function ArtistApplicationPage() {
  // ======================================
  // FORM STATE
  // ======================================

  const [stageName, setStageName] = useState("");
  const [bio, setBio] = useState("");
  const [country, setCountry] = useState("");

  // ======================================
  // APPLICATION STATE
  // ======================================

  const [application, setApplication] =
    useState<ArtistApplication | null>(null);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] =
    useState("");

  // ======================================
  // LOAD APPLICATION STATUS
  // ======================================

  const loadApplication = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const result =
        await getArtistApplicationStatus();

      setApplication(result.application);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to check your application."
      );

      // Do not display an application form
      // until the duplicate check succeeds.
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const [statusChecked, setStatusChecked] =
    useState(false);

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const result =
          await getArtistApplicationStatus();

        if (!active) return;

        setApplication(result.application);
        setError("");
        setStatusChecked(true);
      } catch (err) {
        if (!active) return;

        setError(
          err instanceof Error
            ? err.message
            : "Unable to load your application status."
        );

        setStatusChecked(false);
      } finally {
        if (active) setLoading(false);
      }
    }

    void initialize();

    return () => {
      active = false;
    };
  }, []);

  async function retryStatus() {
    try {
      setStatusChecked(false);
      await loadApplication();
      setStatusChecked(true);
    } catch {
      setStatusChecked(false);
    }
  }

  // ======================================
  // SUBMIT APPLICATION
  // ======================================

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      submitting ||
      application ||
      !statusChecked
    ) {
      return;
    }

    setError("");
    setSuccessMessage("");

    const cleanedStageName = stageName.trim();
    const cleanedBio = bio.trim();
    const cleanedCountry = country.trim();

    // Validate stage name.
    if (
      cleanedStageName.length < 2 ||
      cleanedStageName.length > 100
    ) {
      setError(
        "Stage name must contain 2 to 100 characters."
      );
      return;
    }

    // Validate biography.
    if (cleanedBio.length > 500) {
      setError(
        "Your biography cannot exceed 500 characters."
      );
      return;
    }

    // Validate country.
    if (
      !cleanedCountry ||
      cleanedCountry.length > 100
    ) {
      setError(
        "Please enter a valid country."
      );
      return;
    }

    try {
      setSubmitting(true);

      const result =
        await submitArtistApplication({
          stageName: cleanedStageName,
          bio: cleanedBio,
          country: cleanedCountry,
        });

      setApplication(result);

      setSuccessMessage(
        "Your artist application has been submitted successfully."
      );
    } catch (err) {
      const reason =
        err instanceof Error
          ? err.message
          : "Unable to submit your application.";

      setError(reason);

      // If the server rejected a duplicate,
      // refresh the status to show the
      // previously submitted application.
      if (
        /already have an artist application/i.test(
          reason
        )
      ) {
        try {
          await loadApplication();
          setStatusChecked(true);
        } catch {
          setStatusChecked(false);
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ======================================
  // LOADING STATE
  // ======================================

  if (loading) {
    return (
      <div className="page-content em-artist-apply-page">
        <div className="em-artist-apply-state">
          <Disc3 className="spin" size={38} />

          <h2>Checking your application...</h2>

          <p>
            We're looking for an existing
            artist application.
          </p>
        </div>
      </div>
    );
  }

  // ======================================
  // STATUS LOAD ERROR
  // ======================================

  if (!statusChecked) {
    return (
      <div className="page-content em-artist-apply-page">
        <div className="em-artist-apply-state">
          <XCircle size={42} />

          <h2>Unable to load application status</h2>

          <p role="alert">
            {error ||
              "Please check your connection and try again."}
          </p>

          <button
            type="button"
            onClick={() => void retryStatus()}
            disabled={loading}
          >
            <RefreshCcw size={17} />
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ======================================
  // EXISTING APPLICATION
  // ======================================

  if (application) {
    const pending =
      application.approvalStatus === "pending";

    const approved =
      application.approvalStatus === "approved";

    const rejected =
      application.approvalStatus === "rejected";

    return (
      <div className="page-content em-artist-apply-page">
        <Link
          to="/become-an-artist"
          className="em-artist-apply-back"
        >
          <ArrowLeft size={18} />
          Back to Become an Artist
        </Link>

        <section className="em-artist-status-card">
          <div
            className={`em-artist-status-symbol ${
              approved
                ? "approved"
                : rejected
                  ? "rejected"
                  : "pending"
            }`}
          >
            {approved ? (
              <BadgeCheck size={40} />
            ) : rejected ? (
              <XCircle size={40} />
            ) : (
              <Clock3 size={40} />
            )}
          </div>

          <span className="em-artist-apply-kicker">
            EMNET MUSIC FOR ARTISTS
          </span>

          <h1>
            {pending
              ? "Application under review"
              : approved
                ? "Welcome to Emnet Music for Artists"
                : rejected
                  ? "Application not approved"
                  : "Application status"}
          </h1>

          <p className="em-artist-status-description">
            {pending
              ? "Your application was received. Our team will review your artist information before making a decision."
              : approved
                ? "Your artist application has been approved. Your account can now access artist features after its session information is refreshed."
                : rejected
                  ? "Your application was reviewed and was not approved. You can contact Emnet Music support for further information."
                  : "Your application is currently unavailable for new submissions."}
          </p>

          {successMessage && (
            <p
              className="em-artist-apply-success"
              role="status"
            >
              <CheckCircle2 size={18} />
              {successMessage}
            </p>
          )}

          <span
            className={`em-artist-status-badge ${
              application.approvalStatus
            }`}
          >
            {application.approvalStatus}
          </span>

          <div className="em-artist-application-summary">
            <div>
              <span>Stage name</span>
              <strong>{application.stageName}</strong>
            </div>

            <div>
              <span>Country</span>
              <strong>{application.country}</strong>
            </div>

            <div>
              <span>Date submitted</span>
              <strong>
                {formatApplicationDate(
                  application.createdAt
                )}
              </strong>
            </div>

            <div>
              <span>Application status</span>
              <strong>
                {application.approvalStatus}
              </strong>
            </div>
          </div>

          {application.bio && (
            <div className="em-artist-summary-bio">
              <span>Artist biography</span>
              <p>{application.bio}</p>
            </div>
          )}

          <div className="em-artist-status-actions">
            <button
              type="button"
              className="em-artist-secondary-button"
              onClick={() => void retryStatus()}
              disabled={loading}
            >
              <RefreshCcw size={17} />
              Refresh status
            </button>

            <Link
              to="/"
              className="em-artist-primary-button"
            >
              Back to music
              <ArrowRight size={17} />
            </Link>
          </div>
        </section>
      </div>
    );
  }

  // ======================================
  // NEW APPLICATION FORM
  // ======================================

  return (
    <div className="page-content em-artist-apply-page">
      <Link
        to="/become-an-artist"
        className="em-artist-apply-back"
      >
        <ArrowLeft size={18} />
        Back to Become an Artist
      </Link>

      <section className="em-artist-apply-hero">
        <div className="em-artist-apply-hero-icon">
          <Mic2 size={33} />
        </div>

        <span className="em-artist-apply-kicker">
          EMNET MUSIC FOR ARTISTS
        </span>

        <h1>Start your artist journey</h1>

        <p>
          Your talent deserves an audience.
          Introduce yourself and take the
          first step toward sharing your
          music with the world.
        </p>
      </section>

      <form
        className="em-artist-apply-form"
        onSubmit={handleSubmit}
      >
        {/* ARTIST IDENTITY */}

        <section className="em-artist-apply-panel">
          <div className="em-artist-apply-panel-heading">
            <UserRound size={22} />

            <div>
              <h2>Artist identity</h2>
              <p>
                Tell us how you want to be
                known as an artist.
              </p>
            </div>
          </div>

          <div className="em-artist-apply-field">
            <label htmlFor="em-stage-name">
              Stage name
              <span className="em-required"> *</span>
            </label>

            <input
              id="em-stage-name"
              type="text"
              value={stageName}
              maxLength={100}
              placeholder="Enter your artist stage name"
              onChange={(event) =>
                setStageName(event.target.value)
              }
              disabled={submitting}
              required
            />

            <small>
              Choose the name your audience
              will recognize you by.
            </small>
          </div>

          <div className="em-artist-apply-field">
            <label htmlFor="em-artist-bio">
              Artist biography
            </label>

            <textarea
              id="em-artist-bio"
              value={bio}
              maxLength={500}
              rows={5}
              placeholder="Tell us about your music, your sound, and what inspires you..."
              onChange={(event) =>
                setBio(event.target.value)
              }
              disabled={submitting}
            />

            <small>
              {bio.length}/500 characters
            </small>
          </div>
        </section>

        {/* LOCATION */}

        <section className="em-artist-apply-panel">
          <div className="em-artist-apply-panel-heading">
            <Globe2 size={22} />

            <div>
              <h2>Your country</h2>
              <p>
                Let us know where you're
                creating your music.
              </p>
            </div>
          </div>

          <div className="em-artist-apply-field">
            <label htmlFor="em-artist-country">
              Country
              <span className="em-required"> *</span>
            </label>

            <input
              id="em-artist-country"
              type="text"
              value={country}
              maxLength={100}
              placeholder="e.g. Nigeria"
              onChange={(event) =>
                setCountry(event.target.value)
              }
              disabled={submitting}
              required
            />
          </div>
        </section>

        {/* APPLICATION INFORMATION */}

        <section className="em-artist-apply-note">
          <ShieldCheck size={22} />

          <div>
            <strong>What happens next?</strong>

            <p>
              After submission, your application
              will be reviewed by Emnet Music.
              You can continue listening to music
              while your request is pending.
              Artist profile and cover pictures
              can be uploaded after approval.
            </p>
          </div>
        </section>

        {/* FEEDBACK */}

        {error && (
          <p
            className="em-artist-apply-error"
            role="alert"
          >
            <XCircle size={18} />
            {error}
          </p>
        )}

        {/* SUBMIT */}

        <div className="em-artist-apply-actions">
          <Link
            to="/become-an-artist"
            className="em-artist-secondary-button"
          >
            <ArrowLeft size={17} />
            Cancel
          </Link>

          <button
            type="submit"
            className="em-artist-primary-button"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Disc3 className="spin" size={18} />
                Submitting...
              </>
            ) : (
              <>
                <Send size={18} />
                Submit application
              </>
            )}
          </button>
        </div>
      </form>

      <p className="em-artist-apply-footer">
        <Music2 size={17} />
        Excitement starts here.
      </p>
    </div>
  );
}
