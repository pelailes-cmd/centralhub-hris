import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/shared";
import Link from "next/link";
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <Logo />
      <p className="mt-12 text-sm font-medium text-primary">A little off the path</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">This page isn’t available.</h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
        The page may have moved, or this record isn’t available within your access permissions.
      </p>
      <Button asChild className="mt-7">
        <Link href="/">Back to your workspace</Link>
      </Button>
    </main>
  );
}
