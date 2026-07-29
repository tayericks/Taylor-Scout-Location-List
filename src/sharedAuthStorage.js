function cookieDomain() {
  const host = window.location.hostname;
  return host === 'taylorscout.com' || host.endsWith('.taylorscout.com') ? '.taylorscout.com' : undefined;
}

function readCookie(name) {
  const prefix = `${encodeURIComponent(name)}=`;
  const parts = document.cookie ? document.cookie.split('; ') : [];
  for (const part of parts) {
    if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
  }
  return null;
}

function writeCookie(name, value, maxAge = 60 * 60 * 24 * 365) {
  const domain = cookieDomain();
  const attrs = [`Path=/`, `Max-Age=${maxAge}`, 'SameSite=Lax'];
  if (location.protocol === 'https:') attrs.push('Secure');
  if (domain) attrs.push(`Domain=${domain}`);
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; ${attrs.join('; ')}`;
}

function deleteCookie(name) {
  const domain = cookieDomain();
  const attrs = ['Path=/', 'Max-Age=0', 'SameSite=Lax'];
  if (location.protocol === 'https:') attrs.push('Secure');
  if (domain) attrs.push(`Domain=${domain}`);
  document.cookie = `${encodeURIComponent(name)}=; ${attrs.join('; ')}`;
}

export function createSharedCookieStorage() {
  const chunkSize = 3000;
  const countKey = (key) => `${key}__chunks`;
  const chunkKey = (key, index) => `${key}__${index}`;

  const removeCookies = (key) => {
    const count = Number(readCookie(countKey(key)) || 0);
    for (let i = 0; i < Math.max(count, 12); i += 1) deleteCookie(chunkKey(key, i));
    deleteCookie(countKey(key));
  };

  return {
    getItem(key) {
      const count = Number(readCookie(countKey(key)) || 0);
      if (count > 0) {
        let value = '';
        for (let i = 0; i < count; i += 1) value += readCookie(chunkKey(key, i)) || '';
        if (value) return value;
      }

      // Migrate an existing same-origin Supabase session into shared parent-domain cookies.
      const localValue = window.localStorage.getItem(key);
      if (localValue) {
        this.setItem(key, localValue);
        return localValue;
      }
      return null;
    },
    setItem(key, value) {
      const text = String(value ?? '');
      removeCookies(key);
      const chunks = [];
      for (let i = 0; i < text.length; i += chunkSize) chunks.push(text.slice(i, i + chunkSize));
      writeCookie(countKey(key), String(chunks.length));
      chunks.forEach((chunk, index) => writeCookie(chunkKey(key, index), chunk));
      // Keep a same-origin fallback for browsers that restrict parent-domain cookies.
      window.localStorage.setItem(key, text);
    },
    removeItem(key) {
      removeCookies(key);
      window.localStorage.removeItem(key);
    },
  };
}
