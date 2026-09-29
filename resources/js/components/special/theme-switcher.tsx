import { useAppearance } from '@/hooks/use-appearance';
import { Button } from '@/components/ui/button';
import { Sun, Moon, Monitor } from 'lucide-react';

export function ThemeSwitcher() {
    const { appearance, updateAppearance } = useAppearance();

    const toggleTheme = () => {
        if (appearance === 'light') updateAppearance('dark');
        else updateAppearance('light');
    };

    return (
        <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-neutral-100"
            onClick={toggleTheme}
            title={`Theme: ${appearance}`}
        >
            {appearance === 'light' && <Sun className="h-4 w-4" />}
            {appearance === 'dark' && <Moon className="h-4 w-4" />}
            {appearance === 'system' && <Monitor className="h-4 w-4" />}
            <span className="sr-only">Toggle theme</span>
        </Button>
    );
}
