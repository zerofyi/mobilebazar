import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
    type MouseEvent,
} from 'react';
import { X, Upload, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

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

export interface CompactImageUploaderProps {
    /** Label text displayed above the input */
    label: string;
    /** Controlled value: a File for new uploads, or a URL string for existing media */
    value?: File | string | null;
    /** Called with the selected File, or null when cleared */
    onChange: (file: File | null) => void;
    /** MIME type filter (default: 'image/*') */
    accept?: string;
    /** Native input name attribute */
    name?: string;
    /** Disables all interactions */
    disabled?: boolean;
    /**
     * Image compression via canvas. Set to false to disable (default).
     * quality: 0–1, e.g. 0.8 = 80%. SVGs are never compressed.
     */
    compression?: false | { quality: number };
    /** Extra classes on the root element */
    className?: string;
}

export default function CompactImageUploader({
    label,
    value,
    onChange,
    accept = 'image/*',
    name,
    disabled = false,
    compression = false,
    className,
}: CompactImageUploaderProps): React.JSX.Element {
    const inputRef = useRef<HTMLInputElement>(null);
    // Track whether we own the current object URL so we can revoke it
    const ownedUrlRef = useRef<string | null>(null);

    const [preview, setPreview] = useState<string | null>(() => {
        if (typeof value === 'string') return value;
        if (value instanceof File) {
            const url = URL.createObjectURL(value);
            ownedUrlRef.current = url;
            return url;
        }
        return null;
    });

    const [isLightboxOpen, setIsLightboxOpen] = useState(false);

    // Track the last File reference we created a blob URL for.
    // Inertia's useForm re-creates the `data` object on every setData call
    // (including unrelated field changes), so `value` gets a new object
    // identity on every keystroke even though the underlying File hasn't
    // changed. Without this guard every keystroke revokes and recreates the
    // blob URL, producing the cascade of failing/reloading image requests
    // visible in DevTools.
    const lastFileRef = useRef<File | null>(null);

    // Sync controlled `value` changes — skip if it is the same File object.
    useEffect(() => {
        if (value instanceof File && value === lastFileRef.current) return;

        if (ownedUrlRef.current) {
            URL.revokeObjectURL(ownedUrlRef.current);
            ownedUrlRef.current = null;
        }

        if (value instanceof File) {
            lastFileRef.current = value;
            const url = URL.createObjectURL(value);
            ownedUrlRef.current = url;
            setPreview(url);
        } else if (typeof value === 'string') {
            lastFileRef.current = null;
            setPreview(value);
        } else {
            lastFileRef.current = null;
            setPreview(null);
        }
    }, [value]);

    // Cleanup owned URL on unmount
    useEffect(() => {
        return () => {
            if (ownedUrlRef.current) URL.revokeObjectURL(ownedUrlRef.current);
        };
    }, []);

    // Lock body scroll and bind Escape key when lightbox is open
    useEffect(() => {
        if (!isLightboxOpen) return;

        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsLightboxOpen(false);
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = prev;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isLightboxOpen]);

    const handleFileChange = useCallback(
        async (e: ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) {
                const final =
                    compression && file.type.startsWith('image/') && file.type !== 'image/svg+xml'
                        ? await compressImage(file, compression.quality)
                        : file;
                onChange(final);
            }
            e.target.value = '';
        },
        [onChange, compression],
    );

    const handleClear = useCallback(
        (e: MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            if (ownedUrlRef.current) {
                URL.revokeObjectURL(ownedUrlRef.current);
                ownedUrlRef.current = null;
            }
            setPreview(null);
            setIsLightboxOpen(false);
            onChange(null);
            if (inputRef.current) inputRef.current.value = '';
        },
        [onChange],
    );

    const displayFileName =
        value instanceof File
            ? value.name
            : typeof value === 'string'
              ? value.split('/').pop()?.split('?')[0] || 'Image'
              : 'Image';

    return (
        <div className={cn('w-full space-y-1', disabled && 'cursor-not-allowed opacity-60', className)}>
            <span className="block select-none truncate text-[11px] font-medium text-muted-foreground">
                {label}
            </span>

            {preview ? (
                <div className="box-border flex h-8 w-full items-center justify-between rounded-md border border-primary bg-accent/40 p-1 text-xs transition-shadow focus-within:ring-1 focus-within:ring-primary">
                    {/* Thumbnail + filename — opens lightbox */}
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() => setIsLightboxOpen(true)}
                        aria-label={`Preview ${displayFileName}`}
                        className="group flex h-full min-w-0 flex-1 items-center gap-2 overflow-hidden text-left outline-none disabled:cursor-not-allowed focus-visible:ring-1 focus-visible:ring-primary rounded"
                    >
                        <div className="relative size-6 shrink-0 overflow-hidden rounded border bg-background">
                            <img
                                src={preview}
                                alt=""
                                aria-hidden="true"
                                className="h-full w-full select-none object-cover"
                                loading="lazy"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
                                <Eye className="size-2.5 text-white" />
                            </div>
                        </div>
                        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground group-hover:underline decoration-muted-foreground/60">
                            {displayFileName}
                        </span>
                    </button>

                    {/* Clear button */}
                    <button
                        type="button"
                        disabled={disabled}
                        onClick={handleClear}
                        aria-label="Remove image"
                        className="ml-1.5 shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:text-destructive focus:outline-none focus-visible:ring-1 focus-visible:ring-destructive disabled:pointer-events-none"
                    >
                        <X className="size-3.5" />
                    </button>
                </div>
            ) : (
                <label
                    className={cn(
                        'box-border flex h-8 w-full select-none items-center justify-center gap-1.5 rounded-md border border-dashed bg-background px-2 text-[11px] text-muted-foreground transition-all',
                        disabled
                            ? 'cursor-not-allowed border-muted'
                            : 'cursor-pointer hover:border-muted-foreground/50 hover:bg-accent/50 active:scale-[0.99]',
                    )}
                >
                    <Upload className="size-3 shrink-0" />
                    <span className="font-medium">Upload</span>
                    <input
                        ref={inputRef}
                        type="file"
                        name={name}
                        accept={accept}
                        disabled={disabled}
                        onChange={handleFileChange}
                        aria-hidden="true"
                        tabIndex={-1}
                        className="sr-only"
                    />
                </label>
            )}

            {/* Lightbox */}
            {isLightboxOpen && preview && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Preview: ${displayFileName}`}
                    onClick={() => setIsLightboxOpen(false)}
                >
                    <div
                        className="relative flex w-full max-w-2xl flex-col rounded-xl bg-background p-3 shadow-2xl"
                        onClick={(e: MouseEvent) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="mb-3 flex items-center justify-between border-b pb-2">
                            <span className="max-w-[85%] select-none truncate text-xs font-semibold text-foreground">
                                {displayFileName}
                            </span>
                            <button
                                type="button"
                                onClick={() => setIsLightboxOpen(false)}
                                aria-label="Close preview"
                                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                            >
                                <X className="size-4" />
                            </button>
                        </div>

                        {/* Image */}
                        <div className="flex min-h-40 max-h-[70vh] items-center justify-center overflow-hidden rounded-lg bg-muted/40 p-2">
                            <img
                                src={preview}
                                alt={displayFileName}
                                className="max-h-[65vh] max-w-full select-none rounded-md object-contain shadow-sm"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
