import React, { useEffect } from 'react';
import { Head } from '@inertiajs/react';
import { FormatAmount } from '@/components/special/format-amount';
import { Printer, ArrowLeft, ShieldCheck, FileCheck, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UnitDetail {
    imei1: string | null;
    imei2: string | null;
    serial: string | null;
    condition: string;
    quality: string | null;
    warranty: string | null;
    is_margin_scheme: boolean;
}

interface PrintItem {
    id: number;
    product_name: string;
    sku: string;
    hsn_code: string;
    qty: number;
    unit_cost: number;
    base_cost: number;
    landed_cost: number;
    tax_pct: number;
    tax_type: string;
    tax_amount: number;
    discount_amount: number;
    line_total: number;
    is_margin_scheme: boolean;
    units: UnitDetail[];
}

interface PurchasePrintData {
    id: number;
    uuid: string;
    po_number: string;
    vendor_invoice_no: string | null;
    bill_type: 'po' | 'pv';
    is_gst_billed: boolean;
    is_intra_state: boolean;
    order_date: string;
    payment_status: string;
    payment_mode: string | null;
    subtotal: number;
    tax_amount: number;
    discount_amount: number;
    shipping_charge: number;
    grand_total: number;
    paid_amount: number;
    due_amount: number;
    created_by: string;
    notes: string | null;
    vendor: {
        name: string;
        contact_person: string | null;
        gstin: string | null;
        pan: string | null;
        phone: string | null;
        address: string | null;
        state: string | null;
        is_registered: boolean;
    } | null;
    items: PrintItem[];
}

interface StoreInfo {
    name: string;
    phone: string | null;
    email: string | null;
    gstin: string | null;
    state: string | null;
    address: string | null;
}

interface Props {
    purchase: PurchasePrintData;
    store: StoreInfo;
}

export default function Print({ purchase, store }: Props) {
    useEffect(() => {
        const timer = setTimeout(() => {
            window.print();
        }, 400);
        return () => clearTimeout(timer);
    }, []);

    const isPO = purchase.bill_type === 'po';
    const isGstBilled = purchase.is_gst_billed && isPO;
    const isIntraState = purchase.is_intra_state;

    // Aggregate HSN Tax Breakdown
    const hsnSummary = React.useMemo(() => {
        const map = new Map<string, { taxable: number; cgst: number; sgst: number; igst: number; rate: number }>();

        purchase.items.forEach((item) => {
            if (item.is_margin_scheme || !isGstBilled) return;

            const hsn = item.hsn_code || '8517';
            const taxable = item.base_cost * item.qty;
            const tax = item.tax_amount;
            const existing = map.get(hsn) || { taxable: 0, cgst: 0, sgst: 0, igst: 0, rate: item.tax_pct };

            if (isIntraState) {
                existing.cgst += tax / 2;
                existing.sgst += tax / 2;
            } else {
                existing.igst += tax;
            }
            existing.taxable += taxable;
            map.set(hsn, existing);
        });

        return Array.from(map.entries()).map(([hsn, data]) => ({ hsn, ...data }));
    }, [purchase.items, isGstBilled, isIntraState]);

    return (
        <>
            <Head title={`${isPO ? 'Purchase Tax Invoice' : 'Purchase Voucher'} - ${purchase.po_number}`} />

            {/* Print Isolation & Page Rules */}
            <style>{`
                @media print {
                    header, footer, nav, aside, .no-print, [role="navigation"] {
                        display: none !important;
                    }
                    @page {
                        margin: 8mm 10mm;
                        size: A4 portrait;
                    }
                    html, body {
                        background: #ffffff !important;
                        color: #000000 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
                        font-size: 10px !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .print-container {
                        box-shadow: none !important;
                        border: none !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                    .page-break-avoid {
                        page-break-inside: avoid !important;
                    }
                }
            `}</style>

            {/* Screen Action Bar */}
            <div className="no-print sticky top-0 z-50 flex items-center justify-between border-b bg-background px-6 py-3 shadow-xs">
                <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" onClick={() => window.close()}>
                        <ArrowLeft className="mr-2 size-4" /> Close Window
                    </Button>
                    <span className="text-sm font-semibold text-foreground">
                        Document Preview — {purchase.po_number}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => window.print()}>
                        <Printer className="mr-2 size-4" /> Print Document
                    </Button>
                </div>
            </div>

            {/* Print Paper Sheet */}
            <div className="min-h-screen bg-neutral-100 p-2 sm:p-6 flex justify-center">
                <div className="print-container w-full max-w-[210mm] bg-white p-6 border border-neutral-300 text-black shadow-md flex flex-col justify-between">

                    <div>
                        {/* Title Bar Header */}
                        <div className="flex justify-between items-start border-b-2 border-black pb-3 mb-3">
                            <div>
                                <h1 className="text-xl font-black uppercase tracking-wide text-black">
                                    {isPO ? 'INWARD B2B TAX INVOICE' : 'PURCHASE VOUCHER / BUYBACK RECEIPT'}
                                </h1>
                                <p className="text-[9px] font-semibold text-neutral-600 uppercase tracking-widest mt-0.5">
                                    {isPO
                                        ? 'Statutory Inward Supply Document (Recipient Copy)'
                                        : 'Goods Procurement & Margin Scheme Purchase Entry (Rule 31A Compliance)'}
                                </p>
                            </div>
                            <div className="text-right">
                                <span className="inline-block border border-black px-2 py-0.5 bg-neutral-100 font-mono text-[11px] font-bold uppercase">
                                    {isPO ? 'Taxable B2B Purchase' : 'Purchase Voucher (PV)'}
                                </span>
                            </div>
                        </div>

                        {/* Store & Vendor Metadata Grid */}
                        <div className="grid grid-cols-12 gap-3 border border-black p-3 text-[10px] mb-3 bg-neutral-50/50">
                            {/* Store Receiver Info */}
                            <div className="col-span-6 border-r border-neutral-300 pr-2">
                                <p className="font-extrabold uppercase text-[9px] text-neutral-500 mb-1">Purchasing Store (Recipient)</p>
                                <p className="text-xs font-bold text-black uppercase">{store.name}</p>
                                {store.address && <p className="text-neutral-700 leading-tight mt-0.5">{store.address}</p>}
                                <div className="mt-1 space-y-0.5 font-mono">
                                    {store.phone && <p>Tel: <span className="font-semibold">{store.phone}</span></p>}
                                    {store.gstin ? (
                                        <p className="font-bold text-black">GSTIN: {store.gstin}</p>
                                    ) : (
                                        <p className="text-neutral-500 font-sans italic">Store Status: Unregistered</p>
                                    )}
                                </div>
                            </div>

                            {/* Vendor / Customer Info */}
                            <div className="col-span-6 pl-1">
                                <p className="font-extrabold uppercase text-[9px] text-neutral-500 mb-1">
                                    {purchase.vendor?.is_registered ? 'Supplier / B2B Vendor' : 'Seller / Walk-in Customer'}
                                </p>
                                <p className="text-xs font-bold text-black uppercase">
                                    {purchase.vendor?.name || 'Over-the-Counter Cash Vendor'}
                                </p>
                                {purchase.vendor?.contact_person && (
                                    <p className="text-neutral-600">C/o: {purchase.vendor.contact_person}</p>
                                )}
                                {purchase.vendor?.address && (
                                    <p className="text-neutral-700 leading-tight mt-0.5">{purchase.vendor.address}</p>
                                )}
                                <div className="mt-1 space-y-0.5 font-mono">
                                    {purchase.vendor?.phone && <p>Phone: {purchase.vendor.phone}</p>}
                                    {purchase.vendor?.gstin ? (
                                        <p className="font-bold text-black">GSTIN: {purchase.vendor.gstin}</p>
                                    ) : (
                                        <p className="text-neutral-600 font-sans italic">URP (Unregistered Seller)</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Document & Reference Numbers */}
                        <div className="grid grid-cols-4 gap-2 border border-black p-2 text-[10px] mb-3 bg-white font-mono">
                            <div>
                                <span className="block text-[8px] text-neutral-500 font-sans uppercase">PO / Voucher No.</span>
                                <span className="font-bold text-black text-xs">{purchase.po_number}</span>
                            </div>
                            <div>
                                <span className="block text-[8px] text-neutral-500 font-sans uppercase">Vendor Ref / Inv #</span>
                                <span className="font-bold text-black">{purchase.vendor_invoice_no || 'N/A'}</span>
                            </div>
                            <div>
                                <span className="block text-[8px] text-neutral-500 font-sans uppercase">Order Date</span>
                                <span className="font-bold text-black">{purchase.order_date}</span>
                            </div>
                            <div>
                                <span className="block text-[8px] text-neutral-500 font-sans uppercase">Payment Status / Mode</span>
                                <span className="font-bold uppercase text-black">
                                    {purchase.payment_status} ({purchase.payment_mode || 'Cash'})
                                </span>
                            </div>
                        </div>

                        {/* Main Line Items Table */}
                        <table className="w-full text-left text-[10px] border-collapse border border-black mb-3">
                            <thead>
                                <tr className="border-b border-black bg-neutral-100 text-black uppercase font-extrabold text-[9px]">
                                    <th className="py-1.5 px-1.5 border-r border-black text-center w-6">#</th>
                                    <th className="py-1.5 px-1.5 border-r border-black">Item & Technical Description</th>
                                    <th className="py-1.5 px-1.5 border-r border-black text-center w-12">HSN</th>
                                    <th className="py-1.5 px-1.5 border-r border-black text-center w-8">Qty</th>
                                    <th className="py-1.5 px-1.5 border-r border-black text-right w-20">Base Rate</th>
                                    <th className="py-1.5 px-1.5 border-r border-black text-right w-16">GST %</th>
                                    <th className="py-1.5 px-1.5 border-r border-black text-right w-16">Tax (₹)</th>
                                    <th className="py-1.5 px-1.5 text-right w-24">Line Total (₹)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black">
                                {purchase.items.map((item, index) => (
                                    <tr key={item.id} className="align-top">
                                        <td className="py-1.5 px-1.5 border-r border-black text-center font-mono text-neutral-600">
                                            {index + 1}
                                        </td>
                                        <td className="py-1.5 px-1.5 border-r border-black space-y-1">
                                            <div>
                                                <p className="font-bold text-black text-[11px]">{item.product_name}</p>
                                                <span className="font-mono text-[8px] text-neutral-500">SKU: {item.sku}</span>
                                            </div>

                                            {/* Serialized Units Detailed Listing */}
                                            {item.units && item.units.length > 0 && (
                                                <div className="mt-1 space-y-1 bg-neutral-50 p-1.5 border border-neutral-200 rounded-xs">
                                                    {item.units.map((unit, uIdx) => (
                                                        <div key={uIdx} className="text-[9px] font-mono grid grid-cols-12 gap-1 text-neutral-800 leading-tight">
                                                            <div className="col-span-6">
                                                                {unit.imei1 && <span>IMEI1: <strong className="text-black">{unit.imei1}</strong> </span>}
                                                                {unit.imei2 && <span>| IMEI2: {unit.imei2} </span>}
                                                                {unit.serial && <span>| SN: <strong className="text-black">{unit.serial}</strong></span>}
                                                            </div>
                                                            <div className="col-span-6 text-right space-x-1">
                                                                <span className="font-sans font-semibold border border-neutral-300 px-1 rounded-xs bg-white text-[8px]">
                                                                    {unit.condition}
                                                                </span>
                                                                {unit.quality && (
                                                                    <span className="font-sans text-[8px] text-neutral-600">
                                                                        Qual: {unit.quality}
                                                                    </span>
                                                                )}
                                                                {unit.warranty && (
                                                                    <span className="font-sans text-[8px] text-neutral-600">
                                                                        Wty: {unit.warranty}
                                                                    </span>
                                                                )}
                                                                {unit.is_margin_scheme && (
                                                                    <span className="font-sans font-bold text-[8px] text-amber-800 bg-amber-50 px-0.5 border border-amber-200">
                                                                        MARGIN
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-1.5 px-1.5 border-r border-black text-center font-mono">{item.hsn_code}</td>
                                        <td className="py-1.5 px-1.5 border-r border-black text-center font-bold font-mono">{item.qty}</td>
                                        <td className="py-1.5 px-1.5 border-r border-black text-right font-mono">
                                            <FormatAmount amount={item.base_cost} />
                                        </td>
                                        <td className="py-1.5 px-1.5 border-r border-black text-right font-mono text-neutral-700">
                                            {item.is_margin_scheme || !isGstBilled ? '0%' : `${item.tax_pct}%`}
                                        </td>
                                        <td className="py-1.5 px-1.5 border-r border-black text-right font-mono text-neutral-700">
                                            <FormatAmount amount={item.is_margin_scheme || !isGstBilled ? 0 : item.tax_amount} />
                                        </td>
                                        <td className="py-1.5 px-1.5 text-right font-bold font-mono">
                                            <FormatAmount amount={item.line_total} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Statutory HSN Breakdown Table (Only if GST Billed & PO) */}
                        {isGstBilled && hsnSummary.length > 0 && (
                            <div className="mb-3 page-break-avoid">
                                <p className="text-[8px] font-bold uppercase text-neutral-500 mb-0.5">HSN / SAC Tax Breakdown Summary</p>
                                <table className="w-full text-[9px] font-mono border-collapse border border-black">
                                    <thead>
                                        <tr className="bg-neutral-100 border-b border-black text-left font-bold text-[8px]">
                                            <th className="p-1 border-r border-black">HSN/SAC</th>
                                            <th className="p-1 border-r border-black text-right">Taxable Amount</th>
                                            {isIntraState ? (
                                                <>
                                                    <th className="p-1 border-r border-black text-right">CGST</th>
                                                    <th className="p-1 border-r border-black text-right">SGST</th>
                                                </>
                                            ) : (
                                                <th className="p-1 border-r border-black text-right">IGST</th>
                                            )}
                                            <th className="p-1 text-right">Total Tax Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-black">
                                        {hsnSummary.map((hsn) => (
                                            <tr key={hsn.hsn}>
                                                <td className="p-1 border-r border-black font-bold">{hsn.hsn}</td>
                                                <td className="p-1 border-r border-black text-right"><FormatAmount amount={hsn.taxable} /></td>
                                                {isIntraState ? (
                                                    <>
                                                        <td className="p-1 border-r border-black text-right"><FormatAmount amount={hsn.cgst} /></td>
                                                        <td className="p-1 border-r border-black text-right"><FormatAmount amount={hsn.sgst} /></td>
                                                    </>
                                                ) : (
                                                    <td className="p-1 border-r border-black text-right"><FormatAmount amount={hsn.igst} /></td>
                                                )}
                                                <td className="p-1 text-right font-bold">
                                                    <FormatAmount amount={isIntraState ? hsn.cgst + hsn.sgst : hsn.igst} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Financial Summaries & Declarations */}
                        <div className="grid grid-cols-12 gap-3 border border-black p-3 text-[10px] mb-3 page-break-avoid">
                            {/* Left Notes & Legal Declaration */}
                            <div className="col-span-7 flex flex-col justify-between space-y-2 pr-2 border-r border-neutral-300">
                                <div>
                                    <p className="font-extrabold uppercase text-[9px] text-neutral-500 mb-0.5">Voucher Remarks / Notes:</p>
                                    <p className="text-[10px] text-neutral-800 leading-relaxed font-sans">
                                        {purchase.notes || 'No specific purchase remarks recorded for this transaction.'}
                                    </p>
                                </div>

                                <div className="border-t border-dashed border-neutral-400 pt-1.5 space-y-1 text-[8.5px] text-neutral-600">
                                    <p className="font-bold uppercase text-black">Statutory Declaration:</p>
                                    {!isPO || !purchase.vendor?.is_registered ? (
                                        <p>
                                            Goods procured from an unregistered seller/walk-in customer under Section 10(5) Margin Scheme.
                                            Input Tax Credit (ITC) is not applicable on this purchase voucher.
                                        </p>
                                    ) : (
                                        <p>
                                            Inward supply tax invoice processed for Input Tax Credit under Section 16 of CGST Act.
                                            All items listed have been physically inspected and accepted in stock.
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Right Totals Breakdown */}
                            <div className="col-span-5 space-y-1 font-mono text-[10px] pl-1">
                                <div className="flex justify-between border-b border-neutral-200 pb-0.5">
                                    <span className="text-neutral-600 font-sans">Subtotal (Base Value):</span>
                                    <span>₹<FormatAmount amount={purchase.subtotal} /></span>
                                </div>
                                {isGstBilled && (
                                    <div className="flex justify-between border-b border-neutral-200 pb-0.5">
                                        <span className="text-neutral-600 font-sans">Total Tax (GST):</span>
                                        <span>+ ₹<FormatAmount amount={purchase.tax_amount} /></span>
                                    </div>
                                )}
                                {purchase.discount_amount > 0 && (
                                    <div className="flex justify-between border-b border-neutral-200 pb-0.5 text-emerald-800">
                                        <span className="font-sans">Discount Received:</span>
                                        <span>- ₹<FormatAmount amount={purchase.discount_amount} /></span>
                                    </div>
                                )}
                                {purchase.shipping_charge > 0 && (
                                    <div className="flex justify-between border-b border-neutral-200 pb-0.5">
                                        <span className="text-neutral-600 font-sans">Freight / Logistics:</span>
                                        <span>+ ₹<FormatAmount amount={purchase.shipping_charge} /></span>
                                    </div>
                                )}
                                <div className="flex justify-between font-extrabold text-xs border-t-2 border-black pt-1">
                                    <span className="font-sans uppercase">Grand Total:</span>
                                    <span>₹<FormatAmount amount={purchase.grand_total} /></span>
                                </div>
                                <div className="flex justify-between text-neutral-700 pt-0.5">
                                    <span className="font-sans">Amount Settled:</span>
                                    <span>₹<FormatAmount amount={purchase.paid_amount} /></span>
                                </div>
                                <div className="flex justify-between font-bold text-black pt-0.5 border-t border-dashed border-black">
                                    <span className="font-sans uppercase">Balance Due:</span>
                                    <span>₹<FormatAmount amount={purchase.due_amount} /></span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Signatures & Footer */}
                    <div className="mt-8 pt-4 border-t border-black page-break-avoid">
                        <div className="grid grid-cols-2 gap-8 text-center text-[10px]">
                            <div>
                                <div className="border-b border-black w-40 mx-auto mb-1"></div>
                                <p className="font-bold uppercase text-black">Store Receiver / Verified By</p>
                                <p className="text-[8px] text-neutral-500 font-mono mt-0.5">User: {purchase.created_by}</p>
                            </div>
                            <div>
                                <div className="border-b border-black w-40 mx-auto mb-1"></div>
                                <p className="font-bold uppercase text-black">Authorized Signatory</p>
                                <p className="text-[8px] text-neutral-500 mt-0.5">Accounts & Inventory Department</p>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </>
    );
}
