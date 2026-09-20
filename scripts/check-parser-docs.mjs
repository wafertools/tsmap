#!/usr/bin/env node
// Verifies packages/parsers/README.md against the Rust source it documents.
//
// That README is the parser's only API contract: `testdata_parser.d.ts` is
// wasm-bindgen output and types every return value as `any`, so nothing in the
// type system tells a caller what a result holds. It ships in the npm package and
// llms.txt sends coding agents to it. A field that exists in the Rust and not in
// the README is therefore invisible to every consumer — which is exactly what had
// happened: `ParsedStdf.passHbins` (the file's own pass/fail truth), `hbinDefs`,
// `sbinDefs`, `DieResult.testPass` and `dieIndex` were all undocumented, three
// WASM exports were missing from the API table, and `x`/`y` were shown as
// required when both are `Option`.
//
// Checks:
//   1. every #[wasm_bindgen] export is named in the README
//   2. every serialised struct field (camelCased, as serde emits it) is named
//   3. an `Option` field is documented as optional (`field?:`), and a required
//      one is not documented as optional
//   4. the TypeScript declarations emitted from lib.rs describe the same fields —
//      they are hand-written, so they can drift from the Rust exactly as the
//      README did, and they are what a consumer's compiler believes
//   5. the warning and error codes in those declarations are the codes the Rust
//      actually produces, in both directions
//
// Run:  node scripts/check-parser-docs.mjs      (wired into check:docs)
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = resolve(root, 'packages/parsers/src');
const README = resolve(root, 'packages/parsers/README.md');

const errors = [];
const readme = readFileSync(README, 'utf8');
const lib = readFileSync(resolve(SRC, 'lib.rs'), 'utf8');

const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

// Prose is not documentation for this purpose. A field mentioned in a sentence but
// missing from the type block still leaves a caller unable to see it while reading
// the shape, and an export described in passing is not in the API table anyone
// scans. So each claim is checked against the part of the README that carries it:
//   - exports  -> a table row, `| \`name\` | …`
//   - fields   -> inside a fenced code block
// Both misses were real: dropping `passHbins` from the type block and renaming a
// row's export went undetected while the names still appeared in prose nearby.
const tableRows = readme.split('\n').filter((l) => /^\|\s*`/.test(l)).join('\n');
// Anchored at line starts, and the info string is required to be a language tag,
// so a closing fence cannot be mistaken for an opening one — an unanchored
// version matched `closing-fence \\n prose \\n opening-fence` and captured the prose
// between blocks instead of the blocks.
const typeBlocks = [...readme.matchAll(/^```(?:ts|rust)\n([\s\S]*?)^```/gm)].map((m) => m[1]).join('\n');

// ── 1. WASM exports ─────────────────────────────────────────────────────────

const wasmExports = [...lib.matchAll(/#\[wasm_bindgen[^\]]*\]\s*pub fn (\w+)/g)].map((m) => m[1])
  // `init` is the panic hook wasm-bindgen(start) calls; the README covers
  // initialization in prose rather than as an API-table row.
  .filter((name) => name !== 'init');

if (wasmExports.length < 10) {
  errors.push(`only found ${wasmExports.length} #[wasm_bindgen] exports in lib.rs — has the file's shape changed?`);
}
for (const name of wasmExports) {
  if (!new RegExp(`\`${name}\``).test(tableRows)) {
    errors.push(`packages/parsers/README.md has no API-table row for the WASM export '${name}' — ` +
                `a caller has no other way to learn it exists`);
  }
}

// ── 2 & 3. Serialised struct fields ─────────────────────────────────────────
//
// Only `#[derive(..., Serialize, ...)]` structs matter: those are what crosses
// into JS. A field's serialised name is its snake_case name camelCased, because
// every one of these carries #[serde(rename_all = "camelCase")].

let rust = '';
for (const f of readdirSync(SRC)) if (f.endsWith('.rs')) rust += readFileSync(join(SRC, f), 'utf8') + '\n';

// Structs the README documents as a TS interface or Rust block. Anything else is
// internal plumbing and deliberately not in the docs.
const DOCUMENTED = [
  'ScanResult', 'FileMeta', 'DieResult', 'TestDef', 'WaferData',
  'MetaField', 'LotMeta', 'SiteInfo', 'BinDef', 'ParsedStdf',
];

