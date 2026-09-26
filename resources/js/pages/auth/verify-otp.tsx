import { useEffect, useState } from 'react';
import { Form, Head, router } from '@inertiajs/react';
import { ShieldCheck, RotateCw, Edit3 } from 'lucide-react';

import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot,
} from '@/components/ui/input-otp';
import { resend, verify } from '@/routes/auth/otp';

type Props = {
    mobile: string;
    status?: string;
};

export default function VerifyOtp({ mobile, status }: Props) {
    const [timer, setTimer] = useState(60);
    const [canResend, setCanResend] = useState(false);
    const [code, setCode] = useState('');
    const [isResending, setIsResending] = useState(false);

    // Change Mobile Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newMobile, setNewMobile] = useState('');
    const [mobileError, setMobileError] = useState('');
    const [isUpdatingMobile, setIsUpdatingMobile] = useState(false);

    // Countdown Timer for Resend Button
    useEffect(() => {
        if (timer > 0) {
            const interval = setInterval(() => {
                setTimer((prev) => prev - 1);
            }, 1000);
            return () => clearInterval(interval);
        } else {
            setCanResend(true);
        }
    }, [timer]);

    const maskMobile = (num: string) => {
        const clean = num.replace(/[^0-9]/g, '');
        if (clean.length < 10) return num;
        return `+91 ******${clean.slice(-4)}`;
    };

    // Numbers-only handler for OTP
    const handleOtpChange = (value: string) => {
        const numericValue = value.replace(/[^0-9]/g, '');
        setCode(numericValue);
    };

    // Direct execution for Resend
    const handleResend = () => {
        if (!canResend || isResending) return;

        setIsResending(true);
        router.post(
            resend.url(),
            {},
            {
                onFinish: () => {
                    setIsResending(false);
                    setTimer(60);
                    setCanResend(false);
                },
            }
        );
    };

    // Handle Mobile Update Submission
    const handleUpdateMobile = (e: React.FormEvent) => {
        e.preventDefault();
        setMobileError('');

        const cleanMobile = newMobile.replace(/[^0-9]/g, '');
        if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
            setMobileError('Please enter a valid 10-digit Indian mobile number.');
            return;
        }

        setIsUpdatingMobile(true);
        router.post(
            '/auth/update-mobile',
            { mobile: cleanMobile },
            {
                onSuccess: () => {
                    setIsModalOpen(false);
                    setNewMobile('');
                    setTimer(60);
                    setCanResend(false);
                },
                onError: (errs) => {
                    if (errs.mobile) setMobileError(errs.mobile);
                },
                onFinish: () => setIsUpdatingMobile(false),
            }
        );
    };

    return (
        <>
            <Head title="Verify OTP" />

            {/* Header Section */}
            <div className="flex flex-col items-center justify-center space-y-2 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <ShieldCheck className="h-6 w-6" />
                </div>
                <h1 className="text-xl font-semibold tracking-tight">Verify Your Mobile Number</h1>
                <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                    <span>Code sent to</span>
                    <span className="font-medium text-foreground">{maskMobile(mobile)}</span>
                    <button
                        type="button"
                        onClick={() => setIsModalOpen(true)}
                        className="ml-1 inline-flex items-center text-xs font-medium text-primary hover:underline"
                    >
                        <Edit3 className="mr-0.5 h-3 w-3" />
                        Change
                    </button>
                </div>
            </div>

            {/* OTP Form Submission */}
            <Form {...verify.form()} className="mt-6 flex flex-col gap-6">
                {({ processing, errors }) => (
                    <>
                        <input type="hidden" name="code" value={code} />

                        <div className="flex flex-col items-center gap-4">
                            <div className="flex flex-col items-center justify-center gap-2 text-center">
                                <Label htmlFor="code" className="sr-only">
                                    One-Time Password
                                </Label>

                                {/* Centered InputOTP with Separated Slots */}
                                <InputOTP
                                    maxLength={6}
                                    value={code}
                                    onChange={handleOtpChange}
                                    autoFocus
                                >
                                    <InputOTPGroup className="gap-2">
                                        <InputOTPSlot index={0} className="rounded-md border" />
                                        <InputOTPSlot index={1} className="rounded-md border" />
                                        <InputOTPSlot index={2} className="rounded-md border" />
                                        <InputOTPSlot index={3} className="rounded-md border" />
                                        <InputOTPSlot index={4} className="rounded-md border" />
                                        <InputOTPSlot index={5} className="rounded-md border" />
                                    </InputOTPGroup>
                                </InputOTP>

                                <InputError message={errors.code} className="mt-2 text-center" />
                            </div>

                            <Button
                                type="submit"
                                className="mt-2 w-full"
                                disabled={processing || code.length !== 6}
                            >
                                {processing && <Spinner />}
                                Verify & Continue
                            </Button>
                        </div>
                    </>
                )}
            </Form>

            {/* Resend Actions */}
            <div className="mt-6 flex flex-col items-center justify-center space-y-2 text-center text-sm">
                {status && (
                    <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        {status}
                    </p>
                )}

                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Didn't receive code?</span>
                    <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 font-medium text-primary"
                        disabled={!canResend || isResending}
                        onClick={handleResend}
                    >
                        {isResending ? (
                            <Spinner />
                        ) : (
                            <span className="flex items-center gap-1">
                                <RotateCw className="h-3.5 w-3.5" />
                                Resend Code
                            </span>
                        )}
                    </Button>
                </div>

                {!canResend && (
                    <p className="text-xs text-muted-foreground">
                        Resend available in <span className="font-mono text-foreground">{timer}s</span>
                    </p>
                )}
            </div>

            {/* Change Mobile Modal */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <form onSubmit={handleUpdateMobile}>
                        <DialogHeader>
                            <DialogTitle>Update Mobile Number</DialogTitle>
                            <DialogDescription>
                                Enter your new 10-digit mobile number. We will send a new verification code to this number.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="new_mobile">Mobile Number</Label>
                                <div className="flex rounded-md shadow-sm">
                                    <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                                        +91
                                    </span>
                                    <Input
                                        id="new_mobile"
                                        type="tel"
                                        maxLength={10}
                                        placeholder="9876543210"
                                        className="rounded-l-none"
                                        value={newMobile}
                                        onChange={(e) => setNewMobile(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                                <InputError message={mobileError} />
                            </div>
                        </div>

                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsModalOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isUpdatingMobile}>
                                {isUpdatingMobile && <Spinner />}
                                Update & Resend
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}

VerifyOtp.layout = {
    title: 'Mobile Verification',
    description: 'Enter the 6-digit OTP sent to your phone',
};
