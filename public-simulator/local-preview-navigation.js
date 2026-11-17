/* Carry explicitly enabled local visual previews between the dashboard and its modules. */
(function () {
  'use strict';
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!localHosts.has(String(location.hostname).toLowerCase())) return;

  const params = new URLSearchParams(location.search);
  if (params.get('OOI_VISUAL_PREVIEW_ENABLED') !== 'true') return;

  document.querySelectorAll('a[href]').forEach((link) => {
    try {
      const target = new URL(link.getAttribute('href'), location.href);
      if (!['projects.html', 'actualites.html'].includes(target.pathname.split('/').pop())) return;
      target.searchParams.set('OOI_VISUAL_PREVIEW_ENABLED', 'true');
      link.href = `${target.pathname}${target.search}${target.hash}`;
    } catch { /* Ignore non-URL anchors. */ }
  });
})();
