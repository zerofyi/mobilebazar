import { Head } from '@inertiajs/react';
import { PlaceholderPattern } from '@/components/ui/placeholder-pattern';
import { dashboard } from '@/routes';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { ArrowUpRightIcon, FolderCodeIcon } from 'lucide-react';

export default function Dashboard() {
    return (
        <>
            <Head title="Dashboard" />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* <Empty>
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                        <FolderCodeIcon />
                        </EmptyMedia>
                        <EmptyTitle>No Projects Yet</EmptyTitle>
                        <EmptyDescription>
                        You haven&apos;t created any projects yet. Get started by creating
                        your first project.
                        </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent className="flex-row justify-center gap-2">
                        <Button>Create Project</Button>
                        <Button variant="outline">Import Project</Button>
                    </EmptyContent>
                    <Button variant="link" className="text-muted-foreground" size="sm" asChild>
                        <a href="#">Learn More <ArrowUpRightIcon /></a>
                    </Button>
                </Empty> */}
            </div>
        </>
    );
}

Dashboard.layout = {
    breadcrumbs: [
        {
            title: 'Dashboard',
            href: dashboard(),
        },
    ],
};
