import { createServerSupabaseClient } from '@/lib/supabase/server';
import ContactMessages from '@/components/admin/ContactMessages';

export default async function AdminContactPage() {
  const supabase = createServerSupabaseClient(); const { data, error } = await supabase.from('legal_contact_messages').select('id, name, email, subject, message, status, created_at').order('created_at', { ascending: false }).limit(100);
  return <div className="space-y-5"><div><h1 className="text-2xl font-bold">Mensajes de contacto</h1><p className="mt-1 text-sm text-gray-500">Revisa y actualiza el estado de los últimos 100 mensajes.</p></div>{error ? <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error.message}</p> : <ContactMessages messages={(data as any) || []} />}</div>;
}
