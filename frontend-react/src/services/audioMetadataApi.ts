
export function detectAudioDuration(
  file: File
): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio =
      document.createElement("audio");

    const objectUrl =
      URL.createObjectURL(file);

    let finished = false;

    const timer = window.setTimeout(
      () => {
        finish(
          new Error(
            "Unable to read the audio information."
          )
        );
      },
      15000
    );

    function finish(
      error?: Error,
      duration?: number
    ) {
      if (finished) return;

      finished = true;

      window.clearTimeout(timer);

      audio.onloadedmetadata = null;
      audio.onerror = null;

      audio.removeAttribute("src");
      audio.load();

      URL.revokeObjectURL(objectUrl);

      if (error) {
        reject(error);
      } else {
        resolve(duration || 0);
      }
    }

    audio.preload = "metadata";

    audio.onloadedmetadata = () => {
      const duration = audio.duration;

      if (
        !Number.isFinite(duration) ||
        duration < 1
      ) {
        finish(
          new Error(
            "The audio file has an invalid duration."
          )
        );

        return;
      }

      finish(
        undefined,
        Math.round(duration * 100) / 100
      );
    };

    audio.onerror = () => {
      finish(
        new Error(
          "Unable to read this audio file. Check its format or encoding."
        )
      );
    };

    audio.src = objectUrl;
  });
}

// ========================================
// FORMAT AUDIO DURATION
// ========================================

export function formatAudioDuration(
  duration: number
): string {
  if (
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return "Not detected";
  }

  const totalSeconds =
    Math.floor(duration);

  const minutes =
    Math.floor(totalSeconds / 60);

  const seconds =
    totalSeconds % 60;

  return `${minutes}:${String(
    seconds
  ).padStart(2, "0")}`;
}
