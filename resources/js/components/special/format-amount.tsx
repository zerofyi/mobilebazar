import React from 'react';

interface FormatAmountProps {
    amount: number | string | undefined | null;
    className?: string;
}

export function FormatAmount({ amount, className }: FormatAmountProps) {
    if (amount === undefined || amount === null || isNaN(Number(amount))) {
        return <span className={className}>0</span>;
    }

    const num = Number(amount);

    // Whole numbers: show only integer
    if (num % 1 === 0) {
        return <span className={className}>{num.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>;
    }

    // Decimal numbers: split integer and muted decimal
    const formatted = num.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    const [integerPart, decimalPart] = formatted.split('.');

    return (
        <span className={className}>
            {integerPart}
            <span className="text-muted-foreground/70 font-normal text-[0.85em]">
                .{decimalPart}
            </span>
        </span>
    );
}
