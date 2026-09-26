import React, { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { AlertCircleIcon, ImageIcon, UploadIcon, XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SingleImageUploaderProps {
    /** Text shown in the empty state */
    label?: string;
    /** Controlled value: existing File object or a remote URL string */
    value?: File | string | null;
    /** Called with the new File when one is selected, or null when removed */
    onChange: (file: File | null) => void;
    /** Maximum allowed file size in MB (default: 2) */
    maxSizeMB?: number;
    /** Comma-separated MIME types accepted (default: common image formats) */
    accept?: string;
    /** Whether the uploader is disabled */
    disabled?: boolean;
    /**
     * Image compression via canvas. Set to false to disable (default).
     * quality: 0–1, e.g. 0.8 = 80%. SVGs are never compressed.
     */
    compression?: false | { quality: number };
    /** Extra classes on the root element */
    className?: string;
}

const DEFAULT_ACCEPT = 'image/svg+xml,image/png,image/jpeg,image/jpg,image/webp,image/gif';

async function compressImage(file: File, quality: number): Promise<File> {
    return new Promise((resolve) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) { URL.revokeObjectURL(objectUrl); resolve(file); return; }
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(
                (blob) => {
                    URL.revokeObjectURL(objectUrl);
                    if (!blob) { resolve(file); return; }
                    resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
                },
                'image/jpeg',
                Math.min(1, Math.max(0, quality)),
            );
        };
        img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
        img.src = objectUrl;
    });
}

