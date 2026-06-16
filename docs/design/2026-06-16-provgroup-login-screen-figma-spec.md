# PROVGROUP Login Screen 1 Figma Measurement Spec

Source: `PROVGROUP Login Screen 1`

- Figma URL: `https://www.figma.com/design/7XBL2aW1p5sOluwUuJJAC0/PROVGROUP-Login-Screen-1?node-id=26-46`
- Frame node: `26:46`
- Frame name: `PROVGROUP Login Screen`
- Captured on: `2026-06-16`
- Coordinate system: absolute pixels, origin at top-left of the `390 x 844` frame.
- Notes:
  - Figma MCP returns some text layers with center positioning but no explicit rendered text bounding box. For those layers this file records the exact Figma anchor, width if present, typography, and text content.
  - Asset URLs returned by Figma MCP are short-lived and are not stored here as source of truth. SVG geometry/colors were inspected from the returned assets where needed.

## Frame

| Node    | Element          |    X |   Y |     W |     H | Fill      | Border        | Radius |
| ------- | ---------------- | ---: | --: | ----: | ----: | --------- | ------------- | ------ |
| `26:46` | Root frame       |  `0` | `0` | `390` | `844` | `#FDFDFE` | `1px #E6E3E3` | `0`    |
| `26:47` | Inner background | `-1` | `0` | `390` | `843` | `#F7F7F7` | none          | `0`    |

## Color Tokens From Figma

| Role                   | Color                      | Usage                                     |
| ---------------------- | -------------------------- | ----------------------------------------- |
| Frame background       | `#FDFDFE`                  | Root frame fill                           |
| Screen background      | `#F7F7F7`                  | Main visible auth background              |
| Frame border           | `#E6E3E3`                  | Root frame stroke                         |
| Primary brand          | `#144164`                  | Logo tile, title, login button            |
| Link/action blue       | `#003A78`                  | Links, legal linked text, phone text/icon |
| Subtitle text          | `#838790`                  | Intro subtitle                            |
| Legal muted text       | `#B2B8C4`                  | Legal prefix text                         |
| Input border           | `#DDDFE4`                  | Email/password field border               |
| Placeholder/icon muted | `#B4BAC4`                  | Input placeholders, email icon, lock icon |
| Support divider        | `#C7CDD6` at `90%` opacity | Horizontal support lines                  |
| Vertical separator     | `#AEB4C0` at `90%` opacity | Separator between auth links              |
| Headset stroke         | `#9AA5B5`                  | Support headset icon                      |
| White                  | `#FFFFFF`                  | Login button text, logo mark              |

## Typography Tokens From Figma

| Role              | Font  | Weight |   Size | Line height | Color     | Transform/alignment |
| ----------------- | ----- | -----: | -----: | ----------- | --------- | ------------------- |
| Title             | Inter |  `700` | `22px` | normal      | `#144164` | uppercase, center   |
| Subtitle          | Inter |  `400` | `14px` | `20px`      | `#838790` | center              |
| Input placeholder | Inter |  `400` | `15px` | normal      | `#B4BAC4` | left                |
| Legal text        | Inter |  `400` | `12px` | `16px`      | `#B2B8C4` | center              |
| Legal linked span | Inter |  `400` | `12px` | `16px`      | `#003A78` | center              |
| Button text       | Inter |  `400` | `16px` | normal      | `#FFFFFF` | center              |
| Auth links        | Inter |  `400` | `13px` | normal      | `#003A78` | left                |
| Support question  | Inter |  `400` | `14px` | normal      | `#003A78` | center              |
| Phone number      | Inter |  `600` | `14px` | normal      | `#003A78` | left                |

## Element Measurements

### Logo Block

| Node    | Element       |        X |       Y |       W |       H | Styles                                           |
| ------- | ------------- | -------: | ------: | ------: | ------: | ------------------------------------------------ |
| `26:68` | Logo group    |  `162.4` |  `50.4` |   group |   group | group wrapper                                    |
| `26:69` | Logo tile     |  `163.4` |  `51.4` |    `63` |    `63` | fill `#144164`, radius `15px`                    |
| `26:70` | Logo mark SVG | `178.85` | `64.48` | `32.57` | `36.38` | fill `#FFFFFF`, SVG viewBox `0 0 32.5607 36.402` |

Derived logo spacing:

- Tile center: `x 194.9`, `y 82.9`.
- Distance from frame top to tile top: `51.4px`.
- Distance from tile bottom to title top: `44.6px`.
- Logo mark inset inside tile: left `15.45px`, top `13.08px`, right `14.98px`, bottom `12.54px`.

