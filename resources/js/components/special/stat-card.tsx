"use client";

import {
  forwardRef,
  memo,
  useId,
  type ComponentPropsWithoutRef,
  type ForwardedRef,
  type ReactNode,
} from "react";
import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Visual treatment for the card. "error" and "danger" render identically —
 * both names are kept so existing call sites don't break; prefer "danger"
 * going forward.
 */
export type Variant = "default" | "success" | "warning" | "info" | "error" | "danger";

export interface StatCardProps extends Omit<ComponentPropsWithoutRef<typeof Card>, "title"> {
  /** Label shown above the value. */
  title: string;
  icon: LucideIcon;
  /** Primary metric. Accepts a node so callers can pass pre-formatted/composite content. */
  value: ReactNode;
  /** Secondary value rendered inline with `subtitle` (e.g. a comparison figure). */
  subValue?: ReactNode;
  /** Short caption under the value, paired with `subValue`. */
  subtitle?: string;
  /** Percent change. Sign controls the trend color/arrow; exactly 0 renders a neutral "flat" state. */
  growth?: number;
  variant?: Variant;
  /** Renders a skeleton placeholder sized to match the loaded card, so nothing shifts when data arrives. */
  loading?: boolean;
}

const destructiveStyle = {
  card: "border-destructive/30 bg-destructive/5",
  icon: "text-destructive",
};

const variantStyles: Record<Variant, { card: string; icon: string }> = {
  default: {
    card: "border-border bg-muted/30",
    icon: "text-muted-foreground",
  },
  success: {
    card: "border-emerald-500/30 bg-emerald-500/5",
    icon: "text-emerald-500",
  },
  warning: {
    card: "border-yellow-500/30 bg-yellow-500/5",
    icon: "text-yellow-500",
  },
  info: {
    card: "border-blue-500/30 bg-blue-500/5",
    icon: "text-blue-500",
  },
  error: destructiveStyle,
  danger: destructiveStyle,
};

const trendStyles = {
  up: "text-emerald-500",
  down: "text-destructive",
  flat: "text-muted-foreground",
} as const;

// Module-level so it isn't rebuilt on every render.
const percentFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

function StatCardBase(
  {
    title,
    icon: Icon,
    value,
    subValue,
    subtitle,
    growth,
    variant = "default",
    loading = false,
    className,
    ...rest
  }: StatCardProps,
  ref: ForwardedRef<HTMLDivElement>
) {
  const titleId = useId();
  const styles = variantStyles[variant] ?? variantStyles.default;

  if (loading) {
    // Structure mirrors the loaded card exactly (same padding/gaps) so toggling
    // `loading` doesn't cause layout shift.
    return (
      <Card
        ref={ref}
        aria-busy="true"
        aria-label={`Loading ${title}`}
        className={cn("border transition-all duration-200", styles.card, className)}
        {...rest}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 px-4">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-4 w-4 rounded-full" />
        </CardHeader>
        <CardContent className="space-y-2 px-4">
          <div className="flex items-baseline justify-between gap-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-12" />
          </div>
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    );
  }

  // Guard against bad upstream data (NaN/Infinity) so it can't render "NaN%"
  // or silently pick a trend color. 0 is treated as its own neutral state
  // rather than lumped in with "positive".
  const validGrowth = typeof growth === "number" && Number.isFinite(growth) ? growth : undefined;
  const trend =
    validGrowth === undefined ? undefined : validGrowth > 0 ? "up" : validGrowth < 0 ? "down" : "flat";
  const TrendIcon = trend === "down" ? ArrowDownRight : trend === "flat" ? Minus : ArrowUpRight;

  return (
    <Card
      ref={ref}
      aria-labelledby={titleId}
      className={cn("border transition-all duration-200", styles.card, className)}
      {...rest}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2 pb-1.5 px-4">
        <CardTitle
          id={titleId}
          title={title}
          className="truncate text-xs font-bold uppercase tracking-wider text-muted-foreground"
        >
          {title}
        </CardTitle>
        <Icon aria-hidden="true" className={cn("h-4 w-4 shrink-0", styles.icon)} />
      </CardHeader>

      <CardContent className="space-y-1 px-4">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className="min-w-0 truncate text-xl font-bold tracking-tight"
            title={typeof value === "string" ? value : undefined}
          >
            {value}
          </span>

          {trend && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold",
                trendStyles[trend]
              )}
              aria-label={`${trend === "flat" ? "Flat at" : trend === "up" ? "Up" : "Down"} ${percentFormatter.format(
                Math.abs(validGrowth as number)
              )}%`}
            >
              <TrendIcon aria-hidden="true" className="h-3 w-3" />
              {percentFormatter.format(Math.abs(validGrowth as number))}%
            </span>
          )}
        </div>

        {(subtitle || subValue) && (
          <p className="truncate text-[11px] text-muted-foreground">
            {subtitle}
            {subtitle && subValue && " "}
            {subValue && <span className="font-semibold text-foreground">{subValue}</span>}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const StatCardWithRef = forwardRef<HTMLDivElement, StatCardProps>(StatCardBase);
StatCardWithRef.displayName = "StatCard";

export const StatCard = memo(StatCardWithRef);

export default StatCard;