export default function SingleImageUploader({
    label = 'Drop your image here',
    value,
    onChange,
    maxSizeMB = 2,
    accept = DEFAULT_ACCEPT,
    disabled = false,
    compression = false,
    className,
}: SingleImageUploaderProps) {
    const maxSize = maxSizeMB * 1024 * 1024;
    const inputRef = useRef<HTMLInputElement>(null);

    // Track whether we own the current object URL so we can revoke it on cleanup
    const ownedUrlRef = useRef<string | null>(null);

    const [previewUrl, setPreviewUrl] = useState<string | null>(() => {
        if (typeof value === 'string') return value;
        if (value instanceof File) {
            const url = URL.createObjectURL(value);
            ownedUrlRef.current = url;
            return url;
        }
        return null;
    });

    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Track the last File reference so we skip the effect when Inertia
    // re-wraps form state on an unrelated setData call (same File, new object
    // wrapper) — preventing the blob-recreation / network waterfall bug.
    const lastFileRef = useRef<File | null>(null);

    // Sync when the controlled `value` prop changes externally
    useEffect(() => {
        if (value instanceof File && value === lastFileRef.current) return;

        if (ownedUrlRef.current) {
            URL.revokeObjectURL(ownedUrlRef.current);
            ownedUrlRef.current = null;
        }

        if (typeof value === 'string') {
            lastFileRef.current = null;
            setPreviewUrl(value);
        } else if (value instanceof File) {
            lastFileRef.current = value;
            const url = URL.createObjectURL(value);
            ownedUrlRef.current = url;
            setPreviewUrl(url);
        } else {
            lastFileRef.current = null;
            setPreviewUrl(null);
        }
    }, [value]);

    // Final cleanup on unmount
    useEffect(() => {
        return () => {
            if (ownedUrlRef.current) {
                URL.revokeObjectURL(ownedUrlRef.current);
            }
        };
    }, []);

    const validateAndAccept = useCallback(
        (file: File): boolean => {
            setError(null);

            if (file.size > maxSize) {
                setError(`File size exceeds the ${maxSizeMB} MB limit.`);
                return false;
            }

            // Validate MIME type against the accept list
            const acceptedTypes = accept.split(',').map((t) => t.trim());
            const isAccepted = acceptedTypes.some((type) => {
                if (type.endsWith('/*')) return file.type.startsWith(type.replace('/*', '/'));
                if (type.startsWith('.')) return file.name.toLowerCase().endsWith(type.toLowerCase());
                return file.type === type;
            });

            if (!isAccepted) {
                setError('File type not supported. Please upload an image.');
                return false;
            }

            return true;
        },
        [accept, maxSize, maxSizeMB],
    );

    const processFile = useCallback(
        async (file: File) => {
            if (!validateAndAccept(file)) return;

            const final =
                compression && file.type.startsWith('image/') && file.type !== 'image/svg+xml'
                    ? await compressImage(file, compression.quality)
                    : file;

            if (ownedUrlRef.current) URL.revokeObjectURL(ownedUrlRef.current);
            const url = URL.createObjectURL(final);
            ownedUrlRef.current = url;
            setPreviewUrl(url);
            onChange(final);
        },
        [validateAndAccept, onChange, compression],
    );

    const handleRemove = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation();
            if (ownedUrlRef.current) {
                URL.revokeObjectURL(ownedUrlRef.current);
                ownedUrlRef.current = null;
            }
            setPreviewUrl(null);
            setError(null);
            onChange(null);
            // Reset the input so the same file can be re-selected
            if (inputRef.current) inputRef.current.value = '';
        },
        [onChange],
    );

    const handleInputChange = useCallback(
        (e: ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) processFile(file);
            // Reset so the same file triggers onChange again if re-selected
            e.target.value = '';
        },
        [processFile],
    );

    const handleDrop = useCallback(
        (e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setIsDragging(false);
            if (disabled) return;
            const file = e.dataTransfer.files?.[0];
            if (file) processFile(file);
        },
        [processFile, disabled],
    );

    const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        // Only clear if leaving the drop zone entirely (not entering a child)
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setIsDragging(false);
        }
    }, []);

    const openFilePicker = useCallback(() => {
        if (!disabled) inputRef.current?.click();
    }, [disabled]);

    return (
        <div className={cn('flex flex-col gap-2', className)}>
            <div className="relative h-full min-h-36">
                {/* Drop Zone */}
                <div
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-disabled={disabled}
                    aria-label={previewUrl ? 'Image upload area — image selected' : 'Image upload area'}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={openFilePicker}
                    onKeyDown={(e) => e.key === 'Enter' && openFilePicker()}
                    className={cn(
                        'relative flex h-full min-h-36 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-input p-4 outline-none transition-colors',
                        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        isDragging && 'border-primary bg-accent/50',
                        previewUrl && 'border-solid border-border',
                        disabled && 'cursor-not-allowed opacity-60',
                    )}
                >
                    {/* Hidden native file input */}
                    <input
                        ref={inputRef}
                        type="file"
                        accept={accept}
                        onChange={handleInputChange}
                        aria-hidden="true"
                        tabIndex={-1}
                        disabled={disabled}
                        className="sr-only"
                    />

                    {previewUrl ? (
                        <div className="absolute inset-0 flex items-center justify-center p-2 bg-background">
                            <img
                                src={previewUrl}
                                alt="Selected image preview"
                                className="mx-auto max-h-full max-w-full rounded object-contain"
                            />
                        </div>
                    ) : (
                        <div className="pointer-events-none flex flex-col items-center justify-center px-2 py-3 text-center">
                            <div className="mb-2 flex size-10 items-center justify-center rounded-full border bg-background">
                                <ImageIcon className="size-4 opacity-60" />
                            </div>
                            <p className="mb-1 text-xs font-medium text-foreground">{label}</p>
                            <p className="text-[10px] text-muted-foreground">
                                PNG, JPG, WEBP or SVG (max. {maxSizeMB} MB)
                            </p>
                            <span
                                className="pointer-events-none mt-3 inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors"
                                aria-hidden="true"
                            >
                                <UploadIcon className="mr-1.5 size-3.5 opacity-60" />
                                Select Image
                            </span>
                        </div>
                    )}
                </div>

                {/* Remove button */}
                {previewUrl && !disabled && (
                    <div className="absolute right-2 top-2 z-20">
                        <button
                            type="button"
                            aria-label="Remove selected image"
                            onClick={handleRemove}
                            className="flex size-7 items-center justify-center rounded-full bg-black/70 text-white transition-colors hover:bg-black/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <XIcon className="size-3.5" />
                        </button>
                    </div>
                )}
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-1 text-xs text-destructive" role="alert" aria-live="polite">
                    <AlertCircleIcon className="size-3 shrink-0" />
                    <span>{error}</span>
                </div>
            )}
        </div>
    );
}
