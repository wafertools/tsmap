/**
 * Joins every lesson (and the glossary) into one Marp document, for a single PDF of the whole course.
 *
 * The lessons stay the only source. This only arranges them: a cover, a contents list, each lesson's slides under its own
 * footer, then the glossary as slides. A link to another lesson becomes a jump to that lesson's first slide in the same
 * PDF, and a link to a glossary term becomes a jump to the slide that holds it. Every other link is left as it is.
 *
 * Slide numbers are what the links use (Marp gives each slide the id of its number), so they are worked out here from the
 * slide counts before any text is written.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ONLINE = 'https://wafertools.github.io/tsmap/learn/';
const GLOSSARY_ONLINE = `${ONLINE}glossary/`;
const TERMS_PER_SLIDE = 3;

const slidesOf = (src) => src.replace(/^---\n[\s\S]*?\n---\n/, '').split('\n---\n');
const unquote = (v) => v.replace(/^["']|["']$/g, '');
const slugify = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** One entry per "## Term" in docs/learn/glossary.md. */
function glossaryEntries(src) {
  return [...src.replace(/^---\n[\s\S]*?\n---\n/, '').matchAll(/^## (.+)\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)]
    .map((m) => ({ term: m[1].trim(), text: m[2].trim(), slug: slugify(m[1].trim()) }));
}

/**
 * @param {string} learnDir  docs/learn
 * @param {{ file: string, slug: string, session: string, title: string, src: string }[]} decks
 * @returns {{ markdown: string, slideCount: number }}
 */
export function composeCourseBook(learnDir, decks) {
  const glossarySrc = readFileSync(join(learnDir, 'glossary.md'), 'utf8');
  const entries = glossaryEntries(glossarySrc);
  const lessonSlides = decks.map((d) => slidesOf(d.src));

  // Slide numbers: cover, two contents slides, then each lesson, then the glossary's cover and its entries.
  const CONTENTS_SLIDES = 2;
  let next = 1 + CONTENTS_SLIDES + 1;
  const startOf = {};
  decks.forEach((d, i) => { startOf[d.slug] = next; next += lessonSlides[i].length; });
  const glossaryCover = next++;
  const termSlide = {};
  entries.forEach((e, i) => { termSlide[e.slug] = next + Math.floor(i / TERMS_PER_SLIDE); });

  const relink = (text, slug) => text
    // Another lesson: its first slide in this PDF.
    .replace(/\]\((\d\d-[\w-]+)\.md\)/g, (m, s) => (startOf[s] ? `](#${startOf[s]})` : m))
    // A glossary term: the slide that holds it; the glossary as a whole: its cover.
    .replace(/\]\(https:\/\/wafertools\.github\.io\/tsmap\/learn\/glossary\/(?:#([\w-]+))?\)/g, (m, anchor) => `](#${anchor && termSlide[anchor] ? termSlide[anchor] : glossaryCover})`)
    // Screenshots sit beside their own lesson in the built site, one folder up from where the book is written.
    .replace(/\]\(images\//g, `](../${slug}/images/`);

  const out = [];
  out.push(`<!-- _class: title no-outline -->
<!-- _paginate: false -->

# Learn tsmap

## The whole course

Learn tsmap · [wafertools.github.io/tsmap/learn](${ONLINE})

The latest version is always online at the address above.
`);

  const items = decks.map((d) => `- [${d.title}](#${startOf[d.slug]})`);
  const half = Math.ceil(items.length / CONTENTS_SLIDES);
  for (let k = 0; k < CONTENTS_SLIDES; k++) {
    out.push(`${k === 0 ? '<!-- footer: "Learn tsmap" -->\n\n' : ''}# Contents${k ? ' (continued)' : ''}

${items.slice(k * half, (k + 1) * half).join('\n')}
${k === CONTENTS_SLIDES - 1 ? `\nThe [glossary](#${glossaryCover}) follows the last lesson. The latest version of this course is always at [wafertools.github.io/tsmap/learn](${ONLINE}).\n` : ''}`);
  }

  decks.forEach((d, i) => {
    const footer = unquote((/^footer:\s*(.*)$/m.exec(d.src) ?? [, `Learn tsmap · ${d.title}`])[1]);
    lessonSlides[i].forEach((slide, j) => {
      const text = relink(slide, d.slug);
      // A footer comment on a lesson's first slide holds for the slides after it, up to the next lesson's.
      out.push(j === 0 ? `<!-- footer: ${JSON.stringify(footer)} -->\n${text}` : text);
    });
  });

  out.push(`<!-- _class: title -->
<!-- _paginate: false -->
<!-- footer: "Learn tsmap · Glossary" -->

# Glossary

## The words the lessons use

Learn tsmap
`);
  for (let i = 0; i < entries.length; i += TERMS_PER_SLIDE) {
    out.push(`<!-- _class: glossary -->

# Glossary

${entries.slice(i, i + TERMS_PER_SLIDE).map((e) => `**${e.term}.** ${relink(e.text, 'glossary')}`).join('\n\n')}
`);
  }

  const markdown = `---
marp: true
theme: tsmap
paginate: true
title: "Learn tsmap"
description: "The Learn tsmap lessons in one document. The latest version is always at ${ONLINE}"
footer: "Learn tsmap"
---

${out.join('\n---\n\n')}`;
  return { markdown, slideCount: next - 1 + Math.ceil(entries.length / TERMS_PER_SLIDE) };
}
