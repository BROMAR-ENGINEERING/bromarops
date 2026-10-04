/* ============================================================
   BROMAR OPS — IMS · REPORT KIT
   Path: js/pages/ims/ims-report-kit.js
   Version: V1.08
   Standalone PDF template engine for the IMS document builder.
   Separate from js/bromar-report-kit.js (general job/site reports) —
   this one reproduces the specific Bromar IMS document template:
   cover page (logo, title banner, revision table, ISO badge) +
   running content-page header/footer.

   V1.08: footer shows the document name bottom-left (dark grey) and the
   page number in black; all tick boxes print as circles.

   V1.07: document names put the version before the description
   (IMS-SAFE-FORM-15-V01-INCIDENT-REPORT); exposes formatDocName().

   V1.06: generateAuditPack() — one PDF with audit cover, clickable document
   register (page refs + bookmarks) and every document. Shared renderer
   renderDocumentInto() used by all builders.

   V1.05: cover DOCUMENT NAME uses the IMS asset number (schema.doc_number),
   falling back to the slug.

   V1.04: choice fields labelled "(select one only)" / "(select all that
   apply)" unless the help text already says so.

   V1.03: cover restyled (DOCUMENT NAME line, REC number, black-header
   revision table with REVIEWED BY). Layout controls: 'spacer' and
   'pagebreak' blocks; per-field f.pdf = { spaceBefore, pageBreakBefore,
   fullWidth } on form fields (form-kit ignores the pdf key).

   V1.02: form body rebuilt — type-aware paper layout (paired short
   inputs, ruled textareas, drawn tick-boxes for options, pass/fail rows,
   signature/photo/dynamic-list areas). Fixes garbled box characters.

   V1.01: rebuilt against the real ims_documents schema — takes a plain
   `schema` object ({blocks:[...]} or {fields:[...]}) and a `revisionMeta`
   ({revision, version_date}) instead of a revision-row-with-content
   wrapper. historyRows now come straight from ims_document_revisions.

   Exposes: window.BromarIMSReportKit
     .generatePolicyPDF({ doc, revisionMeta, schema, historyRows })
     .generateFormPDF({ doc, revisionMeta, schema, historyRows, submission })
     .generateAuditPack({ entries, scopeLabel, generatedBy, onProgress })
     .formatDocName(doc, schema, revision)
     .download(pdfDoc, filename)

   REQUIRED ASSET (upload once):
     assets/logo/ims-iso-badge.png   — the ISO 9001/14001/45001 Global-Mark badge

   Loads jsPDF + jspdf-autotable itself (jsDelivr → unpkg fallback),
   so no <script> tag changes are needed elsewhere.
   ============================================================ */

