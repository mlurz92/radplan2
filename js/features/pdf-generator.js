export class PDFGenerator {
  constructor() {
    this.loaded = false;
    this.loading = false;
  }

  async ensureLoaded() {
    if (this.loaded) return true;
    if (this.loading) {
      return new Promise((resolve) => {
        const check = setInterval(() => {
          if (this.loaded) {
            clearInterval(check);
            resolve(true);
          }
        }, 100);
      });
    }

    this.loading = true;

    try {
      // Libraries are loaded via <script> tags in index.html
      // Just verify they're available
      if (!window.jspdf) {
        await this.loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
      }
      if (!window.html2canvas) {
        await this.loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
      }
      this.loaded = true;
      return true;
    } catch (e) {
      console.error("Failed to load PDF libraries:", e);
      this.loading = false;
      return false;
    }
  }

  loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async generateFromElement(element, options = {}) {
    const loaded = await this.ensureLoaded();
    if (!loaded) {
      throw new Error("PDF-Bibliotheken konnten nicht geladen werden");
    }

    const {
      filename = `radplan_${new Date().toISOString().slice(0, 10)}.pdf`,
      title = "RadPlan Dienstplan",
      orientation = "landscape",
      scale = 2
    } = options;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: orientation === "portrait" ? "portrait" : "landscape",
      unit: "mm",
      format: "a4"
    });

    doc.setProperties({
      title: title,
      author: "RadPlan",
      subject: "Dienstplan",
      creator: "RadPlan — Klinik für Radiologie & Nuklearmedizin"
    });

    const canvas = await html2canvas(element, {
      scale: scale,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff"
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 8;

    const availableWidth = pageWidth - 2 * margin;
    const availableHeight = pageHeight - 2 * margin - 15;

    const imgRatio = canvas.width / canvas.height;
    let imgWidth = availableWidth;
    let imgHeight = imgWidth / imgRatio;

    if (imgHeight > availableHeight) {
      imgHeight = availableHeight;
      imgWidth = imgHeight * imgRatio;
    }

    const x = (pageWidth - imgWidth) / 2;
    const y = margin + 12;

    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.text(title, pageWidth / 2, margin + 6, { align: "center" });

    doc.setFontSize(8);
    doc.setFont(undefined, "normal");
    doc.text(
      `Generiert am ${new Date().toLocaleDateString("de-DE")} — RadPlan`,
      pageWidth / 2,
      margin + 11,
      { align: "center" }
    );

    doc.addImage(imgData, "JPEG", x, y, imgWidth, imgHeight);

    doc.save(filename);
    return { success: true, filename };
  }

  async generateFromData(data, options = {}) {
    const loaded = await this.ensureLoaded();
    if (!loaded) {
      throw new Error("PDF-Bibliotheken konnten nicht geladen werden");
    }

    const {
      filename = `radplan_${new Date().toISOString().slice(0, 10)}.pdf`,
      title = "RadPlan Dienstplan",
      headers = [],
      rows = [],
      orientation = "landscape"
    } = options;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: orientation === "portrait" ? "portrait" : "landscape",
      unit: "mm",
      format: "a4"
    });

    doc.setProperties({
      title: title,
      author: "RadPlan",
      subject: "Dienstplan",
      creator: "RadPlan"
    });

    doc.setFontSize(14);
    doc.setFont(undefined, "bold");
    doc.text(title, 148.5, 15, { align: "center" });

    doc.setFontSize(9);
    doc.setFont(undefined, "normal");
    doc.text(
      `Generiert am ${new Date().toLocaleDateString("de-DE")}`,
      148.5,
      21,
      { align: "center" }
    );

    if (headers.length > 0 && rows.length > 0) {
      doc.autoTable({
        head: [headers],
        body: rows,
        startY: 28,
        theme: "grid",
        styles: {
          fontSize: 7,
          cellPadding: 1.5,
          lineColor: [200, 200, 200],
          lineWidth: 0.1
        },
        headStyles: {
          fillColor: [11, 25, 41],
          textColor: [255, 255, 255],
          fontStyle: "bold"
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        }
      });
    }

    doc.save(filename);
    return { success: true, filename };
  }
}

export const pdfGenerator = new PDFGenerator();
