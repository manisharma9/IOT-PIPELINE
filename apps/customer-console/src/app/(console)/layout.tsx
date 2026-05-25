import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth";

export default async function ConsoleLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  return <AppShell username={session.username}>{children}</AppShell>;
}
