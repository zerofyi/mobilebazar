import React, { useState } from 'react';
import { ChevronRight, Bookmark, CheckCircle2, BadgeCheck, Settings, ReceiptText, X } from 'lucide-react';
import { router } from '@inertiajs/react';
import LogoIcon from '@/components/logo-icon';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { usePurchase } from '../purchase-context';

export default function PurchaseHeader({ onSubmit }: { onSubmit: (isDraft: boolean) => void }) {
    const { state, dispatch, flags, store, permissions } = usePurchase();
    const [settingsOpen, setSettingsOpen] = useState(false);

    const billLabel = flags.billType === 'po' ? 'Order' : 'Voucher';

    const columnOptions: { key: keyof typeof state.columnVisibility; label: string; alwaysVisible?: boolean }[] = [
        { key: 'productBh', label: 'Product & Battery Health', alwaysVisible: true },
        { key: 'type', label: 'Device Type / Condition' },
        { key: 'quality', label: 'Quality / Grade' },
        { key: 'warranty', label: 'Warranty' },
        { key: 'imeis', label: 'IMEI 1 & IMEI 2' },
        { key: 'serial', label: 'Serial No.' },
        { key: 'cost', label: 'Cost Price' },
        { key: 'disc', label: 'Discount %' },
        { key: 'tax', label: 'GST / Tax Column', alwaysVisible: flags.isGstBilled },
        { key: 'wholesale', label: 'Wholesale Price' },
        { key: 'selling', label: 'Selling Price' },
    ];

    return (
        <>
            <header className="bg-card border-b border-border sticky top-0 z-30 shadow-xs">
                <div className="px-6">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center space-x-3">
                            <div className="size-10 rounded-full border-2 border-foreground flex items-center justify-center shrink-0">
                                <div className="size-8 rounded-full border border-foreground flex items-center justify-center">
                                    <LogoIcon className="size-4 text-foreground" />
                                </div>
                            </div>

                            <div>
                                <nav className="flex items-center space-x-1.5 text-xs text-muted-foreground font-medium">
                                    <span className="hover:text-foreground cursor-pointer" onClick={() => router.visit('/app/dashboard')}>
                                        Dashboard
                                    </span>
                                    <ChevronRight className="size-3 text-muted-foreground/60" />
                                    <span className="hover:text-foreground cursor-pointer" onClick={() => router.visit('/app/purchases')}>
                                        Purchases
                                    </span>
                                    <ChevronRight className="size-3 text-muted-foreground/60" />
                                    <span className="font-semibold text-foreground">
                                        New Purchase {billLabel}
                                    </span>
                                </nav>

                                <div className="flex items-center space-x-2 mt-0.5">
                                    <h1 className="text-base font-semibold text-foreground leading-tight">
                                        Purchase {billLabel} Entry
                                    </h1>
                                    <span className="text-xs text-muted-foreground/40">|</span>
                                    {flags.isGstBilled ? (
                                        <div className="flex items-center space-x-1 text-xs font-medium text-primary">
                                            <BadgeCheck className="size-3.5" />
                                            <span>GST Verified</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center space-x-1 text-xs font-medium text-muted-foreground">
                                            <ReceiptText className="size-3.5" />
                                            <span>Non-GST Bill</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center space-x-2">
                            {/* GST Bill toggle — only visible to users with permission */}
                            {store.is_gst_registered && permissions.can_toggle_gst && (
                                <div className="flex items-center gap-2 px-3 h-9 rounded-md border border-border bg-background">
                                    <ReceiptText className={cn('size-4', state.storeGstBillToggle ? 'text-primary' : 'text-muted-foreground')} />
                                    <Label htmlFor="gst-bill-toggle" className="text-xs font-medium cursor-pointer whitespace-nowrap">
                                        GST Bill
                                    </Label>
                                    <Switch
                                        id="gst-bill-toggle"
                                        checked={state.storeGstBillToggle}
                                        onCheckedChange={(c) => dispatch({ type: 'TOGGLE_GST', payload: c })}
                                        aria-label="Toggle GST Bill"
                                    />
                                </div>
                            )}

                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                aria-label="Column Settings"
                                onClick={() => setSettingsOpen(true)}
                            >
                                <Settings className="size-4" />
                            </Button>

                            {permissions.can_save_draft && (
                                <Button type="button" variant="outline" onClick={() => onSubmit(true)}>
                                    <Bookmark className="size-4" /> Draft
                                </Button>
                            )}

                            {permissions.can_post && (
                                <Button type="button" variant="default" onClick={() => onSubmit(false)}>
                                    <CheckCircle2 className="size-4" /> Save &amp; Post
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Settings Drawer */}
            {settingsOpen && (
                <div className="fixed inset-0 z-50 flex">
                    <div className="flex-1 bg-black/40" onClick={() => setSettingsOpen(false)} />
                    <div className="w-72 bg-card border-l border-border h-full overflow-y-auto">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                            <h2 className="text-sm font-bold">Column Settings</h2>
                            <Button variant="ghost" size="icon" className="size-7" onClick={() => setSettingsOpen(false)}>
                                <X className="size-4" />
                            </Button>
                        </div>
                        <div className="px-4 py-3 space-y-3">
                            <p className="text-[11px] text-muted-foreground">
                                Toggle which columns appear in the purchase table. Some columns are automatic based on the bill type.
                            </p>
                            {columnOptions.map(({ key, label, alwaysVisible }) => (
                                <div key={key} className="flex items-center gap-2">
                                    <Checkbox
                                        id={`col-${key}`}
                                        checked={state.columnVisibility[key]}
                                        disabled={alwaysVisible}
                                        onCheckedChange={(c) =>
                                            dispatch({ type: 'SET_COLUMN_VISIBILITY', payload: { [key]: !!c } })
                                        }
                                    />
                                    <Label htmlFor={`col-${key}`} className={cn('text-xs cursor-pointer', alwaysVisible && 'text-muted-foreground')}>
                                        {label}
                                        {alwaysVisible && <span className="ml-1 text-[10px]">(auto)</span>}
                                    </Label>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
