import { Head, Link } from "@inertiajs/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import JsBarcode from "jsbarcode";
import {
    AlertTriangle, AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowUp, Barcode, Bold, Check,
    ChevronDown, Copy, Database, Download, Eye, EyeOff, FolderOpen, Italic, Layers, ListChecks, Maximize,
    Minus, Pencil, Plus, Printer, Redo2, RotateCcw, Save, Search, Strikethrough, Tag, Trash2, Type,
    Underline, Undo2, Upload, ZoomIn, ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════════
   Label Studio — single-file label design & print suite
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─── Data from InventoryController::labels ─────────────────────────────── */

interface LabelUnit {
    id: number;
    product_name: string;
    variant_name: string | null;
    sku: string | null;
    barcode: string | null;
    imei1: string | null;
    imei2: string | null;
    serial_number: string | null;
    condition: string | null;
    warranty: string | null;
    status: string;
    mrp: number | null;
    wholesale_price: number | null;
    retail_price: number | null;
}

interface LabelBatch {
    id: number;
    product_name: string;
    variant_name: string | null;
    sku: string | null;
    barcode: string | null;
    batch_number: string | null;
    qty: number;
    warranty: string | null;
    mrp: number | null;
    wholesale_price: number | null;
    retail_price: number | null;
}

interface Props {
    store: { name: string; code: string };
    units: LabelUnit[];
    batches: LabelBatch[];
}

/* ─── Types ─────────────────────────────────────────────────────────────── */

type Align = "left" | "center" | "right";
type VAlign = "top" | "middle" | "bottom" | "spread";
type BarcodeSource = "auto" | "barcode" | "sku" | "imei" | "batch";
type BarcodeFormat = "CODE128" | "CODE39" | "EAN13" | "EAN8" | "UPC" | "ITF";
type PriceSource = "retail" | "mrp" | "wholesale";
type TextCase = "asis" | "upper" | "lower" | "title";
type FontFamily = "arial" | "narrow" | "system" | "mono" | "serif";
type Rotation = 0 | 90 | 180 | 270;
type BorderStyle = "none" | "solid" | "dashed" | "dotted";
type SortMode = "queue" | "name" | "price" | "reverse";
type DateFormat = "dmy" | "my" | "dmony";
type Decimals = "auto" | "0" | "2";
type ElementKey =
    | "store" | "name" | "variant" | "sku" | "imei" | "batch" | "condition" | "warranty" | "date"
    | "barcode" | "price" | "mrp" | "wholesale" | "custom1" | "custom2" | "divider";
type StyleKey = Exclude<ElementKey, "divider">;
type TextKey = Exclude<ElementKey, "barcode" | "divider">;
type RibbonTab = "home" | "layout" | "text" | "barcode" | "print" | "view";
type DataTab = "units" | "batches" | "manual";

interface ElementStyle {
    sizePt: number;
    weight: 400 | 500 | 600 | 700 | 800;
    italic: boolean;
    underline: boolean;
    strike: boolean;
    textCase: TextCase;
    align: "inherit" | Align;
    tracking: number; // letter-spacing, 1/100 em
    lineHeight: number;
    spaceBeforeMm: number;
    invert: boolean; // white on black
}

interface LabelSettings {
    presetId: string;
    widthMm: number;
    heightMm: number;
    rotation: Rotation;
    columns: 1 | 2 | 3 | 4;
    skip: number;
    gapMm: number;
    edgeMarginMm: number;
    paddingMm: number;
    rowGapMm: number;
    offsetXmm: number;
    offsetYmm: number;
    align: Align;
    vAlign: VAlign;
    fontFamily: FontFamily;
    borderStyle: BorderStyle;
    borderWidthMm: number;
    radiusMm: number;
    dividerMm: number;
    visible: Record<ElementKey, boolean>;
    order: ElementKey[];
    templates: Record<TextKey, string>;
    elementStyles: Record<StyleKey, ElementStyle>;
    nameVariantSameLine: boolean;
    nameLines: 1 | 2 | 3;
    dateFormat: DateFormat;
    decimals: Decimals;
    priceSource: PriceSource;
    mrpPosition: "inline" | "above";
    barcodeSource: BarcodeSource;
    barcodeFormat: BarcodeFormat;
    barcodeHeightMm: number;
    barcodeScale: number;
    showBarcodeText: boolean;
    barcodeTextPos: "below" | "above";
    sort: SortMode;
    collate: boolean;
    copyMultiplier: number;
}

interface ViewState {
    tab: RibbonTab;
    zoom: number;
    rulers: boolean;
    edges: boolean;
    guides: boolean;
    rowNumbers: boolean;
    showLayers: boolean;
    showData: boolean;
}

interface ManualLabel {
    id: number;
    title: string;
    sub: string;
    barcode: string;
    price: string;
    copies: number;
}

interface UserTemplate {
    id: number;
    name: string;
    settings: LabelSettings;
}

interface LabelData {
    key: string;
    name: string;
    variant: string | null;
    sku: string | null;
    imei: string | null;
    serial: string | null;
    batch: string | null;
    condition: string | null;
    warranty: string | null;
    barcodeValue: string;
    price: number | null;
    priceText: string | null;
    mrp: number | null;
    wholesale: number | null;
    qty: number | null;
}

interface QueueItem {
    data: LabelData;
    copies: number;
}

/* ─── Constants ─────────────────────────────────────────────────────────── */

const MM_PX = 3.7795275591;
const MAX_SCREEN_ROWS = 80;

const ELEMENTS: { key: ElementKey; label: string; orderable: boolean }[] = [
    { key: "store", label: "Store name", orderable: true },
    { key: "name", label: "Product name", orderable: true },
    { key: "variant", label: "Variant", orderable: true },
    { key: "sku", label: "SKU", orderable: true },
    { key: "imei", label: "IMEI / Serial", orderable: true },
    { key: "batch", label: "Batch number", orderable: true },
    { key: "condition", label: "Condition", orderable: true },
    { key: "warranty", label: "Warranty", orderable: true },
    { key: "date", label: "Print date", orderable: true },
    { key: "barcode", label: "Barcode", orderable: true },
    { key: "price", label: "Price", orderable: true },
    { key: "mrp", label: "MRP (strikethrough)", orderable: false },
    { key: "wholesale", label: "Wholesale price", orderable: true },
    { key: "custom1", label: "Custom line 1", orderable: true },
    { key: "custom2", label: "Custom line 2", orderable: true },
    { key: "divider", label: "Divider line", orderable: true },
];
const ALL_KEYS = ELEMENTS.map((e) => e.key);
const STYLE_KEYS = ALL_KEYS.filter((k) => k !== "divider") as StyleKey[];
const DEFAULT_ORDER = ELEMENTS.filter((e) => e.orderable).map((e) => e.key);
const elLabel = (k: ElementKey) => ELEMENTS.find((e) => e.key === k)?.label ?? k;

const PRESETS: { id: string; name: string; w: number; h: number }[] = [
    { id: "50x20", name: "50 × 20", w: 50, h: 20 },
    { id: "50x25", name: "50 × 25", w: 50, h: 25 },
    { id: "50x30", name: "50 × 30", w: 50, h: 30 },
    { id: "38x25", name: "38 × 25", w: 38, h: 25 },
    { id: "75x50", name: "75 × 50", w: 75, h: 50 },
    { id: "100x50", name: "100 × 50", w: 100, h: 50 },
];

const FONT_STACKS: Record<FontFamily, string> = {
    arial: 'Arial, Helvetica, sans-serif',
    narrow: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif',
    system: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    mono: '"Courier New", ui-monospace, monospace',
    serif: 'Georgia, "Times New Roman", serif',
};

const CASE_CSS: Record<TextCase, CSSProperties["textTransform"]> = {
    asis: "none", upper: "uppercase", lower: "lowercase", title: "capitalize",
};

const TOKEN_LIST = [
    "store", "name", "variant", "sku", "imei", "serial", "imei_serial", "imei_label", "batch", "condition",
    "warranty", "price", "mrp", "wholesale", "barcode", "date", "qty",
];

function es(sizePt: number, weight: ElementStyle["weight"] = 400, textCase: TextCase = "asis", extra: Partial<ElementStyle> = {}): ElementStyle {
    return {
        sizePt, weight, textCase, italic: false, underline: false, strike: false, align: "inherit",
        tracking: 0, lineHeight: 1.15, spaceBeforeMm: 0, invert: false, ...extra,
    };
}

const DEFAULT_ELEMENT_STYLES: Record<StyleKey, ElementStyle> = {
    store: es(7, 700, "upper", { tracking: 4 }),
    name: es(9, 600),
    variant: es(7),
    sku: es(7),
    imei: es(7),
    batch: es(7),
    condition: es(7),
    warranty: es(7),
    date: es(6.5),
    barcode: es(7, 400, "asis", { tracking: 8 }),
    price: es(11, 800),
    mrp: es(7, 400, "asis", { strike: true }),
    wholesale: es(7),
    custom1: es(7),
    custom2: es(7),
};

const DEFAULT_TEMPLATES: Record<TextKey, string> = {
    store: "{store}",
    name: "{name}",
    variant: "{variant}",
    sku: "SKU: {sku}",
    imei: "{imei_label}: {imei_serial}",
    batch: "Batch: {batch}",
    condition: "{condition}",
    warranty: "Warranty: {warranty}",
    date: "{date}",
    price: "₹{price}",
    mrp: "MRP ₹{mrp}",
    wholesale: "WS ₹{wholesale}",
    custom1: "",
    custom2: "",
};

const DEFAULT_VISIBLE: Record<ElementKey, boolean> = {
    store: true, name: true, variant: true, sku: false, imei: true, batch: false, condition: false,
    warranty: true, date: false, barcode: true, price: true, mrp: true, wholesale: false,
    custom1: false, custom2: false, divider: false,
};

const DEFAULT_SETTINGS: LabelSettings = {
    presetId: "50x25",
    widthMm: 50,
    heightMm: 25,
    rotation: 0,
    columns: 2,
    skip: 0,
    gapMm: 3,
    edgeMarginMm: 2,
    paddingMm: 2,
    rowGapMm: 0.6,
    offsetXmm: 0,
    offsetYmm: 0,
    align: "center",
    vAlign: "top",
    fontFamily: "arial",
    borderStyle: "none",
    borderWidthMm: 0.25,
    radiusMm: 0,
    dividerMm: 0.2,
    visible: DEFAULT_VISIBLE,
    order: DEFAULT_ORDER,
    templates: DEFAULT_TEMPLATES,
    elementStyles: DEFAULT_ELEMENT_STYLES,
    nameVariantSameLine: false,
    nameLines: 2,
    dateFormat: "dmy",
    decimals: "auto",
    priceSource: "retail",
    mrpPosition: "inline",
    barcodeSource: "auto",
    barcodeFormat: "CODE128",
    barcodeHeightMm: 8,
    barcodeScale: 1,
    showBarcodeText: true,
    barcodeTextPos: "below",
    sort: "queue",
    collate: false,
    copyMultiplier: 1,
};

const DEFAULT_VIEW: ViewState = {
    tab: "home", zoom: 1.5, rulers: true, edges: true, guides: false, rowNumbers: true, showLayers: true, showData: true,
};

const KEY_SETTINGS = "mobilebazar.labelSettings.v3";
const KEY_V2 = "mobilebazar.labelSettings.v2";
const KEY_V1 = "mobilebazar.labelSettings.v1";
const KEY_VIEW = "mobilebazar.labelView.v1";
const KEY_TEMPLATES = "mobilebazar.labelTemplates.v1";
const KEY_MANUAL = "mobilebazar.labelManual.v1";

const onlyVisible = (keys: ElementKey[]): Record<ElementKey, boolean> =>
    Object.fromEntries(ALL_KEYS.map((k) => [k, keys.includes(k)])) as Record<ElementKey, boolean>;

const styled = (patches: Partial<Record<StyleKey, Partial<ElementStyle>>>): Record<StyleKey, ElementStyle> => {
    const out = { ...DEFAULT_ELEMENT_STYLES };
    for (const k of Object.keys(patches) as StyleKey[]) out[k] = { ...out[k], ...patches[k] };
    return out;
};

const BUILTIN_TEMPLATES: { id: string; name: string; patch: Partial<LabelSettings> }[] = [
    { id: "phone", name: "Phone label · 50×25 · 2-up", patch: {} },
    {
        id: "imei", name: "IMEI strip · 50×20 · 2-up",
        patch: { presetId: "50x20", heightMm: 20, visible: onlyVisible(["name", "imei", "barcode"]), barcodeHeightMm: 7, elementStyles: styled({ name: { sizePt: 8 } }) },
    },
    {
        id: "price", name: "Price tag · 50×30 · 2-up",
        patch: {
            presetId: "50x30", heightMm: 30, visible: onlyVisible(["store", "name", "variant", "price", "mrp", "barcode"]),
            mrpPosition: "above", barcodeHeightMm: 7, elementStyles: styled({ price: { sizePt: 18 } }),
        },
    },
    {
        id: "accessory", name: "Accessory · name + price + barcode",
        patch: { visible: onlyVisible(["name", "barcode", "price", "mrp"]), nameLines: 2 },
    },
    {
        id: "barcode", name: "Barcode only · 50×20",
        patch: { presetId: "50x20", heightMm: 20, visible: onlyVisible(["barcode"]), barcodeHeightMm: 11, vAlign: "middle" },
    },
    { id: "roll1", name: "Single column roll · 50×25 · 1-up", patch: { columns: 1 } },
];

/* ─── Persistence & migration ───────────────────────────────────────────── */

function loadJson<T>(key: string, fallback: T): T {
    try {
        const raw = window.localStorage.getItem(key);
        if (raw) return JSON.parse(raw) as T;
    } catch {
        /* storage unavailable/corrupt */
    }
    return fallback;
}

function clamp(n: number, lo: number, hi: number) {
    return Math.min(hi, Math.max(lo, n));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(raw: any): LabelSettings {
    const d = DEFAULT_SETTINGS;
    if (!raw || typeof raw !== "object") return d;

    const visible = { ...d.visible };
    const legacyShow: Record<string, ElementKey[]> = {
        showStore: ["store"], showName: ["name"], showVariant: ["variant"], showSku: ["sku"], showImei: ["imei"],
        showBatch: ["batch"], showCondition: ["condition"], showWarranty: ["warranty"], showBarcode: ["barcode"],
        showPrice: ["price"], showMrp: ["mrp"], showWholesale: ["wholesale"], showCustom: ["custom1", "custom2"],
    };
    if (raw.visible && typeof raw.visible === "object") Object.assign(visible, raw.visible);
    else for (const [flag, keys] of Object.entries(legacyShow)) if (typeof raw[flag] === "boolean") keys.forEach((k) => (visible[k] = raw[flag]));

    const metaKeys: StyleKey[] = ["sku", "imei", "batch", "condition", "warranty", "date", "mrp", "wholesale", "custom1", "custom2"];
    const styles = {} as Record<StyleKey, ElementStyle>;
    for (const k of STYLE_KEYS) {
        const fromRaw = raw.elementStyles?.[k] ?? (metaKeys.includes(k) ? raw.elementStyles?.meta : undefined);
        styles[k] = { ...d.elementStyles[k], ...(fromRaw ?? {}) };
    }

    const templates = { ...d.templates, ...(raw.templates ?? {}) } as Record<TextKey, string>;
    if (!raw.templates) {
        if (raw.customLine1) templates.custom1 = String(raw.customLine1);
        if (raw.customLine2) templates.custom2 = String(raw.customLine2);
    }

    const known = new Set<ElementKey>(DEFAULT_ORDER);
    const order: ElementKey[] = [];
    for (const k of Array.isArray(raw.order) ? raw.order : []) if (known.has(k) && !order.includes(k)) order.push(k);
    for (const k of DEFAULT_ORDER) if (!order.includes(k)) order.push(k);

    const skip = typeof raw.skip === "number" ? raw.skip : raw.startSide === "right" ? 1 : 0;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { zoom: _z, startSide: _s, elementStyles: _e, ...rest } = raw;
    const merged: LabelSettings = { ...d, ...rest, visible, elementStyles: styles, templates, order, skip };
    merged.columns = clamp(Number(merged.columns) || 2, 1, 4) as LabelSettings["columns"];
    merged.skip = clamp(Math.round(merged.skip) || 0, 0, 99);
    return merged;
}

function loadSettings(): LabelSettings {
    try {
        const v3 = window.localStorage.getItem(KEY_SETTINGS);
        if (v3) return normalize(JSON.parse(v3));
        const v2 = window.localStorage.getItem(KEY_V2);
        if (v2) return normalize(JSON.parse(v2));
        const v1 = window.localStorage.getItem(KEY_V1);
        if (v1) {
            const old = JSON.parse(v1);
            const styles: Record<string, Partial<ElementStyle>> = {};
            if (old.storeSizePt) styles.store = { sizePt: old.storeSizePt };
            if (old.nameSizePt) styles.name = { sizePt: old.nameSizePt };
            if (old.metaSizePt) styles.meta = { sizePt: old.metaSizePt };
            if (old.priceSizePt) styles.price = { sizePt: old.priceSizePt };
            return normalize({ ...old, elementStyles: styles });
        }
    } catch {
        /* fall through to defaults */
    }
    return DEFAULT_SETTINGS;
}

/* ─── Formatting helpers ────────────────────────────────────────────────── */

function fmtMoney(n: number, decimals: Decimals): string {
    const v = Number(n);
    if (!Number.isFinite(v)) return "0";
    if (decimals === "0") return Math.round(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });
    if (decimals === "2") return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v.toLocaleString("en-IN", { minimumFractionDigits: v % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
}

function fmtDate(fmt: DateFormat): string {
    const d = new Date();
    const mon = d.toLocaleString("en-GB", { month: "short" });
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    if (fmt === "my") return `${mon} ${d.getFullYear()}`;
    if (fmt === "dmony") return `${dd}-${mon}-${String(d.getFullYear()).slice(2)}`;
    return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Replace {tokens}; returns null (line hidden) when any known token is empty. */
function fill(tpl: string, vals: Record<string, string | null>): string | null {
    if (!tpl || !tpl.trim()) return null;
    let missing = false;
    const out = tpl.replace(/\{(\w+)\}/g, (m, k: string) => {
        if (!(k in vals)) return m;
        const v = vals[k];
        if (v === null || v === undefined || v === "") {
            missing = true;
            return "";
        }
        return v;
    });
    return missing ? null : out;
}

function tokensOf(d: LabelData, s: LabelSettings, store: string, dateText: string): Record<string, string | null> {
    const money = (n: number | null, positiveOnly = false) =>
        n === null || (positiveOnly && !(n > 0)) ? null : fmtMoney(n, s.decimals);
    return {
        store,
        name: d.name,
        variant: d.variant,
        sku: d.sku,
        imei: d.imei,
        serial: d.serial,
        imei_serial: d.imei ?? d.serial,
        imei_label: d.imei ? "IMEI" : d.serial ? "S/N" : null,
        batch: d.batch,
        condition: d.condition,
        warranty: d.warranty,
        price: money(d.price),
        mrp: money(d.mrp, true),
        wholesale: money(d.wholesale, true),
        barcode: d.barcodeValue || null,
        date: dateText,
        qty: d.qty !== null ? String(d.qty) : null,
    };
}

/* ─── Barcode helpers ───────────────────────────────────────────────────── */

const MODULES: Record<BarcodeFormat, (n: number) => number> = {
    CODE128: (n) => (n + 3) * 11 + 2,
    CODE39: (n) => (n + 2) * 16,
    EAN13: () => 95,
    EAN8: () => 67,
    UPC: () => 95,
    ITF: (n) => n * 9 + 10,
};

/** Module (narrowest bar) width in CSS px, fitted to the printable width then scaled. */
function moduleWidthPx(value: string, format: BarcodeFormat, contentWidthMm: number, scale: number): number {
    const modules = MODULES[format](Math.max(value.length, 1));
    const targetPx = Math.max(contentWidthMm, 10) * MM_PX;
    return clamp((targetPx / modules) * scale, 0.6, 4);
}

function barcodeValid(value: string, format: BarcodeFormat): boolean {
    if (!value) return false;
    try {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        JsBarcode(svg, value, { format, displayValue: false });
        return true;
    } catch {
        return false;
    }
}

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function BarcodeGraphic({ value, format, heightMm, contentWidthMm, scale, showErrors }: {
    value: string; format: BarcodeFormat; heightMm: number; contentWidthMm: number; scale: number; showErrors: boolean;
}) {
    const ref = useRef<SVGSVGElement>(null);
    const [ok, setOk] = useState(true);

    useIsoLayoutEffect(() => {
        const el = ref.current;
        if (!el || !value) {
            setOk(false);
            return;
        }
        try {
            JsBarcode(el, value, {
                format,
                width: moduleWidthPx(value, format, contentWidthMm, scale),
                height: Math.max(8, heightMm * MM_PX),
                displayValue: false,
                margin: 0,
                background: "transparent",
                lineColor: "#000000",
            });
            const w = parseFloat(el.getAttribute("width") ?? "0");
            const h = parseFloat(el.getAttribute("height") ?? "0");
            if (w && h) {
                el.setAttribute("viewBox", `0 0 ${w} ${h}`);
                el.removeAttribute("width");
                el.removeAttribute("height");
                el.style.width = `${w}px`;
                el.style.height = "auto";
            }
            setOk(true);
        } catch {
            setOk(false);
        }
    }, [value, format, heightMm, contentWidthMm, scale]);

    const bad = !ok || !value;
    return (
        <>
            <svg ref={ref} aria-label={value} style={{ display: bad ? "none" : "block", maxWidth: "100%" }} />
            {bad && showErrors && (
                <div style={{ border: "0.2mm dashed #dc2626", color: "#dc2626", fontSize: "6pt", padding: "0.5mm 1.5mm", height: `${heightMm}mm`, boxSizing: "border-box", display: "flex", alignItems: "center" }}>
                    {!value ? "No barcode value" : `Invalid ${format} value`}
                </div>
            )}
        </>
    );
}

/* ─── One printable label ───────────────────────────────────────────────── */

interface FaceUi {
    selected: ElementKey | null;
    onSelect: (k: ElementKey) => void;
    edges: boolean;
    guides: boolean;
}

function LabelFace({ data, s, storeName, dateText, ui }: {
    data: LabelData; s: LabelSettings; storeName: string; dateText: string; ui?: FaceUi;
}) {
    const tok = tokensOf(data, s, storeName, dateText);
    const swap = s.rotation === 90 || s.rotation === 270;
    const innerW = swap ? s.heightMm : s.widthMm;
    const innerH = swap ? s.widthMm : s.heightMm;
    const contentW = innerW - s.paddingMm * 2 - (s.borderStyle !== "none" ? s.borderWidthMm * 2 : 0);

    const effAlign = (k: StyleKey): Align => {
        const a = s.elementStyles[k].align;
        return a === "inherit" ? s.align : a;
    };
    const justify = (a: Align) => (a === "left" ? "flex-start" : a === "right" ? "flex-end" : "center");

    const textCss = (k: StyleKey, extra?: CSSProperties): CSSProperties => {
        const st = s.elementStyles[k];
        const deco = [st.underline && "underline", st.strike && "line-through"].filter(Boolean).join(" ");
        return {
            width: "100%",
            fontSize: `${st.sizePt}pt`,
            fontWeight: st.weight,
            fontStyle: st.italic ? "italic" : "normal",
            textDecoration: deco || "none",
            textTransform: CASE_CSS[st.textCase],
            textAlign: effAlign(k),
            letterSpacing: st.tracking ? `${st.tracking / 100}em` : undefined,
            lineHeight: st.lineHeight,
            marginTop: st.spaceBeforeMm ? `${st.spaceBeforeMm}mm` : undefined,
            ...(st.invert ? { background: "#000", color: "#fff", padding: "0.15mm 0.8mm", boxSizing: "border-box" as const } : {}),
            ...extra,
        };
    };

    const selectProps = (k: ElementKey) =>
        ui ? { onClick: (e: ReactMouseEvent) => { e.stopPropagation(); ui.onSelect(k); } } : {};

    const oneLine: CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

    const render = (k: ElementKey): ReactNode => {
        if (!s.visible[k]) return null;
        switch (k) {
            case "divider":
                return <div style={{ width: "100%", height: 0, borderTop: `${s.dividerMm}mm solid #000`, margin: "0.3mm 0" }} />;
            case "mrp":
                return null; // drawn together with the price
            case "barcode": {
                const textNode =
                    s.showBarcodeText && data.barcodeValue ? <div style={textCss("barcode", oneLine)}>{data.barcodeValue}</div> : null;
                if (!data.barcodeValue && !ui) return null;
                return (
                    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: `${s.rowGapMm}mm` }}>
                        {s.barcodeTextPos === "above" && textNode}
                        <div style={{ width: "100%", display: "flex", justifyContent: justify(effAlign("barcode")) }}>
                            <BarcodeGraphic
                                value={data.barcodeValue}
                                format={s.barcodeFormat}
                                heightMm={s.barcodeHeightMm}
                                contentWidthMm={contentW}
                                scale={s.barcodeScale}
                                showErrors={!!ui}
                            />
                        </div>
                        {s.barcodeTextPos !== "above" && textNode}
                    </div>
                );
            }
            case "price": {
                const main = data.priceText ?? fill(s.templates.price, tok);
                if (!main) return null;
                const mrpTxt =
                    s.visible.mrp && data.priceText === null && data.mrp !== null && data.price !== null && data.mrp > data.price
                        ? fill(s.templates.mrp, tok)
                        : null;
                const above = s.mrpPosition === "above";
                const a = effAlign("price");
                const wrap: CSSProperties = above
                    ? { width: "100%", display: "flex", flexDirection: "column", alignItems: justify(a), gap: "0.2mm" }
                    : { width: "100%", display: "flex", alignItems: "baseline", gap: "1.5mm", flexWrap: "wrap", justifyContent: justify(a) };
                return (
                    <div style={wrap}>
                        {above && mrpTxt && <span {...selectProps("mrp")} style={textCss("mrp", { width: "auto" })}>{mrpTxt}</span>}
                        <span style={textCss("price", { width: "auto" })}>{main}</span>
                        {!above && mrpTxt && <span {...selectProps("mrp")} style={textCss("mrp", { width: "auto" })}>{mrpTxt}</span>}
                    </div>
                );
            }
            case "name": {
                let text = fill(s.templates.name, tok);
                if (!text) return null;
                if (s.nameVariantSameLine && data.variant) text = `${text} — ${data.variant}`;
                return (
                    <div style={textCss("name", { display: "-webkit-box", WebkitLineClamp: s.nameLines, WebkitBoxOrient: "vertical", overflow: "hidden" })}>
                        {text}
                    </div>
                );
            }
            case "variant":
                if (s.nameVariantSameLine) return null;
            // falls through
            default: {
                const text = fill(s.templates[k as TextKey], tok);
                if (!text) return null;
                return <div style={textCss(k as StyleKey, oneLine)}>{text}</div>;
            }
        }
    };

    const items = s.order.map((k) => {
        const node = render(k);
        if (node === null) return null;
        return (
            <div
                key={k}
                {...selectProps(k)}
                style={{
                    width: "100%",
                    flexShrink: 0,
                    cursor: ui ? "pointer" : undefined,
                    outline: ui && ui.selected === k ? "0.25mm solid #2563eb" : undefined,
                    outlineOffset: "0.2mm",
                }}
            >
                {node}
            </div>
        );
    });

    const justifyContent = s.vAlign === "top" ? "flex-start" : s.vAlign === "middle" ? "center" : s.vAlign === "bottom" ? "flex-end" : "space-between";

    return (
        <div
            style={{
                width: `${s.widthMm}mm`,
                height: `${s.heightMm}mm`,
                position: "relative",
                overflow: "hidden",
                background: "#fff",
                flexShrink: 0,
                boxSizing: "border-box",
                boxShadow: ui?.edges ? "inset 0 0 0 0.15mm #cbd5e1" : undefined,
            }}
        >
            <div
                style={{
                    position: "absolute",
                    left: "50%",
                    top: "50%",
                    width: `${innerW}mm`,
                    height: `${innerH}mm`,
                    transform: `translate(-50%, -50%) rotate(${s.rotation}deg)`,
                    padding: `${s.paddingMm}mm`,
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent,
                    gap: `${s.rowGapMm}mm`,
                    color: "#000",
                    fontFamily: FONT_STACKS[s.fontFamily],
                    lineHeight: 1.15,
                    overflow: "hidden",
                    border: s.borderStyle === "none" ? undefined : `${s.borderWidthMm}mm ${s.borderStyle} #000`,
                    borderRadius: s.radiusMm ? `${s.radiusMm}mm` : undefined,
                }}
            >
                {items}
                {ui?.guides && (
                    <div style={{ position: "absolute", inset: `${s.paddingMm}mm`, border: "0.1mm dashed #3b82f6", pointerEvents: "none" }} />
                )}
            </div>
        </div>
    );
}

/* ─── Ribbon building blocks ────────────────────────────────────────────── */

function RibbonGroup({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
    return (
        <div className={cn("flex flex-col px-3 py-1.5", className)}>
            <div className="flex flex-1 items-center justify-center gap-3">{children}</div>
            <div className="mt-1 border-t border-border/70 pt-0.5 text-center text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {label}
            </div>
        </div>
    );
}

function RibbonBigButton({ icon, label, onClick, disabled, primary, active }: {
    icon: ReactNode; label: ReactNode; onClick?: () => void; disabled?: boolean; primary?: boolean; active?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "flex min-h-[56px] min-w-[62px] flex-col items-center justify-center gap-1 rounded-lg px-3 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-45",
                primary ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90" : "text-foreground hover:bg-accent",
                active && !primary && "bg-accent",
            )}
        >
            {icon}
            <span className="flex items-center gap-0.5 whitespace-nowrap">{label}</span>
        </button>
    );
}

function RibbonSmallButton({ icon, label, onClick, disabled, active, title }: {
    icon: ReactNode; label?: ReactNode; onClick?: () => void; disabled?: boolean; active?: boolean; title?: string;
}) {
    return (
        <button
            type="button"
            title={title}
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40",
                active && "bg-accent shadow-inner",
            )}
        >
            {icon}
            {label}
        </button>
    );
}

