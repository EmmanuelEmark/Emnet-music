
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
  if (file.size <= 0) {
    throw new Error(
      "The selected file is empty."
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

  // A browser may report an empty MIME type.
  // If it reports one, it must match an
  // allowed value for that file extension.
  const compatibleTypes: Record<
    string,
    string[]
  > = {
    wav: [
      "audio/wav",
      "audio/x-wav",
    ],
    m4a: [
      "audio/mp4",
      "audio/x-m4a",
    ],
  };

  const allowedTypes =
    compatibleTypes[extension] ||
    [expectedType];

  if (
    file.type &&
    !allowedTypes.includes(file.type)
  ) {
    throw new Error(
      "The file format does not match its extension."
    );
  }

  return expectedType;
}

// ========================================
// JSON API REQUEST
// ========================================

async function postJSON<T>(
  path: string,
  body: unknown
): Promise<T> {
  const response = await fetch(
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
    }
  );

  const payload = await response
    .json()
    .catch(() => null);

  if (
    !response.ok ||
    !payload?.success
  ) {
    throw new Error(
      payload?.message ||
      `Request failed (${response.status}).`
    );
  }

  return payload as T;
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
// UPLOAD FILE DIRECTLY TO R2
//
// XHR is used to track upload progress.
// Never send the JWT to the signed R2 URL.
// ========================================

function uploadFileToR2(
  file: File,
  uploadUrl: string,
  contentType: string,
  onProgress?: UploadProgressHandler
): Promise<void> {
  return new Promise(
    (resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.open(
        "PUT",
        uploadUrl,
        true
      );

      xhr.setRequestHeader(
        "Content-Type",
        contentType
      );

      xhr.timeout = 30 * 60 * 1000;

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

        onProgress(
          Math.min(percent, 99)
        );
      };

      xhr.onload = () => {
        if (
          xhr.status >= 200 &&
          xhr.status < 300
        ) {
          resolve();
        } else {
          reject(
            new Error(
              `Cloudflare R2 upload failed (${xhr.status}).`
            )
          );
        }
      };

      xhr.onerror = () => {
        reject(
          new Error(
            "Network error during media upload. Check your connection and R2 CORS settings."
          )
        );
      };

      xhr.ontimeout = () => {
        reject(
          new Error(
            "Media upload timed out."
          )
        );
      };

      xhr.onabort = () => {
        reject(
          new Error(
            "Media upload was cancelled."
          )
        );
      };

      xhr.send(file);
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
// 4. Confirm file exists
// 5. Return ID for draft database record
// ========================================

export async function uploadArtistMedia(
  file: File,
  kind: ArtistMediaKind,
  onProgress?: UploadProgressHandler
): Promise<ArtistUploadedMedia> {
  const mimeType = validateFile(
    file,
    kind
  );

  onProgress?.(0);

  const signedUpload =
    await requestUpload(
      file,
      kind,
      mimeType
    );

  if (
    !signedUpload.uploadId ||
    !signedUpload.uploadUrl
  ) {
    throw new Error(
      "Server did not return a valid upload URL."
    );
  }

  await uploadFileToR2(
    file,
    signedUpload.uploadUrl,
    signedUpload.contentType,
    onProgress
  );

  const confirmation =
    await confirmUpload(
      signedUpload.uploadId
    );

  if (
    confirmation.media.status !==
    "ready"
  ) {
    throw new Error(
      "The media upload has not been confirmed."
    );
  }

  onProgress?.(100);

  return {
    uploadId:
      confirmation.media.uploadId,

    kind,

    fileName: file.name,

    objectKey:
      confirmation.media.objectKey,

    size: file.size,
  };
}
