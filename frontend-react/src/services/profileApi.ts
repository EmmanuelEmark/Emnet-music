
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

const TOKEN_KEY = "emnet_session_token";

export type EmailPreferences = {
  birthdayGreetings: boolean;
  monthlyGreetings: boolean;
};

export type ListenerAccount = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  dateOfBirth: string;
  profileImage: string;
  emailVerified: boolean;
  accountStatus: string;
  createdAt: string;
  emailPreferences: EmailPreferences;
};

export type ProfileUpdate = {
  fullName?: string;
  dateOfBirth?: string;
  profileImage?: string;
};

type ApiObject = Record<string, unknown>;

function asObject(value: unknown): ApiObject {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as ApiObject;
  }

  return {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeDate(value: unknown): string {
  const date = stringValue(value);

  if (!date) return "";

  const parsed = new Date(date);

  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toISOString().slice(0, 10);
}

function normalizeAccount(
  value: unknown
): ListenerAccount {
  const user = asObject(value);
  const preferences = asObject(user.emailPreferences);

  return {
    id: String(user._id || user.id || ""),
    fullName: stringValue(user.fullName),
    email: stringValue(user.email),
    role: stringValue(user.role),
    dateOfBirth: normalizeDate(user.dateOfBirth),
    profileImage: stringValue(user.profileImage),
    emailVerified: user.emailVerified === true,
    accountStatus: stringValue(user.accountStatus),
    createdAt: stringValue(user.createdAt),
    emailPreferences: {
      birthdayGreetings:
        preferences.birthdayGreetings === true,
      monthlyGreetings:
        preferences.monthlyGreetings === true,
    },
  };
}

async function accountRequest(
  path: string,
  options: RequestInit = {}
): Promise<ApiObject> {
  const token = sessionStorage.getItem(TOKEN_KEY);

  if (!token) {
    throw new Error(
      "Your session has expired. Please log in again."
    );
  }

  const response = await fetch(
    `${API_BASE_URL}/api/account${path}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    }
  );

  const raw: unknown = await response
    .json()
    .catch(() => null);

  const result = asObject(raw);

  if (
    !response.ok ||
    result.success !== true
  ) {
    throw new Error(
      stringValue(result.message) ||
      `Request failed (${response.status}).`
    );
  }

  return result;
}

export async function getMyAccount():
  Promise<ListenerAccount> {
  const data = await accountRequest("/me");

  if (!data.user) {
    throw new Error(
      "The server did not return account information."
    );
  }

  return normalizeAccount(data.user);
}

export async function updateMyProfile(
  changes: ProfileUpdate
): Promise<void> {
  await accountRequest("/profile", {
    method: "PATCH",
    body: JSON.stringify(changes),
  });
}

export async function changeMyPassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await accountRequest("/password", {
    method: "PATCH",
    body: JSON.stringify({
      currentPassword,
      newPassword,
    }),
  });
}

export async function updateMyEmailPreferences(
  preferences: EmailPreferences
): Promise<EmailPreferences> {
  const data = await accountRequest(
    "/email-preferences",
    {
      method: "PATCH",
      body: JSON.stringify(preferences),
    }
  );

  const saved = asObject(data.emailPreferences);

  return {
    birthdayGreetings:
      saved.birthdayGreetings === true,
    monthlyGreetings:
      saved.monthlyGreetings === true,
  };
}