window.BromarIMSReportKit = (() => {

  const VERSION = 'V1.08';
  const COMPANY_NAME = 'BROMAR ELECTRICAL SERVICES (AUST)';
  const COMPANY_ADDRESS = '2/98-108 Western Avenue, Westmeadows Victoria 3049';
  const LICENCE = 'REC. 30340';
  const ORANGE = [234, 88, 12];
  const BLACK = [26, 26, 30];
  const GREY = [99, 99, 105];
  const FOOTER_GREY = [70, 70, 76];   // dark grey for the footer document name

  const LOGO_PATH = 'assets/logo/bromar-logo-colour.png'; // always colour logo on PDFs, regardless of app theme
  const BADGE_PATH = 'assets/logo/ims-iso-badge.png';

  let jsPDFReady = null;
  let logoDataUrl = null;
  let badgeDataUrl = null;

  /* ── LOADERS ── */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function ensureJsPDF() {
    if (jsPDFReady) return jsPDFReady;
    jsPDFReady = (async () => {
      if (window.jspdf?.jsPDF) return;
      const cdns = [
        'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
        'https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js'
      ];
      for (const url of cdns) {
        try { await loadScript(url); if (window.jspdf?.jsPDF) break; } catch (e) { /* try next */ }
      }
      if (!window.jspdf?.jsPDF) throw new Error('Could not load jsPDF');

      const atCdns = [
        'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js',
        'https://unpkg.com/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'
      ];
      for (const url of atCdns) {
        try { await loadScript(url); break; } catch (e) { /* try next */ }
      }
    })();
    return jsPDFReady;
  }

  function imageToDataUrl(path) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        try { resolve(canvas.toDataURL('image/png')); }
        catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = path;
    });
  }

  async function ensureAssets() {
    if (logoDataUrl === null) logoDataUrl = await imageToDataUrl(LOGO_PATH);
    if (badgeDataUrl === null) badgeDataUrl = await imageToDataUrl(BADGE_PATH);
  }

  /* ── HELPERS ── */
  function fmtDate(d) {
    if (!d) return '';
    const dt = (d instanceof Date) ? d : new Date(d + 'T00:00:00');
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function fmtDateLong(d) {
    const dt = (d instanceof Date) ? d : new Date(d + 'T00:00:00');
    if (isNaN(dt)) return '';
    return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
  }
  function padRev(n) { return String(n).padStart(2, '0'); }

  function docTitleUpper(doc) { return (doc.title || '').toUpperCase(); }

  // IMS-SAFE-FORM-15-V01-INCIDENT-REPORT (version before description). Falls back to
  // older numbers / the slug with the version appended for un-renumbered documents.
  function formatDocName(doc, rev) {
    const v = rev ? `-V${padRev(rev)}` : '';
    if (doc?.doc_code) return `${doc.doc_code}${v}${doc.doc_desc_code ? '-' + doc.doc_desc_code : ''}`;
    return `${String(doc?.doc_number || doc?.slug || '').toUpperCase()}${v}`;
  }
  function withNameParts(doc, schema) {
    return { ...doc, doc_number: schema?.doc_number || doc?.doc_number, doc_code: schema?.doc_code || doc?.doc_code, doc_desc_code: schema?.doc_desc_code || doc?.doc_desc_code };
  }

  /* ── COVER PAGE ──
     Matches Bromar's current cover style: large centred logo, orange title
     between rules, DOCUMENT NAME line, company block with REC number,
     black-header revision table with Reviewed By, ISO badge. */
  function drawCoverPage(pdf, doc, revision, historyRows) {
    const pageW = pdf.internal.pageSize.getWidth();
    const marginX = 20;
    let y = 16;

    if (logoDataUrl) {
      let w = 150, h = 35;
      try {
        const pr = pdf.getImageProperties(logoDataUrl);
        h = w * pr.height / pr.width;
        if (h > 42) { h = 42; w = h * pr.width / pr.height; }
      } catch (e) { /* keep defaults */ }
      pdf.addImage(logoDataUrl, 'PNG', (pageW - w) / 2, y, w, h);
      y += h + 14;
    } else {
      y += 46;
    }

    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.4);
    pdf.line(marginX, y, pageW - marginX, y);
    y += 11;

    pdf.setTextColor(...ORANGE);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(20);
    const titleLines = pdf.splitTextToSize(docTitleUpper(doc), pageW - marginX * 2 - 10);
    titleLines.forEach(line => { pdf.text(line, pageW / 2, y, { align: 'center' }); y += 8.5; });
    y -= 3;
    pdf.line(marginX, y, pageW - marginX, y);
    y += 10;

    // DOCUMENT NAME: BRO-SAF-FRM-015-V03
    const docName = formatDocName(doc, revision.revision || 0);
    pdf.setFontSize(9);
    const lbl = 'DOCUMENT NAME:  ';
    pdf.setFont('helvetica', 'bold');
    const lw = pdf.getTextWidth(lbl);
    pdf.setFont('helvetica', 'normal');
    const vw = pdf.getTextWidth(docName);
    const sx = pageW / 2 - (lw + vw) / 2;
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...ORANGE);
    pdf.text(lbl, sx, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...GREY);
    pdf.text(docName, sx + lw, y);
    y += 11;

    pdf.setTextColor(...BLACK);
    pdf.setFontSize(11);
    pdf.text('Integrated Management System', pageW / 2, y, { align: 'center' });
    y += 9;
    pdf.setFont('helvetica', 'bold');
    pdf.text(fmtDateLong(revision.version_date || new Date()), pageW / 2, y, { align: 'center' });
    y += 6;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(COMPANY_NAME, pageW / 2, y, { align: 'center' });
    y += 5.5;
    pdf.text(COMPANY_ADDRESS, pageW / 2, y, { align: 'center' });
    y += 5.5;
    pdf.setFontSize(8.5);
    pdf.text(LICENCE, pageW / 2, y, { align: 'center' });
    y += 8;

    const rows = (historyRows || []).slice().sort((a, b) => a.revision - b.revision).map(r => [
      padRev(r.revision), fmtDate(r.version_date), r.version_description || '', r.prepared_by || '', r.reviewed_by || ''
    ]);
    while (rows.length < 6) rows.push(['', '', '', '', '']);

    if (pdf.autoTable) {
      pdf.autoTable({
        startY: y,
        margin: { left: marginX, right: marginX },
        head: [['VER', 'VERSION DATE', 'VERSION DESCRIPTION', 'PREPARED BY', 'REVIEWED BY']],
        body: rows,
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 1.6, textColor: BLACK, lineColor: [0, 0, 0], lineWidth: 0.25, halign: 'center', minCellHeight: 6 },
        headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 13 }, 1: { cellWidth: 27 }, 3: { cellWidth: 36 }, 4: { cellWidth: 36 } }
      });
      y = pdf.lastAutoTable.finalY + 14;
    } else {
      y += rows.length * 6 + 14;
    }

    if (badgeDataUrl) {
      const bw = 30, bh = 30 * (287 / 233);
      pdf.addImage(badgeDataUrl, 'PNG', pageW / 2 - bw / 2, y, bw, bh);
    }
  }

  /* ── CONTENT PAGE HEADER / FOOTER ── */
  function drawContentHeader(pdf, doc, revision) {
    const pageW = pdf.internal.pageSize.getWidth();
    let y = 12;

    if (logoDataUrl) pdf.addImage(logoDataUrl, 'PNG', 12, y - 4, 22, 5.2);

    pdf.setTextColor(...BLACK);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.text(COMPANY_NAME, pageW / 2, y, { align: 'center' });
    y += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.text('Integrated Management System', pageW / 2, y, { align: 'center' });
    y += 5;
    pdf.setTextColor(...ORANGE);
    pdf.text(docTitleUpper(doc), pageW / 2, y, { align: 'center' });
    y += 4;

    pdf.setDrawColor(0, 0, 0);
    pdf.line(12, y, pageW - 12, y);
    y += 5;

    pdf.setTextColor(...BLACK);
    pdf.setFontSize(8.5);
    pdf.text(`VER ${padRev(revision.revision)}`, 12, y);
    pdf.text(`DATE: ${fmtDate(revision.version_date)}`, pageW - 12, y, { align: 'right' });
    y += 3;
    pdf.line(12, y, pageW - 12, y);

    return y + 8; // content start Y
  }

  function drawFooter(pdf, doc, pageNum, rev) {
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const y = pageH - 12;
    pdf.setDrawColor(0, 0, 0);
    pdf.line(12, y - 4, pageW - 12, y - 4);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);

    // right: TITLE (orange) | page number (black)
    const num = String(pageNum);
    const numW = pdf.getTextWidth(num);
    const sep = '  |  ';
    const sepW = pdf.getTextWidth(sep);
    const title = docTitleUpper(doc);
    const titleW = pdf.getTextWidth(title);
    const right = pageW - 12;
    pdf.setTextColor(...BLACK);
    pdf.text(num, right, y, { align: 'right' });
    pdf.setTextColor(...GREY);
    pdf.text(sep, right - numW, y, { align: 'right' });
    pdf.setTextColor(...ORANGE);
    pdf.text(title, right - numW - sepW, y, { align: 'right' });

    // left: document name (dark grey), trimmed so it never runs into the title
    const name = (doc && (doc.doc_code || doc.doc_number || doc.slug)) ? formatDocName(doc, rev || 0) : '';
    if (name) {
      pdf.setFontSize(7.5);
      pdf.setTextColor(...FOOTER_GREY);
      const maxW = (right - numW - sepW - titleW) - 12 - 6;
      let txt = name;
      while (txt.length > 4 && pdf.getTextWidth(txt) > maxW) txt = txt.slice(0, -2);
      if (txt !== name) txt = txt.slice(0, -1) + '…';
      if (maxW > 20) pdf.text(txt, 12, y);
    }
  }

  /* ── POLICY / PROCEDURE BODY ── */
  function drawPolicyBody(pdf, doc, revisionMeta, blocks, startY) {
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const marginX = 15;
    const maxW = pageW - marginX * 2;
    let y = startY;
    let pageTop = startY;

    function newPageIfNeeded(needed) {
      if (y + needed > pageH - 18) {
        pdf.addPage();
        y = pageTop = drawContentHeader(pdf, doc, revisionMeta);
        return true;
      }
      return false;
    }

    (blocks || []).forEach(block => {
      if (block.type === 'pagebreak') {
        if (y > pageTop + 0.1) { pdf.addPage(); y = pageTop = drawContentHeader(pdf, doc, revisionMeta); }
        return;
      }
      if (block.type === 'spacer') {
        y += Number(block.height) || 8;
        return;
      }
      if (block.type === 'table') {
        const cols = block.columns || [];
        const rows = (block.rows || []).map((r, ri) => r.cells.map((cell, ci) =>
          cols[ci]?.type === 'check' ? (cell ? 'X' : '') : (cell || '')
        ));
        if (pdf.autoTable) {
          pdf.autoTable({
            startY: y,
            margin: { left: marginX, right: marginX, top: 40 },
            head: [cols.map(c => c.label)],
            body: rows,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 1.8, textColor: BLACK, lineColor: [0, 0, 0], lineWidth: 0.2, halign: 'center' },
            headStyles: { fillColor: [235, 235, 237], textColor: BLACK, fontStyle: 'bold' },
            columnStyles: cols[0] ? { 0: { halign: 'left', cellWidth: 50 } } : {},
            didDrawPage: () => { y = drawContentHeader(pdf, doc, revisionMeta); }
          });
          y = pdf.lastAutoTable.finalY + 8;
        }
        return;
      }
      if (block.type === 'heading') {
        newPageIfNeeded(10);
        pdf.setTextColor(...BLACK);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.text(block.text || '', marginX, y);
        y += 7;
      } else if (block.type === 'paragraph') {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        const lines = pdf.splitTextToSize(block.text || '', maxW);
        lines.forEach(line => {
          newPageIfNeeded(6);
          pdf.text(line, marginX, y);
          y += 5.5;
        });
        y += 3;
      } else if (block.type === 'bullets') {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        (block.items || []).forEach(item => {
          const lines = pdf.splitTextToSize(item, maxW - 6);
          newPageIfNeeded(lines.length * 5.5 + 1);
          pdf.text('\u2022', marginX, y);
          lines.forEach((line, i) => { pdf.text(line, marginX + 5, y + (i * 5.5)); });
          y += lines.length * 5.5 + 1;
        });
        y += 3;
      } else if (block.type === 'signatory') {
        newPageIfNeeded(14);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.text(block.name || '', marginX, y);
        y += 5;
        pdf.setFont('helvetica', 'normal');
        pdf.text(block.title || '', marginX, y);
        y += 9;
      }
    });
  }

  /* ── FORM / CHECKLIST BODY ──
     Each field type gets a paper-appropriate layout (matches form-kit's
     HTML render): short inputs pair up two per row, textareas get ruled
     writing space, select/radio/multiselect print as tick-boxes, pass/fail
     rows get inline boxes, signature/photo/dynamic-list get dedicated areas.
     All boxes/ticks are DRAWN — jsPDF's built-in fonts can't print ☐ / ✓. */
  const BORDER = [196, 196, 202];
  const BOX = [90, 90, 96];
  const FAINT = [168, 168, 175];
  const RULE = [232, 232, 236];
  const SECTION_FILL = [244, 244, 246];
  const SHORT_TYPES = ['text', 'email', 'tel', 'number', 'date', 'time', 'datetime'];
  const DATE_HINTS = { date: 'DD / MM / YYYY', time: 'HH : MM', datetime: 'DD / MM / YYYY     HH : MM' };

  // Proxy that measures (fonts, text widths) without drawing anything.
  function measurer(pdf) {
    const passthrough = ['splitTextToSize', 'getTextWidth', 'setFont', 'setFontSize', 'getFontSize'];
    let m;
    const noop = () => m;
    m = new Proxy(pdf, {
      get(t, k) {
        if (passthrough.includes(k)) return t[k].bind(t);
        return noop;
      }
    });
    return m;
  }

  function normOpts(opts) {
    return (opts || []).map(o => (o && typeof o === 'object')
      ? { value: String(o.value), label: String(o.label ?? o.value) }
      : { value: String(o), label: String(o) });
  }

  function inputBox(p, x, y, w, h, dashed) {
    p.setDrawColor(...BORDER);
    p.setLineWidth(0.3);
    if (dashed) p.setLineDashPattern([1.5, 1.2], 0);
    p.roundedRect(x, y, w, h, 1.2, 1.2, 'S');
    if (dashed) p.setLineDashPattern([], 0);
  }

  function checkMark(p, x, y, s) {
    p.setDrawColor(...BLACK);
    p.setLineWidth(0.5);
    p.line(x + s * 0.2, y + s * 0.55, x + s * 0.42, y + s * 0.8);
    p.line(x + s * 0.42, y + s * 0.8, x + s * 0.82, y + s * 0.22);
    p.setLineWidth(0.3);
  }

  // note: optional grey italic instruction shown after the label, e.g. "Select one only"
  function drawLabel(p, f, x, y, w, note) {
    p.setFont('helvetica', 'bold');
    p.setFontSize(9);
    p.setTextColor(...BLACK);
    const lines = p.splitTextToSize(f.label || f.name || '', w - 4);
    lines.forEach((ln, i) => p.text(ln, x, y + 3.2 + i * 4.2));
    const lastY = y + 3.2 + (lines.length - 1) * 4.2;
    let endX = x + p.getTextWidth(lines[lines.length - 1] || '');
    if (f.required) {
      p.setTextColor(...ORANGE);
      p.text('*', endX + 1, lastY);
      endX += 2.5;
    }
    let extra = 0;
    if (note) {
      p.setFont('helvetica', 'italic');
      p.setFontSize(7.5);
      p.setTextColor(...GREY);
      const txt = `(${note})`;
      if (endX + 3 + p.getTextWidth(txt) <= x + w) p.text(txt, endX + 3, lastY);
      else { p.text(txt, x, lastY + 3.6); extra = 3.6; }
    }
    return y + lines.length * 4.2 + 1.8 + extra;
  }

  function choiceNote(f) {
    const type = f.type || 'text';
    if (!['select', 'radio', 'multiselect'].includes(type)) return null;
    if (f.help && /select|choose|tick|pick/i.test(f.help)) return null;   // help text already explains it
    return type === 'multiselect' ? 'select all that apply' : 'select one only';
  }

  function drawHelp(p, f, x, y, w) {
    if (!f.help) return y;
    p.setFont('helvetica', 'normal');
    p.setFontSize(7.5);
    p.setTextColor(...GREY);
    const lines = p.splitTextToSize(f.help, w);
    lines.forEach((ln, i) => p.text(ln, x, y + 3 + i * 3.4));
    return y + lines.length * 3.4 + 1;
  }

  // Lays options out left-to-right as tick boxes (square) or radio dots (circle), wrapping as needed.
  function optionsBlock(p, opts, x, y, w, shape, selected) {
    const S = 3.6, ROW = 6.2, GAP = 7, LINE = 4;
    p.setFont('helvetica', 'normal');
    p.setFontSize(9);
    let cx = x, cy = y;
    opts.forEach(o => {
      const maxTw = w - S - 2;
      const tw = p.getTextWidth(o.label);
      const lines = tw > maxTw ? p.splitTextToSize(o.label, maxTw) : [o.label];
      const itemW = S + 2 + Math.min(tw, maxTw) + GAP;
      if (cx > x && (cx + itemW - GAP > x + w || lines.length > 1)) { cx = x; cy += ROW; }

      p.setDrawColor(...BOX);
      p.setLineWidth(0.3);
      // All choices print as circles (single and multi choice alike); selected = filled dot
      p.circle(cx + S / 2, cy + S / 2, S / 2, 'S');
      if (selected.has(o.value)) { p.setFillColor(...BLACK); p.circle(cx + S / 2, cy + S / 2, S / 2 - 0.9, 'F'); }
      p.setTextColor(...BLACK);
      lines.forEach((ln, i) => p.text(ln, cx + S + 2, cy + S - 0.6 + i * LINE));

      if (lines.length > 1) { cy += ROW + (lines.length - 1) * LINE; cx = x; }
      else cx += itemW;
    });
    return (cx === x ? cy : cy + ROW) - y;
  }

  // Draws one field (or just measures it, when p is a measurer). Returns its height.
  function fieldBlock(p, f, x, y, w, v) {
    const type = f.type || 'text';

    if (type === 'heading') {
      const H = 8.5;
      p.setFillColor(...SECTION_FILL);
      p.rect(x, y, w, H, 'F');
      p.setFillColor(...ORANGE);
      p.rect(x, y, 1.4, H, 'F');
      p.setFont('helvetica', 'bold');
      p.setFontSize(10);
      p.setTextColor(...BLACK);
      p.text(String(f.label || '').toUpperCase(), x + 4.5, y + 5.7);
      return H;
    }

    if (type === 'checkbox') {
      const S = 3.6;
      p.setDrawColor(...BOX);
      p.setLineWidth(0.3);
      p.circle(x + S / 2, y + 0.4 + S / 2, S / 2, 'S');
      if (v === true || v === 'true') { p.setFillColor(...BLACK); p.circle(x + S / 2, y + 0.4 + S / 2, S / 2 - 0.9, 'F'); }
      p.setFont('helvetica', 'normal');
      p.setFontSize(9.5);
      p.setTextColor(...BLACK);
      const lines = p.splitTextToSize(f.checkboxLabel || f.label || f.name || '', w - S - 4);
      lines.forEach((ln, i) => p.text(ln, x + S + 2.5, y + 3.5 + i * 4.2));
      if (f.required) {
        p.setTextColor(...ORANGE);
        p.text('*', x + S + 2.5 + p.getTextWidth(lines[lines.length - 1] || '') + 1, y + 3.5 + (lines.length - 1) * 4.2);
      }
      const cy = drawHelp(p, f, x + S + 2.5, y + Math.max(lines.length * 4.2, S) + 0.6, w - S - 2.5);
      return cy - y;
    }

    if (type === 'passfail' || type === 'yesno') {
      const opts = normOpts(type === 'passfail' ? ['Pass', 'Fail', 'N/A'] : ['Yes', 'No']);
      const optsW = type === 'passfail' ? 60 : 40;
      p.setFont('helvetica', 'normal');
      p.setFontSize(9.5);
      p.setTextColor(...BLACK);
      const lines = p.splitTextToSize(f.label || f.name || '', w - optsW - 6);
      lines.forEach((ln, i) => p.text(ln, x, y + 3.6 + i * 4.2));
      if (f.required) {
        p.setTextColor(...ORANGE);
        p.text('*', x + p.getTextWidth(lines[lines.length - 1] || '') + 1, y + 3.6 + (lines.length - 1) * 4.2);
      }
      const norm = s => String(s).toLowerCase().replace(/[^a-z]/g, '');
      const sel = new Set(v != null ? opts.filter(o => norm(o.value) === norm(v)).map(o => o.value) : []);
      optionsBlock(p, opts, x + w - optsW, y + 0.4, optsW, 'square', sel);
      const h = Math.max(lines.length * 4.2, 5) + 2;
      p.setDrawColor(...RULE);
      p.setLineWidth(0.25);
      p.line(x, y + h, x + w, y + h);
      return h;
    }

    let cy = drawLabel(p, f, x, y, w, choiceNote(f));

    if (type === 'textarea') {
      const lineH = 7;
      const rows = Math.max(f.rows || 3, 3);
      const H = rows * lineH + 1;
      inputBox(p, x, cy, w, H);
      p.setDrawColor(...RULE);
      p.setLineWidth(0.2);
      for (let k = 1; k < rows; k++) p.line(x + 3, cy + 1 + k * lineH, x + w - 3, cy + 1 + k * lineH);
      if (v) {
        p.setFont('helvetica', 'normal');
        p.setFontSize(9.5);
        p.setTextColor(...BLACK);
        p.splitTextToSize(String(v), w - 6).slice(0, rows).forEach((ln, i) => p.text(ln, x + 3, cy + (i + 1) * lineH - 0.8));
      }
      cy += H;
    } else if (type === 'select' || type === 'radio' || type === 'multiselect') {
      const opts = normOpts(f.options);
      if (!opts.length) {
        inputBox(p, x, cy, w, 8.5);
        cy += 8.5;
      } else {
        const sel = new Set(type === 'multiselect'
          ? (Array.isArray(v) ? v.map(String) : [])
          : (v != null && v !== '' ? [String(v)] : []));
        cy += optionsBlock(p, opts, x + 0.5, cy + 0.6, w - 0.5, type === 'multiselect' ? 'square' : 'circle', sel) + 0.4;
      }
    } else if (type === 'signature') {
      const H = 20;
      inputBox(p, x, cy, w, H);
      if (typeof v === 'string' && v.startsWith('data:image')) {
        try { p.addImage(v, 'PNG', x + 3, cy + 2, Math.min(60, w - 6), H - 4); } catch (e) { /* ignore bad image */ }
      } else {
        p.setFont('helvetica', 'italic');
        p.setFontSize(8);
        p.setTextColor(...FAINT);
        p.text('Sign here', x + 3, cy + H - 3);
      }
      cy += H + 6;
      p.setFont('helvetica', 'normal');
      p.setFontSize(8.5);
      p.setTextColor(...GREY);
      p.setDrawColor(...BORDER);
      p.setLineWidth(0.3);
      p.text('Name', x, cy);
      p.line(x + 10, cy + 0.8, x + w / 2 - 5, cy + 0.8);
      p.text('Date', x + w / 2, cy);
      p.line(x + w / 2 + 9, cy + 0.8, x + w, cy + 0.8);
      cy += 2.5;
    } else if (type === 'photo') {
      const H = 28;
      inputBox(p, x, cy, w, H, true);
      p.setFont('helvetica', 'normal');
      p.setFontSize(8.5);
      p.setTextColor(...FAINT);
      const n = Array.isArray(v) ? v.length : (v ? 1 : 0);
      p.text(n ? `${n} photo(s) attached — see digital record` : 'Attach photo(s) or note photo reference', x + w / 2, cy + H / 2 + 1, { align: 'center' });
      cy += H;
    } else if (type === 'dynamiclist') {
      const items = Array.isArray(v) ? v : [];
      const rows = Math.max(3, items.length);
      for (let k = 0; k < rows; k++) {
        p.setFont('helvetica', 'normal');
        p.setFontSize(8.5);
        p.setTextColor(...GREY);
        p.text(`${k + 1}.`, x, cy + 5.2);
        inputBox(p, x + 6, cy, w - 6, 7.5);
        if (items[k] != null) {
          p.setFontSize(9.5);
          p.setTextColor(...BLACK);
          p.text(p.splitTextToSize(String(items[k]), w - 12)[0] || '', x + 9, cy + 5.1);
        }
        cy += 9;
      }
      cy -= 1.5;
    } else {
      // text, email, tel, number, date, time, datetime, and anything unknown
      const H = 8.5;
      inputBox(p, x, cy, w, H);
      p.setFont('helvetica', 'normal');
      p.setFontSize(9.5);
      if (v != null && v !== '') {
        p.setTextColor(...BLACK);
        p.text(p.splitTextToSize(String(v), w - 6)[0] || '', x + 3, cy + 5.7);
      } else if (DATE_HINTS[type]) {
        p.setTextColor(...FAINT);
        p.text(DATE_HINTS[type], x + 3, cy + 5.7);
      }
      cy += H;
    }

    cy = drawHelp(p, f, x, cy, w);
    return cy - y;
  }

  function drawFormBody(pdf, doc, revisionMeta, schema, startY, submission) {
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const marginX = 15;
    const contentW = pageW - marginX * 2;
    const GAP = 5;
    const COL_GAP = 7;
    const m = measurer(pdf);
    const data = submission?.data || {};
    const valOf = f => data[f.name ?? f.id];
    const fields = schema?.fields || [];
    let y = startY;
    let pageTop = startY;

    function ensure(h) {
      if (y + h > pageH - 20) { pdf.addPage(); y = pageTop = drawContentHeader(pdf, doc, revisionMeta); }
    }
    function applyLayout(f) {
      const lay = f.pdf || {};
      if (lay.pageBreakBefore) {
        if (y > pageTop + 0.1) { pdf.addPage(); y = pageTop = drawContentHeader(pdf, doc, revisionMeta); }
      } else if (lay.spaceBefore) {
        y += Number(lay.spaceBefore) || 0;
      }
    }
    const canPairWith = n => n && SHORT_TYPES.includes(n.type || 'text')
      && !n.pdf?.fullWidth && !n.pdf?.pageBreakBefore && !n.pdf?.spaceBefore;

    if (schema?.description) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(9);
      pdf.setTextColor(...GREY);
      const lines = pdf.splitTextToSize(schema.description, contentW);
      lines.forEach((ln, i) => pdf.text(ln, marginX, y + i * 4.2));
      y += lines.length * 4.2 + 4;
    }

    if (!fields.length) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(...GREY);
      pdf.text('No fields defined for this form yet.', marginX, y + 4);
      return;
    }

    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const type = f.type || 'text';
      applyLayout(f);

      if (type === 'heading') {
        const h = fieldBlock(m, f, 0, 0, contentW, null);
        ensure(h + 20);                // keep a heading with at least the start of its section
        if (i > 0) y += 3;
        fieldBlock(pdf, f, marginX, y, contentW, null);
        y += h + GAP;
        continue;
      }

      const next = fields[i + 1];
      if (SHORT_TYPES.includes(type) && !f.pdf?.fullWidth && canPairWith(next)) {
        const cw = (contentW - COL_GAP) / 2;
        const h = Math.max(fieldBlock(m, f, 0, 0, cw, valOf(f)), fieldBlock(m, next, 0, 0, cw, valOf(next)));
        ensure(h);
        fieldBlock(pdf, f, marginX, y, cw, valOf(f));
        fieldBlock(pdf, next, marginX + cw + COL_GAP, y, cw, valOf(next));
        y += h + GAP;
        i++;
        continue;
      }

      const h = fieldBlock(m, f, 0, 0, contentW, valOf(f));
      ensure(h);
      fieldBlock(pdf, f, marginX, y, contentW, valOf(f));
      y += h + (type === 'passfail' || type === 'yesno' ? 2.5 : GAP);
    }
  }

  /* ── PUBLIC: PDF BUILDERS ── */
  async function newDoc() {
    await ensureJsPDF();
    await ensureAssets();
    const { jsPDF } = window.jspdf;
    return new jsPDF({ unit: 'mm', format: 'a4' });
  }

  // Renders one complete document (cover + body + footers) into an existing PDF.
  // Page numbers in footers restart at 1 for each document. Returns its page range.
  function renderDocumentInto(pdf, { doc: rawDoc, revisionMeta, schema, historyRows, submission }, onNewPage) {
    const doc = withNameParts(rawDoc, schema);
    if (onNewPage) pdf.addPage();
    const coverPage = pdf.internal.getNumberOfPages();
    drawCoverPage(pdf, doc, revisionMeta, historyRows);
    pdf.addPage();
    const startY = drawContentHeader(pdf, doc, revisionMeta);
    if (Array.isArray(schema?.fields)) drawFormBody(pdf, doc, revisionMeta, schema, startY, submission);
    else drawPolicyBody(pdf, doc, revisionMeta, schema?.blocks, startY);
    const endPage = pdf.internal.getNumberOfPages();
    for (let p = coverPage + 1; p <= endPage; p++) {
      pdf.setPage(p);
      drawFooter(pdf, doc, p - coverPage, revisionMeta?.revision);
    }
    pdf.setPage(endPage);
    return { coverPage, endPage };
  }

  async function generatePolicyPDF(args) {
    const pdf = await newDoc();
    renderDocumentInto(pdf, { ...args, schema: { ...(args.schema || {}), fields: undefined } }, false);
    return pdf;
  }

  async function generateFormPDF(args) {
    const pdf = await newDoc();
    renderDocumentInto(pdf, { ...args, schema: { ...(args.schema || {}), fields: args.schema?.fields || [] } }, false);
    return pdf;
  }

  /* ── AUDIT PACK ──
     One PDF: audit cover → document register (clickable rows, page refs) →
     every document in order. Bookmarks added for each document.
     entries: [{ doc, revisionMeta, schema, historyRows, meta: { section, type, category, prepared_by, reviewed_by } }] */
  async function generateAuditPack({ entries, scopeLabel, generatedBy, onProgress }) {
    const pdf = await newDoc();
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const marginX = 15;
    const today = new Date();

    // Cover
    let y = 22;
    if (logoDataUrl) {
      let w = 120, h = 28;
      try { const pr = pdf.getImageProperties(logoDataUrl); h = w * pr.height / pr.width; } catch (e) { /* defaults */ }
      pdf.addImage(logoDataUrl, 'PNG', (pageW - w) / 2, y, w, h);
      y += h + 18;
    } else y += 45;
    pdf.setDrawColor(0, 0, 0); pdf.setLineWidth(0.4);
    pdf.line(20, y, pageW - 20, y); y += 13;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(24); pdf.setTextColor(...ORANGE);
    pdf.text('IMS AUDIT PACK', pageW / 2, y, { align: 'center' }); y += 6;
    pdf.line(20, y, pageW - 20, y); y += 12;
    pdf.setTextColor(...BLACK); pdf.setFontSize(11);
    pdf.text('Integrated Management System', pageW / 2, y, { align: 'center' }); y += 8;
    pdf.setFont('helvetica', 'bold');
    pdf.text(String(scopeLabel || 'All sections'), pageW / 2, y, { align: 'center' }); y += 10;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5);
    [
      `Generated ${fmtDate(today)}${generatedBy ? ` by ${generatedBy}` : ''}`,
      `${entries.length} current published document${entries.length === 1 ? '' : 's'}`,
      COMPANY_NAME, COMPANY_ADDRESS, LICENCE
    ].forEach(line => { pdf.text(line, pageW / 2, y, { align: 'center' }); y += 5.5; });
    if (badgeDataUrl) { const bw = 30, bh = 30 * (287 / 233); pdf.addImage(badgeDataUrl, 'PNG', pageW / 2 - bw / 2, y + 12, bw, bh); }

    // Register
    pdf.addPage();
    const registerStart = pdf.internal.getNumberOfPages();
    const regHeader = () => {
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.setTextColor(...BLACK);
      pdf.text('DOCUMENT REGISTER', marginX, 16);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(...GREY);
      pdf.text(`${scopeLabel || 'All sections'} · ${fmtDate(today)} · click a row to jump to the document`, marginX, 21);
    };
    const pageCells = [];   // { page, x, y, w, h, row } for page refs + links
    pdf.autoTable({
      startY: 26,
      margin: { left: marginX, right: marginX, top: 26, bottom: 18 },
      head: [['No.', 'Document number', 'Title', 'Section', 'Type', 'Category', 'Rev', 'Date', 'Prepared by', 'Reviewed by', 'Page']],
      body: entries.map((e, i) => [
        i + 1, formatDocName(withNameParts(e.doc, e.schema), e.revisionMeta?.revision || 0), e.doc.title || '',
        e.meta?.section || '', e.meta?.type || '', e.meta?.category || '',
        padRev(e.revisionMeta?.revision || 0), fmtDate(e.revisionMeta?.version_date),
        e.meta?.prepared_by || '', e.meta?.reviewed_by || '', ''
      ]),
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1.4, textColor: BLACK, lineColor: [0, 0, 0], lineWidth: 0.2, valign: 'middle' },
      headStyles: { fillColor: [0, 0, 0], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 38 }, 6: { cellWidth: 8, halign: 'center' }, 7: { cellWidth: 16, halign: 'center' }, 10: { cellWidth: 10, halign: 'center' } },
      didDrawPage: regHeader,
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 10) {
          pageCells.push({ page: pdf.internal.getCurrentPageInfo().pageNumber, x: data.cell.x, y: data.cell.y, w: data.cell.width, h: data.cell.height, row: data.row.index });
        }
      }
    });
    const registerEnd = pdf.internal.getNumberOfPages();

    // Documents
    const starts = [];
    for (let i = 0; i < entries.length; i++) {
      if (onProgress) onProgress(i, entries.length, entries[i].doc.title);
      await new Promise(r => setTimeout(r, 0));          // keep the UI responsive
      const { coverPage } = renderDocumentInto(pdf, entries[i], true);
      starts.push(coverPage);
    }
    if (onProgress) onProgress(entries.length, entries.length, '');

    // Fill register page refs, make each row a link, add bookmarks
    const tableLeft = marginX, tableW = pageW - marginX * 2;
    pageCells.forEach(c => {
      pdf.setPage(c.page);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.setTextColor(...ORANGE);
      pdf.text(String(starts[c.row]), c.x + c.w / 2, c.y + c.h / 2 + 1.1, { align: 'center' });
      try { pdf.link(tableLeft, c.y, tableW, c.h, { pageNumber: starts[c.row] }); } catch (e) { /* links optional */ }
    });
    for (let p = registerStart; p <= registerEnd; p++) {
      pdf.setPage(p);
      drawFooter(pdf, { title: 'IMS Audit Pack — Document Register' }, p - registerStart + 1);
    }
    try {
      if (pdf.outline) {
        const reg = pdf.outline.add(null, 'Document register', { pageNumber: registerStart });
        entries.forEach((e, i) => pdf.outline.add(null, `${formatDocName(withNameParts(e.doc, e.schema), e.revisionMeta?.revision || 0)} — ${e.doc.title}`, { pageNumber: starts[i] }));
        void reg;
      }
    } catch (e) { /* bookmarks optional */ }
    pdf.setPage(pdf.internal.getNumberOfPages());
    return pdf;
  }

  function download(pdf, filename) {
    pdf.save(filename.endsWith('.pdf') ? filename : filename + '.pdf');
  }

  return { generatePolicyPDF, generateFormPDF, generateAuditPack, formatDocName: (doc, schema, rev) => formatDocName(withNameParts(doc, schema), rev), download, version: VERSION };
})();
