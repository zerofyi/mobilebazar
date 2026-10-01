import { Head, Link, usePage } from '@inertiajs/react';
import { dashboard, login, register } from '@/routes';
import AppLogoIcon from '@/components/app-logo-icon';

export default function Welcome() {
    const { auth } = usePage().props;

    return (
        <>
            <Head title="Welcome to Mobile Bazar" />

            <div className="flex min-h-screen flex-col items-center justify-between p-6 lg:p-8">
                {/* Header Navigation */}
                <header className="flex w-full max-w-4xl items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Link href="/">
                            <AppLogoIcon className="h-10 w-auto fill-current text-gray-800 dark:text-gray-200" />
                        </Link>
                    </div>

                    <nav className="flex items-center gap-4">
                        {auth.user ? (
                            <Link
                                href={dashboard()}
                                className="rounded px-4 py-2 text-sm font-medium hover:underline"
                            >
                                Dashboard
                            </Link>
                        ) : (
                            <>
                                <Link
                                    href={login()}
                                    className="rounded px-4 py-2 text-sm font-medium hover:underline"
                                >
                                    Log in
                                </Link>
                                <Link
                                    href={register()}
                                    className="rounded px-4 py-2 text-sm font-medium hover:underline"
                                >
                                    Register
                                </Link>
                            </>
                        )}
                    </nav>
                </header>

                {/* Main Content Area */}
                <main className="my-auto flex flex-col items-center text-center">
                    <AppLogoIcon className="mb-6 h-24 w-auto fill-current text-gray-900 dark:text-gray-100" />
                    <h1 className="text-3xl font-bold">Welcome to Mobile Bazar</h1>
                </main>

                {/* Footer */}
                <footer className="text-sm text-gray-500">
                    © {new Date().getFullYear()} Mobile Bazar
                </footer>
            </div>
        </>
    );
}
