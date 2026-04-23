'use client';

import {
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { cn } from '../lib/cn';
import { Button } from './button';

/**
 * Inline image cropper — accepts a file upload, lets the operator pan and
 * zoom to frame the shot, and hands back a cropped data URL.
 *
 * Dependency-free: draws to a canvas and outputs `image/jpeg` (quality 0.9)
 * so the payload stays close to input sizes even at higher resolutions.
 */

export interface ImageCropProps {
  /** Current stored image (data URL or remote URL). Displayed as a preview. */
  value: string | null | undefined;
  /** Called with the cropped output (data URL). */
  onChange: (dataUrl: string) => void;
  /** Remove the current image. */
  onRemove?: () => void;
  /** Width/height ratio for the crop area. Defaults to 1 (square). */
  aspectRatio?: number;
  /** Output size in pixels (longer edge). Defaults to 960. */
  outputSize?: number;
  /** Max upload size in bytes. Defaults to 8 MB. */
  maxBytes?: number;
  label?: string;
  className?: string;
}

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_OUTPUT_SIZE = 960;

export function ImageCrop({
  value,
  onChange,
  onRemove,
  aspectRatio = 1,
  outputSize = DEFAULT_OUTPUT_SIZE,
  maxBytes = DEFAULT_MAX_BYTES,
  label = 'Image',
  className,
}: ImageCropProps) {
  const [sourceDataUrl, setSourceDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setError(null);
      const file = event.target.files?.[0];
      if (!file) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setError('Use a JPG, PNG, or WebP image.');
        event.target.value = '';
        return;
      }
      if (file.size > maxBytes) {
        setError(`Images must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`);
        event.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setSourceDataUrl(reader.result);
        } else {
          setError('Failed to read image.');
        }
      };
      reader.onerror = () => setError('Failed to read image.');
      reader.readAsDataURL(file);
      event.target.value = '';
    },
    [maxBytes],
  );

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          <img
            src={value}
            alt=""
            className="border-ink-200 dark:border-ink-700 h-20 w-20 rounded-md border object-cover"
          />
        ) : (
          <div className="border-ink-200 dark:border-ink-700 bg-canvas-100 dark:bg-ink-900 text-ink-500 flex h-20 w-20 items-center justify-center rounded-md border border-dashed text-[10px]">
            No image
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            {value ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
          </Button>
          {value && onRemove ? (
            <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
              Remove
            </Button>
          ) : null}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFile}
          className="hidden"
        />
      </div>

      {error ? <p className="text-mkrose-600 text-xs">{error}</p> : null}

      {sourceDataUrl ? (
        <CropEditor
          source={sourceDataUrl}
          aspectRatio={aspectRatio}
          outputSize={outputSize}
          onCancel={() => setSourceDataUrl(null)}
          onConfirm={(dataUrl) => {
            onChange(dataUrl);
            setSourceDataUrl(null);
          }}
        />
      ) : null}
    </div>
  );
}

