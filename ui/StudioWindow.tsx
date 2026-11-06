import { Astal, Gdk, Gtk } from "ags/gtk4";
import GLib from "gi://GLib?version=2.0";
import Pango from "gi://Pango?version=1.0";
import { createEffect, createState } from "ags";
import { execAsync } from "ags/process";
import { theme } from "ags-platform/adapters/theme";
import type { Palette } from "ags-platform/ports/palette";
import {
  DEFAULT_CONTROLS,
  FIXED_FILL_LEVELS,
  backdropColour,
  meterFill,
  type PreviewControls,
} from "../lib/preview";
import { parseBtopConf, presetAt } from "../lib/btop-conf";
import { buildSchematic, hiddenModuleWarning } from "../lib/schematic";
import {
  GRAPH_GLYPHS,
  clampPercent,
  gradientAt,
  graphLevels,
  meterBand,
  type GradientStops,
} from "../lib/schematic-graphics";
import { KEY_GROUPS } from "../lib/theme-keys";
import { KEY_WIDGET_MAP, isUnreferenced, modulesFor, sitesFor } from "../lib/key-map";
import {
  FALLBACK_PALETTE,
  GRADIENT_LIMIT_NOTE,
  type Scope,
  type Theme,
  addMiddleColour,
  applyPick,
  createTheme,
  deleteTheme,
  diagnose,
  diffEdits,
  duplicateTheme,
  effectiveMap,
  fixReserveSurface,
  fixTransparentMeters,
  forkTheme,
  generatedDefaultMap,
  markActive,
  parseTheme,
  resolveHex,
  serializeTheme,
} from "../lib/theme-model";
import {
  actionLabel,
  activeThemePath,
  divergenceCaveat,
  generatedInstalledWarning,
  resolvedPath,
  type SaveTarget,
  targetHint,
} from "../lib/targets";

// ── file helpers (the ONLY I/O in the studio; the lib/ layer stays pure) ────

function readFile(path: string): string | null {
  try {
    const [ok, bytes] = GLib.file_get_contents(path);
    if (!ok) return null;
    return new TextDecoder().decode(bytes as Uint8Array);
  } catch {
    return null;
  }
}

function writeFile(path: string, text: string): void {
  const parent = path.slice(0, path.lastIndexOf("/"));
  GLib.mkdir_with_parents(parent, 0o755);
  GLib.file_set_contents(path, text);
}

function repoRoot(): string {
  return GLib.getenv("BTOP_STUDIO_REPO_ROOT") || `${GLib.get_home_dir()}/.dotfiles`;
}

function installDir(): string {
  return GLib.getenv("BTOP_STUDIO_INSTALL_DIR") || `${GLib.get_user_data_dir()}/dotfiles`;
}

function stateHome(): string {
  return GLib.getenv("XDG_STATE_HOME") || `${GLib.get_home_dir()}/.local/state`;
}

function configHome(): string {
  return GLib.getenv("XDG_CONFIG_HOME") || `${GLib.get_home_dir()}/.config`;
}

function confSourcePath(): string {
  const spine = `${installDir()}/config/btop/btop.conf`;
  return readFile(spine) !== null ? spine : `${configHome()}/btop/btop.conf`;
}

function loadConfText(): string {
  return (
    readFile(`${installDir()}/config/btop/btop.conf`) ??
    readFile(`${configHome()}/btop/btop.conf`) ??
    'shown_boxes = "cpu mem net proc"\npresets = ""\n'
  );
}

/**
 * The typed palette comes from the platform Theme port (`palette()`), never
 * from an app-side parse of `colors.yaml`: the runtime owns the artifact and
 * the platform owns its vocabulary. If the producer has not written one yet
 * (first launch), a semantic fallback keeps the studio usable without
 * resurrecting the legacy `background`/`foreground`/`colors:` carrier shape.
 */
function loadPalette(): Palette {
  try {
    return theme.palette();
  } catch {
    return FALLBACK_PALETTE;
  }
}

function loadGeneratedMap(): Record<string, string> {
  const text = readFile(`${stateHome()}/dotfiles/current/colors.btop.theme`);
  return text ? parseTheme(text) : generatedDefaultMap();
}

function initialLibrary(): Theme[] {
  return [
    { id: "generated", name: "colors.btop", kind: "generated", active: true, map: loadGeneratedMap() },
  ];
}

/** A single CSS rule string with the colour literal escaped from the palette. */
function fillRule(selector: string, hex: string): string {
  return `${selector} { background-color: ${hex || "transparent"}; }`;
}

