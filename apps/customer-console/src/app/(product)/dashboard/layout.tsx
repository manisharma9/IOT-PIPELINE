import { ProductShell } from "@/components/product-shell";
import { requireSession } from "@/lib/auth";

export default async function ProductDashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  return (
    <ProductShell
      session={{
        username: session.username,
        role: session.role,
        household_id: session.household_id,
        community_id: session.community_id
      }}
    >
      {children}
    </ProductShell>
  );
}

