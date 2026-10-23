/**
 * Lesson 12 — Automation and integration. Screenshots for docs/learn/12-automation.md.
 *
 * The Help menu (User guide, Definitions file formats…, Reset saved settings…, About tsmap…), the bin definitions
 * dialog and the column mapping's Load bin definitions…, and a sample opened straight from a link
 * (?dataUrl=…&dataFormat=…). The command line and file associations are desktop-only, so the deck teaches them from
 * the user guide without pictures. Run by scripts/lesson-shots.mjs.
 */

import { isVisible, hasText } from '../lib/checks.mjs';
import { SAMPLEDATA } from '../lib/paths.mjs';

const DIALOG = '[role="dialog"]';
const PARK = ['hover', '#toolbar-title'];
const HELP = '#help-btn';
const helpItem = (t) => `button:has-text("${t}")`;
const hdr = { rect: { x: 0, y: 0, width: 1280, height: 820 } };

export const scenario = {
  session: '12',
  title: 'Automation and integration',
  theme: 'github-light',
  viewport: { width: 1280, height: 820 },
  deviceScaleFactor: 2,
  beats: [
    {
      id: '01-help-menu',
      title: 'Help works with nothing loaded: User guide, definitions formats, reset, About',
      steps: [['click', HELP], ['wait', 400]],
      checks: [isVisible(helpItem('Definitions file formats'), 'the Help menu is open')],
      shots: [{ name: 'help-menu', clip: { rect: { x: 900, y: 0, width: 380, height: 210 } }, callouts: [[HELP, { pad: 2 }]] }],
    },
    {
      id: '02-definitions-formats',
      title: 'Definitions file formats…: a Save template… button for each kind of file',
      steps: [['click', helpItem('Definitions file formats')], ['wait', 800]],
      checks: [isVisible(DIALOG, 'the window is open')],
      shots: [{ name: 'definitions-formats', clip: { target: DIALOG, pad: 12 } }],
    },
    {
      id: '03-reset-settings',
      title: 'Reset saved settings… lists what tsmap remembers, so you can forget some of it',
      steps: [['press', 'Escape'], ['wait', 400], ['click', HELP], ['wait', 300], ['click', helpItem('Reset saved settings')], ['wait', 800]],
      checks: [isVisible(DIALOG, 'the window is open')],
      shots: [{ name: 'reset-settings', clip: { target: DIALOG, pad: 12 } }],
    },
    {
      id: '05-bin-definitions',
      title: 'Setup ▾ → Bin definitions…: Save…, Load… and a list of recently used files',
      steps: [['press', 'Escape'], ['wait', 300], ['click', 'button:has-text("Load sample data")'], ['waitForWafers'], ['click', '#lot-btn'], ['wait', 300], ['click', 'button:has-text("Bin definitions")'], ['wait', 800]],
      checks: [isVisible(DIALOG, 'the window is open')],
      shots: [{
        name: 'bin-definitions',
        clip: { target: DIALOG, pad: 12 },
        callouts: [[`${DIALOG} button:text-is("Save…")`, { badge: 1, pad: 2 }], [`${DIALOG} button:text-is("Load…")`, { badge: 2, pad: 2 }], [`${DIALOG} button[aria-label="Load a recently used definitions file"]`, { badge: 3, pad: 2 }]],
      }],
    },
    {
      id: '05b-recent-definitions',
      title: 'The ▾ beside Load… lists the definitions files used recently',
      steps: [['click', `${DIALOG} button:text-is("Save…")`], ['wait', 1200], ['click', `${DIALOG} button[aria-label="Load a recently used definitions file"]`], ['wait', 600]],
      checks: [hasText('body', 'Choose a file…')],
      shots: [{ name: 'recent-definitions', clip: { rect: { x: 400, y: 320, width: 740, height: 270 } } }],
    },
    {
      id: '06-mapping-bin-definitions',
      title: 'For CSV, JSON and Parquet, the column mapping has its own Load bin definitions…',
      steps: [['press', 'Escape'], ['wait', 300], ['press', 'Escape'], ['wait', 300], ['click', '#reset-btn'], ['wait', 800], ['loadFile', `${SAMPLEDATA}/MPW-LOT-08.csv`], ['waitForOverlay', '.mapping-panel'], ['wait', 500]],
      checks: [isVisible('button:has-text("Load bin definitions")', 'the mapping offers Load bin definitions…')],
      shots: [{
        name: 'mapping-bin-definitions',
        clip: { rect: { x: 0, y: 740, width: 700, height: 80 } },
        callouts: [['button:has-text("Load bin definitions")', { pad: 2 }]],
      }],
    },
  ],
};
