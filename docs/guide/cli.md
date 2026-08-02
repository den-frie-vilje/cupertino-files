# CLI

Sometimes you just want to look inside a document. `cupertino-dump` ships
with the package — no code required:

```sh
npx cupertino-dump info     Report.pages     # versions, components, object counts
npx cupertino-dump text     Report.pages     # the text, extracted
npx cupertino-dump styles   Report.pages     # named styles
npx cupertino-dump sections Report.pages     # sections, headers, footers
npx cupertino-dump compat   Report.pages     # format era + compatibility report
npx cupertino-dump ls       Report.pages     # every object, typed, with references
npx cupertino-dump object   Report.pages 42  # one object's protobuf, pretty
npx cupertino-dump extract  Report.pages out/  # the raw .iwa streams, decompressed
```

Filing an issue? `info` answers the first question we'll ask — which app
version wrote the document.