for (const name of DOCUMENTED) {
  const m = rust.match(new RegExp(`((?:#\\[[^\\]]*\\]\\s*)*)pub struct ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!m) { errors.push(`could not find 'pub struct ${name}' in packages/parsers/src — did it move or get renamed?`); continue; }
  const [, attrs, body] = m;
  if (!/Serialize/.test(attrs)) { errors.push(`${name} is documented as a return shape but no longer derives Serialize`); continue; }

  // Each field with the serde attributes immediately above it, so the
  // optionality test can see them.
  for (const fm of body.matchAll(/((?:^[ \t]*#\[[^\]]*\]\n)*)^[ \t]*pub (\w+): ([^,\n]+),/gm)) {
    const [, fieldAttrs, field, type] = fm;
    const js = camel(field);
    // Absent from the JS object either because it is an Option, or because serde
    // skips it when empty — `skip_serializing_if` on a Vec/HashMap is exactly as
    // absent to a caller as a None is, and needs the same `?.` guard.
    const optional = type.trim().startsWith('Option<') || /skip_serializing_if/.test(fieldAttrs);
    if (!new RegExp(`\\b${js}\\b`).test(typeBlocks)) {
      errors.push(`${name}.${js} is serialised to JS but is in no README.md type block — ` +
                  `undocumented means invisible, since the .d.ts types every result as 'any'`);
      continue;
    }
    // `field?:` / `field:` inside a fenced type block — the optionality claim.
    const shownOptional = new RegExp(`^\\s*(?:pub )?${js}\\?:`, 'm').test(typeBlocks);
    const shownRequired = new RegExp(`^\\s*(?:pub )?${js}:`, 'm').test(typeBlocks);
    if (optional && shownRequired && !shownOptional) {
      errors.push(`README.md shows ${name}.${js} as required, but Rust omits it from the output ` +
                  `when absent or empty — a caller will not guard it`);
    }
    if (!optional && shownOptional && !shownRequired) {
      errors.push(`README.md shows ${name}.${js} as optional, but it is always serialised — ` +
                  `callers will write a needless guard, or doubt the field`);
    }
  }
}

// ── 4. The emitted TypeScript describes the same shapes ─────────────────────
//
// `typescript_custom_section` is a Rust string literal: nothing type-checks it
// against the structs it mirrors. A consumer's compiler trusts it completely, so
// a field missing here is worse than one missing from the README — it makes
// correct code look like an error, and wrong code compile.

const tsSection = (() => {
  const m = lib.match(/const TS_TYPES: &'static str = r#"([\s\S]*?)"#;/);
  if (!m) { errors.push('lib.rs: could not find the TS_TYPES typescript_custom_section'); return ''; }
  return m[1];
})();

for (const name of DOCUMENTED) {
  const m = rust.match(new RegExp(`pub struct ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!m) continue;                                   // already reported in step 2
  const tsBlock = tsSection.match(new RegExp(`interface ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!tsBlock) { errors.push(`lib.rs TS_TYPES has no 'interface ${name}' — a consumer gets no type for it`); continue; }
  for (const fm of m[1].matchAll(/((?:^[ \t]*#\[[^\]]*\]\n)*)^[ \t]*pub (\w+): ([^,\n]+),/gm)) {
    const [, fieldAttrs, field, type] = fm;
    const js = camel(field);
    const optional = type.trim().startsWith('Option<') || /skip_serializing_if/.test(fieldAttrs);
    const decl = tsBlock[1].match(new RegExp(`^\\s*${js}(\\??):`, 'm'));
    if (!decl) {
      errors.push(`${name}.${js} is serialised to JS but absent from 'interface ${name}' in lib.rs — ` +
                  `a consumer reading it gets a type error on correct code`);
      continue;
    }
    if (optional !== (decl[1] === '?')) {
      errors.push(`lib.rs TS_TYPES declares ${name}.${js} as ` +
                  `${decl[1] === '?' ? 'optional' : 'required'}, but Rust says ` +
                  `${optional ? 'it is omitted when absent or empty' : 'it is always serialised'}`);
    }
  }
}

// ── 5. Codes match the Rust, both ways ──────────────────────────────────────
//
// A code is the whole point of the structured shapes: it is what a caller
// branches on. A union that lists a code the Rust never emits sends someone
// writing a dead branch; one that omits a code the Rust does emit makes a correct
// branch a type error. Checked in both directions for warnings and errors alike.

const unionMembers = (name) => {
  const m = tsSection.match(new RegExp(`type ${name} =([\\s\\S]*?);`));
  return m ? [...m[1].matchAll(/"([a-z-]+)"/g)].map((x) => x[1]) : null;
};

const rustCodes = (file, fnName) => {
  const src = readFileSync(resolve(SRC, file), 'utf8');
  // The constructors' own code literals: ParserWarning::error("x", …) /
  // Self::new("x", …). Both shapes appear, so match the string in either.
  return [...src.matchAll(new RegExp(`${fnName}\\(\\s*"([a-z-]+)"`, 'g'))].map((m) => m[1]);
};

for (const [unionName, file, patterns] of [
  ['ParserWarningCode', 'types.rs', ['ParserWarning::error', 'ParserWarning::warning']],
  ['ParseErrorCode',    'error.rs', ['Self::new']],
]) {
  const declared = unionMembers(unionName);
  if (!declared) { errors.push(`lib.rs TS_TYPES has no '${unionName}' union`); continue; }
  const emitted = [...new Set(patterns.flatMap((p) => rustCodes(file, p)))];
  if (!emitted.length) { errors.push(`could not read any codes out of ${file} — has the constructor shape changed?`); continue; }
  for (const code of emitted) {
    if (!declared.includes(code)) {
      errors.push(`${file} produces the code '${code}', missing from ${unionName} in lib.rs — ` +
                  `a caller branching on it gets a type error on correct code`);
    }
  }
  for (const code of declared) {
    if (!emitted.includes(code)) {
      errors.push(`${unionName} lists '${code}', which nothing in ${file} produces — ` +
                  `someone will write a branch that can never run`);
    }
  }
}

if (errors.length) {
  console.error(`parser docs check failed (${errors.length}):\n`);
  for (const e of errors) console.error('  • ' + e);
  console.error('');
  process.exit(1);
}

const codeCount = ['ParserWarningCode', 'ParseErrorCode']
  .reduce((n, u) => n + (unionMembers(u)?.length ?? 0), 0);
console.log(`parser docs OK — ${wasmExports.length} WASM exports, ${DOCUMENTED.length} return shapes ` +
            `and ${codeCount} codes agree across the Rust, the TypeScript and the README`);
