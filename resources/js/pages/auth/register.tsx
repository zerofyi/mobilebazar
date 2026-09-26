import { useEffect, useState } from 'react';
import { Form, Head } from '@inertiajs/react';
import { Check, Eye, EyeOff, ShieldCheck, User, ArrowLeft, ArrowRight } from 'lucide-react';

import InputError from '@/components/input-error';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { login } from '@/routes';
import { store } from '@/routes/register';

type Props = {
    passwordRules: string;
};

export default function Register({ passwordRules }: Props) {
    const [step, setStep] = useState<1 | 2>(1);

    // Controlled inputs
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [mobile, setMobile] = useState('');
    const [password, setPassword] = useState('');
    const [passwordConfirmation, setPasswordConfirmation] = useState('');

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // Validation messages
    const [step1ClientError, setStep1ClientError] = useState('');
    const [passwordMatchError, setPasswordMatchError] = useState('');

    // Password strength requirements
    const requirements = [
        { re: /.{8,}/, label: 'At least 8 characters' },
        { re: /[0-9]/, label: 'At least 1 number' },
        { re: /[a-z]/, label: 'At least 1 lowercase letter' },
        { re: /[A-Z]/, label: 'At least 1 uppercase letter' },
        { re: /[$&+,:;=?@#|'<>.^*()%!-]/, label: 'At least 1 special character' },
    ];

    const strengthScore = requirements.reduce(
        (acc, req) => (req.re.test(password) ? acc + 1 : acc),
        0
    );

    const getStrengthColor = () => {
        if (strengthScore <= 2) return 'bg-destructive';
        if (strengthScore <= 4) return 'bg-amber-500';
        return 'bg-emerald-500';
    };

    const getStrengthText = () => {
        if (!password) return '';
        if (strengthScore <= 2) return 'Weak password';
        if (strengthScore <= 4) return 'Moderate password';
        return 'Strong password';
    };

    // Real-time password matching check
    useEffect(() => {
        if (passwordConfirmation && password !== passwordConfirmation) {
            setPasswordMatchError('Passwords do not match.');
        } else {
            setPasswordMatchError('');
        }
    }, [password, passwordConfirmation]);

    // Validate Step 1 before proceeding
    const handleNextStep = () => {
        setStep1ClientError('');

        if (!name.trim()) {
            setStep1ClientError('Please enter your full name.');
            return;
        }

        if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
            setStep1ClientError('Please enter a valid email address.');
            return;
        }

        const cleanMobile = mobile.replace(/[^0-9]/g, '');
        if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
            setStep1ClientError('Please enter a valid 10-digit Indian mobile number.');
            return;
        }

        setStep(2);
    };

    return (
        <>
            <Head title="Create an Account" />

            {/* Stepper Header */}
            <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span>Step {step} of 2</span>
                    <span>{step === 1 ? 'Personal Info' : 'Security Setup'}</span>
                </div>
                <Progress value={step === 1 ? 50 : 100} className="h-1.5" />
            </div>

            <Form
                {...store.form()}
                resetOnSuccess={['password', 'password_confirmation']}
                disableWhileProcessing
                className="flex flex-col gap-6"
            >
                {({ processing, errors }) => {
                    // Automatically revert to Step 1 if backend validation fails on Step 1 fields
                    useEffect(() => {
                        if (errors.name || errors.email || errors.mobile) {
                            setStep(1);
                        }
                    }, [errors]);

                    return (
                        <>
                            {/* Hidden Inputs preserve Step 1 state in DOM when rendered in Step 2 */}
                            {step === 2 && (
                                <>
                                    <input type="hidden" name="name" value={name} />
                                    <input type="hidden" name="email" value={email} />
                                    <input type="hidden" name="mobile" value={mobile} />
                                </>
                            )}

                            {/* STEP 1: Personal Info */}
                            {step === 1 && (
                                <div className="grid gap-4">
                                    <div className="grid gap-2">
                                        <Label htmlFor="name">Full Name</Label>
                                        <div className="relative">
                                            <Input
                                                id="name"
                                                name="name"
                                                type="text"
                                                required
                                                autoFocus
                                                tabIndex={1}
                                                autoComplete="name"
                                                placeholder="John Doe"
                                                className="pl-9"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                            />
                                            <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <InputError message={errors.name} />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="email">Email Address</Label>
                                        <Input
                                            id="email"
                                            name="email"
                                            type="email"
                                            required
                                            tabIndex={2}
                                            autoComplete="email"
                                            placeholder="name@example.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                        />
                                        <InputError message={errors.email} />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="mobile">Mobile Number</Label>
                                        <div className="flex rounded-md shadow-sm">
                                            <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                                                +91
                                            </span>
                                            <Input
                                                id="mobile"
                                                name="mobile"
                                                type="tel"
                                                required
                                                tabIndex={3}
                                                maxLength={10}
                                                autoComplete="tel"
                                                placeholder="9876543210"
                                                className="rounded-l-none"
                                                value={mobile}
                                                onChange={(e) => setMobile(e.target.value)}
                                            />
                                        </div>
                                        <InputError message={errors.mobile} />
                                    </div>

                                    {step1ClientError && (
                                        <InputError message={step1ClientError} className="mt-1" />
                                    )}

                                    <Button
                                        type="button"
                                        className="mt-2 w-full gap-2"
                                        tabIndex={4}
                                        onClick={handleNextStep}
                                    >
                                        Continue to Password
                                        <ArrowRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}

                            {/* STEP 2: Password Setup */}
                            {step === 2 && (
                                <div className="grid gap-4">
                                    <div className="grid gap-2">
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="password">Create Password</Label>
                                            <span className="text-xs font-medium text-muted-foreground">
                                                {getStrengthText()}
                                            </span>
                                        </div>
                                        <div className="relative">
                                            <Input
                                                id="password"
                                                name="password"
                                                type={showPassword ? 'text' : 'password'}
                                                required
                                                autoFocus
                                                tabIndex={1}
                                                autoComplete="new-password"
                                                placeholder="••••••••"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                passwordrules={passwordRules}
                                                className="pr-10"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                                            >
                                                {showPassword ? (
                                                    <EyeOff className="h-4 w-4" />
                                                ) : (
                                                    <Eye className="h-4 w-4" />
                                                )}
                                            </button>
                                        </div>

                                        {/* Password Strength Meter */}
                                        {password && (
                                            <div className="mt-1.5 flex h-1.5 gap-1">
                                                {[1, 2, 3, 4, 5].map((level) => (
                                                    <div
                                                        key={level}
                                                        className={`h-full flex-1 rounded-full transition-colors ${
                                                            level <= strengthScore
                                                                ? getStrengthColor()
                                                                : 'bg-muted'
                                                        }`}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                        <InputError message={errors.password} />
                                    </div>

                                    {/* Password Criteria Checklist */}
                                    <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1.5">
                                        <div className="flex items-center gap-1.5 font-medium text-muted-foreground mb-2">
                                            <ShieldCheck className="h-3.5 w-3.5" />
                                            Password Requirements
                                        </div>
                                        {requirements.map((req, idx) => {
                                            const isMet = req.re.test(password);
                                            return (
                                                <div
                                                    key={idx}
                                                    className={`flex items-center gap-2 transition-colors ${
                                                        isMet ? 'text-foreground font-medium' : 'text-muted-foreground'
                                                    }`}
                                                >
                                                    <Check className={`h-3.5 w-3.5 ${isMet ? 'text-emerald-500' : 'opacity-30'}`} />
                                                    <span>{req.label}</span>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="grid gap-2">
                                        <Label htmlFor="password_confirmation">Confirm Password</Label>
                                        <div className="relative">
                                            <Input
                                                id="password_confirmation"
                                                name="password_confirmation"
                                                type={showConfirmPassword ? 'text' : 'password'}
                                                required
                                                tabIndex={2}
                                                autoComplete="new-password"
                                                placeholder="••••••••"
                                                value={passwordConfirmation}
                                                onChange={(e) => setPasswordConfirmation(e.target.value)}
                                                className="pr-10"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                                            >
                                                {showConfirmPassword ? (
                                                    <EyeOff className="h-4 w-4" />
                                                ) : (
                                                    <Eye className="h-4 w-4" />
                                                )}
                                            </button>
                                        </div>
                                        <InputError message={passwordMatchError || errors.password_confirmation} />
                                    </div>

                                    <div className="flex items-center gap-3 mt-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setStep(1)}
                                            tabIndex={4}
                                            className="w-1/3 gap-1"
                                        >
                                            <ArrowLeft className="h-4 w-4" />
                                            Back
                                        </Button>

                                        <Button
                                            type="submit"
                                            className="w-2/3 gap-2"
                                            tabIndex={3}
                                            disabled={processing || Boolean(passwordMatchError)}
                                            data-test="register-user-button"
                                        >
                                            {processing && <Spinner />}
                                            Complete Registration
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <div className="text-center text-sm text-muted-foreground">
                                Already have an account?{' '}
                                <TextLink href={login()} tabIndex={5}>
                                    Log in
                                </TextLink>
                            </div>
                        </>
                    );
                }}
            </Form>
        </>
    );
}

Register.layout = {
    title: 'Create your account',
    description: 'Enter your details below to set up your account',
};
