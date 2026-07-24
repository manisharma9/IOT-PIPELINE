import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

export default async function ConsoleLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole(["technical_admin"]);
  return <AppShell username={session.username}>{children}</AppShell>;
}