/** Escape a string for Pango markup (labels may carry user theme names). */
function escapeMarkup(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A Pango span with a resolved theme colour. */
function colourSpan(hex: string, text: string, weight?: string): string {
  const attrs = [`foreground="${hex}"`];
  if (weight) attrs.push(`weight="${weight}"`);
  return `<span ${attrs.join(" ")}>${escapeMarkup(text)}</span>`;
}

/** `rgba()` from a resolved hex, for GTK CSS transparencies. */
function rgbaHex(hex: string, alpha: number): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return `rgba(255, 255, 255, ${alpha})`;
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

// ── the window ──────────────────────────────────────────────────────────────

/**
 * Studio palette refresher, registered by the one studio window and called from
 * the app-level `palette-refresh` handler. It reloads the runtime palette and
 * the generated base map only; pending edits, the selected theme, the picker
 * scope and the active save target stay exactly as they are.
 */
let refreshPalette: (() => void) | null = null;

export function refreshStudioPalette(): void {
  refreshPalette?.();
}

const LIVE_PLACEHOLDER = "Live preview not rendered yet — press “Refresh live preview”.";

export function StudioWindow(gdkmonitor: Gdk.Monitor) {
  const [confText] = createState(loadConfText());
  const [palette, setPalette] = createState<Palette>(loadPalette());
  const [themes, setThemes] = createState<Theme[]>(initialLibrary());
  const [currentId, setCurrentId] = createState("generated");
  const [selected, setSelected] = createState<string | null>("meter_bg");
  const [scope, setScope] = createState<Scope>("key");
  const [pending, setPending] = createState<ReadonlyMap<string, string>>(new Map());
  const [target, setTarget] = createState<SaveTarget>("repo");
  const [preset, setPreset] = createState(0);
  const [controls, setControls] = createState<PreviewControls>(DEFAULT_CONTROLS);
  const [highlight, setHighlight] = createState(true);
  const [status, setStatus] = createState("");
  let themeSeq = 1;

  const conf = () => parseBtopConf(confText());
  const current = () => themes().find((t) => t.id === currentId()) ?? themes()[0];
  const effective = () => effectiveMap(current().map, pending());

  function reloadPaletteForRefresh(): void {
    setPalette(loadPalette());
    const generatedMap = loadGeneratedMap();
    setThemes(
      themes().map((theme) =>
        theme.id === "generated" ? { ...theme, map: generatedMap } : theme,
      ),
    );
  }

  refreshPalette = reloadPaletteForRefresh;

  // ── library actions ──────────────────────────────────────────────────────
  function addTheme(theme: Theme): void {
    setThemes([...themes(), theme]);
    setCurrentId(theme.id);
    setPending(new Map());
  }

  function fork(): void {
    const base = current();
    const name = base.kind === "generated" ? "colors.btop-fork" : `${base.name}-copy`;
    addTheme(forkTheme(base, `t${themeSeq}`, name, palette()));
    themeSeq += 1;
  }

  function duplicate(): void {
    const base = current();
    addTheme(duplicateTheme(base, `t${themeSeq}`, `${base.name}-copy`));
    themeSeq += 1;
  }

  function newTheme(): void {
    addTheme(createTheme(`t${themeSeq}`, `btop-custom-${themeSeq}`, generatedDefaultMap()));
    themeSeq += 1;
  }

  function remove(): void {
    if (current().kind === "generated") {
      setStatus("colors.btop follows the wallpaper — fork it instead of deleting.");
      return;
    }
    const next = deleteTheme({ themes: themes() }, current().id).themes;
    setThemes([...next]);
    setCurrentId(next[0].id);
    setPending(new Map());
  }

  function pick(value: string): void {
    const key = selected();
    if (!key) return;
    setPending(applyPick(pending(), key, value, scope(), current().map));
  }

  function setActive(): void {
    setThemes([...markActive({ themes: themes() }, current().id).themes]);
    const path = activeThemePath({ repoRoot: repoRoot(), installDir: installDir() });
    writeFile(path, `${current().name}\n`);
    setStatus(`Active theme recorded in the install spine (${path}).`);
  }

  function applyFix(kind: "reserve" | "transparent"): void {
    const next = kind === "reserve" ? fixReserveSurface(effective()) : fixTransparentMeters(effective());
    const edits = new Map(pending());
    for (const key of Object.keys(next)) {
      if (current().map[key] !== next[key]) edits.set(key, next[key]);
    }
    setPending(edits);
  }

  function save(): void {
    const theme = current();
    const ctx = { repoRoot: repoRoot(), installDir: installDir() };
    const path = resolvedPath(theme, target(), ctx).replace(" (pointer)", "");
    const text = serializeTheme(effective());
    try {
      writeFile(path, text);
      setPending(new Map());
      if (target() === "installed") {
        void execAsync(["bash", "-lc", "pkill -USR2 btop 2>/dev/null || true"]).catch(() => {});
        setStatus(`Saved to ${path} and reloaded btop (SIGUSR2).`);
      } else {
        setStatus(`Saved to repo: ${path} — deployed by bootstrap on the next provision.`);
      }
    } catch (error: unknown) {
      setStatus(`Save failed: ${error}`);
    }
  }

  // ── widgets ──────────────────────────────────────────────────────────────
  //
  // AD-24 measured, not assumed: this tree builds in 13.1 ms (instrumented
  // copy, distinct instance), and the ~95 ms seen around the call is GTK's
  // first-window initialization, which no build reordering can move. 13 ms is
  // a light surface, so the studio keeps the DIRECT path -- presenting first
  // and deferring this work would add a controller, a signature and an idle
  // tick (plus a createRoot lifetime for the effects) to buy single-digit ms.
  const shell = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["studio-shell"],
    hexpand: true,
    vexpand: true,
  });

  // Header / intro strip (mock v8 `.note`).
  const header = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 10,
    css_classes: ["studio-header"],
  });
  header.append(new Gtk.Label({ label: "btop Theme Studio", xalign: 0, css_classes: ["studio-title"] }));
  header.append(
    new Gtk.Label({
      label: "Author a theme against your real btop config — edit on Components, verify on Live.",
      xalign: 0,
      hexpand: true,
      css_classes: ["studio-subtitle"],
    }),
  );
  header.append(
    new Gtk.Label({
      label: "48 keys · real btop on a pty · Esc closes",
      xalign: 1,
      css_classes: ["studio-subtitle"],
    }),
  );
  shell.append(header);

  const root = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    css_classes: ["studio-root"],
    hexpand: true,
    vexpand: true,
  });
  shell.append(root);

  // ── shared section chrome ────────────────────────────────────────────────
  function section(title: string, sub?: string): Gtk.Box {
    const box = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 6,
      css_classes: ["section-header"],
    });
    box.append(new Gtk.Label({ label: title.toUpperCase(), xalign: 0, css_classes: ["section-title"] }));
    if (sub) {
      box.append(new Gtk.Label({ label: sub, xalign: 0, hexpand: true, css_classes: ["section-sub"] }));
    }
    return box;
  }

  function body(): Gtk.Box {
    return new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6, css_classes: ["studio-body"] });
  }

  function field(label: string, value: Gtk.Label): Gtk.Box {
    const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2 });
    box.append(new Gtk.Label({ label, xalign: 0, css_classes: ["field-label"] }));
    box.append(value);
    return box;
  }

  // ── left rail ────────────────────────────────────────────────────────────
  const leftScroll = new Gtk.ScrolledWindow({
    vexpand: true,
    hscrollbar_policy: Gtk.PolicyType.NEVER,
    css_classes: ["studio-left-scroll"],
  });
  const left = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, css_classes: ["studio-left"] });
  leftScroll.set_child(left);
  root.append(leftScroll);

  // Save target.
  const targetRow = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6, css_classes: ["target-row"] });
  const repoBtn = new Gtk.Button({ label: "Repo", css_classes: ["toggle"], hexpand: true });
  const instBtn = new Gtk.Button({ label: "Installed", css_classes: ["toggle"], hexpand: true });
  repoBtn.connect("clicked", () => setTarget("repo"));
  instBtn.connect("clicked", () => setTarget("installed"));
  targetRow.append(repoBtn);
  targetRow.append(instBtn);
  const targetLabel = new Gtk.Label({ label: "writes to — repo", xalign: 0, css_classes: ["field-label"] });
  const targetPath = new Gtk.Label({
    xalign: 0,
    wrap: true,
    css_classes: ["studio-path", "rw"],
  });
  const targetHintLabel = new Gtk.Label({ xalign: 0, wrap: true, css_classes: ["hint"] });
  const caveat = new Gtk.Label({ xalign: 0, wrap: true, css_classes: ["warn"] });

  left.append(section("Save target"));
  const targetBody = body();
  targetBody.append(targetRow);
  targetBody.append(targetLabel);
  targetBody.append(targetPath);
  targetBody.append(targetHintLabel);
  targetBody.append(caveat);
  left.append(targetBody);

  // Read-only inputs.
  const palettePath = new Gtk.Label({
    label: `${stateHome()}/dotfiles/current/colors.yaml`,
    xalign: 0,
    wrap: true,
    css_classes: ["studio-path"],
  });
  const generatedPath = new Gtk.Label({
    label: `${stateHome()}/dotfiles/current/colors.btop.theme`,
    xalign: 0,
    wrap: true,
    css_classes: ["studio-path"],
  });
  const confPath = new Gtk.Label({
    label: confSourcePath(),
    xalign: 0,
    wrap: true,
    css_classes: ["studio-path"],
  });
  left.append(section("Inputs", "— read-only"));
  const inputsBody = body();
  inputsBody.append(field("Palette", palettePath));
  inputsBody.append(field("Generated theme (derived)", generatedPath));
  inputsBody.append(field("btop config (consumed)", confPath));
  left.append(inputsBody);

  // Consumed btop.conf.
  const cfgLabel = new Gtk.Label({ xalign: 0, wrap: true, css_classes: ["studio-cfg"] });
  left.append(section("Consumed from btop.conf"));
  const cfgBody = body();
  cfgBody.append(cfgLabel);
  left.append(cfgBody);

  // Theme library.
  const libBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2, css_classes: ["studio-lib"] });
  left.append(section("Themes", "— ★ = used by btop"));
  const libBody = body();
  libBody.append(libBox);
  left.append(libBody);

  const libActions = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6, css_classes: ["lib-actions"] });
  const newBtn = new Gtk.Button({ label: "+ New", css_classes: ["toggle"], hexpand: true });
  const dupBtn = new Gtk.Button({ label: "Duplicate", css_classes: ["toggle"], hexpand: true });
  const forkBtn = new Gtk.Button({ label: "Fork", css_classes: ["toggle"], hexpand: true });
  const delBtn = new Gtk.Button({ label: "Delete", css_classes: ["toggle"], hexpand: true });
  const activeBtn = new Gtk.Button({ label: "★ Active", css_classes: ["toggle"], hexpand: true });
  newBtn.connect("clicked", newTheme);
  dupBtn.connect("clicked", duplicate);
  forkBtn.connect("clicked", fork);
  delBtn.connect("clicked", remove);
  activeBtn.connect("clicked", setActive);
  for (const button of [newBtn, dupBtn, forkBtn, delBtn, activeBtn]) libActions.append(button);
  left.append(libActions);

  const stockNote = new Gtk.Label({
    label: "Stock btop themes stay available in /usr/share/btop/themes; the studio only edits what it owns.",
    xalign: 0,
    wrap: true,
    css_classes: ["stock-note"],
  });
  left.append(stockNote);

  // Key list.
  const keysFor = new Gtk.Label({ xalign: 0, hexpand: true, css_classes: ["section-sub"] });
  const keysHeader = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 6,
    css_classes: ["section-header"],
  });
  keysHeader.append(new Gtk.Label({ label: "KEYS", xalign: 0, css_classes: ["section-title"] }));
  keysHeader.append(keysFor);
  const tree = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 1, css_classes: ["tree"] });
  left.append(keysHeader);
  left.append(tree);

  // ── center stage ─────────────────────────────────────────────────────────
  const center = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["studio-center"],
    hexpand: true,
    vexpand: true,
  });
  root.append(center);

  // Controls bar (load + fixed fill + tabs + preview toggles).
  const controlsBar = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 6,
    css_classes: ["canvas-bar"],
  });
  const controlRow1 = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 });
  const controlRow2 = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 });
  const loadLabel = new Gtk.Label({ label: "load", xalign: 0, css_classes: ["slider-label"] });
  const loadScale = new Gtk.Scale({
    orientation: Gtk.Orientation.HORIZONTAL,
    adjustment: new Gtk.Adjustment({ lower: 0, upper: 100, step_increment: 5 }),
    css_classes: ["load-scale"],
  });
  loadScale.set_value(DEFAULT_CONTROLS.load);
  loadScale.set_size_request(120, -1);
  const loadPct = new Gtk.Label({ label: `${DEFAULT_CONTROLS.load}%`, xalign: 0, css_classes: ["slider-value"] });
  loadScale.connect("value-changed", () => {
    const value = Math.round(loadScale.get_value());
    loadPct.set_label(`${value}%`);
    setControls({ ...controls(), load: value, fixedFill: null });
  });
  const fillButtons: Gtk.Button[] = [];
  const fillLabel = new Gtk.Label({ label: "fill", xalign: 0, css_classes: ["slider-label"] });
  for (const level of FIXED_FILL_LEVELS) {
    const button = new Gtk.Button({ label: `${level}%`, css_classes: ["toggle"] });
    button.connect("clicked", () => setControls({ ...controls(), fixedFill: level }));
    fillButtons.push(button);
  }
  const compBtn = new Gtk.Button({ label: "Components", css_classes: ["toggle"] });
  const liveBtn = new Gtk.Button({ label: "Live", css_classes: ["toggle", "on"] });
  const backdropBtn = new Gtk.Button({ label: "Neutral bg", css_classes: ["toggle"] });
  const highlightBtn = new Gtk.Button({ label: "Highlight", css_classes: ["toggle", "on"] });
  const reserveBtn = new Gtk.Button({ label: "Reserve surface", css_classes: ["toggle"] });
  const transparentBtn = new Gtk.Button({ label: "Transparent meters", css_classes: ["toggle"] });
  backdropBtn.connect("clicked", () =>
    setControls({ ...controls(), backdrop: controls().backdrop === "theme" ? "neutral" : "theme" }),
  );
  highlightBtn.connect("clicked", () => setHighlight(!highlight()));
  reserveBtn.connect("clicked", () => applyFix("reserve"));
  transparentBtn.connect("clicked", () => applyFix("transparent"));
  const fillGroup = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 4 });
  fillGroup.append(fillLabel);
  for (const button of fillButtons) fillGroup.append(button);
  controlRow1.append(loadLabel);
  controlRow1.append(loadScale);
  controlRow1.append(loadPct);
  controlRow1.append(fillGroup);
  controlRow2.append(compBtn);
  controlRow2.append(liveBtn);
  controlRow2.append(backdropBtn);
  controlRow2.append(highlightBtn);
  controlRow2.append(reserveBtn);
  controlRow2.append(transparentBtn);
  controlsBar.append(controlRow1);
  controlsBar.append(controlRow2);
  center.append(controlsBar);

  // Preset chips.
  const presetBar = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 6,
    css_classes: ["pbar"],
  });
  center.append(presetBar);

  // Generated-theme banner (fork affordance is the existing fork action).
  const banner = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 8,
    css_classes: ["banner"],
    visible: false,
  });
  const bannerText = new Gtk.Label({ xalign: 0, wrap: true, hexpand: true, css_classes: ["banner-text"] });
  const bannerFork = new Gtk.Button({ label: "Fork to edit", css_classes: ["toggle"] });
  bannerFork.connect("clicked", fork);
  banner.append(new Gtk.Label({ label: "ⓘ", xalign: 0, css_classes: ["banner-icon"] }));
  banner.append(bannerText);
  banner.append(bannerFork);
  center.append(banner);

  // Canvas: Components (schematic) | Live (real btop).
  const canvasScroll = new Gtk.ScrolledWindow({
    vexpand: true,
    hexpand: true,
    hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
    vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
  });
  const canvas = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8, css_classes: ["canvas"] });
  const canvasProvider = new Gtk.CssProvider();
  canvas.get_style_context().add_provider(canvasProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
  canvasScroll.set_child(canvas);

  const componentsPane = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 8,
    css_classes: ["stage"],
    visible: false,
  });
  const schematicCap = new Gtk.Label({ xalign: 0, wrap: true, css_classes: ["stage-cap"] });
  const schematicWarn = new Gtk.Label({ xalign: 0, wrap: true, css_classes: ["warn"] });
  // The btop reconstruction: a topbar, then the mock's three columns of boxes.
  const schematicStage = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 4,
    hexpand: true,
    css_classes: ["btop-frame"],
  });
  const schematicTop = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 3 });
  const schematicGrid = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
    spacing: 6,
    hexpand: true,
    homogeneous: true,
    css_classes: ["bgrid"],
  });
  schematicStage.append(schematicTop);
  schematicStage.append(schematicGrid);
  componentsPane.append(schematicCap);
  componentsPane.append(schematicWarn);
  componentsPane.append(schematicStage);
  const coverage = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6, css_classes: ["anat"] });
  const coverageTitle = new Gtk.Label({ xalign: 0, css_classes: ["anat-title"] });
  const coverageRow = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 });
  const coverageSwatch = new Gtk.Box({ css_classes: ["anat-swatch"] });
  const coverageProvider = new Gtk.CssProvider();
  coverageSwatch.get_style_context().add_provider(coverageProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
  const coverageValue = new Gtk.Label({ xalign: 0, hexpand: true, css_classes: ["ph"] });
  coverageRow.append(coverageSwatch);
  coverageRow.append(coverageValue);
  const coverageChips = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 5 });
  const coverageMeterLabel = new Gtk.Label({ xalign: 0, css_classes: ["coverage-meter-label"] });
  const coverageMeter = new Gtk.Label({ xalign: 0, css_classes: ["coverage-meter"] });
  const coverageNote = new Gtk.Label({
    label: "lit = shown in the current preset; faint = this key paints it but the box is OFF",
    xalign: 0,
    wrap: true,
    css_classes: ["hint"],
  });
  coverage.append(coverageTitle);
  coverage.append(coverageRow);
  coverage.append(coverageChips);
  coverage.append(coverageMeterLabel);
  coverage.append(coverageMeter);
  coverage.append(coverageNote);
  componentsPane.append(coverage);
  canvas.append(componentsPane);

  const livePane = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 8,
    css_classes: ["stage"],
    visible: true,
  });
  const liveCap = new Gtk.Label({
    label: "Live — the real btop binary on a pty (a fresh capture per refresh)",
    xalign: 0,
    wrap: true,
    css_classes: ["stage-cap"],
  });
  const liveBar = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8, css_classes: ["live-bar"] });
  const liveBtnRefresh = new Gtk.Button({ label: "Refresh live preview (real btop)", css_classes: ["toggle"] });
  const liveStatus = new Gtk.Label({ xalign: 0, hexpand: true, css_classes: ["hint"] });
  liveBar.append(liveBtnRefresh);
  liveBar.append(liveStatus);
  // The frame is much wider/taller than the center; keep its own scroller so
  // the caption/refresh controls never scroll away with the capture (v0.1.0
  // had this separate live scroller and the visual pass accidentally dropped
  // it, which let the outer canvas land on the blank end of a capture).
  const liveScroll = new Gtk.ScrolledWindow({
    vexpand: true,
    hexpand: true,
    hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
    vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
  });
  const liveFrame = new Gtk.Label({ label: LIVE_PLACEHOLDER, xalign: 0, css_classes: ["live-frame"] });
  liveScroll.set_child(liveFrame);
  livePane.append(liveCap);
  livePane.append(liveBar);
  livePane.append(liveScroll);
  canvas.append(livePane);

  // The real btop preview is the primary stage (v0.1.0 kept it visible). The
  // Components tab is the labelled schematic; both share the same center pane.
  let livePaneActive = true;
  let liveRefreshTimer: number | null = null;
  let liveRefreshInFlight = false;
  let liveSignature = "";

  function liveSignatureOf(): string {
    return `${currentId()}|${serializeTheme(effective())}`;
  }

  function scheduleLiveRefresh(): void {
    if (liveRefreshTimer !== null) {
      GLib.source_remove(liveRefreshTimer);
      liveRefreshTimer = null;
    }
    liveRefreshTimer = GLib.timeout_add(0, 350, () => {
      liveRefreshTimer = null;
      refreshLive();
      return false;
    });
  }

  function showPane(live: boolean): void {
    livePaneActive = live;
    componentsPane.set_visible(!live);
    livePane.set_visible(live);
    compBtn.set_css_classes(live ? ["toggle"] : ["toggle", "on"]);
    liveBtn.set_css_classes(live ? ["toggle", "on"] : ["toggle"]);
    if (!live) {
      if (liveRefreshTimer !== null) {
        GLib.source_remove(liveRefreshTimer);
        liveRefreshTimer = null;
      }
      return;
    }
    const signature = liveSignatureOf();
    if (liveFrame.get_label() === LIVE_PLACEHOLDER || signature !== liveSignature) {
      liveSignature = signature;
      refreshLive();
    }
    liveScroll.get_vadjustment().set_value(0);
    canvasScroll.get_vadjustment().set_value(0);
  }
  compBtn.connect("clicked", () => showPane(false));
  liveBtn.connect("clicked", () => showPane(true));

  center.append(canvasScroll);

  // Diagnosis rows.
  const diagPanel = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2, css_classes: ["diag"] });
  center.append(diagPanel);

  // Pending-edit diff.
  const diffPanel = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 3, css_classes: ["diff"] });
  const diffTitle = new Gtk.Label({
    label: "PENDING EDITS — nothing written until you save",
    xalign: 0,
    css_classes: ["diff-title"],
  });
  const diffPath = new Gtk.Label({ xalign: 0, wrap: true, css_classes: ["diff-file"] });
  const diffRows = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 1, css_classes: ["diff-rows"] });
  diffPanel.append(diffTitle);
  diffPanel.append(diffPath);
  diffPanel.append(diffRows);
  center.append(diffPanel);

  function refreshLive(): void {
    if (liveRefreshInFlight) return;
    if (liveRefreshTimer !== null) {
      GLib.source_remove(liveRefreshTimer);
      liveRefreshTimer = null;
    }
    liveRefreshInFlight = true;
    const theme = current();
    const tmp = `${GLib.get_tmp_dir()}/btop-studio-preview.theme`;
    writeFile(tmp, serializeTheme(effective()));
    const engine = `${GLib.get_current_dir()}/live/btop_live.py`;
    const cmd = `uv run --with pyte python3 ${engine} --theme ${tmp} --once`;
    liveBtnRefresh.set_label("Rendering real btop…");
    liveStatus.set_label("Rendering the real btop binary…");
    void execAsync(["bash", "-lc", cmd])
      .then((out: string) => {
        try {
          const parsed = JSON.parse(out) as { frame_text?: string };
          liveFrame.set_label(parsed.frame_text ?? "(empty frame)");
          liveScroll.get_vadjustment().set_value(0);
          liveScroll.get_hadjustment().set_value(0);
          canvasScroll.get_vadjustment().set_value(0);
          liveStatus.set_label(`Rendered ${theme.name} with live btop.`);
          setStatus(`Live preview rendered by the real btop binary (${theme.name}).`);
        } catch {
          liveFrame.set_label(out);
          liveStatus.set_label("Rendered with live btop.");
        }
      })
      .catch((error: unknown) => {
        liveFrame.set_label(`Live preview failed: ${error}`);
        liveStatus.set_label("Live preview failed — check uv, pyte and btop.");
      })
      .finally(() => {
        liveRefreshInFlight = false;
        liveBtnRefresh.set_label("Refresh live preview (real btop)");
        if (livePaneActive && !liveRefreshInFlight) {
          const latest = liveSignatureOf();
          if (latest !== liveSignature) {
            liveSignature = latest;
            scheduleLiveRefresh();
          }
        }
      });
  }
  liveBtnRefresh.connect("clicked", refreshLive);

  // ── right rail ───────────────────────────────────────────────────────────
  const right = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, css_classes: ["studio-right"] });
  const rightScroll = new Gtk.ScrolledWindow({
    vexpand: true,
    hexpand: true,
    hscrollbar_policy: Gtk.PolicyType.NEVER,
  });
  const rightContent = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    css_classes: ["studio-right-content"],
  });
  rightScroll.set_child(rightContent);
  right.append(rightScroll);
  root.append(right);

  // Selection key/value rows.
  function kvRow(label: string): [Gtk.Box, Gtk.Label] {
    const row = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8, css_classes: ["kv"] });
    row.append(new Gtk.Label({ label, xalign: 0, css_classes: ["kv-label"] }));
    const value = new Gtk.Label({ label: "—", xalign: 1, hexpand: true, wrap: true, css_classes: ["kv-value"] });
    row.append(value);
    return [row, value];
  }
  const [themeRow, selTheme] = kvRow("Theme");
  const [keyRow, selKey] = kvRow("Theme key");
  const [feedRow, selFeedLabel] = kvRow("Draws from");
  const [valueRow, selValue] = kvRow("Value");
  const [resolvedRow, selResolved] = kvRow("Resolved");
  rightContent.append(section("Selection"));
  const selectionBody = body();
  selectionBody.append(themeRow);
  selectionBody.append(keyRow);
  selectionBody.append(feedRow);
  selectionBody.append(valueRow);
  selectionBody.append(resolvedRow);
  rightContent.append(selectionBody);

  // Where it shows.
  const whereLabel = new Gtk.Label({ xalign: 0, wrap: true, css_classes: ["where-label"] });
  const sitesLabel = new Gtk.Label({ xalign: 0, wrap: true, css_classes: ["sites"] });
  rightContent.append(section("Where it shows", "— from btop_draw.cpp"));
  const whereBody = body();
  whereBody.append(whereLabel);
  whereBody.append(sitesLabel);
  rightContent.append(whereBody);

  // Gradient.
  const gradBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 3, css_classes: ["studio-body", "grad"] });
  const gradHeader = section("Gradient", "— btop allows max 3 stops");
  rightContent.append(gradHeader);
  rightContent.append(gradBox);

  // Palette picker.
  const picker = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 8, css_classes: ["studio-body", "picker"] });
  rightContent.append(section("Palette", "— semantic roles · custom"));
  rightContent.append(picker);

  // Edit scope.
  const scopeRow = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6, css_classes: ["scope-row"] });
  const scopeButtons = new Map<Scope, Gtk.Button>();
  for (const [value, label] of [["key", "This key"], ["role", "Same role"], ["all", "All keys"]] as [Scope, string][]) {
    const button = new Gtk.Button({ label, css_classes: ["toggle"], hexpand: true });
    button.connect("clicked", () => setScope(value));
    scopeButtons.set(value, button);
    scopeRow.append(button);
  }
  const scopeHint = new Gtk.Label({ xalign: 0, wrap: true, css_classes: ["warn"] });
  const semantics = new Gtk.Label({
    label:
      "Generated themes resolve through the theme map and follow the wallpaper; authored themes hold literal colours. " +
      "btop uses the ★ active theme by filename and reloads live (SIGUSR2).",
    xalign: 0,
    wrap: true,
    css_classes: ["hint"],
  });
  rightContent.append(section("Edit scope"));
  const scopeBody = body();
  scopeBody.append(scopeRow);
  scopeBody.append(scopeHint);
  scopeBody.append(semantics);
  rightContent.append(scopeBody);

  // Status + footer.
  const statusLabel = new Gtk.Label({ xalign: 0, wrap: true, css_classes: ["status", "studio-status"] });
  rightContent.append(statusLabel);
  const footer = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8, css_classes: ["footer"] });
  const revertBtn = new Gtk.Button({ label: "Revert", css_classes: ["btn"], hexpand: true });
  const saveBtn = new Gtk.Button({ label: "Save", css_classes: ["btn", "primary"], hexpand: true });
  revertBtn.connect("clicked", () => setPending(new Map()));
  saveBtn.connect("clicked", save);
  footer.append(revertBtn);
  footer.append(saveBtn);
  right.append(footer);

  // ── renders ──────────────────────────────────────────────────────────────
  function clear(box: Gtk.Box): void {
    let child = box.get_first_child();
    while (child) {
      const next = child.get_next_sibling();
      box.remove(child);
      child = next;
    }
  }

  function renderTree(): void {
    clear(tree);
    const map = effective();
    const currentKey = selected();
    for (const group of KEY_GROUPS) {
      tree.append(new Gtk.Label({ label: group.name.toUpperCase(), xalign: 0, css_classes: ["group"] }));
      for (const key of group.keys) {
        const hex = resolveHex(map[key], palette()) || "transparent";
        const dotClass = `dot-${key}`;
        const dot = new Gtk.Box({ css_classes: ["dot", dotClass] });
        const dotProvider = new Gtk.CssProvider();
        dotProvider.load_from_string(fillRule(`.${dotClass}`, hex));
        dot.get_style_context().add_provider(dotProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        const row = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 });
        row.append(dot);
        row.append(new Gtk.Label({ label: key, xalign: 0, hexpand: true, css_classes: ["key-label"] }));
        const button = new Gtk.Button({ css_classes: key === currentKey ? ["item", "active"] : ["item"] });
        button.set_child(row);
        button.connect("clicked", () => setSelected(key));
        tree.append(button);
      }
    }
  }

  function renderPresets(): void {
    clear(presetBar);
    presetBar.append(new Gtk.Label({ label: "preset:", xalign: 0, css_classes: ["pbar-label"] }));
    for (const item of conf().presets) {
      const button = new Gtk.Button({
        label: `${item.index}`,
        css_classes: item.index === preset() ? ["pchip", "on"] : ["pchip"],
      });
      button.connect("clicked", () => setPreset(item.index));
      presetBar.append(button);
    }
    presetBar.append(new Gtk.Label({ label: presetAt(conf(), preset()).label, xalign: 0, hexpand: true, css_classes: ["pdesc"] }));
  }

  function renderBanner(): void {
    const generated = current().kind === "generated";
    banner.set_visible(generated);
    if (generated) {
      bannerText.set_label(
        "This theme follows the wallpaper — its keys resolve through the theme map. Fork it to author literal colours.",
      );
    }
  }

  function renderLibrary(): void {
    clear(libBox);
    const activeId = currentId();
    for (const theme of themes()) {
      const row = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 });
      row.append(
        new Gtk.Label({
          label: "★",
          xalign: 0,
          css_classes: theme.active ? ["star", "on"] : ["star"],
        }),
      );
      const meta = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2, hexpand: true });
      meta.append(new Gtk.Label({ label: theme.name, xalign: 0, css_classes: ["tname"] }));
      const badges = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 4 });
      badges.append(new Gtk.Label({ label: theme.kind, xalign: 0, css_classes: ["badge", theme.kind] }));
      if (theme.active) badges.append(new Gtk.Label({ label: "active", xalign: 0, css_classes: ["badge", "active"] }));
      meta.append(badges);
      row.append(meta);
      const button = new Gtk.Button({ css_classes: theme.id === activeId ? ["titem", "active"] : ["titem"] });
      button.set_child(row);
      button.connect("clicked", () => {
        setCurrentId(theme.id);
        setPending(new Map());
      });
      libBox.append(button);
    }
  }

  // ── graphical btop schematic ─────────────────────────────────────────────
  //
  // Components reconstructs mock v8's `#btop` tree from themed primitives:
  // box borders, `┤ title ├` headers, dotted leaders, gradient meter bars and
  // graph lines. Every drawn element is a button; its click selects the theme
  // key that paints it, so the right-hand selection / palette editor / pending
  // diff / diagnosis follow. Live stays the real btop capture.

  function rawColour(key: string): string {
    return resolveHex(effective()[key], palette());
  }

  function colourOf(key: string, fallback: string): string {
    const value = rawColour(key);
    return HEX_COLOUR.test(value) ? value : fallback;
  }

  function mainFg(): string {
    return colourOf("main_fg", "#c2c2c5");
  }

  function borderOf(key: string): string {
    return colourOf(key, colourOf("inactive_fg", "#6b7280"));
  }

  function stopsOf(family: string): GradientStops {
    const fallback = mainFg();
    const end = colourOf(`${family}_end`, fallback);
    const start = colourOf(`${family}_start`, end);
    const rawMid = rawColour(`${family}_mid`);
    return { start, mid: HEX_COLOUR.test(rawMid) ? rawMid : "", end };
  }

  function meterBackground(): string {
    const raw = rawColour("meter_bg");
    return HEX_COLOUR.test(raw) ? raw : "";
  }

  function level(base: number): number {
    return meterFill(controls(), base);
  }

  function selectedKeys(keys: readonly string[]): boolean {
    const key = selected();
    return highlight() && key !== null && keys.includes(key);
  }

  function hit(
    child: Gtk.Widget,
    keys: readonly string[],
    primary: string,
    extra: readonly string[] = [],
  ): Gtk.Button {
    const button = new Gtk.Button({
      css_classes: ["key-hit", ...extra],
      tooltip_text: `click → ${primary}`,
    });
    button.set_child(child);
    button.connect("clicked", () => setSelected(primary));
    // Give the custom button an accessible name equal to the key it selects;
    // the child is a layout box, so GTK cannot infer one.
    try {
      button.update_property([Gtk.AccessibleProperty.LABEL], [primary]);
    } catch {
      /* older GTK without the accessible property enum */
    }
    if (selectedKeys(keys)) button.add_css_class("hl");
    return button;
  }

  function textLabel(text: string, colour: string, extra: readonly string[] = []): Gtk.Label {
    const label = new Gtk.Label({ xalign: 0, css_classes: ["btop-text", ...extra] });
    label.set_markup(colourSpan(colour, text));
    return label;
  }

  function valueControl(
    text: string,
    colour: string,
    primary: string,
    keys: readonly string[] = [primary],
    extra: readonly string[] = ["btop-value"],
  ): Gtk.Button {
    return hit(textLabel(text, colour, extra), keys, primary, ["value-hit"]);
  }

  function spacer(): Gtk.Box {
    return new Gtk.Box({ hexpand: true });
  }

  function rowOf(...children: Gtk.Widget[]): Gtk.Box {
    const row = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 5,
      css_classes: ["btop-row"],
    });
    for (const child of children) row.append(child);
    return row;
  }

  /** The proc table is the widest block; it uses tighter spacing. */
  function procRow(...children: Gtk.Widget[]): Gtk.Box {
    const row = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 3,
      css_classes: ["btop-row", "btop-proc-row"],
    });
    for (const child of children) row.append(child);
    return row;
  }

  function leader(): Gtk.Button {
    const line = new Gtk.Box({ hexpand: true, css_classes: ["leader-line"] });
    return hit(line, ["div_line"], "div_line", ["leader-hit"]);
  }

  /** A meter is a filled + empty pair so either half selects its own key. */
  function meter(family: string, percent: number, cells = 16): Gtk.Box {
    const width = Math.max(1, Math.floor(cells));
    const band = meterBand(stopsOf(family), percent, width, meterBackground());
    const fillLabel = new Gtk.Label({ xalign: 0, css_classes: ["btop-meter"] });
    fillLabel.set_markup(band.fill.map((colour) => colourSpan(colour, band.glyph)).join(""));
    const emptyLabel = new Gtk.Label({ xalign: 0, css_classes: ["btop-meter"] });
    emptyLabel.set_markup(
      Array.from({ length: width - band.filled }, () => colourSpan(band.empty, band.emptyGlyph)).join(""),
    );
    const bar = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 0, css_classes: ["btop-meter-bar"] });
    bar.append(hit(fillLabel, [`${family}_start`, `${family}_mid`, `${family}_end`], `${family}_start`, ["meter-hit"]));
    bar.append(hit(emptyLabel, ["meter_bg"], "meter_bg", ["meter-hit"]));
    return bar;
  }

  function graph(
    family: string,
    width: number,
    intensity: number,
    phase: number,
    primary = `${family}_start`,
  ): Gtk.Button {
    const stops = stopsOf(family);
    const levels = graphLevels(width, intensity, phase);
    const accent = primary === "graph_text" ? colourOf("graph_text", mainFg()) : null;
    const markup = levels
      .map((height, index) =>
        colourSpan(accent ?? gradientAt(stops, index, levels.length), GRAPH_GLYPHS[height]),
      )
      .join("");
    const label = new Gtk.Label({ xalign: 0, css_classes: ["btop-graph"] });
    label.set_markup(markup);
    return hit(
      label,
      [`${family}_start`, `${family}_mid`, `${family}_end`, "graph_text"],
      primary,
      ["graph-hit"],
    );
  }

  function meterRow(family: string, percent: number, cells = 16): Gtk.Box {
    const percentLabel = `${Math.round(clampPercent(percent))}%`;
    return rowOf(
      meter(family, percent, cells),
      spacer(),
      valueControl(percentLabel, mainFg(), `${family}_start`, [
        `${family}_start`,
        `${family}_mid`,
        `${family}_end`,
        "meter_bg",
      ]),
    );
  }

  function plainRow(label: string, value: string): Gtk.Box {
    return rowOf(
      textLabel(label, mainFg(), ["btop-lab"]),
      leader(),
      valueControl(value, mainFg(), "main_fg", ["main_fg"]),
    );
  }

  function titleControl(name: string, boxKey: string, right?: string): Gtk.Button {
    const border = borderOf(boxKey);
    const row = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 4, hexpand: true });
    row.append(textLabel("┤", border));
    row.append(textLabel(name, colourOf("title", mainFg()), ["btop-title"]));
    row.append(textLabel("├", border));
    if (right) {
      row.append(spacer());
      row.append(textLabel(right, mainFg(), ["btop-value"]));
    }
    return hit(row, [boxKey, "title"], boxKey, ["title-hit"]);
  }

  function boxFor(
    module: string,
    boxKey: string,
    titleName: string,
    right: string | undefined,
    children: readonly Gtk.Widget[],
  ): Gtk.Box {
    const box = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 1,
      hexpand: true,
      css_classes: ["btop-box", `box-${module}`],
    });
    box.append(titleControl(titleName, boxKey, right));
    for (const child of children) box.append(child);
    return box;
  }

  function columnBox(): Gtk.Box {
    return new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 6,
      hexpand: true,
      css_classes: ["btop-column"],
    });
  }

  function cpuOverviewBox(load: number, symbol: string): Gtk.Box {
    const dim = colourOf("inactive_fg", "#8a9aa5");
    const cpuKeys = ["cpu_start", "cpu_mid", "cpu_end", "meter_bg"];
    const cpuPercent = Math.round(level(load));
    return boxFor("cpu", "cpu_box", "cpu", "1.1 GHz", [
      rowOf(
        textLabel(`total ▾▲ ${symbol}`, colourOf("graph_text", mainFg())),
        spacer(),
        valueControl(`${cpuPercent}%`, mainFg(), "cpu_start", cpuKeys),
      ),
      rowOf(graph("cpu", 26, level(load), 0), graph("cpu", 13, level(load) * 0.72, 4, "graph_text")),
      rowOf(
        textLabel("up 08:54:01", dim),
        spacer(),
        valueControl("1.14 1.36 1.63", mainFg(), "main_fg", ["main_fg"]),
      ),
    ]);
  }

  function coreRow(index: number, percent: number): Gtk.Box {
    const name = textLabel(`C${index}`, colourOf("inactive_fg", "#8a9aa5"), ["btop-core-name"]);
    name.set_size_request(18, -1);
    return rowOf(
      name,
      meter("cpu", percent, 7),
      valueControl(
        `${68 + (index % 2)}°C`,
        colourOf("temp_end", mainFg()),
        "temp_start",
        ["temp_start", "temp_mid", "temp_end"],
        ["btop-value", "btop-temp"],
      ),
    );
  }

  function cpuCoresBox(load: number): Gtk.Box {
    const tempKeys = ["temp_start", "temp_mid", "temp_end"];
    const cachedKeys = ["cached_start", "cached_mid", "cached_end"];
    const cpuKeys = ["cpu_start", "cpu_mid", "cpu_end", "meter_bg"];
    const left = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 1, hexpand: true });
    const right = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 1, hexpand: true });
    [2, 1, 3, 1, 11, 7, 9, 3].forEach((base, index) => {
      (index < 4 ? left : right).append(coreRow(index, level(base)));
    });
    const cores = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10, css_classes: ["btop-cores"] });
    cores.append(left);
    cores.append(right);
    const cpuPercent = Math.round(level(load));
    return boxFor("cpu", "cpu_box", "12th Gen i7-12650H", "1.1 GHz", [
      rowOf(
        textLabel("CPU", mainFg(), ["btop-lab"]),
        leader(),
        meter("cpu", level(load), 14),
        valueControl(`${cpuPercent}%`, mainFg(), "cpu_start", cpuKeys),
        valueControl("70°C", colourOf("temp_end", mainFg()), "temp_start", tempKeys),
        valueControl("12.3W", colourOf("cached_end", mainFg()), "cached_start", cachedKeys),
      ),
      cores,
      rowOf(
        textLabel("Load avg:", mainFg(), ["btop-lab"]),
        spacer(),
        valueControl("1.14 1.36 1.63", mainFg(), "main_fg", ["main_fg"]),
      ),
      rowOf(
        textLabel("GPU0", mainFg(), ["btop-lab"]),
        leader(),
        meter("cpu", level(0), 12),
        textLabel("288M/6.0G", mainFg()),
        spacer(),
        valueControl("65°C 12.8W", colourOf("temp_end", mainFg()), "temp_start", tempKeys),
      ),
    ]);
  }

  function gpuBox(load: number): Gtk.Box {
    const cpuKeys = ["cpu_start", "cpu_mid", "cpu_end", "meter_bg"];
    const rows: Gtk.Widget[] = [];
    for (const [name, base, watts] of [
      ["GPU0", Math.max(0, load - 24), "12.8W"],
      ["GPU1", Math.max(0, load - 32), ""],
    ] as [string, number, string][]) {
      const percent = Math.round(level(base));
      rows.push(
        rowOf(
          textLabel(name, mainFg(), ["btop-lab"]),
          leader(),
          meter("cpu", level(base), 14),
          valueControl(`${percent}%`, mainFg(), "cpu_start", cpuKeys),
          watts
            ? valueControl(
                watts,
                colourOf("cached_end", mainFg()),
                "cached_start",
                ["cached_start", "cached_mid", "cached_end"],
              )
            : spacer(),
        ),
      );
    }
    rows.push(
      rowOf(
        textLabel("VRAM", mainFg(), ["btop-lab"]),
        leader(),
        meter("used", level(42), 12),
        valueControl("3.2G/6.0G", mainFg(), "used_start", [
          "used_start",
          "used_mid",
          "used_end",
          "meter_bg",
        ]),
      ),
    );
    rows.push(graph("cpu", 28, level(12), 2));
    return boxFor("gpu", "mem_box", "gpu-totals", undefined, rows);
  }

  function memBox(load: number): Gtk.Box {
    const usedPercent = level(load);
    const availablePercent = level(Math.max(4, 96 - load));
    const cachedPercent = level(Math.min(96, load + 18));
    const freePercent = level(Math.max(3, 100 - load));
    const total = 15.2;
    return boxFor("mem", "mem_box", "mem", undefined, [
      plainRow("Total", `${total.toFixed(1)} GiB`),
      plainRow("Used", `${((total * usedPercent) / 100).toFixed(2)} GiB`),
      meterRow("used", usedPercent, 16),
      plainRow("Available", `${((total * availablePercent) / 100).toFixed(2)} GiB`),
      meterRow("available", availablePercent, 16),
      plainRow("Cached", `${((total * cachedPercent) / 100).toFixed(2)} GiB`),
      meterRow("cached", cachedPercent, 16),
      plainRow("Free", `${((total * freePercent) / 100).toFixed(2)} GiB`),
      meterRow("free", freePercent, 16),
    ]);
  }

  function netBox(load: number): Gtk.Box {
    const dim = colourOf("inactive_fg", "#8a9aa5");
    const selectedBg = colourOf("selected_bg", mainFg());
    const graphText = colourOf("graph_text", mainFg());
    const downloadKeys = ["download_start", "download_mid", "download_end", "meter_bg"];
    const uploadKeys = ["upload_start", "upload_mid", "upload_end", "meter_bg"];
    const tabs = rowOf(
      textLabel("┤sync├┤auto├┤zero├", dim),
      hit(textLabel("┤b├", selectedBg), ["selected_bg", "hi_fg"], "selected_bg", ["tab-hit"]),
      textLabel("┤wlan0├", dim),
    );
    const subbox = (
      name: string,
      family: string,
      speed: string,
      total: string,
      keys: readonly string[],
    ): Gtk.Box => {
      const sub = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 1,
        css_classes: ["btop-subbox"],
      });
      sub.append(
        hit(textLabel(name, colourOf("title", mainFg())), keys, `${family}_start`, ["title-hit"]),
      );
      sub.append(
        rowOf(
          textLabel(family === "download" ? "▼" : "▲", graphText),
          valueControl(speed, mainFg(), `${family}_start`, keys),
          spacer(),
          valueControl(total, mainFg(), `${family}_start`, keys),
        ),
      );
      sub.append(graph(family, 28, level(family === "download" ? 22 : 8), family === "download" ? 1 : 3));
      return sub;
    };
    return boxFor("net", "net_box", "net 192.168.1.7", undefined, [
      tabs,
      graph("download", 30, level(22), 1),
      subbox("download", "download", `${(18 * level(22) / 100).toFixed(1)} KiB/s`, "9.56 GiB", downloadKeys),
      subbox("upload", "upload", `${Math.round((752 * level(8)) / 100)} KiB/s`, "4.67 GiB", uploadKeys),
    ]);
  }

  function disksBox(load: number): Gtk.Box {
    const usedKeys = ["used_start", "used_mid", "used_end", "meter_bg"];
    const rows: Gtk.Widget[] = [];
    for (const [name, base] of [
      ["root", 20],
      ["home", 14],
      ["log", load],
    ] as [string, number][]) {
      const percent = Math.round(level(base));
      rows.push(
        rowOf(
          textLabel(name, mainFg(), ["btop-lab"]),
          leader(),
          hit(
            textLabel("IO%", colourOf("inactive_fg", "#8a9aa5")),
            ["available_start", "available_mid", "available_end"],
            "available_start",
            ["tab-hit"],
          ),
          meter("available", level(4), 6),
          valueControl("176 GiB", mainFg(), "main_fg", ["main_fg"]),
        ),
      );
      rows.push(
        rowOf(
          valueControl(`Used: ${percent}%`, mainFg(), "used_start", usedKeys),
          meter("used", percent, 14),
          spacer(),
          valueControl(`${(percent * 0.35).toFixed(1)} GiB`, mainFg(), "main_fg", ["main_fg"]),
        ),
      );
    }
    return boxFor("disks", "cpu_box", "disks", "io", rows);
  }

  function procBox(): Gtk.Box {
    const dim = colourOf("inactive_fg", "#8a9aa5");
    const hi = colourOf("hi_fg", colourOf("selected_bg", mainFg()));
    const procMisc = colourOf("proc_misc", colourOf("selected_bg", mainFg()));
    const processKeys = ["process_start", "process_mid", "process_end"];
    const rows: Gtk.Widget[] = [];
    rows.push(
      hit(
        rowOf(textLabel("pause per-core reverse tree cpu lazy", colourOf("selected_bg", mainFg()), ["btop-tabs"])),
        ["selected_bg", "hi_fg"],
        "selected_bg",
        ["tab-hit"],
      ),
    );
    const procCell = (text: string, colour: string, width: number): Gtk.Label => {
      const label = textLabel(text, colour, ["btop-proc-cell"]);
      label.set_size_request(width, -1);
      return label;
    };
    rows.push(
      hit(
        procRow(
          procCell("Pid:", hi, 24),
          procCell("Program:", hi, 34),
          procCell("Command:", hi, 38),
          procCell("User:", hi, 20),
          procCell("MemB", hi, 20),
          procCell("Cpu%", hi, 16),
        ),
        ["hi_fg"],
        "hi_fg",
        ["tab-hit"],
      ),
    );
    const procs = [
      ["6897", "Hyprland", "Hyprland --watchdog -fd 4", "inumaki", 135, "0.4"],
      ["1714088", "chrome", "--type=renderer --crashpad-h", "inumaki", 201, "0.0"],
      ["13584", "opencode", "opencode", "inumaki", 373, "0.1"],
      ["7096", "wireplumber", "/usr/bin/wireplumber", "inumaki", 24, "0.0"],
      ["94079", "opencode", "opencode serve --service", "inumaki", 559, "0.2"],
      ["12972", "kitty", "kitty", "inumaki", 92, "0.0"],
    ] as [string, string, string, string, number, string][];
    for (const [pid, program, command, user, memory, cpu] of procs) {
      const commandLabel = textLabel(command, dim, ["btop-proc-cell", "btop-dim"]);
      commandLabel.set_hexpand(true);
      commandLabel.set_ellipsize(Pango.EllipsizeMode.END);
      commandLabel.set_max_width_chars(7);
      rows.push(
        procRow(
          procCell(pid, mainFg(), 24),
          procCell(program, mainFg(), 32),
          commandLabel,
          procCell(user, dim, 20),
          meter("process", level(Math.min(100, memory / 6)), 2),
          procCell(`${memory}M`, mainFg(), 20),
          valueControl(cpu, mainFg(), "process_start", processKeys, ["btop-value", "btop-proc-cell"]),
        ),
      );
    }
    const chip = (text: string, background: string, primary: string, keys: readonly string[]): Gtk.Button =>
      hit(
        textLabel(text, colourOf("proc_banner_fg", mainFg()), ["btop-chip", background]),
        keys,
        primary,
        ["chip-hit"],
      );
    rows.push(
      rowOf(
        chip(" pause ", "chip-pause", "proc_pause_bg", ["proc_pause_bg", "proc_banner_fg"]),
        chip(" Follow ", "chip-follow", "followed_bg", ["followed_bg", "followed_fg"]),
        chip(" banner ", "chip-banner", "proc_banner_bg", ["proc_banner_bg", "proc_banner_fg"]),
      ),
    );
    rows.push(
      hit(
        rowOf(
          textLabel("− select", procMisc),
          textLabel("⌂ info", procMisc),
          textLabel("← terminal", procMisc),
          spacer(),
          valueControl("0/4412", procMisc, "proc_misc", ["proc_misc"]),
        ),
        ["proc_misc"],
        "proc_misc",
        ["proc-footer"],
      ),
    );
    return boxFor("proc", "proc_box", "proc", undefined, rows);
  }

  function renderTopbar(boxes: readonly string[]): void {
    clear(schematicTop);
    const dim = colourOf("inactive_fg", "#8a9aa5");
    const top = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 6,
      css_classes: ["btop-topbar-row"],
    });
    const title = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 3 });
    title.append(textLabel("┤", borderOf("cpu_box")));
    title.append(textLabel("cpu", colourOf("title", mainFg()), ["btop-title"]));
    title.append(textLabel("├", borderOf("cpu_box")));
    top.append(hit(title, ["cpu_box", "title"], "cpu_box", ["title-hit"]));
    top.append(hit(textLabel("┤menu├┤preset├", dim), ["inactive_fg"], "inactive_fg", ["tab-hit"]));
    top.append(spacer());
    top.append(valueControl("16:51:14", mainFg(), "main_fg", ["main_fg"]));
    top.append(hit(textLabel("▾ ▸", mainFg()), ["main_fg"], "main_fg", ["tab-hit"]));
    if (boxes.includes("cpu")) {
      const battery = rowOf(
        textLabel(`BAT ${Math.round(level(100))}%`, colourOf("cpu_end", mainFg())),
        meter("cpu", level(100), 4),
      );
      top.append(hit(battery, ["cpu_start", "cpu_mid", "cpu_end", "meter_bg"], "cpu_start", ["topbar-battery"]));
    }
    schematicTop.append(top);
  }

  function renderSchematic(): void {
    clear(schematicGrid);
    const theme = current();
    const schematic = buildSchematic(conf(), preset(), selected());
    const active = theme.active ? " · active" : "";
    schematicCap.set_label(
      `btop schematic — ${theme.name} (${theme.kind})${active} · ${schematic.caption.replace("btop schematic — ", "")}`,
    );
    const warning = hiddenModuleWarning(selected() ?? "", schematic.hiddenModules);
    schematicWarn.set_visible(warning !== null);
    schematicWarn.set_label(warning ? `⚠ ${warning}` : "");

    // The load control (and a fixed-fill override) drives every meter and graph.
    const loadLevel = meterFill(controls(), controls().load);
    const presetLabel = presetAt(conf(), preset()).label;
    const symbol = presetLabel.includes("block") ? "block" : presetLabel.includes("tty") ? "tty" : "default";
    renderTopbar(schematic.boxes);

    const columns = [columnBox(), columnBox(), columnBox()];
    if (schematic.boxes.includes("cpu")) {
      columns[0].append(cpuOverviewBox(loadLevel, symbol));
      columns[1].append(cpuCoresBox(loadLevel));
    }
    if (schematic.boxes.includes("gpu")) columns[0].append(gpuBox(loadLevel));
    if (schematic.boxes.includes("mem")) columns[0].append(memBox(loadLevel));
    if (schematic.boxes.includes("net")) columns[0].append(netBox(loadLevel));
    if (schematic.boxes.includes("disks")) columns[1].append(disksBox(loadLevel));
    if (schematic.boxes.includes("proc")) columns[2].append(procBox());
    for (const column of columns) {
      if (column.get_first_child()) schematicGrid.append(column);
    }
    // No text-only fallback: an empty preset still draws btop geometry.
    if (!schematicGrid.get_first_child()) {
      schematicGrid.append(
        boxFor("cpu", "cpu_box", "no boxes in preset", undefined, [
          graph("cpu", 32, 0, 0),
          meter("used", 0, 16),
        ]),
      );
    }

    // Theme-derived chrome for the drawn tree. Box borders follow the key btop
    // uses (cpu_box, mem_box, net_box, proc_box; gpu/disks reuse cpu/mem).
    const background =
      backdropColour(controls(), resolveHex(effective()["main_bg"], palette())) || "#101216";
    const main = mainFg();
    const divLine = colourOf("div_line", colourOf("inactive_fg", "#4b525d"));
    const hiFg = colourOf("hi_fg", colourOf("selected_bg", "#6ea8fe"));
    const chipFallback = rgbaHex(main, 0.14);
    const css = [
      fillRule(".canvas", background),
      `.btop-frame { background-color: ${background}; color: ${main}; }`,
      `.btop-box.box-cpu { border-color: ${borderOf("cpu_box")}; }`,
      `.btop-box.box-gpu { border-color: ${borderOf("mem_box")}; }`,
      `.btop-box.box-mem { border-color: ${borderOf("mem_box")}; }`,
      `.btop-box.box-net { border-color: ${borderOf("net_box")}; }`,
      `.btop-box.box-disks { border-color: ${borderOf("cpu_box")}; }`,
      `.btop-box.box-proc { border-color: ${borderOf("proc_box")}; }`,
      `.btop-subbox { border-color: ${borderOf("net_box")}; }`,
      `.btop-topbar-row { border-bottom: 1px solid ${divLine}; }`,
      `.leader-line { border-bottom: 1px dotted ${divLine}; }`,
      `.key-hit.hl { border-color: ${hiFg}; background-color: ${rgbaHex(hiFg, 0.18)}; box-shadow: 0 0 0 2px ${rgbaHex(hiFg, 0.45)}; }`,
      `.btop-chip.chip-pause { background-color: ${colourOf("proc_pause_bg", chipFallback)}; }`,
      `.btop-chip.chip-follow { background-color: ${colourOf("followed_bg", chipFallback)}; }`,
      `.btop-chip.chip-banner { background-color: ${colourOf("proc_banner_bg", chipFallback)}; }`,
    ].join("\n");
    canvasProvider.load_from_string(css);

    const key = selected();
    const raw = key ? (effective()[key] ?? "") : "";
    const resolved = key ? rawColour(key) : "#ff00ff";
    coverageTitle.set_label(`KEY COVERAGE — ${key ?? "—"}`);
    coverageValue.set_label(
      key ? `${raw === "" ? "empty (transparent)" : raw}  →  ${resolved || "transparent"}` : "—",
    );
    coverageProvider.load_from_string(fillRule(".anat-swatch", resolved || "transparent"));
    clear(coverageChips);
    const paints = key ? modulesFor(key) : [];
    for (const module of ["cpu", "gpu", "mem", "net", "disks", "proc", "battery"]) {
      const painted = paints.includes(module);
      const lit = painted && schematic.boxes.includes(module);
      const chips = ["modchip"];
      if (lit) chips.push("on");
      else if (painted) chips.push("off");
      coverageChips.append(new Gtk.Label({ label: module, xalign: 0, css_classes: chips }));
    }

    // The key-coverage card keeps a second visible meter so the selected ramp
    // and the current load are legible even when the chosen key is chrome.
    const family = key && /_(start|mid|end)$/.test(key) ? key.replace(/_(start|mid|end)$/, "") : "used";
    const band = meterBand(stopsOf(family), loadLevel, 28, meterBackground());
    let sample = band.fill.map((colour) => colourSpan(colour, band.glyph)).join("");
    for (let index = band.filled; index < 28; index += 1) sample += colourSpan(band.empty, band.emptyGlyph);
    coverageMeterLabel.set_label(`sample ${family} meter · load ${Math.round(loadLevel)}%`);
    coverageMeter.set_markup(sample);
  }

  function renderDiagnosis(): void {
    clear(diagPanel);
    const items = diagnose(effective(), palette());
    if (!items.length) {
      diagPanel.append(new Gtk.Label({ label: "✓ no meter-contrast problems", xalign: 0, css_classes: ["diag-row", "ok"] }));
      return;
    }
    for (const item of items) {
      const icon = item.level === "error" ? "⛔" : item.level === "warn" ? "⚠" : "✓";
      const row = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8, css_classes: ["diag-row", item.level] });
      row.append(new Gtk.Label({ label: icon, xalign: 0 }));
      row.append(new Gtk.Label({ label: item.message, xalign: 0, wrap: true, hexpand: true }));
      diagPanel.append(row);
    }
  }

  function renderDiff(): void {
    clear(diffRows);
    const entries = diffEdits(current().map, pending());
    const path = resolvedPath(current(), target(), { repoRoot: repoRoot(), installDir: installDir() });
    diffPath.set_label(path);
    diffPath.set_visible(entries.length > 0);
    if (!entries.length) {
      diffRows.append(new Gtk.Label({ label: "— no changes —", xalign: 0, css_classes: ["diff-ctx"] }));
      return;
    }
    for (const entry of entries) {
      diffRows.append(new Gtk.Label({ label: `- ${entry.key}="${entry.from}"`, xalign: 0, wrap: true, css_classes: ["diff-del"] }));
      diffRows.append(new Gtk.Label({ label: `+ ${entry.key}="${entry.to}"`, xalign: 0, wrap: true, css_classes: ["diff-add"] }));
    }
  }

  function renderPicker(): void {
    clear(picker);
    const key = selected();
    const paletteNow = palette();
    if (!key) {
      picker.append(new Gtk.Label({ label: "Select a key to edit its colour.", xalign: 0, css_classes: ["hint"] }));
      return;
    }
    const generated = current().kind === "generated";
    picker.append(
      new Gtk.Label({
        label: generated ? `Draw ${key} from which palette role?` : `Set ${key} to which colour?`,
        xalign: 0,
        wrap: true,
        css_classes: ["picker-title"],
      }),
    );

    const map = effective();
    const currentValue = map[key];
    let swatchSeq = 0;

    const addSwatch = (
      parent: Gtk.Grid,
      value: string,
      hex: string,
      token: string,
      column: number,
      row: number,
      size: number,
    ): void => {
      const cls = `swatch-${key.replace(/[^a-z0-9]/gi, "")}-${swatchSeq}`;
      swatchSeq += 1;
      const classes = value === currentValue ? ["cell", "current", cls] : ["cell", cls];
      const button = new Gtk.Button({ tooltip_text: `${token} ${hex}`, css_classes: classes });
      const provider = new Gtk.CssProvider();
      provider.load_from_string(fillRule(`.${cls}`, hex));
      button.get_style_context().add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
      button.set_size_request(size, size);
      button.connect("clicked", () => pick(value));
      parent.attach(button, column, row, 1, 1);
    };

    // The palette.v1 role map from the platform provider. Generated themes
    // keep the role name (palette-linked); authored themes freeze the hex.
    picker.append(new Gtk.Label({ label: "roles", xalign: 0, css_classes: ["picker-label"] }));
    const roleGrid = new Gtk.Grid({
      column_spacing: 6,
      row_spacing: 6,
      halign: Gtk.Align.START,
      css_classes: ["swatch-grid"],
    });
    Object.entries(paletteNow.roles).forEach(([role, hex], index) => {
      addSwatch(roleGrid, generated ? role : hex, hex, role, index % 5, Math.floor(index / 5), 30);
    });
    picker.append(roleGrid);

    // Transparent (btop's empty value).
    const namedBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2, css_classes: ["named"] });
    const addNamed = (token: string, value: string, hex: string, detail: string): void => {
      const chipClass = `chip-${key.replace(/[^a-z0-9]/gi, "")}-${swatchSeq}`;
      swatchSeq += 1;
      const chip = new Gtk.Box({ css_classes: ["chip", chipClass] });
      const chipProvider = new Gtk.CssProvider();
      chipProvider.load_from_string(fillRule(`.${chipClass}`, hex));
      chip.get_style_context().add_provider(chipProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
      const row = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 9, css_classes: ["sw-row"] });
      row.append(chip);
      const text = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 1, hexpand: true });
      text.append(new Gtk.Label({ label: token, xalign: 0, css_classes: ["ph"] }));
      text.append(new Gtk.Label({ label: detail, xalign: 0, css_classes: ["tok"] }));
      row.append(text);
      const button = new Gtk.Button({
        css_classes: value === currentValue ? ["named-row", "current"] : ["named-row"],
      });
      button.set_child(row);
      button.connect("clicked", () => pick(value));
      namedBox.append(button);
    };
    addNamed("transparent", "", "transparent", "empty value (btop)");
    picker.append(namedBox);

    // Custom hex + colour chooser.
    const hexRow = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6, css_classes: ["hexrow"] });
    hexRow.append(new Gtk.Label({ label: "custom", xalign: 0, css_classes: ["slider-label"] }));
    const colourButton = new Gtk.ColorButton({ css_classes: ["color-button"] });
    const entry = new Gtk.Entry({ placeholder_text: "#rrggbb", hexpand: true, css_classes: ["hex-entry"] });
    const applyColour = (): void => {
      const value = entry.get_text();
      if (/^#[0-9a-fA-F]{6}$/.test(value)) pick(value);
    };
    entry.connect("activate", applyColour);
    colourButton.connect("color-set", () => {
      const rgba = colourButton.get_rgba();
      const hex = `#${[rgba.red, rgba.green, rgba.blue]
        .map((v) => Math.round(v * 255).toString(16).padStart(2, "0"))
        .join("")}`;
      entry.set_text(hex);
      pick(hex);
    });
    hexRow.append(colourButton);
    hexRow.append(entry);
    picker.append(hexRow);
  }

  function renderGradient(): void {
    clear(gradBox);
    const key = selected();
    const isStop = !!key && /_(start|mid|end)$/.test(key);
    gradHeader.set_visible(isStop);
    gradBox.set_visible(isStop);
    if (!key || !isStop) return;
    const family = key.replace(/_(start|mid|end)$/, "");
    const map = effective();
    for (const stop of ["start", "mid", "end"]) {
      const stopKey = `${family}_${stop}`;
      const value = map[stopKey] ?? "";
      const label = `${stopKey}: ${value === "" ? "empty (2-stop)" : resolveHex(value, palette())}`;
      const button = new Gtk.Button({
        label,
        css_classes: stopKey === key ? ["toggle", "stop", "on"] : ["toggle", "stop"],
      });
      button.connect("clicked", () => setSelected(stopKey));
      gradBox.append(button);
    }
    if (map[`${family}_mid`] === "" || map[`${family}_mid`] === undefined) {
      const add = new Gtk.Button({ label: "＋ add middle colour (make it a 3-stop)", css_classes: ["toggle"] });
      add.connect("clicked", () => {
        const next = addMiddleColour(effective(), family);
        const edits = new Map(pending());
        edits.set(`${family}_mid`, next[`${family}_mid`]);
        setPending(edits);
      });
      gradBox.append(add);
    }
    gradBox.append(new Gtk.Label({ label: GRADIENT_LIMIT_NOTE, xalign: 0, wrap: true, css_classes: ["grad-note"] }));
  }

  function renderTarget(): void {
    const theme = current();
    targetPath.set_label(resolvedPath(theme, target(), { repoRoot: repoRoot(), installDir: installDir() }));
    targetLabel.set_label(`writes to — ${target()}`);
    targetHintLabel.set_label(targetHint(target()));
    caveat.set_label(divergenceCaveat(target()) ?? generatedInstalledWarning(theme, target()) ?? "");
    repoBtn.set_css_classes(target() === "repo" ? ["toggle", "on"] : ["toggle"]);
    instBtn.set_css_classes(target() === "installed" ? ["toggle", "on"] : ["toggle"]);
    saveBtn.set_label(actionLabel(target()));
    const cfg = conf();
    cfgLabel.set_label(
      `shown_boxes = "${cfg.shown_boxes.join(" ")}"\n` +
        `presets = "${cfg.presets_raw}"\n` +
        `parsed → ${cfg.presets.length} presets · preset 0 = all boxes (btop rule).`,
    );
  }

  function renderWhere(): void {
    const key = selected();
    if (!key) {
      whereLabel.set_label("Select a key to see what it paints.");
      sitesLabel.set_label("");
      return;
    }
    const entry = KEY_WIDGET_MAP.keys[key];
    const modules = modulesFor(key);
    const sites = sitesFor(key);
    if (isUnreferenced(key) || !entry) {
      whereLabel.set_label("Not referenced in btop_draw.cpp — chrome/base surface.");
      sitesLabel.set_label(sites.join(" · "));
      return;
    }
    const calls = entry.calls;
    whereLabel.set_label(
      `Paints ${modules.join(", ") || "—"}` +
        (calls > 0 ? ` · ${calls} call site${calls === 1 ? "" : "s"}` : " · via gradient"),
    );
    sitesLabel.set_label(sites.slice(0, 4).join(" · "));
  }

  function renderSelection(): void {
    const theme = current();
    const key = selected();
    selTheme.set_label(theme.name);
    selKey.set_label(key ?? "—");
    selFeedLabel.set_label(theme.kind === "generated" ? "theme map (role)" : "literal colour");
    selValue.set_label(key ? (effective()[key] ?? "") || "empty (transparent)" : "—");
    selResolved.set_label(key ? resolveHex(effective()[key], palette()) || "transparent" : "—");
    for (const [value, button] of scopeButtons) {
      button.set_css_classes(scope() === value ? ["toggle", "on"] : ["toggle"]);
    }
    scopeHint.set_label(
      scope() === "key"
        ? theme.kind === "generated"
          ? `Changes the theme map for ${key ?? "this key"}.`
          : `Changes only ${key ?? "this key"} in ${theme.name}.`
        : scope() === "role"
          ? "Applies to every key sharing this role suffix (start / mid / end)."
          : "Applies to every key in this theme.",
    );
    highlightBtn.set_css_classes(highlight() ? ["toggle", "on"] : ["toggle"]);
    backdropBtn.set_css_classes(controls().backdrop === "neutral" ? ["toggle", "on"] : ["toggle"]);
    for (const [i, level] of FIXED_FILL_LEVELS.entries()) {
      fillButtons[i].set_css_classes(controls().fixedFill === level ? ["toggle", "on"] : ["toggle"]);
    }
    keysFor.set_label(`— ${theme.name} · all 48`);
    statusLabel.set_label(status());
    statusLabel.set_visible(status().length > 0);
    renderWhere();
  }

  function renderAll(): void {
    renderTarget();
    renderBanner();
    renderLibrary();
    renderTree();
    renderPresets();
    renderSchematic();
    renderDiagnosis();
    renderDiff();
    renderPicker();
    renderGradient();
    renderSelection();
    // The tabs own pane visibility; do not reset the user's selection on a
    // re-render (state changes must not bounce them back to Components).
    compBtn.set_css_classes(livePaneActive ? ["toggle"] : ["toggle", "on"]);
    liveBtn.set_css_classes(livePaneActive ? ["toggle", "on"] : ["toggle"]);
    if (livePaneActive && !liveRefreshInFlight) {
      const signature = liveSignatureOf();
      if (signature !== liveSignature) {
        liveSignature = signature;
        scheduleLiveRefresh();
      }
    }
  }

  createEffect(renderAll);

  return (
    <window
      visible
      name="btop-theme-studio-window"
      class="btop-theme-studio"
      title="btop Theme Studio"
      gdkmonitor={gdkmonitor}
      anchor={Astal.WindowAnchor.NONE}
      layer={Astal.Layer.OVERLAY}
      keymode={Astal.Keymode.ON_DEMAND}
      default_width={1700}
      default_height={900}
      $={(self) => {
        const keys = new Gtk.EventControllerKey();
        keys.connect("key-pressed", (_c, keyval) => {
          if (keyval === Gdk.KEY_Escape) {
            self.hide();
            return true;
          }
          return false;
        });
        self.add_controller(keys);
      }}
    >
      {shell}
    </window>
  );
}
