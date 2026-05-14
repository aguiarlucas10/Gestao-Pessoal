# DESIGN.md — CMD.CENTER

> Identidade visual e tokens de design do CMD.CENTER. Versionado junto com o código. Toda decisão visual referencia este arquivo.

## Identidade: **Officio**

`register: product`

Aplicação executiva-editorial em light theme com oxblood committed como cor de autoridade. Escapa do reflexo de categoria "dark-navy SaaS dashboard" e do reflexo de segunda ordem "editorial-typographic-dark Linear/Vercel-flavored".

## Cena (forçando o tema)

> *"Lucas no escritório em manhã ensolarada de terça, planejando a semana através de 1:1s e follow-ups, com a gravidade de um briefing executivo."*

A cena força:
- **Light theme** (luz natural ambiente, não wind-down noturno)
- **Tipografia com peso** (registro executivo, não rasa)
- **Cor de autoridade** (oxblood lê como decisão, não como animação SaaS)

## Color strategy

**Committed.** Oxblood carrega ~30% da superfície (chips de prioridade, botões primários, badges active, focus rings). Bronze ~8% para warmups/in-progress. Saffron ~3% pontual para "hoje" e overdue. Resto é monocromático tintado em warm-cream.

## Tokens

Todos em OKLCH (com hex fallback comentado). Reduzir chroma conforme lightness se aproxima de 0 ou 100.

### Superfícies (light, warm-cream tinted)

```css
--bg     oklch(98.5% 0.005 80)   /* #FCFBF7 paper cream         */
--s1     oklch(96%   0.008 80)   /* #F4F1E8 surface low         */
--s2     oklch(93%   0.010 80)   /* #ECE6D8 surface mid         */
--s3     oklch(89%   0.012 80)   /* #DFD7C3 surface high        */
```

### Bordas e linhas

```css
--b1     oklch(86%   0.012 80)   /* #D4CAB3 rule fine           */
--b2     oklch(78%   0.014 80)   /* #B8AC93 rule medium         */
--b3     oklch(64%   0.016 80)   /* #968874 rule strong         */
```

### Tinta (texto)

```css
--t1     oklch(18%   0.008 60)   /* #1C1A17 warm carbon (body)  */
--t2     oklch(38%   0.010 60)   /* #4E4940 muted               */
--t3     oklch(50%   0.012 60)   /* #6E6859 label, ~7.5:1 vs bg */
--t4     oklch(60%   0.014 60)   /* #8A8174 label faint, ~4.5:1 */
```

**Nota**: `--t3` e `--t4` ajustados para passar WCAG AA contra `--bg`. O original `#2a3050` em fundo escuro era falha clara de 1.6:1.

### Accent (Committed — Oxblood)

```css
--acc    oklch(28%   0.10  25)   /* #4A1818 oxblood (primary)   */
--acc-hi oklch(35%   0.12  25)   /* #5C1F1F oxblood hover       */
--acc-bg oklch(95%   0.020 25)   /* #F4E8E5 oxblood-tint bg     */
--acc-rg oklch(72%   0.08  25)   /* #B89090 oxblood for borders */
--acc-on oklch(98.5% 0.005 80)   /* #FCFBF7 text-on-accent (=bg)*/
```

**Decisão**: texto em botão accent usa `--acc-on` (paper cream), não `white` puro. Branco em oxblood vibra; cream tintado harmoniza.

### Semânticas

```css
--bronze     oklch(52% 0.09 50)   /* #8B5A3C warmups, in-progress */
--bronze-bg  oklch(94% 0.02 50)   /* #F2E8DE bronze tint surface  */
--saff       oklch(65% 0.14 75)   /* #C99327 hoje/today           */
--saff-bg    oklch(95% 0.03 75)   /* #F5EBD4 saffron tint         */
--rust       oklch(50% 0.16 30)   /* #A93B27 overdue/alta         */
--rust-bg    oklch(94% 0.03 30)   /* #F4E2DC rust tint            */
--moss       oklch(50% 0.08 130)  /* #5E7F3F done/baixa           */
--moss-bg    oklch(94% 0.02 130)  /* #E8EEDC moss tint            */
--plum       oklch(40% 0.08 340)  /* #6E4761 delegada             */
--plum-bg    oklch(94% 0.02 340)  /* #EFE2EA plum tint            */
```

### Paleta de pessoas (8 avatars harmonizados warm-light)

Chroma reduzido vs. originais neon. Todos legíveis em `--bg`.

```css
--p-indigo   oklch(45% 0.10 270)  /* #4D5B96 (era #4f7cff) */
--p-moss     oklch(50% 0.08 130)  /* #5E7F3F (era #2dce89) */
--p-terra    oklch(55% 0.13 45)   /* #B66A3D (era #ff8c42) */
--p-plum     oklch(40% 0.08 340)  /* #6E4761 (era #a78bfa) */
--p-rust     oklch(50% 0.16 30)   /* #A93B27 (era #ff4d6d) */
--p-mustard  oklch(65% 0.13 90)   /* #B89028 (era #ffd166) */
--p-teal     oklch(45% 0.07 195)  /* #3B6B74 (era #36d6c3) */
--p-rose     oklch(55% 0.10 0)    /* #A06064 (era #f472b6) */
```

