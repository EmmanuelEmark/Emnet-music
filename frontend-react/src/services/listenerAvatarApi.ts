
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

const TOKEN_KEY = "emnet_session_token";

type UploadResponse = {
  success: boolean;
  message?: string;
  uploadId: string;
  uploadUrl: string;
  contentType: string;
};

type ConfirmationResponse = {
  success: boolean;
  message?: string;
  profileImage: string;
};

function getAuthHeaders() {
  const token = sessionStorage.getItem(TOKEN_KEY);

  if (!token) {
    throw new Error(
      "Your session has expired. Please log in again."
    );
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

async function readResponse<T>(
  response: Response
): Promise<T> {
  const data: unknown = await response
    .json()
    .catch(() => null);

  if (
    !data ||
    typeof data !== "object"
  ) {
    throw new Error(
      "Invalid response from the server."
    );
  }

  const result = data as {
    success?: boolean;
    message?: string;
  };

  if (
    !response.ok ||
    result.success !== true
  ) {
    throw new Error(
      result.message ||
      "Unable to complete the request."
    );
  }

  return data as T;
}

// ========================================
// VALIDATE PROFILE PICTURE
// ========================================

export function validateAvatarFile(
  file: File
): void {
  const allowedFormats: Record<
    string,
    string[]
  > = {
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"],
  };

  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase() || "";

  if (
    !allowedFormats[file.type]
      ?.includes(extension)
  ) {
    throw new Error(
      "Select a JPG, PNG or WebP image."
    );
  }

  if (
    file.size <= 0 ||
    file.size > 5 * 1024 * 1024
  ) {
    throw new Error(
      "Profile picture must not exceed 5 MB."
    );
  }
}

// ========================================
// UPLOAD LISTENER PROFILE PICTURE
// ========================================

export async function uploadListenerAvatar(
  file: File
): Promise<string> {
  validateAvatarFile(file);

  // STEP 1: REQUEST SIGNED URL

  const request = await fetch(
    `${API_BASE_URL}/api/account/avatar/request`,
    {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
      }),
    }
  );

  const upload =
    await readResponse<UploadResponse>(
      request
    );

  if (
    !upload.uploadUrl ||
    !upload.uploadId
  ) {
    throw new Error(
      "Upload details are missing."
    );
  }

  // STEP 2: UPLOAD DIRECTLY TO R2

  const result = await fetch(
    upload.uploadUrl,
    {
      method: "PUT",
      headers: {
        "Content-Type":
          upload.contentType,
      },
      body: file,
    }
  );

  if (!result.ok) {
    throw new Error(
      "Failed to upload your picture to Cloudflare R2."
    );
  }

  // STEP 3: CONFIRM THE UPLOAD

  const confirmation = await fetch(
    `${API_BASE_URL}/api/account/avatar/${encodeURIComponent(
      upload.uploadId
    )}/confirm`,
    {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
      },
    }
  );

  const confirmed =
    await readResponse<ConfirmationResponse>(
      confirmation
    );

  if (!confirmed.profileImage) {
    throw new Error(
      "The server did not return a profile picture."
    );
  }

  return confirmed.profileImage;
}
