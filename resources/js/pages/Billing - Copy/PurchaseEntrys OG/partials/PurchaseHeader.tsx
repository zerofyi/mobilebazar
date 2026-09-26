import React from 'react';
import {
    ChevronRight,
    Bookmark,
    CheckCircle2,
    BadgeCheck,
    Settings,
    ReceiptText,
} from 'lucide-react';
import LogoIcon from '@/components/logo-icon';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

export default function PurchaseHeader() {
    return (
        <header className="bg-card border-b border-border sticky top-0 z-30 shadow-xs">
            <div className="px-6">
                <div className="flex items-center justify-between h-16">
                    <div className="flex items-center space-x-3">
                        <div className="size-10 rounded-full border-2 border-black dark:border-white flex items-center justify-center shrink-0">
                            <div className="size-8 rounded-full border border-black dark:border-white flex items-center justify-center">
                                <LogoIcon className="size-4 text-black dark:text-white" />
                            </div>
                        </div>

                        <div>
                            <nav className="flex items-center space-x-1.5 text-xs text-muted-foreground font-medium">
                                <span className="hover:text-foreground cursor-pointer">Dashboard</span>
                                <ChevronRight className="size-3 text-muted-foreground/60" />
                                <span className="hover:text-foreground cursor-pointer">Purchases</span>
                                <ChevronRight className="size-3 text-muted-foreground/60" />
                                <span className="font-semibold text-foreground">
                                    New Purchase Voucher
                                </span>
                            </nav>

                            <div className="flex items-center space-x-2 mt-0.5">
                                <h1 className="text-base font-semibold text-foreground leading-tight">
                                    Purchase Voucher Entry
                                </h1>

                                <span className="text-xs text-muted-foreground/40">|</span>

                                <div className="flex items-center space-x-1 text-xs font-medium text-primary">
                                    <BadgeCheck className="size-3.5" />
                                    <span>GST Verified</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center space-x-2">
                        <div className="flex items-center gap-2 px-3 h-9 rounded-md border border-border bg-background">
                            <ReceiptText className="size-4 text-primary" />

                            <Label htmlFor="gst-bill-toggle" className="text-xs font-medium cursor-pointer whitespace-nowrap">
                                GST Bill
                            </Label>

                            <Switch
                                id="gst-bill-toggle"
                                defaultChecked
                                aria-label="GST Bill"
                            />
                        </div>

                        <Button type="button" variant="outline" size="icon" aria-label="Settings">
                            <Settings className="size-4" />
                        </Button>

                        <Button type="button" variant="outline">
                            <Bookmark className="size-4" /> Draft
                        </Button>

                        <Button type="button" variant="default">
                            <CheckCircle2 className="size-4" /> Save & Print
                        </Button>
                    </div>
                </div>
            </div>
        </header>
    );
}
