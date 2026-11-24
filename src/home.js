const form = document.getElementById('search-form');
const input = document.getElementById('search-input');
const siteGrid = document.getElementById('site-grid');
const siteMessage = document.getElementById('site-message');
const siteForm = document.getElementById('site-form');
const siteName = document.getElementById('site-name');
const siteUrl = document.getElementById('site-url');
const addSiteButton = document.getElementById('add-site');
const chooseSiteIconButton = document.getElementById('choose-site-icon');
const siteIconPreview = document.getElementById('site-icon-preview');
const clearSiteIconButton = document.getElementById('clear-site-icon');
const sitesApi = window.himHome;
let sites = [];
let chosenSiteIconUrl = null;

function applyBackgroundImage(imageUrl) {
  if (typeof imageUrl !== 'string' || !imageUrl.startsWith('file:')) {
    document.body.classList.remove('has-custom-background');
    document.documentElement.style.removeProperty('--home-background-image');
    return;
  }
  document.documentElement.style.setProperty(
    '--home-background-image',
    `url(${JSON.stringify(imageUrl)})`,
  );
  document.body.classList.add('has-custom-background');
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) return;
  window.location.href = window.resolveSiteShortcut(query)
    || window.resolveDirectNavigation(query)
    || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
});

function showMessage(message, isError = false) {
  siteMessage.textContent = message;
  siteMessage.classList.toggle('error', isError);
}

function normalizeUrl(value) {
  const inputValue = value.trim();
  const candidate = /^https?:\/\//i.test(inputValue) ? inputValue : `https://${inputValue}`;
  const url = new URL(candidate);
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    throw new Error('Enter a valid website address.');
  }
  return url.href;
}

function renderSites() {
  siteGrid.replaceChildren();
  if (sites.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-sites';
    empty.textContent = 'Add websites you visit often for quick access.';
    siteGrid.appendChild(empty);
    return;
  }

  sites.forEach((site, index) => {
    const card = document.createElement('div');
    card.className = 'site-card';

    const link = document.createElement('a');
    link.className = 'site-link';
    link.href = site.url;
    link.title = `${site.name} — ${site.url}`;
    link.setAttribute('aria-label', `Open ${site.name}`);

    const icon = document.createElement('span');
    icon.className = 'site-icon';
    const fallbackIcon = site.name.trim().charAt(0).toUpperCase() || '•';
    icon.textContent = fallbackIcon;
    let defaultIconUrl;
    try {
      const siteUrl = new URL(site.url);
      if (['http:', 'https:'].includes(siteUrl.protocol)) {
        defaultIconUrl = `${siteUrl.origin}/favicon.ico`;
      }
    } catch {}
    const iconUrl = typeof site.iconUrl === 'string' && site.iconUrl.startsWith('file:')
      ? site.iconUrl
      : defaultIconUrl;
    if (iconUrl) {
      const image = document.createElement('img');
      image.alt = '';
      image.referrerPolicy = 'no-referrer';
      image.onload = () => icon.replaceChildren(image);
      image.onerror = () => image.remove();
      image.src = iconUrl;
      icon.appendChild(image);
    }

    link.appendChild(icon);

    const editIcon = document.createElement('button');
    editIcon.className = 'edit-site-icon';
    editIcon.type = 'button';
    editIcon.textContent = '✎';
    editIcon.title = `Change ${site.name} icon`;
    editIcon.setAttribute('aria-label', `Change ${site.name} icon`);
    editIcon.addEventListener('click', async () => {
      try {
        const iconUrl = await sitesApi.chooseCustomIcon();
        if (!iconUrl) return;
        const updatedSites = sites.map((item, siteIndex) => (
          siteIndex === index ? { ...item, iconUrl } : item
        ));
        await saveSites(updatedSites);
      } catch (error) {
        console.error('Could not change frequent site icon:', error);
        showMessage(error.message || 'Could not change site icon.', true);
      }
    });

    const remove = document.createElement('button');
    remove.className = 'remove-site';
    remove.type = 'button';
    remove.textContent = '×';
    remove.title = `Remove ${site.name}`;
    remove.setAttribute('aria-label', `Remove ${site.name}`);
    remove.addEventListener('click', async () => {
      await saveSites(sites.filter((_, siteIndex) => siteIndex !== index));
    });

    card.append(link, editIcon, remove);
    siteGrid.appendChild(card);
  });
}

async function saveSites(updatedSites) {
  try {
    await sitesApi.saveFrequentSites(updatedSites);
    sites = updatedSites;
    showMessage('');
    renderSites();
    return true;
  } catch (error) {
    console.error('Could not save frequent sites:', error);
    showMessage(error.message || 'Could not save frequent sites.', true);
    return false;
  }
}

async function loadSites() {
  try {
    const savedSites = await sitesApi.getFrequentSites();
    if (!Array.isArray(savedSites)) throw new Error('Saved frequent sites are invalid.');
    sites = savedSites.filter((site) => (
      site && typeof site.name === 'string' && typeof site.url === 'string'
    ));
    renderSites();
  } catch (error) {
    console.error('Could not load frequent sites:', error);
    showMessage(error.message || 'Could not load frequent sites.', true);
  }
}

async function loadBackgroundImage() {
  try {
    applyBackgroundImage(await sitesApi.getBackgroundImage());
  } catch (error) {
    console.error('Could not load browser background:', error);
    showMessage('Could not load browser background.', true);
  }
}

sitesApi.onBackgroundImage(applyBackgroundImage);
addSiteButton.addEventListener('click', () => {
  siteForm.hidden = false;
  siteName.focus();
});

document.getElementById('cancel-site').addEventListener('click', () => {
  siteForm.reset();
  chosenSiteIconUrl = null;
  siteIconPreview.removeAttribute('src');
  siteIconPreview.hidden = true;
  clearSiteIconButton.disabled = true;
  siteForm.hidden = true;
  showMessage('');
});

siteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const url = normalizeUrl(siteUrl.value);
    if (sites.some((site) => site.url === url)) {
      throw new Error('That website is already in Frequent sites.');
    }
    const name = siteName.value.trim() || new URL(url).hostname;
    const added = await saveSites([...sites, { name, url, iconUrl: chosenSiteIconUrl }]);
    if (added) {
      siteForm.reset();
      chosenSiteIconUrl = null;
      siteIconPreview.removeAttribute('src');
      siteIconPreview.hidden = true;
      clearSiteIconButton.disabled = true;
      siteForm.hidden = true;
    }
  } catch (error) {
    showMessage(error.message || 'Could not add that website.', true);
  }
});

chooseSiteIconButton.addEventListener('click', async () => {
  try {
    const iconUrl = await sitesApi.chooseCustomIcon();
    if (!iconUrl) return;
    chosenSiteIconUrl = iconUrl;
    siteIconPreview.src = iconUrl;
    siteIconPreview.hidden = false;
    clearSiteIconButton.disabled = false;
  } catch (error) {
    console.error('Could not choose frequent site icon:', error);
    showMessage(error.message || 'Could not choose site icon.', true);
  }
});

clearSiteIconButton.addEventListener('click', () => {
  chosenSiteIconUrl = null;
  siteIconPreview.removeAttribute('src');
  siteIconPreview.hidden = true;
  clearSiteIconButton.disabled = true;
});

loadSites();
loadBackgroundImage();
