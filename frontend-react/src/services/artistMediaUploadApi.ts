
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:5000"
).replace(/\/$/, "");

const TOKEN_KEY = "emnet_session_token";

// ========================================
// TYPES
// ========================================

export type ArtistMediaKind =
  | "audio"
  | "artwork"
  | "thumbnail"
  | "video";

type UploadRequestResponse = {
  success: boolean;
  message?: string;
  uploadId: string;
  uploadUrl: string;
  method: "PUT";
  contentType: string;
  expiresIn: number;
};

type ConfirmUploadResponse = {
  success: boolean;
  message?: string;
  media: {
    uploadId: string;
    kind: string;
    objectKey: string;
    status: string;
    mimeType?: string;
    size?: number;
  };
};

export type ArtistUploadedMedia = {
  uploadId: string;
  kind: ArtistMediaKind;
  fileName: string;
  objectKey: string;
  size: number;
};

export type UploadProgressHandler = (
  percent: number
) => void;

// ========================================
// FILE CONFIGURATION
// ========================================

const MB = 1024 * 1024;

const MAX_SIZES: Record<
  ArtistMediaKind,
  number
> = {
  audio: 100 * MB,
  artwork: 10 * MB,
  thumbnail: 10 * MB,
  video: 500 * MB,
};

const FILE_TYPES: Record<
  ArtistMediaKind,
  Record<string, string>
> = {
  audio: {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    flac: "audio/flac",
    m4a: "audio/mp4",
  },

  artwork: {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  },

  thumbnail: {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  },

  video: {
    mp4: "video/mp4",
    webm: "video/webm",
  },
};

// ========================================
// BROWSER MIME TYPE COMPATIBILITY
//
// Some mobile browsers use alternative
// MIME types for the same file format.
//
// Always send the canonical MIME type
// expected by the backend.
//
// This is compatibility checking,
// not verification of file contents.
// ========================================

const COMPATIBLE_TYPES: Record<
  string,
  string[]
> = {
  mp3: [
    "audio/mpeg",
    "audio/mp3",
    "audio/x-mp3",
    "audio/mpeg3",
    "audio/x-mpeg-3",
  ],

  wav: [
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/vnd.wave",
  ],

  flac: [
    "audio/flac",
    "audio/x-flac",
  ],

  m4a: [
    "audio/mp4",
    "audio/x-m4a",
    "audio/m4a",
  ],

  jpg: [
    "image/jpeg",
    "image/jpg",
  ],

  jpeg: [
    "image/jpeg",
    "image/jpg",
  ],

  png: [
    "image/png",
  ],

  webp: [
    "image/webp",
  ],

  mp4: [
    "video/mp4",
  ],

  webm: [
    "video/webm",
  ],
};

const API_TIMEOUT_MS = 60000;

const R2_TIMEOUT_MS =
  30 * 60 * 1000;

// ========================================
// AUTHENTICATION
// ========================================

function getToken(): string {
  const token =
    sessionStorage.getItem(TOKEN_KEY);

  if (!token) {
    throw new Error(
      "Please sign in to upload media."
    );
  }

  return token;
}

// ========================================
// VALIDATE FILE
// ========================================

function validateFile(
  file: File,
  kind: ArtistMediaKind
): string {
  if (!file || file.size <= 0) {
    throw new Error(
      "The selected file is empty or unavailable."
    );
  }

  if (file.size > MAX_SIZES[kind]) {
    const maxMB =
      MAX_SIZES[kind] / MB;

    throw new Error(
      `Maximum ${kind} file size is ${maxMB} MB.`
    );
  }

  const extension = file.name
    .trim()
    .split(".")
    .pop()
    ?.toLowerCase();

  if (!extension) {
    throw new Error(
      "The selected file has no extension."
    );
  }

  const expectedType =
    FILE_TYPES[kind][extension];

  if (!expectedType) {
    throw new Error(
      `Unsupported ${kind} format.`
    );
  }

  // Browsers may return an empty MIME
  // type or a generic binary MIME type.
  // Neither proves that the file is invalid.

  const browserType = (
    file.type || ""
  )
    .trim()
    .toLowerCase();

  const genericTypes = [
    "",
    "application/octet-stream",
    "binary/octet-stream",
  ];

  const compatibleTypes =
    COMPATIBLE_TYPES[extension] ||
    [expectedType];

  if (
    !genericTypes.includes(browserType) &&
    !compatibleTypes.includes(browserType)
  ) {
    throw new Error(
      `The selected ${kind} file has an incompatible format. Please choose a valid ${extension.toUpperCase()} file.`
    );
  }

  return expectedType;
}

