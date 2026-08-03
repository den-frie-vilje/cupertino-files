---
layout: home

hero:
  name: cupertino-files
  text: Pages, Numbers, and Keynote. In TypeScript.
  tagline: Open, edit, and save Apple's document formats anywhere JavaScript runs. No Mac required. An open reverse-engineering, still under way — designed so every byte you don't touch comes back exactly.
  image:
    src: /apple.webp
    alt: A red apple wearing a cupertino-files fruit sticker
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
    title: The whole stack, from hex
    details: Snappy, protobuf, ZIP, IWA archives, the object graph — reimplemented by reading real documents until they made sense. A typed model on top, so you get to think in paragraphs and slides instead.
  - icon: ⟲
    title: Bytes in, bytes out
    details: What you don't edit is left exactly alone — that's the design, held against every fixture we could legally get. Documents from app versions we haven't met yet should ride along unharmed.
  - icon: ∅
    title: It mostly just works
    details: And where it doesn't, it declines with a reason — a clear error beats a plausible guess. Password-protected documents are refused on principle.
  - icon: ⇄
    title: For the next implementer
    details: The format written down as we learn it, a language-neutral conformance suite, and the recovered schemas with their provenance. Port it, check yourself, tell us what we got wrong.
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

Open the result in Pages. It opens — and if yours ever doesn't, that is
a bug report we genuinely want. ([How we know it usually
does.](/guide/fidelity))

## one more thing …

This isn't only a library. It's the format, written down: a
[specification](/FORMAT) measured from real documents, a
[conformance suite](/guide/conformance) any implementation can test
against, and the recovered schemas with their provenance. If you're
building iWork support in another language — or another decade — the
knowledge is yours too.