## Type Stack

Free Google Fonts only. Distantes do trio saturado (Linear/Vercel/Stripe).

- **Display**: `Fraunces` — variable serif, axis de soft + optical-size, peso executivo sem virar Tiempos.
- **Body**: `Instrument Sans` — sans neutra moderna, não-Inter, não-Geist, sem o ar de "design system genérico".
- **Mono**: `Geist Mono` (mantida) — para labels, timestamps, tags. Único elemento do stack atual que sobrevive.

```css
--font-display: 'Fraunces', Georgia, serif;
--font-body:    'Instrument Sans', system-ui, sans-serif;
--font-mono:    'Geist Mono', ui-monospace, monospace;
```

### Escala (ratio ≈1.33)

| Token | Size/Line | Family/Weight | Uso |
|---|---|---|---|
| `--t-display` | 28/34 | Fraunces 400 (soft -2, opsz 144) | Topbar title, brand, modal title |
| `--t-heading` | 18/24 | Fraunces 500 (soft 0, opsz 36) | Section titles, view headers |
| `--t-body-l` | 15/22 | Instrument Sans 400 | Card title, primary text |
| `--t-body` | 13/19 | Instrument Sans 400 | Default body, descrições |
| `--t-meta` | 11/15 | Instrument Sans 400 | Meta, footer text |
| `--t-label` | 10/14 | Geist Mono 500, letter-spacing .12em, uppercase | Section labels |
| `--t-micro` | 9/12 | Geist Mono 400, letter-spacing .06em | Tags, badges |

## Application Map

| Surface | Background | Text | Border | Notas |
|---|---|---|---|---|
| Body | `--bg` | `--t1` | — | Paper cream global |
| Nav | `--s1` | `--t2` | `--b1` right | |
| Nav item active | `--acc-bg` | `--acc` | `--acc-rg` | Oxblood-tinted |
| Topbar | `--s1` | `--t1` em Fraunces | `--b1` bottom | |
| Card | `--bg` (não `--s1`!) | `--t1` | `--b1` full border | **Sem side-stripe 3px** |
| Card hover | `--bg` | `--t1` | `--b2` full | Lift por shadow leve |
| Coluna body | `--s1` | — | `--b1` | |
| Botão primário | `--acc` | `--acc-on` | none | Oxblood committed |
| Botão primário hover | `--acc-hi` | `--acc-on` | none | |
| Botão ghost | transparent | `--t2` | `--b1` | |
| Botão ghost hover | `--s1` | `--t1` | `--b2` | |
| Input | `--s1` | `--t1` | `--b1` | |
| Input focus | `--s1` | `--t1` | `--acc-rg` + ring 3px `--acc-bg` | |
| Modal/dialog | `--s1` | `--t1` | `--b2` | Sem glassmorphism |
| Modal overlay | `oklch(18% 0.008 60 / 0.5)` warm-carbon | — | — | Sem backdrop-blur (Fase 7) |
| Toast | `--s1` | `--t1` | `--b2` | |
| Tag alta | `--rust-bg` | `--rust` | none | |
| Tag media | `--bronze-bg` | `--bronze` | none | |
| Tag baixa | `--moss-bg` | `--moss` | none | |
| Tag delegada | `--plum-bg` | `--plum` | none | |
| Tag minha | `--acc-bg` | `--acc` | none | |
| Tag overdue | `--rust-bg` | `--rust` | `--rust` 1px | Weight 600 |
| Tag hoje | `--saff-bg` | `--saff` | none | |
| Status dot ok | `--moss` | — | — | |
| Status dot err | `--rust` | — | — | |
| Focus ring | — | — | `2px solid --acc` `outline-offset: 2px` | Global :focus-visible |

## Anti-patterns (proibidos neste projeto)

Do audit + design laws. Match-and-refuse:

- **Side-stripe borders** ≥1px em cards, list items, callouts. Use full border tintada, tag de prioridade, ou nada.
- **Gradient text** (background-clip:text).
- **Glassmorphism decorativo** (backdrop-filter:blur como adorno). Aceito apenas como dimmer funcional em modal overlay, e desligado em mobile (Fase 7).
- **`#fff` ou `#000` puros**. Use `--bg` / `--t1` ou tinted alternative.
- **`<div onclick>`** no lugar de `<button>`.
- **Emoji-as-icon** em UI (nav, section titles, buttons). Aceito apenas em contexto editorial (briefing matinal).
- **`prompt()` / `confirm()` nativos** para input/decisão.
- **Modal-as-first-thought** para criação rápida. Inline first.

## Anchors

Referências de craft (não de visual a copiar): NYT executive section, FT print front, Things 3 light mode (ergonomia), Lapham's Quarterly (peso editorial), Bloomberg Terminal (densidade de informação séria).

**Não-anchors** (lane saturado, evitar copiar): Linear, Vercel, Cursor, Stripe Dashboard, Notion, qualquer "AI tool" 2024-25.

## Histórico

- **2026-05-14** — Identidade inicial. Audit anterior em 8/20. Fase 1 do plano de correções (`/impeccable shape identity`) escolhida: **Officio**.
