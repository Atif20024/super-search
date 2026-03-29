# Super Search

Super Search is a Chrome extension that upgrades the normal browser find experience with pattern search, fuzzy matching, reusable saved searches, and a central notes system.

It is designed to feel like a compact, familiar browser find bar while giving users much more power than the standard `Ctrl+F` / `Cmd+F`.

## What It Does

Super Search lets you search the current webpage using:

- exact text matching
- regular expressions
- fuzzy matching for typos and near matches
- highlighted results with next/previous navigation
- reusable saved searches across websites
- central notes with source website tracking

## Key Features

### 1. Supercharged Page Search

Super Search works on normal HTML webpages and supports three main search styles:

- `Literal`
  Finds exact text or phrases.
  Example: searching `World` finds the exact typed text.

- `Regex`
  Finds patterns instead of exact text.
  Example: emails, dates, years, links, or phone numbers.

- `Fuzzy`
  Finds close matches when the typed word is slightly wrong.
  Example: `Worls` can still find `World`.

### 2. Highlighting And Navigation

All matches are highlighted directly on the page.

The pop-up shows:

- current match index
- total match count
- next match navigation
- previous match navigation

The current active match is visually distinguished from the rest.

### 3. Regex Presets

When `Regex` mode is active, a compact presets button appears with quick patterns for:

- Email
- Phone
- URL
- Date
- Year

These presets are inserted into the search box and run immediately.

### 4. Fuzzy Search Modes

The fuzzy chip cycles through:

- `Fuzzy 1`
  One edit distance away

- `Fuzzy 2`
  Two edit distances away

- `Fuzzy`
  Returns to exact-word behavior

This is useful for:

- spelling mistakes
- OCR-like errors
- approximate single-word matching

### 5. Saved Searches

Users can save commonly used searches and reuse them on any site.

Each saved search stores:

- name
- query
- search mode
- case sensitivity
- fuzzy distance when relevant

Saved searches are global, not tied to one page.

### 6. Central Notes Hub

Super Find includes a notes system that is not limited to the current page.

Users can:

- type a note and save it
- capture currently selected text from the page
- view all notes in one central list
- reopen the original page later from the note

Each note stores:

- note text
- source page title
- source website hostname
- source page URL
- timestamp

This makes it easier to collect research or snippets across many websites without needing to revisit each page manually.

### 7. Theme Support

The popup supports:

- light theme
- dark theme

The selected theme is saved locally.

## Keyboard Shortcuts

Suggested shortcuts:

- Open Super Find
  macOS: `Command+Shift+S`
  Windows/Linux: `Ctrl+Shift+F`

- Add current selection to notes
  macOS: `Command+Shift+X`
  Windows/Linux: `Ctrl+Shift+X`

If Chrome does not assign these automatically, they can be configured in:

- `chrome://extensions/shortcuts`

## UI Behavior

The popup is intentionally compact and optimized for speed:

- the search field is focused automatically when the popup opens
- existing search text is auto-selected on reopen
- `Enter` runs the search the first time, then moves to next result
- `Shift+Enter` moves to the previous result
- search type chips explain their purpose on hover
- regex presets remain hidden unless regex mode is active

## Project Structure

This extension is intentionally built with plain HTML, CSS, and JavaScript so it can be loaded directly into Chrome without a build step.

### Files

- `manifest.json`
  Chrome extension manifest using Manifest V3

- `popup.html`
  Popup UI layout

- `popup.css`
  Popup styling, theme behavior, layout, and animation

- `popup.js`
  Popup logic, search control handling, themes, saved searches, and central notes

- `content.js`
  In-page search engine, highlighting, fuzzy matching, regex matching, navigation, and scrollbar markers

- `background.js`
  Keyboard shortcut handler for saving selected page text into notes

- `README.md`
  Project documentation

## Storage Model

Super Find stores its data locally in `chrome.storage.local`.

### Stored Data

- `savedSearches`
  Reusable searches available across websites

- `notes`
  Central note list with text and source metadata

- `lastSearch`
  Most recent query and search mode settings

- `theme`
  Current popup theme preference

## How Search Works

### Literal Search

Literal search escapes the user input and runs it as a global text search.

### Regex Search

Regex search runs the user pattern directly against the visible text collected from the page.

### Fuzzy Search

Fuzzy search tokenizes the page into word-like units and compares each token against the target using Levenshtein distance.

This currently works best for:

- one-word approximate matching
- near spelling corrections
- short typo-tolerant search

## Highlighting Strategy

The content script:

1. collects visible text nodes from the page
2. builds a combined text model
3. calculates match ranges
4. replaces matching segments with `<mark>` elements
5. tracks active match state
6. draws scrollbar-style position markers

This gives users a browser-find-like feel while still allowing more advanced search behavior.

## Notes On Supported Pages

Super Find currently targets standard HTML pages.

Works best on:

- articles
- documentation pages
- blogs
- normal content-heavy websites

Not fully supported in this version:

- Chrome internal pages
- PDFs
- cross-origin iframe content
- canvas-heavy apps
- editors like Google Docs
- some shadow DOM edge cases

## Loading The Extension In Chrome

1. Open `chrome://extensions`
2. Turn on `Developer mode`
3. Click `Load unpacked`
4. Select this project folder

You can also package the folder as a zip for transfer or backup, but Chrome uses the unpacked folder during local development.

## Install On Your Own PC

If someone wants to use Super Find on their own computer before it is published on the Chrome Web Store:

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Turn on `Developer mode`
4. Click `Load unpacked`
5. Select the project folder
6. Optional: pin the extension from the Chrome toolbar
7. Optional: set shortcuts in `chrome://extensions/shortcuts`

This is the simplest way to install and use the extension locally.

## Development Notes

### No Build Step

This project does not require:

- npm
- bundlers
- transpilers
- framework setup

It is intentionally simple to edit and test directly.

### Why Vanilla JS

The project uses vanilla JavaScript because:

- Chrome extension logic is lightweight
- iteration is faster
- the extension can be loaded directly without compilation
- debugging is easier inside popup/content scripts

## Current Limitations

- fuzzy matching is intentionally simple and best for single-word matches
- regex UI keeps advanced flags hidden to stay compact
- the extension depends on visible DOM text, so some custom-rendered apps are harder to support
- very large pages may be slower when using fuzzy search or many highlights

## Future Improvement Ideas

- grouped notes by website
- note filtering and searching
- export/import for notes and saved searches
- sync support across Chrome profiles
- improved support for iframes and shadow DOM
- smarter fuzzy matching across multi-word phrases
- clickable scrollbar markers
- richer regex helpers and validation

## Why This Project Exists

Browser find is great for exact words, but many real tasks require more:

- finding patterns rather than exact strings
- finding approximate matches
- reusing frequent searches
- collecting notes while researching

Super Find aims to keep the speed of browser find while adding those missing capabilities.
