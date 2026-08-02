import { useEffect, useRef, useState } from 'react';

/** Hero source. Kept on CloudFront so production always scrubs the real asset. */
export const HERO_VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260729_102822_0e6c87e8-c141-4744-bf32-ad30db296371.mp4';

/** Optional local mirrors — dropped into /public they take over automatically. */
const LOCAL_VIDEO_URL = '/hero.mp4';
const POSTER_URL = '/hero-poster.jpg';

/** Frame cache tuning. */
const MAX_FRAMES = 90;
const FRAMES_PER_SECOND = 12;
const MIN_FRAMES = 24;
const MAX_FRAME_WIDTH = 960;

/** Scroll smoothing factor applied every animation frame. */
const LERP = 0.12;
/** Only re-seek the fallback <video> when the delta is worth a seek. */
const SEEK_EPSILON = 0.04;

type Frame = ImageBitmap | HTMLCanvasElement;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

/** object-cover math: scale to the larger axis, then center the overflow. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  source: Frame | HTMLVideoElement,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
) {
  if (!sourceWidth || !sourceHeight) return;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  ctx.drawImage(
    source,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function seekTo(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('seek failed'));
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = time;
  });
}

/**
 * Full-bleed background whose playhead is driven by page scroll only — never
 * autoplayed as a loop. Poster fades to <video>, and <video> hands off to a
 * <canvas> replaying pre-extracted frames once the cache is warm.
 */
export default function ScrollVideo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [hasFrame, setHasFrame] = useState(false);
  const [framesReady, setFramesReady] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);

  const framesRef = useRef<Frame[]>([]);
  const targetRef = useRef(0);
  const smoothedRef = useRef(0);
  const lastDrawnRef = useRef(-1);

  // Scroll → target progress.
  useEffect(() => {
    const readProgress = () => {
      const scrollable =
        document.documentElement.scrollHeight - window.innerHeight;
      targetRef.current =
        scrollable > 0 ? clamp01(window.scrollY / scrollable) : 0;
    };

    readProgress();
    window.addEventListener('scroll', readProgress, { passive: true });
    window.addEventListener('resize', readProgress);
    return () => {
      window.removeEventListener('scroll', readProgress);
      window.removeEventListener('resize', readProgress);
    };
  }, []);

  // Canvas sizing at capped DPR.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext('2d');
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      lastDrawnRef.current = -1;
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Smoothing loop: lerp toward the scroll target, then draw or seek.
  useEffect(() => {
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);

      smoothedRef.current += (targetRef.current - smoothedRef.current) * LERP;
      const progress = clamp01(smoothedRef.current);

      const frames = framesRef.current;
      const canvas = canvasRef.current;

      if (frames.length > 0 && canvas) {
        const index = Math.min(
          frames.length - 1,
          Math.round(progress * (frames.length - 1)),
        );
        if (index === lastDrawnRef.current) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const frame = frames[index];
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        ctx.clearRect(0, 0, width, height);
        drawCover(ctx, frame, frame.width, frame.height, width, height);
        lastDrawnRef.current = index;
        return;
      }

      const video = videoRef.current;
      if (!video || !Number.isFinite(video.duration) || video.duration <= 0) {
        return;
      }
      const time = progress * (video.duration - 0.05);
      if (Math.abs(video.currentTime - time) > SEEK_EPSILON) {
        try {
          video.currentTime = time;
        } catch {
          /* seeking before the media is ready — retry next frame */
        }
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Build the frame cache from an offscreen copy of the same video.
  useEffect(() => {
    let cancelled = false;
    let extractor: HTMLVideoElement | null = null;

    const extract = async () => {
      extractor = document.createElement('video');
      extractor.crossOrigin = 'anonymous';
      extractor.muted = true;
      extractor.playsInline = true;
      extractor.preload = 'auto';
      extractor.src = HERO_VIDEO_URL;

      await new Promise<void>((resolve, reject) => {
        const onReady = () => resolve();
        const onError = () => reject(new Error('frame source unavailable'));
        extractor!.addEventListener('loadedmetadata', onReady, { once: true });
        extractor!.addEventListener('error', onError, { once: true });
      });
      if (cancelled) return;

      const duration = extractor.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;

      const count = Math.max(
        MIN_FRAMES,
        Math.min(MAX_FRAMES, Math.round(duration * FRAMES_PER_SECOND)),
      );

      const sourceWidth = extractor.videoWidth;
      const sourceHeight = extractor.videoHeight;
      if (!sourceWidth || !sourceHeight) return;

      const width = Math.min(MAX_FRAME_WIDTH, sourceWidth);
      const height = Math.round((width / sourceWidth) * sourceHeight);

      const scratch = document.createElement('canvas');
      scratch.width = width;
      scratch.height = height;
      const scratchCtx = scratch.getContext('2d');
      if (!scratchCtx) return;

      const frames: Frame[] = [];
      for (let i = 0; i < count; i += 1) {
        if (cancelled) return;
        const time = (i / (count - 1)) * (duration - 0.05);
        await seekTo(extractor, time);
        if (cancelled) return;

        scratchCtx.drawImage(extractor, 0, 0, width, height);
        if (typeof createImageBitmap === 'function') {
          frames.push(await createImageBitmap(scratch));
        } else {
          const copy = document.createElement('canvas');
          copy.width = width;
          copy.height = height;
          copy.getContext('2d')?.drawImage(scratch, 0, 0);
          frames.push(copy);
        }
      }

      if (cancelled || frames.length === 0) return;
      framesRef.current = frames;
      lastDrawnRef.current = -1;
      setFramesReady(true);
    };

    // Let the visible video paint its first frame before we compete for bandwidth.
    const start = () => {
      window.setTimeout(() => {
        if (cancelled) return;
        extract().catch(() => {
          /* CORS-tainted or undecodable: the seek fallback keeps working */
        });
      }, 300);
    };

    const video = videoRef.current;
    if (video && video.readyState >= 2) {
      start();
    } else if (video) {
      video.addEventListener('loadeddata', start, { once: true });
    } else {
      start();
    }

    return () => {
      cancelled = true;
      if (extractor) {
        extractor.removeAttribute('src');
        extractor.load();
      }
      for (const frame of framesRef.current) {
        if ('close' in frame) frame.close();
      }
      framesRef.current = [];
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#0a0a0a]">
      {!posterFailed && (
        <img
          src={POSTER_URL}
          alt=""
          aria-hidden="true"
          onError={() => setPosterFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
            hasFrame || framesReady ? 'opacity-0' : 'opacity-100'
          }`}
        />
      )}

      <video
        ref={videoRef}
        src={HERO_VIDEO_URL}
        poster={posterFailed ? undefined : POSTER_URL}
        muted
        playsInline
        preload="auto"
        onLoadedData={() => setHasFrame(true)}
        onError={(event) => {
          // Fall back to a local mirror if one was dropped into /public.
          const el = event.currentTarget;
          if (!el.src.endsWith(LOCAL_VIDEO_URL)) el.src = LOCAL_VIDEO_URL;
        }}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
          hasFrame && !framesReady ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`absolute inset-0 h-full w-full transition-opacity duration-500 ${
          framesReady ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
}
