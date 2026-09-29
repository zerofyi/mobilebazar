import * as React from 'react';
import { router } from '@inertiajs/react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import {
    Command,
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { Search } from 'lucide-react';
import { getNavigationForRole } from '@/config/navigation';
import { useCan } from '@/hooks/use-can';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/types';

export interface SearchCommandProps {
    /**
     * Display mode:
     * - 'auto': Mobile icon trigger on small screens (< sm), full input on desktop (≥ sm).
     * - 'desktop': Always display the wide input-style search button.
     * - 'mobile': Always display the compact icon button.
     * @default 'auto'
     */
    variant?: 'auto' | 'desktop' | 'mobile';
    /**
     * Additional CSS classes to pass to the trigger button(s).
     */
    className?: string;
}

/**
 * Safely extracts a string URL from either a raw string or an Inertia UrlMethodPair object.
 */
function resolveUrl(href: NavItem['href']): { url: string; method?: string } {
    if (typeof href === 'string') {
        return { url: href };
    }
    if (href && typeof href === 'object' && 'url' in href) {
        return {
            url: href.url,
            method: 'method' in href && typeof href.method === 'string' ? href.method : undefined,
        };
    }
    return { url: '#' };
}

export function SearchCommand({
    variant = 'auto',
    className,
}: SearchCommandProps) {
    const [open, setOpen] = React.useState(false);
    const [isMac, setIsMac] = React.useState(true);

    const { primaryRole, can } = useCan();
    const currentNav = getNavigationForRole(primaryRole);

    // Detect platform for modifier key (⌘K vs Ctrl+K)
    React.useEffect(() => {
        if (typeof window !== 'undefined') {
            setIsMac(navigator.platform.toUpperCase().indexOf('MAC') >= 0);
        }
    }, []);

    // Global keyboard shortcut listener (⌘K / Ctrl+K)
    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((prev) => !prev);
            }
        };

        document.addEventListener('keydown', down);
        return () => document.removeEventListener('keydown', down);
    }, []);

    // Handle item selection and Inertia navigation
    const handleSelect = React.useCallback((href: NavItem['href']) => {
        setOpen(false);
        const { url, method } = resolveUrl(href);

        if (url && url !== '#') {
            router.visit(url, {
                method: (method as 'get' | 'post' | 'put' | 'patch' | 'delete') || 'get',
            });
        }
    }, []);

    // Flatten and filter navigation items based on user permissions
    const allNavItems = React.useMemo(() => {
        const items: NavItem[] = [];

        // Main Nav Items
        if (currentNav.mainNavItems) {
            items.push(...currentNav.mainNavItems);
        }

        // Grouped Nav Items
        if (currentNav.mainNavGroups) {
            for (const group of currentNav.mainNavGroups) {
                if (!group.permission || can(group.permission)) {
                    items.push(...group.items);
                }
            }
        }

        // Footer Nav Items
        if (currentNav.footerNavItems) {
            items.push(...currentNav.footerNavItems);
        }

        // Filter out items without granted permission
        return items.filter((item) => !item.permission || can(item.permission));
    }, [currentNav, can]);

    const showMobileTrigger = variant === 'auto' || variant === 'mobile';
    const showDesktopTrigger = variant === 'auto' || variant === 'desktop';

    return (
        <>
            {/* Mobile Icon Button */}
            {showMobileTrigger && (
                <Button
                    variant="outline"
                    size="icon"
                    className={cn(
                        "rounded-lg border-input bg-muted/20 hover:bg-accent hover:text-foreground",
                        variant === 'auto' && "sm:hidden",
                        className
                    )}
                    onClick={() => setOpen(true)}
                    aria-label="Open search menu"
                >
                    <Search className="size-4 opacity-70" />
                </Button>
            )}

            {/* Desktop Full Input Trigger */}
            {showDesktopTrigger && (
                <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                        "relative w-44 justify-start rounded-lg border-input bg-muted/20 pl-2.5 pr-12 text-xs font-normal text-muted-foreground/80 shadow-none hover:bg-accent hover:text-foreground md:w-60 lg:w-72",
                        variant === 'auto' && "hidden sm:inline-flex",
                        variant === 'desktop' && "inline-flex",
                        className
                    )}
                    onClick={() => setOpen(true)}
                >
                    <Search className="mr-2 size-3.5 shrink-0 opacity-60" />
                    <span className="truncate">Search or command...</span>

                    <Kbd className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2">
                        {isMac ? '⌘K' : 'Ctrl+K'}
                    </Kbd>
                </Button>
            )}

            {/* Command Palette Modal */}
            <CommandDialog open={open} onOpenChange={setOpen}>
                <Command>
                    <CommandInput placeholder="Type a command or search..." />
                    <CommandList>
                        <CommandEmpty>No results found.</CommandEmpty>

                        <CommandGroup heading="Navigation">
                            {allNavItems.map((item) => {
                                const Icon = item.icon;
                                const { url } = resolveUrl(item.href);

                                return (
                                    <CommandItem
                                        key={`${item.title}-${url}`}
                                        onSelect={() => handleSelect(item.href)}
                                        className="cursor-pointer"
                                    >
                                        {Icon && (
                                            <Icon className="mr-2 size-4 shrink-0 text-muted-foreground" />
                                        )}
                                        <span>{item.title}</span>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </CommandDialog>
        </>
    );
}
