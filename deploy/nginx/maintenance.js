(function () {
  var READY_URL = '/__maintenance_ready';
  var statusTitle = document.getElementById('status-title');
  var statusCopy = document.getElementById('status-copy');
  var originalTarget =
    window.location.pathname + window.location.search + window.location.hash;
  var pollIntervalMs = 7000;
  var initialDelayMs = 2500;
  var isChecking = false;

  function setStatus(title, copy) {
    statusTitle.textContent = title;
    statusCopy.textContent = copy;
  }

  function redirectBack() {
    setStatus('Projex is ready', 'Taking you back now…');
    window.location.replace(originalTarget || '/');
  }

  async function checkReady() {
    if (isChecking) return;
    isChecking = true;
    setStatus(
      'Reconnecting…',
      'Checking whether the app is ready to accept traffic.'
    );

    try {
      var response = await fetch(READY_URL + '?ts=' + Date.now(), {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });

      if (response.ok) {
        redirectBack();
        return;
      }

      setStatus(
        'Still restarting',
        'The app is not ready yet. We’ll check again automatically.'
      );
    } catch (error) {
      setStatus(
        'Still reconnecting',
        'The app is still unavailable. We’ll keep polling in the background.'
      );
    } finally {
      isChecking = false;
    }
  }

  window.setTimeout(function () {
    void checkReady();
    window.setInterval(function () {
      void checkReady();
    }, pollIntervalMs);
  }, initialDelayMs);
})();
