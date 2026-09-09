/* ============================================================
   BROMAR OPS — IMS · REPORT KIT
   Path: js/pages/ims/ims-report-kit.js
   Version: V1.00
   Standalone PDF template engine for the IMS document builder.
   Separate from js/bromar-report-kit.js (general job/site reports) —
   this one reproduces the specific Bromar IMS document template:
   cover page (logo, title banner, revision table, ISO badge) +
   running content-page header/footer.

   Exposes: window.BromarIMSReportKit
     .generatePolicyPDF({ doc, revision, historyRows })
     .generateFormPDF({ doc, revision, historyRows, submission })
     .download(pdfDoc, filename)

   REQUIRED ASSET (upload once):
     assets/logo/ims-iso-badge.png   — the ISO 9001/14001/45001 Global-Mark badge

   Loads jsPDF + jspdf-autotable itself (jsDelivr → unpkg fallback),
   so no <script> tag changes are needed elsewhere.
   ============================================================ */

window.BromarIMSReportKit = (() => {

  const VERSION = 'V1.00';
  const COMPANY_NAME = 'BROMAR ELECTRICAL SERVICES (AUST)';
  const COMPANY_ADDRESS = '2/98-108 Western Avenue, Westmeadows Victoria 3049';
  const ORANGE = [234, 88, 12];
  const BLACK = [26, 26, 30];
  const GREY = [99, 99, 105];

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
    return dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
  }
  function padRev(n) { return String(n).padStart(2, '0'); }

  function docTitleUpper(doc) { return (doc.title || '').toUpperCase(); }

  /* ── COVER PAGE ── */
  function drawCoverPage(pdf, doc, revision, historyRows) {
    const pageW = pdf.internal.pageSize.getWidth();
    const marginX = 20;
    let y = 20;

    if (logoDataUrl) {
      const w = 80, h = 18.8;
      pdf.addImage(logoDataUrl, 'PNG', marginX, y, w, h);
      y += h + 10;
    } else {
      y += 20;
    }

    pdf.setDrawColor(0, 0, 0);
    pdf.line(marginX, y, pageW - marginX, y);
    y += 10;

    pdf.setTextColor(...ORANGE);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(22);
    const titleLines = pdf.splitTextToSize(docTitleUpper(doc), pageW - marginX * 2);
    titleLines.forEach(line => {
      pdf.text(line, pageW / 2, y, { align: 'center' });
      y += 9;
    });
    y += 2;

    pdf.line(marginX, y, pageW - marginX, y);
    y += 10;

    pdf.setTextColor(...BLACK);
    pdf.setFontSize(11);
    pdf.text('Integrated Management System', pageW / 2, y, { align: 'center' });
    y += 9;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(fmtDateLong(revision.version_date || new Date()), pageW / 2, y, { align: 'center' });
    y += 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text(COMPANY_NAME, pageW / 2, y, { align: 'center' });
    y += 6;
    pdf.text(COMPANY_ADDRESS, pageW / 2, y, { align: 'center' });
    y += 10;

    const rows = (historyRows || []).map(r => [
      padRev(r.revision),
      fmtDate(r.version_date),
      r.version_description || '',
      r.prepared_by || ''
    ]);

    if (pdf.autoTable) {
      pdf.autoTable({
        startY: y,
        margin: { left: marginX, right: marginX },
        head: [['VER', 'VERSION DATE', 'VERSION DESCRIPTION', 'PREPARED BY']],
        body: rows,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2, textColor: BLACK, lineColor: [0, 0, 0], lineWidth: 0.2 },
        headStyles: { fillColor: [255, 255, 255], textColor: BLACK, fontStyle: 'bold', halign: 'center' },
        columnStyles: { 0: { halign: 'center', cellWidth: 16 }, 1: { halign: 'center', cellWidth: 32 } }
      });
      y = pdf.lastAutoTable.finalY + 15;
    } else {
      y += rows.length * 6 + 15;
    }

    if (badgeDataUrl) {
      const bw = 32, bh = 32 * (287 / 233);
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

  function drawFooter(pdf, doc, pageNum) {
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const y = pageH - 12;
    pdf.setDrawColor(0, 0, 0);
    pdf.line(12, y - 4, pageW - 12, y - 4);
    pdf.setTextColor(...ORANGE);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.text(`${docTitleUpper(doc)}  |  ${pageNum}`, pageW - 12, y, { align: 'right' });
  }

  /* ── POLICY / PROCEDURE BODY ── */
  function drawPolicyBody(pdf, blocks, startY) {
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const marginX = 15;
    const maxW = pageW - marginX * 2;
    let y = startY;

    function newPageIfNeeded(needed) {
      if (y + needed > pageH - 18) { pdf.addPage(); return true; }
      return false;
    }

    (blocks || []).forEach(block => {
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

  /* ── FORM / CHECKLIST BODY ── */
  function fieldAnswer(submission, fieldId) {
    if (!submission?.data) return null;
    return submission.data[fieldId];
  }

  function drawFormBody(pdf, fields, startY, submission) {
    const pageW = pdf.internal.pageSize.getWidth();
    const marginX = 15;
    const rows = [];

    (fields || []).forEach(field => {
      if (field.type === 'heading') {
        rows.push([{ content: field.label, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [245, 245, 246] } }]);
        return;
      }
      let answer = '';
      const ans = fieldAnswer(submission, field.id);
      if (field.type === 'passfail') answer = ans ? String(ans).toUpperCase() : '\u25A1 Pass   \u25A1 Fail   \u25A1 N/A';
      else if (field.type === 'checkbox') answer = ans ? '\u2713' : '\u25A1';
      else if (field.type === 'signature') answer = ans ? '(signed)' : '';
      else if (field.type === 'photo') answer = ans ? '(photo attached)' : '';
      else if (field.type === 'dynamiclist') answer = Array.isArray(ans) ? ans.join('; ') : '';
      else answer = ans != null ? String(ans) : '';

      const label = field.label + (field.required ? ' *' : '');
      rows.push([label, answer]);
    });

    if (pdf.autoTable) {
      pdf.autoTable({
        startY,
        margin: { left: marginX, right: marginX },
        body: rows,
        theme: 'grid',
        styles: { fontSize: 9.5, cellPadding: 3, textColor: BLACK, lineColor: [0, 0, 0], lineWidth: 0.2, minCellHeight: 8 },
        columnStyles: { 0: { cellWidth: (pageW - marginX * 2) * 0.55 }, 1: { cellWidth: (pageW - marginX * 2) * 0.45 } }
      });
    }
  }

  /* ── PUBLIC: PDF BUILDERS ── */
  async function newDoc() {
    await ensureJsPDF();
    await ensureAssets();
    const { jsPDF } = window.jspdf;
    return new jsPDF({ unit: 'mm', format: 'a4' });
  }

  function addPageNumbers(pdf, doc, fromPage) {
    const total = pdf.internal.getNumberOfPages();
    for (let p = fromPage; p <= total; p++) {
      pdf.setPage(p);
      drawFooter(pdf, doc, p - fromPage + 1);
    }
  }

  async function generatePolicyPDF({ doc, revision, historyRows }) {
    const pdf = await newDoc();
    drawCoverPage(pdf, doc, revision, historyRows);
    pdf.addPage();
    const startY = drawContentHeader(pdf, doc, revision);
    drawPolicyBody(pdf, revision.content?.blocks, startY);
    addPageNumbers(pdf, doc, 2);
    return pdf;
  }

  async function generateFormPDF({ doc, revision, historyRows, submission }) {
    const pdf = await newDoc();
    drawCoverPage(pdf, doc, revision, historyRows);
    pdf.addPage();
    const startY = drawContentHeader(pdf, doc, revision);
    drawFormBody(pdf, revision.content?.fields, startY, submission);
    addPageNumbers(pdf, doc, 2);
    return pdf;
  }

  function download(pdf, filename) {
    pdf.save(filename.endsWith('.pdf') ? filename : filename + '.pdf');
  }

  return { generatePolicyPDF, generateFormPDF, download, version: VERSION };
})();
