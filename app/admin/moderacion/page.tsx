import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import ModerationActions from '@/components/admin/ModerationActions';

export default async function ModerationPage() {
  const supabase = createServerSupabaseClient();
  const [{ data: reports, error: reportsError }, { data: proposals, error: proposalsError }] = await Promise.all([
    supabase.from('song_reports').select('id, reason, details, status, created_at, songs(title, slug)').eq('status', 'open').order('created_at', { ascending: false }),
    supabase.from('song_edit_proposals').select('id, change_summary, proposed_content, status, created_at, songs(title, slug)').eq('status', 'pending').order('created_at', { ascending: false })
  ]);

  return <div className="space-y-8">
    <div><h1 className="text-2xl font-bold">Moderación</h1><p className="mt-1 text-sm text-gray-500">Resuelve reportes y revisa propuestas antes de modificar el catálogo.</p></div>
    <section><h2 className="mb-3 font-semibold">Reportes abiertos <span className="text-sm font-normal text-gray-400">({reports?.length || 0})</span></h2>{reportsError && <p className="mb-2 text-sm text-red-600">{reportsError.message}</p>}{!reports?.length && !reportsError && <p className="rounded-xl border border-dashed p-5 text-sm text-gray-500">Sin reportes pendientes.</p>}<ul className="space-y-2">{reports?.map((report: any) => <li key={report.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><Link href={`/canciones/${report.songs?.slug}`} className="font-medium hover:text-primary">{report.songs?.title || 'Canción no disponible'}</Link><p className="text-xs font-medium text-gray-500">{report.reason}</p>{report.details && <p className="mt-1 whitespace-pre-wrap text-xs text-gray-600 dark:text-gray-300">{report.details}</p>}</div><ModerationActions type="report" id={report.id} /></li>)}</ul></section>
    <section><h2 className="mb-3 font-semibold">Propuestas de edición <span className="text-sm font-normal text-gray-400">({proposals?.length || 0})</span></h2>{proposalsError && <p className="mb-2 text-sm text-red-600">{proposalsError.message}</p>}{!proposals?.length && !proposalsError && <p className="rounded-xl border border-dashed p-5 text-sm text-gray-500">Sin propuestas pendientes.</p>}<ul className="space-y-2">{proposals?.map((proposal: any) => <li key={proposal.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 flex-1"><Link href={`/canciones/${proposal.songs?.slug}`} className="font-medium hover:text-primary">{proposal.songs?.title || 'Canción no disponible'}</Link><p className="text-xs text-gray-500">{proposal.change_summary || 'Sin resumen'}</p><details className="mt-2"><summary className="cursor-pointer text-xs font-medium text-primary">Ver contenido propuesto</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs dark:bg-gray-900">{proposal.proposed_content}</pre></details></div><ModerationActions type="proposal" id={proposal.id} /></li>)}</ul></section>
  </div>;
}
