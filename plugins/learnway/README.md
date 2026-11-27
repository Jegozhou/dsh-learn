# Learn Your Way · 教材改造台

A DeepSeek Harness plugin that implements the pipeline of **“Towards an AI-Augmented Textbook”** (LearnLM Team, Google — arXiv:2509.13348v4, *Learn Your Way*).

The paper's claim is narrow and testable: a textbook section can be *transformed* rather than replaced — first re-written for one learner (grade level + interest), then expanded into several representations of the same material, and finally wrapped in formative assessment. This plugin makes that pipeline an agent tool plus a reader, so the model does the generating and the user sees the result in a real UI. The slide deck additionally exports to real presentation files.

## What maps to what

| Paper | Here |
|---|---|
| §2.1 re-levelling to the learner's Flesch-Kincaid grade | `learnway_readability` measures FKG / reading ease / sentence load; the validator compares every saved lesson against `learner.grade` and reports the distance |
| §2.1 interest personalisation by *selectively replacing* parts of the text, and highlighting them | every rewritten paragraph keeps its `original`; the reader highlights it and offers **See original / See rewrite** |
| §2.2 Slides & Narration | `slides[]` with layouts, `bullets` and a spoken `narration`; presented in the panel and exportable (see below) |
| §2.2 Audio-graphic lesson (two independent personas) | `audioLesson.turns[]` alternating `teacher` / `student`, with key-concept chips and sequential playback |
| §2.2 Mind maps | `mindmap` tree with notes; expand/collapse nodes |
| §2.2.1 Immersive Text add-ons | `timeline` (drag-and-drop ordering practice), `memoryAid` (mnemonic + gloss), `illustration` (image, or the drawing brief) |
| §3 Embedded questions | one `question` per section, answered in place with a rationale |
| §3 Section quiz + Glows/Grows | `quiz.questions[]` (5–10, mixed difficulty) graded on the Host; feedback = generated strengths/weaknesses + the authored `glows` / `grows` |
| §4 rubric axes that are machine-checkable | `measurement.checks`: active learning, metacognition, adaptability, coverage, grade fit, clarity of objectives |

## Slides: presentation and three export formats

The deck is authored once and consumed three ways. Each exporter is independent — a failure in one never blocks the others, and the result reports a per-format reason.

| Format | Engine | What you get |
|---|---|---|
| `.pptx` | **PptxGenJS 4** (MIT) | A real PowerPoint: themed title / section / bullets / quote / two-column layouts, per-slide footer and numbering, and the narration in the **speaker-notes pane** |
| `.html` | own renderer | One self-contained offline deck: `<section class="slide">` per slide, `<aside>` notes pane (`N`), progressive bullets, arrow-key navigation, `F` fullscreen, flips, and print-to-PDF |
| `.md` | **Marp** dialect (MIT) | `marp: true` front-matter, `---` separators, notes as HTML comments — hand it to any Marp toolchain for PDF/PPTX/PNG |

Where the ideas came from, and what was adopted:

- **PptxGenJS** (github.com/gitbrent/PptxGenJS) — the PPTX writer. It is the same engine *Marp CLI 4.5* uses for its own PPTX export, so there is one well-tested code path instead of a hand-rolled OOXML writer.
- **Marp** (github.com/marp-team/marp-cli) — the markdown dialect, front-matter fields, and the speaker-note convention.
- **reveal.js** (github.com/hakimel/reveal.js) — the presentation semantics in the panel and in the HTML export: sections, `<aside class="notes">` speaker notes, fragment-style progressive reveal, keyboard navigation, fullscreen.

Export from the panel (**幻灯片 → 导出**, then download) or from chat with `learnway_deck_export`. Files land in `$DSH_HOME/learnway/exports/<lessonId>/` and are served back through authenticated routes under `/api/learnway/export`.

## Agent tools

| Tool | Purpose |
|---|---|
| `learnway_readability` | Measure one or more texts (FKG, reading ease, sentence load) and compare against a target grade. Run it before and after a rewrite. |
| `learnway_lesson_save` | Validate and store a whole lesson; re-saving with the same `id` replaces it. Structural problems are rejected, pedagogical ones come back as diagnostics. |
| `learnway_lesson_list` | Lesson inventory with size and checks. |
| `learnway_lesson_get` | Read one lesson back, per view (`immersive` / `slides` / `audio` / `mindmap` / `quiz` / `measurement` / `all`). |
| `learnway_deck_export` | Write the deck as `pptx` / `html` / `md`; returns paths, sizes and per-format reasons. |
| `learnway_quiz_grade` | Grade answers reported in chat; returns score, per-question marks, Glows/Grows. |

