import { describe, expect, it } from 'vitest';
import { getYouTubeEmbedUrl, getYouTubeVideoId } from '../lib/services/youtube';

describe('YouTube URL helpers', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?t=10', 'dQw4w9WgXcQ'],
    ['https://youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ']
  ])('extracts an id from %s', (url, id) => expect(getYouTubeVideoId(url)).toBe(id));

  it('rejects unrelated or malformed URLs', () => {
    expect(getYouTubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(getYouTubeVideoId('not a video')).toBeNull();
  });

  it('uses the privacy-enhanced embed domain', () => {
    expect(getYouTubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });
});
