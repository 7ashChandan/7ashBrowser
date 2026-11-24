(function (root) {
  const shortcuts = Object.freeze({
    adobe: 'https://www.adobe.com/',
    amazon: 'https://www.amazon.com/',
    apple: 'https://www.apple.com/',
    bing: 'https://www.bing.com/',
    canva: 'https://www.canva.com/',
    chatgpt: 'https://chatgpt.com/',
    cloudflare: 'https://www.cloudflare.com/',
    discord: 'https://discord.com/',
    duckduckgo: 'https://duckduckgo.com/',
    facebook: 'https://www.facebook.com/',
    figma: 'https://www.figma.com/',
    gemini: 'https://gemini.google.com/',
    github: 'https://github.com/',
    google: 'https://www.google.com/',
    instagram: 'https://www.instagram.com/',
    linkedin: 'https://www.linkedin.com/',
    microsoft: 'https://www.microsoft.com/',
    netflix: 'https://www.netflix.com/',
    notion: 'https://www.notion.so/',
    openai: 'https://openai.com/',
    pinterest: 'https://www.pinterest.com/',
    reddit: 'https://www.reddit.com/',
    roblox: 'https://www.roblox.com/',
    spotify: 'https://www.spotify.com/',
    stackoverflow: 'https://stackoverflow.com/',
    steam: 'https://store.steampowered.com/',
    telegram: 'https://telegram.org/',
    tiktok: 'https://www.tiktok.com/',
    twitch: 'https://www.twitch.tv/',
    wikipedia: 'https://www.wikipedia.org/',
    whatsapp: 'https://www.whatsapp.com/',
    yahoo: 'https://www.yahoo.com/',
    youtube: 'https://www.youtube.com/',
    zoom: 'https://zoom.us/',
  });

  function resolveSiteShortcut(input) {
    if (typeof input !== 'string') return null;
    const name = input.trim().toLowerCase().replace(/^www\./, '').replace(/\/+$/, '');
    return shortcuts[name] || null;
  }

  function resolveDirectNavigation(input) {
    if (typeof input !== 'string') return null;
    const value = input.trim();
    if (!value || /\s/.test(value)) return null;

    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && url.hostname ? url.href : null;
      } catch {
        return null;
      }
    }

    if (/^[a-z][a-z\d+.-]*:/i.test(value)) return null;

    try {
      const url = new URL(`https://${value}`);
      const labels = url.hostname.split('.');
      if (labels.length < 2 || !/^[a-z]{2,}$/i.test(labels[labels.length - 1])) return null;
      return url.href;
    } catch {
      return null;
    }
  }

  root.resolveSiteShortcut = resolveSiteShortcut;
  root.resolveDirectNavigation = resolveDirectNavigation;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { resolveSiteShortcut, resolveDirectNavigation };
  }
})(typeof window !== 'undefined' ? window : globalThis);
