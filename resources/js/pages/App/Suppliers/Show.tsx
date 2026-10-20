import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, Building2, Pencil, Phone, MapPin } from 'lucide-react';
import suppliers from '@/routes/app/suppliers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Supplier {
    id: number;
    company_name: string;
    contact_person: string | null;
    phone: string | null;
    email: string | null;
    gstin: string | null;
    is_active: boolean;
    address?: {
        address_line1: string | null;
        city: string | null;
        state: string | null;
        pincode: string | null;
    } | null;
}

export default function SupplierShow({ supplier }: { supplier: Supplier }) {
    return (
        <>
            <Head title={supplier.company_name} />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href={suppliers.index.url()}>
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="size-4" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-xl font-semibold flex items-center gap-2">
                                <Building2 className="size-5" /> {supplier.company_name}
                            </h1>
                            <p className="text-sm text-muted-foreground">{supplier.contact_person ?? 'No contact person'}</p>
                        </div>
                        <Badge variant={supplier.is_active ? 'default' : 'secondary'}>
                            {supplier.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                    </div>
                    <Link href={suppliers.edit.url(supplier.id)}>
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
                            <p><span className="text-muted-foreground">Phone:</span> {supplier.phone ?? '—'}</p>
                            <p><span className="text-muted-foreground">Email:</span> {supplier.email ?? '—'}</p>
                            <p><span className="text-muted-foreground">GSTIN:</span> <span className="font-mono">{supplier.gstin ?? '—'}</span></p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <MapPin className="size-4" /> Address
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm">
                            {supplier.address ? (
                                <p>
                                    {supplier.address.address_line1}<br />
                                    {supplier.address.city}, {supplier.address.state} {supplier.address.pincode}
                                </p>
                            ) : (
                                <p className="text-muted-foreground">No address on file.</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </>
    );
}

SupplierShow.layout = {
    breadcrumbs: [
        { label: 'Suppliers', href: suppliers.index.url() },
        { label: 'View' },
    ],
};
