import { usePage } from '@inertiajs/react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserInfo } from '@/components/user-info';
import { UserMenuContent } from '@/components/user-menu-content';

export function TopNavUser() {
    const { auth } = usePage().props;

    if (!auth?.user) {
        return null;
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    className="relative h-8 w-8 rounded-full p-0 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                    data-test="header-user-menu-button"
                >
                    <UserInfo user={auth.user} showInfo={false} />
                    <span className="sr-only">Toggle user menu</span>
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
                className="w-56 rounded-lg"
                align="end"
                side="bottom"
                sideOffset={8}
            >
                <UserMenuContent user={auth.user} />
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
