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
number format. Calculator inputs/results and practice bet inputs are never
placed in URLs, storage or cookies. Practice alone saves settings, aggregate
statistics and an unfinished Online round's ID/deadline in local storage.
Theme and language are tab-local; New hand preserves them. Clipboard access is
requested only on an explicit copy click; if denied, the full amount is selected
and instructions explain manual copying instead of silently reporting success.

## SPR practice

**Calculator / Practice** navigation preserves calculator inputs. Practice has
independent **Live / Online** settings and stats, with no backend, accounts,
analytics or game integration. Decorative card backs have no ranks, suits or
effect on the arithmetic. Mobile uses the existing calculator-tab
row for navigation; Practice itself scrolls naturally.

Practice opens as a table-first game: **Play**, a compact played/accuracy/streak
HUD, and a large bet field/button. The active hero seat, street track, short
bet/call badges and visual results replace instruction paragraphs in the play
area. Online adds a numeric countdown and draining clock bar; Live shows neither.
**?** opens the rules. The settings icon holds fixed stakes, best streak and
Reset stats. Menus do not pause the clock. Correct bets pulse the table and show
a green check; incorrect bets shake the table and show a red cross, without
wordy result banners. Live's accepted flop gets a check without revealing the
solution or counting a completed round. Screen readers receive explicit localized
correct/incorrect labels. Brief effects respect reduced motion; symbols remain
visible without animation or color. Decorative chips are not interactive controls.
Final results use compact bars instead of an Explain button or text breakdown.
Each street shows its SPR separately from an annotated bar. Correct sizing is
aligned with its target tick. Submitted amounts sit directly above their diamond,
with **Your bet** below and matching marker colors. Accepted-range amounts center
on the green band, retaining **Accepted range** and its green bracket below.
Each amount has its plain percentage on a separate line. Resize-aware placement
measures the actual labels and staggers collisions vertically instead of spreading
labels sideways or drawing diagonal lines. The submitted bet stays closest to
the bar; only labels at chart edges are shifted inward to avoid overflow.
Feedback does not repeat "Chips" or "of pot." Online BB units remain explicit.
Correct-bet amounts round to whole numbers when that still gives an accepted bet;
otherwise fractional amounts stay
precise. Screen readers receive a complete localized description, including units
and percentage-of-pot context.
Bars use the recorded full-precision answer (whole legal bounds in Live), adapt
their scale to include both the range and the bet, and follow the Online Chips /
BB toggle without changing SPR or percentages. Visible accepted-range amounts
and pot percentages use whole numbers; fractional ranges retain decimals if
rounding would collapse them or display a positive lower bound as zero.
Online amounts remain marked approximate, and positive percentages below 0.5%
show as **<1%**. Displayed SPR uses at most one decimal (3 stays 3; 4.24 becomes
4.2); positive values below 0.05 show as **<0.1**, not zero. Grading, bar geometry and
the underlying SPR calculation retain full precision.
Timeouts show the target without
inventing a bet marker. No range or solution appears between Live answers.
Large **2E / 3E** badges show only **2 / 3 streets to all-in** underneath,
without answer counters. Each seat has two decorative card backs; the community board shows
three on the flop and four on the turn. Cards are non-interactive and hidden
from assistive technology; street labels carry the actual game state.

Each **2e** spot starts on the turn, or sometimes on the flop when hero is out
of position. A flop **2e** ends all-in on the turn; a turn **2e** ends on the
river. **3e** starts on the flop and ends on the river. The street track,
grading and result bars follow the selected plan, not just the current street.
Hero remains physically at the bottom of a nine-seat Live / six-seat Online
table, with poker positions, dealer and opponent check consistent with clockwise
seat order. Only hero/opponent participate. Their stacks usually differ; find
the smaller stack yourself. No effective stack, SPR or target sizing is revealed
while a round is active. Final range bars show the correct sizing, your bet and
the accepted range directly. Display values are rounded (Online ranges marked
approximate); grading stays full precision.

Live accepts positive whole-number bets only, with no timer, percentage
shortcuts, BB display or chip controls. Live **5/10** automatically uses a
smallest chip of **5** (also for custom blinds set to 5/10): generated starting
pots and both stacks are multiples of 5. Bets may still be any positive whole
number. Calls use the exact submitted bet, so updated amounts need not remain
multiples of 5. Other Live stakes retain whole-chip starting amounts.
Geometric targets and grading stay unrounded.
Live 3e asks for a flop bet and a turn
bet: the opponent matches the actual accepted flop amount, both stacks decrease
by that amount, and the updated turn pot is shown in the middle, with the original
pot retained below it. The correct turn bet is recomputed
from those remaining stacks and the actual called pot over two remaining streets.
Other rounds require one answer. The final turn/river shove is never another answer.
Wrong sizing ends the round immediately; Live 3e records one successful round
only after both answers succeed. Opponent actions use brief comic-style Check /
Call bubbles; matching bets animate chips from both players into the pot.
An in-position hero waits for the opponent's check, including on the turn after
a flop call, with a one-second pause between the call and check effects.
The bet field stays enabled but read-only until action reaches hero,
without reopening the keyboard or adding an extra action.
An amount above either remaining stack shows **Maximum bet** beside the input
and keeps the round open for correction, without grading an answer. Online time
continues to run during validation.
An explicit final bet moves keyboard focus to Next spot; an offscreen timeout
never moves focus away from the calculator.

