/**
 * Lesson 12 — Automation and integration. Screenshots for docs/learn/12-automation.md.
 *
 * The Help menu (User guide, Definitions file formats…, About tsmap…), the Preferences menu (Export or import settings…, Reset saved settings…), the bin definitions
 * dialog and the column mapping's Load bin definitions…, and a sample opened straight from a link
 * (?dataUrl=…&dataFormat=…). The command line and file associations are desktop-only, so the deck teaches them from
 * the user guide without pictures. Run by scripts/lesson-shots.mjs.
 */

import { isVisible, hasText } from '../lib/checks.mjs';
import { SAMPLEDATA } from '../lib/paths.mjs';

const DIALOG = '[role="dialog"]';
const PARK = ['hover', '#toolbar-title'];
const HELP = '#help-btn';
const PREFERENCES = '#preferences-btn';
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
      title: 'Help works with nothing loaded: User guide, shortcuts, definitions formats, support, About',
      steps: [['click', HELP], ['wait', 400]],
      checks: [isVisible(helpItem('Definitions file formats'), 'the Help menu is open')],
      shots: [{ name: 'help-menu', clip: { rect: { x: 900, y: 0, width: 380, height: 210 } }, callouts: [[HELP, { pad: 2 }]] }],
    },
    {
      id: '01b-preferences-menu',
      title: 'Preferences works with nothing loaded: export and import, reset, and the troubleshooting switch',
      steps: [['press', 'Escape'], ['wait', 300], ['click', PREFERENCES], ['wait', 400]],
      checks: [isVisible(helpItem('Reset saved settings'), 'the Preferences menu is open')],
      shots: [{ name: 'preferences-menu', clip: { rect: { x: 880, y: 0, width: 400, height: 230 } }, callouts: [[PREFERENCES, { pad: 2 }]] }],
    },
    {
      id: '01c-settings-dialog',
      title: 'Export or import settings…: mappings on one side, the other settings on the other',
      steps: [['press', 'Escape'], ['wait', 300], ['click', PREFERENCES], ['wait', 300], ['click', helpItem('Export or import settings')], ['wait', 800]],
      checks: [isVisible(DIALOG, 'the window is open')],
      shots: [{ name: 'settings-dialog', clip: { target: DIALOG, pad: 12 } }],
    },
    {
      id: '01d-shortcuts',
      title: 'Help ▾ → Keyboard shortcuts…: the keys for maps, windows and menus',
      steps: [['press', 'Escape'], ['wait', 400], ['click', HELP], ['wait', 300], ['click', helpItem('Keyboard shortcuts')], ['wait', 800]],
      checks: [isVisible(DIALOG, 'the window is open')],
      shots: [{ name: 'shortcuts', clip: { target: DIALOG, pad: 12 } }],
    },
    {
      id: '02-definitions-formats',
      title: 'Definitions file formats…: a Save template… button for each kind of file',
      steps: [['press', 'Escape'], ['wait', 300], ['click', HELP], ['wait', 300], ['click', helpItem('Definitions file formats')], ['wait', 800]],
      checks: [isVisible(DIALOG, 'the window is open')],
      shots: [{ name: 'definitions-formats', clip: { target: DIALOG, pad: 12 } }],
    },
    {
      id: '03-reset-settings',
      title: 'Reset saved settings… lists what tsmap remembers, so you can forget some of it',
      steps: [['press', 'Escape'], ['wait', 400], ['click', PREFERENCES], ['wait', 300], ['click', helpItem('Reset saved settings')], ['wait', 800]],
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
      id: '05c-setup-file',
      title: 'Setup ▾ → Setup file…: Save…, Load… and a list of recently used files',
      steps: [['press', 'Escape'], ['wait', 300], ['press', 'Escape'], ['wait', 300], ['press', 'Escape'], ['wait', 300], ['click', '#lot-btn'], ['wait', 300], ['click', 'button:has-text("Setup file")'], ['wait', 800]],
      checks: [isVisible(DIALOG, 'the Setup file window is open'), hasText(DIALOG, 'Save')],
      shots: [{ name: 'setup-file', clip: { target: DIALOG, pad: 12 } }],
    },
    {
      id: '05b-recent-definitions',
      title: 'The ▾ beside Load… lists the definitions files used recently',
      steps: [['click', `${DIALOG} button:text-is("Save…")`], ['wait', 1200], ['click', `${DIALOG} button[aria-label="Load a recently used definitions file"]`], ['wait', 600]],
      checks: [hasText('body', 'Choose a file…')],
      shots: [{ name: 'recent-definitions', clip: { rect: { x: 320, y: 220, width: 960, height: 500 } } }],
    },
    {
      id: '06-mapping-bin-definitions',
      title: 'For CSV, JSON and Parquet, the column mapping has its own Load bin definitions…',
      steps: [['press', 'Escape'], ['wait', 300], ['press', 'Escape'], ['wait', 300], ['click', '#reset-btn'], ['wait', 800], ['loadFile', `${SAMPLEDATA}/MPW-LOT-08.csv`], ['waitForOverlay', '.mapping-panel'], ['wait', 500]],
      checks: [isVisible('button:has-text("Load bin definitions")', 'the mapping offers Load bin definitions…'), isVisible('button:has-text("Name bins")', 'the mapping offers Name bins…')],
      shots: [{
        name: 'mapping-bin-definitions',
        clip: { rect: { x: 0, y: 740, width: 700, height: 80 } },
        callouts: [['button:has-text("Name bins")', { pad: 2 }], ['button:has-text("Load bin definitions")', { pad: 2 }]],
      }],
    },
    {
      id: '07-desktop-preferences',
      title: 'Desktop app: Preferences also has File associations…',
      steps: [['press', 'Escape'], ['wait', 300], ['desktopMode', true], ['click', PREFERENCES], ['wait', 400]],
      checks: [isVisible(helpItem('File associations'), 'the Preferences menu lists File associations…')],
      shots: [{ name: 'preferences-desktop', clip: { rect: { x: 880, y: 0, width: 400, height: 270 } }, callouts: [[helpItem('File associations'), { pad: 2 }]] }],
    },
    {
      id: '08-file-associations',
      title: 'File associations…: one row per type, opted in or not, with a warning when the registered tsmap is another copy',
      steps: [['click', helpItem('File associations')], ['wait', 800]],
      checks: [isVisible(DIALOG, 'the window is open')],
      shots: [{ name: 'file-associations', clip: { target: DIALOG, pad: 12 } }],
    },
    {
      id: '09-reset-settings-desktop',
      title: 'Reset saved settings… lists the recent files on the desktop app',
      steps: [['press', 'Escape'], ['wait', 400], ['click', PREFERENCES], ['wait', 300], ['click', helpItem('Reset saved settings')], ['wait', 800]],
      checks: [isVisible(DIALOG, 'the window is open')],
      shots: [{ name: 'reset-settings-desktop', clip: { target: DIALOG, pad: 12 } }],
    },
  ],
};
