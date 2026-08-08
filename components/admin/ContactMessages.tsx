'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Message = { id: string; name: string; email: string; subject: string; message: string; status: 'new' | 'in_progress' | 'closed'; created_at: string };
const LABELS = { new: 'Nuevo', in_progress: 'En proceso', closed: 'Cerrado' };

export default function ContactMessages({ messages: initial }: { messages: Message[] }) {
  const supabase = createClient(); const [messages, setMessages] = useState(initial); const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState<string | null>(null);
  async function updateStatus(item: Message, status: Message['status']) {
    setBusy(item.id); setError(null);
    const { error: updateError } = await supabase.from('legal_contact_messages').update({ status, updated_at: new Date().toISOString() }).eq('id', item.id);
    setBusy(null); if (updateError) { setError(updateError.message); return; }
    setMessages((current) => current.map((message) => message.id === item.id ? { ...message, status } : message));
  }
  return <div className="space-y-3">{error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}{!messages.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-gray-500">No hay mensajes.</p>}{messages.map((item) => <article key={item.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"><div className="flex flex-wrap items-start justify-between gap-3"><div><strong>{item.subject}</strong><p className="text-sm text-gray-500">{item.name} · <a className="text-primary hover:underline" href={`mailto:${item.email}`}>{item.email}</a></p></div><div className="flex items-center gap-2"><time className="text-xs text-gray-500">{new Date(item.created_at).toLocaleString('es-GT')}</time><select value={item.status} disabled={busy === item.id} onChange={(e) => updateStatus(item, e.target.value as Message['status'])} className="rounded-lg border border-gray-300 bg-transparent px-2 py-1 text-xs dark:border-gray-700">{Object.entries(LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div><p className="mt-3 whitespace-pre-wrap text-sm">{item.message}</p></article>)}</div>;
}
