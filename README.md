# vite-plugin-simple-rpc

What I wanted (and was unable to find) was a super simple way of spinning up a
typescript react app via vite WITH some backend code.  So I wrote this plugin to try and achieve
that.

### What it does

If you place any code in `src/server` and import from it in any code not in
`src/server`, the plugin imports the file into the server, creating REST endpoints
for any exported, async function (the async restriction is mostly so that
the signature is still valid in the client code as that will need to be async).  It then strips out anything from the imported
file that isn't an exported async function (such as imports of other files or exports of constants)
and replaces the body of each function with a stub that calls the endpoint.

### What it does not do

- Any real error handling
- Any kind of configurability
- Support production deployment
- Correctly handle HMR (probably)
