"use client";

import React, { useCallback, useRef, useState, type DragEvent } from "react";
import {
    AlertCircleIcon,
    GripVerticalIcon,
    ImageIcon,
    Trash2Icon,
    UploadIcon,
    XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatBytes, useFileUpload, type FileMetadata } from "@/hooks/use-file-upload";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MultipleImageUploaderProps {
    /** Controlled list of files/existing URLs */
    value?: Array<File | FileMetadata>;
    /** Called whenever the list changes */
    onChange?: (files: Array<File | FileMetadata>) => void;
    /** Maximum number of images allowed (default: 4) */
    maxFiles?: number;
    /** Maximum file size in MB (default: 2) */
    maxSizeMB?: number;
    /**
     * Fixed column count for the image grid.
     * When omitted (default), all images fit in a single row within the parent width.
     */
    cols?: number;
    /**
     * When true, images are ordered — first is the primary image.
     * Users can drag cards to reorder. (default: true)
     */
    inOrder?: boolean;
    /**
     * Image compression options. Set to false to disable (default).
     * When enabled, images are compressed via canvas before being stored.
     */
    compression?: false | { quality: number };
    /** Extra classes on root element */
    className?: string;
    /** Disable all interactions */
    disabled?: boolean;
}

// ─── Compression helper ───────────────────────────────────────────────────────

