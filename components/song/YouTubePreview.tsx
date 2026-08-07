import { getYouTubeEmbedUrl } from '@/lib/services/youtube';

export default function YouTubePreview({ url, title = 'Video de referencia' }: { url?: string | null; title?: string }) {
  const embedUrl = getYouTubeEmbedUrl(url);
  if (!embedUrl) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-black shadow-sm dark:border-gray-800">
      <div className="aspect-video w-full">
        <iframe
          src={embedUrl}
          title={title}
          className="h-full w-full"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </div>
  );
}
