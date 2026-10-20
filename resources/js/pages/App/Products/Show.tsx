import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, Package, Pencil, Tag, Building2, Percent } from 'lucide-react';
import products from '@/routes/app/products';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormatAmount } from '@/components/special/format-amount';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

interface Variant {
    id: number;
    sku: string | null;
    name: string | null;
    selling_price: number;
    is_serialized: boolean;
    unit?: { name: string } | null;
}

interface Product {
    id: number;
    uuid: string;
    name: string;
    description: string | null;
    is_active: boolean;
    category?: { name: string } | null;
    brand?: { name: string } | null;
    tax_category?: { name: string; tax_percent: number } | null;
    variants: Variant[];
}

export default function ProductShow({ product }: { product: Product }) {
    return (
        <>
            <Head title={product.name} />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href={products.index.url()}>
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="size-4" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-xl font-semibold">{product.name}</h1>
                            <p className="text-sm text-muted-foreground">
                                {product.category?.name ?? 'Uncategorized'}
                                {product.brand ? ` · ${product.brand.name}` : ''}
                            </p>
                        </div>
                        <Badge variant={product.is_active ? 'default' : 'secondary'}>
                            {product.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                    </div>
                    <Link href={products.edit.url(product.uuid)}>
                        <Button>
                            <Pencil className="size-4 mr-2" /> Edit
                        </Button>
                    </Link>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Tag className="size-4" /> Category
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-lg font-semibold">{product.category?.name ?? '—'}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Building2 className="size-4" /> Brand
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-lg font-semibold">{product.brand?.name ?? '—'}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Percent className="size-4" /> Tax
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-lg font-semibold">
                                {product.tax_category
                                    ? `${product.tax_category.name} (${product.tax_category.tax_percent}%)`
                                    : '—'}
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {product.description && (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium">Description</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground">{product.description}</p>
                        </CardContent>
                    </Card>
                )}

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Package className="size-4" /> Variants ({product.variants.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>SKU</TableHead>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Unit</TableHead>
                                    <TableHead className="text-right">Selling Price</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {product.variants.map((v) => (
                                    <TableRow key={v.id}>
                                        <TableCell className="font-mono text-sm">{v.sku ?? '—'}</TableCell>
                                        <TableCell>{v.name ?? '—'}</TableCell>
                                        <TableCell>
                                            <Badge variant={v.is_serialized ? 'default' : 'secondary'}>
                                                {v.is_serialized ? 'Serialized' : 'Bulk'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{v.unit?.name ?? '—'}</TableCell>
                                        <TableCell className="text-right">
                                            <FormatAmount amount={v.selling_price} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {product.variants.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                                            No variants yet.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

ProductShow.layout = {
    breadcrumbs: [
        { label: 'Products', href: products.index.url() },
        { label: 'View' },
    ],
};
