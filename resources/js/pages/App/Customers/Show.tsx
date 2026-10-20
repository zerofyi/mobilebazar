import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, User, Pencil, Phone, MapPin } from 'lucide-react';
import customers from '@/routes/app/customers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Customer {
    id: number;
    name: string;
    phone_primary: string | null;
    phone_secondary: string | null;
    status: string;
    total_spent: number;
    loyalty_points: number;
    address?: {
        address_line1: string | null;
        city: string | null;
        state: string | null;
        pincode: string | null;
    } | null;
}

export default function CustomerShow({ customer }: { customer: Customer }) {
    return (
        <>
            <Head title={customer.name} />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href={customers.index.url()}>
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="size-4" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-xl font-semibold flex items-center gap-2">
                                <User className="size-5" /> {customer.name}
                            </h1>
                            <p className="text-sm text-muted-foreground">{customer.phone_primary ?? 'No phone'}</p>
                        </div>
                        <Badge variant={customer.status === 'active' ? 'default' : 'secondary'}>
                            {customer.status}
                        </Badge>
                    </div>
                    <Link href={customers.edit.url(customer.id)}>
                        <Button>
                            <Pencil className="size-4 mr-2" /> Edit
                        </Button>
                    </Link>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Phone className="size-4" /> Contact
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1 text-sm">
                            <p><span className="text-muted-foreground">Primary:</span> {customer.phone_primary ?? '—'}</p>
                            <p><span className="text-muted-foreground">Secondary:</span> {customer.phone_secondary ?? '—'}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <MapPin className="size-4" /> Address
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm">
                            {customer.address ? (
                                <p>
                                    {customer.address.address_line1}<br />
                                    {customer.address.city}, {customer.address.state} {customer.address.pincode}
                                </p>
                            ) : (
                                <p className="text-muted-foreground">No address on file.</p>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold tabular-nums">₹{Number(customer.total_spent).toLocaleString('en-IN')}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Loyalty Points</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold tabular-nums">{Number(customer.loyalty_points).toLocaleString('en-IN')}</p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </>
    );
}

CustomerShow.layout = {
    breadcrumbs: [
        { label: 'Customers', href: customers.index.url() },
        { label: 'View' },
    ],
};
