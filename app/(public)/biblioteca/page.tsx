import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export default async function LibraryPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/biblioteca');

  const { data: mySongs } = await supabase
    .from('songs')
    .select('id, title, slug, status')
    .eq('created_by', user.id)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  const { data: myProposals } = await supabase
    .from('song_edit_proposals')
    .select('id, status, created_at, songs(title, slug)')
    .eq('proposed_by', user.id)
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-4">Mi biblioteca</h1>
        <h2 className="font-semibold text-sm text-gray-500 mb-2">Canciones que agregué</h2>
        {(!mySongs || mySongs.length === 0) && <p className="text-gray-500 text-sm">Aún no has agregado canciones.</p>}
        <ul className="space-y-1">
          {mySongs?.map((s) => (
            <li key={s.id} className="flex items-center justify-between text-sm border-b border-gray-100 dark:border-gray-900 py-2">
              <Link href={`/canciones/${s.slug}`} className="hover:text-primary">
                {s.title}
              </Link>
              <span className="text-gray-400 text-xs">{s.status}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h2 className="font-semibold text-sm text-gray-500 mb-2">Mis propuestas de corrección</h2>
        {(!myProposals || myProposals.length === 0) && (
          <p className="text-gray-500 text-sm">No has enviado propuestas de corrección.</p>
        )}
        <ul className="space-y-1">
          {myProposals?.map((p: any) => (
            <li key={p.id} className="flex items-center justify-between text-sm border-b border-gray-100 dark:border-gray-900 py-2">
              <Link href={`/canciones/${p.songs.slug}`} className="hover:text-primary">
                {p.songs.title}
              </Link>
              <span className="text-gray-400 text-xs">{p.status}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
