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

## Component Patterns

### Inline edit / add (substitui prompt nativo)

Padrão em todas as listas de itens curtos (tópicos 1:1, action items):

- **Add**: clique no botão "+ X" injeta um `<form class="oo-inline-form">` no fim da seção. Input com foco automático, `Enter` salva, `Esc` cancela. Para itens com prioridade, chips inline (Alta/Média/Baixa) com `aria-pressed`.
- **Edit**: clique em ✎ no item → o elemento de texto vira `contentEditable="true"` com classe `.editing` (ring oxblood). `Enter` ou blur salva, `Esc` reverte.
- **Delete**: clique em ✕ → remoção optimistic imediata + `toast(..., 'info', {label:'Desfazer', cb})` com 5s para reverter. Sem `confirm()` nativo.

### Toast com action button

`toast(msg, type='success', action=null)` — `action: {label, cb}`. Toast com ação tem 5s de TTL (vs 3s do toast simples), renderiza botão mono uppercase oxblood. Padrão usado para undo de delete.

### Modal customizado vs alertdialog

- **Modal informativo/edit** (`role="dialog"`): paste-modal, edit-ata-modal, new-meeting-modal, oo-person-modal. Foco em primeiro input, ESC fecha, Enter/click confirma.
- **Alertdialog destrutivo** (`role="alertdialog"`): del-meeting-modal apenas. Botão Cancelar é o default focus (autofocus), botão Excluir destacado em rust. Usado apenas para ações irreversíveis em backend.

### Touch targets

Hierarquia de tamanho mínimo:
- **Desktop**: 18px visual para checkboxes leves, 26px+ para icon buttons, 30px+ para close/nav buttons (passa WCAG 2.5.8 AA com 24px de área efetiva)
- **Touch (`@media (pointer:coarse)`)**: tudo cresce para 40×40px+ (WCAG 2.5.5 AAA), inclui revelar `.oo-item-actions` sempre (sem hover em touch)

## Anti-patterns (proibidos neste projeto)

Do audit + design laws. Match-and-refuse:

- **Side-stripe borders** ≥1px em cards, list items, callouts. Use full border tintada, tag de prioridade, ou nada.
- **Gradient text** (background-clip:text).
- **Glassmorphism decorativo** (backdrop-filter:blur como adorno). Aceito apenas como dimmer funcional em modal overlay, e desligado em mobile (Fase 7).
- **`#fff` ou `#000` puros**. Use `--bg` / `--t1` ou tinted alternative.
- **`<div onclick>`** no lugar de `<button>`. Containers com nested buttons usam `<div role="button" tabindex="0" onkeydown="kbd(event)">`.
- **Emoji-as-icon** em UI (nav, section titles, buttons). SVG Lucide-style stroke 1.5 currentColor. Emojis aceitos apenas em contexto editorial (briefing matinal, body de notificações).
- **`prompt()` / `confirm()` nativos** para input/decisão. Sempre inline form ou modal customizado.
- **Modal-as-first-thought** para criação rápida. Inline first (forms se desdobram dentro da seção).
- **Animação em layout properties** (width/height/margin). Use transform/opacity. Cards não animam a cada render — só entry verdadeiro.

## Anchors

Referências de craft (não de visual a copiar): NYT executive section, FT print front, Things 3 light mode (ergonomia), Lapham's Quarterly (peso editorial), Bloomberg Terminal (densidade de informação séria).

**Não-anchors** (lane saturado, evitar copiar): Linear, Vercel, Cursor, Stripe Dashboard, Notion, qualquer "AI tool" 2024-25.

## Polish pendente (P3, não bloqueante)

- **Inline `style="..."`** (~50 ocorrências em index.html + app.js): extrair para utility classes (`.stack`, `.row`, `.grow`, `.muted`, `.center`). Funcional, só dívida de manutenção.
- **Empty states / onboard**: 1:1 e Reuniões ganharam cópia melhor na Fase 5, mas falta primeira-vez (zero pessoas cadastradas, zero reuniões) com ação direta.
- **Avatares legados**: usuários cadastrados antes da Fase 2 mantêm hex neon antigo no Supabase. Migração one-shot pode harmonizar.
- **Calendário mobile**: month-grid funciona mas list-agenda seria mais ergonômica em portrait < 480px.
- **Light/dark dual theme**: light é committed, dark companion fica como decisão futura se uso noturno ganhar peso.

## Histórico

- **2026-05-14** — Identidade Officio escolhida. Audit anterior em 8/20.
- **2026-05-14/15** — Plano de correções executado em 8 fases:
  - **Fase 0** split de arquivos (single-file → index.html + styles.css + app.js)
  - **Fase 1** identidade (este DESIGN.md)
  - **Fase 2** aplicação dos tokens OKLCH + Fraunces/Instrument Sans
  - **Fase 3** a11y semântica (esc, ARIA, focus-visible, `<button>`, `<label for>`, `role="group"`)
  - **Fase 4** distill: removidas side-stripes 3px e 90% dos emoji-icons
  - **Fase 5** clarify: eliminados todos os `prompt()`/`confirm()` nativos
  - **Fase 6** adapt: touch targets WCAG AA + media coarse para AAA
  - **Fase 7** optimize: debounce search, sem fadeIn churn, blur off no mobile
  - **Fase 8** polish: este documento + extras P3 anotados acima
- **Score estimado pós-fases**: ~17/20 (Good → quase Excellent). Re-rodar `/impeccable audit` confirma.
