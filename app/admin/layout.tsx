import AdminNav from '@/components/admin/AdminNav';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-6 md:grid-cols-[190px_minmax(0,1fr)] md:gap-8"><AdminNav /><div className="min-w-0">{children}</div></div>;
}