function IconToggle({ pressed, onClick, title, children }: { pressed: boolean; onClick: () => void; title: string; children: ReactNode }) {
    return (
        <button
            type="button"
            title={title}
            aria-pressed={pressed}
            onClick={onClick}
            className={cn(
                "flex h-7 min-w-7 items-center justify-center rounded-md border border-transparent px-1.5 text-xs transition-colors hover:bg-accent",
                pressed && "border-border bg-accent shadow-inner",
            )}
        >
            {children}
        </button>
    );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
    return (
        <div className={cn("flex flex-col gap-1", className)}>
            <span className="text-[10px] font-medium uppercase leading-none tracking-wide text-muted-foreground">{label}</span>
            {children}
        </div>
    );
}

function MiniNum({ label, value, onChange, min, max, step = 1, width = "w-[60px]" }: {
    label: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number; width?: string;
}) {
    return (
        <Field label={label}>
            <Input
                type="number"
                value={value}
                min={min}
                max={max}
                step={step}
                onFocus={(e) => e.target.select()}
                onChange={(e) => {
                    const n = Number(e.target.value);
                    if (e.target.value !== "" && Number.isFinite(n)) onChange(clamp(n, min, max));
                }}
                className={cn("h-7 px-1.5 text-center text-xs shadow-none", width)}
            />
        </Field>
    );
}

