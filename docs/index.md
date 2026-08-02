---
layout: home

hero:
  name: cupertino-files
  text: Pages, Numbers and Keynote files in pure TypeScript
  tagline: Read, inspect and edit Apple's document formats anywhere Node or a browser runs — zero dependencies, byte-fidelity round trips, and a format spec measured from real documents.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: The format, documented
      link: /FORMAT
    - theme: alt
      text: GitHub
      link: https://github.com/olekristensen/cupertino-files

features:
  - icon: 📄
    title: The whole stack, from bytes up
    details: Snappy codec, protobuf wire layer, ZIP container, IWA archives, object store — and a typed document model on top. No Apple software, no native modules.
  - icon: 🔁
    title: Byte-fidelity round trips
    details: Everything you don't touch is preserved byte-for-byte, unknown fields included — so documents from future app versions survive editing intact.
  - icon: 📏
    title: Measured, not guessed
    details: Defaults and format rules come from a corpus of real Apple-written documents, and claims the test suite can't prove are verified in the apps themselves — or honestly marked until they are.
  - icon: 🌍
    title: Useful beyond TypeScript
    details: A language-neutral conformance suite, recovered schema definitions with provenance, and a written spec — for C++, Java or Rust implementers too.
---

## Sixty seconds

::: code-group

```sh [install]
npm install cupertino-files
```

```ts [edit a Pages document]
import { readFileSync, writeFileSync } from "node:fs";
import { PagesDocument } from "cupertino-files";

const doc = PagesDocument.load(new Uint8Array(readFileSync("report.pages")));

doc.replaceText("2024", "2025");
doc.appendParagraph("Conclusion", "Heading 1");
doc.sections()[0].setHeaderText("Confidential");

writeFileSync("report-2025.pages", doc.save());
```

:::

Documents saved this way open in current Pages, Numbers and Keynote —
which is not an assumption: it is checked, per feature, in the apps, and
the [verification ledger](/VERIFICATION) shows exactly what has been
confirmed and what hasn't yet.
