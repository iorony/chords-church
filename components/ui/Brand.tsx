import Link from 'next/link';
import BrandMark from './BrandMark';
import { BRAND } from '@/lib/branding';

export default function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="brand-lockup group" aria-label={`${BRAND.name}, inicio`}>
    <BrandMark className={compact ? 'h-10 w-10' : 'h-11 w-11'} />
    <span className={compact ? 'block' : 'hidden sm:block'}>
      <span className="brand-name">{BRAND.name}</span>
      {!compact && <span className="brand-tagline">{BRAND.tagline}</span>}
    </span>
  </Link>;
}
