---
name: Axis Selection
description: Festo axis, motor, gearbox and kit sizing, laid out as a route sign
colors:
  sign-blue: "#1f4e8c"
  sign-blue-deep: "#183f73"
  sign-ink: "#ffffff"
  sign-ink-2: "#c9d8ec"
  signal-yellow: "#ffcc00"
  signal-ink: "#1a1d21"
  signal-soft: "#fff5cc"
  ground: "#eef1f4"
  surface: "#ffffff"
  surface-2: "#f5f7f9"
  line: "#dde3e9"
  line-strong: "#c3ccd5"
  text: "#1a1d21"
  muted: "#5b6672"
  accent-soft: "#e4ecf6"
  ok: "#1d8049"
  warn: "#c25e00"
  fail: "#c8322b"
typography:
  rail-title:
    fontFamily: "Barlow Semi Condensed, Pretendard Variable, sans-serif"
    fontSize: "25px"
    fontWeight: 700
    letterSpacing: "0.02em"
  sign-value:
    fontFamily: "Barlow Semi Condensed, Pretendard Variable, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.15
  step-title:
    fontFamily: "Pretendard Variable, Malgun Gothic, sans-serif"
    fontSize: "17px"
    fontWeight: 650
  body:
    fontFamily: "Pretendard Variable, Malgun Gothic, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  data:
    fontFamily: "Barlow Semi Condensed, Pretendard Variable, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    fontFeature: "tnum"
  label:
    fontFamily: "Pretendard Variable, Malgun Gothic, sans-serif"
    fontSize: "12px"
    fontWeight: 400
rounded:
  sm: "5px"
  md: "6px"
  lg: "8px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "20px"
components:
  route-box:
    backgroundColor: "transparent"
    textColor: "{colors.sign-ink}"
    rounded: "{rounded.md}"
    size: "42px"
  route-box-active:
    backgroundColor: "{colors.signal-yellow}"
    textColor: "{colors.signal-ink}"
  step-number:
    backgroundColor: "{colors.sign-blue}"
    textColor: "{colors.sign-ink}"
    rounded: "{rounded.sm}"
    size: "28px"
  segmented-active:
    backgroundColor: "{colors.sign-blue}"
    textColor: "{colors.sign-ink}"
  row-selected:
    backgroundColor: "{colors.signal-soft}"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "18px 20px"
  input:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    height: "38px"
---

# Design System: Axis Selection

## Overview

**Creative North Star: "The Route Sign"**

The selection chain axis → motor → gearbox → kit is a route, and the app shows it as a DIN direction sign: a sign-blue rail across the top with four numbered route boxes, chevrons between them, each carrying the chosen part number and its verdict. Everything below the rail is a quiet, dense working surface: light neutral ground, white panels, tables with exact numbers.

It is an operating tool, so the world contributes only type, palette, density and the one signature move (the rail). Controls stay standard web controls.

**Key Characteristics:**
- One blue field owns the shell; the workspace stays neutral.
- Signal yellow means "your route" and nothing else.
- Every number and part number is set in a condensed DIN-like face with tabular figures.
- Every verdict sits next to its computed value and limit.

## Colors

Restrained workspace under a committed blue shell.