function RibbonSwitch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-xs">
            <Switch checked={checked} onCheckedChange={onChange} className="scale-90" />
            {label}
        </label>
    );
}

function RibbonSelect({ value, onChange, options, className }: {
    value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string;
}) {
    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className={cn("h-7 text-xs shadow-none", className)}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {options.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

function Seg<T extends string>({ value, onChange, options, className }: {
    value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; title?: string; disabled?: boolean }[]; className?: string;
}) {
    return (
        <ToggleGroup type="single" value={value} onValueChange={(v) => v && onChange(v as T)} className={cn("gap-0.5", className)}>
            {options.map((o) => (
                <ToggleGroupItem key={o.value} value={o.value} title={o.title} disabled={o.disabled} className="h-7 px-2 text-xs">
                    {o.label}
                </ToggleGroupItem>
            ))}
        </ToggleGroup>
    );
}

function StockRow({ active, copies, onToggle, onCopies, title, variant, sub, extra }: {
    active: boolean; copies: number | undefined; onToggle: (v: boolean) => void; onCopies: (n: number) => void;
    title: string; variant: string | null; sub: string; extra?: ReactNode;
}) {
    return (
        <div className={cn("flex items-start gap-2.5 rounded-lg px-2 py-[7px] transition-colors", active ? "bg-accent/60" : "hover:bg-accent/40")}>
            <Checkbox className="mt-0.5" checked={active} onCheckedChange={(v) => onToggle(v === true)} />
            <div className="min-w-0 flex-1">
                <div className="break-words text-[13px] font-medium leading-snug">
                    {title}
                    {variant && <span className="font-normal text-muted-foreground"> — {variant}</span>}
                </div>
                <div className="truncate text-[11px] leading-snug text-muted-foreground">{sub}</div>
            </div>
            {active && (
                <>
                    {extra}
                    <Input
                        type="number" min={1} max={9999}
                        className="h-7 w-14 shrink-0 px-1.5 text-center text-xs shadow-none"
                        value={copies ?? 1}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => onCopies(Math.max(1, Number(e.target.value) || 1))}
                    />
                </>
            )}
        </div>
    );
}

const RIBBON_TABS: { id: RibbonTab; label: string }[] = [
    { id: "home", label: "Home" },
    { id: "layout", label: "Layout" },
    { id: "text", label: "Text & Price" },
    { id: "barcode", label: "Barcode" },
    { id: "print", label: "Print Setup" },
    { id: "view", label: "View" },
];

/* ═══════════════════════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════════════════════ */

