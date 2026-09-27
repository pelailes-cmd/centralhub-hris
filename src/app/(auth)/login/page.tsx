import { AuthForm } from "@/components/auth-form";
import { isDemo } from "@/lib/supabase/server";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  return <AuthForm demo={isDemo()} notice={notice} />;
}
