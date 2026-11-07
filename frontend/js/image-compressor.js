
"use strict";

// ========================================
// EMNET MUSIC IMAGE COMPRESSOR
// ========================================

async function compressImage(file, options = {}) {
  const {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.9,
    targetSizeKB = 500,
  } = options;

  if (!(file instanceof File)) {
    throw new Error("Please select a valid image.");
  }

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new Error(
      "Only JPG, PNG and WebP images are supported."
    );
  }

  // Safety limit for the original image.
  if (file.size > 25 * 1024 * 1024) {
    throw new Error(
      "The original image cannot exceed 25 MB."
    );
  }

  const image = await createImageBitmap(file);

  try {
    const scale = Math.min(
      1,
      maxWidth / image.width,
      maxHeight / image.height
    );

    const width = Math.max(
      1,
      Math.round(image.width * scale)
    );

    const height = Math.max(
      1,
      Math.round(image.height * scale)
    );

    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Image processing is unavailable.");
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    context.drawImage(image, 0, 0, width, height);

    const createBlob = (compressionQuality) =>
      new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(
                new Error("Unable to compress the image.")
              );
            }
          },
          "image/webp",
          compressionQuality
        );
      });

    let compressedBlob = await createBlob(quality);

    // Reduce quality gradually, avoiding aggressive compression.
    for (
      let currentQuality = quality - 0.05;
      compressedBlob.size > targetSizeKB * 1024 &&
      currentQuality >= 0.75;
      currentQuality -= 0.05
    ) {
      const candidate = await createBlob(currentQuality);

      if (candidate.size < compressedBlob.size) {
        compressedBlob = candidate;
      }
    }

    const originalName = file.name.replace(
      /\.[^.]+$/,
      ""
    );

    const compressedFile = new File(
      [compressedBlob],
      `${originalName}.webp`,
      {
        type: "image/webp",
        lastModified: Date.now(),
      }
    );

    // Avoid replacing a smaller original with a larger file.
    if (
      compressedFile.size >= file.size &&
      scale === 1
    ) {
      return file;
    }

    return compressedFile;
  } finally {
    image.close();
  }
}
