# React UI Kit — Architecture & Roadmap

> Package names are written as `@scope/ui` throughout; substitute the real scope.
> Status: planning. Target: MIT, open source, npm-distributed, a11y-first, **zero runtime dependencies**.
> This document is a design record, not a promise. Scope, ordering, and estimates will move.

---

## 1. Positioning — what gap this fills

The 2026 landscape:

| Layer               | Examples                                              | What you get                 | What's missing                                                           |
| ------------------- | ----------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------ |
| Headless primitives | Base UI 1.6, Radix, Ark UI, React Aria                | Behavior + ARIA, zero styles | You style everything yourself                                            |
| Copy-paste styled   | shadcn/ui (Base UI-backed by default since July 2026) | Styles + behavior            | You own the copied code, so updates are manual; styling assumes Tailwind |
| Full design systems | MUI, Mantine, Chakra                                  | Everything                   | Larger dependency trees; each brings its own theming API to learn        |

**The gap:** an installable, versioned, zero-runtime-CSS, Tailwind-free styled kit with **no runtime dependencies at all**. You `pnpm add` it, import one stylesheet, get accessible components, and `pnpm up` for fixes.

Pitch: **"shadcn's quality, delivered as a package you can upgrade, with zero dependencies and CSS you can actually override."**

The zero-dep claim is now your single strongest marketing asset. Every competitor has a dependency tree. Put the number in the README badge and never let it move.

Non-goals — write these in the README on day one:

- Not a Tailwind plugin. Not a copy-paste registry. Not a kitchen sink.
- Not universal-first. Web is the product; RN is an experiment (§9).

---

## 2. Building the base yourself — the real scope

You've chosen to own the primitives layer. Good news: **this is a much better bet in 2026 than it was in 2022**, and the reason is that the platform has absorbed most of what these libraries originally had to implement in JavaScript. The bad news is that the remaining ~30% is the genuinely hard part, and there is no way to shortcut it.

### 2.1 What the platform now gives you for free

This is the spine of the whole plan. Established primitive libraries predate most of the capabilities below and support browser matrices that still require the JavaScript equivalents, so they carry that code by necessity. **A new library has no such constraint and can target the platform directly, shipping considerably less code.** That's a real technical differentiator and it belongs in the README.

| Capability                                        | Native mechanism                                         | Replaces                             |
| ------------------------------------------------- | -------------------------------------------------------- | ------------------------------------ |
| Top-layer rendering                               | `<dialog>`, `popover` attribute                          | Portal + z-index management          |
| Modal focus trap                                  | `dialog.showModal()`                                     | ~400 lines of FocusScope             |
| Inertness of background                           | `showModal()` implicit, `inert` attribute                | `aria-hidden` tree-walking           |
| Light dismiss (outside click)                     | `popover="auto"`                                         | DismissableLayer pointer logic       |
| Esc to close                                      | `<dialog>` + `popover` built-in                          | Global keydown stack                 |
| Nested layer stacking                             | Top-layer stack, nested popovers                         | Layer registry                       |
| Declarative toggling                              | `command` / `commandfor` attributes                      | onClick wiring, `aria-expanded` sync |
| Focus ring heuristics                             | `:focus-visible`                                         | `useFocusVisible`                    |
| Enter animations from `display:none`              | `@starting-style`, `transition-behavior: allow-discrete` | Presence mount delay hacks           |
| Positioning                                       | CSS anchor positioning                                   | Floating UI (partly — see §2.3)      |
| Scrollbar layout shift                            | `scrollbar-gutter: stable`                               | Scrollbar-width measurement          |
| Text truncation, aspect ratios, container queries | CSS                                                      | JS measurement                       |

**Verify each against Baseline before you commit.** `<dialog>`, `popover`, `inert`, and `:focus-visible` are safe. `@starting-style` is comfortable. `command`/`commandfor` and `interpolate-size`/`calc-size` are newer — check current Baseline status rather than trusting this table.

Two important caveats:

- **`popover="auto"` light dismiss is not a full DismissableLayer.** It doesn't give you "close on focus leaving", it has quirky interactions with nested non-popover content, and dismissal ordering with `<dialog>` needs testing. A thin coordination layer is still needed — just far thinner than a fully hand-rolled one.
- **`<dialog>` focus behavior has real gaps.** Initial focus goes to the first focusable descendant (or the dialog itself), which is often wrong; focus restoration on close is unreliable when the trigger was removed from the DOM; and Safari has historically had `showModal` + scroll-lock quirks on iOS. Budget real time here.

### 2.2 What you must actually build

Ordered roughly by dependency. This is your `internal/` layer — it never ships as a public API, so you can refactor it freely.

**Group A — prop & state plumbing** _(easy, ~1 week)_

- `mergeProps` — event handler chaining with `defaultPrevented` semantics, `className` concat, `style` merge, ref composition
- `composeRefs` / `useComposedRefs`
- `useControllableState<T>` — with dev-only controlled↔uncontrolled warning
- `useEventCallback` — stable handler identity
- `useIsomorphicLayoutEffect`
- `Slot` / `render` prop — `cloneElement` + prop merging, with the child-must-forward-ref invariant
- `DirectionProvider` — RTL context

**Group B — DOM utilities** _(medium, ~1–2 weeks)_

