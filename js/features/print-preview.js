export class PrintPreviewModal {
  constructor() {
    this.modalId = "modal-print-preview";
    this.currentOrientation = "landscape";
    this.currentScale = "fit";
    this.includeRbn = true;
    this.includeStats = true;
    this.includeComments = false;
  }

  init() {
    this.createModal();
    this.bindEvents();
  }

  createModal() {
    if (document.getElementById(this.modalId)) return;

    const modal = document.createElement("div");
    modal.id = this.modalId;
    modal.className = "overlay";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "print-preview-title");
    modal.hidden = true;
    modal.style.display = "none";

    modal.innerHTML = `
      <div class="modal modal-print-preview">
        <div class="modal-hd">
          <div>
            <div class="modal-hd-title" id="print-preview-title">
              <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:-3px;margin-right:6px">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              Druckvorschau & PDF-Export
            </div>
            <div class="modal-hd-sub">Vorschau, Layoutoptionen und PDF-Generierung</div>
          </div>
          <button type="button" class="modal-x" data-close="${this.modalId}" aria-label="Druckvorschau schließen">✕</button>
        </div>
        <div class="modal-bd print-preview-body">
          <div class="print-preview-sidebar">
            <div class="pp-section">
              <div class="pp-section-title">Seitenlayout</div>
              <div class="pp-control-group">
                <label class="pp-label">Ausrichtung</label>
                <div class="pp-btn-group">
                  <button type="button" class="pp-btn active" data-orientation="landscape">
                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <rect x="3" y="5" width="18" height="14" rx="2"/>
                    </svg>
                    Querformat
                  </button>
                  <button type="button" class="pp-btn" data-orientation="portrait">
                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <rect x="5" y="3" width="14" height="18" rx="2"/>
                    </svg>
                    Hochformat
                  </button>
                </div>
              </div>
              <div class="pp-control-group">
                <label class="pp-label">Skalierung</label>
                <div class="pp-btn-group">
                  <button type="button" class="pp-btn" data-scale="fit">Auto</button>
                  <button type="button" class="pp-btn active" data-scale="100">100%</button>
                  <button type="button" class="pp-btn" data-scale="90">90%</button>
                  <button type="button" class="pp-btn" data-scale="80">80%</button>
                </div>
              </div>
            </div>
            <div class="pp-section">
              <div class="pp-section-title">Inhalt</div>
              <label class="pp-checkbox">
                <input type="checkbox" id="pp-include-rbn" checked>
                <span>RBN-Zeile einschließen</span>
              </label>
              <label class="pp-checkbox">
                <input type="checkbox" id="pp-include-stats" checked>
                <span>Statistik-Fußzeile</span>
              </label>
              <label class="pp-checkbox">
                <input type="checkbox" id="pp-include-comments">
                <span>Kommentare anzeigen</span>
              </label>
            </div>
            <div class="pp-section">
              <div class="pp-section-title">PDF-Metadaten</div>
              <div class="pp-input-group">
                <label class="pp-label-sm">Titel</label>
                <input type="text" class="pp-input" id="pp-title" value="RadPlan Dienstplan">
              </div>
              <div class="pp-input-group">
                <label class="pp-label-sm">Autor</label>
                <input type="text" class="pp-input" id="pp-author" value="Klinik für Radiologie & Nuklearmedizin">
              </div>
            </div>
            <div class="pp-actions">
              <button type="button" class="mbtn mbtn-primary" id="pp-generate-pdf">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right:6px">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                PDF generieren
              </button>
              <button type="button" class="mbtn mbtn-ghost" id="pp-print-direct">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="margin-right:6px">
                  <polyline points="6 9 6 2 18 2 18 9"/>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                  <rect x="6" y="14" width="12" height="8"/>
                </svg>
                Direktdruck
              </button>
            </div>
          </div>
          <div class="print-preview-content">
            <div class="pp-preview-area" id="pp-preview-area">
              <div class="pp-page" id="pp-page">
                <div class="pp-page-content" id="pp-page-content"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-ft">
          <button type="button" class="mbtn mbtn-ghost" data-close="${this.modalId}">Schließen</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  bindEvents() {
    const modal = document.getElementById(this.modalId);
    if (!modal) return;

    modal.addEventListener("click", (e) => {
      const closeBtn = e.target.closest(`[data-close="${this.modalId}"]`);
      if (closeBtn) {
        this.close();
        return;
      }

      const orientBtn = e.target.closest("[data-orientation]");
      if (orientBtn) {
        modal.querySelectorAll("[data-orientation]").forEach(b => b.classList.remove("active"));
        orientBtn.classList.add("active");
        this.currentOrientation = orientBtn.dataset.orientation;
        this.updatePreviewLayout();
      }

      const scaleBtn = e.target.closest("[data-scale]");
      if (scaleBtn) {
        modal.querySelectorAll("[data-scale]").forEach(b => b.classList.remove("active"));
        scaleBtn.classList.add("active");
        this.currentScale = scaleBtn.dataset.scale;
        this.updatePreviewLayout();
      }

      if (e.target.id === "pp-generate-pdf") {
        this.generatePDF();
      }
      if (e.target.id === "pp-print-direct") {
        this.printDirect();
      }
    });

    modal.querySelector("#pp-include-rbn")?.addEventListener("change", () => {
      this.includeRbn = modal.querySelector("#pp-include-rbn").checked;
      this.updatePreviewContent();
    });
    modal.querySelector("#pp-include-stats")?.addEventListener("change", () => {
      this.includeStats = modal.querySelector("#pp-include-stats").checked;
      this.updatePreviewContent();
    });
    modal.querySelector("#pp-include-comments")?.addEventListener("change", () => {
      this.includeComments = modal.querySelector("#pp-include-comments").checked;
      this.updatePreviewContent();
    });
  }

  open() {
    const modal = document.getElementById(this.modalId);
    if (!modal) return;

    this.updatePreviewContent();
    modal.hidden = false;
    modal.style.display = "flex";
    document.body.classList.add("modal-open");
  }

  close() {
    const modal = document.getElementById(this.modalId);
    if (!modal) return;

    modal.hidden = true;
    modal.style.display = "none";
    if (!document.querySelector(".overlay:not([hidden])")) {
      document.body.classList.remove("modal-open");
    }
  }

  updatePreviewLayout() {
    const page = document.getElementById("pp-page");
    if (!page) return;
    page.classList.toggle("portrait", this.currentOrientation === "portrait");
    page.classList.toggle("landscape", this.currentOrientation === "landscape");

    if (this.currentScale !== "fit") {
      const scale = parseInt(this.currentScale, 10) / 100;
      page.style.setProperty("--print-preview-scale", scale.toString());
    } else {
      page.style.removeProperty("--print-preview-scale");
    }
  }

  updatePreviewContent() {
    const content = document.getElementById("pp-page-content");
    if (!content) return;

    const title = document.getElementById("pp-title")?.value || "RadPlan Dienstplan";
    content.dataset.title = title;

    window.dispatchEvent(new CustomEvent("radplan-print-preview-generate", {
      detail: {
        includeRbn: this.includeRbn,
        includeStats: this.includeStats,
        includeComments: this.includeComments,
        targetElement: content
      }
    }));
  }

  async generatePDF() {
    window.dispatchEvent(new CustomEvent("radplan-print-preview-generate", {
      detail: {
        includeRbn: this.includeRbn,
        includeStats: this.includeStats,
        includeComments: this.includeComments,
        targetElement: document.getElementById("pp-page-content")
      }
    }));

    if (window.jspdf) {
      await this.generatePDFWithJsPDF();
    } else {
      this.printDirect();
    }
  }

  async generatePDFWithJsPDF() {
    try {
      const { jsPDF } = window.jspdf;
      const orientation = this.currentOrientation === "portrait" ? "p" : "l";
      const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });

      const title = document.getElementById("pp-title")?.value || "RadPlan Dienstplan";
      const author = document.getElementById("pp-author")?.value || "RadPlan";

      doc.setProperties({
        title: title,
        author: author,
        subject: "Dienstplan",
        creator: "RadPlan"
      });

      doc.setFontSize(16);
      doc.text(title, 15, 15);
      doc.setFontSize(10);
      doc.text(`Generiert am ${new Date().toLocaleDateString("de-DE")}`, 15, 22);

      const element = document.getElementById("pp-page-content");
      if (element && window.html2canvas) {
        const canvas = await html2canvas(element, {
          scale: 2,
          useCORS: true,
          logging: false
        });

        const imgData = canvas.toDataURL("image/png");
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 10;

        const availableWidth = pageWidth - 2 * margin;
        const availableHeight = pageHeight - 30;

        const imgRatio = canvas.width / canvas.height;
        let imgWidth = availableWidth;
        let imgHeight = imgWidth / imgRatio;

        if (imgHeight > availableHeight) {
          imgHeight = availableHeight;
          imgWidth = imgHeight * imgRatio;
        }

        doc.addImage(imgData, "PNG", margin, 28, imgWidth, imgHeight);
      }

      const filename = `radplan_${new Date().toISOString().slice(0, 10)}.pdf`;
      doc.save(filename);
    } catch (e) {
      console.error("PDF generation failed:", e);
      this.printDirect();
    }
  }

  printDirect() {
    window.print();
  }
}

export const printPreviewModal = new PrintPreviewModal();
