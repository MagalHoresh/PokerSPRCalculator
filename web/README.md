# Poker SPR Calculator — web

Static HTML, CSS and ES modules. No production package dependencies or backend.
The public site is `https://poker-spr-calculator.magalhoresh.com`; anyone can read
the public source at `https://github.com/MagalHoresh/PokerSPRCalculator`
without signing in. Hand inputs remain private on the device.

## Build and run

Use Node 22+ from the repository root:

```sh
npm --prefix web ci
npm --prefix web run build
npm --prefix web test
npm --prefix web start
```

The loopback server serves only `web/dist`, not the repository. `build.mjs` uses
an explicit publish allowlist and generates the browser copy catalog from the
tested native English/Hebrew strings. It never uploads the native applications,
input fixtures, test artifacts, secrets or deployment-session directory.
The HTTP loopback preview applies the production content policy except HTTPS
upgrading/HSTS, because it does not host a local TLS endpoint. The deployed
HTTPS site keeps both directives and is checked separately.

The page uses browser number-format preferences for its decimal separator.
English is the initial interface language on every load, independently of that
number format. Inputs and results are not placed in URLs, storage or cookies.
Theme and language are tab-local; New hand preserves them. Clipboard access is
requested only on an explicit copy click; if denied, the full amount is selected
and instructions explain manual copying instead of silently reporting success.

## Responsive and accessibility behavior

- Pot and the smaller effective remaining stack are the first inputs, visible
  together at startup on narrow screens. No mobile autofocus or keyboard popup.
- Desktop shows both full geometric plans and all four independent raise-to
  values together, unchanged. Mobile has two accessible tabs: **2e / 3e** opens
  by default with both complete plans; **3-bet / 4-bet** contains all four
  targets, including 2.4x and 2.6x. Tab changes preserve inputs and live results.
  Each tab fits the tested normal portrait screens without page scrolling with
  the keyboard closed. The **?** button opens help, the derived SPR reference
  and the public GitHub link in a separately scrollable dialog.
- Hebrew text/layout is right-to-left. Numerical values, percentage signs,
  decimal editing and clipboard amounts remain left-to-right. Switching language
  preserves the active input's value and selection and updates its alignment.
  Large bet/raise amounts align with their labels: left in English and right
  in Hebrew, without reversing digits or changing the centered reference table.
- Results use high-contrast tabular numbers, with a dominant **BET NOW** value.
  Full magnitudes are retained, never ellipsized. Very large values shrink to fit;
  mobile card values wrap at 20px rather than shrinking into unreadable digits.
- Each plan is an ordered path: **Bet now → Turn → River / All-in** for 3e
  (starting on the flop), or **Bet now → River / All-in** for 2e (starting on
  the turn). Both plans and every bet stay visible together on the first mobile
  tab. Their cards are side by side, with arrows mirrored in Hebrew. Extremely
  narrow, zoom-equivalent layouts stack cards with downward arrows and allow
  natural scrolling instead of clipping. There is no animation or delayed bet.
- Light/dark/system controls, reduced motion, increased contrast and forced-color
  CSS, focus rings, input labels/errors and a focus-contained assumptions dialog.
  Appearance uses a rounded keyboard-focus ring around the whole control,
  not a square left behind by a mouse/touch selection.
  Amount inputs use one accent border when focused, without a second outer
  ring or shadow. Invalid input keeps its error border and visible error text;
  forced-color mode uses the system highlight for the focused field.
- Mobile **Go** deliberately blurs the active input, preserving its text and
  selection and showing actionable errors for missing/unfinished values. It is
  not a calculate button: results remain live, with no timer or typing-triggered
  keyboard dismissal. Pot uses decimal input mode and a Next hint; Enter advances
  to stack. Stack/facing size use a Go hint, and Enter finishes editing.
- Alt+1/2/3 select inputs and open the appropriate mobile tab; desktop Enter
  behavior is unchanged. Arrow/Home/End keys operate the mobile tab list.
  Alt+N clears. Normal Tab navigation includes interactive buttons and links;
  it is not trapped into a three-field loop.
- Native keep-on-top and OS menu-bar commands have no browser equivalent.
  Browsers/platform fonts can differ visually without changing calculation rules.
- Home Screen standalone mode reserves a 24px blank buffer below the existing
  top safe-area inset on normal-height phones, moving header controls away from
  the host's soft scroll edge. On small phones, tighter card gaps/padding pay
  for this buffer without shrinking digits or touch targets. Browser tabs and
  keyboard/reduced-height layouts below 550px keep their existing spacing.
  No install metadata, zoom or scrolling permissions are disabled.

## Verification

The pure-core Node tests compare directly against the current Swift-generated
native fixture: 196 hands and their complete called-pot recurrence, 104 parsing
cases, 20 formatting cases, plus malformed/zero/tiny/huge/nonfinite and independent
invalidation tests. The 40% example remains `100 / 241.6 → 40.0, 72.0, 129.6`.

```sh
cd web
npx playwright install chromium webkit
npm run test:ui
```

Approved Playwright checks are scoped to this app. Chromium and WebKit cover
320/360/375/390/430px mobile widths, 844px landscape, 1280/1440px desktop, touch
emulation, reduced-height/keyboard-like viewport changes, 200%-equivalent layout,
English/Hebrew live switching, actual input/copy/reset flow, invalidation, both
themes/system media changes, focus restoration, explicit clipboard denial,
comma locale, no calculation network traffic or storage, visible startup inputs,
minimum font sizes and no horizontal overflow. Screenshots capture this page only.
The dedicated mobile matrix measures actual document client/scroll dimensions
and bounds of every core amount/label on **both tabs**, in English/Hebrew,
light/dark, and empty/valid/error states at **320x568, 360x640, 375x667,
390x844, 430x932**, plus **320x518** to reserve additional browser height.
Normal bet amounts remain at least 30px and raise targets at least 36px in that
matrix. Largest/tiny inputs retain their full text and safe copy behavior.
Keyboard-open/reduced-height, very narrow zoom-equivalent layouts and landscape
may scroll vertically for accessibility; content is never hidden to fake a fit.
The one-screen claim applies to the measured normal portrait, keyboard-closed
viewports, not every device, zoom level or OS keyboard overlay.