- `useId` (React's, wrapped)
- Owner-document / owner-window helpers (iframe correctness)
- `isTabbable` / `isFocusable` / `getTabbableCandidates` — **this is deceptively hard**: `display:none`, `visibility:hidden`, `inert`, `disabled`, `contenteditable`, `tabindex="-1"`, `<details>`/`<summary>`, `<iframe>`, radio group semantics (only the checked one is tabbable), shadow DOM traversal, and `hidden="until-found"`. Read the `tabbable` package's source and its issue tracker before writing yours; that library exists because every one of these is a bug someone hit.
- `useResizeObserver`, `useMutationObserver` wrappers

**Group C — focus management** _(hard, ~3–4 weeks)_

- `FocusScope` — trap with sentinel guard nodes, `loop`, `trapped`, `onMountAutoFocus`, `onUnmountAutoFocus`. Use `<dialog>` where you can; you need this for non-dialog cases (menus, comboboxes).
- Focus restoration with fallback chain: original trigger → nearest surviving ancestor → `document.body`
- `useRovingFocus` — orientation, `loop`, `dir`, arrow/Home/End/PageUp/PageDown, and correct behavior when items mount/unmount mid-navigation
- `aria-activedescendant` variant — required for Combobox, where DOM focus must stay in the input
- `useTypeahead` — buffered character matching, ~1s reset timeout, wrap-around from the current index, locale-aware comparison via `Intl.Collator`
- `Collection` — ordered item registry that survives portals and conditional rendering. Radix's `createCollection` is a good reference implementation; the ordering problem (DOM order vs mount order) is the subtle part.

**Group D — layers & dismissal** _(hard, ~2–3 weeks)_

- `DismissableLayer` — layer stack, `onPointerDownOutside`, `onFocusOutside`, `onEscapeKeyDown`, `disableOutsidePointerEvents`. Key subtleties: `pointerdown` not `click` (so drag-out doesn't dismiss), touch requires a `click` follow-up guard, and outside-detection must account for portalled descendants.
- Scroll lock — the iOS Safari case is genuinely nasty. `overflow: hidden` on `<body>` is insufficient; you need `overscroll-behavior`, `touchmove` handling with an allowlist for scrollable descendants, and scroll-position preservation. `scrollbar-gutter: stable` handles desktop layout shift.
- `Presence` — exit animations. Detect running animations via `getAnimations()`, wait for completion, then unmount. `@starting-style` covers entry declaratively.
- `Portal` — SSR-safe, `container` prop, hydration-correct

**Group E — positioning** _(hard, see §2.3, ~3–4 weeks)_

**Group F — announcements** _(medium, ~1 week)_

- Live region manager — a single persistent `aria-live` region per politeness level, created at mount, not at announce time (screen readers ignore regions injected simultaneously with their content). Handles Toast, form errors, loading states, sort changes.
- `VisuallyHidden`

**Total for the primitives layer: roughly 12–16 effort-weeks before a single styled component beyond `Button` ships.**

### 2.3 Positioning — the one place to reconsider

Popover/tooltip/menu/select placement means: offset, flip on collision, shift into viewport, arrow positioning, size matching, virtual elements, scroll-ancestor tracking, and `autoUpdate` via `ResizeObserver` + `IntersectionObserver` + scroll listeners without loops. Floating UI is thousands of lines of tested geometry math and it exists because this is hard.

You have three options:

**(a) CSS anchor positioning.** `anchor-name`, `position-anchor`, `anchor()`, `position-area`, `anchor-size()`, `@position-try` / `position-try-fallbacks`. Core placement now works in all three engines. The catch: MDN still flags parts as not-Baseline as of mid-2026, `@position-try` fallback rules landed later than core placement in both Safari and Firefox, and there are known cross-engine behavioral differences in containing-block handling. Verify current status before committing — the picture is moving fast.

**(b) Write your own JS positioner.** ~600–1000 lines for a solid subset: offset, flip, shift, arrow, size, autoUpdate. Very achievable; the bug tail is long and boring.

**(c) Take `@floating-ui/react-dom`** — 4 packages, single author (who also works on Base UI), no third-party transitives. Breaks your zero-dep claim.

**Recommendation: (a) as the primary path with (b) as a narrow fallback, behind one internal module.**

```ts
// packages/ui/src/internal/positioning/index.ts
export function usePosition(options: PositionOptions): PositionResult;
// Implementation A: CSS anchor positioning (no JS positioning at all)
// Implementation B: JS fallback behind @supports not (anchor-name: --x)
```

Keep this as the **only** module in the codebase that knows about geometry. If it becomes a time sink at M5, you swap in Floating UI behind the same interface and lose one week, not one quarter. Write the interface first, on day one of M5.

### 2.4 Reference material to read before writing each primitive

Not to copy — to know which bugs exist. Budget real reading time; it's the highest-leverage hours in the project.

- **WAI-ARIA Authoring Practices Guide** — the pattern spec. Non-optional.
- **Radix Primitives source** — `react-dismissable-layer`, `react-focus-scope`, `react-collection`, `react-popper`. The comments explain _why_, and the why is usually a browser bug.
- **Base UI source** — the modern take on the same problems.
- **`tabbable` / `focus-trap` issue trackers** — an encyclopedia of focus edge cases.
- **Adrian Roselli's blog** — especially on tables, `aria-live`, and the gap between "passes axe" and "works with a screen reader".
- **Sarah Higley on `<select>` and comboboxes** — the definitive material on why native controls are hard to replace.

---

## 3. CSS architecture

You want "more flexibility than Tailwind, defaults you don't paste, overridable." Four modern CSS features solve this exactly. No runtime, no build plugin, no Tailwind.

### 3.1 Cascade layers — the override story

```css
@layer ui.reset, ui.tokens, ui.base, ui.components, ui.variants;
```

Consumer CSS that isn't in a layer **always** beats layered CSS, regardless of specificity:

```css
/* Library, inside @layer ui.components */
.ui-Button[data-variant="solid"][data-size="lg"] {
  padding-inline: 1.25rem;
}

/* Consumer app, unlayered — wins with one class, no !important */
.my-button {
  padding-inline: 2rem;
}
```

This is precisely what Tailwind users fight when they reach for `!important` and `tw-merge`. Lead with it in the docs. Let consumers control ordering:

```css
@layer reset, ui, app;
@import "@scope/ui/styles.css" layer(ui);
```

### 3.2 Three-tier tokens

```css
@layer ui.tokens {
  :root {
    color-scheme: light;

    /* Tier 1 — primitives (never referenced by components) */
    --ui-neutral-0: oklch(1 0 0);
    --ui-neutral-100: oklch(0.97 0.002 250);
    --ui-neutral-950: oklch(0.15 0.01 250);
    --ui-accent-500: oklch(0.62 0.19 258);
    --ui-danger-500: oklch(0.58 0.22 25);

    --ui-space-1: 0.25rem;
    --ui-space-2: 0.5rem;
    --ui-radius-md: 0.5rem;
    --ui-font-sans: ui-sans-serif, system-ui, sans-serif;
    --ui-duration-fast: 120ms;
    --ui-ease-out: cubic-bezier(0.16, 1, 0.3, 1);

    /* Tier 2 — semantic (what themes swap) */
    --ui-color-surface: var(--ui-neutral-0);
    --ui-color-surface-raised: var(--ui-neutral-100);
    --ui-color-text: var(--ui-neutral-950);
    --ui-color-text-muted: oklch(from var(--ui-color-text) l c h / 0.65);
    --ui-color-accent: var(--ui-accent-500);
    --ui-color-accent-text: var(--ui-neutral-0);
    --ui-color-border: color-mix(in oklch, var(--ui-color-text) 15%, transparent);
    --ui-color-focus-ring: var(--ui-color-accent);
  }

  [data-ui-theme="dark"] {
    color-scheme: dark;
    --ui-color-surface: var(--ui-neutral-950);
    --ui-color-surface-raised: oklch(0.2 0.01 250);
    --ui-color-text: var(--ui-neutral-0);
    --ui-color-accent: oklch(0.7 0.17 258);
    --ui-color-accent-text: var(--ui-neutral-950);
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-ui-theme]) {
      /* same block */
    }
  }
}
```

- `oklch()` + `color-mix()` + relative color syntax collapse the token count — author one accent, derive hover/active/subtle/border.
- Attribute theming beats `light-dark()` because it supports **subtree** theming (dark sidebar in a light page). Keep `color-scheme` in sync so native controls and scrollbars follow.
- Tier 3 (component tokens) makes per-instance override trivial:

```css
@layer ui.components {
  .ui-Button {
    --_bg: var(--ui-button-bg, var(--ui-color-accent));
    background: var(--_bg);
    border-radius: var(--ui-button-radius, var(--ui-radius-md));
  }
}
```

```tsx
<Button style={{ "--ui-button-bg": "rebeccapurple" }}>Buy</Button>
```

That pattern is your "more flexible than Tailwind" headline. Document the component-token table per component — it _is_ public API and it's semver-relevant.

### 3.3 Variants as data attributes

```tsx
<button class="ui-Button" data-variant="ghost" data-size="sm" data-loading="" />
```

Uniform with the state attributes your primitives emit (`data-open`, `data-disabled`, `data-highlighted`), trivially overridable, and it eliminates `cva` / `clsx` / `tailwind-merge` from the tree. Since you're writing the primitives, **define the state-attribute vocabulary once, in a written spec, before M2.** Consistency here is worth more than any single component.

### 3.4 Authoring & distribution

- Plain CSS with native nesting, one file per component, colocated.
- Bundle with **Lightning CSS** — minify, transpile nesting, no PostCSS chain. (Build-time only; doesn't count against runtime deps.)
- Ship: `styles.css` (everything), `styles/base.css` (reset + tokens), `styles/button.css` (per component).
- `"sideEffects": ["*.css"]`.
- Never auto-inject CSS from JS — breaks RSC, SSR ordering, and CSP.

### 3.5 A11y CSS as table stakes

```css
@layer ui.base {
  .ui-Button:focus-visible {
    outline: 2px solid var(--ui-color-focus-ring);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .ui-Dialog,
    .ui-Popover {
      transition-duration: 1ms !important;
      animation: none !important;
    }
  }
  @media (forced-colors: active) {
    .ui-Button {
      border: 1px solid ButtonBorder;
      forced-color-adjust: none;
      color: ButtonText;
    }
    .ui-Button:focus-visible {
      outline-color: Highlight;
    }
  }
}
```

Windows High Contrast support alone will get attention from the a11y community.

---

## 4. Repository & package layout

```
ui/
├── packages/
│   ├── ui/                     # @scope/ui — components + CSS
│   │   ├── src/
│   │   │   ├── internal/       # the primitives layer — NOT exported
│   │   │   │   ├── props/      # mergeProps, composeRefs, Slot
│   │   │   │   ├── state/      # useControllableState, useEventCallback
│   │   │   │   ├── dom/        # tabbable, ownerDocument, observers
│   │   │   │   ├── focus/      # FocusScope, useRovingFocus, useTypeahead
│   │   │   │   ├── layers/     # DismissableLayer, Portal, Presence, scrollLock
│   │   │   │   ├── positioning/# the ONE geometry module
│   │   │   │   └── live/       # live region manager
│   │   │   ├── components/Button/{index.ts,Button.tsx,Button.css,
│   │   │   │                      Button.test.tsx,Button.visual.tsx}
│   │   │   ├── styles/{reset.css,tokens.css,index.css}
│   │   │   └── index.ts
│   │   └── package.json
│   ├── tokens/                 # @scope/ui-tokens — single source of truth
│   └── icons/                  # @scope/ui-icons — optional, SVG→TSX
├── apps/
│   ├── docs/                   # custom Vite + React → GitHub Pages (CSR at M1, SSG at M8)
│   ├── vrt/                    # story harness + Playwright screenshot matrix
│   ├── playground/             # Vite SPA — kitchen sink for manual SR testing
│   ├── smoke-vite/             # consumes the packed tarball, CSR
│   ├── smoke-next/             # consumes the packed tarball, App Router / RSC
│   └── rn-showcase/            # Expo app (post-1.0 only)
├── tooling/                    # shared lint/format/tsconfig packages
└── .changeset/
```

Keep `internal/` unexported and undocumented. The moment you export a primitive, you owe semver on it forever, and you lose the freedom to refactor. If demand appears post-1.0, extract `@scope/ui-primitives` as a deliberate product decision.

```jsonc
// packages/ui/package.json
{
  "type": "module",
  "sideEffects": ["*.css"],
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./styles.css": "./dist/styles.css",
    "./styles/*": "./dist/styles/*",
    "./*": { "types": "./dist/*/index.d.ts", "import": "./dist/*/index.js" },
  },
  "peerDependencies": { "react": ">=19", "react-dom": ">=19" },
  "dependencies": {},
}
```

### Dependency policy (CONTRIBUTING.md + CI gate)

```
Runtime dependencies: ZERO. This is a product guarantee, not a preference.
Peer dependencies: react >=19, react-dom >=19.
Adding one requires a maintainer decision and a README badge change.
Never: lodash, classnames, date libraries, polyfills, animation libraries.
```

CI check: fail the build if `dependencies` is non-empty. One line, permanent guarantee.

---

## 5. TypeScript & type-safety patterns

Target **TypeScript 6.0** (released March 2026 — strict by default, ESM defaults, ES5 removed) and track **7.0** (Go-native, RC'd June 2026, ~10× faster). 6.0 is explicitly designed so code compiling cleanly under 6 compiles identically under 7, so run `tsgo` as a parallel non-blocking CI job from M0.

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "isolatedDeclarations": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "jsx": "react-jsx",
  },
}
```

`isolatedDeclarations` is worth the friction: explicit public types, and `.d.ts` emit without running `tsc`.

**No `forwardRef`** — React 19 passes `ref` as a normal prop.

**Polymorphism via `render`, not `as`** — better inference, honest prop types:

```tsx
export type RenderProp<State> =
  | React.ReactElement
  | ((props: Record<string, unknown>, state: State) => React.ReactElement);
```

**Variants from one const:**

```tsx
export const buttonVariants = ["solid", "soft", "outline", "ghost"] as const;
export type ButtonVariant = (typeof buttonVariants)[number];
```

**Typed CSS custom properties:**

```ts
declare module "react" {
  interface CSSProperties {
    [key: `--ui-${string}`]: string | number | undefined;
  }
}
```

**A11y enforced at the type level** — this is a genuinely novel selling point:

```tsx
type IconButtonProps = React.ComponentPropsWithRef<"button"> &
  ({ "aria-label": string } | { "aria-labelledby": string });
```

An icon-only button without an accessible name should be a **compile error**. Same for `Dialog` (title required), `Tabs` (label required), `Image` (`alt` required or explicitly `""`).

---

## 6. Component inventory

Full per-component design docs live in `components/`. Each lists anatomy, TypeScript API, state attributes, tokens, keyboard map, and a11y notes.

| Doc                                                               | Tier                                          | Count                 | Milestone |
| ----------------------------------------------------------------- | --------------------------------------------- | --------------------- | --------- |
| [`00-CONVENTIONS.md`](components/00-CONVENTIONS.md)               | Shared API rules — **read first, lock at M1** | —                     | M1        |
| [`TIER-0-FOUNDATIONS.md`](components/TIER-0-FOUNDATIONS.md)       | Foundations + internal primitives             | 5 public, 11 internal | M1, M3–M5 |
| [`TIER-1-PRESENTATIONAL.md`](components/TIER-1-PRESENTATIONAL.md) | Presentational                                | 22                    | M2        |
| [`TIER-2-FORMS.md`](components/TIER-2-FORMS.md)                   | Forms                                         | 14                    | M6        |
| [`TIER-3-OVERLAYS.md`](components/TIER-3-OVERLAYS.md)             | Overlays                                      | 12                    | M4, M7    |
| [`TIER-4-NAVIGATION.md`](components/TIER-4-NAVIGATION.md)         | Navigation & disclosure                       | 9                     | M8        |
| [`TIER-5-DATA.md`](components/TIER-5-DATA.md)                     | Data & advanced input                         | 8 (4 in 1.0)          | M8        |
| [`TIER-6-ADVANCED.md`](components/TIER-6-ADVANCED.md)             | Advanced & deferred                           | 9 (6 build, 3 don't)  | post-1.0  |

**1.0 scope: 66 public components.** Tier 5 defers four to 1.x; all of Tier 6 is post-1.0.

Two ordering constraints that aren't obvious from the tier numbers:

- **`Field` before every other form control.** Everything in Tier 2 composes into it, and retrofitting the `aria-describedby` composition afterwards means touching all fourteen.
- **`Dialog` → `Popover` → `Tooltip` → `Menu` → `Select`.** Each reuses the previous one's machinery. `Menu` before `Select` is not optional — `Select` is a menu with a value and a form contract attached. This is why Tier 3 splits across M4 and M7 rather than shipping as one block.

`Menu` and `Select` are the two hardest components in the library. `Slider` and `NumberField` sit in Tier 2 but cost Tier 3 effort.

### The "don't build" list

Tier 6 concludes that **DataGrid, Charts, and RichTextEditor should never enter the core.** Each needs a runtime dependency or an ongoing accessibility commitment beyond the project's scope, and each has a mature alternative that composes with your kit precisely because you have no dependencies to conflict with. The reasoning is in `TIER-6-ADVANCED.md`; it's worth having written down before the first feature request arrives.

---

## 7. Quality gates

### Definition of Done — every component

1. Linked WAI-ARIA APG pattern in docs.
2. Documented keyboard map, one test per key.
3. `axe-core` clean in default, disabled, error, and open states.
4. Focus-visible ring; focus order test; focus restoration on overlay close.
5. VRT snapshots: light + dark × default/hover/focus/disabled.
6. RTL rendering test.
7. `forced-colors: active` snapshot.
8. `prefers-reduced-motion` honored.
9. Reflow at 320px / 200% zoom, no horizontal scroll.
10. Component-token table documented.
11. Manual screen-reader pass logged in `a11y/manual-log.md` (VoiceOver+Safari, NVDA+Firefox).

Because you own the primitives, add:

12. **Primitive-level unit tests** — `FocusScope`, `DismissableLayer`, `useRovingFocus`, `useTypeahead`, and `getTabbableCandidates` each get their own dedicated suite, independent of any component. When a Menu bug appears, you need to know whether it's in Menu or in the roving focus manager.
13. **Cross-browser interaction tests on WebKit specifically.** Safari is where your focus and scroll-lock code will break, and it will break silently.

### Tooling

- **Unit + interaction:** Vitest 4 **Browser Mode** (stable since 4.0, Playwright provider). Not jsdom — focus management, `:focus-visible`, top-layer behavior, and cascade layers are exactly what jsdom gets wrong, and they're now the majority of your codebase.
- **Visual regression:** Playwright against a dedicated story harness (§8.5). Not Vitest's `toMatchScreenshot()` — `forced-colors` and `prefers-reduced-motion` can only be emulated at browser-context level, so three Definition-of-Done items are unreachable from inside a Vitest test. Either way, visual regression stays in-repo with no third-party service.
- **Automated a11y:** `axe-core` in browser-mode tests. A floor, not a ceiling — axe catches maybe 30% of real issues, and roughly none of the ones you'll create in focus management.
- **Lint:** oxlint with `jsx-a11y` rules and type-aware linting (stabilized 2026).
- **Format:** oxfmt (~0.61, beta but widely adopted — Vue core, Turborepo, Sentry). Formats CSS too, so one formatter covers the repo. **Pin the exact version** — beta formatters shift output between minors and that's a huge diff across a component repo.
- **Package correctness:** `publint` + `@arethetypeswrong/cli`.
- **Size:** `size-limit` per subpath with a committed budget.
- **Build:** `tsdown` (Rolldown) for JS + d.ts, Lightning CSS for CSS.

### CI matrix

```
lint      → oxlint + oxfmt --check
types     → tsc (TS 6) + tsgo (TS 7 preview, non-blocking)
unit      → vitest --project unit --browser chromium
a11y      → axe suite
visual    → playwright (apps/vrt): light|dark|narrow|hcm|motion × ltr|rtl, chromium
package   → publint + attw + size-limit + zero-dep guard
smoke     → pnpm pack → install tarball → build smoke-vite + smoke-next
docs      → build apps/docs (link check + base path); deploy on main
nightly   → firefox + webkit across the full visual matrix
release   → changesets + npm Trusted Publishing (OIDC)
```

`smoke` is the job that catches what unit tests structurally cannot — see §8.3. Run it on every PR, not just on release. The `visual` job must run in the same container image used to generate baselines (§8.5).

Trusted Publishing via OIDC removes long-lived npm tokens from CI entirely; set it up before the first publish rather than migrating later.

---

## 8. Development & test environments

Worth designing at M0, because two of these get drastically more expensive to retrofit: the packaging smoke tests (which catch bugs your unit tests structurally cannot see) and the docs pipeline (which becomes a four-week wall of writing if you defer it).

### 8.1 The six environments

| Environment     | Purpose                                   | Tech                                    | Built at             |
| --------------- | ----------------------------------------- | --------------------------------------- | -------------------- |
| Test runner     | unit, interaction, a11y                   | Vitest Browser Mode — **no app needed** | M0                   |
| VRT harness     | screenshots across the full matrix        | `apps/vrt` + Playwright                 | M1                   |
| Smoke consumers | packaging, SSR, RSC correctness           | Vite SPA + Next.js App Router           | M0                   |
| Playground      | manual screen-reader passes, kitchen sink | Vite + React                            | M0 skeleton          |
| Docs            | public site with live examples            | custom Vite + React                     | CSR at M1, SSG at M8 |
| RN showcase     | React Native components                   | Expo + Maestro                          | post-1.0             |

The VRT harness, the docs, and the playground all read from **one story format** (§8.4), so a component is written once and appears in all three.

### 8.2 Unit tests need no host app

Vitest Browser Mode boots its own Vite server and mounts components per test. There's nothing to build — just config in `packages/ui`. Note there is **no `visual` project here**: screenshots moved to a dedicated harness (§8.5), for reasons that turn out to be structural rather than stylistic.

```ts
// packages/ui/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          include: ["src/**/*.node.test.ts"], // pure logic: mergeProps, collation
          environment: "node",
        },
      },
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.tsx"], // behavior, keyboard, focus, axe
          setupFiles: ["./test/setup.ts"],
          browser: {
            enabled: true,
            provider: "playwright",
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
```

Three details that matter for this library specifically:

**Import the stylesheet in setup.** Your components don't import their own CSS (you ship a separate bundle), so without this every visual snapshot is unstyled — and worse, you'd never notice a component emitting a class that has no matching rule.

```ts
// packages/ui/test/setup.ts
import "../src/styles/index.css";
```

**A `render` helper that takes theme and direction**, so the light/dark × LTR/RTL matrix from the Definition of Done is one line per test rather than boilerplate:

```tsx
// packages/ui/test/render.tsx
export function renderUI(
  ui: React.ReactNode,
  { theme = "light", dir = "ltr" }: { theme?: "light" | "dark"; dir?: "ltr" | "rtl" } = {},
) {
  return render(
    <ThemeProvider theme={theme}>
      <DirectionProvider dir={dir}>{ui}</DirectionProvider>
    </ThemeProvider>,
  );
}
```

**Primitives get their own suites.** `getTabbableCandidates`, `FocusScope`, `useRovingFocus`, `useTypeahead`, and `DismissableLayer` are tested in isolation with throwaway fixture components, not through Menu. When a Menu bug appears you need to know immediately which layer it's in — this is the main structural benefit of owning your primitives, so take it.

### 8.3 Smoke consumers — the highest-value environment

Unit tests import from `src`. That means they cannot catch: a broken `exports` map, a missing `"use client"`, `sideEffects` misconfiguration, CSS that doesn't survive bundling, `document` accessed at module scope, or hydration mismatches. All six are shipping-breaking, and all six are common in exactly the code you're writing (own primitives = lots of direct DOM access).

**Install the packed tarball, not the workspace link.** A `workspace:*` link resolves through `src` and silently hides every packaging bug. In CI:

```bash
pnpm --filter @scope/ui build
pnpm --filter @scope/ui pack --pack-destination /tmp
pnpm --filter smoke-next add /tmp/scope-ui-0.0.0.tgz
pnpm --filter smoke-next build
```

Two apps, both trivial — one page rendering every component with default props:

- **`smoke-vite`** — baseline CSR. Catches exports map and CSS bundling issues. Builds in seconds.
- **`smoke-next`** — App Router. The single highest-value test in the repo. Catches `"use client"` boundary errors, SSR crashes from DOM access, hydration mismatches, and CSS import ordering. If you only build one smoke app, build this one.

Consider adding React Router 7 (framework mode) once you have users asking for it. Astro islands too, if demand appears. Don't build them speculatively.

### 8.4 Stories — one source of truth

Before building either the VRT harness or the docs, define what a "story" is: a **named, deterministic render of one component in one state**. Plain module, no framework, no decorators, no CSF.

```tsx
// packages/ui/src/components/Button/Button.stories.tsx
import type { StoryModule } from "../../../story/types.js";
import { Button, buttonVariants, buttonSizes } from "./Button.js";

export default {
  title: "Button",
  stories: {
    variants: () => (
      <Row>
        {buttonVariants.map((v) => (
          <Button key={v} variant={v}>
            Save
          </Button>
        ))}
      </Row>
    ),
    sizes: () => (
      <Row>
        {buttonSizes.map((s) => (
          <Button key={s} size={s}>
            Save
          </Button>
        ))}
      </Row>
    ),
    loading: () => <Button loading>Save</Button>,
    disabled: () => <Button disabled>Save</Button>,
    withIcon: () => (
      <Button>
        <CheckIcon />
        Save
      </Button>
    ),
    longLabel: () => <Button>A deliberately long label that has to wrap somewhere</Button>,
  },
} satisfies StoryModule;
```

Three consumers, one file:

1. **VRT harness** screenshots every story across the browser × theme × viewport × forced-colors matrix.
2. **Docs** renders them as the live examples on each component page.
3. **Playground** lists them for manual VoiceOver/NVDA passes.

Hard rule: stories must be deterministic. No `Math.random`, no `Date.now`, no network, no autofocus-on-mount, no relative time formatting. One nondeterministic story poisons the whole VRT suite with intermittent failures, and intermittent failures are how teams learn to ignore red builds.

This shared-story design is also the strongest practical argument for custom docs (§8.6) — an off-the-shelf docs theme would have you maintaining examples twice.

### 8.5 Visual regression — separate app + Playwright

You're right that this wants its own environment, and the reason is stronger than convenience. Three items on the Definition of Done are **not reachable** from inside a Vitest browser test:

- **`forced-colors: active`** — only settable at browser-context level via Playwright's `forcedColors` option or `page.emulateMedia()`. There is no in-page way to enter Windows High Contrast emulation.
- **`prefers-reduced-motion`** — same; context-level `reducedMotion` option.
- **Viewport matrix** (320 / 768 / 1280) — a per-context setting, so in Vitest it means a whole project per width.

Plus two things that are merely much better in Playwright: cross-browser is one `projects` array instead of N browser instances, and determinism setup (fonts, animations, caret, scrollbars) happens once globally rather than per test file. A prebuilt static app also screenshots far faster in CI than booting a test runner per project.

```
apps/vrt/
├── index.html
├── src/main.tsx           # route /story/:file/:name, reads ?theme= &dir= &static=
├── src/stories.gen.ts     # import.meta.glob("../../packages/ui/src/**/*.stories.tsx")
├── tests/stories.spec.ts
└── playwright.config.ts
```

The app renders exactly one story on an otherwise blank page — no nav, no chrome, no layout, nothing that can shift by a pixel for unrelated reasons.

```ts
// apps/vrt/playwright.config.ts
export default defineConfig({
  webServer: { command: "pnpm --filter vrt preview", port: 4173 },
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  projects: [
    { name: "light", use: { ...devices["Desktop Chrome"], colorScheme: "light" } },
    { name: "dark", use: { ...devices["Desktop Chrome"], colorScheme: "dark" } },
    {
      name: "narrow",
      use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 800 } },
    },
    { name: "hcm", use: { ...devices["Desktop Chrome"], forcedColors: "active" } },
    { name: "motion", use: { ...devices["Desktop Chrome"], reducedMotion: "reduce" } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
});
```

```ts
// apps/vrt/tests/stories.spec.ts
import { manifest } from "../src/stories.gen.js";

for (const { file, name } of manifest) {
  for (const dir of ["ltr", "rtl"] as const) {
    test(`${file}/${name}/${dir}`, async ({ page }) => {
      await page.goto(`/story/${file}/${name}?dir=${dir}&static=1`);
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`${file}-${name}-${dir}.png`);
    });
  }
}
```

That's the whole DoD visual matrix — light, dark, narrow, forced-colors, reduced-motion, RTL, three engines — from one config file.

**Determinism checklist.** Get all of these or you'll spend months chasing flakes:

- **Self-host the font.** Never Google Fonts. Await `document.fonts.ready` before every shot.
- Kill animations globally behind `?static=1` — but note the `motion` project deliberately doesn't pass it, so reduced-motion behavior is still under test.
- `caret-color: transparent` in the harness stylesheet.
- Pin scrollbar rendering; OS scrollbars differ in width and style.
- `deviceScaleFactor: 1`.
- **Generate baselines in the same container CI uses.** macOS and Linux rasterize fonts differently enough to fail essentially every test. Run `--update-snapshots` inside the official `mcr.microsoft.com/playwright` image via `docker run`, never on your laptop directly. Decide this at M0 — discovering it after committing 400 macOS baselines means regenerating all of them and losing the ability to review that diff meaningfully.
- Commit baselines per project. Review diffs from the Playwright HTML report uploaded as a CI artifact.

One consequence worth planning for: baseline PNGs are binary and they accumulate. At ~50 components × ~5 stories × 7 projects × 2 directions you're looking at several thousand images. Keep them small (crop to the story container, not full page), and if the repo gets heavy, move them to Git LFS before it becomes painful rather than after.

### 8.6 Docs — custom

You want full control here, and there's a stronger argument for it than control alone: **the docs site is your largest dogfooding surface and your best demo.** A docs site visibly built with the kit proves more than any screenshot grid, and you cannot build a Starlight theme out of your own components without fighting Starlight's. Combined with the shared story format (§8.4), custom is the right call.

One distinction worth making before committing: the objection may be to _Starlight_ (an opinionated theme) rather than to _Astro_ (a framework that gives you SSG, islands, and MDX while you own every layout). Astro-without-Starlight is a real middle ground if the hand-rolled build step below looks like more than you want to own.

**Stack — every piece framework-agnostic:**

- **Vite + React.** Same toolchain as everything else in the repo.
- **Routing:** `import.meta.glob` over `content/**/*.mdx` for prose, plus generated routes for component pages.
- **MDX** via `@mdx-js/rollup` for guides. Component pages aren't MDX — see below.
- **Shiki** for syntax highlighting, at build time. Zero runtime cost.
- **Pagefind** for search, post-build. It indexes static HTML and knows nothing about your framework — this is what Starlight uses internally, so you lose nothing by going custom.
- **Theme built with `@scope/ui`.** The whole point.

**Component pages are generated, not authored.** Three inputs, one page:

```
Button.stories.tsx    → live examples, variants gallery
Button.d.ts           → props table (isolatedDeclarations makes extraction reliable)
Button.css            → component-token table (scan for --ui-button-* declarations)
        ↓
    /components/button
