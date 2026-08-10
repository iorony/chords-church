export const BRAND = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || 'Cancionero',
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE || 'Acordes para iglesias',
  description: process.env.NEXT_PUBLIC_BRAND_DESCRIPTION || 'Plataforma colaborativa de canciones y acordes para equipos de alabanza'
} as const;