### Primary
- **Sign Blue** (#1f4e8c): the route rail, step number boxes, active segmented buttons, the motion profile trace. Deep variant (#183f73) for rail hover.

### Secondary
- **Signal Yellow** (#ffcc00): the active route box on the rail, the selected row outline, selection highlight, focus ring. Soft variant (#fff5cc) fills the selected row.

### Neutral
- **Ground** (#eef1f4): page background. **Surface** (#ffffff) panels, **Surface 2** (#f5f7f9) table heads and hover.
- **Line** (#dde3e9) / **Line Strong** (#c3ccd5): dividers, input borders.
- **Text** (#1a1d21), **Muted** (#5b6672): secondary labels and units.

### State
- **OK** (#1d8049), **Warn** (#c25e00), **Fail** (#c8322b): verdicts and ratio bars (under 80% ok, up to 100% warn, over fail).

### Named Rules
**The Reserved Yellow Rule.** Signal yellow marks the selected route only. Never use it for warnings, decoration or emphasis; amber-orange (#c25e00) is the warning colour.

**The Field Not Dot Rule.** Sign blue is used as a whole field (the rail) or as solid marks (route boxes, active toggles), not as scattered accent text.

## Typography

**Data Font:** Barlow Semi Condensed (bundled via @fontsource), falling back to Pretendard.
**Body Font:** Pretendard Variable (bundled), falling back to Malgun Gothic.

**Character:** Korean text in a neutral workhorse sans; every figure and part number in a narrow road-sign face so long codes fit and columns align.

### Hierarchy
- **Rail title** (700, 25px, uppercase, 0.02em): app name in the rail only.
- **Sign value** (600, 20px, 1.15): part numbers on the rail.
- **Step title** (650, 17px): panel headings.
- **Body** (400, 14px, 1.5): labels, notes, Korean copy.
- **Data** (500–600, 15px, tabular): table numbers, part numbers, input values (17px in inputs).
- **Label** (400, 12px, muted): field labels, units, column heads.

### Named Rules
**The Figures Are Signage Rule.** Any number a user compares (value, limit, ratio, part number) uses the data face with tabular figures. Korean words never do.

## Layout

Full-width sticky rail (112px) over a centered 1600px workspace: a 320px sticky condition panel on the left and the results column on the right (axis step, motion profile, motor, gearbox, kit), 20px gaps. Steps have `scroll-margin-top` so a click on a route box lands the step just below the rail. Below 1280px the rail drops its brand block; below 1000px the rail becomes static, signs go 2×2 (1 column under 560px) and the layout stacks.

PDF export (PDF로 내보내기) renders a separate report (`Report.tsx`, mounted off screen at A4 content width, 703px) to a PDF that opens in a new tab: six chapters, each on a new page, with a sign-blue chapter bar, label/value spec tables and the check tables. The report always uses the light tokens.

## Elevation & Depth

Flat. Panels are separated by 1px lines on the neutral ground. The only shadow is under the sticky rail (`0 2px 10px rgb(10 30 60 / 0.18)`), so the rail reads as sitting above the scrolling work.

## Shapes

Small, sign-like corners: 5–6px on route boxes, inputs and toggles, 8px on panels. Route boxes are square with a 3px border, like route-number plates.

## Components

- **추가 검토사항 (kit step, report)**: a 13px `h4` and a plain bulleted list (`.kit-notes`, 1.6 line height) under the kit check table; notes are advice, so no status colour.
- **Route sign (rail)**: numbered box + step name (12px) + part number (20px) + verdict dot and the tightest check (`속도 100%`). The whole sign is a button that scrolls to its step; the step in view gets the yellow box and a 5px yellow underline. Part number and detail stay on one line in both languages (ellipsis, full name in the title); the four columns size to their content, and below 1280px the part number drops to 17px.
- **Step panel**: header strip with a blue 28px number box, title, counts and toggles; body with filters, then table, then evidence (세부사항).
- **Verdict badge**: coloured 8px dot + word, never a filled pill.
- **Ratio cell**: percentage in the data face + 44px bar (ok under 80%, warn, fail).
- **Selected row**: soft yellow fill + 2px yellow inset ring.
- **Inputs**: 38px, data face 17px, unit at right, no spin buttons; invalid gets a red border and red soft ring.
- **Segmented toggles**: blue fill when active.
- **Error panel**: replaces the results column when the calculation fails; fail-soft fill, fail border and title, the error text on a white block, an outlined fail-colour 다시 시도 button. The inputs stay usable.
- **Chart spans**: dwell shaded `--surface-2`, press (press move + hold) shaded `--accent-soft`, each labelled above the plot.

## Do's and Don'ts

- **Do** show computed value / limit beside every verdict.
- **Do** keep part numbers whole; let them wrap, never truncate them in exports.
- **Don't** use yellow for anything except the selected route.
- **Don't** add cards, kickers or decorative icons to the workspace; the rail is the only expressive element.
- **Don't** add motion beyond 120–200ms state transitions.