interface CropEditorProps {
  source: string;
  aspectRatio: number;
  outputSize: number;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

function CropEditor({ source, aspectRatio, outputSize, onCancel, onConfirm }: CropEditorProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [imageDims, setImageDims] = useState<{ width: number; height: number } | null>(null);
  const [frameDims, setFrameDims] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  // Load the source image to read its natural dimensions, then initialize the
  // frame so the whole image fits (centered) at zoom=1.
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImageDims({ width: img.naturalWidth, height: img.naturalHeight });
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    img.src = source;
  }, [source]);

  useEffect(() => {
    if (!frameRef.current) return;
    const update = () => {
      if (!frameRef.current) return;
      const rect = frameRef.current.getBoundingClientRect();
      setFrameDims({ width: rect.width, height: rect.width / aspectRatio });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(frameRef.current);
    return () => ro.disconnect();
  }, [aspectRatio]);

  if (!imageDims || !frameDims) {
    // Still initializing — render the frame so the ResizeObserver can measure.
    return (
      <div
        ref={frameRef}
        className="border-ink-200 dark:border-ink-700 bg-canvas-100 dark:bg-ink-900 relative overflow-hidden rounded-lg border"
        style={{ aspectRatio }}
      />
    );
  }

  // The image is scaled to *cover* the frame at zoom=1 (whichever edge is
  // shortest meets the frame). Increasing zoom scales further.
  const imageAspect = imageDims.width / imageDims.height;
  const frameAspect = frameDims.width / frameDims.height;
  let coverWidth: number;
  let coverHeight: number;
  if (imageAspect > frameAspect) {
    coverHeight = frameDims.height;
    coverWidth = coverHeight * imageAspect;
  } else {
    coverWidth = frameDims.width;
    coverHeight = coverWidth / imageAspect;
  }
  const renderedWidth = coverWidth * zoom;
  const renderedHeight = coverHeight * zoom;

  // Clamp offset so the image always covers the frame.
  const minOffsetX = frameDims.width - renderedWidth;
  const maxOffsetX = 0;
  const minOffsetY = frameDims.height - renderedHeight;
  const maxOffsetY = 0;
  const clampedX = Math.min(Math.max(offset.x, minOffsetX), maxOffsetX);
  const clampedY = Math.min(Math.max(offset.y, minOffsetY), maxOffsetY);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: clampedX,
      originY: clampedY,
    };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current) return;
    const dx = event.clientX - dragStateRef.current.startX;
    const dy = event.clientY - dragStateRef.current.startY;
    setOffset({
      x: dragStateRef.current.originX + dx,
      y: dragStateRef.current.originY + dy,
    });
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragStateRef.current = null;
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + (event.deltaY < 0 ? 0.1 : -0.1)));
    setZoom(Number(next.toFixed(3)));
  };

  const handleConfirm = () => {
    const img = imageRef.current;
    if (!img) return;
    // Convert the visible frame rect into source-image pixel coordinates.
    const scaleFromDisplayToSource = imageDims.width / renderedWidth;
    const sourceCropX = -clampedX * scaleFromDisplayToSource;
    const sourceCropY = -clampedY * scaleFromDisplayToSource;
    const sourceCropWidth = frameDims.width * scaleFromDisplayToSource;
    const sourceCropHeight = frameDims.height * scaleFromDisplayToSource;

    const canvas = document.createElement('canvas');
    const outW = aspectRatio >= 1 ? outputSize : Math.round(outputSize * aspectRatio);
    const outH = aspectRatio >= 1 ? Math.round(outputSize / aspectRatio) : outputSize;
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(
      img,
      sourceCropX,
      sourceCropY,
      sourceCropWidth,
      sourceCropHeight,
      0,
      0,
      outW,
      outH,
    );
    onConfirm(canvas.toDataURL('image/jpeg', 0.9));
  };

  return (
    <div className="border-ink-200 dark:border-ink-700 bg-surface dark:bg-ink-900 space-y-3 rounded-lg border p-3">
      <div
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        className="bg-ink-950 relative w-full cursor-grab touch-none overflow-hidden rounded-md active:cursor-grabbing"
        style={{ aspectRatio }}
      >
        <img
          src={source}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: clampedX,
            top: clampedY,
            width: renderedWidth,
            height: renderedHeight,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
        {/* Subtle grid overlay to aid framing */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 top-1/3 h-px bg-white/30" />
          <div className="absolute inset-x-0 top-2/3 h-px bg-white/30" />
          <div className="absolute inset-y-0 left-1/3 w-px bg-white/30" />
          <div className="absolute inset-y-0 left-2/3 w-px bg-white/30" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="flex flex-1 items-center gap-2 text-xs">
          Zoom
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="flex-1 accent-current"
          />
        </label>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={handleConfirm}>
          Use this crop
        </Button>
      </div>
    </div>
  );
}
