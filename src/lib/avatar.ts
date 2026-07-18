import { ThemePreference } from '@/stores/ui-store';

export function getAvatarUrl(name: string, theme: ThemePreference = 'dark', size: number = 128) {
  const encodedName = encodeURIComponent(name || 'Athlete');
  
  if (theme === 'dark') {
    // For dark theme: light brown background (#fbe1d1), dark color text (#17191c)
    return `https://ui-avatars.com/api/?name=${encodedName}&background=fbe1d1&color=17191c&bold=true&size=${size}`;
  } else {
    // For light theme: brown background (#5d2a1a), white text (#ffffff)
    return `https://ui-avatars.com/api/?name=${encodedName}&background=5d2a1a&color=ffffff&bold=true&size=${size}`;
  }
}