```

Page template — lock it at M1, since it renders ~50 times:

```
1. One-line description + import snippet
2. Live examples (from stories)
3. Props table              ← generated
4. Component-token table    ← generated
5. Keyboard map             ← authored, per component
6. Accessibility notes + APG pattern link  ← authored
7. "Open in StackBlitz" link
```

Only items 5 and 6 are hand-written, as a short MDX fragment colocated with the component. Hand-maintained props tables drift within two releases; generated ones cannot.

**Build it in two stages — do not write an SSG at M1.**

- **M1: CSR-only Vite SPA.** Client-side routing, no prerendering. Cheap to stand up, and nobody is searching for the project yet so SEO is irrelevant.
- **M8: add prerendering.** A `prerender.ts` that walks the route manifest, `renderToString`s each into an HTML shell, and hydrates on load — roughly 150 lines, no framework. Add Pagefind and a sitemap once static HTML exists.

**Live editing:** StackBlitz links first — near-zero effort, real environment, and it exercises the published package rather than your source. Add in-page Sandpack only if people ask. Do not build prop-control panels; that's rebuilding Storybook with none of its maintenance.

**Honest cost:** roughly 2–3 weeks more than an off-the-shelf theme, spread across M1 and M8, and it's work that doesn't advance the library itself. It's worth it for the dogfooding and the shared story pipeline. It stops being worth it the moment you're building sidebar collapse animations at M9 instead of fixing `Select` — if that happens, ship the ugly version and move on.

**Not using Storybook.** It brings a substantial dependency tree and a second build pipeline, and the two capabilities it would provide here — interaction testing and visual regression — are already covered by Vitest Browser Mode and the Playwright harness. The story format above is roughly 40 lines of types and covers the remaining need.

**Playground** stays a separate Vite app and stays deliberately ugly. Its job is kitchen-sink pages for manual VoiceOver/NVDA passes: nested overlays, forms in every error state, RTL, forced-colors. Deploy it under `/playground` on the docs site — iOS VoiceOver testing needs a URL reachable from a real iPhone, and `vite --host` over LAN works right up until you're not on your own network.

### 8.7 Hosting

**GitHub Pages** is the right start: free, unlimited for public repos, no account, no vendor. Deploy with `actions/upload-pages-artifact` + `actions/deploy-pages` — the modern path, no `gh-pages` branch to manage.

The one real gotcha is the base path. `<org>.github.io/ui/` means every asset URL needs the prefix:

```js
// apps/docs/astro.config.mjs
export default defineConfig({
  site: "https://<org>.github.io",
  base: "/ui", // omit if you move to a custom domain
});
```

Get this working at M1 with one page. Discovering base-path breakage at M9 with 50 pages of hardcoded links is a bad afternoon.

**Cloudflare Pages** is the upgrade path, and its one advantage is real: **per-PR deploy previews**, which GitHub Pages doesn't offer. For a UI library where most PRs are visual, a preview URL on every PR is worth a lot once external contributors show up. Free tier is generous. Your VRT artifacts in CI already surface visual diffs, so this is a nice-to-have, not a blocker.

**Recommendation:** GitHub Pages from M1. Move to Cloudflare Pages (or add it for previews only) when contributor PRs start arriving. A custom domain is worth ~€10/year before 1.0 — `github.io` in a URL reads as a hobby project, which undercuts the "production-ready, zero dependencies" pitch.

### 8.8 React Native environment (post-1.0 only)

Build nothing here before web 1.0. When you do:

**App:** Expo with Expo Router, one screen per component. A pure-JS UI kit may run in Expo Go initially, but Maestro and Detox both want real builds — plan on a development build (local `expo prebuild` is fine; EAS free tier has monthly build limits worth checking before you depend on it).

**Unit tests:** Jest + React Native Testing Library. Vitest has no RN support and no roadmap for it, so this is a genuinely separate test stack — separate config, separate helpers, separate CI job. Budget for the duplication rather than hoping to share.

**E2E:** **Maestro.** YAML flows, no build step for the test code, and one syntax across both platforms. Detox is the alternative worth evaluating for large suites — it's grey-box and synchronises with the app rather than polling — at the cost of a heavier setup. Appium is the option when a device-cloud grid is a requirement.

There's a specific reason Maestro fits _this_ project: **its element selection is accessibility-tree based.** So write every flow selecting only by accessibility label — never `testID`. A flow that passes is proof the component is navigable by the same tree VoiceOver and TalkBack use. That turns your E2E suite into an a11y suite for free, which is exactly the property you don't get on web (where Playwright can query by `data-testid` and tell you nothing about the a11y tree).

**Visual regression on RN is a downgrade — accept it.** There's no clean equivalent of the web screenshot matrix across simulators. Maestro can capture screenshots but diffing them reliably across OS versions and device sizes is fragile. Realistic plan: structural snapshots via RNTL for regressions, plus manual review in the showcase app. Don't try to port the web VRT setup.

---

## 9. React Native — the honest assessment

**Nothing about the styling layer transfers.** No cascade, no layers, no custom properties, no `color-mix`, no pseudo-classes, no `forced-colors`. The a11y model is entirely different (`accessibilityRole` vs ARIA, `AccessibilityInfo` vs live regions, including known iOS quirks around `aria-live` and cached accessibility labels). Vitest has no RN support, so you'd need a parallel Jest setup.

Owning your primitives makes this _slightly_ better than it would otherwise be — your state and prop-plumbing hooks (Group A) are platform-agnostic and do transfer. Everything in Groups B–F does not, because it's all DOM.

| Shareable                                | Not shareable              |
| ---------------------------------------- | -------------------------- |
| Token source (`@scope/ui-tokens`)        | All CSS                    |
| Group A hooks (state/props plumbing)     | Groups B–F (all DOM-bound) |
| Public prop names + TypeScript contracts | Behavior implementations   |
| Docs structure, naming, design decisions | Tests, VRT baselines       |

**Recommendation:** ship `@scope/ui-tokens` as an RN-ready package at M1 so the door stays open. Write no RN code before web 1.0. The one credible universal path is **react-strict-dom**, but it constrains styling to a StyleX-compatible subset, which kills cascade layers and the component-token override story — a different product with a different pitch. Don't try to be both.

---

## 10. Roadmap

Durations are effort-weeks, not calendar time. Building the primitives in-house roughly **doubles** the total versus wrapping an existing primitives library — worth stating up front rather than discovering it at milestone five.

### M0 — Foundations & environments · ~3 weeks

Monorepo (pnpm workspaces), the shared config packages wired in, tsdown + Lightning CSS build, Vitest projects config (node/unit) green, changesets, commitlint, LICENSE, CODE_OF_CONDUCT, CONTRIBUTING with the zero-dep policy and DCO (§11).

Plus the environments from §8: the story format and types (§8.4), `smoke-vite` and `smoke-next` consuming the **packed tarball**, `playground` skeleton, and the CI matrix including the `smoke` job. Settle the Docker baseline-generation workflow now (§8.5) — it's a one-line decision at M0 and a full regeneration later.
**Exit:** a trivial component publishes as `0.0.1`, and CI proves it installs and builds from a tarball in both a Vite SPA and a Next.js App Router app. Widened from 2 weeks because the smoke pipeline is real work — and it pays for itself the first time it catches a missing `"use client"`.

### M1 — Styling system, harnesses + Button · ~5 weeks

Cascade layer order, three-tier tokens, reset, `ThemeProvider` with FOUC-safe inline script, `@scope/ui-tokens` + build script, the state-attribute vocabulary spec, primitives Group A, and `Button` + `IconButton` to full DoD.

Plus: `apps/vrt` with the Playwright matrix green against `Button.stories.tsx`; docs as a CSR-only Vite SPA **deployed to GitHub Pages** with the base path verified; the component page template locked; and the props-table and token-table generators working against `Button`.
**Exit:** the DoD checklist proven end-to-end on one component, that component has a live docs page on a public URL, and its full visual matrix is committed as baselines. From here every component ships with stories, screenshots, and docs in the same PR — no debt accumulates in any of the three.

### M2 — Presentational set · ~3 weeks

All of Tier 1. No behavior, high volume, fast confidence. Establishes the visual language.
**Exit:** `0.2.0`, screenshot grid in the README, first public "building this" post.

### M3 — Primitives: focus & DOM · ~5 weeks

Groups B and C. `getTabbableCandidates`, `FocusScope`, focus restoration, `useRovingFocus`, `useTypeahead`, `Collection`.
**Exit:** a demo page proving trap + restore + roving + typeahead across Chromium, Firefox, and WebKit, with a dedicated test suite per primitive. **No user-facing output this milestone** — schedule a visible deliverable immediately after.

### M4 — Primitives: layers & dismissal · ~4 weeks

Group D + Group F. `DismissableLayer`, scroll lock (budget a full week for iOS Safari alone), `Presence`, `Portal`, live region manager.
**Exit:** `Dialog` and `AlertDialog` ship to full DoD, including nested dialogs. First real payoff for M3–M4.

### M5 — Positioning · ~4 weeks

Design the `usePosition` interface first, then implement. CSS anchor positioning primary, JS fallback behind `@supports`.
**Exit:** `Popover` and `Tooltip` ship. **Hard checkpoint:** if this milestone runs past six weeks, drop in `@floating-ui/react-dom` behind the existing interface, update the README badge from 0 to 1 dependency, and move on. Deciding this in advance is what keeps it from eating the project.

### M6 — Forms · ~5 weeks

`Field` first, then the rest of Tier 2. Where the a11y story gets proven — label/description/error association, `aria-invalid`, `aria-describedby` composition, error announcement.
**Exit:** a complete registration form built from the kit, completable keyboard-only, and independently with VoiceOver only.

### M7 — Overlays · ~6 weeks

Remaining Tier 3: `Menu`, `ContextMenu`, `Menubar`, `Select`, `HoverCard`, `Drawer`, `Toast`, `ScrollArea`. `Menu` before `Select`.
**Exit:** nested Dialog → Popover → Menu → Submenu with correct Esc ordering and focus return at every level. This is the hardest milestone in the project.

### M8 — Navigation, disclosure & data · ~5 weeks

All of Tier 4, plus the 1.0 part of Tier 5: `Table`, `DescriptionList`, `Combobox`, `CommandPalette`. `TagsInput`, `Rating`, `Tree`, and `Resizable` are already marked deferred in the tier doc — cut them without guilt. Also: add prerendering to the docs app (§8.6) plus Pagefind and a sitemap, now that SEO starts to matter.
**Exit:** feature-complete for 1.0 scope.

### M9 — Guides, polish, 1.0 · ~3 weeks

Component pages already exist (M1 onward), so this milestone is the narrative content: getting-started, theming guide, migration-from-Tailwind guide, accessibility statement, and a page explaining the zero-dependency architecture — that's your differentiator, so give it real estate. Plus custom domain, final a11y audit pass, and the announcement post.
**Exit:** `1.0.0`, semver commitment, announcement.

### Post-1.0

The date-picker family, additional themes, a React Native spike, a design-tool component library, a `create-ui-app` starter, i18n of built-in strings, and a possible `@scope/ui-primitives` extraction. See `components/TIER-6-ADVANCED.md` for what belongs here and what doesn't.

**Total to 1.0: roughly 42 effort-weeks.**

Two structural risks worth naming now:

- **M3–M5 span roughly ten weeks with almost nothing user-visible.** Mitigation: ship `0.2.0` at M2 so the presentational components are already in users' hands and generating feedback during the primitives work. Writing up the primitives publicly as they land also converts otherwise-invisible progress into something reviewable.
- **Scope will grow.** Every component you add to 1.0 costs 2–3× what it would if you were wrapping a primitives library. The single most valuable thing you can do at M8 is cut aggressively. A 40-component library that's flawless beats a 70-component library with three broken keyboard models.

---

## 11. Licensing & contributions

**License: MIT.** Contributions accepted under the **Developer Certificate of Origin**.

### Why DCO rather than a CLA

Copyright in a contribution belongs to its author. When someone opens a pull request against an MIT repository, the practical effect is that their code becomes available under MIT — but MIT is a license to everyone, not an additional grant to the maintainer. Notably, it does not convey the right to redistribute that contribution under different terms.

A **Contributor License Agreement** is the instrument that does convey that right, and it's therefore only necessary if the project might one day be distributed under a license other than MIT. This project has no such plan, so a CLA would add contribution friction for a right it will never exercise.

The **DCO** is a lighter instrument that fits: it's an attestation rather than a license grant — _"I wrote this or have the right to submit it, and I understand it will be distributed under the project's license."_ It's signed with `git commit -s`, adds no signup step, collects no data beyond what's already in the commit, and is verified by a CI check. The Linux kernel, Git, and most CNCF projects use it.

### Setup

1. `LICENSE` — MIT.
2. `CONTRIBUTING.md` — an explicit inbound=outbound statement: _"Contributions to this project are licensed under the MIT License, the same terms as the project itself."_ GitHub's Terms of Service already establish inbound=outbound for public repositories, but stating it directly is clearer for contributors and costs nothing.
3. A DCO check in CI requiring a `Signed-off-by` trailer on every commit.
4. Clean, attributable commit history — never squash away authorship.
5. `CONTRIBUTING.md` asks that substantial features start as an issue. That's good practice regardless of licensing, and it's where any question about a large contribution would naturally be raised.

Nothing here constitutes legal advice; projects with different circumstances should take their own.

## 12. Decisions to make before M0

1. **Name and npm scope.** Settle both before the first publish; renaming a published package is disruptive for early adopters. If the name is distinctive rather than descriptive, a search of the relevant trademark registers is cheap insurance.
2. ~~Wrap an existing primitives library, or build from scratch~~ — **decided: from scratch.** Consequence: the M5 positioning checkpoint in §10 is the one pre-agreed escape hatch. Honour it.
3. **Licensing.** §11 — MIT, contributions under DCO.
4. **React 19-only, or support 18?** Recommend 19+. Ref-as-prop and the modern model are worth the smaller addressable base.
5. **Browser support target.** Recommend Baseline Widely Available. `oklch`, `color-mix`, cascade layers, nesting, `:has()`, `<dialog>`, `popover`, `inert` all qualify. Anchor positioning does **not** yet, which is exactly why §2.3 needs a fallback. Commit to the target deliberately — the whole architecture rides on it.
6. **Public state-attribute vocabulary.** With the primitives built in-house, `data-open` vs `data-state="open"` is an open choice and a permanent one. `components/00-CONVENTIONS.md` §3 proposes presence-only booleans and valued enums — review and lock it at M1, because changing it later is a breaking change across ~66 components.

## Appendix A — Button reference implementation

```tsx
// packages/ui/src/components/Button/Button.tsx
import type { RenderProp } from "../../internal/props/render.js";
import { useRender } from "../../internal/props/useRender.js";

