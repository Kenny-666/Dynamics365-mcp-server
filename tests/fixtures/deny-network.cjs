// Startup tests must never contact an identity provider or CRM, even with test credentials.
const deny = () => { throw new Error('UNEXPECTED_NETWORK_REQUEST_IN_STARTUP_TEST'); };
for (const moduleName of ['node:http', 'node:https']) {
  const module = require(moduleName);
  module.request = deny;
  module.get = deny;
}
require('node:net').connect = deny;
require('node:tls').connect = deny;
globalThis.fetch = deny;
