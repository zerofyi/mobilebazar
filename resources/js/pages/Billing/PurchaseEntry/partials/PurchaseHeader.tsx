import React from "react";
import { ChevronRight, Bookmark, CheckCircle2, BadgeCheck, Settings, ReceiptText, Columns } from "lucide-react";
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface Props { onSubmit: (isDraft: boolean) => void; isSubmitting: boolean; }

export default function PurchaseHeader({ onSubmit, isSubmitting }: Props) {
    const { state, dispatch, flags, store } = usePurchase();
    const { can } = usePermissions();

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
        ...(store.is_iws_allowed ? [{ key: "wholesale" as const, label: "Wholesale Price" }] : []),
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
                                <span className="font-semibold text-foreground">New Purchase Voucher</span>
                            </nav>
                            <div className="flex items-center space-x-2 mt-0.5">
                                <h1 className="text-base font-semibold text-foreground leading-tight">Purchase Voucher Entry</h1>
                                <span className="text-xs text-muted-foreground/40">|</span>
                                <div className="flex items-center space-x-1 text-xs font-medium text-primary">
                                    <BadgeCheck className="size-3.5" /><span>{flags.isGstBilled ? "GST Verified" : "Non-GST"}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center space-x-2">
                        {store.is_gst_registered && can("profile.manage.gst.status") && (
                            <div className="flex items-center gap-2 px-3 h-9 rounded-md border border-border bg-background">
                                <ReceiptText className={cn("size-4", state.storeGstBillToggle ? "text-primary" : "text-muted-foreground")} />
                                <Label htmlFor="gst-bill-toggle" className="text-xs font-medium cursor-pointer whitespace-nowrap">GST Bill</Label>
                                <Switch id="gst-bill-toggle" checked={state.storeGstBillToggle} onCheckedChange={(c) => dispatch({ type: "TOGGLE_GST", payload: c })} aria-label="Toggle GST Bill" />
                            </div>
                        )}

                        <Sheet>
                            <SheetTrigger asChild>
                                <Button type="button" variant="outline" size="icon" aria-label="Column Settings" className="h-9 w-9">
                                    <Settings className="size-4" />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="right" className="w-80 p-0 flex flex-col gap-0 border-l bg-card shadow-xl">
                                <SheetHeader className="px-5 py-4 border-b flex flex-row items-center gap-2 space-y-0">
                                    <Columns className="size-4 text-primary" />
                                    <SheetTitle className="text-sm font-semibold">Column Settings</SheetTitle>
                                </SheetHeader>
                                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                                    <SheetDescription className="text-xs text-muted-foreground">Toggle columns in the line-item table.</SheetDescription>
                                    <div className="space-y-1 pt-1">
                                        {columnOptions.map(({ key, label, alwaysVisible }) => (
                                            <div key={key} className={cn("flex items-center gap-3 rounded-md px-2.5 py-2 hover:bg-muted/50", alwaysVisible && "opacity-75")}>
                                                <Checkbox id={`col-${key}`} checked={!!state.columnVisibility[key]} disabled={alwaysVisible} onCheckedChange={(c) => dispatch({ type: "SET_COLUMN_VISIBILITY", payload: { [key]: !!c } })} className="size-4" />
                                                <Label htmlFor={`col-${key}`} className="flex-1 text-xs font-medium cursor-pointer">{label}</Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </SheetContent>
                        </Sheet>

                        <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => onSubmit(true)} title="Save without posting stock">
                            <Bookmark className="size-4 mr-1.5" /> {isSubmitting ? "Saving..." : "Draft"}
                        </Button>
                        <Button type="button" variant="default" disabled={isSubmitting} onClick={() => onSubmit(false)} title="Post stock immediately">
                            <CheckCircle2 className="size-4 mr-1.5" /> {isSubmitting ? "Posting..." : "Save & Post"}
                        </Button>
                    </div>
                </div>
            </div>
        </header>
    );
}
