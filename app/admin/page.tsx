import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const ADMIN_SECTIONS = [
  { href: '/admin/canciones', label: 'Canciones', description: 'Buscar, editar, desactivar, fusionar' },
  { href: '/admin/usuarios', label: 'Usuarios', description: 'Roles y estado de cuentas' },
  { href: '/admin/moderacion', label: 'Moderación', description: 'Reportes y propuestas de edición' },
  { href: '/admin/ia', label: 'Inteligencia Artificial', description: 'Proveedor, modelo y límites' },
  { href: '/admin/fuentes', label: 'Fuentes externas', description: 'Proveedores de búsqueda web' },
  { href: '/admin/configuracion', label: 'Configuración', description: 'Ajustes generales de la app' },
  { href: '/admin/contacto', label: 'Contacto', description: 'Mensajes, privacidad y derechos de autor' }
];

export default async function AdminDashboard() {
  const supabase = createServerSupabaseClient();

  const [{ count: totalSongs }, { count: pendingSongs }, { count: reportedSongs }, { count: totalUsers }, { count: openReports }, { count: aiReviewsToday }] =
    await Promise.all([
      supabase.from('songs').select('id', { count: 'exact', head: true }).eq('is_deleted', false),
      supabase.from('songs').select('id', { count: 'exact', head: true }).eq('status', 'pending_review'),
      supabase.from('songs').select('id', { count: 'exact', head: true }).eq('status', 'reported'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('song_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
      supabase
        .from('song_ai_reviews')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    ]);

  const stats = [
    { label: 'Canciones totales', value: totalSongs ?? 0 },
    { label: 'Pendientes de revisión', value: pendingSongs ?? 0 },
    { label: 'Reportadas', value: reportedSongs ?? 0 },
    { label: 'Usuarios registrados', value: totalUsers ?? 0 },
    { label: 'Reportes abiertos', value: openReports ?? 0 },
    { label: 'Consultas de IA (24h)', value: aiReviewsToday ?? 0 }
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Panel de administración</h1>

      <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="border border-gray-200 dark:border-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-xs text-gray-500">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ADMIN_SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="border border-gray-200 dark:border-gray-800 rounded-lg p-4 hover:border-primary">
            <div className="font-medium">{s.label}</div>
            <div className="text-xs text-gray-500 mt-1">{s.description}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