## The lesson contract

```jsonc
{
  "title": "…",
  "source": { "title": "…", "attribution": "…", "text": "…原文…" },
  "learner": { "grade": 8, "interest": "篮球", "language": "zh" },
  "objectives": ["…"],
  "immersion": { "sections": [ {
      "heading": "…",
      "blocks": [ { "type": "paragraph", "text": "…", "original": "被替换的原文句" } ],
      "question": { "stem": "…", "choices": ["…"], "answerIndex": 1, "rationale": "…" },
      "timeline": { "title": "…", "items": [ { "label": "…", "detail": "…" } ] },
      "memoryAid": { "items": ["等大","反向"], "sentence": "…", "gloss": "…" },
      "illustration": { "caption": "…", "brief": "…", "dataUrl": "data:image/…" }
  } ] },
  "slides": [ {
      "layout": "title | section | bullets | quote | two-column",
      "kicker": "第 1 节", "title": "…", "subtitle": "…",
      "bullets": ["…"],
      "columns": [["左一","左二"], ["右一"]],
      "quote": { "text": "…", "attribution": "…" },
      "narration": "讲解（= 备注页 / 讲授稿）"
  } ],
  "audioLesson": { "keyConcepts": ["…"], "turns": [ { "speaker": "teacher", "text": "…", "concept": "…" } ] },
  "mindmap": { "label": "…", "children": [ { "label": "…", "note": "…" } ] },
  "quiz": { "questions": [ { "stem": "…", "choices": ["…"], "answerIndex": 0, "rationale": "…", "difficulty": "easy" } ],
            "glows": ["…"], "grows": ["…"] }
}
```

`timeline.items` is written in the **correct** order; the reader shuffles it for the practice and checks against the original order, so no separate answer key is needed. `narration` is also accepted as `notes`, and a slider without `layout` defaults to a title slide at index 0 and bullets elsewhere.

## Where things live

- Lessons: `$DSH_HOME/learnway/lessons/<id>.json` (default `~/.dsh/learnway`). Exports: `$DSH_HOME/learnway/exports/<id>/`.
- Panel: sidebar **教材改造台** (key `learnway`); API under `/api/learnway/*`, authenticated by the Harness connection channel.
- Two demo lessons are seeded on an empty store: a Chinese one (grade 8, basketball, six slides covering every layout) and an English one (grade 8, basketball) that exercises the FKG path.

## Configuration (`cordis.patch.yml`)

| Key | Default | Meaning |
|---|---|---|
| `dataDir` | `$DSH_HOME/learnway` | where lesson records and exports are written |
| `keepLessons` | `60` | retention; the oldest records are trimmed |
| `gradeTolerance` | `1` | acceptable absolute FKG distance from `learner.grade` |
| `seedDemoLessons` | `1` | seed the two demos on an empty store (`0` disables) |

## Honest limitations

- **FKG is an English instrument.** Chinese lessons report `fleschKincaidGrade: null` plus a sentence-length band; the plugin does not fake a grade number.
- **PPTX needs `pptxgenjs`.** It is declared as a dependency and installed in this checkout; without it the tool still writes the HTML and Marp files and says why PPTX was skipped.
- **No fonts or images are embedded in the PPTX.** CJK text uses the viewer's own fonts, and slides carry no pictures — the paper's illustration add-on lives in the immersive text, not the deck.
- **Visual illustrations are not generated.** The reader shows the authored image when a `dataUrl` is supplied, otherwise the drawing brief.
- **Coverage is a term-overlap proxy**, not a semantic judgement; `Accuracy` in the paper's rubric stays a human judgement.
- Audio is played through the browser's speech synthesis; without it, the conversation is still readable.
- The two-stage pipeline is executed by the model: the plugin measures, renders and exports, it does not generate the prose itself.

## Development

```bash
node --test "test/**/*.test.mjs"   # 24 tests: readability, validator, grading, client wiring, deck export
```

Install with **Plugins → Add plugin** pointing at this directory, or `plugin_manager` `install_bundle`.
