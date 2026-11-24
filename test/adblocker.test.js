const assert = require('node:assert/strict');
const test = require('node:test');
const { enableAdBlocker } = require('../src/adblocker');

function createBlocker() {
  const blocker = {
    filteredRequests: 0,
    enabledSession: null,
    onBeforeRequest(_details, callback) {
      this.filteredRequests += 1;
      callback({ cancel: true });
    },
    enableBlockingInSession(browserSession) {
      this.enabledSession = browserSession;
    },
  };
  return blocker;
}

test('allows Google Video CDN requests with or without a referrer', () => {
  const blocker = createBlocker();
  const browserSession = {};
  enableAdBlocker(blocker, browserSession);

  for (const referrer of ['https://www.youtube.com/watch?v=example', '']) {
    let response;
    blocker.onBeforeRequest({
      url: 'https://rr1---sn.googlevideo.com/videoplayback',
      referrer,
    }, (result) => { response = result; });

    assert.deepEqual(response, {});
  }
  assert.equal(blocker.filteredRequests, 0);
  assert.equal(blocker.enabledSession, browserSession);
});

test('continues filtering unrelated requests', () => {
  const blocker = createBlocker();
  enableAdBlocker(blocker, {});

  let unrelatedResponse;
  blocker.onBeforeRequest({
    url: 'https://ads.example.com/ad.js',
    referrer: 'https://www.youtube.com/watch?v=example',
  }, (result) => { unrelatedResponse = result; });

  assert.deepEqual(unrelatedResponse, { cancel: true });
  assert.equal(blocker.filteredRequests, 1);
});
