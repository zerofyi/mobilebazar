import React from 'react';
import { UserCheck, AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

export interface IdentityConflictData {
    matched: boolean;
    user_id: number;
    customer_name: string;
    user_name: string;
    phone: string;
}

interface IdentityConflictDialogProps {
    open: boolean;
    conflictData: IdentityConflictData | null;
    onResolve: (preferredName: string) => void;
    onCancel: () => void;
}

export default function IdentityConflictDialog({
    open,
    conflictData,
    onResolve,
    onCancel,
}: IdentityConflictDialogProps) {
    if (!conflictData) return null;

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 font-bold text-lg text-amber-600 dark:text-amber-500">
                        <AlertTriangle className="size-5 shrink-0" />
                        Online Account Match Found
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        The primary phone number <span className="font-mono font-semibold text-foreground">{conflictData.phone}</span> is associated with an existing online user account, but the registered names differ.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-2">
                    <p className="text-xs text-muted-foreground">
                        Select which name should be preserved across both POS retail records and the online user account:
                    </p>

                    <div className="grid grid-cols-1 gap-2.5">
                        <button
                            type="button"
                            onClick={() => onResolve(conflictData.customer_name)}
                            className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/50 bg-card hover:bg-accent/40 text-left transition-all group"
                        >
                            <div className="space-y-0.5">
                                <p className="text-xs font-bold text-foreground">
                                    Use Retail Name: "{conflictData.customer_name}"
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                    Entered during POS registration
                                </p>
                            </div>
                            <UserCheck className="size-4 text-muted-foreground group-hover:text-primary shrink-0" />
                        </button>

                        <button
                            type="button"
                            onClick={() => onResolve(conflictData.user_name)}
                            className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/50 bg-card hover:bg-accent/40 text-left transition-all group"
                        >
                            <div className="space-y-0.5">
                                <p className="text-xs font-bold text-foreground">
                                    Use Online Account Name: "{conflictData.user_name}"
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                    Registered on web/mobile account
                                </p>
                            </div>
                            <UserCheck className="size-4 text-muted-foreground group-hover:text-primary shrink-0" />
                        </button>
                    </div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" size="sm" onClick={onCancel}>
                        Cancel Registration
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
