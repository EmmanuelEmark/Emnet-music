
import {
  useState,
  type FormEvent,
} from "react";

import {
  Link,
  Navigate,
  useNavigate,
} from "react-router";

import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Eye,
  EyeOff,
  Headphones,
  LockKeyhole,
  Mail,
  Music2,
  UserRound,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import "./AuthPage.css";

type AuthMode = "login" | "register";

type AuthPageProps = {
  mode: AuthMode;
};

export default function AuthPage({
  mode,
}: AuthPageProps) {
  const navigate = useNavigate();

  const {
    user,
    loading: sessionLoading,
    login,
    register,
  } = useAuth();

  const isLogin = mode === "login";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function validate(): string {
    if (!isLogin) {
      if (!name.trim()) {
        return "Please enter your full name.";
      }

      if (name.trim().length > 100) {
        return "Full name is too long.";
      }
    }

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      return "Please enter your email address.";
    }

    if (
      cleanEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        cleanEmail
      )
    ) {
      return "Please enter a valid email address.";
    }

    if (!password) {
      return "Please enter your password.";
    }

    if (!isLogin) {
      if (password.length < 8) {
        return "Password must contain at least 8 characters.";
      }

      if (
        new TextEncoder().encode(password).length > 72
      ) {
        return "Password is too long.";
      }

      if (password !== confirmPassword) {
        return "Passwords do not match.";
      }

      if (!dateOfBirth) {
        return "Please enter your date of birth.";
      }

      const datePattern = /^\d{4}-\d{2}-\d{2}$/;

      if (!datePattern.test(dateOfBirth)) {
        return "Please enter a valid date of birth.";
      }

      const date = new Date(
        `${dateOfBirth}T00:00:00.000Z`
      );

      if (
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !==
          dateOfBirth ||
        date.getTime() > Date.now()
      ) {
        return "Please enter a valid date of birth.";
      }
    }

    return "";
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");
    setSuccess("");

    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSubmitting(true);

      if (isLogin) {
        await login(email, password);

        // Role-specific dashboards will be connected
        // as we build the next stages.
        navigate("/", { replace: true });
      } else {
        const message = await register({
          fullName: name,
          email,
          password,
          dateOfBirth,
        });

        setSuccess(
          `${message} You can now sign in.`
        );

        setPassword("");
        setConfirmPassword("");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (sessionLoading) {
    return (
      <div className="auth-loading">
        Checking your session...
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="auth-page">
      <section className="auth-visual">
        <div className="auth-visual-top">
          <Link to="/" className="auth-brand">
            <span className="auth-brand-symbol">
              <Music2 size={27} />
            </span>

            <span>
              EMNET <strong>MUSIC</strong>
              <small>Excitement starts here.</small>
            </span>
          </Link>
        </div>

        <div className="auth-visual-content">
          <div className="auth-decoration">
            <div className="auth-record">
              <div className="auth-record-center">
                <Music2 size={58} />
              </div>
            </div>
          </div>

          <span className="auth-eyebrow">
            THE SOUND OF SOMETHING SPECIAL
          </span>

          <h1>
            Every moment
            <br />
            deserves a
            <br />
            <em>soundtrack.</em>
          </h1>

          <p>
            Discover amazing artists, connect with
            music you love, and experience your
            favourite sounds in a whole new way.
          </p>
        </div>

        <div className="auth-visual-bottom">
          <span>
            <Headphones size={17} />
            Feel the music
          </span>

          <span>
            © {new Date().getFullYear()} Emnet Music
          </span>
        </div>
      </section>

      <section className="auth-form-section">
        <div className="auth-form-container">
          <Link to="/" className="auth-back">
            <ArrowRight size={16} />
            Back to Home
          </Link>

          <div className="auth-heading">
            <div className="auth-small-icon">
              {isLogin ? (
                <LockKeyhole size={24} />
              ) : (
                <UserRound size={24} />
              )}
            </div>

            <span className="auth-label">
              {isLogin
                ? "WELCOME BACK"
                : "JOIN THE EXPERIENCE"}
            </span>

            <h2>
              {isLogin
                ? "Welcome back."
                : "Create your account."}
            </h2>

            <p>
              {isLogin
                ? "Sign in to continue your music journey."
                : "Join Emnet Music and discover sounds you'll love."}
            </p>
          </div>

          <form
            className="auth-form"
            onSubmit={handleSubmit}
            noValidate
          >
            {!isLogin && (
              <div className="auth-field">
                <label htmlFor="auth-name">
                  Full name
                </label>

                <div className="auth-input-wrap">
                  <UserRound size={19} />

                  <input
                    id="auth-name"
                    type="text"
                    placeholder="Enter your full name"
                    autoComplete="name"
                    value={name}
                    onChange={(event) =>
                      setName(event.target.value)
                    }
                    required
                  />
                </div>
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="auth-email">
                Email address
              </label>

              <div className="auth-input-wrap">
                <Mail size={19} />

                <input
                  id="auth-email"
                  type="email"
                  placeholder="Enter your email address"
                  autoComplete="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  required
                />
              </div>
            </div>

            {!isLogin && (
              <div className="auth-field">
                <label htmlFor="auth-dob">
                  Date of birth
                </label>

                <div className="auth-input-wrap">
                  <CalendarDays size={19} />

                  <input
                    id="auth-dob"
                    type="date"
                    value={dateOfBirth}
                    onChange={(event) =>
                      setDateOfBirth(event.target.value)
                    }
                    required
                  />
                </div>
              </div>
            )}

            <div className="auth-field">
              <div className="auth-field-heading">
                <label htmlFor="auth-password">
                  Password
                </label>
              </div>

              <div className="auth-input-wrap">
                <LockKeyhole size={19} />

                <input
                  id="auth-password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  placeholder="Enter your password"
                  autoComplete={
                    isLogin
                      ? "current-password"
                      : "new-password"
                  }
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  required
                />

                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() =>
                    setShowPassword((previous) => !previous)
                  }
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {showPassword ? (
                    <EyeOff size={19} />
                  ) : (
                    <Eye size={19} />
                  )}
                </button>
              </div>
            </div>

            {!isLogin && (
              <div className="auth-field">
                <label htmlFor="auth-confirm">
                  Confirm password
                </label>

                <div className="auth-input-wrap">
                  <LockKeyhole size={19} />

                  <input
                    id="auth-confirm"
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    placeholder="Confirm your password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(
                        event.target.value
                      )
                    }
                    required
                  />
                </div>
              </div>
            )}

            {error && (
              <div
                className="auth-message auth-error"
                role="alert"
              >
                {error}
              </div>
            )}

            {success && (
              <div
                className="auth-message auth-success"
                role="status"
              >
                <CheckCircle2 size={18} />

                <span>
                  {success}{" "}
                  <Link to="/login">
                    Go to Login
                  </Link>
                </span>
              </div>
            )}

            <button
              type="submit"
              className="auth-submit"
              disabled={submitting}
            >
              <span>
                {submitting
                  ? "Please wait..."
                  : isLogin
                    ? "Sign in"
                    : "Create account"}
              </span>

              <ArrowRight size={19} />
            </button>
          </form>

          <div className="auth-switch">
            {isLogin ? (
              <p>
                New to Emnet Music?{" "}
                <Link to="/register">
                  Create an account
                </Link>
              </p>
            ) : (
              <p>
                Already have an account?{" "}
                <Link to="/login">
                  Sign in
                </Link>
              </p>
            )}
          </div>

          <p className="auth-footer-note">
            Your music journey starts here.
          </p>
        </div>
      </section>
    </div>
  );
}
