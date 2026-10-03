import type { ComponentType } from "react";
import Classic from "./Classic";
import Corporate from "./Corporate";
import Minimal from "./Minimal";
import Modern from "./Modern";
import Receipt from "./Receipt";
import type { TemplateProps } from "./model";
import type { TemplateKey } from "./types";

export const TEMPLATES: Record<TemplateKey, ComponentType<TemplateProps>> = {
    classic: Classic,
    modern: Modern,
    corporate: Corporate,
    minimal: Minimal,
    receipt: Receipt,
};

/** Ready for a future "choose your invoice design" setting. */
export const TEMPLATE_OPTIONS: { key: TemplateKey; label: string; paper: "A4" | "80mm"; description: string }[] = [
    { key: "classic", label: "Classic", paper: "A4", description: "Full black grid, the familiar Tally-style GST invoice." },
    { key: "modern", label: "Modern", paper: "A4", description: "Brand-colour header, tinted cards, zebra rows." },
    { key: "corporate", label: "Corporate", paper: "A4", description: "Serif letterhead and hairline table for B2B and wholesale." },
    { key: "minimal", label: "Minimal", paper: "A4", description: "Clean, borderless, low ink." },
    { key: "receipt", label: "Receipt", paper: "80mm", description: "Thermal roll for counter sales." },
];

export { buildModel, amountInWords } from "./model";
export type * from "./types";
