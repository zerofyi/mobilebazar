import { usePage } from '@inertiajs/react';

export function AppSidebarFooter() {
    const { name } = usePage<{ name: string }>().props;

    return (
        <footer className="border-sidebar-border/50 flex h-14 shrink-0 items-center justify-between border-t px-6 text-[11px] text-muted-foreground md:px-6">
            <div className="flex items-center gap-2">
                <p>&copy; {new Date().getFullYear()} {name}<sup>&reg;</sup> All rights reserved.</p>
            </div>

            <div className="flex items-center gap-2">
                <p>
                    Developed by <a href="https://zerofyi.in/" target="_blank" rel="noreferrer" className="font-medium text-foreground hover:underline">NEXTGEN IT TECHNOLOGIES</a>
                </p>
            </div>
        </footer>
    );
}