async function compressImage(file: File, quality: number): Promise<File> {
    return new Promise((resolve) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);

        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
                URL.revokeObjectURL(objectUrl);
                resolve(file); // fallback: return original
                return;
            }
            ctx.drawImage(img, 0, 0);
            canvas.toBlob(
                (blob) => {
                    URL.revokeObjectURL(objectUrl);
                    if (!blob) {
                        resolve(file);
                        return;
                    }
                    resolve(new File([blob], file.name, { type: "image/jpeg", lastModified: Date.now() }));
                },
                "image/jpeg",
                Math.min(1, Math.max(0, quality)),
            );
        };

        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(file); // fallback: return original
        };

        img.src = objectUrl;
    });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MultipleImageUploader({
    value,
    onChange,
    maxFiles = 4,
    maxSizeMB = 2,
    inOrder = true,
    compression = false,
    cols,
    className,
    disabled = false,
}: MultipleImageUploaderProps) {
    const maxSize = maxSizeMB * 1024 * 1024;

    const [
        { files, isDragging, errors },
        {
            handleDragEnter,
            handleDragLeave,
            handleDragOver,
            handleDrop: hookHandleDrop,
            openFileDialog,
            removeFile,
            clearFiles,
            getInputProps,
            reorderFiles,
            addFiles,
        },
    ] = useFileUpload({
        accept: "image/svg+xml,image/png,image/jpeg,image/jpg,image/webp,image/gif",
        maxSize,
        maxFiles,
        multiple: true,
        initialFiles: value?.filter((v): v is FileMetadata => !(v instanceof File)),
        onFilesChange: (updated) => onChange?.(updated.map((f) => f.file)),
    });

    // ── Compression: intercept file adds ──────────────────────────────────────
    const handleFilesWithCompression = useCallback(
        async (incoming: FileList | File[]) => {
            const arr = Array.from(incoming);
            if (!compression) {
                addFiles(arr);
                return;
            }
            const compressed = await Promise.all(
                arr.map((f) =>
                    f.type.startsWith("image/") && f.type !== "image/svg+xml"
                        ? compressImage(f, compression.quality)
                        : f,
                ),
            );
            addFiles(compressed);
        },
        [compression, addFiles],
    );

    // Override drop to run compression first
    const handleDrop = useCallback(
        (e: DragEvent<HTMLElement>) => {
            e.preventDefault();
            e.stopPropagation();
            if (disabled) return;
            if (e.dataTransfer.files?.length) {
                handleFilesWithCompression(e.dataTransfer.files);
            }
        },
        [disabled, handleFilesWithCompression],
    );

    // ── Card drag-to-reorder state ────────────────────────────────────────────
    const dragCardIndex = useRef<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const onCardDragStart = useCallback((index: number) => {
        dragCardIndex.current = index;
    }, []);

    const onCardDragOver = useCallback(
        (e: DragEvent<HTMLDivElement>, index: number) => {
            // Only intercept if we're reordering cards, not dropping files
            if (dragCardIndex.current === null) return;
            e.preventDefault();
            e.stopPropagation();
            setDragOverIndex(index);
        },
        [],
    );

    const onCardDrop = useCallback(
        (e: DragEvent<HTMLDivElement>, toIndex: number) => {
            if (dragCardIndex.current === null) return;
            e.preventDefault();
            e.stopPropagation();
            reorderFiles(dragCardIndex.current, toIndex);
            dragCardIndex.current = null;
            setDragOverIndex(null);
        },
        [reorderFiles],
    );

    const onCardDragEnd = useCallback(() => {
        dragCardIndex.current = null;
        setDragOverIndex(null);
    }, []);

    // ── Input change with compression ─────────────────────────────────────────
    const handleInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            if (e.target.files?.length) {
                handleFilesWithCompression(e.target.files);
                e.target.value = "";
            }
        },
        [handleFilesWithCompression],
    );

    const inputProps = getInputProps();
    const atLimit = files.length >= maxFiles;

    return (
        <div className={cn("flex flex-col gap-2", className)}>
            {/* ── Drop zone ── */}
            <div
                className={cn(
                    "relative min-h-52 overflow-hidden rounded-xl border border-dashed border-input p-4 transition-colors",
                    "has-[input:focus]:border-ring has-[input:focus]:ring-[3px] has-[input:focus]:ring-ring/50",
                    isDragging && "bg-accent/50 border-primary",
                    disabled && "cursor-not-allowed opacity-60",
                    files.length > 0 ? "flex flex-col gap-3" : "flex flex-col items-center justify-center",
                )}
                onDragEnter={!disabled ? handleDragEnter : undefined}
                onDragLeave={!disabled ? handleDragLeave : undefined}
                onDragOver={!disabled ? handleDragOver : undefined}
                onDrop={!disabled ? handleDrop : undefined}
            >
                {/* Hidden input — controlled manually for compression support */}
                <input
                    {...inputProps}
                    onChange={handleInputChange}
                    disabled={disabled}
                    aria-label="Upload images"
                    className="sr-only"
                />

                {files.length > 0 ? (
                    <>
                        {/* Header */}
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <h3 className="truncate text-sm font-medium">
                                    Images ({files.length}/{maxFiles})
                                </h3>
                                {inOrder && (
                                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                        Drag to reorder
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-2">
                                {!atLimit && (
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={disabled}
                                        onClick={openFileDialog}
                                    >
                                        <UploadIcon className="-ms-0.5 size-3.5 opacity-60" />
                                        Add Images
                                    </Button>
                                )}
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={disabled}
                                    onClick={clearFiles}
                                >
                                    <Trash2Icon className="-ms-0.5 size-3.5 opacity-60" />
                                    Remove all
                                </Button>
                            </div>
                        </div>

                        {/* Grid — fills parent width by default; fixed cols when prop is set */}
                        <div
                            className="grid gap-3"
                            style={{
                                gridTemplateColumns: cols
                                    ? `repeat(${cols}, minmax(0, 1fr))`
                                    : `repeat(${files.length}, minmax(0, 1fr))`,
                            }}
                        >
                            {files.map((file, index) => {
                                const previewSrc =
                                    file.preview ||
                                    (file.file instanceof File
                                        ? undefined
                                        : (file.file as FileMetadata).url);

                                const isPrimary = inOrder && index === 0;
                                const isDragTarget = dragOverIndex === index;

                                return (
                                    <div
                                        key={file.id}
                                        draggable={inOrder && !disabled}
                                        onDragStart={() => onCardDragStart(index)}
                                        onDragOver={(e) => onCardDragOver(e, index)}
                                        onDrop={(e) => onCardDrop(e, index)}
                                        onDragEnd={onCardDragEnd}
                                        className={cn(
                                            "group relative flex flex-col rounded-md border bg-background transition-all",
                                            inOrder && !disabled && "cursor-grab active:cursor-grabbing",
                                            isDragTarget && "scale-[1.02] border-primary shadow-md",
                                        )}
                                    >
                                        {/* Image preview */}
                                        <div className="relative aspect-square overflow-hidden rounded-t-[inherit] bg-accent">
                                            {previewSrc ? (
                                                <img
                                                    src={previewSrc}
                                                    alt={file.file.name}
                                                    className="h-full w-full object-cover"
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <div className="flex h-full w-full items-center justify-center">
                                                    <ImageIcon className="size-6 opacity-40" />
                                                </div>
                                            )}

                                            {/* Primary badge */}
                                            {isPrimary && (
                                                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground shadow">
                                                    Primary
                                                </span>
                                            )}

                                            {/* Drag handle hint */}
                                            {inOrder && !disabled && (
                                                <div className="absolute left-1.5 top-1.5 rounded-md bg-black/50 p-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                                    <GripVerticalIcon className="size-3.5 text-white" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Remove button */}
                                        {!disabled && (
                                            <button
                                                type="button"
                                                aria-label={`Remove ${file.file.name}`}
                                                onClick={() => removeFile(file.id)}
                                                className={cn(
                                                    "absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow",
                                                    "opacity-0 transition-opacity group-hover:opacity-100",
                                                    "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                                )}
                                            >
                                                <XIcon className="size-3" />
                                            </button>
                                        )}

                                        {/* File info */}
                                        <div className="flex min-w-0 flex-col gap-0.5 border-t p-2">
                                            <p className="truncate text-[12px] font-medium leading-tight">
                                                {file.file.name}
                                            </p>
                                            <p className="truncate text-[11px] text-muted-foreground">
                                                {formatBytes(file.file.size)}
                                                {inOrder && index > 0 && (
                                                    <span className="ml-1 text-muted-foreground/60">
                                                        #{index + 1}
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                ) : (
                    /* Empty state */
                    <div className="flex flex-col items-center justify-center px-4 py-3 text-center">
                        <div className="mb-2 flex size-11 shrink-0 items-center justify-center rounded-full border bg-background">
                            <ImageIcon className="size-4 opacity-60" aria-hidden="true" />
                        </div>
                        <p className="mb-1 text-sm font-medium">Drop images here</p>
                        <p className="text-xs text-muted-foreground">
                            Up to {maxFiles} images · Max {maxSizeMB} MB each
                            {compression && ` · Compressed at ${Math.round(compression.quality * 100)}% quality`}
                        </p>
                        <Button
                            type="button"
                            className="mt-4"
                            variant="outline"
                            disabled={disabled}
                            onClick={openFileDialog}
                        >
                            <UploadIcon aria-hidden="true" className="-ms-1 opacity-60" />
                            Select images
                        </Button>
                    </div>
                )}
            </div>

            {/* Errors */}
            {errors.length > 0 && (
                <div
                    className="flex items-center gap-1 text-xs text-destructive"
                    role="alert"
                    aria-live="polite"
                >
                    <AlertCircleIcon className="size-3 shrink-0" />
                    <span>{errors[0]}</span>
                </div>
            )}
        </div>
    );
}