// ========================================
// JSON API REQUEST
//
// Used only for the backend:
// - Request signed URL
// - Confirm uploaded file
//
// JWT must never be sent to R2.
// ========================================

async function postJSON<T>(
  path: string,
  body: unknown
): Promise<T> {
  const controller =
    new AbortController();

  const timeout = window.setTimeout(
    () => controller.abort(),
    API_TIMEOUT_MS
  );

  try {
    let response: Response;

    try {
      response = await fetch(
        `${API_BASE_URL}${path}`,
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${getToken()}`,

            "Content-Type":
              "application/json",
          },

          body: JSON.stringify(body),

          cache: "no-store",

          signal: controller.signal,
        }
      );

    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "AbortError"
      ) {
        throw new Error(
          "The server took too long to respond. Check your connection."
        );
      }

      throw new Error(
        "Unable to connect to the upload server. Check your internet connection."
      );
    }

    const payload = await response
      .json()
      .catch(() => null);

    if (
      !response.ok ||
      !payload?.success
    ) {
      throw new Error(
        payload?.message ||
        `Upload server request failed (${response.status}).`
      );
    }

    return payload as T;

  } finally {
    window.clearTimeout(timeout);
  }
}

// ========================================
// REQUEST SIGNED UPLOAD URL
// ========================================

async function requestUpload(
  file: File,
  kind: ArtistMediaKind,
  mimeType: string
): Promise<UploadRequestResponse> {
  return postJSON<UploadRequestResponse>(
    "/api/uploads/request",
    {
      kind,

      fileName: file.name,

      mimeType,

      size: file.size,
    }
  );
}

// ========================================
// UPLOAD FILE DIRECTLY TO CLOUDFLARE R2
//
// XHR is used for upload progress.
//
// No JWT is sent to Cloudflare R2.
// ========================================

function uploadFileToR2(
  file: File,
  uploadUrl: string,
  contentType: string,
  onProgress?: UploadProgressHandler
): Promise<void> {
  return new Promise(
    (resolve, reject) => {
      const xhr =
        new XMLHttpRequest();

      let settled = false;

      function finish(
        error?: Error
      ) {
        if (settled) {
          return;
        }

        settled = true;

        xhr.onload = null;
        xhr.onerror = null;
        xhr.ontimeout = null;
        xhr.onabort = null;
        xhr.upload.onprogress = null;

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      }

      xhr.open(
        "PUT",
        uploadUrl,
        true
      );

      xhr.timeout = R2_TIMEOUT_MS;

      xhr.setRequestHeader(
        "Content-Type",
        contentType
      );

      // ====================================
      // TRACK PROGRESS
      // ====================================

      xhr.upload.onprogress = (
        event
      ) => {
        if (
          !event.lengthComputable ||
          !onProgress
        ) {
          return;
        }

        const percent = Math.round(
          (event.loaded /
            event.total) *
            100
        );

        // 100% is reserved for
        // successful backend confirmation.

        onProgress(
          Math.min(
            Math.max(percent, 0),
            99
          )
        );
      };

      // ====================================
      // UPLOAD FINISHED
      // ====================================

      xhr.onload = () => {
        if (
          xhr.status >= 200 &&
          xhr.status < 300
        ) {
          finish();
        } else {
          finish(
            new Error(
              `Cloudflare R2 rejected the upload (HTTP ${xhr.status}).`
            )
          );
        }
      };

      // ====================================
      // NETWORK FAILURE
      // ====================================

      xhr.onerror = () => {
        finish(
          new Error(
            "Network error during Cloudflare R2 upload. Check your connection and R2 CORS configuration."
          )
        );
      };

      // ====================================
      // UPLOAD TIMEOUT
      // ====================================

      xhr.ontimeout = () => {
        finish(
          new Error(
            "The Cloudflare R2 upload timed out. Please check your connection and try again."
          )
        );
      };

      // ====================================
      // UPLOAD CANCELLED
      // ====================================

      xhr.onabort = () => {
        finish(
          new Error(
            "The media upload was interrupted or cancelled."
          )
        );
      };

      // ====================================
      // SEND FILE
      // ====================================

      try {
        xhr.send(file);

      } catch {
        finish(
          new Error(
            "Unable to start the media upload on this device."
          )
        );
      }
    }
  );
}

// ========================================
// CONFIRM UPLOAD ON BACKEND
// ========================================

async function confirmUpload(
  uploadId: string
): Promise<ConfirmUploadResponse> {
  return postJSON<ConfirmUploadResponse>(
    `/api/uploads/${encodeURIComponent(
      uploadId
    )}/confirm`,
    {}
  );
}

// ========================================
// COMPLETE MEDIA UPLOAD
//
// 1. Validate file
// 2. Request signed URL
// 3. Upload to Cloudflare R2
// 4. Confirm on backend
// 5. Return ID for song attachment
// ========================================

export async function uploadArtistMedia(
  file: File,
  kind: ArtistMediaKind,
  onProgress?: UploadProgressHandler
): Promise<ArtistUploadedMedia> {
  // ======================================
  // STEP 1: VALIDATE THE FILE
  // ======================================

  const mimeType =
    validateFile(
      file,
      kind
    );

  onProgress?.(0);

  // ======================================
  // STEP 2: REQUEST SIGNED URL
  // ======================================

  let signedUpload:
    UploadRequestResponse;

  try {
    signedUpload =
      await requestUpload(
        file,
        kind,
        mimeType
      );

  } catch (error) {
    throw new Error(
      `Unable to prepare ${kind} upload: ${
        error instanceof Error
          ? error.message
          : "Unknown error."
      }`
    );
  }

  if (
    !signedUpload.uploadId ||
    !signedUpload.uploadUrl ||
    signedUpload.method !== "PUT" ||
    !signedUpload.contentType
  ) {
    throw new Error(
      "The server returned incomplete upload information."
    );
  }

  // ======================================
  // STEP 3: UPLOAD FILE TO R2
  // ======================================

  try {
    await uploadFileToR2(
      file,

      signedUpload.uploadUrl,

      signedUpload.contentType,

      onProgress
    );

  } catch (error) {
    throw new Error(
      `Unable to upload ${kind} file: ${
        error instanceof Error
          ? error.message
          : "Unknown error."
      }`
    );
  }

  // ======================================
  // STEP 4: CONFIRM UPLOAD
  // ======================================

  let confirmation:
    ConfirmUploadResponse;

  try {
    confirmation =
      await confirmUpload(
        signedUpload.uploadId
      );

  } catch (error) {
    throw new Error(
      `File transfer completed, but upload confirmation failed: ${
        error instanceof Error
          ? error.message
          : "Unknown error."
      }`
    );
  }

  // ======================================
  // STEP 5: VERIFY CONFIRMED MEDIA
  // ======================================

  if (
    !confirmation?.media ||
    confirmation.media.status !== "ready" ||
    confirmation.media.uploadId !==
      signedUpload.uploadId ||
    !confirmation.media.objectKey ||
    confirmation.media.kind !== kind
  ) {
    throw new Error(
      "The uploaded file was not confirmed correctly by the server."
    );
  }

  // ======================================
  // STEP 6: RETURN UPLOADED MEDIA
  // ======================================

  onProgress?.(100);

  return {
    uploadId:
      confirmation.media.uploadId,

    kind,

    fileName:
      file.name,

    objectKey:
      confirmation.media.objectKey,

    size:
      file.size,
  };
}