export const buttonVariants = ["solid", "soft", "outline", "ghost"] as const;
export const buttonSizes = ["sm", "md", "lg"] as const;

export type ButtonVariant = (typeof buttonVariants)[number];
export type ButtonSize = (typeof buttonSizes)[number];

export interface ButtonProps extends React.ComponentPropsWithRef<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, sets aria-busy, blocks activation — without leaving the tab order. */
  loading?: boolean;
  /** Announced to assistive tech while `loading`. */
  loadingLabel?: string;
  render?: RenderProp<{ variant: ButtonVariant; size: ButtonSize }>;
}

export function Button(props: ButtonProps): React.ReactElement {
  const {
    variant = "solid",
    size = "md",
    loading = false,
    loadingLabel = "Loading",
    disabled,
    children,
    render,
    ...rest
  } = props;

  return useRender({
    render,
    state: { variant, size },
    props: {
      ...rest,
      type: rest.type ?? "button",
      className: `ui-Button ${rest.className ?? ""}`.trim(),
      "data-variant": variant,
      "data-size": size,
      "data-loading": loading ? "" : undefined,
      // Not `disabled`: a disabled button leaves the tab order and its
      // tooltip becomes unreachable. aria-disabled keeps it focusable.
      "aria-disabled": disabled || loading || undefined,
      "aria-busy": loading || undefined,
      onClick: disabled || loading ? preventActivation : rest.onClick,
      children: (
        <>
          {loading && <span className="ui-Button-spinner" aria-hidden="true" />}
          <span className="ui-Button-label">{children}</span>
          {loading && (
            <span className="ui-sr-only" role="status">
              {loadingLabel}
            </span>
          )}
        </>
      ),
    },
  });
}

