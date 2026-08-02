# CLI

The package ships `cupertino-dump`, a small inspector for looking inside
any document without writing code:

```sh
npx cupertino-dump info     file.pages     # versions, components, object counts
npx cupertino-dump ls       file.pages     # every object with type names + references
npx cupertino-dump text     file.pages     # extract text
npx cupertino-dump styles   file.pages     # named styles
npx cupertino-dump sections file.pages     # sections, headers, footers
npx cupertino-dump compat   file.pages     # format era + compatibility report
npx cupertino-dump object   file.pages 42  # pretty-print one object's protobuf
npx cupertino-dump extract  file.pages out/  # decompressed .iwa streams
```

`info` is also the fastest way to answer "which app version wrote this?"
when filing an issue.