### Header Text

| Node    | Element  | Anchor                         | Text                                                  | Typography                                                              |
| ------- | -------- | ------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| `26:80` | Title    | top `159`, center x `190.5`    | `ВХОД ДЛЯ КЛИЕНТОВ`                                   | Inter `700`, `22px`, normal line-height, uppercase, `#144164`, centered |
| `26:48` | Subtitle | center x `194`, center y `222` | `Войдите, чтобы продолжить` / `общение с поддержкой.` | Inter `400`, `14px`, `20px`, `#838790`, centered                        |

Derived header spacing:

- Frame top to title top: `159px`.
- Subtitle center is `63px` below title top.
- Subtitle is two lines at `20px` line height, visual block height about `40px`.
- Approximate subtitle visual top/bottom: `202px` / `242px`.
- Approximate gap from subtitle bottom to first input top: `43px`.

### Email Field

| Node     | Element               |                          X |        Y |       W |                                                      H | Styles                                                |
| -------- | --------------------- | -------------------------: | -------: | ------: | -----------------------------------------------------: | ----------------------------------------------------- |
| `57:53`  | Email input container |                       `44` |    `285` |   `300` |                                                   `50` | fill transparent, border `1px #DDDFE4`, radius `10px` |
| `65:118` | Email icon            |                    `68.34` | `302.72` | `20.12` |                                                `16.08` | stroke `#B4BAC4`, SVG viewBox `0 0 21.0001 17`        |
| `57:55`  | Email placeholder     | left `103`, center y `310` |  natural | natural | Inter `400`, `15px`, `#B4BAC4`, text `name@company.ru` |

Derived email field spacing:

- Input horizontal margins: left `44px`, right `46px`.
- Icon left padding from input: `24.34px`.
- Icon right edge to placeholder left: about `14.54px`.
- Placeholder baseline is vertically centered around input center y `310px`.

### Password Field

| Node     | Element                  |                          X |        Y |       W |                                                     H | Styles                                                |
| -------- | ------------------------ | -------------------------: | -------: | ------: | ----------------------------------------------------: | ----------------------------------------------------- |
| `57:54`  | Password input container |                       `44` |    `357` |   `300` |                                                  `50` | fill transparent, border `1px #DDDFE4`, radius `10px` |
| `65:116` | Lock icon                |                    `68.34` | `373.94` | `18.12` |                                               `18.00` | stroke `#B4BAC4`, SVG viewBox `0 0 19 19`             |
| `57:74`  | Password placeholder     | left `103`, center y `382` |  natural | natural | Inter `400`, `15px`, `#B4BAC4`, text `Введите пароль` |

Derived password field spacing:

- Gap from email field bottom (`335`) to password field top (`357`): `22px`.
- Input horizontal margins: left `44px`, right `46px`.
- Icon left padding from input: `24.34px`.
- Icon right edge to placeholder left: about `16.54px`.
- Placeholder is vertically centered around input center y `382px`.

### Legal Text

| Node    | Element          | Anchor                         |     W | Text/styles                           |
| ------- | ---------------- | ------------------------------ | ----: | ------------------------------------- |
| `26:53` | Legal text block | center x `194`, center y `458` | `300` | Inter `400`, `12px`, `16px`, centered |

Text content:

```text
Используя сервис, вы принимаете Пользовательское соглашение и подтверждаете ознакомление с Политикой обработки персональных данных.
```

Color split:

- Prefix text: `#B2B8C4`.
- Linked/legal span: `#003A78`.

Derived legal spacing:

- Password field bottom to legal block center: `51px`.
- Legal block width equals input width: `300px`.

### Login Button

| Node    | Element                 |                              X |     Y |     W |                                                      H | Styles                       |
| ------- | ----------------------- | -----------------------------: | ----: | ----: | -----------------------------------------------------: | ---------------------------- |
| `26:54` | Login button background |                           `45` | `512` | `300` |                                                   `47` | fill `#144164`, radius `9px` |
| `26:55` | Login button text       | center x `194`, center y `536` | `292` |  `30` | Inter `400`, `16px`, `#FFFFFF`, text `Войти`, centered |

Derived button spacing:

- Button horizontal margins: `45px` left and `45px` right.
- Text box inset from button: about `4px` left/right.
- Text center is `24px` below button top.
- Button bottom: `559px`.

### Secondary Auth Links Row

