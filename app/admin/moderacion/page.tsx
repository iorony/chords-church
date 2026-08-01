import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import ModerationActions from '@/components/admin/ModerationActions';

export default async function ModerationPage() {
  const supabase = createServerSupabaseClient();

  const { data: reports } = await supabase
    .from('song_reports')
    .select('id, reason, status, created_at, songs(title, slug)')
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  const { data: proposals } = await supabase
    .from('song_edit_proposals')
    .select('id, change_summary, status, created_at, songs(title, slug)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Moderación</h1>

      <section>
        <h2 className="font-semibold mb-2">Reportes abiertos</h2>
        {(!reports || reports.length === 0) && <p className="text-gray-500 text-sm">Sin reportes pendientes.</p>}
        <ul className="space-y-2">
          {reports?.map((r: any) => (
            <li key={r.id} className="border border-gray-200 dark:border-gray-800 rounded-lg p-3 flex items-center justify-between">
              <div>
                <Link href={`/canciones/${r.songs.slug}`} className="font-medium hover:text-primary">
                  {r.songs.title}
                </Link>
                <p className="text-xs text-gray-500">{r.reason}</p>
              </div>
              <ModerationActions type="report" id={r.id} />
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-semibold mb-2">Propuestas de edición pendientes</h2>
        {(!proposals || proposals.length === 0) && <p className="text-gray-500 text-sm">Sin propuestas pendientes.</p>}
        <ul className="space-y-2">
          {proposals?.map((p: any) => (
            <li key={p.id} className="border border-gray-200 dark:border-gray-800 rounded-lg p-3 flex items-center justify-between">
              <div>
                <Link href={`/canciones/${p.songs.slug}`} className="font-medium hover:text-primary">
                  {p.songs.title}
                </Link>
                <p className="text-xs text-gray-500">{p.change_summary}</p>
              </div>
              <ModerationActions type="proposal" id={p.id} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
