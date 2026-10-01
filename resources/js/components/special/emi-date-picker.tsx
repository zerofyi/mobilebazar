"use client"

import * as React from "react"
import { CalendarIcon, X } from "lucide-react"
import { format, parse, isValid, startOfDay, isEqual } from "date-fns"

import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { InputGroup, InputGroupInput } from "@/components/ui/input-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

/**
 * Display + parse format. Kept as a single source of truth so the text the
 * user types is parsed with the exact same pattern used to render it back.
 */
const DATE_FORMAT = "MMMM dd, yyyy"
/** Format used for the hidden native input, so plain <form> / FormData submits still work. */
const ISO_DATE_FORMAT = "yyyy-MM-dd"

function formatDisplayDate(date: Date | undefined | null): string {
  if (!date || !isValid(date)) return ""
  return format(date, DATE_FORMAT)
}

function sanitizeAllowedDays(days: number[]): number[] {
  return Array.from(new Set(days.filter((d) => Number.isInteger(d) && d >= 1 && d <= 31))).sort(
    (a, b) => a - b
  )
}

export interface EmiDatePickerProps {
  /** The currently selected EMI date (controlled). */
  selectedDate?: Date
  /** Array of numbers representing valid billing days (e.g. [1], [1, 15], [1, 10, 20]). */
  allowedDays: number[]
  /** The single day-of-month that should render as the "preferred" (green) option. */
  primaryDay: number
  /**
   * Rolling collection slab (e.g. `every_30_days`): any date within the
   * allowed window may be selected. The backend returns `allowed_days: []`
   * for rolling slabs — pass this flag so empty `allowedDays` is treated
   * as "any date" instead of "no dates".
   */
  isRolling?: boolean
  /** Fires whenever the value changes to a valid allowed date, or to undefined when cleared/invalid. */
  onChange?: (date: Date | undefined) => void
  /** How many months ahead a date may be selected. Defaults to 6. */
  monthsAhead?: number
  /** Native input/select name, useful if this field is read via plain FormData or Inertia's useForm. */
  name?: string
  /** Visible field label. Omit to render without a <Label>. */
  label?: string
  /** Marks the field as required for a11y + native form validation styling. */
  required?: boolean
  /** Disables all interaction. */
  disabled?: boolean
  /** Server/validation error (e.g. from Laravel's ValidationException / Inertia page.props.errors). Takes precedence over local validation messaging. */
  error?: string
  /** Extra classnames for the outer wrapper. */
  className?: string
  id?: string
  placeholder?: string
}

