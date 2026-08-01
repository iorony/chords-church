import { redirect } from 'next/navigation';

export default function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  redirect(`/canciones${searchParams.q ? `?q=${encodeURIComponent(searchParams.q)}` : ''}`);
}
