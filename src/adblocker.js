function isGoogleVideoRequest(details) {
  try {
    const hostname = new URL(details.url).hostname;
    return hostname === 'googlevideo.com' || hostname.endsWith('.googlevideo.com');
  } catch {
    return false;
  }
}

function enableAdBlocker(blocker, browserSession) {
  const onBeforeRequest = blocker.onBeforeRequest.bind(blocker);
  blocker.onBeforeRequest = (details, callback) => {
    // Chromium may omit the referrer on cross-origin video stream requests.
    if (isGoogleVideoRequest(details)) {
      callback({});
      return;
    }
    onBeforeRequest(details, callback);
  };
  blocker.enableBlockingInSession(browserSession);
}

module.exports = { enableAdBlocker };
