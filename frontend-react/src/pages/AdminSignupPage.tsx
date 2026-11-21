import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Link,
  useSearchParams,
} from "react-router";

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  LockKeyhole,
  Music2,
  ShieldCheck,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

import {
  verifyAdminInvitation,
  acceptAdminInvitation,
  type VerifiedInvitation,
} from "../services/adminInvitationApi";

import "./AdminSignupPage.css";

// ==========================================
// HELPERS
// ==========================================

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to complete the request.";
}

function formatCountdown(
  expiresAt: string,
  now: number
) {
  const seconds = Math.max(
    0,
    Math.ceil(
      (new Date(expiresAt).getTime() - now) / 1000
    )
  );

  return `${String(
    Math.floor(seconds / 60)
  ).padStart(2, "0")}:${String(
    seconds % 60
  ).padStart(2, "0")}`;
}

function validBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    date.getTime() < Date.now()
  );
}

// ==========================================
// ADMIN SIGNUP FORM
// ==========================================

function InvitationSignup({
  token,
}: {
  token: string;
}) {
  const [invitation, setInvitation] =
    useState<VerifiedInvitation | null>(null);

  const [loading, setLoading] = useState(true);

  const [verificationError, setVerificationError] =
    useState("");

  const [formError, setFormError] =
    useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [dateOfBirth, setDateOfBirth] = useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [processing, setProcessing] =
    useState(false);

  const [completed, setCompleted] =
    useState(false);

  const [now, setNow] = useState(Date.now());
  const [retryKey, setRetryKey] = useState(0);

  const submittingRef = useRef(false);
  const mountedRef = useRef(true);

  // ========================================
  // COMPONENT LIFECYCLE
  // ========================================

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ========================================
  // VERIFY INVITATION
  // ========================================

  useEffect(() => {
    const controller = new AbortController();

    async function verifyInvitation() {
      setLoading(true);
      setVerificationError("");
      setInvitation(null);

      try {
        if (!/^[a-f0-9]{64}$/i.test(token)) {
          throw new Error(
            "This invitation link is invalid or incomplete."
          );
        }

        const result = await verifyAdminInvitation(
          token,
          controller.signal
        );

        if (!controller.signal.aborted) {
          if (
            !Number.isFinite(
              new Date(result.expiresAt).getTime()
            )
          ) {
            throw new Error(
              "Invalid invitation expiration date."
            );
          }

          setInvitation(result);
          setNow(Date.now());
        }

      } catch (error) {
        if (!controller.signal.aborted) {
          setVerificationError(errorMessage(error));
        }

      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void verifyInvitation();

    return () => {
      controller.abort();
    };
  }, [token, retryKey]);

  // ========================================
  // COUNTDOWN
  // ========================================

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const expired =
    invitation !== null &&
    new Date(invitation.expiresAt).getTime() <= now;

  // ========================================
  // CREATE ADMINISTRATIVE ACCOUNT
  // ========================================

  async function registerAdministrator() {
    if (
      submittingRef.current ||
      !invitation ||
      completed
    ) {
      return;
    }

    setFormError("");

    if (
      new Date(invitation.expiresAt).getTime() <=
      Date.now()
    ) {
      setFormError(
        "Your invitation has expired. Request a new invitation from Super Admin."
      );
      return;
    }

    if (!validBirthDate(dateOfBirth)) {
      setFormError("Enter a valid date of birth.");
      return;
    }

    if (password.length < 8) {
      setFormError(
        "Your password must contain at least 8 characters."
      );
      return;
    }

    if (new TextEncoder().encode(password).length > 72) {
      setFormError(
        "Your password must be 72 bytes or fewer."
      );
      return;
    }

    if (password !== confirmPassword) {
      setFormError("Your passwords do not match.");
      return;
    }

    submittingRef.current = true;

    try {
      setProcessing(true);

      await acceptAdminInvitation(
        token,
        password,
        dateOfBirth
      );

      if (!mountedRef.current) return;

      setPassword("");
      setConfirmPassword("");
      setDateOfBirth("");

      setCompleted(true);

      // Remove the consumed invitation token
      // from the current browser URL.

      window.history.replaceState(
        window.history.state,
        "",
        "/admin-signup"
      );

    } catch (error) {
      if (mountedRef.current) {
        setFormError(errorMessage(error));
      }
    } finally {
      submittingRef.current = false;

      if (mountedRef.current) {
        setProcessing(false);
      }
    }
  }

  // ========================================
  // SUCCESSFUL ACCOUNT CREATION
  // ========================================

  if (completed) {
    return (
      <div className="em-admin-signup-card em-signup-state">
        <div className="em-signup-success-icon">
          <CheckCircle2 size={42} />
        </div>

        <h1>Account created successfully</h1>

        <p>
          Your Emnet Music administrative
          account has been created.
        </p>

        <p>
          Sign in using your email address and password
          to access the administrative dashboard.
        </p>

        <Link
          to="/login"
          replace
          className="em-signup-primary-button"
        >
          Sign in to your account
        </Link>
      </div>
    );
  }

  // ========================================
  // LOADING STATE
  // ========================================

  if (loading) {
    return (
      <div className="em-admin-signup-card em-signup-state">
        <div className="em-signup-spinner" />

        <h2>Verifying invitation</h2>

        <p>Checking your administrative invitation...</p>
      </div>
    );
  }

  // ========================================
  // INVALID OR EXPIRED INVITATION
  // ========================================

  if (verificationError || !invitation || expired) {
    return (
      <div className="em-admin-signup-card em-signup-state">
        <div className="em-signup-error-icon">
          <AlertCircle size={38} />
        </div>

        <h1>
          {expired
            ? "Invitation expired"
            : "Invitation unavailable"}
        </h1>

        <p>
          {expired
            ? "Your 10-minute invitation has expired."
            : verificationError ||
              "Your invitation could not be verified."}
        </p>

        <p>
          Contact your Super Admin to request
          a new invitation if necessary.
        </p>

        {!expired &&
          /^[a-f0-9]{64}$/i.test(token) && (
            <button
              type="button"
              className="em-signup-secondary-button"
              onClick={() =>
                setRetryKey(
                  (previous) => previous + 1
                )
              }
            >
              Verify again
            </button>
          )}

        <Link
          to="/login"
          replace
          className="em-signup-primary-button"
        >
          Return to login
        </Link>
      </div>
    );
  }

  // ========================================
  // REGISTRATION INTERFACE
  // ========================================

  return (
    <div className="em-admin-signup-card">

      {/* INTRODUCTION */}

      <div className="em-signup-intro">
        <div className="em-signup-shield">
          <ShieldCheck size={28} />
        </div>

        <span>ADMINISTRATIVE MEMBERSHIP</span>

        <h1>Create your admin account</h1>

        <p>
          You have been invited to join the
          Emnet Music administrative team.
        </p>
      </div>

      {/* EXPIRATION COUNTDOWN */}

      <div className="em-signup-expiration">
        <Clock size={19} />

        <span>Invitation expires in</span>

        <strong>
          {formatCountdown(invitation.expiresAt, now)}
        </strong>
      </div>

      {/* REGISTRATION FORM */}

      <form
        className="em-signup-form"
        onSubmit={(event) => {
          event.preventDefault();
          void registerAdministrator();
        }}
      >
        {/* FULL NAME */}

        <label className="em-signup-field">
          Full name

          <input
            type="text"
            value={invitation.fullName}
            readOnly
            autoComplete="name"
          />
        </label>

        {/* EMAIL ADDRESS */}

        <label className="em-signup-field">
          Email address

          <input
            type="email"
            value={invitation.email}
            readOnly
            autoComplete="email"
          />

          <small>
            Your name and email were assigned
            by the inviting Super Admin.
          </small>
        </label>

        {/* DATE OF BIRTH */}

        <label className="em-signup-field">
          Date of birth

          <input
            type="date"
            value={dateOfBirth}
            autoComplete="bday"
            max={new Date().toISOString().slice(0, 10)}
            required
            disabled={processing}
            onChange={(event) =>
              setDateOfBirth(event.target.value)
            }
          />
        </label>

        {/* PASSWORD */}

        <div className="em-signup-field">
          <label htmlFor="em-admin-password">
            Password
          </label>

          <div className="em-signup-password-field">
            <input
              id="em-admin-password"
              type={showPassword ? "text" : "password"}
              value={password}
              minLength={8}
              maxLength={72}
              required
              disabled={processing}
              autoComplete="new-password"
              placeholder="Create a strong password"
              onChange={(event) =>
                setPassword(event.target.value)
              }
            />

            <button
              type="button"
              aria-label={
                showPassword
                  ? "Hide password"
                  : "Show password"
              }
              onClick={() =>
                setShowPassword((previous) => !previous)
              }
            >
              {showPassword
                ? <EyeOff size={19} />
                : <Eye size={19} />}
            </button>
          </div>

          <small>
            At least 8 characters.
            A long, unique password is recommended.
          </small>
        </div>

        {/* CONFIRM PASSWORD */}

        <label className="em-signup-field">
          Confirm password

          <input
            type={showPassword ? "text" : "password"}
            value={confirmPassword}
            minLength={8}
            maxLength={72}
            required
            autoComplete="new-password"
            disabled={processing}
            placeholder="Confirm your password"
            onChange={(event) =>
              setConfirmPassword(event.target.value)
            }
          />
        </label>

        {/* REGISTRATION ERROR */}

        {formError && (
          <div className="em-signup-error" role="alert">
            <AlertCircle size={19} />
            <span>{formError}</span>
          </div>
        )}

        {/* SUBMIT */}

        <button
          type="submit"
          className="em-signup-primary-button"
          disabled={processing || expired}
        >
          <LockKeyhole size={18} />

          {processing
            ? "Creating account..."
            : "Create administrator account"}
        </button>
      </form>

      <div className="em-signup-bottom-note">
        <ShieldCheck size={17} />

        <p>
          This invitation is single-use.
          Your administrative account is subject
          to Emnet Music's access controls.
        </p>
      </div>
    </div>
  );
}

// ==========================================
// MAIN PUBLIC SIGNUP PAGE
// ==========================================

export default function AdminSignupPage() {
  const { user, loading, logout } = useAuth();

  const [params] = useSearchParams();

  const token = params.get("token") || "";

  // Reduce accidental referrer disclosure
  // while the invitation page is mounted.

  useEffect(() => {
    const existing = document.querySelector(
      'meta[name="referrer"]'
    );

    const previous = existing?.getAttribute("content");

    const meta =
      existing || document.createElement("meta");

    meta.setAttribute("name", "referrer");
    meta.setAttribute("content", "no-referrer");

    if (!existing) {
      document.head.appendChild(meta);
    }

    return () => {
      if (!existing) {
        meta.remove();
      } else if (previous !== null && previous !== undefined) {
        meta.setAttribute("content", previous);
      } else {
        meta.removeAttribute("content");
      }
    };
  }, []);

  return (
    <div className="em-admin-signup-shell">

      {/* BRAND */}

      <header className="em-signup-brand">
        <div className="em-signup-brand-icon">
          <Music2 size={25} />
        </div>

        <div>
          <strong>EMNET MUSIC</strong>
          <span>Excitement Starts Here.</span>
        </div>
      </header>

      {/* PAGE CONTENT */}

      <main className="em-admin-signup-main">
        {loading ? (
          <div className="em-admin-signup-card em-signup-state">
            <div className="em-signup-spinner" />
            <p>Checking your session...</p>
          </div>
        ) : user ? (
          <div className="em-admin-signup-card em-signup-state">
            <LockKeyhole size={36} />

            <h1>Existing session detected</h1>

            <p>
              You are currently signed in as {user.email}.
              Sign out before creating another
              administrative account.
            </p>

            <button
              type="button"
              className="em-signup-primary-button"
              onClick={() => logout()}
            >
              Sign out and continue
            </button>

            <Link
              to={
                user.role === "admin" ||
                user.role === "superadmin"
                  ? "/admin"
                  : "/"
              }
              className="em-signup-secondary-button"
            >
              Return to your account
            </Link>
          </div>
        ) : (
          <InvitationSignup
            key={token}
            token={token}
          />
        )}
      </main>

      <footer className="em-signup-footer">
        © {new Date().getFullYear()} Emnet Music.
        All rights reserved.
      </footer>
    </div>
  );
}