export default function InventoryLabels({ store, units, batches }: Props) {
    /* ── settings with undo / redo ── */
    const [s, setSInternal] = useState<LabelSettings>(loadSettings);
    const sRef = useRef(s);
    const pastRef = useRef<LabelSettings[]>([]);
    const futureRef = useRef<LabelSettings[]>([]);
    const lastPushRef = useRef(0);

    const commit = useCallback((next: LabelSettings) => {
        const prev = sRef.current;
        if (next === prev) return;
        const now = Date.now();
        if (now - lastPushRef.current > 700) {
            pastRef.current.push(prev);
            if (pastRef.current.length > 100) pastRef.current.shift();
        }
        lastPushRef.current = now;
        futureRef.current = [];
        sRef.current = next;
        setSInternal(next);
    }, []);

    const update = useCallback((fn: (p: LabelSettings) => LabelSettings) => commit(fn(sRef.current)), [commit]);
    const set = useCallback(
        <K extends keyof LabelSettings>(key: K, value: LabelSettings[K]) => update((p) => ({ ...p, [key]: value })),
        [update],
    );

    const undo = useCallback(() => {
        const prev = pastRef.current.pop();
        if (!prev) return;
        futureRef.current.push(sRef.current);
        sRef.current = prev;
        lastPushRef.current = 0;
        setSInternal(prev);
    }, []);
    const redo = useCallback(() => {
        const next = futureRef.current.pop();
        if (!next) return;
        pastRef.current.push(sRef.current);
        sRef.current = next;
        lastPushRef.current = 0;
        setSInternal(next);
    }, []);
    const canUndo = pastRef.current.length > 0;
    const canRedo = futureRef.current.length > 0;

    const setStyle = (k: StyleKey, patch: Partial<ElementStyle>) =>
        update((p) => ({ ...p, elementStyles: { ...p.elementStyles, [k]: { ...p.elementStyles[k], ...patch } } }));
    const setVisible = (k: ElementKey, v: boolean) => update((p) => ({ ...p, visible: { ...p.visible, [k]: v } }));
    const setTemplate = (k: TextKey, v: string) => update((p) => ({ ...p, templates: { ...p.templates, [k]: v } }));
    const moveEl = (k: ElementKey, dir: -1 | 1) =>
        update((p) => {
            const i = p.order.indexOf(k);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= p.order.length) return p;
            const order = [...p.order];
            [order[i], order[j]] = [order[j], order[i]];
            return { ...p, order };
        });

    /* ── view state, templates, manual labels ── */
    const [v, setV] = useState<ViewState>(() => ({ ...DEFAULT_VIEW, ...loadJson<Partial<ViewState>>(KEY_VIEW, {}) }));
    const patchView = useCallback((p: Partial<ViewState>) => setV((prev) => ({ ...prev, ...p })), []);
    const [userTpls, setUserTpls] = useState<UserTemplate[]>(() => loadJson<UserTemplate[]>(KEY_TEMPLATES, []));
    const [manual, setManual] = useState<ManualLabel[]>(() => loadJson<ManualLabel[]>(KEY_MANUAL, []));
    const [tplName, setTplName] = useState("");
    const [notice, setNotice] = useState<string | null>(null);

    const flash = useCallback((msg: string) => {
        setNotice(msg);
        window.setTimeout(() => setNotice((cur) => (cur === msg ? null : cur)), 3200);
    }, []);

    useEffect(() => {
        try {
            window.localStorage.setItem(KEY_SETTINGS, JSON.stringify(s));
            window.localStorage.removeItem(KEY_V2);
            window.localStorage.removeItem(KEY_V1);
        } catch { /* storage blocked */ }
    }, [s]);
    useEffect(() => {
        try { window.localStorage.setItem(KEY_VIEW, JSON.stringify(v)); } catch { /* ignore */ }
    }, [v]);
    useEffect(() => {
        try { window.localStorage.setItem(KEY_TEMPLATES, JSON.stringify(userTpls)); } catch { /* ignore */ }
    }, [userTpls]);
    useEffect(() => {
        try { window.localStorage.setItem(KEY_MANUAL, JSON.stringify(manual)); } catch { /* ignore */ }
    }, [manual]);

    /* ── selection state ── */
    const [sel, setSel] = useState<ElementKey>("name");
    const fontKey: StyleKey = sel === "divider" ? "name" : sel;
    const fontDisabled = sel === "divider";
    const activeStyle = s.elementStyles[fontKey];

    const [dataTab, setDataTab] = useState<DataTab>("units");
    const [search, setSearch] = useState("");
    const [condFilter, setCondFilter] = useState("all");
    const [selectedOnly, setSelectedOnly] = useState(false);
    const [bulkCopies, setBulkCopies] = useState(1);
    const [unitSel, setUnitSel] = useState<Record<number, number>>(() => Object.fromEntries(units.map((u) => [u.id, 1])));
    const [batchSel, setBatchSel] = useState<Record<number, number>>(() => Object.fromEntries(batches.map((b) => [b.id, 1])));
    const [mForm, setMForm] = useState({ title: "", sub: "", barcode: "", price: "", copies: 1 });
    const [editId, setEditId] = useState<number | null>(null);

    const [mounted, setMounted] = useState(false);
    const [printing, setPrinting] = useState(false);
    useEffect(() => setMounted(true), []);

    /* ── job building ── */
    const priceOf = (r: { retail_price: number | null; mrp: number | null; wholesale_price: number | null }): number | null =>
        s.priceSource === "mrp" ? r.mrp : s.priceSource === "wholesale" ? r.wholesale_price : r.retail_price;

    const items = useMemo<QueueItem[]>(() => {
        const barcodeOfUnit = (u: LabelUnit): string => {
            switch (s.barcodeSource) {
                case "barcode": return u.barcode ?? "";
                case "sku": return u.sku ?? "";
                case "imei": return u.imei1 ?? u.serial_number ?? "";
                case "batch": return "";
                default: return u.barcode ?? u.sku ?? u.imei1 ?? u.serial_number ?? "";
            }
        };
        const barcodeOfBatch = (b: LabelBatch): string => {
            switch (s.barcodeSource) {
                case "barcode": return b.barcode ?? "";
                case "sku": return b.sku ?? "";
                case "batch": return b.batch_number ?? "";
                case "imei": return "";
                default: return b.barcode ?? b.sku ?? b.batch_number ?? "";
            }
        };
        const out: QueueItem[] = [];
        for (const u of units) {
            const copies = unitSel[u.id];
            if (!copies) continue;
            out.push({
                copies,
                data: {
                    key: `u${u.id}`, name: u.product_name, variant: u.variant_name, sku: u.sku, imei: u.imei1,
                    serial: u.serial_number, batch: null, condition: u.condition, warranty: u.warranty,
                    barcodeValue: barcodeOfUnit(u), price: priceOf(u), priceText: null, mrp: u.mrp,
                    wholesale: u.wholesale_price, qty: null,
                },
            });
        }
        for (const b of batches) {
            const copies = batchSel[b.id];
            if (!copies) continue;
            out.push({
                copies,
                data: {
                    key: `b${b.id}`, name: b.product_name, variant: b.variant_name, sku: b.sku, imei: null,
                    serial: null, batch: b.batch_number, condition: null, warranty: b.warranty,
                    barcodeValue: barcodeOfBatch(b), price: priceOf(b), priceText: null, mrp: b.mrp,
                    wholesale: b.wholesale_price, qty: b.qty,
                },
            });
        }
        for (const m of manual) {
            out.push({
                copies: Math.max(1, m.copies),
                data: {
                    key: `m${m.id}`, name: m.title, variant: m.sub || null, sku: null, imei: null, serial: null,
                    batch: null, condition: null, warranty: null, barcodeValue: m.barcode, price: null,
                    priceText: m.price || null, mrp: null, wholesale: null, qty: null,
                },
            });
        }
        if (s.sort === "name") {
            out.sort((a, b) => a.data.name.localeCompare(b.data.name) || (a.data.variant ?? "").localeCompare(b.data.variant ?? ""));
        } else if (s.sort === "price") {
            out.sort((a, b) => (a.data.price ?? 0) - (b.data.price ?? 0));
        } else if (s.sort === "reverse") {
            out.reverse();
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [units, batches, unitSel, batchSel, manual, s.barcodeSource, s.priceSource, s.sort]);

    const labels = useMemo<LabelData[]>(() => {
        const mult = Math.max(1, s.copyMultiplier);
        const flat: LabelData[] = [];
        if (!s.collate) {
            for (const it of items) for (let i = 0; i < it.copies * mult; i++) flat.push(it.data);
        } else {
            const max = items.reduce((m, it) => Math.max(m, it.copies), 0);
            for (let m = 0; m < mult; m++) for (let p = 0; p < max; p++) for (const it of items) if (it.copies > p) flat.push(it.data);
        }
        return flat;
    }, [items, s.copyMultiplier, s.collate]);

    const totalLabels = labels.length;
    const sheetWidthMm = s.columns * s.widthMm + (s.columns - 1) * s.gapMm + s.edgeMarginMm * 2;

    const rows = useMemo<(LabelData | null)[][]>(() => {
        if (labels.length === 0) return [];
        const cells: (LabelData | null)[] = [...Array<null>(s.skip).fill(null), ...labels];
        const out: (LabelData | null)[][] = [];
        for (let i = 0; i < cells.length; i += s.columns) out.push(cells.slice(i, i + s.columns));
        return out;
    }, [labels, s.skip, s.columns]);

    const sample: LabelData = {
        key: "sample", name: "Sample Product — 5G Smartphone", variant: "8 GB · 128 GB · Black", sku: "SKU-100245",
        imei: "356789104512390", serial: null, batch: "B-2026-014", condition: "New", warranty: "6 months",
        barcodeValue: "8901234567890", price: 18999, priceText: null, mrp: 21999, wholesale: 17400, qty: 12,
    };
    const dateText = useMemo(() => fmtDate(s.dateFormat), [s.dateFormat]);

    /* ── barcode health ── */
    const [barcodeIssues, setBarcodeIssues] = useState(0);
    useEffect(() => {
        if (!s.visible.barcode) { setBarcodeIssues(0); return; }
        const seen = new Map<string, boolean>();
        let n = 0;
        for (const it of items) {
            const val = it.data.barcodeValue;
            if (!seen.has(val)) seen.set(val, barcodeValid(val, s.barcodeFormat));
            if (!seen.get(val)) n += it.copies;
        }
        setBarcodeIssues(n);
    }, [items, s.barcodeFormat, s.visible.barcode]);

    const swap = s.rotation === 90 || s.rotation === 270;
    const contentW = (swap ? s.heightMm : s.widthMm) - s.paddingMm * 2;
    const probe = labels[0]?.barcodeValue || sample.barcodeValue;
    const moduleMm = moduleWidthPx(probe, s.barcodeFormat, contentW, s.barcodeScale) / MM_PX;

    /* ── data panel derived state ── */
    const q = search.trim().toLowerCase();
    const match = (...fields: (string | null)[]) => !q || fields.some((f) => f && f.toLowerCase().includes(q));
    const conditions = useMemo(() => Array.from(new Set(units.map((u) => u.condition).filter((c): c is string => !!c))), [units]);
    const shownUnits = units.filter(
        (u) =>
            match(u.product_name, u.variant_name, u.sku, u.imei1, u.imei2, u.serial_number, u.barcode) &&
            (condFilter === "all" || u.condition === condFilter) &&
            (!selectedOnly || unitSel[u.id] !== undefined),
    );
    const shownBatches = batches.filter(
        (b) => match(b.product_name, b.variant_name, b.sku, b.batch_number, b.barcode) && (!selectedOnly || batchSel[b.id] !== undefined),
    );
    const unitLabelCount = useMemo(() => units.reduce((n, u) => n + (unitSel[u.id] ?? 0), 0), [units, unitSel]);
    const batchLabelCount = useMemo(() => batches.reduce((n, b) => n + (batchSel[b.id] ?? 0), 0), [batches, batchSel]);
    const manualLabelCount = useMemo(() => manual.reduce((n, m) => n + Math.max(1, m.copies), 0), [manual]);
    const selectedUnits = Object.keys(unitSel).length;
    const selectedBatches = Object.keys(batchSel).length;

    /* ── templates ── */
    const applyBuiltin = (patch: Partial<LabelSettings>, name: string) => {
        commit(normalize({ ...DEFAULT_SETTINGS, ...patch }));
        flash(`Applied template “${name}”`);
    };
    const saveTemplate = () => {
        const name = tplName.trim();
        if (!name) return;
        setUserTpls((list) => [...list.filter((t) => t.name !== name), { id: Date.now(), name, settings: sRef.current }]);
        setTplName("");
        flash(`Saved template “${name}”`);
    };
    const fileRef = useRef<HTMLInputElement>(null);
    const exportSetup = () => {
        const blob = new Blob([JSON.stringify({ app: "label-studio", version: 3, settings: sRef.current }, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `label-setup-${store.code || "store"}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };
    const importSetup = async (file: File | undefined) => {
        if (!file) return;
        try {
            const obj = JSON.parse(await file.text());
            commit(normalize(obj.settings ?? obj));
            flash("Setup imported");
        } catch {
            flash("That file is not a valid label setup");
        }
        if (fileRef.current) fileRef.current.value = "";
    };
    const resetAll = () => {
        commit(DEFAULT_SETTINGS);
        flash("Setup reset to defaults");
    };

    /* ── manual labels ── */
    const submitManual = () => {
        if (!mForm.title.trim()) return;
        const rec = {
            title: mForm.title.trim(), sub: mForm.sub.trim(), barcode: mForm.barcode.trim(),
            price: mForm.price.trim(), copies: mForm.copies,
        };
        if (editId !== null) setManual((l) => l.map((m) => (m.id === editId ? { ...m, ...rec } : m)));
        else setManual((l) => [...l, { id: Date.now(), ...rec }]);
        setEditId(null);
        setMForm({ title: "", sub: "", barcode: "", price: "", copies: 1 });
    };

    /* ── printing: the print sheet only exists while printing ── */
    const doPrint = useCallback(() => window.print(), []);
    useEffect(() => {
        const before = () => flushSync(() => setPrinting(true));
        const after = () => setPrinting(false);
        window.addEventListener("beforeprint", before);
        window.addEventListener("afterprint", after);
        return () => {
            window.removeEventListener("beforeprint", before);
            window.removeEventListener("afterprint", after);
        };
    }, []);

    /* ── zoom, wheel & keyboard ── */
    const scrollRef = useRef<HTMLDivElement>(null);
    const setZoom = useCallback((z: number) => patchView({ zoom: Math.round(clamp(z, 0.25, 6) * 100) / 100 }), [patchView]);
    const fitWidth = () => {
        const el = scrollRef.current;
        if (!el) return;
        setZoom((el.clientWidth - 72) / (sheetWidthMm * MM_PX));
    };

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            setV((prev) => ({ ...prev, zoom: Math.round(clamp(prev.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.25, 6) * 100) / 100 }));
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            const t = e.target as HTMLElement | null;
            const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
            const key = e.key.toLowerCase();
            if (key === "p") {
                e.preventDefault();
                if (totalLabels > 0) doPrint();
            } else if (key === "z" && !typing) {
                e.preventDefault();
                if (e.shiftKey) redo(); else undo();
            } else if (key === "y" && !typing) {
                e.preventDefault();
                redo();
            } else if (key === "0") {
                e.preventDefault();
                setV((prev) => ({ ...prev, zoom: 1 }));
            } else if (key === "=" || key === "+") {
                e.preventDefault();
                setV((prev) => ({ ...prev, zoom: Math.round(clamp(prev.zoom * 1.15, 0.25, 6) * 100) / 100 }));
            } else if (key === "-") {
                e.preventDefault();
                setV((prev) => ({ ...prev, zoom: Math.round(clamp(prev.zoom / 1.15, 0.25, 6) * 100) / 100 }));
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [totalLabels, doPrint, undo, redo]);

    /* ── sheet rendering ── */
    const rowStyle: CSSProperties = {
        display: "flex",
        gap: `${s.gapMm}mm`,
        padding: `0 ${s.edgeMarginMm}mm`,
        height: `${s.heightMm}mm`,
        boxSizing: "border-box",
        position: "relative",
        left: `${s.offsetXmm}mm`,
        top: `${s.offsetYmm}mm`,
    };
    const ui: FaceUi = { selected: sel, onSelect: setSel, edges: v.edges, guides: v.guides };

    const renderCells = (row: (LabelData | null)[], ri: number, interactive: boolean) =>
        row.map((cell, ci) =>
            cell ? (
                <LabelFace key={`${cell.key}-${ri}-${ci}`} data={cell} s={s} storeName={store.name} dateText={dateText} ui={interactive ? ui : undefined} />
            ) : (
                <div
                    key={`blank-${ri}-${ci}`}
                    style={{ width: `${s.widthMm}mm`, height: `${s.heightMm}mm`, background: "#fff", flexShrink: 0, boxShadow: interactive && v.edges ? "inset 0 0 0 0.15mm #e2e8f0" : undefined }}
                />
            ),
        );

    const screenRows: (LabelData | null)[][] = rows.length > 0 ? rows.slice(0, MAX_SCREEN_ROWS) : [Array.from({ length: s.columns }, () => sample)];
    const truncated = rows.length > MAX_SCREEN_ROWS;

    const printCss = `
        @page { size: ${sheetWidthMm}mm ${s.heightMm}mm; margin: 0; }
        #label-print-root { display: none; }
        @media print {
            html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
            body > #app { display: none !important; }
            #label-print-root { display: block !important; }
            #label-print-root, #label-print-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .label-p-row { page-break-after: always; break-after: page; break-inside: avoid; }
            .label-p-row:last-child { page-break-after: auto; break-after: auto; }
        }
    `;

    /* ── ruler ── */
    const rulerWidthPx = sheetWidthMm * MM_PX * v.zoom;
    const rulerTicks = useMemo(() => Array.from({ length: Math.min(Math.floor(sheetWidthMm), 500) + 1 }, (_, mm) => mm), [sheetWidthMm]);
    const colEdges = useMemo(() => {
        const out: number[] = [];
        for (let c = 0; c < s.columns; c++) {
            const left = s.edgeMarginMm + c * (s.widthMm + s.gapMm);
            out.push(left, left + s.widthMm);
        }
        return out;
    }, [s.columns, s.edgeMarginMm, s.widthMm, s.gapMm]);

    /* ── layer list ── */
    const layerRows = useMemo<ElementKey[]>(() => s.order.flatMap((k) => (k === "price" ? (["price", "mrp"] as ElementKey[]) : [k])), [s.order]);

    /* ═══ Ribbon groups ═══ */

    const gPrint = (
        <RibbonGroup label="Print">
            <RibbonBigButton
                primary
                icon={<Printer className="size-6" />}
                label={totalLabels > 0 ? `Print (${totalLabels})` : "Print"}
                onClick={doPrint}
                disabled={totalLabels === 0}
            />
        </RibbonGroup>
    );

    const gHistory = (
        <RibbonGroup label="History">
            <div className="flex flex-col">
                <RibbonSmallButton icon={<Undo2 className="size-4" />} label="Undo" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" />
                <RibbonSmallButton icon={<Redo2 className="size-4" />} label="Redo" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" />
            </div>
        </RibbonGroup>
    );

    const gTemplates = (
        <RibbonGroup label="Templates">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <span className="inline-flex">
                        <RibbonBigButton icon={<FolderOpen className="size-6" />} label={<>Templates <ChevronDown className="size-3.5" /></>} />
                    </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72">
                    <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">Built-in</DropdownMenuLabel>
                    {BUILTIN_TEMPLATES.map((t) => (
                        <DropdownMenuItem key={t.id} className="text-xs" onSelect={() => applyBuiltin(t.patch, t.name)}>{t.name}</DropdownMenuItem>
                    ))}
                    {userTpls.length > 0 && (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">My templates</DropdownMenuLabel>
                            {userTpls.map((t) => (
                                <DropdownMenuItem
                                    key={t.id}
                                    className="justify-between text-xs"
                                    onSelect={() => { commit(normalize(t.settings)); flash(`Loaded “${t.name}”`); }}
                                >
                                    <span className="truncate">{t.name}</span>
                                    <button
                                        type="button"
                                        title="Delete template"
                                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setUserTpls((l) => l.filter((x) => x.id !== t.id)); }}
                                    >
                                        <Trash2 className="size-3.5" />
                                    </button>
                                </DropdownMenuItem>
                            ))}
                        </>
                    )}
                    <DropdownMenuSeparator />
                    <div className="flex items-center gap-1.5 p-2" onPointerDown={(e) => e.stopPropagation()}>
                        <Input
                            className="h-8 text-xs shadow-none"
                            placeholder="Save current setup as…"
                            value={tplName}
                            onChange={(e) => setTplName(e.target.value)}
                            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") saveTemplate(); }}
                        />
                        <Button size="sm" className="h-8 px-2.5 text-xs" disabled={!tplName.trim()} onClick={saveTemplate}>
                            <Save className="mr-1 size-3.5" /> Save
                        </Button>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-xs" onSelect={exportSetup}><Download className="mr-2 size-3.5" /> Export setup (.json)</DropdownMenuItem>
                    <DropdownMenuItem className="text-xs" onSelect={() => fileRef.current?.click()}><Upload className="mr-2 size-3.5" /> Import setup…</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </RibbonGroup>
    );

    const gSize = (
        <RibbonGroup label="Label Size">
            <div className="flex flex-col gap-1.5">
                <ToggleGroup
                    type="single"
                    value={s.presetId}
                    onValueChange={(val) => {
                        if (!val) return;
                        const p = PRESETS.find((x) => x.id === val);
                        if (p) update((prev) => ({ ...prev, presetId: p.id, widthMm: p.w, heightMm: p.h }));
                        else set("presetId", "custom");
                    }}
                    className="flex-wrap gap-0.5"
                >
                    {PRESETS.map((p) => (
                        <ToggleGroupItem key={p.id} value={p.id} className="h-6 px-2 text-[11px]">{p.name}</ToggleGroupItem>
                    ))}
                    <ToggleGroupItem value="custom" className="h-6 px-2 text-[11px]">Custom</ToggleGroupItem>
                </ToggleGroup>
                <div className="flex gap-2">
                    <MiniNum label="Width mm" value={s.widthMm} min={15} max={200} step={0.5} onChange={(n) => update((p) => ({ ...p, widthMm: n, presetId: "custom" }))} />
                    <MiniNum label="Height mm" value={s.heightMm} min={10} max={300} step={0.5} onChange={(n) => update((p) => ({ ...p, heightMm: n, presetId: "custom" }))} />
                </div>
            </div>
        </RibbonGroup>
    );

    const gColumns = (
        <RibbonGroup label="Columns">
            <div className="flex flex-col gap-1.5">
                <Seg
                    value={String(s.columns)}
                    onChange={(val) => set("columns", Number(val) as LabelSettings["columns"])}
                    options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: `${n} UP` }))}
                />
                <div className="flex gap-2">
                    <MiniNum label="Gap" value={s.gapMm} min={0} max={30} step={0.5} width="w-[52px]" onChange={(n) => set("gapMm", n)} />
                    <MiniNum label="Edge" value={s.edgeMarginMm} min={0} max={30} step={0.5} width="w-[52px]" onChange={(n) => set("edgeMarginMm", n)} />
                    <MiniNum label="Skip" value={s.skip} min={0} max={99} width="w-[52px]" onChange={(n) => set("skip", Math.round(n))} />
                </div>
            </div>
        </RibbonGroup>
    );

    const gFont = (
        <RibbonGroup label="Font" className={fontDisabled ? "pointer-events-none opacity-50" : undefined}>
            <div className="flex flex-col gap-1.5">
                <div className="flex items-end gap-2">
                    <Field label="Element">
                        <RibbonSelect
                            className="w-[168px]"
                            value={fontKey}
                            onChange={(val) => setSel(val as ElementKey)}
                            options={ELEMENTS.filter((e) => e.key !== "divider").map((e) => ({ value: e.key, label: e.label }))}
                        />
                    </Field>
                    <MiniNum label="Size pt" value={activeStyle.sizePt} min={4} max={60} step={0.5} width="w-[54px]" onChange={(n) => setStyle(fontKey, { sizePt: n })} />
                </div>
                <div className="flex items-center gap-0.5">
                    <IconToggle title="Bold" pressed={activeStyle.weight >= 700} onClick={() => setStyle(fontKey, { weight: activeStyle.weight >= 700 ? 400 : 700 })}><Bold className="size-3.5" /></IconToggle>
                    <IconToggle title="Italic" pressed={activeStyle.italic} onClick={() => setStyle(fontKey, { italic: !activeStyle.italic })}><Italic className="size-3.5" /></IconToggle>
                    <IconToggle title="Underline" pressed={activeStyle.underline} onClick={() => setStyle(fontKey, { underline: !activeStyle.underline })}><Underline className="size-3.5" /></IconToggle>
                    <IconToggle title="Strikethrough" pressed={activeStyle.strike} onClick={() => setStyle(fontKey, { strike: !activeStyle.strike })}><Strikethrough className="size-3.5" /></IconToggle>
                    <Separator orientation="vertical" className="mx-1 h-5" />
                    <Seg
                        value={activeStyle.align}
                        onChange={(val) => setStyle(fontKey, { align: val })}
                        options={[
                            { value: "inherit", label: "Auto", title: "Follow label alignment" },
                            { value: "left", label: <AlignLeft className="size-3.5" /> },
                            { value: "center", label: <AlignCenter className="size-3.5" /> },
                            { value: "right", label: <AlignRight className="size-3.5" /> },
                        ]}
                    />
                </div>
            </div>
        </RibbonGroup>
    );

    const gElementsMenu = (
        <RibbonGroup label="Elements">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <span className="inline-flex">
                        <RibbonBigButton icon={<ListChecks className="size-6" />} label={<>Elements <ChevronDown className="size-3.5" /></>} />
                    </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                    <DropdownMenuLabel className="text-xs">What prints on the label</DropdownMenuLabel>
                    <ScrollArea className="max-h-[44vh]">
                        <div className="p-1">
                            {ELEMENTS.map((e) => (
                                <DropdownMenuCheckboxItem
                                    key={e.key}
                                    checked={s.visible[e.key]}
                                    onCheckedChange={(c) => setVisible(e.key, c === true)}
                                    onSelect={(ev) => ev.preventDefault()}
                                    className="text-xs"
                                >
                                    {e.label}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </div>
                    </ScrollArea>
                </DropdownMenuContent>
            </DropdownMenu>
        </RibbonGroup>
    );

    const ribbonBody = (() => {
        switch (v.tab) {
            case "home":
                return (
                    <>
                        {gPrint}{gHistory}{gTemplates}{gSize}{gColumns}{gElementsMenu}{gFont}
                    </>
                );
            case "layout":
                return (
                    <>
                        {gSize}
                        <RibbonGroup label="Orientation">
                            <div className="flex flex-col gap-1.5">
                                <Field label="Rotate content">
                                    <Seg
                                        value={String(s.rotation)}
                                        onChange={(val) => set("rotation", Number(val) as Rotation)}
                                        options={[0, 90, 180, 270].map((d) => ({ value: String(d), label: `${d}°` }))}
                                    />
                                </Field>
                                <Field label="Vertical">
                                    <Seg
                                        value={s.vAlign}
                                        onChange={(val) => set("vAlign", val)}
                                        options={[
                                            { value: "top", label: "Top" },
                                            { value: "middle", label: "Middle" },
                                            { value: "bottom", label: "Bottom" },
                                            { value: "spread", label: "Spread" },
                                        ]}
                                    />
                                </Field>
                            </div>
                        </RibbonGroup>
                        {gColumns}
                        <RibbonGroup label="Spacing">
                            <div className="flex flex-col gap-1.5">
                                <div className="flex gap-2">
                                    <MiniNum label="Padding" value={s.paddingMm} min={0} max={15} step={0.5} width="w-[54px]" onChange={(n) => set("paddingMm", n)} />
                                    <MiniNum label="Line gap" value={s.rowGapMm} min={0} max={5} step={0.1} width="w-[54px]" onChange={(n) => set("rowGapMm", n)} />
                                    <MiniNum label="Divider" value={s.dividerMm} min={0.1} max={2} step={0.1} width="w-[54px]" onChange={(n) => set("dividerMm", n)} />
                                </div>
                                <Field label="Default alignment">
                                    <Seg
                                        value={s.align}
                                        onChange={(val) => set("align", val)}
                                        options={[
                                            { value: "left", label: <AlignLeft className="size-3.5" /> },
                                            { value: "center", label: <AlignCenter className="size-3.5" /> },
                                            { value: "right", label: <AlignRight className="size-3.5" /> },
                                        ]}
                                    />
                                </Field>
                            </div>
                        </RibbonGroup>
                        <RibbonGroup label="Border">
                            <div className="flex flex-col gap-1.5">
                                <Seg
                                    value={s.borderStyle}
                                    onChange={(val) => set("borderStyle", val)}
                                    options={[
                                        { value: "none", label: "None" },
                                        { value: "solid", label: "Solid" },
                                        { value: "dashed", label: "Dash" },
                                        { value: "dotted", label: "Dot" },
                                    ]}
                                />
                                <div className="flex gap-2">
                                    <MiniNum label="Width" value={s.borderWidthMm} min={0.1} max={2} step={0.05} width="w-[54px]" onChange={(n) => set("borderWidthMm", n)} />
                                    <MiniNum label="Radius" value={s.radiusMm} min={0} max={10} step={0.5} width="w-[54px]" onChange={(n) => set("radiusMm", n)} />
                                </div>
                            </div>
                        </RibbonGroup>
                    </>
                );
            case "text":
                return (
                    <>
                        {gElementsMenu}{gFont}
                        <RibbonGroup label="Paragraph" className={fontDisabled ? "pointer-events-none opacity-50" : undefined}>
                            <div className="flex flex-col gap-1.5">
                                <div className="flex items-end gap-2">
                                    <Field label="Letter case">
                                        <RibbonSelect
                                            className="w-[150px]"
                                            value={activeStyle.textCase}
                                            onChange={(val) => setStyle(fontKey, { textCase: val as TextCase })}
                                            options={[
                                                { value: "asis", label: "As typed" },
                                                { value: "upper", label: "UPPERCASE" },
                                                { value: "lower", label: "lowercase" },
                                                { value: "title", label: "Capitalize Each Word" },
                                            ]}
                                        />
                                    </Field>
                                    <MiniNum label="Tracking" value={activeStyle.tracking} min={-5} max={40} width="w-[52px]" onChange={(n) => setStyle(fontKey, { tracking: n })} />
                                </div>
                                <div className="flex items-end gap-2">
                                    <MiniNum label="Line ht" value={activeStyle.lineHeight} min={0.8} max={2} step={0.05} width="w-[52px]" onChange={(n) => setStyle(fontKey, { lineHeight: n })} />
                                    <MiniNum label="Space ↑ mm" value={activeStyle.spaceBeforeMm} min={0} max={10} step={0.2} width="w-[60px]" onChange={(n) => setStyle(fontKey, { spaceBeforeMm: n })} />
                                    <div className="pb-1"><RibbonSwitch label="Reverse" checked={activeStyle.invert} onChange={(c) => setStyle(fontKey, { invert: c })} /></div>
                                </div>
                            </div>
                        </RibbonGroup>
                        <RibbonGroup label="Label Text">
                            <div className="flex flex-col gap-1.5">
                                <div className="flex items-end gap-2">
                                    <Field label="Typeface">
                                        <RibbonSelect
                                            className="w-[130px]"
                                            value={s.fontFamily}
                                            onChange={(val) => set("fontFamily", val as FontFamily)}
                                            options={[
                                                { value: "arial", label: "Arial" },
                                                { value: "narrow", label: "Narrow" },
                                                { value: "system", label: "System UI" },
                                                { value: "mono", label: "Monospace" },
                                                { value: "serif", label: "Serif" },
                                            ]}
                                        />
                                    </Field>
                                    <Field label="Name lines">
                                        <Seg value={String(s.nameLines)} onChange={(val) => set("nameLines", Number(val) as LabelSettings["nameLines"])} options={[{ value: "1", label: "1" }, { value: "2", label: "2" }, { value: "3", label: "3" }]} />
                                    </Field>
                                </div>
                                <div className="flex items-center gap-3">
                                    <RibbonSwitch label="Name + variant on one line" checked={s.nameVariantSameLine} onChange={(c) => set("nameVariantSameLine", c)} />
                                </div>
                            </div>
                        </RibbonGroup>
                        <RibbonGroup label="Price">
                            <div className="flex flex-col gap-1.5">
                                <div className="flex items-end gap-2">
                                    <Field label="Price from">
                                        <RibbonSelect
                                            className="w-[128px]"
                                            value={s.priceSource}
                                            onChange={(val) => set("priceSource", val as PriceSource)}
                                            options={[
                                                { value: "retail", label: "Retail / selling" },
                                                { value: "mrp", label: "MRP" },
                                                { value: "wholesale", label: "Wholesale" },
                                            ]}
                                        />
                                    </Field>
                                    <Field label="Decimals">
                                        <RibbonSelect
                                            className="w-[84px]"
                                            value={s.decimals}
                                            onChange={(val) => set("decimals", val as Decimals)}
                                            options={[{ value: "auto", label: "Auto" }, { value: "0", label: "None" }, { value: "2", label: "Always 2" }]}
                                        />
                                    </Field>
                                </div>
                                <div className="flex items-center gap-3">
                                    <RibbonSwitch label="MRP strike" checked={s.visible.mrp} onChange={(c) => setVisible("mrp", c)} />
                                    <Seg value={s.mrpPosition} onChange={(val) => set("mrpPosition", val)} options={[{ value: "inline", label: "Beside" }, { value: "above", label: "Above" }]} />
                                </div>
                            </div>
                        </RibbonGroup>
                        <RibbonGroup label="Date">
                            <Field label="Print date format">
                                <RibbonSelect
                                    className="w-[132px]"
                                    value={s.dateFormat}
                                    onChange={(val) => set("dateFormat", val as DateFormat)}
                                    options={[
                                        { value: "dmy", label: "26/10/2026" },
                                        { value: "dmony", label: "26-Oct-26" },
                                        { value: "my", label: "Oct 2026" },
                                    ]}
                                />
                            </Field>
                        </RibbonGroup>
                    </>
                );
            case "barcode":
                return (
                    <>
                        <RibbonGroup label="Symbology">
                            <div className="flex flex-col gap-1.5">
                                <Field label="Format">
                                    <RibbonSelect
                                        className="w-[210px]"
                                        value={s.barcodeFormat}
                                        onChange={(val) => set("barcodeFormat", val as BarcodeFormat)}
                                        options={[
                                            { value: "CODE128", label: "Code 128 (any text)" },
                                            { value: "CODE39", label: "Code 39" },
                                            { value: "EAN13", label: "EAN-13 (12–13 digits)" },
                                            { value: "EAN8", label: "EAN-8 (7–8 digits)" },
                                            { value: "UPC", label: "UPC-A (11–12 digits)" },
                                            { value: "ITF", label: "ITF (even digit count)" },
                                        ]}
                                    />
                                </Field>
                                <Field label="Value comes from">
                                    <RibbonSelect
                                        className="w-[210px]"
                                        value={s.barcodeSource}
                                        onChange={(val) => set("barcodeSource", val as BarcodeSource)}
                                        options={[
                                            { value: "auto", label: "Auto (barcode → SKU → IMEI)" },
                                            { value: "barcode", label: "Product barcode" },
                                            { value: "sku", label: "SKU" },
                                            { value: "imei", label: "IMEI / Serial (units)" },
                                            { value: "batch", label: "Batch number (batches)" },
                                        ]}
                                    />
                                </Field>
                            </div>
                        </RibbonGroup>
                        <RibbonGroup label="Size">
                            <div className="flex flex-col gap-1.5">
                                <div className="flex gap-2">
                                    <MiniNum label="Height mm" value={s.barcodeHeightMm} min={3} max={60} step={0.5} width="w-[58px]" onChange={(n) => set("barcodeHeightMm", n)} />
                                    <MiniNum label="Width ×" value={s.barcodeScale} min={0.5} max={1.6} step={0.05} width="w-[58px]" onChange={(n) => set("barcodeScale", n)} />
                                </div>
                                <div className={cn("flex items-center gap-1 text-[11px]", moduleMm < 0.17 ? "text-amber-600" : "text-muted-foreground")}>
                                    {moduleMm < 0.17 && <AlertTriangle className="size-3" />}
                                    Narrow bar ≈ {moduleMm.toFixed(2)} mm{moduleMm < 0.17 ? " — may not scan" : ""}
                                </div>
                            </div>
                        </RibbonGroup>
                        <RibbonGroup label="Human-readable">
                            <div className="flex flex-col gap-1.5">
                                <RibbonSwitch label="Show value text" checked={s.showBarcodeText} onChange={(c) => set("showBarcodeText", c)} />
                                <Seg value={s.barcodeTextPos} onChange={(val) => set("barcodeTextPos", val)} options={[{ value: "below", label: "Below" }, { value: "above", label: "Above" }]} />
                            </div>
                        </RibbonGroup>
                        <RibbonGroup label="Check">
                            <div className="max-w-[210px] text-[11px] leading-snug text-muted-foreground">
                                {barcodeIssues > 0 ? (
                                    <span className="flex items-start gap-1 text-amber-600"><AlertTriangle className="mt-px size-3.5 shrink-0" />{barcodeIssues} queued label{barcodeIssues === 1 ? "" : "s"} have an empty or invalid {s.barcodeFormat} value.</span>
                                ) : (
                                    <span className="flex items-center gap-1 text-emerald-600"><Check className="size-3.5" /> All queued barcodes are valid.</span>
                                )}
                            </div>
                        </RibbonGroup>
                    </>
                );
            case "print":
                return (
                    <>
                        {gPrint}
                        <RibbonGroup label="Copies">
                            <div className="flex flex-col gap-1.5">
                                <div className="flex items-end gap-2">
                                    <MiniNum label="Multiply ×" value={s.copyMultiplier} min={1} max={99} width="w-[58px]" onChange={(n) => set("copyMultiplier", Math.round(n))} />
                                    <div className="pb-1"><RibbonSwitch label="Collate sets" checked={s.collate} onChange={(c) => set("collate", c)} /></div>
                                </div>
                                <Field label="Print order">
                                    <RibbonSelect
                                        className="w-[200px]"
                                        value={s.sort}
                                        onChange={(val) => set("sort", val as SortMode)}
                                        options={[
                                            { value: "queue", label: "As queued (units → batches → manual)" },
                                            { value: "name", label: "Product name A → Z" },
                                            { value: "price", label: "Price low → high" },
                                            { value: "reverse", label: "Reverse queue" },
                                        ]}
                                    />
                                </Field>
                            </div>
                        </RibbonGroup>
                        <RibbonGroup label="Start Position">
                            <div className="flex flex-col gap-1.5">
                                <MiniNum label="Skip labels" value={s.skip} min={0} max={99} width="w-[70px]" onChange={(n) => set("skip", Math.round(n))} />
                                <span className="max-w-[150px] text-[10px] leading-snug text-muted-foreground">Leave used slots blank on a part-printed roll.</span>
                            </div>
                        </RibbonGroup>
                        <RibbonGroup label="Calibration">
                            <div className="flex flex-col gap-1.5">
                                <div className="flex items-end gap-2">
                                    <MiniNum label="Offset X mm" value={s.offsetXmm} min={-10} max={10} step={0.1} width="w-[64px]" onChange={(n) => set("offsetXmm", n)} />
                                    <MiniNum label="Offset Y mm" value={s.offsetYmm} min={-10} max={10} step={0.1} width="w-[64px]" onChange={(n) => set("offsetYmm", n)} />
                                </div>
                                <RibbonSmallButton icon={<RotateCcw className="size-3.5" />} label="Zero offsets" onClick={() => update((p) => ({ ...p, offsetXmm: 0, offsetYmm: 0 }))} />
                            </div>
                        </RibbonGroup>
                        <RibbonGroup label="Printer Dialog">
                            <div className="max-w-[230px] text-[11px] leading-snug text-muted-foreground">
                                Paper size <strong className="text-foreground">{sheetWidthMm} × {s.heightMm} mm</strong> · Margins <strong className="text-foreground">None</strong> · Scale <strong className="text-foreground">100%</strong> · Headers & footers <strong className="text-foreground">off</strong>.
                            </div>
                        </RibbonGroup>
                    </>
                );
            case "view":
                return (
                    <>
                        <RibbonGroup label="Zoom">
                            <div className="flex items-center gap-1.5">
                                <RibbonSmallButton icon={<ZoomOut className="size-4" />} title="Zoom out (Ctrl −)" onClick={() => setZoom(v.zoom / 1.15)} />
                                <Slider value={[v.zoom]} min={0.25} max={6} step={0.05} onValueChange={([z]) => setZoom(z)} className="w-36" />
                                <RibbonSmallButton icon={<ZoomIn className="size-4" />} title="Zoom in (Ctrl +)" onClick={() => setZoom(v.zoom * 1.15)} />
                                <span className="w-11 text-right text-xs font-medium">{Math.round(v.zoom * 100)}%</span>
                                <RibbonSmallButton icon={<Maximize className="size-4" />} label="Fit width" onClick={fitWidth} />
                                <RibbonSmallButton icon={<span className="text-[11px] font-semibold">1:1</span>} title="Reset zoom (Ctrl 0)" onClick={() => setZoom(1)} />
                            </div>
                        </RibbonGroup>
                        <RibbonGroup label="Show">
                            <div className="grid grid-cols-2 gap-x-5 gap-y-2">
                                <RibbonSwitch label="Ruler" checked={v.rulers} onChange={(c) => patchView({ rulers: c })} />
                                <RibbonSwitch label="Label edges" checked={v.edges} onChange={(c) => patchView({ edges: c })} />
                                <RibbonSwitch label="Safe-area guides" checked={v.guides} onChange={(c) => patchView({ guides: c })} />
                                <RibbonSwitch label="Row numbers" checked={v.rowNumbers} onChange={(c) => patchView({ rowNumbers: c })} />
                            </div>
                        </RibbonGroup>
                        <RibbonGroup label="Panels">
                            <div className="flex flex-col gap-1">
                                <RibbonSwitch label="Layers & properties" checked={v.showLayers} onChange={(c) => patchView({ showLayers: c })} />
                                <RibbonSwitch label="Data source" checked={v.showData} onChange={(c) => patchView({ showData: c })} />
                            </div>
                        </RibbonGroup>
                        <RibbonGroup label="Setup">
                            <RibbonBigButton icon={<RotateCcw className="size-6" />} label="Reset setup" onClick={resetAll} />
                        </RibbonGroup>
                    </>
                );
        }
    })();

    /* ═══ Properties panel ═══ */
    const selIsText = sel !== "barcode" && sel !== "divider";
    const selStyle = sel === "divider" ? null : s.elementStyles[sel];

    const propsPanel = (
        <div className="space-y-3 p-3">
            <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Properties</h3>
                <span className="text-xs font-medium">{elLabel(sel)}</span>
            </div>
            <RibbonSwitch label="Print this element" checked={s.visible[sel]} onChange={(c) => setVisible(sel, c)} />

            {selIsText && (
                <div className="space-y-1.5">
                    <Field label="Content (type text or add fields)">
                        <Input
                            className="h-8 text-xs shadow-none"
                            value={s.templates[sel as TextKey]}
                            placeholder={sel === "custom1" || sel === "custom2" ? "e.g. 6 months warranty" : "Text with {fields}"}
                            onChange={(e) => setTemplate(sel as TextKey, e.target.value)}
                        />
                    </Field>
                    <div className="flex flex-wrap gap-1">
                        {TOKEN_LIST.map((t) => (
                            <button
                                key={t}
                                type="button"
                                className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                                onClick={() => setTemplate(sel as TextKey, `${s.templates[sel as TextKey]}{${t}}`)}
                            >
                                {`{${t}}`}
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-1">
                        <button type="button" className="text-[10px] text-muted-foreground underline-offset-2 hover:underline" onClick={() => setTemplate(sel as TextKey, DEFAULT_TEMPLATES[sel as TextKey])}>
                            Restore default text
                        </button>
                    </div>
                    <p className="text-[10px] leading-snug text-muted-foreground">A line is hidden automatically when one of its fields is empty for a product.</p>
                </div>
            )}
            {sel === "barcode" && (
                <p className="text-[11px] leading-snug text-muted-foreground">Barcode format, source and size are in the <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => patchView({ tab: "barcode" })}>Barcode</button> tab.</p>
            )}
            {sel === "divider" && (
                <MiniNum label="Thickness mm" value={s.dividerMm} min={0.1} max={2} step={0.1} width="w-[80px]" onChange={(n) => set("dividerMm", n)} />
            )}

            {selStyle && (
                <>
                    <Separator />
                    <div className="grid grid-cols-2 gap-2">
                        <MiniNum label="Size pt" value={selStyle.sizePt} min={4} max={60} step={0.5} width="w-full" onChange={(n) => setStyle(sel as StyleKey, { sizePt: n })} />
                        <Field label="Weight">
                            <RibbonSelect
                                className="w-full"
                                value={String(selStyle.weight)}
                                onChange={(val) => setStyle(sel as StyleKey, { weight: Number(val) as ElementStyle["weight"] })}
                                options={[
                                    { value: "400", label: "Regular" }, { value: "500", label: "Medium" }, { value: "600", label: "Semibold" },
                                    { value: "700", label: "Bold" }, { value: "800", label: "Extra bold" },
                                ]}
                            />
                        </Field>
                        <MiniNum label="Tracking" value={selStyle.tracking} min={-5} max={40} width="w-full" onChange={(n) => setStyle(sel as StyleKey, { tracking: n })} />
                        <MiniNum label="Line height" value={selStyle.lineHeight} min={0.8} max={2} step={0.05} width="w-full" onChange={(n) => setStyle(sel as StyleKey, { lineHeight: n })} />
                        <MiniNum label="Space above mm" value={selStyle.spaceBeforeMm} min={0} max={10} step={0.2} width="w-full" onChange={(n) => setStyle(sel as StyleKey, { spaceBeforeMm: n })} />
                        <Field label="Case">
                            <RibbonSelect
                                className="w-full"
                                value={selStyle.textCase}
                                onChange={(val) => setStyle(sel as StyleKey, { textCase: val as TextCase })}
                                options={[{ value: "asis", label: "As typed" }, { value: "upper", label: "UPPER" }, { value: "lower", label: "lower" }, { value: "title", label: "Title Case" }]}
                            />
                        </Field>
                    </div>
                    <div className="flex items-center gap-0.5">
                        <IconToggle title="Italic" pressed={selStyle.italic} onClick={() => setStyle(sel as StyleKey, { italic: !selStyle.italic })}><Italic className="size-3.5" /></IconToggle>
                        <IconToggle title="Underline" pressed={selStyle.underline} onClick={() => setStyle(sel as StyleKey, { underline: !selStyle.underline })}><Underline className="size-3.5" /></IconToggle>
                        <IconToggle title="Strikethrough" pressed={selStyle.strike} onClick={() => setStyle(sel as StyleKey, { strike: !selStyle.strike })}><Strikethrough className="size-3.5" /></IconToggle>
                        <Separator orientation="vertical" className="mx-1 h-5" />
                        <Seg
                            value={selStyle.align}
                            onChange={(val) => setStyle(sel as StyleKey, { align: val })}
                            options={[
                                { value: "inherit", label: "Auto" },
                                { value: "left", label: <AlignLeft className="size-3.5" /> },
                                { value: "center", label: <AlignCenter className="size-3.5" /> },
                                { value: "right", label: <AlignRight className="size-3.5" /> },
                            ]}
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <RibbonSwitch label="Reverse (white on black)" checked={selStyle.invert} onChange={(c) => setStyle(sel as StyleKey, { invert: c })} />
                    </div>
                    <Button
                        variant="ghost" size="sm" className="h-7 px-2 text-xs"
                        onClick={() => setStyle(sel as StyleKey, DEFAULT_ELEMENT_STYLES[sel as StyleKey])}
                    >
                        <RotateCcw className="mr-1 size-3.5" /> Reset element style
                    </Button>
                </>
            )}
        </div>
    );

    /* ═══ Render ═══ */
    return (
        <>
            <Head title="Print Labels" />
            <style>{printCss}</style>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => importSetup(e.target.files?.[0])} />

            <div className="flex min-h-0 max-h-[calc(100vh)] flex-1 flex-col overflow-hidden bg-background">
                {/* ── Title bar ── */}
                <div className="flex h-11 shrink-0 items-center gap-2 border-b bg-card px-3">
                    <Button asChild variant="ghost" size="icon" className="size-8 shrink-0" title="Back to Inventory">
                        <Link href="/app/inventory"><ArrowLeft className="size-4" /></Link>
                    </Button>
                    <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground"><Tag className="size-4" /></span>
                    <div className="leading-tight">
                        <div className="text-sm font-semibold tracking-tight">Label Studio</div>
                        <div className="text-[11px] text-muted-foreground">{store.name} · Stock labels</div>
                    </div>
                    <Separator orientation="vertical" className="mx-1 h-6" />
                    <button type="button" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo} className="rounded-md p-1.5 hover:bg-accent disabled:opacity-35"><Undo2 className="size-4" /></button>
                    <button type="button" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo} className="rounded-md p-1.5 hover:bg-accent disabled:opacity-35"><Redo2 className="size-4" /></button>
                    <span className="ml-2 hidden items-center gap-1.5 text-[11px] text-muted-foreground md:flex">
                        {notice ? <span className="font-medium text-foreground">{notice}</span> : <><Check className="size-3.5 text-emerald-600" /> Setup saved automatically in this browser</>}
                    </span>
                    <div className="ml-auto flex items-center gap-3">
                        <span className="hidden text-xs text-muted-foreground lg:inline">
                            Paper <strong className="font-medium text-foreground">{sheetWidthMm} × {s.heightMm} mm</strong>
                            <span className="mx-2 text-border">|</span>
                            <strong className="font-medium text-foreground">{totalLabels}</strong> label{totalLabels === 1 ? "" : "s"} queued
                        </span>
                        <Button size="sm" onClick={doPrint} disabled={totalLabels === 0}>
                            <Printer className="mr-1.5 size-4" /> Print
                        </Button>
                    </div>
                </div>

                {/* ── Ribbon tabs ── */}
                <div className="flex h-8 shrink-0 items-end gap-0.5 overflow-x-auto border-b bg-muted/40 px-2">
                    {RIBBON_TABS.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => patchView({ tab: t.id })}
                            className={cn(
                                "-mb-px whitespace-nowrap rounded-t-md border border-transparent px-3.5 py-1.5 text-xs font-medium transition-colors",
                                v.tab === t.id ? "border-border border-b-card bg-card text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                            )}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* ── Ribbon body ── */}
                <div className="shrink-0 overflow-x-auto border-b bg-card shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                    <div className="flex min-h-[104px] min-w-max items-stretch divide-x divide-border/70">{ribbonBody}</div>
                </div>

                {/* ── Workspace ── */}
                <div className="flex min-h-0 flex-1">
                    {/* Layers & properties */}
                    {v.showLayers && (
                        <aside className="flex w-75 shrink-0 flex-col border-r bg-card">
                            <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
                                <Layers className="size-4 text-muted-foreground" />
                                <h2 className="text-sm font-semibold tracking-tight">Layers</h2>
                                <span className="ml-auto text-[10px] text-muted-foreground">click label to select</span>
                            </div>
                            <div className="max-h-[42%] shrink-0 overflow-auto border-b p-1.5">
                                {layerRows.map((k) => {
                                    const meta = ELEMENTS.find((e) => e.key === k);
                                    const idx = s.order.indexOf(k);
                                    return (
                                        <div
                                            key={k}
                                            onClick={() => setSel(k)}
                                            className={cn(
                                                "flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-xs",
                                                k === "mrp" && "pl-6",
                                                sel === k ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-accent",
                                            )}
                                        >
                                            <button
                                                type="button"
                                                title={s.visible[k] ? "Hide" : "Show"}
                                                className="shrink-0 text-muted-foreground hover:text-foreground"
                                                onClick={(e) => { e.stopPropagation(); setVisible(k, !s.visible[k]); }}
                                            >
                                                {s.visible[k] ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5 opacity-50" />}
                                            </button>
                                            <span className={cn("flex-1 truncate", !s.visible[k] && "text-muted-foreground line-through decoration-muted-foreground/40")}>{elLabel(k)}</span>
                                            {meta?.orderable && (
                                                <>
                                                    <button type="button" title="Move up" disabled={idx <= 0} className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-25" onClick={(e) => { e.stopPropagation(); moveEl(k, -1); }}><ArrowUp className="size-3" /></button>
                                                    <button type="button" title="Move down" disabled={idx === s.order.length - 1} className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-25" onClick={(e) => { e.stopPropagation(); moveEl(k, 1); }}><ArrowDown className="size-3" /></button>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <ScrollArea className="min-h-0 flex-1">{propsPanel}</ScrollArea>
                        </aside>
                    )}

                    {/* Canvas */}
                    <section className="flex min-w-0 flex-1 flex-col bg-muted/60">
                        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
                            <div className="flex min-h-full flex-col" style={{ minWidth: rulerWidthPx + 96 }}>
                                {v.rulers && (
                                    <div className="sticky top-0 z-10 h-6 shrink-0 border-b bg-card">
                                        <div className="relative mx-auto h-full" style={{ width: rulerWidthPx }}>
                                            {rulerTicks.map((mm) => (
                                                <div key={mm}>
                                                    <div className="absolute bottom-0 w-px bg-muted-foreground/40" style={{ left: mm * MM_PX * v.zoom, height: mm % 10 === 0 ? 9 : mm % 5 === 0 ? 6 : 3.5 }} />
                                                    {mm % 10 === 0 && (
                                                        <span className="absolute top-px text-[8px] leading-none text-muted-foreground" style={{ left: mm * MM_PX * v.zoom + 2 }}>{mm}</span>
                                                    )}
                                                </div>
                                            ))}
                                            {colEdges.map((mm, i) => (
                                                <div key={`m${i}`} className="absolute bottom-0 h-full w-[2px] bg-blue-500/70" style={{ left: mm * MM_PX * v.zoom - 1 }} />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="flex flex-1 flex-col items-center py-6" onClick={() => undefined}>
                                    {rows.length === 0 && (
                                        <span className="mb-3 rounded-full border bg-card px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground shadow-sm">
                                            Sample — select stock to print
                                        </span>
                                    )}
                                    <div style={{ zoom: v.zoom }} className="flex flex-col items-center gap-5">
                                        {screenRows.map((row, ri) => (
                                            <div
                                                key={ri}
                                                className="relative bg-white shadow-[0_1px_3px_rgba(0,0,0,0.18),0_10px_28px_rgba(0,0,0,0.14)] ring-1 ring-black/10"
                                                style={{ width: `${sheetWidthMm}mm` }}
                                            >
                                                {v.rowNumbers && rows.length > 0 && (
                                                    <span className="absolute top-1/2 -translate-y-1/2 text-[7px] font-medium text-muted-foreground" style={{ left: "-6mm" }}>{ri + 1}</span>
                                                )}
                                                <div style={rowStyle}>{renderCells(row, ri, true)}</div>
                                            </div>
                                        ))}
                                    </div>
                                    {truncated && (
                                        <p className="mt-4 rounded-md border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                                            Previewing the first {MAX_SCREEN_ROWS} of {rows.length} rows — all {totalLabels} labels will print.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Status bar */}
                        <div className="flex h-9 shrink-0 items-center gap-3 border-t bg-card px-3 text-xs text-muted-foreground">
                            <span className="whitespace-nowrap">
                                {totalLabels} label{totalLabels === 1 ? "" : "s"} · {rows.length} row{rows.length === 1 ? "" : "s"} · {s.columns} UP
                            </span>
                            {barcodeIssues > 0 && (
                                <button type="button" onClick={() => patchView({ tab: "barcode" })} className="flex items-center gap-1 whitespace-nowrap text-amber-600 hover:underline">
                                    <AlertTriangle className="size-3.5" /> {barcodeIssues} barcode issue{barcodeIssues === 1 ? "" : "s"}
                                </button>
                            )}
                            <span className="hidden whitespace-nowrap xl:inline">Selected: <strong className="font-medium text-foreground">{elLabel(sel)}</strong></span>
                            <span className="hidden whitespace-nowrap 2xl:inline">Ctrl+P print · Ctrl+Z undo · Ctrl+scroll zoom</span>
                            <div className="ml-auto flex items-center gap-1.5">
                                <button type="button" title="Zoom out" className="rounded p-1 hover:bg-accent" onClick={() => setZoom(v.zoom / 1.15)}><Minus className="size-3.5" /></button>
                                <Slider value={[v.zoom]} min={0.25} max={6} step={0.05} onValueChange={([z]) => setZoom(z)} className="w-28" />
                                <button type="button" title="Zoom in" className="rounded p-1 hover:bg-accent" onClick={() => setZoom(v.zoom * 1.15)}><Plus className="size-3.5" /></button>
                                <span className="w-10 text-right font-medium text-foreground">{Math.round(v.zoom * 100)}%</span>
                                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px]" onClick={fitWidth}>Fit</Button>
                            </div>
                        </div>
                    </section>

                    {/* Data panel */}
                    {v.showData && (
                        <aside className="flex w-100 shrink-0 flex-col border-l bg-card">
                            <div className="shrink-0 border-b px-3.5 pb-3 pt-3">
                                <div className="mb-2.5 flex items-center gap-2">
                                    <Database className="size-4 text-muted-foreground" />
                                    <h2 className="text-sm font-semibold tracking-tight">Data Source</h2>
                                    <span className="ml-auto text-[11px] text-muted-foreground">{units.length + batches.length} items in stock</span>
                                </div>
                                <div className="mb-2.5 grid grid-cols-3 gap-0.5 rounded-lg bg-muted p-0.5">
                                    {([
                                        { id: "units", label: "Units", n: selectedUnits },
                                        { id: "batches", label: "Batches", n: selectedBatches },
                                        { id: "manual", label: "Manual", n: manual.length },
                                    ] as { id: DataTab; label: string; n: number }[]).map((t) => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => setDataTab(t.id)}
                                            className={cn("rounded-md py-1 text-xs font-medium transition-colors", dataTab === t.id ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
                                        >
                                            {t.label} <span className="text-[10px] opacity-70">{t.n}</span>
                                        </button>
                                    ))}
                                </div>
                                {dataTab !== "manual" && (
                                    <>
                                        <div className="relative">
                                            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                            <Input className="h-8 pl-8 text-xs shadow-none" placeholder="Search name, SKU, IMEI, batch…" value={search} onChange={(e) => setSearch(e.target.value)} />
                                        </div>
                                        <div className="mt-2 flex items-center gap-2">
                                            {dataTab === "units" && conditions.length > 0 && (
                                                <RibbonSelect
                                                    className="w-[120px]"
                                                    value={condFilter}
                                                    onChange={setCondFilter}
                                                    options={[{ value: "all", label: "All conditions" }, ...conditions.map((c) => ({ value: c, label: c }))]}
                                                />
                                            )}
                                            <RibbonSwitch label="Selected only" checked={selectedOnly} onChange={setSelectedOnly} />
                                        </div>
                                    </>
                                )}
                            </div>

                            <ScrollArea className="min-h-0 flex-1">
                                <div className="px-3.5 py-3">
                                    {dataTab === "units" && (
                                        <section>
                                            <div className="mb-1.5 flex flex-wrap items-center gap-0.5">
                                                <span className="mr-auto text-[11px] text-muted-foreground">{shownUnits.length} shown · {selectedUnits} selected</span>
                                                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setUnitSel((p) => ({ ...p, ...Object.fromEntries(shownUnits.map((u) => [u.id, p[u.id] ?? 1])) }))}>Select all</Button>
                                                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setUnitSel((p) => { const n = { ...p }; for (const u of shownUnits) { if (n[u.id] === undefined) n[u.id] = 1; else delete n[u.id]; } return n; })}>Invert</Button>
                                                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setUnitSel((p) => Object.fromEntries(Object.entries(p).filter(([id]) => !shownUnits.some((u) => u.id === Number(id)))))}>Clear</Button>
                                            </div>
                                            <div className="space-y-px">
                                                {shownUnits.map((u) => (
                                                    <StockRow
                                                        key={u.id}
                                                        active={unitSel[u.id] !== undefined}
                                                        copies={unitSel[u.id]}
                                                        onToggle={(c) => setUnitSel((p) => { const n = { ...p }; if (c) n[u.id] = n[u.id] ?? 1; else delete n[u.id]; return n; })}
                                                        onCopies={(n) => setUnitSel((p) => ({ ...p, [u.id]: n }))}
                                                        title={u.product_name}
                                                        variant={u.variant_name}
                                                        sub={`${u.imei1 ?? u.serial_number ?? u.sku ?? ""}${u.warranty ? ` · Warranty: ${u.warranty}` : ""}${u.retail_price !== null ? ` · ₹${fmtMoney(u.retail_price, "auto")}` : ""}`}
                                                    />
                                                ))}
                                                {shownUnits.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">No units match.</p>}
                                            </div>
                                        </section>
                                    )}

                                    {dataTab === "batches" && (
                                        <section>
                                            <div className="mb-1.5 flex flex-wrap items-center gap-0.5">
                                                <span className="mr-auto text-[11px] text-muted-foreground">{shownBatches.length} shown · {selectedBatches} selected</span>
                                                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setBatchSel((p) => ({ ...p, ...Object.fromEntries(shownBatches.map((b) => [b.id, p[b.id] ?? 1])) }))}>Select all</Button>
                                                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" title="Select shown and set copies to stock quantity" onClick={() => setBatchSel((p) => ({ ...p, ...Object.fromEntries(shownBatches.map((b) => [b.id, Math.max(1, b.qty)])) }))}>All = qty</Button>
                                                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setBatchSel((p) => Object.fromEntries(Object.entries(p).filter(([id]) => !shownBatches.some((b) => b.id === Number(id)))))}>Clear</Button>
                                            </div>
                                            <div className="space-y-px">
                                                {shownBatches.map((b) => (
                                                    <StockRow
                                                        key={b.id}
                                                        active={batchSel[b.id] !== undefined}
                                                        copies={batchSel[b.id]}
                                                        onToggle={(c) => setBatchSel((p) => { const n = { ...p }; if (c) n[b.id] = n[b.id] ?? 1; else delete n[b.id]; return n; })}
                                                        onCopies={(n) => setBatchSel((p) => ({ ...p, [b.id]: n }))}
                                                        title={b.product_name}
                                                        variant={b.variant_name}
                                                        sub={`${b.batch_number ?? b.sku ?? ""} · In stock: ${b.qty}${b.retail_price !== null ? ` · ₹${fmtMoney(b.retail_price, "auto")}` : ""}`}
                                                        extra={
                                                            <Button size="sm" variant="ghost" className="h-6 shrink-0 px-1.5 text-[11px]" title="Copies = full stock quantity" onClick={() => setBatchSel((p) => ({ ...p, [b.id]: Math.max(1, b.qty) }))}>= qty</Button>
                                                        }
                                                    />
                                                ))}
                                                {shownBatches.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">No batches match.</p>}
                                            </div>
                                        </section>
                                    )}

                                    {dataTab === "manual" && (
                                        <section>
                                            <div className="rounded-lg border bg-muted/30 p-2.5">
                                                <div className="grid grid-cols-2 gap-1.5">
                                                    <Input className="h-8 bg-card text-xs shadow-none" placeholder="Title / product line" value={mForm.title} onChange={(e) => setMForm((f) => ({ ...f, title: e.target.value }))} />
                                                    <Input className="h-8 bg-card text-xs shadow-none" placeholder="Second line" value={mForm.sub} onChange={(e) => setMForm((f) => ({ ...f, sub: e.target.value }))} />
                                                    <Input className="h-8 bg-card text-xs shadow-none" placeholder="Barcode value" value={mForm.barcode} onChange={(e) => setMForm((f) => ({ ...f, barcode: e.target.value }))} />
                                                    <Input className="h-8 bg-card text-xs shadow-none" placeholder="Price text (₹499)" value={mForm.price} onChange={(e) => setMForm((f) => ({ ...f, price: e.target.value }))} />
                                                </div>
                                                <div className="mt-2 flex items-center gap-1.5">
                                                    <Input type="number" min={1} max={9999} className="h-8 w-20 bg-card px-1.5 text-center text-xs shadow-none" value={mForm.copies} onFocus={(e) => e.target.select()} onChange={(e) => setMForm((f) => ({ ...f, copies: Math.max(1, Number(e.target.value) || 1) }))} />
                                                    <Button size="sm" className="h-8 flex-1 text-xs" disabled={!mForm.title.trim()} onClick={submitManual}>
                                                        {editId !== null ? <><Check className="mr-1 size-3.5" /> Update label</> : <><Plus className="mr-1 size-3.5" /> Add manual label</>}
                                                    </Button>
                                                    {editId !== null && (
                                                        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => { setEditId(null); setMForm({ title: "", sub: "", barcode: "", price: "", copies: 1 }); }}>Cancel</Button>
                                                    )}
                                                </div>
                                            </div>
                                            {manual.length > 0 && (
                                                <div className="mt-2 space-y-1">
                                                    {manual.map((m) => (
                                                        <div key={m.id} className={cn("flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs", editId === m.id ? "bg-primary/10 ring-1 ring-primary/40" : "bg-accent/60")}>
                                                            <span className="min-w-0 flex-1 break-words font-medium">{m.title} <span className="font-normal text-muted-foreground">× {m.copies}</span></span>
                                                            <Button size="sm" variant="ghost" className="h-6 w-6 shrink-0 p-0" title="Edit" onClick={() => { setEditId(m.id); setMForm({ title: m.title, sub: m.sub, barcode: m.barcode, price: m.price, copies: m.copies }); }}><Pencil className="size-3.5" /></Button>
                                                            <Button size="sm" variant="ghost" className="h-6 w-6 shrink-0 p-0" title="Duplicate" onClick={() => setManual((l) => [...l, { ...m, id: Date.now() }])}><Copy className="size-3.5" /></Button>
                                                            <Button size="sm" variant="ghost" className="h-6 w-6 shrink-0 p-0" title="Remove" onClick={() => setManual((l) => l.filter((x) => x.id !== m.id))}><Trash2 className="size-3.5" /></Button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {manual.length === 0 && <p className="mt-2 px-1 text-xs text-muted-foreground">Manual labels are saved in this browser until you remove them.</p>}
                                        </section>
                                    )}
                                </div>
                            </ScrollArea>

                            <div className="shrink-0 space-y-2.5 border-t px-3.5 py-3">
                                {dataTab !== "manual" && (
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[11px] text-muted-foreground">Set copies of all selected to</span>
                                        <Input type="number" min={1} max={9999} className="h-7 w-14 px-1.5 text-center text-xs shadow-none" value={bulkCopies} onFocus={(e) => e.target.select()} onChange={(e) => setBulkCopies(Math.max(1, Number(e.target.value) || 1))} />
                                        <Button
                                            size="sm" variant="outline" className="h-7 px-2 text-xs"
                                            onClick={() => dataTab === "units"
                                                ? setUnitSel((p) => Object.fromEntries(Object.keys(p).map((id) => [id, bulkCopies])))
                                                : setBatchSel((p) => Object.fromEntries(Object.keys(p).map((id) => [id, bulkCopies])))}
                                        >
                                            Apply
                                        </Button>
                                    </div>
                                )}
                                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                    <span>Units <strong className="text-foreground">{unitLabelCount}</strong></span>
                                    <span>Batches <strong className="text-foreground">{batchLabelCount}</strong></span>
                                    <span>Manual <strong className="text-foreground">{manualLabelCount}</strong></span>
                                    {s.copyMultiplier > 1 && <span>× <strong className="text-foreground">{s.copyMultiplier}</strong></span>}
                                    <span className="text-xs">Total <strong className="text-sm text-foreground">{totalLabels}</strong></span>
                                </div>
                                <Button className="h-10 w-full text-sm font-semibold" onClick={doPrint} disabled={totalLabels === 0}>
                                    <Printer className="mr-2 size-4" /> Print {totalLabels} label{totalLabels === 1 ? "" : "s"}
                                </Button>
                            </div>
                        </aside>
                    )}
                </div>
            </div>

            {/* Print-only sheet, mounted just for the duration of printing (see beforeprint/afterprint). */}
            {mounted && printing &&
                createPortal(
                    <div id="label-print-root" style={{ width: `${sheetWidthMm}mm` }}>
                        {rows.map((row, ri) => (
                            <div key={ri} className="label-p-row" style={rowStyle}>
                                {renderCells(row, ri, false)}
                            </div>
                        ))}
                    </div>,
                    document.body,
                )}
        </>
    );
}

InventoryLabels.layout = {
    breadcrumbs: [
        { title: "Inventory", href: "/app/inventory" },
        { title: "Print Labels", href: "/app/inventory/labels" },
    ],
};
