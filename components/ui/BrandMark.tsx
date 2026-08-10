export default function BrandMark({ className = 'h-11 w-11' }: { className?: string }) {
  return <span className={`brand-mark ${className}`} aria-hidden="true"><svg viewBox="0 0 48 48" role="img">
    <path className="brand-mark-sheet" d="M13 10.5c7.2-2 13.4-.8 18 2.8v24.2c-4.6-3.5-10.8-4.5-18-2.7V10.5Z" />
    <path className="brand-mark-fold" d="M31 13.3c2.2-1.3 4.2-2 6-2.2v23.8c-2 .3-4 .9-6 2.6V13.3Z" />
    <path className="brand-mark-note" d="M27.4 17.2v11.2a4.5 4.5 0 1 1-2.7-4.1v-8l8.6-1.8v3.1l-5.9 1.2v-1.6Z" />
  </svg></span>;
}
