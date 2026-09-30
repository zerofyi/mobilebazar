import React from "react";
import { ChevronRight, BadgeCheck, PauseCircle, Trash2, ReceiptText, Tags } from "lucide-react";
import LogoIcon from "@/components/logo-icon";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Link } from "@inertiajs/react";
import { dashboard } from "@/routes";
import app from "@/routes/app";
import { useSale } from "../sale-context";
import { cn } from "@/lib/utils";

interface Props {
    onPark: () => void;
    onClear: () => void;
    isSubmitting: boolean;
}

export default function SaleHeader({ onPark, onClear, isSubmitting }: Props) {
    const { state, dispatch, store } = useSale();

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
                                <Link href={app.sales.index.url()} className="hover:text-foreground transition-colors">Sales</Link>
                                <ChevronRight className="size-3 text-muted-foreground/60" />
                                <span className="font-semibold text-foreground">New Sale</span>
                            </nav>
                            <div className="flex items-center space-x-2 mt-0.5">
                                <h1 className="text-base font-semibold text-foreground leading-tight">New Sale</h1>
                                <span className="text-xs text-muted-foreground/40">|</span>
                                <div className={cn("flex items-center space-x-1 text-xs font-medium", state.isGstBilled ? "text-primary" : "text-muted-foreground")}>
                                    <BadgeCheck className="size-3.5" />
                                    <span>{state.isGstBilled ? "GST Bill" : "Non-GST"}</span>
                                </div>
                                <span className="text-xs text-muted-foreground/40">|</span>
                                <span className={cn("text-xs font-semibold", state.saleMode === "wholesale" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                                    {state.saleMode === "wholesale" ? "Wholesale" : "Retail"}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center space-x-2">
                        <div
                            className="flex items-center gap-2 px-3 h-9 rounded-md border border-border bg-muted/20"
                            title="Wholesale uses stock_units.wholesale_price (serialized) / min_selling_price (bulk). Toggling re-prices every line from that source."
                        >
                            <Tags className={cn("size-4", state.saleMode === "wholesale" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")} />
                            <Label htmlFor="sale-mode-toggle" className="text-xs font-medium cursor-pointer whitespace-nowrap">Wholesale</Label>
                            <Switch
                                id="sale-mode-toggle"
                                checked={state.saleMode === "wholesale"}
                                onCheckedChange={(c) => dispatch({ type: "SET_SALE_MODE", payload: { mode: c ? "wholesale" : "retail" } })}
                                aria-label="Toggle wholesale mode"
                            />
                        </div>
                        {store.is_gst_registered && (
                            <div className="flex items-center gap-2 px-3 h-9 rounded-md border border-border bg-muted/20">
                                <ReceiptText className={cn("size-4", state.isGstBilled ? "text-primary" : "text-muted-foreground")} />
                                <Label htmlFor="sale-gst-bill-toggle" className="text-xs font-medium cursor-pointer whitespace-nowrap">GST Bill</Label>
                                <Switch
                                    id="sale-gst-bill-toggle"
                                    checked={state.isGstBilled}
                                    onCheckedChange={(c) => dispatch({ type: "SET_GST_BILLED", payload: !!c })}
                                    aria-label="Toggle GST Bill"
                                />
                            </div>
                        )}

                        <Button type="button" variant="outline" disabled={isSubmitting} onClick={onPark} title="Park this sale and resume later">
                            <PauseCircle className="size-4 mr-1.5" /> Park Sale
                        </Button>
                        <Button type="button" variant="outline" disabled={isSubmitting} onClick={onClear} title="Clear the cart">
                            <Trash2 className="size-4 mr-1.5" /> Clear
                        </Button>
                    </div>
                </div>
            </div>
        </header>
    );
}
