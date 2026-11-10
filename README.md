# macedo204.github.io

Personal CV site of João Pedro Macedo Ferreira — <https://macedo204.github.io>

Plain HTML + CSS + JavaScript. No build step, no framework, no backend.
**All content lives in [`data/cv.json`](data/cv.json)**; the page is rendered from it.

```
index.html        page shell (header, empty <main>, footer)
css/style.css     all styles, including dark mode and the print/PDF layout
js/main.js        reads data/cv.json and renders every section
data/cv.json      ← the only file you need to edit for content
assets/           favicon.svg (and photo.jpg, once you add it)
.nojekyll         tells GitHub Pages to serve the files as they are
```

## Preview locally

The page loads `cv.json` with `fetch`, which browsers block for files opened straight from disk,
so serve the folder:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

On `localhost` the site runs in **preview mode**: every value starting with `TODO` is shown as a
yellow marker, unconfirmed skills appear with a dashed border, and a yellow button at the bottom
left lists every TODO in `cv.json`. On the live site all of this is hidden automatically.
To see exactly what the live site will show while working locally, open
<http://localhost:8000/?todo=0>.

## Editing `cv.json`

### Text and translations

A text field is either a plain string (same in both languages):

```json
"title": "Revista Biótopo"
```

or an object with both languages:

```json
"role": { "en": "Activity Monitor", "pt": "Monitor de Atividades", "pt_status": "review" }
```

`pt_status: "review"` marks Portuguese text written for you that you still need to check.
Once you've checked a field, change it to `"ok"` (the preview counter at the bottom left goes
down). The UI labels at the bottom of the file (`"ui"`) carry one `pt_status` for the whole block.

### TODO values

Any string that starts with `TODO` is hidden on the live site. Replace it with the real value
when you have it. Example:

```json
"email": "TODO: your email address"   →   "email": "joao@example.com"
```

### Dates

`"YYYY"` or `"YYYY-MM"`, and `"present"` for ongoing things. For irregular dates use
`"date_text"` instead of `start`/`end` (e.g. `"date_text": "2024, 2025"`).

### Sections

| Key | What it is |
|---|---|
| `profile` | name, monogram, photo, location, title, one-line `tagline`, longer `summary` |
| `links` | `email`, `github`, `linkedin`, `orcid` (full URLs; the email is just the address) |
| `education` | degrees; `highlights` are shown when the timeline entry is expanded and in print |
| `experience` | main experience shown in the timeline (currently the thesis) |
| `research` | the featured thesis section: `summary`, key `points`, `next`, `tools` and `skills` tag lists, and the 6 `pipeline` steps of the diagram (a step with `"status": "in_progress"` is drawn dashed with an "in progress" badge) |
| `projects` | project cards: `summary`, then `problem` → `did` → tools (`skills`) → `result`; `repo` link |
| `skills` | groups of skills. Each skill has an `id` and a `label`; an optional `short` label is used on entry tags (e.g. "bcftools" instead of "Variant processing (bcftools)"). Set `"confirmed": false` to hide a skill on the live site. A group with `"show_in_skills": false` holds tags used on entries but not listed in the Skills section (e.g. CustomTkinter) |
| `activities` | leadership & activities; `print_line` is the one-line version used in the PDF |
| `activities_print_merge` | lines that replace several activities in the PDF (the festivals) |
| `other_experience` | jobs in the collapsed "Other experience" section (one line each in the PDF) |
| `languages` | name + level |
| `ui` | interface labels in both languages |

### How the skill filter works

Each education/experience/research/project entry has a `"skills"` list of skill **ids** (the research entry also has `"tools"`, which filters the same way)
(e.g. `["python", "r"]`). Clicking a skill highlights every entry whose list contains that id.
A skill that no entry uses is shown as a plain (non-clickable) tag. To make it clickable,
add its id to the `skills` list of the entries where you used it.

### Adding a project

Copy an existing object inside `"projects"`, give it a new unique `id`, and edit the fields.
Leave `"repo": null` until the repository is public and runs; then put its URL there.

### Photo

Save a square photo as `assets/photo.jpg` (about 400×400 px, under 100 KB), then set
`"photo": "assets/photo.jpg"` in `profile`. Without it, the "JF" monogram is shown.
The photo never appears in the printed/PDF version.

## PDF

"Download PDF" opens the browser's print dialog: choose **Save as PDF**, paper **A4**, and
turn **Headers and footers** off. The print stylesheet removes buttons, toggles, the diagram
and the photo, and prints in black on white in the language currently selected on the page.

## Deploying to GitHub Pages

The repository must be named exactly `macedo204.github.io`. GitHub then serves the
`main` branch at <https://macedo204.github.io>. Any push to `main` updates the site within
a minute or two. Step-by-step first-time instructions are in the section below.

### First time

1. On GitHub: **New repository** → name `macedo204.github.io` → Public → do **not** add a
   README/licence (this folder already has one) → **Create repository**.
2. In a terminal inside this folder:

```bash
git init -b main
```
Creates a new, empty Git repository here, with `main` as the name of the first branch.

```bash
git add .
```
Stages every file in the folder: tells Git "include these in the next snapshot".

```bash
git commit -m "First version of CV site"
```
Saves the staged files as a snapshot (a *commit*) with a short message describing it.

```bash
git remote add origin https://github.com/macedo204/macedo204.github.io.git
```
Tells your local repository where the GitHub copy lives and names it `origin`.

```bash
git push -u origin main
```
Uploads your commits to GitHub. `-u` remembers the link, so later you just type `git push`.

3. On GitHub: repository **Settings → Pages** → *Build and deployment* → Source:
   **Deploy from a branch**, Branch: **main**, folder **/ (root)** → **Save**.
   After a minute the site is live at <https://macedo204.github.io>.

### Every update after that

```bash
git status                       # see what changed
git add data/cv.json             # stage the files you changed (or: git add .)
git commit -m "Add email and LinkedIn"
git push
```
