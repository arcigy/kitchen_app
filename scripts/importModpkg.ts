// The former source-bundle importer rewrote the runtime registry from demo
// manifests. Module installation now belongs to the authenticated tenant API.
console.error(
  "Legacy .modpkg source imports have been retired. Import a current .fqm package through the company module catalog; source bundles cannot rewrite the application registry."
);
process.exitCode = 1;
