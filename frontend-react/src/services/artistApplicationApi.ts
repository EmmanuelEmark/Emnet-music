
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

const TOKEN_KEY = "emnet_session_token";

// ========================================
// TYPES
// ========================================

export type ApplicationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "suspended";

export type ArtistApplication = {
  id: string;
  stageName: string;
  bio: string;
  country: string;
  approvalStatus: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
};

export type ArtistApplicationInput = {
  stageName: string;
  bio: string;
  country: string;
};

export type ArtistApplicationResult = {
  hasApplication: boolean;
  application: ArtistApplication | null;
};

type ApiResponse = {
  success: boolean;
  message?: string;
  hasApplication?: boolean;
  application?: ArtistApplication | null;
};

// ========================================
// GET AUTHENTICATION TOKEN
// ========================================

function getToken(): string {
  const token = sessionStorage.getItem(TOKEN_KEY);

  if (!token) {
    throw new Error(
      "Please log in to continue."
    );
  }

  return token;
}

// ========================================
// PARSE BACKEND RESPONSE
// ========================================

async function parseResponse(
  response: Response
): Promise<ApiResponse> {
  const result: unknown = await response
    .json()
    .catch(() => null);

  if (
    !result ||
    typeof result !== "object"
  ) {
    throw new Error(
      "Invalid response from the server."
    );
  }

  const data = result as ApiResponse;

  if (
    !response.ok ||
    data.success !== true
  ) {
    throw new Error(
      data.message ||
      `Request failed (${response.status}).`
    );
  }

  return data;
}

// ========================================
// CHECK EXISTING APPLICATION
// GET /api/artists/application-status
// ========================================

export async function getArtistApplicationStatus():
  Promise<ArtistApplicationResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/artists/application-status`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    }
  );

  const data = await parseResponse(response);

  return {
    hasApplication: data.hasApplication === true,
    application: data.application || null,
  };
}

// ========================================
// SUBMIT ARTIST APPLICATION
// POST /api/artists/apply
// ========================================

export async function submitArtistApplication(
  input: ArtistApplicationInput
): Promise<ArtistApplication> {
  const response = await fetch(
    `${API_BASE_URL}/api/artists/apply`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({
        stageName: input.stageName.trim(),
        bio: input.bio.trim(),
        country: input.country.trim(),
      }),
    }
  );

  const data = await parseResponse(response);

  if (!data.application) {
    throw new Error(
      "The server did not return your application."
    );
  }

  return data.application;
}
