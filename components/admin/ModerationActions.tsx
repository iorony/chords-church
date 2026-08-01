'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ModerationActions({ type, id }: { type: 'report' | 'proposal'; id: string }) {
  const supabase = createClient();
  const [done, setDone] = useState(false);

  async function resolve(approve: boolean) {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (type === 'report') {
      await supabase
        .from('song_reports')
        .update({ status: approve ? 'resolved' : 'dismissed', resolved_by: user?.id, resolved_at: new Date().toISOString() })
        .eq('id', id);
    } else {
      const { data: proposal } = await supabase
        .from('song_edit_proposals')
        .select('song_id, proposed_content')
        .eq('id', id)
        .single();

      if (approve && proposal) {
        await supabase.from('songs').update({ content: proposal.proposed_content }).eq('id', proposal.song_id);
      }
      await supabase
        .from('song_edit_proposals')
        .update({ status: approve ? 'approved' : 'rejected', reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
        .eq('id', id);
    }
    setDone(true);
  }

  if (done) return <span className="text-xs text-gray-400">Resuelto</span>;

  return (
    <div className="flex gap-2 text-xs">
      <button onClick={() => resolve(true)} className="text-success underline">
        Aprobar
      </button>
      <button onClick={() => resolve(false)} className="text-danger underline">
        Rechazar
      </button>
    </div>
  );
}
