import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import ProfileForm from '@/components/ui/ProfileForm';

export default async function ProfilePage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/perfil');

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Mi perfil</h1>
      <ProfileForm
        initialDisplayName={profile?.display_name || ''}
        initialChurchName={profile?.church_name || ''}
        initialInstrument={profile?.main_instrument || ''}
        email={user.email || ''}
      />
    </div>
  );
}