function preventActivation(event: React.MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}
```

```css
/* packages/ui/src/components/Button/Button.css */
@layer ui.components {
  .ui-Button {
    --_bg: var(--ui-button-bg, var(--ui-color-accent));
    --_fg: var(--ui-button-fg, var(--ui-color-accent-text));
    --_radius: var(--ui-button-radius, var(--ui-radius-md));

    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-2);
    border: 1px solid transparent;
    border-radius: var(--_radius);
    background: var(--_bg);
    color: var(--_fg);
    font: inherit;
    font-family: var(--ui-font-sans);
    font-weight: 500;
    cursor: pointer;
    transition: background var(--ui-duration-fast) var(--ui-ease-out);

    &[data-size="sm"] {
      block-size: 2rem;
      padding-inline: var(--ui-space-3);
      font-size: 0.875rem;
    }
    &[data-size="md"] {
      block-size: 2.5rem;
      padding-inline: var(--ui-space-4);
      font-size: 0.9375rem;
    }
    &[data-size="lg"] {
      block-size: 3rem;
      padding-inline: var(--ui-space-5);
      font-size: 1rem;
    }

    &[data-variant="soft"] {
      --_bg: color-mix(in oklch, var(--ui-color-accent) 14%, transparent);
      --_fg: var(--ui-color-accent);
    }
    &[data-variant="outline"] {
      --_bg: transparent;
      --_fg: var(--ui-color-text);
      border-color: var(--ui-color-border);
    }
    &[data-variant="ghost"] {
      --_bg: transparent;
      --_fg: var(--ui-color-text);
    }

    &:hover:not([aria-disabled]) {
      background: color-mix(in oklch, var(--_bg) 88%, black);
    }
    &:active:not([aria-disabled]) {
      background: color-mix(in oklch, var(--_bg) 78%, black);
    }

    &:focus-visible {
      outline: 2px solid var(--ui-color-focus-ring);
      outline-offset: 2px;
    }

    &[aria-disabled] {
      opacity: 0.55;
      cursor: not-allowed;
    }
    &[data-loading] .ui-Button-label {
      opacity: 0.7;
    }
  }

  @media (forced-colors: active) {
    .ui-Button {
      border: 1px solid ButtonBorder;
      color: ButtonText;
      forced-color-adjust: none;
    }
    .ui-Button:focus-visible {
      outline-color: Highlight;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ui-Button {
      transition-duration: 1ms;
    }
    .ui-Button-spinner {
      animation: none;
    }
  }
}
```

---

## Appendix B — Positioning interface (write this before implementing)

Design this at the start of M5 and never let geometry logic leak outside it. This interface is what makes the M5 checkpoint in §10 a one-week swap instead of a rewrite.

```ts
// packages/ui/src/internal/positioning/types.ts

