'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function NavAuthStatus({ mobile = false }: { mobile?: boolean }) {
  const supabase = createClient();
  const router = useRouter();
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  if (email === undefined) return <div className="w-20" />;

  if (!email) {
    return (
      <div className={mobile ? 'flex flex-col items-stretch gap-2 text-sm' : 'flex items-center gap-3 text-sm'}>
        <Link href="/login" className={mobile ? 'rounded-md px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-900' : 'hover:text-primary'}>
          Iniciar sesión
        </Link>
        <Link
          href="/registro"
          className={mobile ? 'rounded-md bg-primary px-3 py-2 text-center text-white hover:bg-primary-light' : 'bg-primary text-white px-3 py-1.5 rounded-md hover:bg-primary-light'}
        >
          Registrarse
        </Link>
      </div>
    );
  }

  return (
    <div className={mobile ? 'flex flex-col items-stretch gap-2 text-sm' : 'flex items-center gap-3 text-sm'}>
      <Link href="/perfil" className={mobile ? 'break-all rounded-md px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-900' : 'hover:text-primary'}>
        {email}
      </Link>
      <button
        onClick={async () => {
          await supabase.auth.signOut();
          router.refresh();
        }}
        className={mobile ? 'rounded-md px-3 py-2 text-left text-gray-500 hover:bg-gray-100 hover:text-danger dark:hover:bg-gray-900' : 'text-gray-500 hover:text-danger'}
      >
        Salir
      </button>
    </div>
  );
}
