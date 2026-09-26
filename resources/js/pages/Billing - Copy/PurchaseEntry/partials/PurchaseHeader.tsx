import React from "react";
import { ChevronRight, BadgeCheck, Settings, ReceiptText, Columns } from "lucide-react";
import LogoIcon from "@/components/logo-icon";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Link } from "@inertiajs/react";
import { dashboard } from "@/routes";
import app from "@/routes/app";
import { usePurchase } from "../purchase-context";
import { usePermissions } from "@/hooks/user-permissions";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";

export default function PurchaseHeader() {
    const { state, dispatch, flags, vendorIsRegistered, marginLineCount, store } = usePurchase();
    const { can } = usePermissions();

    const billLabel = flags.billType === "po" ? "Order" : "Voucher";

    const columnOptions: { key: keyof typeof state.columnVisibility; label: string; alwaysVisible?: boolean }[] = [
        { key: "productBh", label: "Product & Battery Health", alwaysVisible: true },
        { key: "type", label: "Device Type / Condition" },
        { key: "quality", label: "Quality / Grade" },
        { key: "warranty", label: "Warranty" },
        { key: "imeis", label: "IMEI 1 & IMEI 2" },
        { key: "serial", label: "Serial No." },
        { key: "cost", label: "Cost Price" },
        { key: "disc", label: "Discount Percent" },
        { key: "tax", label: "GST / Tax Column", alwaysVisible: flags.isGstBilled },
        { key: "wholesale", label: "Wholesale Price" },
        { key: "selling", label: "Selling Price" },
    ];

    return (
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
                                <Link href={dashboard.url()} className="hover:text-foreground transition-colors">Dashboard</Link>
                                <ChevronRight className="size-3 text-muted-foreground/60" />
                                <Link href={app.purchases.index.url()} className="hover:text-foreground transition-colors">Purchases</Link>
                                <ChevronRight className="size-3 text-muted-foreground/60" />
                                <span className="font-semibold text-foreground">New Purchase {billLabel}</span>
                            </nav>
                            <div className="flex items-center space-x-2 mt-0.5">
                                <h1 className="text-base font-semibold text-foreground leading-tight">Purchase {billLabel} Entry</h1>
                                <span className="text-xs text-muted-foreground/40">|</span>
                                {flags.isGstBilled ? (
                                    <div className="flex items-center space-x-1 text-xs font-medium text-primary">
                                        <BadgeCheck className="size-3.5" /><span>GST Billed</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center space-x-1 text-xs font-medium text-muted-foreground">
                                        <BadgeCheck className="size-3.5" /><span>Non-GST</span>
                                    </div>
                                )}
                                {flags.isGstBilled && !vendorIsRegistered && (
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-50 text-amber-700">margin scheme · whole bill</span>
                                )}
                                {flags.isGstBilled && vendorIsRegistered && marginLineCount > 0 && (
                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-50 text-amber-700">margin · {marginLineCount}/{state.rows.length} lines</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center space-x-2">
                        {store.is_gst_registered && can("profile.manage.gst.status") && (
                            <div className="flex items-center gap-2 px-3 h-9 rounded-md border border-border bg-background dark:bg-input/30">
                                <ReceiptText className={cn("size-4", state.storeGstBillToggle ? "text-primary" : "text-muted-foreground")} />
                                <Label htmlFor="gst-bill-toggle" className="text-xs font-medium cursor-pointer whitespace-nowrap select-none">GST Bill</Label>
                                <Switch
                                    id="gst-bill-toggle"
                                    checked={state.storeGstBillToggle}
                                    onCheckedChange={(c) => dispatch({ type: "TOGGLE_GST", payload: c })}
                                    aria-label="Toggle GST Bill"
                                />
                            </div>
                        )}

                        <Sheet>
                            <SheetTrigger asChild>
                                <Button type="button" variant="outline" size="icon" aria-label="Column Settings" className="h-9 w-9 shadow-2xs">
                                    <Settings className="size-4" />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="right" className="w-80 p-0 flex flex-col gap-0 border-l bg-card shadow-xl">
                                <SheetHeader className="px-5 py-4 border-b flex flex-row items-center gap-2 space-y-0">
                                    <Columns className="size-4 text-primary" />
                                    <SheetTitle className="text-sm font-semibold">Column Settings</SheetTitle>
                                </SheetHeader>
                                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                                    <SheetDescription className="text-xs text-muted-foreground leading-relaxed">
                                        Toggle columns in the line-item table. Tax column is automatic when GST is billed.
                                    </SheetDescription>
                                    <div className="space-y-1 pt-1">
                                        {columnOptions.map(({ key, label, alwaysVisible }) => (
                                            <div key={key} className={cn("flex items-center gap-3 rounded-md px-2.5 py-2 hover:bg-muted/50", alwaysVisible && "opacity-75")}>
                                                <Checkbox
                                                    id={`col-${key}`}
                                                    checked={!!state.columnVisibility[key]}
                                                    disabled={alwaysVisible}
                                                    onCheckedChange={(c) => dispatch({ type: "SET_COLUMN_VISIBILITY", payload: { [key]: !!c } })}
                                                    className="size-4"
                                                />
                                                <Label htmlFor={`col-${key}`} className="flex-1 text-xs font-medium cursor-pointer select-none">
                                                    {label}
                                                    {alwaysVisible && <span className="ml-1.5 font-mono text-[10px] text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded border">auto</span>}
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </SheetContent>
                        </Sheet>
                    </div>
                </div>
            </div>
        </header>
    );
}
