(() => {
  const { contextBridge, ipcRenderer } = require('electron');

  if (location.protocol === 'file:' && location.pathname.toLowerCase().endsWith('/home.html')) {
    contextBridge.exposeInMainWorld('himHome', {
      getFrequentSites: async () => {
        const settings = await ipcRenderer.invoke('settings:get');
        return settings.frequentSites || [];
      },
      getBackgroundImage: async () => {
        const settings = await ipcRenderer.invoke('settings:get');
        if (Object.prototype.hasOwnProperty.call(settings, 'panelBackgroundImageUrl')) {
          return settings.panelBackgroundImageUrl || null;
        }
        return settings.backgroundImageUrl || null;
      },
      onBackgroundImage: (callback) => {
        ipcRenderer.on('appearance:background', (_event, imageUrl) => callback(imageUrl));
      },
      saveFrequentSites: (frequentSites) => ipcRenderer.invoke('settings:set', { frequentSites }),
      chooseCustomIcon: () => ipcRenderer.invoke('icons:choose-local'),
    });
    return;
  }

  const hostname = location.hostname.toLowerCase();
  if (hostname !== 'duckduckgo.com' && hostname !== 'www.duckduckgo.com') return;

  let observer;
  const hideUnreplacedLogo = () => {
    const wrapper = document.querySelector('#header-logo-wrapper');
    if (!wrapper) return;
    if (wrapper.querySelector('img[data-him-logo]')) {
      observer.disconnect();
      return;
    }
    wrapper.style.setProperty('visibility', 'hidden', 'important');
  };

  observer = new MutationObserver(hideUnreplacedLogo);
  observer.observe(document, { childList: true, subtree: true });
  hideUnreplacedLogo();
  setTimeout(() => observer.disconnect(), 20000);
})();
