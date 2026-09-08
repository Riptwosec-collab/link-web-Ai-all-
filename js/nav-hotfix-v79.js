/* Smart Link Hub V7.10 compatibility bridge.
 * Navigation ownership moved to auto-cloud-ui.js / window.SmartLinkNavigation.
 * Keep this file only so older cached index.html versions do not 404.
 */
(function(){
  'use strict';
  const route=key=>window.SmartLinkNavigation?.route?.(key);
  window.SmartLinkNav79={route,retired:true,version:'7.10'};
  window.SmartLinkNav={...(window.SmartLinkNav||{}),open:route,hotfix:'retired-7.10'};
})();
