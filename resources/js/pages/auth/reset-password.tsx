import { useEffect, useState } from 'react';
import { Form, Head } from '@inertiajs/react';
import { Check, Eye, EyeOff, ShieldCheck } from 'lucide-react';

import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { update } from '@/routes/password';

type Props = {
    token: string;
    email: string;
    passwordRules: string;
};

export default function ResetPassword({ token, email, passwordRules }: Props) {
    const [password, setPassword] = useState('');
    const [passwordConfirmation, setPasswordConfirmation] = useState('');

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const [passwordMatchError, setPasswordMatchError] = useState('');

    // Password strength requirements matching Register.tsx
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

    // Real-time password matching check matching Register.tsx
    useEffect(() => {
        if (passwordConfirmation && password !== passwordConfirmation) {
            setPasswordMatchError('Passwords do not match.');
        } else {
            setPasswordMatchError('');
        }
    }, [password, passwordConfirmation]);

    return (
        <>
            <Head title="Reset password" />

            <Form
                {...update.form()}
                transform={(data) => ({ ...data, token, email })}
                resetOnSuccess={['password', 'password_confirmation']}
                disableWhileProcessing
                className="flex flex-col gap-6"
            >
                {({ processing, errors }) => (
                    <div className="grid gap-4">
                        {/* Email Address (Read-only) */}
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email Address</Label>
                            <Input
                                id="email"
                                type="email"
                                name="email"
                                autoComplete="email"
                                value={email}
                                className="mt-1 block w-full bg-muted opacity-80"
                                readOnly
                            />
                            <InputError message={errors.email} />
                        </div>

                        {/* Password Field */}
                        <div className="grid gap-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password">New Password</Label>
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
                                            isMet
                                                ? 'text-foreground font-medium'
                                                : 'text-muted-foreground'
                                        }`}
                                    >
                                        <Check
                                            className={`h-3.5 w-3.5 ${
                                                isMet ? 'text-emerald-500' : 'opacity-30'
                                            }`}
                                        />
                                        <span>{req.label}</span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Confirm Password Field */}
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
                            <InputError
                                message={passwordMatchError || errors.password_confirmation}
                            />
                        </div>

                        {/* Submit Button */}
                        <Button
                            type="submit"
                            className="mt-2 w-full"
                            tabIndex={3}
                            disabled={processing || Boolean(passwordMatchError)}
                            data-test="reset-password-button"
                        >
                            {processing && <Spinner />}
                            Reset Password
                        </Button>
                    </div>
                )}
            </Form>
        </>
    );
}

ResetPassword.layout = {
    title: 'Reset password',
    description: 'Please enter your new password below',
};
