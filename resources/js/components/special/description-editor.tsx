'use client';

import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

import {
    Bold as BoldIcon,
    Italic as ItalicIcon,
    Underline as UnderlineIcon,
    Strikethrough,
    List,
    ListOrdered,
    Quote,
    Link2,
    Undo2,
    Redo2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/**
 * DescriptionEditor
 * ──────────────────
 * A lightweight WYSIWYG "description writer" built on Tiptap.
 * Stores/returns HTML (`value`), which drops straight into the
 * `products.description` text column and renders as-is on the storefront.
 *
 * Install:
 *   npm install @tiptap/react @tiptap/pm @tiptap/starter-kit \
 *               @tiptap/extension-underline @tiptap/extension-link @tiptap/extension-placeholder
 */

interface DescriptionEditorProps {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    heightClass?: string;
    error?: string;
    disabled?: boolean;
}

type HeadingOption = 'paragraph' | 'h1' | 'h2' | 'h3';

export default function DescriptionEditor({
    value,
    onChange,
    placeholder = 'Complete product details, specifications, etc...',
    heightClass = 'h-[320px]',
    error,
    disabled = false,
}: DescriptionEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
            }),
            Underline,
            Link.configure({
                openOnClick: false,
                autolink: true,
                HTMLAttributes: { class: 'text-primary underline underline-offset-2' },
            }),
            Placeholder.configure({ placeholder }),
        ],
        content: value || '',
        editable: !disabled,
        onUpdate: ({ editor }) => onChange(editor.getHTML()),
        editorProps: {
            attributes: {
                class: cn(
                    'focus:outline-none px-3 py-2.5 text-sm leading-relaxed text-foreground h-full',
                    '[&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-2 [&_h1]:mt-1',
                    '[&_h2]:text-base [&_h2]:font-bold [&_h2]:mb-2 [&_h2]:mt-1',
                    '[&_h3]:text-sm [&_h3]:font-bold [&_h3]:mb-1.5 [&_h3]:mt-1',
                    '[&_p]:mb-2 [&_p:last-child]:mb-0',
                    '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ul]:space-y-0.5',
                    '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_ol]:space-y-0.5',
                    '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground',
                    '[&_a]:cursor-pointer',
                ),
            },
        },
    });

    // Keep editor content in sync if `value` is reset externally (e.g. form reset)
    useEffect(() => {
        if (!editor) return;
        const current = editor.getHTML();
        if (value !== current && value !== undefined) {
            editor.commands.setContent(value || '', { emitUpdate: false });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, editor]);

    if (!editor) return null;

    const wordCount = editor.getText().trim() ? editor.getText().trim().split(/\s+/).length : 0;

    const currentHeading: HeadingOption = editor.isActive('heading', { level: 1 })
        ? 'h1'
        : editor.isActive('heading', { level: 2 })
          ? 'h2'
          : editor.isActive('heading', { level: 3 })
            ? 'h3'
            : 'paragraph';

    const applyHeading = (val: HeadingOption) => {
        if (val === 'paragraph') {
            editor.chain().focus().setParagraph().run();
        } else {
            const level = Number(val.replace('h', '')) as 1 | 2 | 3;
            editor.chain().focus().toggleHeading({ level }).run();
        }
    };

    const setLink = () => {
        const previousUrl = editor.getAttributes('link').href as string | undefined;
        const url = window.prompt('Enter URL', previousUrl || 'https://');
        if (url === null) return;
        if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    };

    const ToolbarButton = ({
        active,
        onClick,
        title,
        children,
    }: {
        active?: boolean;
        onClick: () => void;
        title: string;
        children: React.ReactNode;
    }) => (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            title={title}
            disabled={disabled}
            onClick={onClick}
            className={cn('size-7 text-muted-foreground', active && 'bg-primary/10 text-primary hover:bg-primary/15')}
        >
            {children}
        </Button>
    );

    return (
        <div className="space-y-1.5">
            <div
                className={cn(
                    'rounded-lg border border-input bg-background overflow-hidden flex flex-col',
                    heightClass,
                    error && 'border-destructive',
                    disabled && 'opacity-60',
                )}
            >
                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-0.5 border-b border-border/70 bg-muted/30 px-2 py-1.5 shrink-0">
                    <ToolbarButton title="Undo" onClick={() => editor.chain().focus().undo().run()}>
                        <Undo2 className="size-3.5" />
                    </ToolbarButton>
                    <ToolbarButton title="Redo" onClick={() => editor.chain().focus().redo().run()}>
                        <Redo2 className="size-3.5" />
                    </ToolbarButton>

                    <div className="mx-1 h-5 w-px bg-border" />

                    <Select value={currentHeading} onValueChange={(val) => applyHeading(val as HeadingOption)}>
                        <SelectTrigger
                            className={cn(
                                'max-h-6 w-26 gap-1 border-none bg-transparent px-4 py-0 text-xs font-normal text-muted-foreground shadow-none',
                                'hover:bg-accent hover:text-accent-foreground focus:ring-0 focus:ring-offset-0',
                                'data-[state=open]:bg-accent data-[state=open]:text-accent-foreground',
                            )}
                            disabled={disabled}
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="start" className="min-w-35">
                            <SelectItem value="paragraph">Paragraph</SelectItem>
                            <SelectItem value="h1">Heading 1</SelectItem>
                            <SelectItem value="h2">Heading 2</SelectItem>
                            <SelectItem value="h3">Heading 3</SelectItem>
                        </SelectContent>
                    </Select>

                    <div className="mx-1 h-5 w-px bg-border" />

                    <ToolbarButton
                        active={editor.isActive('bold')}
                        title="Bold"
                        onClick={() => editor.chain().focus().toggleBold().run()}
                    >
                        <BoldIcon className="size-3.5" />
                    </ToolbarButton>
                    <ToolbarButton
                        active={editor.isActive('italic')}
                        title="Italic"
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                    >
                        <ItalicIcon className="size-3.5" />
                    </ToolbarButton>
                    <ToolbarButton
                        active={editor.isActive('underline')}
                        title="Underline"
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                    >
                        <UnderlineIcon className="size-3.5" />
                    </ToolbarButton>
                    <ToolbarButton
                        active={editor.isActive('strike')}
                        title="Strikethrough"
                        onClick={() => editor.chain().focus().toggleStrike().run()}
                    >
                        <Strikethrough className="size-3.5" />
                    </ToolbarButton>

                    <div className="mx-1 h-5 w-px bg-border" />

                    <ToolbarButton
                        active={editor.isActive('bulletList')}
                        title="Bullet list"
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                    >
                        <List className="size-3.5" />
                    </ToolbarButton>
                    <ToolbarButton
                        active={editor.isActive('orderedList')}
                        title="Numbered list"
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    >
                        <ListOrdered className="size-3.5" />
                    </ToolbarButton>
                    <ToolbarButton
                        active={editor.isActive('blockquote')}
                        title="Quote"
                        onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    >
                        <Quote className="size-3.5" />
                    </ToolbarButton>

                    <div className="mx-1 h-5 w-px bg-border" />

                    <ToolbarButton active={editor.isActive('link')} title="Link" onClick={setLink}>
                        <Link2 className="size-3.5" />
                    </ToolbarButton>
                </div>

                {/* Scrollable editable area */}
                <div className="flex-1 overflow-y-auto">
                    <EditorContent editor={editor} className="h-full" />
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-border/70 bg-muted/20 px-3 py-1 text-[10.5px] text-muted-foreground shrink-0">
                    <span>Rich text · saved as HTML</span>
                    <span>{wordCount} words</span>
                </div>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
    );
}
