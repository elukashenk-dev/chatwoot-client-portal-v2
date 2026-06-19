;(function () {
  var path = window.location.pathname

  if (
    path === '/' ||
    path.indexOf('/auth') === 0 ||
    path.indexOf('/admin') === 0 ||
    path.indexOf('/legal') === 0
  ) {
    document.documentElement.dataset.portalStartupSurface = 'auth'
  }
})()
