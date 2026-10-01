import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Head, useForm } from '@inertiajs/react';
import { format } from 'date-fns';

import app from '@/routes/app';
import SingleImageUploader from '@/components/special/single-image-uploader';
import CompactImageUploader from '@/components/special/compact-image-uploader';
import EmiDatePicker from '@/components/special/emi-date-picker';
import { INDIAN_STATES as indianStates } from '@/data/indian-states';

import {
    ReceiptText, User, MapPin, Smartphone, IndianRupee, Calendar as CalendarIcon,
    CheckCircle2, CreditCard, Landmark, Search, Loader2, Phone as PhoneIcon,
    Building2, Map as MapIcon, TriangleAlert, FileText, Info, ShieldCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// ─── Types (mirror the backend contract) ─────────────────────────────────────

interface AddressPayload {
    line1: string | null;
    line2: string | null;
    village_or_area: string | null;
    post_office: string | null;
    police_station: string | null;
    city: string | null;
    district: string | null;
    state: string | null;
    postal_code: string | null;
}

interface CustomerParty {
    kind: 'customer';
    id: number;
    name: string;
    care_of: string | null;
    phone_primary: string;
    phone_secondary: string | null;
    aadhaar_number: string | null;
    pan_number: string | null;
    voter_number: string | null;
    address: AddressPayload | null;
    assets: Record<string, { id: number; url: string | null }>;
}

interface SupplierParty {
    kind: 'supplier';
    id: number;
    name: string;
    phone: string | null;
    address: AddressPayload | null;
}

interface InvoiceItemPayload {
    label: string;
    imei1: string | null;
    imei2: string | null;
    serial_number: string | null;
    quantity: number;
    unit_price: number;
    line_total: number;
}

interface InvoicePayload {
    id: number;
    uuid: string;
    identity: string;
    invoice_number: string;
    invoice_date: string | null;
    grand_total: number;
    due_amount: number;
    party: CustomerParty | SupplierParty | null;
    items: InvoiceItemPayload[];
}

interface Defaults {
    interest_rate: number | string;
    collection_slab: string;
    processing_fee: number | string;
    prefix: string;
    allowed_emi_days: number[];
    primary_emi_day: number;
}

interface Financer {
    id: number;
    name: string;
    type: string | null;
}

interface ScheduleRow {
    installment_no: number;
    due_date: string;
    total_due: number;
    principal_amount: number;
    interest_amount: number;
}

interface ScheduleResult {
    principal: number;
    down_payment: number;
    net_principal: number;
    monthly_rate: number;
    monthly_interest_amount: number;
    total_interest: number;
    processing_fee: number;
    file_charge_mode: string;
    total_payable: number;
    base_emi: number;
    is_rolling: boolean;
    allowed_days: number[];
    primary_day: number;
    recommended_first_date: string;
    first_emi_date: string;
    schedule: ScheduleRow[];
}

interface Props {
    invoice: InvoicePayload | null;
    defaults: Defaults;
    financers: Financer[];
}

// ─── Form shape ──────────────────────────────────────────────────────────────

interface LoanForm {
    borrower_type: string;
    borrower_id: string;
    invoice_id: string;
    financer_id: string;
    principal_amount: string;
    down_payment: string;
    down_payment_mode: string;
    tenure_months: string;
    file_charge_mode: 'upfront' | 'spread';
    collection_slab: string;
    disbursed_date: string;
    first_emi_date: string;
    interest_rate: string; // always '' → server default (no UI input; fixed rate)
    processing_fee: string; // always '' → server default (no UI input)
    notes: string;
    customer: {
        name: string;
        care_of: string;
        phone_primary: string;
        phone_secondary: string;
        aadhaar_number: string;
        pan_number: string;
        voter_number: string;
    };
    supplier: { name: string; phone: string };
    address: {
        line1: string;
        line2: string;
        village_or_area: string;
        post_office: string;
        police_station: string;
        city: string;
        district: string;
        state: string;
        postal_code: string;
    };
    photo: File | null;
    doc_aadhaar_front: File | null;
    doc_aadhaar_back: File | null;
    doc_pan: File | null;
    doc_voter_front: File | null;
    doc_voter_back: File | null;
}

type FileField = 'photo' | 'doc_aadhaar_front' | 'doc_aadhaar_back' | 'doc_pan' | 'doc_voter_front' | 'doc_voter_back';

const CUSTOMER_FQCN = 'App\\Models\\Customer';
const SUPPLIER_FQCN = 'App\\Models\\Supplier';

const PAYMENT_MODES = [
    { value: 'cash', label: 'Cash' },
    { value: 'upi', label: 'UPI' },
    { value: 'bank', label: 'Bank Transfer' },
    { value: 'card', label: 'Card' },
    { value: 'neft', label: 'NEFT' },
    { value: 'cheque', label: 'Cheque' },
] as const;

const TENURE_PRESETS = ['3', '6', '9', '12'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toLocalISODate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseLocalDate(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function fmt(n: number | string | undefined | null): string {
    if (n === undefined || n === null || n === '') return '0.00';
    const v = Number(n);
    if (isNaN(v)) return '0.00';
    return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getCsrfToken(): string {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';
}

/** Aadhaar display: groups of 4 digits. The form stores raw digits. */
function formatAadhaarDisplay(digits: string): string {
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function str(v: string | null | undefined): string {
    return v ?? '';
}

/** Current stored-asset URLs keyed by asset type (photo, aadhaar_front, …). */
function assetsFromParty(party: CustomerParty | SupplierParty | null | undefined): Record<string, string | null> {
    const out: Record<string, string | null> = {};
    if (party && party.kind === 'customer' && party.assets) {
        for (const [key, asset] of Object.entries(party.assets)) {
            out[key] = asset?.url ?? null;
        }
    }
    return out;
}

/** Prefill borrower/address/file state from a loaded invoice payload. */
function invoicePrefill(inv: InvoicePayload): Partial<LoanForm> & { existingAssets: Record<string, string | null> } {
    const party = inv.party;
    const cust = party?.kind === 'customer' ? party : null;
    const supp = party?.kind === 'supplier' ? party : null;
    const addr = party?.address ?? null;

    return {
        borrower_type: !party ? '' : party.kind === 'supplier' ? SUPPLIER_FQCN : CUSTOMER_FQCN,
        borrower_id: party ? String(party.id) : '',
        invoice_id: String(inv.id),
        principal_amount: String(inv.due_amount),
        down_payment: '0',
        first_emi_date: '',
        customer: {
            name: str(cust?.name),
            care_of: str(cust?.care_of),
            phone_primary: str(cust?.phone_primary),
            phone_secondary: str(cust?.phone_secondary),
            aadhaar_number: str(cust?.aadhaar_number),
            pan_number: str(cust?.pan_number),
            voter_number: str(cust?.voter_number),
        },
        supplier: {
            name: str(supp?.name),
            phone: str(supp?.phone),
        },
        address: {
            line1: str(addr?.line1),
            line2: str(addr?.line2),
            village_or_area: str(addr?.village_or_area),
            post_office: str(addr?.post_office),
            // ssm shop-local defaults apply only when the party has no address on file.
            police_station: addr?.police_station ?? (addr ? '' : 'Jalangi'),
            city: str(addr?.city),
            district: addr?.district ?? (addr ? '' : 'Murshidabad'),
            state: addr?.state ?? (addr ? '' : 'West Bengal'),
            postal_code: str(addr?.postal_code),
        },
        photo: null,
        doc_aadhaar_front: null,
        doc_aadhaar_back: null,
        doc_pan: null,
        doc_voter_front: null,
        doc_voter_back: null,
        existingAssets: assetsFromParty(party),
    };
}

function blankForm(defaults: Defaults, todayISO: string): LoanForm {
    return {
        borrower_type: CUSTOMER_FQCN,
        borrower_id: '',
        invoice_id: '',
        financer_id: '',
        principal_amount: '',
        down_payment: '0',
        down_payment_mode: 'cash',
        tenure_months: '12',
        file_charge_mode: 'upfront',
        collection_slab: defaults.collection_slab ?? '1,10,20',
        disbursed_date: todayISO,
        first_emi_date: '',
        interest_rate: '',
        processing_fee: '',
        notes: '',
        customer: {
            name: '', care_of: '', phone_primary: '', phone_secondary: '',
            aadhaar_number: '', pan_number: '', voter_number: '',
        },
        supplier: { name: '', phone: '' },
        address: {
            line1: '', line2: '', village_or_area: '', post_office: '',
            police_station: 'Jalangi', city: '', district: 'Murshidabad',
            state: 'West Bengal', postal_code: '',
        },
        photo: null,
        doc_aadhaar_front: null,
        doc_aadhaar_back: null,
        doc_pan: null,
        doc_voter_front: null,
        doc_voter_back: null,
    };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Create({ invoice, defaults, financers = [] }: Props) {
    const today = new Date();
    const todayISO = toLocalISODate(today);

    // Invoice source: `?invoice=<uuid>` prop, or the step-0 loader below.
    const [lookedUp, setLookedUp] = useState<InvoicePayload | null>(null);
    const [propDismissed, setPropDismissed] = useState(false);
    const activeInvoice = propDismissed ? lookedUp : (lookedUp ?? invoice);
    const party = activeInvoice?.party ?? null;
    const isSupplier = party?.kind === 'supplier';
    const partyMissing = !!activeInvoice && !party;

    const [existingAssets, setExistingAssets] = useState<Record<string, string | null>>(() =>
        assetsFromParty(invoice?.party),
    );

    const [initialForm] = useState<LoanForm>(() => {
        const base = blankForm(defaults, todayISO);
        if (invoice) {
            const { existingAssets: _assets, ...prefill } = invoicePrefill(invoice);
            return { ...base, ...prefill };
        }
        return base;
    });

    const { data, setData, post, processing, errors, transform } = useForm<LoanForm>(initialForm);

    const [isDirty, setIsDirty] = useState(false);
    const [loanDateOpen, setLoanDateOpen] = useState(false);
    const [tenureCustom, setTenureCustom] = useState(false);

    // Step-0 invoice loader state
    const [query, setQuery] = useState('');
    const [lookupBusy, setLookupBusy] = useState(false);
    const [lookupError, setLookupError] = useState<string | null>(null);

    // Schedule preview state
    const [schedule, setSchedule] = useState<ScheduleResult | null>(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const calcDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const fieldError = (key: string): string | undefined =>
        (errors as Record<string, string | undefined>)[key];

    // ── Dirty-tracked setters ────────────────────────────────────────────────

    const set = <K extends keyof LoanForm>(key: K, value: LoanForm[K]) => {
        setIsDirty(true);
        setData((p) => {
            const next = { ...p };
            next[key] = value;
            return next;
        });
    };

    const setCustomerField = (field: keyof LoanForm['customer'], value: string) => {
        setIsDirty(true);
        setData((p) => ({ ...p, customer: { ...p.customer, [field]: value } }));
    };

    const setSupplierField = (field: keyof LoanForm['supplier'], value: string) => {
        setIsDirty(true);
        setData((p) => ({ ...p, supplier: { ...p.supplier, [field]: value } }));
    };

    const setAddressField = (field: keyof LoanForm['address'], value: string) => {
        setIsDirty(true);
        setData((p) => ({ ...p, address: { ...p.address, [field]: value } }));
    };

    const setFileField = (field: FileField, file: File | null) => {
        setIsDirty(true);
        setData((p) => ({ ...p, [field]: file }));
    };

    // ── beforeunload dirty guard ─────────────────────────────────────────────

    useEffect(() => {
        const handler = (e: BeforeUnloadEvent) => {
            if (isDirty && !processing) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty, processing]);

    // ── Invoice application (prop or lookup) ─────────────────────────────────

    const applyInvoice = useCallback((inv: InvoicePayload) => {
        const { existingAssets: assets, ...prefill } = invoicePrefill(inv);
        setData((p) => ({ ...p, ...prefill }));
        setExistingAssets(assets);
        setTenureCustom(false);
        setSchedule(null);
        setIsDirty(true);
    }, [setData]);

    const resetToLoader = useCallback(() => {
        setLookedUp(null);
        setPropDismissed(true);
        setQuery('');
        setLookupError(null);
        setSchedule(null);
        setTenureCustom(false);
        setExistingAssets({});
        setData((p) => ({
            ...p,
            borrower_type: CUSTOMER_FQCN,
            borrower_id: '',
            invoice_id: '',
            principal_amount: '',
            first_emi_date: '',
            photo: null,
            doc_aadhaar_front: null,
            doc_aadhaar_back: null,
            doc_pan: null,
            doc_voter_front: null,
            doc_voter_back: null,
        }));
    }, [setData]);

    const runLookup = async (e?: React.FormEvent) => {
        e?.preventDefault();
        const q = query.trim();
        if (!q || lookupBusy) return;
        setLookupBusy(true);
        setLookupError(null);
        try {
            const res = await fetch(
                `${app.loans['invoice-lookup'].url()}?q=${encodeURIComponent(q)}`,
                {
                    headers: {
                        Accept: 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                },
            );
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json?.message || `Lookup failed (${res.status}).`);
            const inv = json.invoice as InvoicePayload;
            setLookedUp(inv);
            setPropDismissed(true);
            applyInvoice(inv);
        } catch (err) {
            setLookupError(err instanceof Error ? err.message : 'Lookup failed.');
        } finally {
            setLookupBusy(false);
        }
    };

    // ── Schedule preview (debounced 600ms) ───────────────────────────────────

    const fetchSchedule = useCallback(async (
        overrideFirstEmiDate?: string | null,
        overrideDisbursedDate?: string,
    ) => {
        const disbursedDate = overrideDisbursedDate ?? data.disbursed_date;
        const tenure = parseInt(data.tenure_months, 10);
        const principal = parseFloat(data.principal_amount) || 0;
        if (!disbursedDate || !tenure || tenure < 1 || tenure > 84 || principal <= 0) {
            setSchedule(null);
            return;
        }

        const firstEmiDateToSend = overrideFirstEmiDate !== undefined
            ? overrideFirstEmiDate
            : (data.first_emi_date || null);

        setIsCalculating(true);
        try {
            const res = await fetch(app.loans['preview-schedule'].url(), {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': getCsrfToken(),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    principal_amount: principal,
                    down_payment: parseFloat(data.down_payment) || 0,
                    interest_rate: null, // fixed store rate — no UI input
                    tenure_months: tenure,
                    processing_fee: null, // store default
                    file_charge_mode: data.file_charge_mode,
                    disbursed_date: disbursedDate,
                    first_emi_date: firstEmiDateToSend,
                    collection_slab: data.collection_slab || null,
                }),
            });
            if (!res.ok) throw new Error(`preview ${res.status}`);
            const result: ScheduleResult = await res.json();
            setSchedule(result);
            // Adopt the backend-resolved first EMI date (recommended or user-picked).
            if (result.first_emi_date && result.first_emi_date !== data.first_emi_date) {
                setData('first_emi_date', result.first_emi_date);
            }
        } catch {
            // Keep the last known schedule on transient errors.
        } finally {
            setIsCalculating(false);
        }
    }, [
        data.principal_amount, data.down_payment,
        data.tenure_months, data.file_charge_mode,
        data.disbursed_date, data.first_emi_date, data.collection_slab,
        setData,
    ]);

    const triggerRecalc = useCallback(() => {
        if (calcDebounceRef.current) clearTimeout(calcDebounceRef.current);
        calcDebounceRef.current = setTimeout(() => fetchSchedule(), 600);
    }, [fetchSchedule]);

    useEffect(() => {
        if (!activeInvoice || partyMissing) return;
        triggerRecalc();
        return () => { if (calcDebounceRef.current) clearTimeout(calcDebounceRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        data.principal_amount, data.down_payment,
        data.tenure_months, data.file_charge_mode, data.collection_slab,
        activeInvoice,
    ]);

    // ── Date changes ─────────────────────────────────────────────────────────

    const handleLoanDateChange = (date: Date | undefined) => {
        if (!date) return;
        const iso = toLocalISODate(date);
        setIsDirty(true);
        setData((p) => ({ ...p, disbursed_date: iso, first_emi_date: '' }));
        setLoanDateOpen(false);
        fetchSchedule(null, iso);
    };

    const handleEmiDateChange = (date: Date | undefined) => {
        const iso = date ? toLocalISODate(date) : null;
        setIsDirty(true);
        setData('first_emi_date', iso ?? '');
        fetchSchedule(iso);
    };

    // ── Derived ──────────────────────────────────────────────────────────────

    const principalNum = parseFloat(data.principal_amount) || 0;
    const downPaymentNum = parseFloat(data.down_payment) || 0;
    const downPaymentExceeds = downPaymentNum > 0 && principalNum > 0 && downPaymentNum > principalNum;
    const hasFinancials = principalNum > 0 && data.down_payment !== '' && !downPaymentExceeds;
    const feeNum = Number(defaults.processing_fee) || 0;
    const noFinancer = financers.length === 0;

    const selectedLoanDate = data.disbursed_date ? parseLocalDate(data.disbursed_date) : today;
    const firstEmiAsDate = data.first_emi_date ? parseLocalDate(data.first_emi_date) : undefined;
    const allowedDays = schedule ? schedule.allowed_days : (defaults.allowed_emi_days ?? []);
    const primaryDay = schedule ? schedule.primary_day : (defaults.primary_emi_day ?? 1);
    const isRolling = schedule?.is_rolling ?? false;

    // ── Submit ───────────────────────────────────────────────────────────────

    const canSubmit =
        !processing &&
        !!activeInvoice &&
        !partyMissing &&
        !noFinancer &&
        !!data.financer_id &&
        principalNum > 0 &&
        data.down_payment !== '' &&
        !downPaymentExceeds &&
        !isCalculating &&
        !!data.first_emi_date;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        // interest_rate / processing_fee are always null → the server applies
        // the store defaults. first_emi_date falls back to null when empty.
        transform((formData) => ({
            ...formData,
            interest_rate: null,
            processing_fee: null,
            first_emi_date: formData.first_emi_date || null,
        }) as unknown as LoanForm);
        post(app.loans.store.url(), { forceFormData: true });
    };

    // ── Card 1 — Customer Identity Information (ssm-exact; borrower fixed from invoice) ──

    const customerCard1 = (
        <Card className="border-primary/40 bg-primary/5 shadow-sm">
            <CardHeader className="border-b border-border/50 pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <User className="size-5 text-primary" />
                    Customer Identity Information
                </CardTitle>
                <CardDescription>Primary identity records, photo, and government KYC identifiers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                    <div className="space-y-2 lg:col-span-1">
                        <Label className="text-xs font-semibold">Customer Photo</Label>
                        {existingAssets['photo'] && !data.photo && (
                            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Info className="size-3 shrink-0" /> Upload to replace the existing photo
                            </p>
                        )}
                        <SingleImageUploader
                            label={data.photo || existingAssets['photo'] ? 'New photo selected' : 'Upload Customer Photo'}
                            value={data.photo ?? existingAssets['photo'] ?? null}
                            onChange={(f) => setFileField('photo', f)}
                        />
                        {fieldError('photo') && <p className="text-xs text-destructive">{fieldError('photo')}</p>}
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:col-span-3">
                        <Field
                            id="customer_name" label="Full Name" required placeholder="Full legal name"
                            value={data.customer.name}
                            onChange={(e) => setCustomerField('name', e.target.value)}
                            error={fieldError('customer.name')}
                        />
                        <Field
                            id="customer_care_of" label="Care Of (S/O, W/O)" required placeholder="Guardian name"
                            value={data.customer.care_of}
                            onChange={(e) => setCustomerField('care_of', e.target.value)}
                            error={fieldError('customer.care_of')}
                        />
                        <div className="space-y-1.5">
                            <Label htmlFor="customer_phone" className="text-xs font-semibold">
                                Primary Phone <span className="text-destructive">*</span>
                            </Label>
                            <div className="relative">
                                <PhoneIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    id="customer_phone" type="tel" placeholder="9876543210"
                                    maxLength={10} inputMode="numeric"
                                    value={data.customer.phone_primary}
                                    onChange={(e) => setCustomerField('phone_primary', e.target.value.replace(/\D/g, '').slice(0, 10))}
                                    className="h-9 pl-8 text-xs"
                                />
                            </div>
                            {fieldError('customer.phone_primary') && (
                                <p className="text-xs text-destructive">{fieldError('customer.phone_primary')}</p>
                            )}
                        </div>
                    </div>
                </div>

                {/*
                  KYC documents — new uploads create NEW HasAssets rows which the backend
                  snapshots into this loan's KYC set; nothing already on file is replaced
                  or deleted. The preview swap in the uploader below is visual only —
                  this differs from ssm's replace semantics.
                */}
                <div className="grid grid-cols-1 gap-4 border-t pt-4 md:grid-cols-3">
                    <div className="space-y-2 rounded-lg border p-3">
                        <div className="flex items-center justify-between border-b pb-2">
                            <span className="flex items-center gap-1.5 text-xs font-semibold">
                                <CreditCard className="size-4 text-primary" /> Aadhaar Card
                            </span>
                            <span className="text-xs text-destructive">*</span>
                        </div>
                        <Input
                            placeholder="0000 0000 0000" maxLength={14} inputMode="numeric"
                            value={formatAadhaarDisplay(data.customer.aadhaar_number)}
                            onChange={(e) => setCustomerField('aadhaar_number', e.target.value.replace(/\D/g, '').slice(0, 12))}
                            className="h-9 text-xs tracking-wider"
                        />
                        {fieldError('customer.aadhaar_number') && (
                            <p className="text-xs text-destructive">{fieldError('customer.aadhaar_number')}</p>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            <CompactImageUploader
                                label="Front"
                                value={data.doc_aadhaar_front ?? existingAssets['aadhaar_front'] ?? null}
                                onChange={(f) => setFileField('doc_aadhaar_front', f)}
                            />
                            <CompactImageUploader
                                label="Back"
                                value={data.doc_aadhaar_back ?? existingAssets['aadhaar_back'] ?? null}
                                onChange={(f) => setFileField('doc_aadhaar_back', f)}
                            />
                        </div>
                        {(fieldError('doc_aadhaar_front') || fieldError('doc_aadhaar_back')) && (
                            <p className="text-xs text-destructive">
                                {fieldError('doc_aadhaar_front') ?? fieldError('doc_aadhaar_back')}
                            </p>
                        )}
                    </div>

                    <div className="space-y-2 rounded-lg border p-3">
                        <div className="flex items-center justify-between border-b pb-2">
                            <span className="flex items-center gap-1.5 text-xs font-semibold">
                                <CreditCard className="size-4 text-muted-foreground" /> PAN Card
                            </span>
                            <span className="text-[10px] text-muted-foreground">Optional</span>
                        </div>
                        <Input
                            placeholder="ABCDE1234F" maxLength={10}
                            value={data.customer.pan_number}
                            onChange={(e) => setCustomerField('pan_number', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                            className="h-9 text-xs uppercase tracking-wider"
                        />
                        {fieldError('customer.pan_number') && (
                            <p className="text-xs text-destructive">{fieldError('customer.pan_number')}</p>
                        )}
                        <CompactImageUploader
                            label="PAN Document"
                            value={data.doc_pan ?? existingAssets['pan_document'] ?? null}
                            onChange={(f) => setFileField('doc_pan', f)}
                        />
                        {fieldError('doc_pan') && (
                            <p className="text-xs text-destructive">{fieldError('doc_pan')}</p>
                        )}
                    </div>

                    <div className="space-y-2 rounded-lg border p-3">
                        <div className="flex items-center justify-between border-b pb-2">
                            <span className="flex items-center gap-1.5 text-xs font-semibold">
                                <CreditCard className="size-4 text-muted-foreground" /> Voter ID
                            </span>
                            <span className="text-[10px] text-muted-foreground">Optional</span>
                        </div>
                        <Input
                            placeholder="ABC1234567" maxLength={20}
                            value={data.customer.voter_number}
                            onChange={(e) => setCustomerField('voter_number', e.target.value.toUpperCase().slice(0, 20))}
                            className="h-9 text-xs uppercase tracking-wider"
                        />
                        {fieldError('customer.voter_number') && (
                            <p className="text-xs text-destructive">{fieldError('customer.voter_number')}</p>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                            <CompactImageUploader
                                label="Front"
                                value={data.doc_voter_front ?? existingAssets['voter_front'] ?? null}
                                onChange={(f) => setFileField('doc_voter_front', f)}
                            />
                            <CompactImageUploader
                                label="Back"
                                value={data.doc_voter_back ?? existingAssets['voter_back'] ?? null}
                                onChange={(f) => setFileField('doc_voter_back', f)}
                            />
                        </div>
                        {(fieldError('doc_voter_front') || fieldError('doc_voter_back')) && (
                            <p className="text-xs text-destructive">
                                {fieldError('doc_voter_front') ?? fieldError('doc_voter_back')}
                            </p>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );

    // ── Card 1 — Supplier variant: no photo, no ID numbers; KYC docs only ──

    const supplierCard1 = (
        <Card className="border-primary/40 bg-primary/5 shadow-sm">
            <CardHeader className="border-b border-border/50 pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Landmark className="size-5 text-primary" />
                    Supplier Information
                </CardTitle>
                <CardDescription>Borrower details from the purchase invoice. Suppliers carry no photo or ID numbers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
                <div className="grid max-w-2xl grid-cols-1 gap-4 md:grid-cols-2">
                    <Field
                        id="supplier_name" label="Supplier Name" required placeholder="Supplier name"
                        value={data.supplier.name}
                        onChange={(e) => setSupplierField('name', e.target.value)}
                        error={fieldError('supplier.name')}
                    />
                    <Field
                        id="supplier_phone" label="Phone" type="tel" placeholder="Contact number"
                        value={data.supplier.phone}
                        onChange={(e) => setSupplierField('phone', e.target.value)}
                        error={fieldError('supplier.phone')}
                    />
                </div>
                <div className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-center gap-1.5 border-b pb-2">
                        <ShieldCheck className="size-4 text-primary" />
                        <span className="text-xs font-semibold">KYC Documents</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                        <CompactImageUploader label="Aadhaar Front" value={data.doc_aadhaar_front} onChange={(f) => setFileField('doc_aadhaar_front', f)} />
                        <CompactImageUploader label="Aadhaar Back" value={data.doc_aadhaar_back} onChange={(f) => setFileField('doc_aadhaar_back', f)} />
                        <CompactImageUploader label="PAN Document" value={data.doc_pan} onChange={(f) => setFileField('doc_pan', f)} />
                        <CompactImageUploader label="Voter Front" value={data.doc_voter_front} onChange={(f) => setFileField('doc_voter_front', f)} />
                        <CompactImageUploader label="Voter Back" value={data.doc_voter_back} onChange={(f) => setFileField('doc_voter_back', f)} />
                    </div>
                    {(['doc_aadhaar_front', 'doc_aadhaar_back', 'doc_pan', 'doc_voter_front', 'doc_voter_back'] as const)
                        .map((k) => fieldError(k))
                        .find(Boolean) && (
                        <p className="text-xs text-destructive">
                            {(['doc_aadhaar_front', 'doc_aadhaar_back', 'doc_pan', 'doc_voter_front', 'doc_voter_back'] as const)
                                .map((k) => fieldError(k))
                                .find(Boolean)}
                        </p>
                    )}
                </div>
            </CardContent>
        </Card>
    );

    // ── Card 2 — Contact & Address ──

    const hasAddressOnFile = !!party?.address;

    const contactCard = (
        <Card className="shadow-sm">
            <CardHeader className="border-b border-border/50 pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <MapPin className="size-5 text-primary" />
                    {isSupplier ? 'Supplier Contact & Address' : 'Customer Contact & Address'}
                </CardTitle>
                <CardDescription>
                    {isSupplier ? 'Contact and business location.' : 'Secondary contact and residential location.'}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
                {!isSupplier && (
                    <div className="max-w-xs space-y-1.5">
                        <Label htmlFor="phone_secondary" className="text-xs font-semibold">
                            Alternate Phone <span className="font-normal text-muted-foreground">(Optional)</span>
                        </Label>
                        <div className="relative">
                            <PhoneIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="phone_secondary" type="tel" placeholder="Alternative contact number"
                                maxLength={10} inputMode="numeric"
                                value={data.customer.phone_secondary}
                                onChange={(e) => setCustomerField('phone_secondary', e.target.value.replace(/\D/g, '').slice(0, 10))}
                                className="h-9 pl-8 text-xs"
                            />
                        </div>
                        {fieldError('customer.phone_secondary') && (
                            <p className="text-xs text-destructive">{fieldError('customer.phone_secondary')}</p>
                        )}
                    </div>
                )}
                {!isSupplier && <Separator />}
                {hasAddressOnFile && (
                    <div className="space-y-0.5">
                        <p className="text-xs font-semibold">{isSupplier ? 'Supplier Address' : 'Customer Address'}</p>
                        <p className="text-[11px] text-muted-foreground">
                            Shown as on file. Only edit if it has changed — saves a new address record and preserves the old one.
                        </p>
                    </div>
                )}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <Field
                        id="addr_village" label="Village / Street / Area" required
                        icon={<MapPin className="size-3.5" />} placeholder="Area, street, or locality"
                        value={data.address.village_or_area}
                        onChange={(e) => setAddressField('village_or_area', e.target.value)}
                        error={fieldError('address.village_or_area')}
                    />
                    <Field
                        id="addr_po" label="Post Office (P.O)" required
                        icon={<Building2 className="size-3.5" />} placeholder="Post office name"
                        value={data.address.post_office}
                        onChange={(e) => setAddressField('post_office', e.target.value)}
                        error={fieldError('address.post_office')}
                    />
                    <Field
                        id="addr_ps" label="Police Station (P.S)" required
                        icon={<Building2 className="size-3.5" />} placeholder="Police station"
                        value={data.address.police_station}
                        onChange={(e) => setAddressField('police_station', e.target.value)}
                        error={fieldError('address.police_station')}
                    />
                    <Field
                        id="addr_district" label="District" required
                        icon={<MapIcon className="size-3.5" />} placeholder="District name"
                        value={data.address.district}
                        onChange={(e) => setAddressField('district', e.target.value)}
                        error={fieldError('address.district')}
                    />
                    <Field
                        id="addr_pin" label="PIN Code" required
                        placeholder="6-digit PIN" inputMode="numeric" maxLength={6}
                        value={data.address.postal_code}
                        onChange={(e) => setAddressField('postal_code', e.target.value.replace(/\D/g, '').slice(0, 6))}
                        error={fieldError('address.postal_code')}
                    />
                    <div className="space-y-1.5">
                        <Label htmlFor="addr_state" className="text-xs font-semibold">
                            State <span className="text-destructive">*</span>
                        </Label>
                        <div className="relative">
                            <MapIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Select value={data.address.state} onValueChange={(v) => setAddressField('state', v)}>
                                <SelectTrigger id="addr_state" className="h-9 pl-8 text-xs">
                                    <SelectValue placeholder="Select state" />
                                </SelectTrigger>
                                <SelectContent>
                                    {indianStates.map((s) => (
                                        <SelectItem key={s} value={s}>{s}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {fieldError('address.state') && (
                            <p className="text-xs text-destructive">{fieldError('address.state')}</p>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );

    // ── Card 3 — Device & Invoice (read-only from the invoice) ──

    const inv = activeInvoice as InvoicePayload;
    const invoiceDateLabel = inv.invoice_date ? format(parseLocalDate(inv.invoice_date), 'dd MMM yyyy') : '—';

    const deviceCard = (
        <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Smartphone className="size-5 text-primary" />
                    Mobile Device & Invoice
                </CardTitle>
                <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={resetToLoader}>
                    Load a different invoice
                </Button>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Invoice No.</Label>
                        <div className="relative">
                            <FileText className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input value={inv.invoice_number} readOnly className="h-9 cursor-not-allowed bg-muted/30 pl-8 font-mono text-xs" />
                        </div>
                    </div>
                    <Field id="inv_identity" label="Barcode" value={inv.identity} readOnly className="cursor-not-allowed bg-muted/30 font-mono" />
                    <Field id="inv_date" label="Invoice Date" value={invoiceDateLabel} readOnly className="cursor-not-allowed bg-muted/30" />
                </div>

                <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b bg-muted/40 text-left text-[11px] uppercase text-muted-foreground">
                                <th className="px-3 py-2 font-semibold">Item</th>
                                <th className="px-3 py-2 font-semibold">IMEI 1</th>
                                <th className="px-3 py-2 font-semibold">IMEI 2</th>
                                <th className="px-3 py-2 font-semibold">Serial</th>
                                <th className="px-3 py-2 text-right font-semibold">Qty</th>
                                <th className="px-3 py-2 text-right font-semibold">Unit Price</th>
                                <th className="px-3 py-2 text-right font-semibold">Line Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {inv.items.map((item, i) => (
                                <tr key={i} className="border-b last:border-0">
                                    <td className="px-3 py-2 font-medium">{item.label}</td>
                                    <td className="px-3 py-2 font-mono">{item.imei1 ?? '—'}</td>
                                    <td className="px-3 py-2 font-mono">{item.imei2 ?? '—'}</td>
                                    <td className="px-3 py-2 font-mono">{item.serial_number ?? '—'}</td>
                                    <td className="px-3 py-2 text-right">{item.quantity}</td>
                                    <td className="px-3 py-2 text-right">₹{fmt(item.unit_price)}</td>
                                    <td className="px-3 py-2 text-right font-semibold">₹{fmt(item.line_total)}</td>
                                </tr>
                            ))}
                            {inv.items.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">
                                        No line items on this invoice.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="flex items-center justify-end gap-6 text-sm">
                    <span className="text-muted-foreground">
                        Grand Total <strong className="text-foreground">₹{fmt(inv.grand_total)}</strong>
                    </span>
                    <span className="text-muted-foreground">
                        Due Amount <strong className="text-primary">₹{fmt(inv.due_amount)}</strong>
                    </span>
                </div>
            </CardContent>
        </Card>
    );

    // ── Card 4 — Financial Terms & Schedule ──

    const tenureSelectValue = tenureCustom ? '__custom' : data.tenure_months;

    const termsCard = (
        <Card className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border/50 pb-4">
                <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <IndianRupee className="size-5 text-primary" />
                        Financial Terms & Schedule
                    </CardTitle>
                    <CardDescription>
                        Interest is calculated at a fixed rate of {defaults.interest_rate}% per month.
                    </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                    <Label className="whitespace-nowrap text-xs font-medium text-muted-foreground">
                        Loan Date <span className="text-destructive">*</span>
                    </Label>
                    <Popover open={loanDateOpen} onOpenChange={setLoanDateOpen}>
                        <PopoverTrigger asChild>
                            <Button type="button" variant="outline" className="h-8 w-36 justify-start pl-2.5 text-left text-xs font-normal">
                                <CalendarIcon className="mr-2 size-3.5 text-muted-foreground" />
                                {data.disbursed_date ? format(selectedLoanDate, 'MMM dd, yyyy') : 'Pick date'}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                            <Calendar mode="single" selected={selectedLoanDate} onSelect={handleLoanDateChange} />
                        </PopoverContent>
                    </Popover>
                    {fieldError('disbursed_date') && (
                        <p className="text-xs text-destructive">{fieldError('disbursed_date')}</p>
                    )}
                </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-4">
                <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-4">
                    <div className="space-y-2">
                        <Label htmlFor="principal_amount" className="text-xs font-semibold">
                            Principal (₹) <span className="text-destructive">*</span>
                        </Label>
                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-xs font-bold text-muted-foreground">₹</span>
                            <Input
                                id="principal_amount" type="number" min="0.01" step="0.01"
                                placeholder="25000" value={data.principal_amount}
                                onChange={(e) => set('principal_amount', e.target.value)}
                                className="h-9 pl-7 text-xs"
                            />
                        </div>
                        {fieldError('principal_amount')
                            ? <p className="text-xs font-medium text-destructive">{fieldError('principal_amount')}</p>
                            : <p className="text-[11px] text-muted-foreground">Amount financed — defaults to the invoice due.</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="down_payment" className="text-xs font-semibold">
                            Down Payment (₹) <span className="text-destructive">*</span>
                        </Label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <span className="absolute left-3 top-2.5 text-xs font-bold text-muted-foreground">₹</span>
                                <Input
                                    id="down_payment" type="number" min="0" step="0.01"
                                    placeholder="0" value={data.down_payment}
                                    onChange={(e) => set('down_payment', e.target.value)}
                                    className={cn('h-9 pl-7 text-xs', downPaymentExceeds && 'border-destructive')}
                                />
                            </div>
                            <Select value={data.down_payment_mode} onValueChange={(v) => set('down_payment_mode', v)}>
                                <SelectTrigger className="h-9 w-28 shrink-0 text-xs" aria-label="Down payment mode">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PAYMENT_MODES.map((m) => (
                                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {downPaymentExceeds
                            ? <p className="text-xs font-medium text-destructive">Down payment cannot exceed device price.</p>
                            : fieldError('down_payment')
                                ? <p className="text-xs font-medium text-destructive">{fieldError('down_payment')}</p>
                                : <p className="text-[11px] text-muted-foreground">Initial payment collected upfront.</p>}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="tenure_months" className="text-xs font-semibold">
                            Tenure <span className="text-destructive">*</span>
                        </Label>
                        {tenureCustom ? (
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Input
                                        id="tenure_months" type="number" min={1} max={84}
                                        placeholder="1–84" value={data.tenure_months}
                                        onChange={(e) => {
                                            const raw = e.target.value;
                                            if (raw === '' || /^\d+$/.test(raw)) {
                                                const num = parseInt(raw, 10);
                                                if (raw === '' || (num >= 1 && num <= 84)) set('tenure_months', raw);
                                            }
                                        }}
                                        className="h-9 pr-16 text-xs"
                                    />
                                    <span className="pointer-events-none absolute right-3 top-2.5 select-none text-xs font-medium text-muted-foreground">
                                        Months
                                    </span>
                                </div>
                                <Button
                                    type="button" variant="outline" className="h-9 px-3 text-xs"
                                    onClick={() => { setTenureCustom(false); set('tenure_months', '12'); }}
                                >
                                    Reset
                                </Button>
                            </div>
                        ) : (
                            <Select
                                value={tenureSelectValue}
                                onValueChange={(v) => {
                                    if (v === '__custom') { setTenureCustom(true); return; }
                                    set('tenure_months', v);
                                }}
                            >
                                <SelectTrigger id="tenure_months" className="h-9 w-full text-xs">
                                    <SelectValue placeholder="Select tenure" />
                                </SelectTrigger>
                                <SelectContent>
                                    {TENURE_PRESETS.map((m) => (
                                        <SelectItem key={m} value={m}>{m} Months</SelectItem>
                                    ))}
                                    <SelectItem value="__custom" className="font-medium text-primary focus:text-primary">
                                        Custom Value…
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        )}
                        {fieldError('tenure_months')
                            ? <p className="text-xs font-medium text-destructive">{fieldError('tenure_months')}</p>
                            : <p className="text-[11px] text-muted-foreground">Loan repayment duration (1–84 months).</p>}
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-semibold">
                            First EMI Billing Date <span className="text-destructive">*</span>
                        </Label>
                        <EmiDatePicker
                            selectedDate={firstEmiAsDate}
                            allowedDays={allowedDays}
                            primaryDay={primaryDay}
                            isRolling={isRolling}
                            onChange={handleEmiDateChange}
                            error={fieldError('first_emi_date')}
                            disabled={processing}
                            monthsAhead={6}
                        />
                        {isRolling && (
                            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <Info className="size-3" /> Rolling 30-day cycle — subsequent EMIs every 30 days.
                            </p>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="financer_id" className="text-xs font-semibold">
                            Financer <span className="text-destructive">*</span>
                        </Label>
                        {noFinancer ? (
                            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                                <p className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                                    <TriangleAlert className="size-3.5 shrink-0" />
                                    No active financer found for this store — add one before disbursing.
                                </p>
                            </div>
                        ) : (
                            <>
                                <Select value={data.financer_id} onValueChange={(v) => set('financer_id', v)}>
                                    <SelectTrigger id="financer_id" className="h-9 w-full text-xs">
                                        <SelectValue placeholder="Select financer" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {financers.map((f) => (
                                            <SelectItem key={f.id} value={String(f.id)}>
                                                {f.name}{f.type ? ` · ${f.type}` : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {fieldError('financer_id') && (
                                    <p className="text-xs font-medium text-destructive">{fieldError('financer_id')}</p>
                                )}
                            </>
                        )}
                    </div>
                    <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="notes" className="text-xs font-semibold">
                            Notes <span className="ml-1 text-[10px] font-normal text-muted-foreground">(Optional)</span>
                        </Label>
                        <Textarea
                            id="notes" rows={2} placeholder="Disbursal notes…"
                            value={data.notes} onChange={(e) => set('notes', e.target.value)}
                            className="text-xs"
                        />
                        {fieldError('notes') && (
                            <p className="text-xs font-medium text-destructive">{fieldError('notes')}</p>
                        )}
                    </div>
                </div>

                {feeNum > 0 && (
                    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
                        <div className="space-y-0.5">
                            <Label className="text-sm font-medium">File Charge: ₹{fmt(feeNum)}</Label>
                            <p className="text-xs text-muted-foreground">
                                {data.file_charge_mode === 'upfront'
                                    ? 'Collected upfront — not included in monthly EMI.'
                                    : `Spread across all ${data.tenure_months} EMIs (₹${fmt(feeNum / (parseInt(data.tenure_months, 10) || 1))} / month).`}
                            </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                            <span className={cn('text-xs', data.file_charge_mode === 'upfront' ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                                Upfront
                            </span>
                            <Switch
                                checked={data.file_charge_mode === 'spread'}
                                onCheckedChange={(checked) => set('file_charge_mode', checked ? 'spread' : 'upfront')}
                            />
                            <span className={cn('text-xs', data.file_charge_mode === 'spread' ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                                Spread
                            </span>
                        </div>
                    </div>
                )}

                {hasFinancials && schedule && (
                    <div className={cn('space-y-4 rounded-xl border bg-muted/20 p-4 transition-opacity', isCalculating && 'opacity-60')}>
                        <div className="flex items-center justify-between border-b pb-2">
                            <span className="flex items-center gap-2 text-sm font-semibold">
                                <CheckCircle2 className="size-4 text-emerald-600" />
                                Financial Breakdown
                            </span>
                            <span className="text-xs text-muted-foreground">
                                @ {fmt(schedule.monthly_rate)}% / month
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-5">
                            {[
                                { label: 'Principal', value: `₹${fmt(schedule.principal)}`, className: '' },
                                {
                                    label: 'Total Interest',
                                    value: `₹${fmt(schedule.monthly_interest_amount)} × ${data.tenure_months} = ₹${fmt(schedule.total_interest)}`,
                                    className: 'text-amber-600',
                                },
                                ...(schedule.processing_fee > 0 ? [{
                                    label: `File Charge (${schedule.file_charge_mode})`,
                                    value: `₹${fmt(schedule.processing_fee)}`,
                                    className: '',
                                }] : []),
                                { label: 'Total Payable', value: `₹${fmt(schedule.total_payable)}`, className: 'text-emerald-600 font-bold' },
                                { label: 'Monthly EMI', value: `₹${fmt(schedule.base_emi)}`, className: 'text-primary font-bold' },
                            ].map(({ label, value, className }) => (
                                <div key={label} className="space-y-0.5 rounded-lg border bg-background p-2.5">
                                    <span className="block text-[10px] font-medium uppercase text-muted-foreground">{label}</span>
                                    <span className={cn('block text-sm font-semibold leading-tight text-foreground', className)}>{value}</span>
                                </div>
                            ))}
                        </div>

                        {schedule.schedule.length > 0 && (
                            <div className="space-y-2 border-t border-border/40 pt-3">
                                <div className="flex items-center justify-between text-xs font-semibold">
                                    <span>Installment Schedule ({schedule.schedule.length} EMIs)</span>
                                    <span className="text-[11px] font-normal text-muted-foreground">
                                        First: {schedule.schedule[0] ? format(parseLocalDate(schedule.schedule[0].due_date), 'dd MMM yyyy') : '—'}
                                    </span>
                                </div>
                                <div className="grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-6">
                                    {schedule.schedule.map((item) => (
                                        <div key={item.installment_no} className="space-y-0.5 rounded border p-2 text-[11px]">
                                            <div className="font-medium text-muted-foreground">EMI #{item.installment_no}</div>
                                            <div className="font-semibold leading-tight text-foreground">
                                                {format(parseLocalDate(item.due_date), 'dd MMM yyyy')}
                                            </div>
                                            <div className="font-bold text-primary">₹{fmt(item.total_due)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {hasFinancials && !schedule && !isCalculating && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Info className="size-3.5" /> Enter valid financial terms to preview the schedule.
                    </p>
                )}
            </CardContent>
        </Card>
    );

    // ── Page ──

    return (
        <>
            <Head title="Disburse New Loan" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="border-b border-border pb-4">
                    <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                        <ReceiptText className="size-6 text-primary" />
                        Disburse Mobile Financing Loan
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Register customer credentials, device identifiers, and set up the monthly EMI schedule.
                    </p>
                </div>

                {!activeInvoice ? (
                    <div className="mx-auto w-full max-w-md pt-6">
                        <Card className="shadow-sm">
                            <CardContent className="space-y-4 px-6 py-6">
                                <div className="flex flex-col items-center gap-2 text-center">
                                    <div className="flex size-11 items-center justify-center rounded-full bg-primary/10">
                                        <Search className="size-5 text-primary" />
                                    </div>
                                    <h3 className="text-base font-semibold">Find the sale invoice</h3>
                                    <p className="text-xs text-muted-foreground">
                                        Enter the invoice number or scan the barcode — the borrower, device and due amount load automatically.
                                    </p>
                                </div>
                                <form onSubmit={runLookup} className="space-y-2">
                                    <Input
                                        placeholder="Invoice number or barcode…"
                                        value={query}
                                        onChange={(e) => { setQuery(e.target.value); setLookupError(null); }}
                                        className="h-10 text-sm"
                                        autoFocus
                                    />
                                    {lookupError && (
                                        <p className="text-xs font-medium text-destructive">{lookupError}</p>
                                    )}
                                    <Button type="submit" className="w-full" disabled={!query.trim() || lookupBusy}>
                                        {lookupBusy ? (
                                            <>
                                                <Loader2 className="mr-2 size-4 animate-spin" /> Loading…
                                            </>
                                        ) : (
                                            'Load Invoice'
                                        )}
                                    </Button>
                                </form>
                            </CardContent>
                        </Card>
                    </div>
                ) : partyMissing ? (
                    <Card className="border-destructive/40 shadow-sm">
                        <CardContent className="space-y-4 px-6 py-6">
                            <div className="flex items-start gap-3">
                                <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
                                <div className="space-y-1">
                                    <p className="text-sm font-semibold">
                                        This invoice has no customer or supplier linked — a loan needs a borrower.
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        Invoice {inv.invoice_number} cannot be financed until a borrower is attached to it.
                                    </p>
                                </div>
                            </div>
                            <Button type="button" variant="outline" onClick={resetToLoader}>
                                Load a different invoice
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {isSupplier ? supplierCard1 : customerCard1}
                        {contactCard}
                        {deviceCard}
                        {termsCard}

                        <div className="flex items-center justify-end gap-4 pb-6 pt-2">
                            <Button type="button" variant="outline" onClick={() => window.history.back()} disabled={processing}>
                                Cancel
                            </Button>
                            <Button type="submit" size="lg" disabled={!canSubmit}>
                                {processing ? 'Disbursing…' : 'Disburse Loan Agreement'}
                            </Button>
                        </div>
                    </form>
                )}
            </div>
        </>
    );
}

function Field({
    id,
    label,
    required,
    icon,
    error,
    helper,
    className,
    ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & {
    id: string;
    label: React.ReactNode;
    required?: boolean;
    icon?: React.ReactNode;
    error?: string;
    helper?: string;
}) {
    return (
        <div className="space-y-1.5">
            <Label htmlFor={id} className="text-xs font-semibold">
                {label}
                {required && <span className="text-destructive"> *</span>}
            </Label>
            <div className="relative">
                {icon && (
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {icon}
                    </span>
                )}
                <Input
                    id={id}
                    {...rest}
                    className={cn('h-9 text-xs', icon && 'pl-8', className)}
                />
            </div>
            {error ? (
                <p className="text-xs text-destructive">{error}</p>
            ) : helper ? (
                <p className="text-[11px] text-muted-foreground">{helper}</p>
            ) : null}
        </div>
    );
}

Create.layout = {
    breadcrumbs: [
        { title: 'Loans', href: app.loans.index.url() },
        { title: 'New Loan Agreement', href: app.loans.create.url() },
    ],
};