export type Side = "top" | "right" | "bottom" | "left";
export type Align = "start" | "center" | "end";

export interface PositionOptions {
  side?: Side;
  align?: Align;
  /** Gap between anchor and floating element, in px. */
  sideOffset?: number;
  /** Shift along the alignment axis, in px. */
  alignOffset?: number;
  /** Flip to the opposite side when it would overflow. */
  flip?: boolean;
  /** Slide along the alignment axis to stay in view. */
  shift?: boolean;
  /** Constrain max-height/max-width to available space. */
  fitViewport?: boolean;
  /** Match the anchor's inline size (e.g. Select). */
  matchAnchorWidth?: boolean;
  /** Recompute on scroll/resize/anchor movement. */
  autoUpdate?: boolean;
  collisionPadding?: number;
}

export interface PositionResult {
  anchorRef: React.RefCallback<HTMLElement>;
  floatingRef: React.RefCallback<HTMLElement>;
  arrowRef: React.RefCallback<HTMLElement>;
  /** Apply to the floating element. May be empty in the CSS-anchor path. */
  floatingStyles: React.CSSProperties;
  arrowStyles: React.CSSProperties;
  /** Resolved placement after flip/shift — components style against these. */
  placedSide: Side;
  placedAlign: Align;
}

export function usePosition(options: PositionOptions): PositionResult;
```

Components consume only `placedSide` / `placedAlign` (surfaced as `data-side` / `data-align` attributes for CSS) and the returned refs and styles. They never see pixels.