const EmiDatePicker = React.forwardRef<HTMLInputElement, EmiDatePickerProps>(
  function EmiDatePicker(
    {
      selectedDate,
      allowedDays,
      primaryDay,
      isRolling = false,
      onChange,
      monthsAhead = 6,
      name,
      label,
      required,
      disabled,
      error,
      className,
      id,
      placeholder = "e.g., July 01, 2026",
    },
    forwardedRef
  ) {
    const reactId = React.useId()
    const inputId = id ?? `emi-date-picker-${reactId}`
    const errorId = `${inputId}-error`
    const descriptionId = `${inputId}-description`

    const cleanAllowedDays = React.useMemo(() => sanitizeAllowedDays(allowedDays), [allowedDays])
    // Rolling slabs allow any in-window date; fixed slabs restrict to the allowed days.
    const rollingMode = isRolling === true
    const hasAllowedDays = cleanAllowedDays.length > 0 || rollingMode

    if (import.meta.env.DEV) {
      if (!hasAllowedDays) {
        console.warn("EmiDatePicker: `allowedDays` produced no valid day-of-month values (1-31).")
      } else if (!rollingMode && !cleanAllowedDays.includes(primaryDay)) {
        console.warn(
          `EmiDatePicker: primaryDay (${primaryDay}) is not included in allowedDays [${cleanAllowedDays.join(
            ", "
          )}].`
        )
      }
    }

    // Stable "today" / max-future bounds for the lifetime of this mount.
    const today = React.useMemo(() => startOfDay(new Date()), [])
    const maxFutureDate = React.useMemo(() => {
      const d = new Date(today)
      d.setMonth(d.getMonth() + monthsAhead)
      return d
    }, [today, monthsAhead])

    const [open, setOpen] = React.useState(false)
    const [date, setDate] = React.useState<Date | undefined>(
      selectedDate && isValid(selectedDate) ? startOfDay(selectedDate) : undefined
    )
    const [month, setMonth] = React.useState<Date>(
      selectedDate && isValid(selectedDate) ? selectedDate : today
    )
    const [value, setValue] = React.useState(() => formatDisplayDate(date))
    const [localError, setLocalError] = React.useState<string | null>(null)

    const internalRef = React.useRef<HTMLInputElement>(null)
    React.useImperativeHandle(forwardedRef, () => internalRef.current as HTMLInputElement)

    // Keep in sync if the value is changed upstream (e.g. form reset).
    React.useEffect(() => {
      const next = selectedDate && isValid(selectedDate) ? startOfDay(selectedDate) : undefined
      setDate((prev) => (prev && next && isEqual(prev, next) ? prev : next))
      setValue(formatDisplayDate(next))
      setLocalError(null)
      if (next) setMonth(next)
    }, [selectedDate])

    const isDateAllowed = React.useCallback(
      (targetDate: Date): boolean => {
        const normalizedTarget = startOfDay(targetDate)
        const dayNum = normalizedTarget.getDate()
        const inWindow =
          normalizedTarget >= today &&
          normalizedTarget <= maxFutureDate
        if (!inWindow) return false
        // Rolling mode: any in-window date is a valid billing date.
        if (rollingMode) return true
        return cleanAllowedDays.includes(dayNum)
      },
      [cleanAllowedDays, rollingMode, today, maxFutureDate]
    )

    const commitDate = React.useCallback(
      (next: Date | undefined) => {
        setDate(next)
        setValue(formatDisplayDate(next))
        setLocalError(null)
        onChange?.(next)
      },
      [onChange]
    )

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      setValue(raw)
      if (localError) setLocalError(null)

      if (!raw.trim()) {
        if (date !== undefined) {
          setDate(undefined)
          onChange?.(undefined)
        }
        return
      }

      const parsedDate = parse(raw, DATE_FORMAT, new Date())
      if (isValid(parsedDate)) {
        const normalized = startOfDay(parsedDate)
        if (isDateAllowed(normalized)) {
          setDate(normalized)
          setMonth(normalized)
          onChange?.(normalized)
        } else if (date !== undefined) {
          setDate(undefined)
          onChange?.(undefined)
        }
      } else if (date !== undefined) {
        setDate(undefined)
        onChange?.(undefined)
      }
    }

    const handleInputBlur = () => {
      const trimmed = value.trim()
      if (!trimmed) {
        setLocalError(null)
        setValue("")
        return
      }
      if (!date) {
        // User left behind text that never resolved to a valid, allowed date.
        setLocalError("Enter a valid billing date, or pick one from the calendar.")
      } else {
        setLocalError(null)
      }
      // Always snap the visible text back to the canonical format for whatever committed value exists.
      setValue(formatDisplayDate(date))
    }

    const handleClear = () => {
      commitDate(undefined)
      internalRef.current?.focus()
    }

    const modifiers = React.useMemo(
      () => ({
        availableGreen: (day: Date) =>
          isDateAllowed(day) &&
          day.getDate() === primaryDay &&
          (rollingMode || cleanAllowedDays.includes(day.getDate())),
        availableYellow: (day: Date) =>
          isDateAllowed(day) &&
          day.getDate() !== primaryDay &&
          (rollingMode || cleanAllowedDays.includes(day.getDate())),
      }),
      [primaryDay, cleanAllowedDays, rollingMode, isDateAllowed]
    )

    const modifiersStyles = React.useMemo(
      () => ({
        availableGreen: {
          color: "rgb(21 128 61)",
          backgroundColor: "rgb(34 197 94 / 0.15)",
          fontWeight: 600,
          borderRadius: "0.375rem",
        },
        availableYellow: {
          color: "rgb(161 98 7)",
          backgroundColor: "rgb(234 179 8 / 0.15)",
          fontWeight: 600,
          borderRadius: "0.375rem",
        },
      }),
      []
    )

    const shownError = error ?? localError
    const describedBy = [shownError ? errorId : null, !shownError ? descriptionId : null]
      .filter(Boolean)
      .join(" ") || undefined

    return (
      <div className={cn("flex flex-col space-y-2", className)}>
        {label && (
          <Label htmlFor={inputId}>
            {label}
            {required && <span className="text-destructive"> *</span>}
          </Label>
        )}

        <InputGroup className="relative flex items-center w-full min-w-55">
          <InputGroupInput
            id={inputId}
            ref={internalRef}
            name={name}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            autoComplete="off"
            aria-invalid={Boolean(shownError) || undefined}
            aria-describedby={describedBy}
            aria-required={required || undefined}
            className={cn(shownError && "border-destructive focus-visible:ring-destructive/40")}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onFocus={() => setLocalError(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault()
                setOpen(true)
              } else if (e.key === "Escape" && open) {
                setOpen(false)
              }
            }}
          />

          {date && !disabled && (
            <Button
              type="button"
              variant="ghost"
              className="absolute right-9 p-1 h-auto w-auto text-muted-foreground hover:opacity-80 transition-opacity bg-transparent border-none cursor-pointer z-10"
              aria-label="Clear selected date"
              onClick={handleClear}
              tabIndex={-1}
            >
              <X className="size-3.5" />
            </Button>
          )}

          <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                disabled={disabled}
                className="absolute right-3 p-1 hover:opacity-80 transition-opacity bg-transparent border-none cursor-pointer flex items-center justify-center h-auto w-auto z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                aria-label="Open calendar"
                aria-haspopup="dialog"
                aria-expanded={open}
              >
                <CalendarIcon className="size-4 text-muted-foreground" />
              </Button>
            </PopoverTrigger>

            <PopoverContent
              className="w-auto overflow-hidden p-0 border shadow-md rounded-md bg-popover"
              align="end"
              alignOffset={-8}
              sideOffset={10}
            >
              <Calendar
                mode="single"
                selected={date}
                month={month}
                onMonthChange={setMonth}
                onSelect={(selected) => {
                  const normalized = selected ? startOfDay(selected) : undefined
                  commitDate(normalized)
                  setOpen(false)
                  internalRef.current?.focus()
                }}
                disabled={(day) => !isDateAllowed(day)}
                modifiers={modifiers}
                modifiersStyles={modifiersStyles}
              />
              <div className="flex flex-wrap items-center gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block size-2.5 rounded-sm"
                    style={{ backgroundColor: "rgb(34 197 94 / 0.5)" }}
                  />
                  Preferred date
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block size-2.5 rounded-sm"
                    style={{ backgroundColor: "rgb(234 179 8 / 0.5)" }}
                  />
                  Other available dates
                </span>
              </div>
            </PopoverContent>
          </Popover>
        </InputGroup>

        {/* Hidden native input so a plain <form>/FormData submit still carries an ISO value. */}
        {name && (
          <input type="hidden" name={`${name}_iso`} value={date ? format(date, ISO_DATE_FORMAT) : ""} />
        )}

        {shownError ? (
          <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
            {shownError}
          </p>
        ) : (
          hasAllowedDays && (
            <p id={descriptionId} className="text-xs text-muted-foreground">
              {rollingMode ? (
                <>Any date · up to {monthsAhead} month{monthsAhead === 1 ? "" : "s"} ahead</>
              ) : (
                <>Billing day{cleanAllowedDays.length > 1 ? "s" : ""}: {cleanAllowedDays.join(", ")} · up
                to {monthsAhead} month{monthsAhead === 1 ? "" : "s"} ahead</>
              )}
            </p>
          )
        )}
      </div>
    )
  }
)

EmiDatePicker.displayName = "EmiDatePicker"

export default EmiDatePicker
