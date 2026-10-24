/**
 * Marp configuration for the one-PDF course (scripts/lessons/course-book.mjs), built by scripts/build-lessons.mjs.
 *
 * The PDF's bookmarks come from the slides' headings, so left alone every slide title would be a bookmark: about four
 * hundred in a flat list. This keeps real headings only where they should be bookmarks: a lesson's cover slide (the
 * lesson) and a section divider (a section, one level down). Every other heading is drawn the same way, with the theme's
 * `.h1` and `.h2` classes, but is not a heading in the document, so it adds no bookmark.
 */
import base from './marp.config.mjs';

function outlineHeadings(md) {
  md.core.ruler.push('tsmap_pdf_outline', (state) => {
    const tokens = state.tokens;
    let classes = [];
    tokens.forEach((t, i) => {
      if (t.type === 'marpit_slide_open') classes = (t.attrGet('class') ?? '').split(/\s+/);
      if (t.type !== 'heading_open') return;
      const level = Number(t.tag.slice(1));
      const asHeading = classes.includes('title') && !classes.includes('no-outline') && level === 1;
      if (asHeading) return;
      const section = classes.includes('divider') && level === 1;
      const close = tokens.findIndex((x, j) => j > i && x.type === 'heading_close');
      const tag = section ? 'h2' : 'div';
      t.tag = tag;
      tokens[close].tag = tag;
      t.attrJoin('class', level === 1 ? 'h1' : 'h2');
      // Marp CLI builds the bookmarks from `heading_open` tokens, by type, and takes the level from the number of `#`.
      // A section divider stays one, a level down from its lesson; every other heading stops being one.
      if (section) t.markup = '##';
      else { t.type = 'tsmap_plain_heading_open'; tokens[close].type = 'tsmap_plain_heading_close'; }
    });
  });
}

export default { ...base, engine: (opts) => base.engine(opts).use(outlineHeadings) };