| Node    | Element              | X/anchor   | Y/anchor       |                       W |            H | Styles                                                 |
| ------- | -------------------- | ---------- | -------------- | ----------------------: | -----------: | ------------------------------------------------------ |
| `26:61` | Forgot password link | left `50`  | center y `596` |                 natural |      natural | Inter `400`, `13px`, `#003A78`, text `Забыли пароль?`  |
| `26:62` | Vertical separator   | x `194`    | top `589`      | `0` wrapper / `19` line | `19` wrapper | line `#AEB4C0` at `90%`, rotated `-90deg`              |
| `26:56` | Create account link  | left `233` | center y `596` |                   `106` |      natural | Inter `400`, `13px`, `#003A78`, text `Создать аккаунт` |

Derived links row spacing:

- Button bottom to links center: `37px`.
- Forgot link starts `50px` from left frame edge.
- Separator x is `194px`, nearly frame center.
- Create link starts `39px` to the right of separator x.

### Support Divider And Headset

| Node            | Element                 |        X |       Y |      W |    H | Styles                                                               |
| --------------- | ----------------------- | -------: | ------: | -----: | ---: | -------------------------------------------------------------------- |
| `26:57`         | Support divider left    |     `44` |   `635` |  `116` |  `0` | SVG line, stroke `#C7CDD6` at `90%`, `1px`                           |
| `26:58`         | Support divider right   |    `228` |   `635` |  `116` |  `0` | SVG line, stroke `#C7CDD6` at `90%`, `1px`                           |
| `26:79`         | Headset icon wrapper    |    `179` |   `619` |   `30` | `30` | wrapper                                                              |
| `I26:79;43:199` | Headset SVG inner group | `182.75` | `621.5` | `22.5` | `25` | stroke `#9AA5B5`, `2px`, round caps/joins, SVG viewBox `0 0 24.5 27` |

Derived divider/headset spacing:

- Left divider starts at x `44`, ends at x `160`.
- Right divider starts at x `228`, ends at x `344`.
- Gap between divider ends: `68px`.
- Headset wrapper center: x `194`, y `634`.
- Dividers align visually through headset center at y `635`.
- Links center to divider line: `39px`.

### Support Contact Block

| Node    | Element          | X/anchor         | Y/anchor         |       W |       H | Styles                                                     |
| ------- | ---------------- | ---------------- | ---------------- | ------: | ------: | ---------------------------------------------------------- |
| `26:63` | Support question | center x `195.5` | center y `692.5` | natural | natural | Inter `400`, `14px`, `#003A78`, text `Нет доступа к чату?` |
| `26:64` | Phone row group  | left `100`       | top `705`        |   group |   group | group wrapper                                              |
| `26:65` | Phone icon       | `101`            | `715`            |    `18` |    `18` | fill `#003A78`, SVG viewBox `0 0 18 18`                    |
| `26:67` | Phone number     | left `128`       | center y `723.5` |   `169` |    `35` | Inter `600`, `14px`, `#003A78`, text `+7 (800) 000-00-00`  |

Derived support contact spacing:

- Divider line/headset center y `635` to support question center y `692.5`: `57.5px`.
- Support question center y `692.5` to phone row top `715`: `22.5px`.
- Phone icon to phone number gap: `9px` (`128 - (101 + 18)`).
- Phone row visual left: `101px`.
- Phone number visual right: `297px`.
- Approximate bottom of phone number box: `741px`.
- Remaining bottom whitespace from phone number box to frame bottom: about `103px`.

## Full Vertical Rhythm

| From                             | To                              | Distance |
| -------------------------------- | ------------------------------- | -------: |
| Frame top                        | Logo tile top                   | `51.4px` |
| Logo tile bottom `114.4`         | Title top `159`                 | `44.6px` |
| Title top `159`                  | Subtitle center `222`           |   `63px` |
| Approx subtitle bottom `242`     | Email field top `285`           |   `43px` |
| Email field bottom `335`         | Password field top `357`        |   `22px` |
| Password field bottom `407`      | Legal block center `458`        |   `51px` |
| Legal block center `458`         | Button top `512`                |   `54px` |
| Button bottom `559`              | Links center `596`              |   `37px` |
| Links center `596`               | Divider/headset center `635`    |   `39px` |
| Divider/headset center `635`     | Support question center `692.5` | `57.5px` |
| Support question center `692.5`  | Phone icon top `715`            | `22.5px` |
| Phone number bottom approx `741` | Frame bottom `844`              |  `103px` |

## Horizontal Anchors

