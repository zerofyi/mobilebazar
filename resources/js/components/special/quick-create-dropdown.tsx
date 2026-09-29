import { Link } from '@inertiajs/react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Plus,
    ShoppingCart,
    ShoppingBag,
    UserPlus,
    Users,
    ChevronDown,
    BuildingComplexPlus,
} from 'lucide-react';
import app from '@/routes/app';
import { usePermissions } from '@/hooks/user-permissions';

export function QuickCreateDropdown() {
    const { can } = usePermissions();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="secondary"
                    size="sm"
                    className="group h-8 gap-1.5 rounded-lg border border-input bg-secondary/80 px-2.5 text-xs font-medium text-secondary-foreground shadow-none hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Quick Create Menu"
                >
                    <Plus className="size-3.5 shrink-0 opacity-80" />
                    <span className="hidden sm:inline-block shimmer shimmer-color-primary">
                        Create
                    </span>
                    <ChevronDown className="size-3.5 shrink-0 opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56 rounded-lg">
                <DropdownMenuSeparator />

                {can('sales.create') && (
                    <DropdownMenuItem asChild className="cursor-pointer">
                        <Link href={app.sales.create.url()}>
                            <ShoppingCart className="mr-2 size-4 text-muted-foreground" />
                            <span>Add Sale</span>
                        </Link>
                    </DropdownMenuItem>
                )}
                {can('purchases.create') && (
                    <DropdownMenuItem asChild className="cursor-pointer">
                        <Link href={app.purchases.create.url()}>
                            <ShoppingBag className="mr-2 size-4 text-muted-foreground" />
                            <span>Add Purchase</span>
                        </Link>
                    </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />

                {can('customers.create') && (
                    <DropdownMenuItem asChild className="cursor-pointer">
                        <Link href={app.customers.create.url()}>
                            <UserPlus className="mr-2 size-4 text-muted-foreground" />
                            <span>Add Customer</span>
                        </Link>
                    </DropdownMenuItem>
                )}
                {can('suppliers.create') && (
                    <DropdownMenuItem asChild className="cursor-pointer">
                        <Link href={app.suppliers.index.url()}>
                            <BuildingComplexPlus className="mr-2 size-4 text-muted-foreground" />
                            <span>Add B2B Party</span>
                        </Link>
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
