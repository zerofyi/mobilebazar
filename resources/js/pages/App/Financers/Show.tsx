import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, Landmark, Pencil, Phone } from 'lucide-react';
import financers from '@/routes/app/financers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Financer {
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
    is_active: boolean;
    signature_url: string | null;
}

export default function FinancerShow({ financer }: { financer: Financer }) {
    return (
        <>
            <Head title={financer.name} />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href={financers.index.url()}>
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="size-4" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-xl font-semibold flex items-center gap-2">
                                <Landmark className="size-5" /> {financer.name}
                            </h1>
                            <p className="text-sm text-muted-foreground">{financer.phone ?? 'No phone'}</p>
                        </div>
                        <Badge variant={financer.is_active ? 'default' : 'secondary'}>
                            {financer.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                    </div>
                    <Link href={financers.edit.url(financer.id)}>
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
                            <p><span className="text-muted-foreground">Phone:</span> {financer.phone ?? '—'}</p>
                            <p><span className="text-muted-foreground">Email:</span> {financer.email ?? '—'}</p>
                        </CardContent>
                    </Card>
                    {financer.signature_url && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium">Signature</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <img src={financer.signature_url} alt="Signature" className="max-h-24 rounded border" />
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </>
    );
}

FinancerShow.layout = {
    breadcrumbs: [
        { label: 'Financers', href: financers.index.url() },
        { label: 'View' },
    ],
};