| Element group    |                             Left |      Width |            Right | Notes                               |
| ---------------- | -------------------------------: | ---------: | ---------------: | ----------------------------------- |
| Inputs           |                             `44` |      `300` |            `344` | right margin `46px`                 |
| Login button     |                             `45` |      `300` |            `345` | symmetric `45px` margins            |
| Legal text       |                     center `194` |      `300` |              n/a | same width as inputs/button         |
| Logo tile        |                          `163.4` |       `63` |          `226.4` | center x `194.9`                    |
| Support dividers |                     `44` / `228` | `116` each |    `160` / `344` | frame-aligned with input left/right |
| Headset          |                            `179` |       `30` |            `209` | center x `194`                      |
| Phone row        | `101` icon left, `128` text left | text `169` | text right `297` | visual row width about `196px`      |

## SVG Asset Geometry And Colors

| Element               | Node             | ViewBox              | Paint                                             |
| --------------------- | ---------------- | -------------------- | ------------------------------------------------- |
| Logo mark             | `26:70`          | `0 0 32.5607 36.402` | fill `#FFFFFF`                                    |
| Email icon            | `65:118`         | `0 0 21.0001 17`     | stroke `#B4BAC4`, round caps/joins                |
| Lock icon             | `65:116`         | `0 0 19 19`          | stroke `#B4BAC4`, round caps/joins                |
| Phone icon            | `26:65`          | `0 0 18 18`          | fill `#003A78`                                    |
| Headset icon          | `26:79`          | `0 0 24.5 27`        | stroke `#9AA5B5`, `2px`, round caps/joins         |
| Support divider lines | `26:57`, `26:58` | `0 0 116 1`          | stroke `#C7CDD6`, opacity `0.9`                   |
| Vertical separator    | `26:62`          | `0 0 19 1`           | stroke `#AEB4C0`, opacity `0.9`, rotated `-90deg` |

## Implementation Notes For Future Slices

- The frame baseline is `390px` wide. Treat this as the mobile reference viewport.
- Larger mobile target: also support an `iPhone 17 Pro`-class viewport at `440px x 956px`. This is not a separate design with larger typography; it is the same auth layout with more breathing room.
- The primary content column uses `300px` width for inputs, legal text, and login button.
- The Figma button is `47px` tall; existing mobile best practice prefers at least `44px`, so this is safe.
- Input fields are `50px` tall; existing current auth inputs may be taller, so input height should be discussed before changing.
- The legal text must use real clickable links to `/legal/terms` and
  `/legal/privacy`. On the login screen these links are informational only: no
  checkbox and no login-blocking behavior.
- The design uses centered logo placement; current product now supports `left`, `center`, and `right`, so this screen should map to `center`.
- Use Inter `400/600/700`; `500` is already available in the project for UI controls if needed.
- Keep each adoption step small: logo block, title/subtitle, inputs, legal text, button, auth links, support divider/headset, phone contact block.

## Larger Mobile Layout Target: 440 x 956

Use this target for larger modern phones such as an iPhone Pro-class viewport.
The purpose is to keep the same hierarchy as the `390 x 844` Figma frame while
using the additional width/height gracefully.

### Rules

- Keep the same block order: logo, title, subtitle, fields, legal text, button,
  secondary links, divider/headset, support question, phone.
- Keep typography fixed from the Figma spec. Do not scale font size from
  viewport width.
- Keep logo tile `63px x 63px`.
- Keep fields `50px` high and button `47px` high.
- Keep the main content column at `300px` by default. It may expand only up to
  `340px` if a later product decision explicitly approves wider fields.
- Center the column in the `440px` viewport.
- Use the extra height mostly as top/bottom breathing room, not as large gaps
  between form elements.
- Support content must remain visible without overlapping the phone safe area.

### Suggested 440 x 956 Anchors

These are implementation targets with tolerance, not a second pixel-perfect
Figma source:

| Element                | Target on 440 x 956            |
| ---------------------- | ------------------------------ |
| Logo tile top          | `64px` to `76px`               |
| Logo tile size         | `63px x 63px`                  |
| Main column width      | `300px`                        |
| Main column left/right | about `70px` each              |
| Title top              | about `178px` to `194px`       |
| Email field top        | about `320px` to `344px`       |
| Field height           | `50px`                         |
| Button height          | `47px`                         |
| Support block          | visible above safe-area bottom |

If the implementation uses CSS variables, prefer:

```css
.auth-stack {
  --auth-stack-top: 51px;
  --auth-stack-inline: 44px;
  --auth-content-width: 300px;
}

@media (min-width: 430px) and (min-height: 900px) {
  .auth-stack {
    --auth-stack-top: 70px;
    --auth-stack-inline: 70px;
  }
}
```