Online allows decimals, fill-only **33% / 66% / 100%** buttons, and **Chips / BB**
conversion that retains the exact underlying draft and deadline.
Table amounts and automatically filled/converted bets show at most two decimal
places, without changing the underlying amount used for grading. Custom blind
settings and manually typed inputs retain their entered precision.
**Play / Next spot** schedules the opponent's action and fixes the deadline:
30 seconds from when action reaches hero, not from when animations finish rendering.
The countdown appears only on hero's turn and continues on hidden tabs or in
Calculator. Unit/language changes resume effects without replaying them or
resetting the deadline. No countdown runs during feedback. Switching modes, saving
different blinds, reloading or leaving the page abandons an unfinished Online
round as incorrect; Calculator navigation alone does not abandon it. Manual
Next spot is required. Only one Online round can be active per origin: another
page opening or starting practice settles the previous unfinished marker.

Grading uses the existing full-precision geometric formula and an inclusive
range of **ideal bet +/- 5 percentage points of pot**, capped at the smaller
remaining stack. For example, 50% accepts 45%-55%, not 47.5%-52.5%.
Generated amounts include small/standard bets and occasional overbets with
targets no greater than 150%; every generated spot permits an acceptable input
in both Online units or whole Live amounts.

Each mode saves one fixed preset/custom stake. Live presets: **1/2, 2/5, 5/10**.
Online: **0.05/0.10, 0.25/0.50, 0.50/1, 1/2**. Custom blinds must satisfy
`0.001 <= smallBlind < bigBlind <= 1000000`. Units are currency-neutral.
Rounds played, accuracy, current streak and best streak persist per mode.
**Reset stats** is available between rounds and preserves that mode's stake.

The `poker-spr-practice-v1` storage record atomically commits results and the
unfinished-round journal. Web Locks serialize cross-tab read/modify/write
operations; modern HTTPS/localhost browsers are required for saved practice.
Reload recovery and stale-round ID checks prevent duplicate scoring or timer
resets. Storage failures visibly pause practice instead of reporting an unsaved
success; invalid saved data offers a confirmed, practice-only reset.
Calculator arithmetic is still available when practice storage is unavailable.

## Responsive and accessibility behavior

- Pot and the smaller effective remaining stack are the first inputs, visible
  together at startup on narrow screens. No mobile autofocus or keyboard popup.
- Desktop shows both full geometric plans and all four independent raise-to
  values together, unchanged. Mobile has two accessible tabs: **2e / 3e** opens
  by default with both complete plans; **3-bet / 4-bet** contains all four
  targets, including 2.4x and 2.6x. Tab changes preserve inputs and live results.
  Each tab fits the tested normal portrait screens without page scrolling with
  the keyboard closed. The first tab also always shows a compact **SPR 2/3/4/5**
  reference at the bottom, with both 2e/3e rows labelled as percentages of pot.
  It uses the same unrounded core and one-decimal formatter, independently of
  hand inputs; SPR 5 shows 115.8% and 61.2%. It is normal page content, not an
  overlapping fixed overlay. The reference uses 13px figures with separated
  rows and a centered table no wider than 300px, keeping related columns close.
  The **?** button opens help, the full derived SPR
  reference and the public GitHub link in a separately scrollable dialog.
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
- Mobile reserves a blank buffer below the existing top safe-area inset,
  independent of whether a saved shortcut reports standalone display mode:
  48px on portrait viewports at least 700px tall, 32px at 550–699px and 16px
  at 500–549px. This moves all content, including the language control, lower.
  Smaller keyboard/reduced-height layouts keep their existing top spacing.
  Small-phone card gaps/padding remain compact without shrinking main digits
  or touch targets. Desktop spacing is unchanged.
  On short screens, invalid plans use smaller unavailable dashes so error text
  stays visible; valid bet figures keep their existing sizes and full values.
  No install metadata, zoom or scrolling permissions are disabled.

## Verification

The pure-core Node tests compare directly against the current Swift-generated
native fixture: 196 hands and their complete called-pot recurrence, 104 parsing
cases, 20 formatting cases, plus malformed/zero/tiny/huge/nonfinite and independent
invalidation tests. The 40% example remains `100 / 241.6 → 40.0, 72.0, 129.6`.
Practice tests additionally exercise inclusive tolerance boundaries, unequal
stacks, legal/whole amounts, thousands of generated fixed-stake spots, actual
Live flop calls and recalculated turns, hidden-pot view models, lossless unit
drafts, wall-clock timeouts, once-only journaling, persistence failures and stats.
Node controller tests use minimal DOM ports (not a browser) for real navigation,
form, units, feedback, storage-error and recovery wiring. Catalog checks cover
English/Hebrew keys, placeholders and DOM associations. The Practice page's
visual layout and assistive-technology behavior have not been browser-validated.

```sh
cd web
npx playwright install chromium webkit
npm run test:ui
```

The existing calculator Playwright checks are scoped to this app; running them
requires explicit browser-automation approval. Chromium and WebKit cover
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
Header regressions exercise top clearance without standalone-mode detection,
and synthetic safe-area insets, in both engines.
These check layout, sharp CSS rendering, touch/keyboard focus and no-scroll
behavior, not the physical iOS Home Screen compositor. The reported native
top-edge haze is not reproducible in desktop WebKit. The earlier standalone-only
24px buffer did not resolve it on the user's shortcut; the larger, mode-independent
buffer remains a spacing mitigation, not a claim to disable or reproduce the OS effect.

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
