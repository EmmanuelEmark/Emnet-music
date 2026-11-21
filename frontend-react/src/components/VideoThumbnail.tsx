import "./VideoThumbnail.css";
import {
  useEffect,
  useState,
} from "react";

import { Clapperboard } from "lucide-react";

import {
  getVideoThumbnailUrl,
} from "../services/videoApi";

type Props = {
  videoId: string;
  fallbackUrl?: string;
  alt: string;
  className?: string;
};

export default function VideoThumbnail({
  videoId,
  fallbackUrl = "",
  alt,
  className = "",
}: Props) {
  const [src, setSrc] = useState(fallbackUrl);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    setSrc(fallbackUrl);
    setFailed(false);

    if (!videoId) {
      return () => controller.abort();
    }

    async function resolveThumbnail() {
      try {
        const url = await getVideoThumbnailUrl(
          videoId,
          controller.signal
        );

        if (!controller.signal.aborted) {
          setSrc(url);
          setFailed(false);
        }
      } catch {
        // Use the legacy URL if available.
        if (!controller.signal.aborted) {
          setSrc(fallbackUrl);
        }
      }
    }

    void resolveThumbnail();

    return () => {
      controller.abort();
    };
  }, [videoId, fallbackUrl]);

  return (
    <div className={`em-resolved-thumbnail ${className}`}>
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <Clapperboard
          size={34}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
