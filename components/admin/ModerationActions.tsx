'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ModerationActions({ type, id }: { type: 'report' | 'proposal'; id: string }) {
  const supabase = createClient(); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  async function resolve(approve: boolean) {
    setBusy(true); setError(null); const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('La sesión expiró.'); setBusy(false); return; }
    if (type === 'report') {
      const { error: reportError } = await supabase.from('song_reports').update({ status: approve ? 'resolved' : 'dismissed', resolved_by: user.id, resolved_at: new Date().toISOString() }).eq('id', id);
      if (reportError) { setError(reportError.message); setBusy(false); return; }
    } else {
      const { data: proposal, error: readError } = await supabase.from('song_edit_proposals').select('song_id, proposed_content, change_summary').eq('id', id).single();
      if (readError || !proposal) { setError(readError?.message || 'No se encontró la propuesta.'); setBusy(false); return; }
      if (approve) {
        const { error: approveError } = await supabase.rpc('approve_song_edit_proposal', { target_proposal_id: id });
        if (approveError) { setError(approveError.message); setBusy(false); return; }
      } else {
        const { error: proposalError } = await supabase.from('song_edit_proposals').update({ status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq('id', id);
        if (proposalError) { setError(proposalError.message); setBusy(false); return; }
      }
    }
    setBusy(false); setDone(true);
  }
  if (done) return <span className="text-xs font-medium text-green-700">Procesado</span>;
  return <div className="text-right">{error && <p className="mb-1 max-w-64 text-xs text-red-600">{error}</p>}<div className="flex justify-end gap-2 text-xs"><button disabled={busy} onClick={() => resolve(true)} className="text-green-700 underline disabled:opacity-50">{type === 'report' ? 'Resolver' : 'Aprobar'}</button><button disabled={busy} onClick={() => resolve(false)} className="text-red-600 underline disabled:opacity-50">{type === 'report' ? 'Descartar' : 'Rechazar'}</button></div></div>;
}
