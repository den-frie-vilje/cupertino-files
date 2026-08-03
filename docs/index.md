---
layout: home

hero:
  name: cupertino-files
  text: Pages, Numbers, and Keynote. In TypeScript.
  tagline: Open, edit, and save Apple's document formats anywhere JavaScript runs. No Mac required. Nothing to install but the package. Every byte you don't touch is preserved, exactly.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: The format, documented
      link: /FORMAT
    - theme: alt
      text: GitHub
      link: https://github.com/den-frie-vilje/cupertino-files

features:
  - icon: ¶
    title: The whole stack
    details: Snappy, protobuf, ZIP, IWA archives, the object graph — implemented from the bytes up, with a typed document model on top. You work with paragraphs and slides. The bytes take care of themselves.
  - icon: ⟲
    title: Round trips you can trust
    details: Documents come back byte-for-byte wherever you didn't edit — including parts of the format nobody has met yet. Files from future app versions survive.
  - icon: ∅
    title: Honest about limits
    details: When something can't be done safely — a password-protected file, an unmeasured corner of the format — you get a clear error and a next step, never a wrong answer.
  - icon: ⇄
    title: Beyond TypeScript
    details: The format specification, a language-neutral conformance suite, and recovered schemas with full provenance. Building an importer in C++, Java, or Rust? Start here.
---

## Say hello

::: code-group

```sh [install]
npm install cupertino-files
```

```ts [your first edit]
import { readFileSync, writeFileSync } from "node:fs";
import { PagesDocument } from "cupertino-files";

const doc = PagesDocument.load(new Uint8Array(readFileSync("Report.pages")));

doc.appendParagraph("hello");   // the traditional first word
doc.replaceText("2024", "2025");
doc.sections()[0].setHeaderText("Confidential");

writeFileSync("Report 2025.pages", doc.save());
```

:::

Open the result in Pages — it opens, styles intact.
([How we know.](/guide/fidelity))

## one more thing …

This isn't only a library. It's the format, written down: a
[specification](/FORMAT) measured from real documents, a
[conformance suite](/guide/conformance) any implementation can test
against, and the recovered schemas with their provenance. If you're
building iWork support in another language — or another decade — the
knowledge is yours too.
