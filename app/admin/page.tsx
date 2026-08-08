import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const SECTIONS = [
  ['/admin/canciones', 'Canciones', 'Buscar, editar, desactivar y fusionar'], ['/admin/usuarios', 'Usuarios', 'Roles y estado de cuentas'],
  ['/admin/moderacion', 'Moderación', 'Reportes y propuestas de edición'], ['/admin/ia', 'Inteligencia Artificial', 'Proveedores, uso y límites'],
  ['/admin/fuentes', 'Fuentes externas', 'Catálogos y permisos de importación'], ['/admin/configuracion', 'Configuración', 'Ajustes generales en JSON'],
  ['/admin/contacto', 'Contacto', 'Mensajes y seguimiento']
] as const;

export default async function AdminDashboard() {
  const supabase = createServerSupabaseClient();
  const [songs, drafts, users, reports, proposals, contacts, ai] = await Promise.all([
    supabase.from('songs').select('id', { count: 'exact', head: true }).eq('is_deleted', false),
    supabase.from('songs').select('id', { count: 'exact', head: true }).in('status', ['draft', 'pending_review']).eq('is_deleted', false),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('song_reports').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('song_edit_proposals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('legal_contact_messages').select('id', { count: 'exact', head: true }).neq('status', 'closed'),
    supabase.from('song_ai_reviews').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 86400000).toISOString())
  ]);
  const stats = [
    ['/admin/canciones', 'Canciones activas', songs.count], ['/admin/canciones?status=draft&state=active', 'Borradores y pendientes', drafts.count],
    ['/admin/usuarios', 'Usuarios', users.count], ['/admin/moderacion', 'Reportes abiertos', reports.count],
    ['/admin/moderacion', 'Propuestas pendientes', proposals.count], ['/admin/contacto', 'Contactos activos', contacts.count],
    ['/admin/ia', 'Consultas IA (24h)', ai.count]
  ] as const;

  return <div className="space-y-8"><div><h1 className="text-3xl font-bold">Panel de administración</h1><p className="mt-1 text-sm text-gray-500">Resumen operativo y accesos a la gestión del sistema.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{stats.map(([href, label, value]) => <Link key={label} href={href} className="rounded-xl border border-gray-200 p-4 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-sm dark:border-gray-800"><div className="text-2xl font-bold">{value ?? 0}</div><div className="text-xs text-gray-500">{label}</div></Link>)}</div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{SECTIONS.map(([href, label, description]) => <Link key={href} href={href} className="group rounded-xl border border-gray-200 p-4 transition hover:border-primary hover:shadow-sm dark:border-gray-800"><div className="flex items-center justify-between"><span className="font-semibold group-hover:text-primary">{label}</span><span className="text-primary">→</span></div><div className="mt-1 text-xs text-gray-500">{description}</div></Link>)}</div>
  </div>;
}