WebKit/mobile emulation is not a physical iPhone/Android keyboard, VoiceOver or
TalkBack audit. OS keyboard overlays, browser chrome and safe-area behavior still
depend on the actual device. Clipboard mocks test success/denial logic; an additional Chromium check exercises
real clipboard writes/reads in the approved secure context. WebKit's automation
does not expose that permission grant, so that additional check is skipped there.
Header regressions also exercise the published standalone CSS declarations with
their media condition forced, and synthetic safe-area insets, in both engines.
These check layout, sharp CSS rendering, touch/keyboard focus and no-scroll
behavior, not the physical iOS Home Screen compositor. The reported native
top-edge haze is not reproducible in desktop WebKit; the blank buffer is a
targeted mitigation, not a claim to disable the OS effect.

## Hosting scope

The planned deployment is one new Azure Static Web Apps **Free** resource in
East US 2, separate from all existing sites. Only `web/dist` is deployed. No API,
database, application authentication, telemetry, paid service, managed identity
or broad role assignment is needed. Azure serves the public assets; that does not
make the GitHub repository public. Azure infrastructure and code deployment
require separate explicit approval gates.

Custom domain DNS is restricted to the new
`poker-spr-calculator.magalhoresh.com` host. Do not edit the apex, timetable host
or unrelated records. Managed HTTPS availability is verified before delivery.
Free hosting is $0 within the plan's allowances and has no SLA; domain
registration and GitHub build quotas are separate.

The reviewed templates are `infra/main.bicep`,
`infra/modules/static-site.bicep`, and `infra/main.parameters.json`.
After explicit deployment approval, Azure CLI validates/what-ifs and deploys the
subscription template. The static upload helper is deliberately locked to this
resource:

```sh
npm --prefix web run build
POKER_DEPLOY_AUDIT_PATH="$PWD/.copilot-azure/sessions/<active-session>/deploy-audit.log" \
  SWA_CLI_PATH="/path/to/swa" node scripts/deploy-web.mjs --approved
```

The helper refuses other resource names, SKUs, regions, symlinks or extra publish
files. It reads the resource-scoped deployment credential into subprocess memory
only, disables the SWA CLI keychain, redacts output, and logs started/result audit
records without secrets in the ignored onboarding session. It never provisions
resources or changes DNS. The `--approved` flag is not a substitute for obtaining
the required approval first.

### Exact deployed resource

| Setting | Value |
| --- | --- |
| Subscription | `573de2b2-22e1-4dae-b848-62c799fd63cc` |
| Resource group | `rg-poker-spr-calculator-prod-f241` |
| Static Web App | `swa-poker-spr-calculator-prod-f241` |
| Region / SKU | `eastus2` / `Free` |
| Azure hostname | `kind-plant-06127fa0f.3.azurestaticapps.net` |
| Requested custom hostname | `poker-spr-calculator.magalhoresh.com` |

The initial infrastructure deployment and static upload succeeded after separate
explicit approvals. Both the Azure and custom-domain HTTPS pages and their asset
hashes were verified on 2026-10-13 UTC. The custom domain is **Ready** with a
valid managed TLS certificate:
[poker-spr-calculator.magalhoresh.com](https://poker-spr-calculator.magalhoresh.com/).
Only the new poker hostname should have a DNS-only CNAME to the Azure hostname;
the timetable and apex records are unrelated and must not be changed.

For this initial deployment the owner added that exact CNAME manually in
Cloudflare. The separately authorized Azure hostname binding uses CNAME
delegation; managed TLS must reach a ready state before treating the custom URL
as complete. Future operators should verify the existing binding rather than
recreating or editing unrelated DNS:

```sh
az staticwebapp hostname list --subscription 573de2b2-22e1-4dae-b848-62c799fd63cc \
  --resource-group rg-poker-spr-calculator-prod-f241 \
  --name swa-poker-spr-calculator-prod-f241
```

The resource-scoped binding is a deployment operation, not permission to manage
the Cloudflare zone. Never bypass a certificate error or disable TLS checks.

Azure retains a reserved anonymous status endpoint at `/.auth/me`, returning
`{"clientPrincipal":null}` to anonymous requests. The calculator does not call
that endpoint, expose login UI, require accounts, or send hand data to it.
The repository, native files, private deployment artifacts and API paths are not
published. Content security policy disallows application network connections.

Validate the deployed poker page without a local server:

```sh
POKER_TEST_URL="https://poker-spr-calculator.magalhoresh.com" \
  npm --prefix web run test:ui
```

The test harness accepts only the canonical poker host and its exact Azure
hostname, never an arbitrary site. The footer and mobile help dialog link to the public source;
neither the calculator nor reading its code requires an account.
The alignment/focus live-domain run passed 48 browser cases, with two unsupported
WebKit cases explicitly skipped: clipboard permission grants and Windows
forced-color emulation. Chromium covers both; clipboard success/denial logic is
also covered in both engines.

For explicit owner-requested removal only, delete this resource group after
removing the poker-specific DNS CNAME to avoid a dangling hostname:

```sh
az group delete --subscription 573de2b2-22e1-4dae-b848-62c799fd63cc \
  --name rg-poker-spr-calculator-prod-f241
```

This command is documented, not run by the deployment or upload helper.
