# Autobanker Reports Manager - Angular

Standalone Angular 21 mirror of the Next.js report designer. It uses Tailwind CSS 4, Fabric.js, and the same JSON template contract consumed by the .NET PDF API.

## Requirements

- Node.js `^20.19.0 || ^22.12.0 || >=24.0.0`
- npm
- .NET backend running at `http://127.0.0.1:5081` for PDF preview and sample downloads

## Run

```sh
npm install
npm start
```

Open `http://localhost:4201`. The Angular development server proxies `/api` requests to the .NET backend on port 5081, so the API does not need an Angular-specific CORS origin. Root-level scripts and tasks start both projects; see `../README.md`.

## Validate

```sh
npm run build
npm test
```

## Editor capabilities

- Fabric canvas with text, rectangle, ellipse, line, image, QR code, barcode, and table objects
- Drag-and-drop object and variable insertion, page guides, grid, zoom, selection, keyboard movement, delete, undo, and redo
- Object properties, visibility and lock controls, layer ordering, duplication, and deletion
- A 25-template banking/report gallery, header and footer presets, page sizes/orientation/margins, watermark, and pagination settings
- Browser-local save/open, JSON import/export, and PDF preview/download through the .NET API

Templates use the same `version`, `page`, `watermark`, `pagination`, and object properties as the Next.js application and backend. The backend remains the source of final PDF layout/rendering behavior.

## Template imports

The gallery uses the original 25 Next.js layouts, including letterhead logo marks, fields, tables, and footers. JSON import accepts either a report or a saved `{ meta, template }` wrapper, fills missing optional settings, and preserves valid object coordinates and embedded image sources. Invalid files leave the current report unchanged.

Gallery letterheads are aligned inside the printable margins, with separate bank-name, address, and phone lines. Click the logo slot's image button to upload a logo. Images are embedded, proportionally fitted, and centered automatically without changing the letterhead or body layout. Select an uploaded logo to reveal its replacement button. The editor-only upload button is not part of the exported template. Older header logo rectangles can use the same upload action.

For portable logos, upload or replace the image in the editor before exporting JSON so it is embedded as a data URL. Relative URLs still require the corresponding asset on the Angular server; remote URLs must remain available and allow cross-origin image loading. An unavailable image displays a named warning and a replaceable placeholder without preventing the other report objects from rendering. Table column widths are scaled proportionally to the saved table width, and rendering is clipped to its saved bounds.
