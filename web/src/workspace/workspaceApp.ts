import type { CanonicalDocument } from "../domain/schema.ts";
import type {
  EditableGedcomExport,
  GenealogyEditCommand,
  RelativeKind,
} from "../domain/editableDocument.ts";
import {
  calculatePosterPlan,
  createCompleteDiagramPdf,
  createCurrentViewPdf,
  createTiledPosterPdf,
  readPngDimensions,
  type ExportMetadata,
  type PaperOrientation,
  type PaperSizeId,
  type TiledPosterOptions,
} from "../exports/pdfExport.ts";
import { recommendMethods, type UserGoal } from "../recommendations/recommendMethods.ts";
import { applyDocumentTheme, getInitialTheme } from "../theme.js";
import { brandMark, icon } from "../ui/icons.ts";
import { bindFitToggleButton } from "../ui/fitToggleButton.ts";
import { siteHeader } from "../ui/siteHeader.ts";
import type {
  AppTheme,
  SelectedRecordDetails,
  VisualizationContext,
  VisualizationInstance,
  VisualizationProjectionSummary,
} from "../visualizations/adapter.ts";
import { getVisualizationAdapter } from "../visualizations/adapters.ts";
import { getMethodEvidence, getMethodExportSupport } from "../visualizations/methodEvidence.ts";
import { getMethodPerformance } from "../visualizations/methodPerformance.ts";
import {
  VISUALIZATION_METHODS,
  getVisualizationMethod,
  type VisualizationMethodDefinition,
} from "../visualizations/registry.ts";
import { DocumentWorkerClient } from "../workers/documentWorkerClient.ts";
import { loadAdamDocument, type LoadedAdamDocument } from "./adamDocument.ts";
import {
  cleanupExpiredLocalTreeDrafts,
  deleteLocalTree,
  deleteLocalTreeDraft,
  getLocalTree,
  getLocalTreeDraft,
  listLocalTrees,
  markLocalTreeOpened,
  renameLocalTree,
  saveLocalTree,
} from "./database.ts";
import { LocalTreeSession, type LocalTreeSessionStatus } from "./localTreeSession.ts";
import type {
  AdamDocumentManifest,
  LocalTreeDraftRecord,
  LocalTreeRecord,
  LocalTreeSummary,
} from "./models.ts";
import {
  readPersonInput,
  readRelativeOptions,
  renderNewTreeForm,
  renderPersonEditor,
  renderRelativeActions,
  renderRelativeEditor,
  showEditorError,
  type FamilyChoice,
} from "./personEditor.ts";
import { WorkspaceRecoveryStore } from "./recoveryPointer.ts";
import { ViewStateStore, type ViewStateScope } from "./viewStateStore.ts";

type Screen = "home" | "selection" | "interactive";
type SaveMode = "save" | "temporary";
type RelativeEditorReturn = "details" | "person-editor";

const LOCAL_TREE_PRIMARY_METHOD_ID = "relationship-nodes";

interface ActiveTree {
  kind: "adam" | "temporary" | "local";
  id: string;
  title: string;
  document: CanonicalDocument;
  sourceGedcom: string | null;
  sourceFileName: string | null;
  adamManifest: AdamDocumentManifest | null;
  session: LocalTreeSession | null;
}

const HOME_PREVIEW_METHOD_GROUPS = [
  {
    label: "Whole projection",
    methodIds: [
      "geneaquilt",
      "relationship-nodes",
      "pgraph",
      "bipartite-pgraph",
      "timenets",
      "sugiyama-genealogy",
      "force-genealogy",
      "force-radial",
    ],
  },
  {
    label: "Adam and Ya'akov focus",
    methodIds: [
      "pedigree",
      "hourglass",
      "dual-tree",
      "fan",
      "h-tree",
      "dual-outline",
      "area-adaptive",
      "fractal",
      "column-tree",
    ],
  },
] as const;

export class WorkspaceApp {
  readonly #root: HTMLElement;
  readonly #documentWorker = new DocumentWorkerClient();
  readonly #recoveryStore = new WorkspaceRecoveryStore();
  readonly #viewStateStore = new ViewStateStore();
  #theme: AppTheme = getInitialTheme();
  #adam: LoadedAdamDocument | null = null;
  #localTrees: LocalTreeSummary[] = [];
  #activeTree: ActiveTree | null = null;
  #recoverableDraft: LocalTreeDraftRecord | null = null;
  #sessionUnsubscribe: (() => void) | null = null;
  #screen: Screen = "home";
  #interactiveReturnScreen: Screen = "home";
  #selectedMethodId = "";
  #focalPersonId: string | null = null;
  #secondaryFocalPersonId: string | null = null;
  #selectedPersonId: string | null = null;
  #selectedDetails: SelectedRecordDetails | null = null;
  #goal: UserGoal = "whole-genealogy";
  #saveMode: SaveMode = "save";
  #currentView: VisualizationInstance | null = null;
  #currentProjectionSummary: VisualizationProjectionSummary | null = null;
  #mountGeneration = 0;
  #namesExpanded = true;
  #homePreviewMethodId = "geneaquilt";

  private constructor(root: HTMLElement) {
    this.#root = root;
    applyDocumentTheme(this.#theme);
  }

  static async start(root: HTMLElement): Promise<WorkspaceApp> {
    const app = new WorkspaceApp(root);
    app.#renderLoading();
    try {
      const [adam, localTrees] = await Promise.all([loadAdamDocument(), listLocalTrees()]);
      app.#adam = adam;
      app.#localTrees = localTrees;
      await cleanupExpiredLocalTreeDrafts();
      const draftPointer = app.#recoveryStore.activeDraft();
      app.#recoverableDraft = draftPointer ? await getLocalTreeDraft(draftPointer.token) : null;
      if (draftPointer && !app.#recoverableDraft) {
        app.#recoveryStore.setActiveDraft(null);
      }
      app.#renderHome();
    } catch (error) {
      app.#renderFatalError(error);
    }
    window.addEventListener(
      "pagehide",
      () => {
        app.#destroyView();
        app.#sessionUnsubscribe?.();
        app.#documentWorker.dispose();
      },
      { once: true },
    );
    return app;
  }

  #renderLoading(): void {
    this.#root.innerHTML = `
      <main class="loading-screen" aria-busy="true">
        ${brandMark()}
        <h1>Opening GeneaQuilt</h1>
        <p>Preparing Adam HaRishon's Tree locally…</p>
      </main>
    `;
  }

  #renderFatalError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.#root.innerHTML = `
      <main class="fatal-screen">
        ${brandMark()}
        <h1>GeneaQuilt could not open</h1>
        <p>${escapeHtml(message)}</p>
        <button class="button button-primary" type="button">Try again</button>
      </main>
    `;
    this.#root.querySelector("button")?.addEventListener("click", () => window.location.reload());
  }

  #renderHome(): void {
    const adam = this.#requireAdam();
    this.#destroyView();
    this.#releaseActiveSession();
    this.#activeTree = null;
    this.#screen = "home";
    const localRows = this.#localTrees.length
      ? this.#localTrees.map((tree) => localTreeRow(tree)).join("")
      : `<div class="local-empty">
          <p>No Local Trees yet.</p>
          <span>A GEDCOM can be kept here after GeneaQuilt analyzes it.</span>
        </div>`;

    this.#root.innerHTML = `
      <div class="workspace-page home-page">
        ${siteHeader({ activePage: "explore", theme: this.#theme })}
        <main class="home-main">
          <section class="home-intro" aria-labelledby="home-title">
            <p class="home-kicker">Private genealogy visualization</p>
            <h1 id="home-title">See the shape of a whole family story.</h1>
            <p>GeneaQuilt turns a GEDCOM family tree into clear, research-grounded views — entirely in your browser.</p>
            ${
              this.#recoverableDraft
                ? `
              <button class="draft-recovery" type="button">
                <span>${icon("undo")}</span>
                <span><strong>Continue “${escapeHtml(this.#recoverableDraft.title)}”</strong><small>Unsaved session from ${formatRelativeDate(this.#recoverableDraft.updatedAt)}</small></span>
                ${icon("chevron")}
              </button>
            `
                : ""
            }
            <div class="home-actions">
              <button class="button button-primary new-tree-button" type="button">
                ${icon("plus")}<span>Make a family tree</span>
              </button>
              <label class="button button-secondary file-button">
                ${icon("upload")}<span>Choose GEDCOM</span>
                <input class="gedcom-input" type="file" accept=".ged,.gedcom,.txt" />
              </label>
              <button class="button button-secondary adam-interactive-button" type="button">
                ${icon("method")}<span data-adam-button-label>Open ${escapeHtml(getVisualizationMethod(this.#homePreviewMethodId).shortName)}</span>
              </button>
            </div>
            <p class="privacy-line">${icon("lock")}<span>Family data stays on this device.</span></p>
          </section>

          <section class="home-preview card" aria-labelledby="adam-preview-title">
            <div class="preview-heading">
              <div class="preview-heading-copy">
                <span class="preview-eyebrow">Featured genealogy</span>
                <h2 id="adam-preview-title">${escapeHtml(adam.manifest.title)}</h2>
                <p data-preview-description>Explore the reviewed projection in ${escapeHtml(getVisualizationMethod(this.#homePreviewMethodId).shortName)}.</p>
              </div>
              <div class="preview-tools" aria-label="Preview controls">
                <label class="preview-method">
                  ${icon("method")}
                  <span>View as</span>
                  <select data-preview-method aria-label="Adam HaRishon preview visualization">
                    ${homePreviewMethodOptions(this.#homePreviewMethodId)}
                  </select>
                </label>
                <label class="preview-search">
                  ${icon("search")}
                  <span class="visually-hidden">Search preview</span>
                  <input type="search" placeholder="Search ${adam.homeProjection.people.length} people" />
                </label>
                <button class="icon-button preview-fit" type="button" aria-label="Fit preview" aria-pressed="false">${icon("fit")}</button>
              </div>
            </div>
            <div class="preview-canvas-shell">
              <div class="preview-canvas" data-preview-host aria-label="${escapeHtml(getVisualizationMethod(this.#homePreviewMethodId).name)} of ${escapeHtml(adam.manifest.title)}"></div>
              <div class="preview-loading" data-preview-loading role="status" aria-live="polite">Drawing ${escapeHtml(getVisualizationMethod(this.#homePreviewMethodId).shortName)}…</div>
              <div class="preview-search-results" data-preview-results hidden></div>
            </div>
            <div class="preview-caption">
              <span data-preview-summary><strong>${adam.homeProjection.people.length}</strong> of ${adam.document.people.length} people · ${adam.homeProjection.families.length} of ${adam.document.families.length} Families · ${escapeHtml(getVisualizationMethod(this.#homePreviewMethodId).shortName)} view</span>
              <details>
                <summary>Why this projection?</summary>
                <p data-preview-rule>${escapeHtml(adam.homeProjection.rule)}</p>
              </details>
            </div>
          </section>

          <details class="local-library card" ${this.#localTrees.length ? "open" : ""}>
            <summary>
              <span>${icon("folder")}<strong>Local Trees</strong></span>
              <span>${this.#localTrees.length} on this device</span>
            </summary>
            <div class="local-list">${localRows}</div>
          </details>
        </main>
      </div>
    `;

    this.#bindSharedHeader();
    this.#root
      .querySelector(".new-tree-button")
      ?.addEventListener("click", () => this.#openNewTreeDialog());
    this.#root
      .querySelector(".draft-recovery")
      ?.addEventListener("click", () => void this.#resumeDraft());
    this.#root
      .querySelector<HTMLInputElement>(".gedcom-input")
      ?.addEventListener("change", (event) => {
        void this.#openGedcomFile(event);
      });
    this.#root
      .querySelector(".adam-interactive-button")
      ?.addEventListener("click", () => this.#openAdamInteractive());
    this.#root
      .querySelector<HTMLSelectElement>("[data-preview-method]")
      ?.addEventListener("change", (event) => {
        this.#homePreviewMethodId = (event.currentTarget as HTMLSelectElement).value;
        void this.#mountHomePreview();
      });
    this.#bindLocalTreeActions();
    void this.#mountHomePreview();
  }

  #openNewTreeDialog(): void {
    const dialog = this.#openDialog(`
      <div class="dialog-icon">${icon("plus")}</div>
      <h2>Start a family tree</h2>
      <p>Your tree stays in this browser and saves automatically after each edit.</p>
      ${renderNewTreeForm()}
    `);
    const form = dialog.querySelector<HTMLFormElement>(".new-tree-form");
    form?.querySelector('[value="cancel"]')?.addEventListener("click", () => dialog.close());
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.#createNewTree(dialog, form);
    });
    form?.querySelector<HTMLInputElement>('[name="given-names"]')?.focus();
  }

  async #createNewTree(dialog: HTMLDialogElement, form: HTMLFormElement): Promise<void> {
    const submit = form.querySelector<HTMLButtonElement>('[type="submit"]');
    try {
      const title = new FormData(form).get("tree-title");
      if (typeof title !== "string" || !title.trim()) {
        throw new Error("Give this family tree a title.");
      }
      const firstPerson = readPersonInput(form);
      submit?.setAttribute("disabled", "");
      this.#showBusy("Creating your private Local Tree…");
      await this.#releaseActiveSessionAsync();
      const session = await LocalTreeSession.createLocal(
        {
          title: title.trim(),
          sourceFileName: `${fileStem(title)}.ged`,
          firstPerson,
        },
        this.#documentWorker,
      );
      const record = session.record;
      if (!record) {
        throw new Error("The new Local Tree was created without a local record.");
      }
      this.#activeTree = activeTreeFromLocalRecord(record, session);
      this.#attachActiveSession(session);
      this.#recoveryStore.setLastLocalTreeId(record.id);
      this.#recoveryStore.setActiveDraft(null);
      this.#recoverableDraft = null;
      this.#localTrees = await listLocalTrees();
      this.#selectedMethodId = LOCAL_TREE_PRIMARY_METHOD_ID;
      this.#focalPersonId = null;
      this.#secondaryFocalPersonId = null;
      this.#selectedPersonId = session.snapshot.document.people[0]?.id ?? null;
      this.#interactiveReturnScreen = "home";
      dialog.close();
      this.#renderInteractive();
    } catch (error) {
      this.#hideBusy();
      showEditorError(form, error);
      submit?.removeAttribute("disabled");
    }
  }

  async #resumeDraft(): Promise<void> {
    const draft = this.#recoverableDraft;
    if (!draft) {
      return;
    }
    this.#showBusy(`Continuing “${draft.title}”…`);
    try {
      await this.#releaseActiveSessionAsync();
      const session = await LocalTreeSession.openTemporary(
        {
          title: draft.title,
          sourceFileName: draft.sourceFileName,
          sourceGedcom: draft.sourceGedcom,
          draftToken: draft.token,
        },
        this.#documentWorker,
      );
      this.#activeTree = {
        kind: "temporary",
        id: `temporary-${draft.token}`,
        title: draft.title,
        document: session.snapshot.document,
        sourceGedcom: session.snapshot.source_gedcom,
        sourceFileName: draft.sourceFileName,
        adamManifest: null,
        session,
      };
      this.#attachActiveSession(session);
      this.#selectedMethodId = this.#preferredWholeTreeMethod();
      this.#focalPersonId = null;
      this.#secondaryFocalPersonId = null;
      this.#selectedPersonId = session.snapshot.document.people[0]?.id ?? null;
      this.#interactiveReturnScreen = "home";
      this.#renderInteractive();
    } catch (error) {
      this.#hideBusy();
      this.#showError("The previous session could not be continued", error);
    }
  }

  async #mountHomePreview(): Promise<void> {
    const adam = this.#requireAdam();
    const method = getVisualizationMethod(this.#homePreviewMethodId);
    const host = this.#root.querySelector<HTMLElement>("[data-preview-host]");
    if (!host || this.#screen !== "home") {
      return;
    }
    this.#destroyView();
    host.replaceChildren();
    host.setAttribute("aria-label", `${method.name} of ${adam.manifest.title}`);
    const loading = this.#root.querySelector<HTMLElement>("[data-preview-loading]");
    if (loading) {
      loading.hidden = false;
      loading.textContent = `Drawing ${method.shortName}…`;
    }
    const description = this.#root.querySelector<HTMLElement>("[data-preview-description]");
    if (description) {
      description.textContent = `Explore the reviewed projection in ${method.shortName}.`;
    }
    const interactiveLabel = this.#root.querySelector<HTMLElement>("[data-adam-button-label]");
    if (interactiveLabel) {
      interactiveLabel.textContent = `Open ${method.shortName}`;
    }
    const results = this.#root.querySelector<HTMLElement>("[data-preview-results]");
    if (results) {
      results.hidden = true;
      results.replaceChildren();
    }
    const search = this.#root.querySelector<HTMLInputElement>(".preview-search input");
    if (search) {
      search.value = "";
    }
    const previewDocument: CanonicalDocument = {
      ...adam.document,
      people: adam.homeProjection.people,
      families: adam.homeProjection.families,
    };
    try {
      const context: VisualizationContext = {
        document: method.id === "geneaquilt" ? adam.document : previewDocument,
        theme: this.#theme,
        focalPersonId: adam.manifest.anchors.yaakovPersonId,
        secondaryFocalPersonId: adam.manifest.anchors.adamPersonId,
        ...(method.id === "geneaquilt" ? { projection: adam.homeProjection } : {}),
      };
      const view = await this.#mountVisualization(method.id, host, context);
      view.select(adam.manifest.anchors.yaakovPersonId, true);
      if (loading) {
        loading.hidden = true;
      }
      const projectionSummary = view.projectionSummary();
      const previewSummary = this.#root.querySelector<HTMLElement>("[data-preview-summary]");
      if (previewSummary) {
        const sourceTreeContext =
          projectionSummary.totalPeople === adam.document.people.length
            ? ""
            : ` · ${formatNumber(adam.document.people.length)}-person source tree`;
        previewSummary.textContent = `${formatNumber(projectionSummary.visiblePeople)} of ${formatNumber(projectionSummary.totalPeople)} people · ${formatNumber(projectionSummary.visibleFamilies)} of ${formatNumber(projectionSummary.totalFamilies)} Families · ${projectionSummary.label}${sourceTreeContext}`;
      }
      const previewRule = this.#root.querySelector<HTMLElement>("[data-preview-rule]");
      if (previewRule) {
        previewRule.textContent = projectionSummary.rule;
      }
      const fitButton = this.#root.querySelector<HTMLButtonElement>(".preview-fit");
      if (fitButton) {
        bindFitToggleButton(fitButton, view, {
          fitLabel: "Fit preview",
          restoreLabel: "Restore previous preview view",
        });
      }
      if (search) {
        search.placeholder = `Search ${formatNumber(projectionSummary.visiblePeople)} visible people`;
        search.oninput = () => {
          const matches = view.search(search.value);
          if (!results) {
            return;
          }
          results.hidden = !search.value.trim();
          results.innerHTML = matches.length
            ? matches
                .slice(0, 8)
                .map(
                  (match) =>
                    `<button type="button" data-person-id="${escapeHtml(match.id)}"><strong>${escapeHtml(match.label)}</strong><span>${escapeHtml(match.kind)}</span></button>`,
                )
                .join("")
            : `<p>No matching people in this projection.</p>`;
        };
      }
      if (results) {
        results.onclick = (event) => {
          const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
            "[data-person-id]",
          );
          if (!button?.dataset.personId) {
            return;
          }
          view.select(button.dataset.personId, true);
          results.hidden = true;
        };
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      if (loading) {
        loading.textContent = error instanceof Error ? error.message : String(error);
      }
    }
  }

  async #openGedcomFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    this.#showBusy(`Analyzing ${file.name} locally…`);
    try {
      await this.#releaseActiveSessionAsync();
      const sourceGedcom = await file.text();
      const document = await this.#documentWorker.analyze(sourceGedcom);
      this.#activeTree = {
        kind: "temporary",
        id: `temporary-${crypto.randomUUID()}`,
        title: titleFromFilename(file.name),
        document,
        sourceGedcom,
        sourceFileName: file.name,
        adamManifest: null,
        session: null,
      };
      this.#goal = "whole-genealogy";
      this.#saveMode = "save";
      this.#selectedMethodId = "";
      this.#focalPersonId = null;
      this.#secondaryFocalPersonId = null;
      this.#selectedPersonId = null;
      this.#renderSelection();
    } catch (error) {
      this.#hideBusy();
      this.#showError("This GEDCOM could not be analyzed", error);
    }
  }

  #openAdamInteractive(): void {
    const adam = this.#requireAdam();
    this.#releaseActiveSession();
    this.#activeTree = {
      kind: "adam",
      id: adam.manifest.documentId,
      title: adam.manifest.title,
      document: adam.document,
      sourceGedcom: null,
      sourceFileName: null,
      adamManifest: adam.manifest,
      session: null,
    };
    this.#selectedMethodId = this.#homePreviewMethodId;
    this.#focalPersonId = adam.manifest.anchors.yaakovPersonId;
    this.#secondaryFocalPersonId = adam.manifest.anchors.adamPersonId;
    this.#selectedPersonId = adam.manifest.anchors.yaakovPersonId;
    this.#interactiveReturnScreen = "home";
    this.#renderInteractive();
  }

  #renderSelection(): void {
    const active = this.#requireActiveTree();
    this.#destroyView();
    this.#hideBusy();
    this.#screen = "selection";
    const analysis = active.document.analysis;
    const recommendations = recommendMethods(analysis, this.#goal);
    if (
      this.#selectedMethodId &&
      !recommendations.all.some(
        (recommendation) =>
          recommendation.method.id === this.#selectedMethodId && recommendation.selectable,
      )
    ) {
      this.#selectedMethodId = recommendations.recommended[0]?.method.id ?? "";
    }
    const recommendedCards = recommendations.recommended.length
      ? recommendations.recommended
          .map((recommendation, index) =>
            methodChoiceCard(
              recommendation.method,
              recommendation.reasons,
              recommendation.cautions,
              this.#selectedMethodId,
              index === 0 ? "Best fit" : "Recommended",
            ),
          )
          .join("")
      : `<div class="blocking-card">No method can open until the blocking relationship error is corrected.</div>`;
    const allMethods = recommendations.all
      .map((recommendation) =>
        methodListRow(
          recommendation.method,
          recommendation.selectable,
          this.#selectedMethodId,
          recommendation.cautions[0] ?? null,
        ),
      )
      .join("");
    const findings = analysis.findings.length
      ? analysis.findings.map(validationFinding).join("")
      : `<p class="analysis-clear">${icon("check")}No relationship conflicts were found.</p>`;
    const sourceProfile = active.document.source_profile;

    this.#root.innerHTML = `
      <div class="workspace-page selection-page">
        ${siteHeader({ activePage: "explore", theme: this.#theme })}
        <main class="selection-main">
          <ol class="flow-steps" aria-label="Open a GEDCOM steps">
            <li class="is-complete"><span>1</span>Choose GEDCOM</li>
            <li class="is-current"><span>2</span>Tree Analysis</li>
            <li class="is-current"><span>3</span>Choose a method</li>
            <li><span>4</span>Interactive Mode</li>
          </ol>

          <header class="selection-title">
            <button class="text-button selection-back" type="button">${icon("back")}Choose another GEDCOM</button>
            <h1>Choose how to see this tree</h1>
            <p>GeneaQuilt analyzed <strong>${escapeHtml(active.title)}</strong> on this device.</p>
          </header>

          ${analysis.blocks_interactive ? blockingAnalysisBanner(analysis.findings) : ""}

          <section class="analysis-panel card" aria-labelledby="analysis-title">
            <div class="section-heading">
              <div><h2 id="analysis-title">Tree Analysis</h2><p>A plain-language summary of the family tree file.</p></div>
              <span class="privacy-badge">${icon("lock")}Local analysis</span>
            </div>
            <div class="analysis-grid">
              ${analysisMetric(formatNumber(analysis.people), "People")}
              ${analysisMetric(formatNumber(analysis.families), "Families")}
              ${analysisMetric(formatNumber(analysis.disconnected_family_groups), "Family Groups")}
              ${analysisMetric(optionalNumber(analysis.generation_depth), "Generations")}
              ${analysisMetric(formatNumber(analysis.largest_sibling_group), "Largest sibling group")}
              ${analysisMetric(formatNumber(analysis.people_with_multiple_spouses), "People with multiple spouses")}
              ${analysisMetric(formatNumber(analysis.half_sibling_structures), "Half-sibling structures")}
              ${analysisMetric(`${analysis.date_coverage_percent.toFixed(1)}%`, "Date coverage")}
              ${analysisMetric(formatNumber(analysis.reconvergence_points), "Reconvergence points")}
            </div>
            <details class="analysis-details">
              <summary>Validation and source details</summary>
              <div class="finding-list">${findings}</div>
              <dl class="source-facts">
                <div><dt>GEDCOM version</dt><dd>${escapeHtml(sourceProfile.gedcom_version ?? "Not declared")}</dd></div>
                <div><dt>Created by</dt><dd>${escapeHtml(sourceProfile.producer ?? "Not declared")}</dd></div>
                <div><dt>Source lines analyzed locally</dt><dd>${formatNumber(sourceProfile.line_count)}</dd></div>
                <div><dt>Notes preserved in Source GEDCOM</dt><dd>${formatNumber(sourceProfile.note_records)}</dd></div>
                <div><dt>Source records preserved in Source GEDCOM</dt><dd>${formatNumber(sourceProfile.source_records)}</dd></div>
                <div><dt>Media records preserved in Source GEDCOM</dt><dd>${formatNumber(sourceProfile.object_records)}</dd></div>
                <div><dt>Other record types preserved</dt><dd>${escapeHtml(sourceProfileEntries(sourceProfile.other_record_types))}</dd></div>
                <div><dt>Custom tags preserved</dt><dd>${escapeHtml(sourceProfileEntries(sourceProfile.custom_tag_counts))}</dd></div>
              </dl>
            </details>
          </section>

          <section class="goal-panel" aria-labelledby="goal-title">
            <div><h2 id="goal-title">What do you want to understand?</h2><p>This changes the recommendation, not your tree.</p></div>
            <label>
              <span class="visually-hidden">Your goal</span>
              <select class="goal-select">
                ${goalOptions(this.#goal)}
              </select>
            </label>
          </section>

          <section class="recommended-methods" aria-labelledby="recommended-title">
            <div class="section-heading">
              <div><h2 id="recommended-title">Recommended for this tree</h2><p>Each reason comes from Tree Analysis and your goal.</p></div>
              <a class="button button-secondary" href="/visualizations.html">Compare all methods</a>
            </div>
            <div class="method-card-list">${recommendedCards}</div>
          </section>

          <details class="all-methods card">
            <summary><span><strong>All Visualization Methods</strong><small>${VISUALIZATION_METHODS.length} catalogued methods</small></span><span>Browse</span></summary>
            <div class="method-list">${allMethods}</div>
          </details>

          ${active.kind === "temporary" ? saveChoice(this.#saveMode) : savedTreeNotice(active)}

          <footer class="selection-footer">
            <p>${this.#selectedMethodId ? `Selected: <strong>${escapeHtml(getVisualizationMethod(this.#selectedMethodId).shortName)}</strong>` : "Select an Available Method to continue."}</p>
            <button class="button button-primary continue-button" type="button" ${!this.#selectedMethodId || analysis.blocks_interactive ? "disabled" : ""}>
              Open ${this.#selectedMethodId ? escapeHtml(getVisualizationMethod(this.#selectedMethodId).shortName) : "method"} in Interactive Mode
            </button>
          </footer>
        </main>
      </div>
    `;

    this.#bindSharedHeader();
    this.#root
      .querySelector(".selection-back")
      ?.addEventListener("click", () => this.#renderHome());
    this.#root
      .querySelector<HTMLSelectElement>(".goal-select")
      ?.addEventListener("change", (event) => {
        this.#goal = (event.currentTarget as HTMLSelectElement).value as UserGoal;
        this.#renderSelection();
      });
    this.#root.querySelectorAll<HTMLInputElement>('input[name="method"]')?.forEach((input) => {
      input.addEventListener("change", () => {
        this.#selectedMethodId = input.value;
        this.#renderSelection();
      });
    });
    this.#root.querySelectorAll<HTMLElement>("[data-method-details]").forEach((button) => {
      button.addEventListener("click", () =>
        this.#showMethodDetails(button.dataset.methodDetails ?? ""),
      );
    });
    this.#root.querySelectorAll<HTMLInputElement>('input[name="save-mode"]')?.forEach((input) => {
      input.addEventListener("change", () => {
        this.#saveMode = input.value as SaveMode;
      });
    });
    this.#root.querySelector(".continue-button")?.addEventListener("click", () => {
      void this.#continueToInteractive();
    });
  }

  async #continueToInteractive(): Promise<void> {
    let active = this.#requireActiveTree();
    if (!this.#selectedMethodId || active.document.analysis.blocks_interactive) {
      return;
    }
    const method = getVisualizationMethod(this.#selectedMethodId);
    if (!(await this.#ensureMethodFocus(method))) {
      return;
    }
    try {
      if (active.kind === "temporary" && this.#saveMode === "save") {
        this.#showBusy("Saving this Local Tree on your device…");
        const sourceGedcom = active.session?.snapshot.source_gedcom ?? active.sourceGedcom ?? "";
        const document = active.session?.snapshot.document ?? active.document;
        const draftToken = active.session?.draft?.token ?? null;
        await this.#releaseActiveSessionAsync();
        const record = await saveLocalTree({
          title: active.title,
          sourceFileName: active.sourceFileName ?? `${active.title}.ged`,
          sourceGedcom,
          document,
          gedcomVersion: document.source_profile.gedcom_version,
        });
        if (draftToken) {
          await deleteLocalTreeDraft(draftToken);
        }
        this.#recoveryStore.setActiveDraft(null);
        this.#recoverableDraft = null;
        const session = await LocalTreeSession.openLocal(record, this.#documentWorker);
        this.#activeTree = activeTreeFromLocalRecord(record, session);
        this.#attachActiveSession(session);
        this.#recoveryStore.setLastLocalTreeId(record.id);
        this.#localTrees = await listLocalTrees();
        active = this.#requireActiveTree();
      } else if (active.kind === "temporary" && !active.session) {
        const session = await LocalTreeSession.openTemporary(
          {
            title: active.title,
            sourceFileName: active.sourceFileName ?? `${fileStem(active.title)}.ged`,
            sourceGedcom: active.sourceGedcom ?? "",
          },
          this.#documentWorker,
        );
        active.session = session;
        this.#attachActiveSession(session);
        this.#syncActiveFromSession();
      } else if (active.kind === "local" && !active.session) {
        const record = await getLocalTree(active.id);
        if (!record) {
          throw new Error("This Local Tree no longer exists on this device.");
        }
        const session = await LocalTreeSession.openLocal(record, this.#documentWorker);
        active.session = session;
        this.#attachActiveSession(session);
        this.#syncActiveFromSession();
      }
    } catch (error) {
      this.#hideBusy();
      this.#showError("This Local Tree could not be opened for editing", error);
      return;
    }
    this.#interactiveReturnScreen = "selection";
    this.#renderInteractive();
  }

  #renderInteractive(): void {
    const active = this.#requireActiveTree();
    const method = getVisualizationMethod(this.#selectedMethodId);
    if (method.availability !== "available") {
      this.#showError("Method not available", `${method.name} is still in development.`);
      return;
    }
    this.#destroyView();
    this.#hideBusy();
    this.#screen = "interactive";
    const counts = `${formatNumber(active.document.people.length)} people · ${formatNumber(active.document.families.length)} Families`;
    const adamCredit = active.adamManifest
      ? `${active.adamManifest.creator.credit} · version ${active.adamManifest.version} · GeneaQuilt`
      : `${active.title} · GeneaQuilt`;

    this.#root.innerHTML = `
      <main class="interactive-mode" data-theme="${this.#theme}" data-method="${escapeHtml(method.id)}">
        <div class="interactive-stage" data-interactive-host aria-label="${escapeHtml(method.name)} visualization" aria-describedby="interactive-text-summary"></div>
        <header class="glass-toolbar interactive-topbar">
          <button class="icon-button interactive-back" type="button" aria-label="Back">${icon("back")}</button>
          <a class="interactive-brand" href="/" aria-label="GeneaQuilt home">${brandMark()}<span>GeneaQuilt</span></a>
          <span class="interactive-divider"></span>
          <strong class="interactive-title" title="${escapeHtml(active.title)}">${escapeHtml(active.title)}</strong>
          ${
            active.session
              ? `<div class="interactive-history" aria-label="Editing history">
                  <span class="interactive-save-status" data-status="${active.session.status.status}" role="status" aria-live="polite">${escapeHtml(sessionStatusLabel(active.session.status, active.kind === "temporary"))}</span>
                  <button class="icon-button history-undo" type="button" aria-label="Undo last genealogy edit" ${active.session.canUndo ? "" : "disabled"}>${icon("undo")}</button>
                  <button class="icon-button history-redo" type="button" aria-label="Redo genealogy edit" ${active.session.canRedo ? "" : "disabled"}>${icon("redo")}</button>
                </div>`
              : ""
          }
          <label class="method-switcher">
            ${icon("method")}<span class="visually-hidden">Visualization Method</span>
            <select aria-label="Visualization Method">
              ${VISUALIZATION_METHODS.filter((candidate) => candidate.availability === "available")
                .map(
                  (candidate) =>
                    `<option value="${candidate.id}" ${candidate.id === method.id ? "selected" : ""}>${escapeHtml(candidate.shortName)}</option>`,
                )
                .join("")}
            </select>
          </label>
          <div class="interactive-search-wrap">
            <label class="interactive-search">${icon("search")}<span class="visually-hidden">Search this tree</span><input type="search" placeholder="Search ${formatNumber(active.document.people.length)} people" /></label>
            <div class="interactive-search-results" hidden></div>
          </div>
          <button class="button toolbar-button method-details-button" type="button" aria-label="Method details">${icon("info")}<span>Method details</span></button>
          <button class="button toolbar-button export-button" type="button" aria-label="Export and share">${icon("export")}<span>Export &amp; Share</span></button>
          <button class="icon-button interactive-more" type="button" aria-label="More options">${icon("menu")}</button>
          <button class="icon-button interactive-theme" type="button" aria-label="${this.#theme === "dark" ? "Use light appearance" : "Use dark appearance"}">${icon(this.#theme === "dark" ? "sun" : "moon")}</button>
        </header>

        <div class="glass-toolbar interactive-status">${counts}<span>Preparing ${escapeHtml(method.shortName)}…</span></div>

        <div class="glass-toolbar interactive-zoom" aria-label="View controls">
          <button class="icon-button zoom-out" type="button" aria-label="Zoom out">${icon("minus")}</button>
          <button class="icon-button zoom-in" type="button" aria-label="Zoom in">${icon("plus")}</button>
          <button class="button toolbar-button fit-view" type="button" aria-label="Fit diagram" aria-pressed="false">${icon("fit")}<span>Fit</span></button>
        </div>
        <div class="glass-toolbar interactive-options">
          <button class="button toolbar-button clear-focus" type="button">${icon("focus")}<span>Clear selection</span></button>
          ${method.scope === "whole" || method.scope === "aggregate" ? "" : `<button class="button toolbar-button change-focus" type="button">${icon("search")}<span>Change focus</span></button>`}
          <button class="button toolbar-button names-toggle" type="button"><span>Names: ${this.#namesExpanded ? "Expanded" : "Compact"}</span></button>
          <button class="button toolbar-button method-tools-button" type="button" hidden>${icon("method")}<span>Method tools</span></button>
        </div>
        <p class="interactive-privacy">${icon("lock")}All family data stays on this device.</p>

        <aside class="record-drawer" aria-live="polite" hidden>
          <button class="icon-button drawer-close" type="button" aria-label="Close details">${icon("close")}</button>
          <div data-record-details></div>
        </aside>

        <section class="visually-hidden" id="interactive-text-summary">
          <h2>${escapeHtml(method.name)} text summary</h2>
          <p data-interactive-text-summary>${escapeHtml(method.bestUse)} Search for a person to read their recorded parents, husbands or wives, and children without relying on the drawing.</p>
        </section>

        <div class="export-credit" aria-hidden="true">${escapeHtml(adamCredit)}</div>
      </main>
    `;

    this.#root.querySelector(".interactive-back")?.addEventListener("click", () => {
      if (this.#interactiveReturnScreen === "selection" && this.#activeTree?.kind !== "adam") {
        this.#renderSelection();
      } else {
        this.#renderHome();
      }
    });
    this.#root.querySelector(".interactive-theme")?.addEventListener("click", () => {
      this.#toggleTheme();
      this.#currentView?.setTheme(this.#theme);
      const main = this.#root.querySelector<HTMLElement>(".interactive-mode");
      const button = this.#root.querySelector<HTMLButtonElement>(".interactive-theme");
      if (main) {
        main.dataset.theme = this.#theme;
      }
      if (button) {
        button.ariaLabel = this.#theme === "dark" ? "Use light appearance" : "Use dark appearance";
        button.innerHTML = icon(this.#theme === "dark" ? "sun" : "moon");
      }
    });
    this.#root
      .querySelector<HTMLSelectElement>(".method-switcher select")
      ?.addEventListener("change", (event) => {
        const select = event.currentTarget as HTMLSelectElement;
        void this.#switchInteractiveMethod(select.value, select);
      });
    this.#root
      .querySelector(".method-details-button")
      ?.addEventListener("click", () => this.#showMethodDetails(method.id));
    this.#root.querySelector(".history-undo")?.addEventListener("click", () => {
      void this.#runHistory("undo");
    });
    this.#root.querySelector(".history-redo")?.addEventListener("click", () => {
      void this.#runHistory("redo");
    });
    this.#root.querySelector(".export-button")?.addEventListener("click", () => {
      this.#showInteractiveExportDialog();
    });
    this.#root.querySelector(".interactive-more")?.addEventListener("click", () => {
      this.#showInteractiveMoreDialog();
    });
    this.#root.querySelector(".change-focus")?.addEventListener("click", () => {
      void this.#changeInteractiveFocus();
    });
    this.#root.querySelector(".drawer-close")?.addEventListener("click", () => {
      if (this.#currentView) {
        this.#currentView.clearSelection();
      } else {
        this.#renderRecordDetails(null);
      }
    });
    void this.#mountInteractiveView();
  }

  async #mountInteractiveView(): Promise<void> {
    const active = this.#requireActiveTree();
    const host = this.#root.querySelector<HTMLElement>("[data-interactive-host]");
    if (!host || this.#screen !== "interactive") {
      return;
    }
    this.#showBusy(`Opening ${getVisualizationMethod(this.#selectedMethodId).shortName}…`);
    try {
      const context: VisualizationContext = {
        document: active.document,
        theme: this.#theme,
        onSelectionChange: (details) => this.#renderRecordDetails(details),
      };
      if (active.sourceGedcom) {
        context.sourceGedcom = active.sourceGedcom;
      }
      if (this.#focalPersonId) {
        context.focalPersonId = this.#focalPersonId;
      }
      if (this.#secondaryFocalPersonId) {
        context.secondaryFocalPersonId = this.#secondaryFocalPersonId;
      }
      const view = await this.#mountVisualization(this.#selectedMethodId, host, context);
      const scope = this.#viewStateScope(view.methodId);
      const savedViewState = scope ? this.#viewStateStore.load(scope) : null;
      const restoredViewState = savedViewState ? view.restoreViewState(savedViewState) : false;
      this.#hideBusy();
      const projectionSummary = view.projectionSummary();
      this.#currentProjectionSummary = projectionSummary;
      this.#renderProjectionStatus(projectionSummary);
      this.#restoreSelectedPerson(view, active, !restoredViewState);
      this.#recoveryStore.setLastVisualizationMethod(view.methodId);
      this.#renderSessionStatus();
      this.#root.querySelector(".zoom-in")?.addEventListener("click", () => view.zoomBy(1.22));
      this.#root.querySelector(".zoom-out")?.addEventListener("click", () => view.zoomBy(0.82));
      const fitButton = this.#root.querySelector<HTMLButtonElement>(".fit-view");
      if (fitButton) {
        bindFitToggleButton(fitButton, view, {
          fitLabel: "Fit diagram",
          restoreLabel: "Restore previous view",
          fitText: "Fit",
          restoreText: "Restore",
        });
      }
      this.#root
        .querySelector(".clear-focus")
        ?.addEventListener("click", () => view.clearSelection());
      this.#root.querySelector(".names-toggle")?.addEventListener("click", () => {
        this.#namesExpanded = !this.#namesExpanded;
        view.setExpandedNames(this.#namesExpanded);
        const label = this.#root.querySelector(".names-toggle span");
        if (label) {
          label.textContent = `Names: ${this.#namesExpanded ? "Expanded" : "Compact"}`;
        }
      });
      const methodToolsButton = this.#root.querySelector<HTMLButtonElement>(".method-tools-button");
      if (methodToolsButton && view.renderMethodTools) {
        methodToolsButton.hidden = false;
        methodToolsButton.addEventListener("click", () => this.#showMethodTools());
      }
      this.#bindInteractiveSearch(view);
    } catch (error) {
      this.#hideBusy();
      this.#showError("Interactive Mode could not open", error);
    }
  }

  #bindInteractiveSearch(view: VisualizationInstance): void {
    const input = this.#root.querySelector<HTMLInputElement>(".interactive-search input");
    const results = this.#root.querySelector<HTMLElement>(".interactive-search-results");
    input?.addEventListener("input", () => {
      const matches = view.search(input.value);
      if (!results) {
        return;
      }
      results.hidden = !input.value.trim();
      results.innerHTML = matches.length
        ? matches
            .slice(0, 12)
            .map(
              (match) =>
                `<button type="button" data-person-id="${escapeHtml(match.id)}"><strong>${escapeHtml(match.label)}</strong><span>${match.kind}</span></button>`,
            )
            .join("")
        : `<p>No matches.</p>`;
    });
    results?.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-person-id]");
      if (!button?.dataset.personId) {
        return;
      }
      view.select(button.dataset.personId, true);
      results.hidden = true;
    });
  }

  #renderRecordDetails(details: SelectedRecordDetails | null): void {
    this.#selectedDetails = details;
    this.#selectedPersonId = details?.kind === "person" ? details.id : null;
    const drawer = this.#root.querySelector<HTMLElement>(".record-drawer");
    const body = this.#root.querySelector<HTMLElement>("[data-record-details]");
    if (!drawer || !body) {
      return;
    }
    if (!details) {
      drawer.hidden = true;
      body.replaceChildren();
      return;
    }
    drawer.hidden = false;
    const editable = details.kind === "person" && Boolean(this.#activeTree?.session);
    body.innerHTML = `
      <span class="record-kind">${escapeHtml(details.kind)}</span>
      <h2>${escapeHtml(details.label)}</h2>
      ${formatDateRange(details.date_start, details.date_end)}
      ${relationshipSection("Parents", details.parents)}
      ${relationshipSection("Husbands and wives", details.spouses)}
      ${relationshipSection("Children", details.children)}
      ${editable ? renderRelativeActions(details.parents.length > 0) : ""}
      <div class="drawer-actions">
        <button class="button center-record" type="button">${icon("focus")}Center</button>
        ${editable ? `<button class="button button-primary edit-record" type="button">${icon("edit")}Edit person</button>` : ""}
      </div>
    `;
    body.querySelector(".center-record")?.addEventListener("click", () => {
      this.#currentView?.select(details.id, true);
    });
    body.querySelector(".edit-record")?.addEventListener("click", () => {
      void this.#openPersonEditor(details.id);
    });
    this.#bindRelativeActions(body, details.id);
  }

  #bindRelativeActions(
    container: ParentNode,
    personId: string,
    returnTo: RelativeEditorReturn = "details",
  ): void {
    container.querySelectorAll<HTMLButtonElement>(".add-relative").forEach((button) => {
      button.addEventListener("click", () => {
        const relationship = button.dataset.relationship;
        if (isRelativeKind(relationship)) {
          void this.#openRelativeEditor(personId, relationship, returnTo);
        }
      });
    });
  }

  async #openPersonEditor(personId: string): Promise<void> {
    const session = this.#activeTree?.session;
    const body = this.#root.querySelector<HTMLElement>("[data-record-details]");
    if (!session || !body) {
      return;
    }
    body.setAttribute("aria-busy", "true");
    try {
      const person = await session.person(personId);
      if (this.#selectedPersonId !== personId || !body.isConnected) {
        return;
      }
      body.removeAttribute("aria-busy");
      body.innerHTML = renderPersonEditor(person);
      const form = body.querySelector<HTMLFormElement>(".person-editor-form");
      form?.querySelector(".editor-cancel")?.addEventListener("click", () => {
        this.#renderRecordDetails(this.#selectedDetails);
      });
      form?.querySelector(".delete-person")?.addEventListener("click", () => {
        this.#confirmDeletePerson(person);
      });
      if (form) {
        this.#bindRelativeActions(form, person.id, "person-editor");
      }
      form?.addEventListener("submit", (event) => {
        event.preventDefault();
        void this.#submitPersonEdit(form, person.id);
      });
      form?.querySelector<HTMLInputElement>('[name="given-names"]')?.focus();
    } catch (error) {
      body.removeAttribute("aria-busy");
      this.#showError("This person could not be opened for editing", error);
    }
  }

  async #submitPersonEdit(form: HTMLFormElement, personId: string): Promise<void> {
    const submit = form.querySelector<HTMLButtonElement>('[type="submit"]');
    try {
      const person = readPersonInput(form);
      submit?.setAttribute("disabled", "");
      await this.#commitGenealogyEdit({
        type: "update_person",
        person_id: personId,
        person,
      });
    } catch (error) {
      showEditorError(form, error);
      submit?.removeAttribute("disabled");
    }
  }

  async #openRelativeEditor(
    personId: string,
    relationship: RelativeKind,
    returnTo: RelativeEditorReturn = "details",
  ): Promise<void> {
    const session = this.#activeTree?.session;
    const body = this.#root.querySelector<HTMLElement>("[data-record-details]");
    if (!session || !body) {
      return;
    }
    body.setAttribute("aria-busy", "true");
    try {
      const primaryPerson = await session.person(personId);
      if (this.#selectedPersonId !== personId || !body.isConnected) {
        return;
      }
      body.removeAttribute("aria-busy");
      body.innerHTML = renderRelativeEditor({
        relationship,
        primaryPerson,
        familyChoices: this.#familyChoices(primaryPerson, relationship),
      });
      const form = body.querySelector<HTMLFormElement>(".relative-editor-form");
      form?.querySelector(".editor-cancel")?.addEventListener("click", () => {
        if (returnTo === "person-editor") {
          void this.#openPersonEditor(personId);
        } else {
          this.#renderRecordDetails(this.#selectedDetails);
        }
      });
      form?.addEventListener("submit", (event) => {
        event.preventDefault();
        void this.#submitRelative(form, personId, relationship);
      });
      form?.querySelector<HTMLInputElement>('[name="given-names"]')?.focus();
    } catch (error) {
      body.removeAttribute("aria-busy");
      this.#showError("The relative editor could not open", error);
    }
  }

  async #submitRelative(
    form: HTMLFormElement,
    personId: string,
    relationship: RelativeKind,
  ): Promise<void> {
    const submit = form.querySelector<HTMLButtonElement>('[type="submit"]');
    try {
      const person = readPersonInput(form);
      const options = readRelativeOptions(form);
      submit?.setAttribute("disabled", "");
      await this.#commitGenealogyEdit({
        type: "add_relative",
        person_id: personId,
        relationship,
        person,
        pedigree: options.pedigree,
        family_id: options.familyId,
        primary_role: options.primaryRole,
      });
    } catch (error) {
      showEditorError(form, error);
      submit?.removeAttribute("disabled");
    }
  }

  #familyChoices(
    person: Awaited<ReturnType<LocalTreeSession["person"]>>,
    relationship: RelativeKind,
  ): FamilyChoice[] {
    if (relationship === "spouse") {
      return [];
    }
    const active = this.#requireActiveTree();
    const familyIds =
      relationship === "child" ? person.spouse_family_ids : person.parent_family_ids;
    const peopleById = new Map(
      active.document.people.map((candidate) => [candidate.id, candidate.display_name]),
    );
    return familyIds.flatMap((familyId) => {
      const family = active.document.families.find((candidate) => candidate.id === familyId);
      if (!family) {
        return [];
      }
      const names = [family.husband_id, family.wife_id]
        .filter((id): id is string => Boolean(id))
        .map((id) => peopleById.get(id) ?? id);
      return [
        {
          id: family.id,
          label: names.length ? names.join(" & ") : `Family ${family.id}`,
        },
      ];
    });
  }

  async #commitGenealogyEdit(command: GenealogyEditCommand): Promise<void> {
    const active = this.#requireActiveTree();
    const session = active.session;
    if (!session) {
      throw new Error("This genealogy is read-only.");
    }
    const beforeRevision = session.snapshot.revision;
    const beforePersonIds = new Set(session.snapshot.document.people.map((person) => person.id));
    try {
      const snapshot = await session.apply(command);
      this.#syncActiveFromSession();
      if (active.kind === "local") {
        this.#localTrees = await listLocalTrees();
      }
      if (command.type === "add_relative") {
        this.#selectedPersonId =
          snapshot.document.people.find((person) => !beforePersonIds.has(person.id))?.id ??
          command.person_id;
      } else if (command.type === "delete_person") {
        this.#selectedPersonId = snapshot.document.people[0]?.id ?? null;
      } else {
        this.#selectedPersonId = command.person_id;
      }
      this.#renderInteractive();
    } catch (error) {
      this.#syncActiveFromSession();
      if (session.snapshot.revision !== beforeRevision) {
        this.#renderInteractive();
        this.#showError(
          "The edit is open but not safely saved",
          `${error instanceof Error ? error.message : String(error)} Export a GEDCOM before closing this tab.`,
        );
        return;
      }
      throw error;
    }
  }

  #confirmDeletePerson(person: Awaited<ReturnType<LocalTreeSession["person"]>>): void {
    const active = this.#requireActiveTree();
    if (active.document.people.length <= 1) {
      this.#showError(
        "Keep one starting person",
        "Add another person before deleting the only person in this family tree.",
      );
      return;
    }
    const dialog = this.#openDialog(`
      <div class="dialog-icon danger">${icon("trash")}</div>
      <h2>Delete “${escapeHtml(person.display_name)}”?</h2>
      <p>The Person Record and its links will be removed. A Family Record with no remaining parent is removed too. You can undo this after deletion.</p>
      <div class="dialog-actions">
        <button class="button" value="cancel" type="button">Cancel</button>
        <button class="button button-danger confirm-delete-person" type="button">Delete person</button>
      </div>
    `);
    dialog.querySelector('[value="cancel"]')?.addEventListener("click", () => dialog.close());
    dialog.querySelector(".confirm-delete-person")?.addEventListener("click", () => {
      dialog.close();
      void this.#commitGenealogyEdit({
        type: "delete_person",
        person_id: person.id,
      }).catch((error) => this.#showError("This person could not be deleted", error));
    });
  }

  async #runHistory(direction: "undo" | "redo"): Promise<void> {
    const session = this.#activeTree?.session;
    if (!session) {
      return;
    }
    this.#showBusy(
      direction === "undo" ? "Undoing the last genealogy edit…" : "Redoing the genealogy edit…",
    );
    try {
      await (direction === "undo" ? session.undo() : session.redo());
      this.#syncActiveFromSession();
      const people = session.snapshot.document.people;
      if (!people.some((person) => person.id === this.#selectedPersonId)) {
        this.#selectedPersonId = people[0]?.id ?? null;
      }
      if (this.#activeTree?.kind === "local") {
        this.#localTrees = await listLocalTrees();
      }
      this.#renderInteractive();
    } catch (error) {
      this.#hideBusy();
      this.#showError(
        direction === "undo" ? "The edit could not be undone" : "The edit could not be redone",
        error,
      );
    }
  }

  #restoreSelectedPerson(view: VisualizationInstance, active: ActiveTree, center = true): void {
    if (!this.#selectedPersonId) return;
    const person = active.document.people.find(
      (candidate) => candidate.id === this.#selectedPersonId,
    );
    if (!person) {
      this.#selectedPersonId = null;
      return;
    }
    const visible = view.search(person.display_name).some((result) => result.id === person.id);
    view.search("");
    if (visible) {
      view.select(person.id, center);
    }
  }

  async #mountVisualization(
    methodId: string,
    host: HTMLElement,
    context: VisualizationContext,
  ): Promise<VisualizationInstance> {
    const generation = ++this.#mountGeneration;
    const adapter = getVisualizationAdapter(methodId);
    const view = await adapter.mount(host, context);
    if (generation !== this.#mountGeneration) {
      view.destroy();
      throw new DOMException("The previous visualization was replaced.", "AbortError");
    }
    this.#currentView = view;
    return view;
  }

  #renderProjectionStatus(summary: ReturnType<VisualizationInstance["projectionSummary"]>): void {
    const status = this.#root.querySelector<HTMLElement>(".interactive-status");
    if (!status) {
      return;
    }
    const counts = `${formatNumber(summary.visiblePeople)} of ${formatNumber(summary.totalPeople)} people · ${formatNumber(summary.visibleFamilies)} of ${formatNumber(summary.totalFamilies)} Families`;
    const label = document.createElement("span");
    label.textContent = summary.label;
    status.replaceChildren(document.createTextNode(counts), label);
    status.title = summary.rule;
    status.setAttribute("aria-label", `${counts}. ${summary.label}. ${summary.rule}`);
    const textSummary = this.#root.querySelector<HTMLElement>("[data-interactive-text-summary]");
    if (textSummary) {
      textSummary.textContent = `${getVisualizationMethod(this.#selectedMethodId).name}. ${counts}. ${summary.label}. ${summary.rule} Search for a person to read their recorded parents, husbands or wives, and children without relying on the drawing.`;
    }
    const search = this.#root.querySelector<HTMLInputElement>(".interactive-search input");
    if (search) {
      search.placeholder = `Search ${formatNumber(summary.visiblePeople)} visible people`;
    }
  }

  async #switchInteractiveMethod(methodId: string, select: HTMLSelectElement): Promise<void> {
    const previousMethodId = this.#selectedMethodId;
    const method = getVisualizationMethod(methodId);
    this.#selectedMethodId = methodId;
    if (!(await this.#ensureMethodFocus(method))) {
      this.#selectedMethodId = previousMethodId;
      select.value = previousMethodId;
      return;
    }
    this.#recoveryStore.setLastVisualizationMethod(methodId);
    this.#renderInteractive();
  }

  async #ensureMethodFocus(method: VisualizationMethodDefinition): Promise<boolean> {
    if (method.scope === "whole" || method.scope === "aggregate") {
      return true;
    }
    const active = this.#requireActiveTree();
    if (
      !this.#focalPersonId ||
      !active.document.people.some((person) => person.id === this.#focalPersonId)
    ) {
      const copy = focusPickerCopy(method.id);
      const selected = await this.#choosePerson(copy.title, copy.prompt, active.document.people);
      if (!selected) {
        return false;
      }
      this.#focalPersonId = selected;
      this.#secondaryFocalPersonId = null;
    }
    if (method.id !== "dual-tree") {
      return true;
    }
    const candidates = ancestorCandidates(active.document, this.#focalPersonId);
    if (!candidates.length) {
      this.#showError(
        "No recorded ancestor end",
        "The chosen descendant end has no recorded ancestor who can form a dual-tree axis.",
      );
      return false;
    }
    if (
      !this.#secondaryFocalPersonId ||
      !candidates.some((person) => person.id === this.#secondaryFocalPersonId)
    ) {
      const focusName =
        active.document.people.find((person) => person.id === this.#focalPersonId)?.display_name ??
        "the descendant end";
      const selected = await this.#choosePerson(
        "Choose the ancestor end",
        `Choose a recorded ancestor of ${focusName}. The path between these two people becomes the dual tree's emphasized axis.`,
        candidates,
      );
      if (!selected) {
        return false;
      }
      this.#secondaryFocalPersonId = selected;
    }
    return true;
  }

  async #changeInteractiveFocus(): Promise<void> {
    const method = getVisualizationMethod(this.#selectedMethodId);
    if (method.scope === "whole" || method.scope === "aggregate") {
      return;
    }
    const active = this.#requireActiveTree();
    const previousFocalPersonId = this.#focalPersonId;
    const previousSecondaryFocalPersonId = this.#secondaryFocalPersonId;
    const copy = focusPickerCopy(method.id);
    const selected = await this.#choosePerson(copy.title, copy.prompt, active.document.people);
    if (!selected) {
      return;
    }
    this.#focalPersonId = selected;
    this.#secondaryFocalPersonId = null;
    if (!(await this.#ensureMethodFocus(method))) {
      this.#focalPersonId = previousFocalPersonId;
      this.#secondaryFocalPersonId = previousSecondaryFocalPersonId;
      return;
    }
    this.#renderInteractive();
  }

  #choosePerson(
    title: string,
    prompt: string,
    candidates: ReadonlyArray<CanonicalDocument["people"][number]>,
  ): Promise<string | null> {
    const dialog = this.#openDialog(`
      <div class="dialog-icon">${icon("search")}</div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(prompt)}</p>
      <label class="person-picker-search">
        ${icon("search")}<span class="visually-hidden">Search people</span>
        <input type="search" autocomplete="off" placeholder="Type a person's name" />
      </label>
      <div class="person-picker-results" role="listbox" aria-label="Matching people"><p>Start typing to find a person.</p></div>
      <div class="dialog-actions"><button class="button" value="cancel" type="button">Cancel</button></div>
    `);
    const input = dialog.querySelector<HTMLInputElement>(".person-picker-search input");
    const results = dialog.querySelector<HTMLElement>(".person-picker-results");
    let chosenPersonId: string | null = null;
    const renderResults = (): void => {
      if (!input || !results) {
        return;
      }
      const query = input.value.trim().toLocaleLowerCase();
      if (!query) {
        results.innerHTML = `<p>Start typing to search ${formatNumber(candidates.length)} possible ${candidates.length === 1 ? "person" : "people"}.</p>`;
        return;
      }
      const matches = [...candidates]
        .filter(
          (person) =>
            person.display_name.toLocaleLowerCase().includes(query) ||
            person.id.toLocaleLowerCase().includes(query),
        )
        .sort(
          (left, right) =>
            left.display_name.localeCompare(right.display_name) || left.id.localeCompare(right.id),
        )
        .slice(0, 20);
      results.innerHTML = matches.length
        ? matches
            .map(
              (person) =>
                `<button type="button" role="option" data-focus-person="${escapeHtml(person.id)}"><strong>${escapeHtml(person.display_name)}</strong><span>${escapeHtml(person.sex ?? "Sex not recorded")}</span></button>`,
            )
            .join("")
        : `<p>No matching people.</p>`;
    };
    input?.addEventListener("input", renderResults);
    results?.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-focus-person]",
      );
      if (!button?.dataset.focusPerson) {
        return;
      }
      chosenPersonId = button.dataset.focusPerson;
      dialog.close();
    });
    dialog.querySelector('[value="cancel"]')?.addEventListener("click", () => dialog.close());
    input?.focus();
    return new Promise((resolve) => {
      dialog.addEventListener("close", () => resolve(chosenPersonId), { once: true });
    });
  }

  #destroyView(): void {
    this.#mountGeneration += 1;
    document.querySelector<HTMLDialogElement>(".method-tools-dialog")?.close();
    if (this.#screen === "interactive" && this.#currentView) {
      const scope = this.#viewStateScope(this.#currentView.methodId);
      if (scope) {
        try {
          this.#viewStateStore.save(scope, this.#currentView.captureViewState());
        } catch (error) {
          console.warn("GeneaQuilt could not preserve this View State.", error);
        }
      }
    }
    this.#currentView?.destroy();
    this.#currentView = null;
    this.#currentProjectionSummary = null;
  }

  #viewStateScope(methodId = this.#selectedMethodId): ViewStateScope | null {
    const active = this.#activeTree;
    if (!active || !methodId) {
      return null;
    }
    return {
      treeId: active.id,
      methodId,
      focalPersonId: this.#focalPersonId,
      secondaryFocalPersonId: this.#secondaryFocalPersonId,
    };
  }

  #attachActiveSession(session: LocalTreeSession): void {
    this.#sessionUnsubscribe?.();
    if (this.#activeTree) {
      this.#activeTree.session = session;
    }
    this.#sessionUnsubscribe = session.subscribe((status) => {
      if (session.draft) {
        this.#recoverableDraft = session.draft;
        this.#recoveryStore.setActiveDraft({
          token: session.draft.token,
          updatedAt: session.draft.updatedAt,
        });
      }
      this.#renderSessionStatus(status);
    });
  }

  #releaseActiveSession(): void {
    void this.#releaseActiveSessionAsync().catch((error) => {
      console.error("GeneaQuilt could not close the previous Local Tree session.", error);
    });
  }

  async #releaseActiveSessionAsync(): Promise<void> {
    this.#sessionUnsubscribe?.();
    this.#sessionUnsubscribe = null;
    const session = this.#activeTree?.session ?? null;
    if (this.#activeTree) {
      this.#activeTree.session = null;
    }
    if (session) {
      await session.close();
    }
  }

  #syncActiveFromSession(): void {
    const active = this.#activeTree;
    const session = active?.session;
    if (!active || !session) {
      return;
    }
    active.document = session.snapshot.document;
    active.sourceGedcom = session.snapshot.source_gedcom;
    if (session.record) {
      active.kind = "local";
      active.id = session.record.id;
      active.title = session.record.title;
      active.sourceFileName = session.record.sourceFileName;
    }
    if (session.draft) {
      this.#recoverableDraft = session.draft;
    }
  }

  #renderSessionStatus(status = this.#activeTree?.session?.status): void {
    const node = this.#root.querySelector<HTMLElement>(".interactive-save-status");
    const session = this.#activeTree?.session;
    if (!node || !session || !status) {
      return;
    }
    const temporary = this.#activeTree?.kind === "temporary";
    const label = sessionStatusLabel(status, temporary);
    node.dataset.status = status.status;
    node.textContent = label;
    node.title = status.error?.message ?? label;
    const undo = this.#root.querySelector<HTMLButtonElement>(".history-undo");
    const redo = this.#root.querySelector<HTMLButtonElement>(".history-redo");
    if (undo) {
      undo.disabled = !session.canUndo || status.status === "saving";
    }
    if (redo) {
      redo.disabled = !session.canRedo || status.status === "saving";
    }
  }

  #preferredWholeTreeMethod(): string {
    const preferred = this.#recoveryStore.lastVisualizationMethod();
    const method = VISUALIZATION_METHODS.find(
      (candidate) => candidate.id === preferred && candidate.availability === "available",
    );
    return method && (method.scope === "whole" || method.scope === "aggregate")
      ? method.id
      : "geneaquilt";
  }

  #bindSharedHeader(): void {
    this.#root.querySelector(".site-theme-button")?.addEventListener("click", () => {
      this.#toggleTheme();
      if (this.#screen === "selection") {
        this.#renderSelection();
      } else {
        this.#renderHome();
      }
    });
    this.#root.querySelector(".site-brand")?.addEventListener("click", (event) => {
      event.preventDefault();
      this.#renderHome();
    });
  }

  #toggleTheme(): void {
    this.#theme = applyDocumentTheme(this.#theme === "dark" ? "light" : "dark", {
      persist: true,
    });
  }

  #bindLocalTreeActions(): void {
    this.#root.querySelector(".local-list")?.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-local-action]");
      const id = target?.dataset.localId;
      if (!target || !id) {
        return;
      }
      switch (target.dataset.localAction) {
        case "open":
          void this.#openLocalTree(id);
          break;
        case "export":
          void this.#openLocalExport(id);
          break;
        case "rename":
          void this.#renameLocalTree(id);
          break;
        case "delete":
          void this.#confirmDeleteLocalTree(id);
          break;
      }
    });
  }

  async #openLocalTree(id: string): Promise<void> {
    this.#showBusy("Opening this Local Tree…");
    try {
      await this.#releaseActiveSessionAsync();
      const record = await markLocalTreeOpened(id);
      const session = await LocalTreeSession.openLocal(record, this.#documentWorker);
      this.#activeTree = activeTreeFromLocalRecord(record, session);
      this.#attachActiveSession(session);
      this.#recoveryStore.setLastLocalTreeId(record.id);
      this.#selectedMethodId = this.#preferredWholeTreeMethod();
      this.#focalPersonId = null;
      this.#secondaryFocalPersonId = null;
      this.#selectedPersonId = record.document.people[0]?.id ?? null;
      this.#goal = "whole-genealogy";
      this.#localTrees = await listLocalTrees();
      this.#interactiveReturnScreen = "home";
      this.#renderInteractive();
    } catch (error) {
      this.#hideBusy();
      this.#showError("This Local Tree could not be opened", error);
    }
  }

  async #openLocalExport(id: string): Promise<void> {
    const record = await getLocalTree(id);
    if (!record) {
      this.#showError("Local Tree not found", "It may have been deleted in another tab.");
      return;
    }
    this.#showLocalExportDialog(record);
  }

  async #renameLocalTree(id: string): Promise<void> {
    const summary = this.#localTrees.find((tree) => tree.id === id);
    const title = window.prompt("Rename this Local Tree", summary?.title ?? "");
    if (title == null) {
      return;
    }
    try {
      await renameLocalTree(id, title);
      this.#localTrees = await listLocalTrees();
      this.#renderHome();
    } catch (error) {
      this.#showError("This Local Tree could not be renamed", error);
    }
  }

  async #confirmDeleteLocalTree(id: string): Promise<void> {
    const summary = this.#localTrees.find((tree) => tree.id === id);
    if (!summary) {
      return;
    }
    const dialog = this.#openDialog(`
      <div class="dialog-icon danger">${icon("trash")}</div>
      <h2>Delete “${escapeHtml(summary.title)}”?</h2>
      <p>This removes ${formatNumber(summary.people)} people and ${formatNumber(summary.families)} Families from Local Trees on this device. It cannot be undone.</p>
      <p><strong>Export the Source GEDCOM first</strong> if you do not have another copy.</p>
      <div class="dialog-actions">
        <button class="button export-first" type="button">${icon("export")}Export first</button>
        <button class="button" value="cancel" type="button">Cancel</button>
        <button class="button button-danger confirm-delete" type="button">Delete permanently</button>
      </div>
    `);
    dialog.querySelector(".export-first")?.addEventListener("click", () => {
      void this.#openLocalExport(id);
    });
    dialog.querySelector('[value="cancel"]')?.addEventListener("click", () => dialog.close());
    dialog.querySelector(".confirm-delete")?.addEventListener("click", async () => {
      try {
        await deleteLocalTree(id);
        dialog.close();
        this.#localTrees = await listLocalTrees();
        this.#renderHome();
      } catch (error) {
        dialog.close();
        this.#showError("This Local Tree could not be deleted", error);
      }
    });
  }

  #showLocalExportDialog(record: LocalTreeRecord): void {
    const dialog = this.#openDialog(`
      <div class="dialog-icon">${icon("export")}</div>
      <h2>Export &amp; Share “${escapeHtml(record.title)}”</h2>
      <p>These actions create or share a local file. GeneaQuilt does not upload it or create a hosted link.</p>
      <div class="privacy-warning">${icon("warning")}The GEDCOM contains private family information. Share it only with people you trust.</div>
      <div class="dialog-actions stacked">
        <button class="button button-primary download-gedcom-7" type="button">${icon("file")}Download GEDCOM 7 <small>Preferred for current genealogy software</small></button>
        <button class="button download-gedcom-551" type="button">${icon("file")}Download GEDCOM 5.5.1 <small>Compatibility copy for older software</small></button>
        ${typeof navigator.share === "function" ? `<button class="button share-gedcom-7" type="button">${icon("export")}Share GEDCOM 7 with this device</button>` : ""}
        <button class="button" value="cancel" type="button">Close</button>
      </div>
    `);
    dialog.querySelector(".download-gedcom-7")?.addEventListener("click", () => {
      dialog.close();
      void this.#exportStoredGedcom(record, "v7", false);
    });
    dialog.querySelector(".download-gedcom-551")?.addEventListener("click", () => {
      dialog.close();
      void this.#exportStoredGedcom(record, "v551", false);
    });
    dialog.querySelector(".share-gedcom-7")?.addEventListener("click", () => {
      dialog.close();
      void this.#exportStoredGedcom(record, "v7", true);
    });
    dialog.querySelector('[value="cancel"]')?.addEventListener("click", () => dialog.close());
  }

  async #exportStoredGedcom(
    record: LocalTreeRecord,
    version: "v7" | "v551",
    share: boolean,
  ): Promise<void> {
    this.#showBusy(`Preparing ${version === "v7" ? "GEDCOM 7" : "GEDCOM 5.5.1"}…`);
    let handle: number | null = null;
    try {
      const opened = await this.#documentWorker.openEditable(record.sourceGedcom);
      handle = opened.handle;
      const result = await this.#documentWorker.exportEditable(opened.handle, version);
      await this.#documentWorker.closeEditable(opened.handle);
      handle = null;
      this.#hideBusy();
      this.#deliverGedcomExport(result, record.title, record.sourceFileName, share);
    } catch (error) {
      if (handle !== null) {
        await this.#documentWorker.closeEditable(handle).catch((closeError) => {
          console.error("GeneaQuilt could not close an export session.", closeError);
        });
      }
      this.#hideBusy();
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        this.#showError("The GEDCOM could not be exported", error);
      }
    }
  }

  #showInteractiveExportDialog(): void {
    const active = this.#requireActiveTree();
    const isAdam = active.kind === "adam";
    const support = getMethodExportSupport(this.#selectedMethodId);
    const canExportHtml =
      !isAdam && Boolean(active.sourceGedcom) && support?.standaloneHtml === true;
    const dialog = this.#openDialog(`
      <div class="dialog-icon">${icon("export")}</div>
      <h2>Export &amp; Share</h2>
      <p>Every export is created on this device. No hosted link is made.</p>
      ${isAdam ? `<div class="policy-note">Adam HaRishon's Source GEDCOM and standalone interactive HTML are not offered. Charts, reports, images, and PDFs are allowed.</div>` : `<div class="privacy-warning">${icon("warning")}Standalone files can contain private family information.</div>`}
      <div class="export-grid">
        <button class="export-option export-png" type="button" ${support?.png ? "" : "disabled"}>${icon("file")}<strong>Current view PNG</strong><span>Image with title and attribution</span></button>
        <button class="export-option export-current-pdf" type="button" ${support?.currentViewPdf ? "" : "disabled"}>${icon("file")}<strong>Current-view PDF</strong><span>Fits what you see onto one local PDF page</span></button>
        <button class="export-option export-complete-pdf" type="button" ${support?.completeDiagramPdf ? "" : "disabled"}>${icon("fit")}<strong>Complete-diagram PDF</strong><span>One oversized page with the whole diagram</span></button>
        <button class="export-option export-poster" type="button" ${support?.tiledPosterPdf ? "" : "disabled"}>${icon("method")}<strong>Tiled Poster PDF</strong><span>Letter, A4, or A3 pages for manual assembly</span></button>
        <button class="export-option export-print" type="button" ${support?.print ? "" : "disabled"}>${icon("fit")}<strong>Print current view</strong><span>Use the browser's local print dialog</span></button>
        <button class="export-option export-gedcom-7" type="button" ${isAdam ? "disabled" : ""}>${icon("file")}<strong>GEDCOM 7</strong><span>${isAdam ? "Available by request only" : "Preferred editable family tree file"}</span></button>
        <button class="export-option export-gedcom-551" type="button" ${isAdam ? "disabled" : ""}>${icon("file")}<strong>GEDCOM 5.5.1</strong><span>${isAdam ? "Available by request only" : "Compatibility copy for older software"}</span></button>
        <button class="export-option export-html" type="button" ${canExportHtml ? "" : "disabled"}>${icon("method")}<strong>Interactive HTML</strong><span>${isAdam ? "Disabled by creator policy" : support?.standaloneHtml ? "Portable local interactive view" : "This method does not declare a standalone format"}</span></button>
      </div>
      <div class="dialog-actions"><button class="button" value="cancel" type="button">Close</button></div>
    `);
    dialog.querySelector(".export-png")?.addEventListener("click", () => {
      dialog.close();
      void this.#exportCurrentPng();
    });
    dialog.querySelector(".export-current-pdf")?.addEventListener("click", () => {
      dialog.close();
      void this.#exportPdf("current");
    });
    dialog.querySelector(".export-complete-pdf")?.addEventListener("click", () => {
      dialog.close();
      void this.#exportPdf("complete");
    });
    dialog.querySelector(".export-poster")?.addEventListener("click", () => {
      dialog.close();
      void this.#openTiledPosterDialog();
    });
    dialog.querySelector(".export-print")?.addEventListener("click", () => window.print());
    dialog.querySelector(".export-gedcom-7")?.addEventListener("click", () => {
      dialog.close();
      void this.#exportActiveGedcom("v7");
    });
    dialog.querySelector(".export-gedcom-551")?.addEventListener("click", () => {
      dialog.close();
      void this.#exportActiveGedcom("v551");
    });
    dialog.querySelector(".export-html")?.addEventListener("click", () => {
      if (!canExportHtml) {
        return;
      }
      const confirmed = window.confirm(
        "This standalone HTML contains family information. Save it only if you understand that anyone with the file can read it.",
      );
      if (!confirmed) {
        return;
      }
      const html = this.#currentView?.exportInteractiveHtml(`${active.title} — GeneaQuilt`);
      if (html) {
        downloadText(html, `${fileStem(active.title)}-interactive.html`, "text/html;charset=utf-8");
      }
    });
    dialog.querySelector('[value="cancel"]')?.addEventListener("click", () => dialog.close());
  }

  async #exportActiveGedcom(version: "v7" | "v551"): Promise<void> {
    const active = this.#requireActiveTree();
    const session = active.session;
    if (!session) {
      this.#showError("GEDCOM export is not available", "This built-in genealogy is read-only.");
      return;
    }
    this.#showBusy(`Preparing ${version === "v7" ? "GEDCOM 7" : "GEDCOM 5.5.1"}…`);
    try {
      const result = await session.export(version);
      this.#hideBusy();
      this.#deliverGedcomExport(
        result,
        active.title,
        active.sourceFileName ?? `${fileStem(active.title)}.ged`,
        false,
      );
    } catch (error) {
      this.#hideBusy();
      this.#showError("The GEDCOM could not be exported", error);
    }
  }

  #deliverGedcomExport(
    result: EditableGedcomExport,
    title: string,
    sourceFileName: string,
    share: boolean,
  ): void {
    const filename = gedcomExportFilename(title, sourceFileName, result.version);
    const deliver = (): void => {
      const file = new File([result.source_gedcom], filename, {
        type: "text/plain;charset=utf-8",
      });
      if (!share) {
        downloadBlob(file, filename);
        return;
      }
      if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
        this.#showError(
          "This device cannot share the GEDCOM",
          "The browser does not offer file sharing here. Download the file instead.",
        );
        return;
      }
      void navigator.share({ title, files: [file] }).catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          this.#showError("This device could not share the GEDCOM", error);
        }
      });
    };
    if (!result.warnings.length) {
      deliver();
      return;
    }
    const dialog = this.#openDialog(`
      <div class="dialog-icon">${icon("warning")}</div>
      <h2>Compatibility notes</h2>
      <p>The family structure will export, with these format notes:</p>
      <ul class="export-warning-list">${result.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>
      <div class="dialog-actions">
        <button class="button" value="cancel" type="button">Cancel</button>
        <button class="button button-primary confirm-gedcom-export" type="button">Export anyway</button>
      </div>
    `);
    dialog.querySelector('[value="cancel"]')?.addEventListener("click", () => dialog.close());
    dialog.querySelector(".confirm-gedcom-export")?.addEventListener("click", () => {
      dialog.close();
      deliver();
    });
  }

  #showInteractiveMoreDialog(): void {
    const method = getVisualizationMethod(this.#selectedMethodId);
    const canChangeFocus = method.scope !== "whole" && method.scope !== "aggregate";
    const hasMethodTools = Boolean(this.#currentView?.renderMethodTools);
    const dialog = this.#openDialog(`
      <div class="dialog-icon">${icon("menu")}</div>
      <h2>Tree options</h2>
      <p>Open details about ${escapeHtml(method.shortName)} or export the current tree.</p>
      <div class="dialog-actions stacked">
        ${canChangeFocus ? `<button class="button mobile-change-focus" type="button">${icon("search")}Change focus</button>` : ""}
        ${hasMethodTools ? `<button class="button mobile-method-tools" type="button">${icon("method")}Method tools</button>` : ""}
        <button class="button mobile-text-view" type="button">${icon("search")}Text view &amp; keyboard guide</button>
        <button class="button mobile-method-details" type="button">${icon("info")}Method details</button>
        <button class="button button-primary mobile-export" type="button">${icon("export")}Export &amp; Share</button>
        <button class="button" value="cancel" type="button">Close</button>
      </div>
    `);
    dialog.querySelector(".mobile-change-focus")?.addEventListener("click", () => {
      dialog.close();
      void this.#changeInteractiveFocus();
    });
    dialog.querySelector(".mobile-method-details")?.addEventListener("click", () => {
      dialog.close();
      this.#showMethodDetails(method.id);
    });
    dialog.querySelector(".mobile-method-tools")?.addEventListener("click", () => {
      dialog.close();
      this.#showMethodTools();
    });
    dialog.querySelector(".mobile-text-view")?.addEventListener("click", () => {
      dialog.close();
      this.#showTextTreeDialog();
    });
    dialog.querySelector(".mobile-export")?.addEventListener("click", () => {
      dialog.close();
      this.#showInteractiveExportDialog();
    });
    dialog.querySelector('[value="cancel"]')?.addEventListener("click", () => dialog.close());
  }

  #showMethodTools(): void {
    const view = this.#currentView;
    if (!view?.renderMethodTools) {
      return;
    }
    const method = getVisualizationMethod(this.#selectedMethodId);
    const dialog = this.#openDialog(`
      <div class="dialog-icon">${icon("method")}</div>
      <h2>${escapeHtml(method.shortName)} tools</h2>
      <p>Fine-tune this method without crowding the main workspace.</p>
      <div class="method-tools-host" data-method-tools></div>
      <div class="dialog-actions"><button class="button button-primary" value="cancel" type="button">Done</button></div>
    `);
    dialog.classList.add("method-tools-dialog");
    const host = dialog.querySelector<HTMLElement>("[data-method-tools]");
    if (host) {
      view.renderMethodTools(host);
    }
    dialog.querySelector('[value="cancel"]')?.addEventListener("click", () => dialog.close());
  }

  #showTextTreeDialog(): void {
    const active = this.#requireActiveTree();
    const method = getVisualizationMethod(this.#selectedMethodId);
    const summary = this.#currentProjectionSummary;
    const counts = summary
      ? `${formatNumber(summary.visiblePeople)} of ${formatNumber(summary.totalPeople)} people and ${formatNumber(summary.visibleFamilies)} of ${formatNumber(summary.totalFamilies)} Families`
      : `${formatNumber(active.document.people.length)} people and ${formatNumber(active.document.families.length)} Families`;
    const dialog = this.#openDialog(`
      <div class="dialog-icon">${icon("search")}</div>
      <h2>Text view &amp; keyboard guide</h2>
      <p><strong>${escapeHtml(method.name)}</strong> shows ${counts}. ${escapeHtml(summary?.label ?? method.bestUse)}</p>
      ${summary ? `<p class="dialog-reading-rule">${escapeHtml(summary.rule)}</p>` : ""}
      <div class="keyboard-guide" aria-label="Keyboard controls">
        <h3>Keyboard controls</h3>
        <p>Tab reaches every toolbar control and every selectable person in SVG views. On the GeneaQuilt canvas, use the arrow keys to pan, plus or minus to zoom, and Home or 0 to fit the whole view.</p>
      </div>
      <label class="person-picker-search">
        ${icon("search")}<span class="visually-hidden">Search visible people for a relationship list</span>
        <input type="search" autocomplete="off" placeholder="Find a visible person" />
      </label>
      <div class="person-picker-results text-tree-results" aria-live="polite"><p>Search for a person to read their parents, husbands or wives, and children as text.</p></div>
      <div class="dialog-actions"><button class="button button-primary" value="cancel" type="button">Done</button></div>
    `);
    const input = dialog.querySelector<HTMLInputElement>(".person-picker-search input");
    const results = dialog.querySelector<HTMLElement>(".text-tree-results");
    input?.addEventListener("input", () => {
      if (!results || !this.#currentView) return;
      const matches = this.#currentView.search(input.value);
      results.innerHTML = input.value.trim()
        ? matches.length
          ? matches
              .slice(0, 30)
              .map(
                (match) =>
                  `<button type="button" data-text-record="${escapeHtml(match.id)}"><strong>${escapeHtml(match.label)}</strong><span>Open relationship list</span></button>`,
              )
              .join("")
          : `<p>No matching visible people.</p>`
        : `<p>Search for a person to read their parents, husbands or wives, and children as text.</p>`;
    });
    results?.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-text-record]");
      if (!button?.dataset.textRecord) return;
      this.#currentView?.select(button.dataset.textRecord, true);
      dialog.close();
    });
    dialog.querySelector('[value="cancel"]')?.addEventListener("click", () => dialog.close());
    input?.focus();
  }

  async #exportCurrentPng(): Promise<void> {
    const active = this.#requireActiveTree();
    const view = this.#currentView;
    if (!view) {
      return;
    }
    try {
      const source = await view.exportPng("current");
      const credited = await addPngCredit(
        source,
        exportCredit(active),
        shortProjectionSummary(this.#currentProjectionSummary),
      );
      downloadBlob(credited, `${fileStem(active.title)}-${this.#selectedMethodId}.png`);
    } catch (error) {
      this.#showError("The PNG could not be created", error);
    }
  }

  async #exportPdf(mode: "current" | "complete"): Promise<void> {
    const active = this.#requireActiveTree();
    const view = this.#currentView;
    if (!view) {
      this.#showError("The PDF could not be created", "The visualization is not ready yet.");
      return;
    }
    const label = mode === "current" ? "current view" : "complete diagram";
    this.#showBusy(`Creating a local PDF of the ${label}…`);
    try {
      const png = await view.exportPng(mode);
      const metadata = visualizationExportMetadata(
        active,
        getVisualizationMethod(this.#selectedMethodId).name,
        this.#currentProjectionSummary,
      );
      const pdf =
        mode === "current"
          ? await createCurrentViewPdf(png, metadata)
          : await createCompleteDiagramPdf(png, metadata);
      downloadBlob(
        pdf,
        `${fileStem(active.title)}-${this.#selectedMethodId}-${mode === "current" ? "current-view" : "complete-diagram"}.pdf`,
      );
    } catch (error) {
      this.#showError("The PDF could not be created", error);
    } finally {
      this.#hideBusy();
    }
  }

  async #openTiledPosterDialog(): Promise<void> {
    const view = this.#currentView;
    if (!view) {
      this.#showError("The poster could not be prepared", "The visualization is not ready yet.");
      return;
    }
    this.#showBusy("Preparing the complete diagram for a tiled poster…");
    try {
      const png = await view.exportPng("complete");
      const dimensions = await readPngDimensions(png);
      this.#hideBusy();
      this.#showTiledPosterSettings(png, dimensions);
    } catch (error) {
      this.#hideBusy();
      this.#showError("The poster could not be prepared", error);
    }
  }

  #showTiledPosterSettings(
    png: Blob,
    dimensions: Readonly<{ width: number; height: number }>,
  ): void {
    const active = this.#requireActiveTree();
    const dialog = this.#openDialog(`
      <div class="dialog-icon">${icon("method")}</div>
      <h2>Tiled Poster PDF</h2>
      <p>Split the complete diagram into numbered pages for manual assembly. Page order runs left to right, then top to bottom.</p>
      <form class="poster-settings">
        <label>Paper
          <select name="paper">
            <option value="letter">US Letter</option>
            <option value="a4">A4</option>
            <option value="a3">A3</option>
          </select>
        </label>
        <label>Orientation
          <select name="orientation">
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
          </select>
        </label>
        <label>Diagram scale
          <select name="scale">
            <option value="75">75%</option>
            <option value="100" selected>100%</option>
            <option value="125">125%</option>
            <option value="150">150%</option>
          </select>
        </label>
        <label>Overlap
          <span class="poster-overlap-value">10 mm</span>
          <input name="overlap" type="range" min="0" max="30" step="1" value="10" />
        </label>
        <label class="poster-check"><input name="crop" type="checkbox" checked /> Crop marks</label>
        <label class="poster-check"><input name="coordinates" type="checkbox" checked /> Page coordinates</label>
      </form>
      <section class="poster-preview" aria-live="polite">
        <div class="poster-preview-heading"><strong>Assembly preview</strong><span>${formatNumber(dimensions.width)} × ${formatNumber(dimensions.height)} px source</span></div>
        <div class="poster-preview-grid"></div>
        <p class="poster-preview-summary"></p>
      </section>
      <div class="dialog-actions">
        <button class="button" value="cancel" type="button">Cancel</button>
        <button class="button button-primary generate-poster" type="button">Create Poster PDF</button>
      </div>
    `);
    const form = dialog.querySelector<HTMLFormElement>(".poster-settings");
    const grid = dialog.querySelector<HTMLElement>(".poster-preview-grid");
    const summary = dialog.querySelector<HTMLElement>(".poster-preview-summary");
    const overlapLabel = dialog.querySelector<HTMLElement>(".poster-overlap-value");
    const createButton = dialog.querySelector<HTMLButtonElement>(".generate-poster");
    if (!form || !grid || !summary || !overlapLabel || !createButton) {
      dialog.close();
      this.#showError("The poster controls could not open", "Required controls are missing.");
      return;
    }

    const readOptions = (): TiledPosterOptions => {
      const data = new FormData(form);
      return {
        paperSize: parsePaperSize(data.get("paper")),
        orientation: parsePaperOrientation(data.get("orientation")),
        overlapMm: Number(data.get("overlap")),
        scalePercent: Number(data.get("scale")),
        cropMarks: data.get("crop") === "on",
        pageCoordinates: data.get("coordinates") === "on",
      };
    };
    const updatePreview = (): void => {
      const options = readOptions();
      overlapLabel.textContent = `${options.overlapMm} mm`;
      try {
        const plan = calculatePosterPlan(dimensions.width, dimensions.height, options);
        grid.style.setProperty("--poster-columns", String(plan.columns));
        grid.style.setProperty("--poster-rows", String(plan.rows));
        grid.style.aspectRatio = `${plan.columns * plan.pageWidth} / ${plan.rows * plan.pageHeight}`;
        grid.innerHTML = plan.tiles
          .map(
            (tile) =>
              `<span title="Row ${tile.row + 1}, column ${tile.column + 1}">${tile.pageNumber}</span>`,
          )
          .join("");
        summary.textContent = `${plan.columns} columns × ${plan.rows} rows · ${formatNumber(plan.pageCount)} pages total · ${options.overlapMm} mm overlap`;
        createButton.disabled = false;
      } catch (error) {
        grid.replaceChildren();
        summary.textContent = error instanceof Error ? error.message : String(error);
        createButton.disabled = true;
      }
    };
    form.addEventListener("input", updatePreview);
    form.addEventListener("change", updatePreview);
    updatePreview();

    createButton.addEventListener("click", async () => {
      const options = readOptions();
      const plan = calculatePosterPlan(dimensions.width, dimensions.height, options);
      dialog.close();
      this.#showBusy(`Creating ${formatNumber(plan.pageCount)} local poster pages…`);
      try {
        const metadata = visualizationExportMetadata(
          active,
          getVisualizationMethod(this.#selectedMethodId).name,
          this.#currentProjectionSummary,
        );
        const result = await createTiledPosterPdf(png, metadata, options);
        downloadBlob(
          result.blob,
          `${fileStem(active.title)}-${this.#selectedMethodId}-poster-${options.paperSize}-${options.orientation}.pdf`,
        );
      } catch (error) {
        this.#showError("The tiled poster could not be created", error);
      } finally {
        this.#hideBusy();
      }
    });
    dialog.querySelector('[value="cancel"]')?.addEventListener("click", () => dialog.close());
  }

  #showMethodDetails(methodId: string): void {
    const method = getVisualizationMethod(methodId);
    const evidence = getMethodEvidence(methodId);
    const performance = getMethodPerformance(methodId);
    const exportSupport = getMethodExportSupport(methodId);
    const sources = method.sources
      .map(
        (source) =>
          `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)}</a>`,
      )
      .join("");
    const dialog = this.#openDialog(`
      <span class="availability ${method.availability}">${method.availability === "available" ? "Available" : "In development"}</span>
      <h2>${escapeHtml(method.name)}</h2>
      <dl class="method-detail-list">
        <div><dt>Best use</dt><dd>${escapeHtml(method.bestUse)}</dd></div>
        <div><dt>Limit</dt><dd>${escapeHtml(method.limitations)}</dd></div>
        <div><dt>Scope</dt><dd>${methodScopeLabel(method)}</dd></div>
        <div><dt>Practical scale</dt><dd>${escapeHtml(method.practicalScale.replace("-", " "))}</dd></div>
      </dl>
      ${evidence ? `<details class="method-audit"><summary>${evidence.status === "verified" ? "Accuracy review" : "Review still required"}</summary><div><h3>Checked against</h3><ul>${evidence.checkedAgainst.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><h3>Invariants tested</h3><ul>${evidence.invariants.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul><h3>Web version</h3><p>${escapeHtml(evidence.webDifferences)}</p></div></details>` : ""}
      ${performance ? `<details class="method-audit"><summary>Measured scale evidence</summary><div><p><strong>${formatNumber(performance.people)}-person deterministic fixture:</strong> ${performance.milliseconds.toFixed(2)} ms for scene construction; ${formatNumber(performance.nodes)} nodes and ${formatNumber(performance.edges)} edges produced.</p><p>${escapeHtml(performance.interpretation)}</p><small>Local baseline: Apple M4 Pro, Node 26. Large fixtures use one measured run; smaller fixtures use the median of three. Browser paint and interaction are audited separately.</small></div></details>` : ""}
      ${exportSupport ? `<details class="method-audit"><summary>Declared export support</summary><div class="method-export-contract">${methodExportContract(exportSupport)}</div></details>` : ""}
      <div class="research-links"><h3>Research and original work</h3>${sources}</div>
      ${method.availability === "in-development" ? `<p class="policy-note">Ratings remain “Review pending” and this method cannot be selected until its Native Visualization passes mathematical and visual review.</p>` : ""}
      <div class="dialog-actions"><button class="button button-primary" value="cancel" type="button">Done</button></div>
    `);
    dialog.querySelector('[value="cancel"]')?.addEventListener("click", () => dialog.close());
  }

  #showError(title: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const dialog = this.#openDialog(`
      <div class="dialog-icon danger">${icon("warning")}</div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
      <div class="dialog-actions"><button class="button button-primary" value="cancel" type="button">Close</button></div>
    `);
    dialog.querySelector('[value="cancel"]')?.addEventListener("click", () => dialog.close());
  }

  #openDialog(content: string): HTMLDialogElement {
    const dialog = document.createElement("dialog");
    dialog.className = "app-dialog";
    dialog.innerHTML = `<div class="dialog-body"><button class="icon-button dialog-close" type="button" aria-label="Close">${icon("close")}</button>${content}</div>`;
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    dialog.querySelector(".dialog-close")?.addEventListener("click", () => dialog.close());
    document.body.append(dialog);
    dialog.showModal();
    return dialog;
  }

  #showBusy(message: string): void {
    this.#hideBusy();
    const busy = document.createElement("div");
    busy.className = "busy-overlay";
    busy.dataset.busyOverlay = "";
    busy.innerHTML = `<div class="busy-card" role="status" aria-live="polite">${brandMark()}<strong>${escapeHtml(message)}</strong><span>All processing stays on this device.</span></div>`;
    document.body.append(busy);
  }

  #hideBusy(): void {
    document.querySelector("[data-busy-overlay]")?.remove();
  }

  #requireAdam(): LoadedAdamDocument {
    if (!this.#adam) {
      throw new Error("Adam HaRishon's Tree is not loaded.");
    }
    return this.#adam;
  }

  #requireActiveTree(): ActiveTree {
    if (!this.#activeTree) {
      throw new Error("No Genealogy Document is active.");
    }
    return this.#activeTree;
  }
}

function localTreeRow(tree: LocalTreeSummary): string {
  return `
    <article class="local-row">
      <div class="local-row-mark">${brandMark()}</div>
      <div class="local-row-title"><strong>${escapeHtml(tree.title)}</strong><span>${formatNumber(tree.people)} people · last opened ${formatRelativeDate(tree.lastOpenedAt)}</span></div>
      <button class="button" type="button" data-local-action="open" data-local-id="${tree.id}">${icon("folder")}Open</button>
      <button class="button" type="button" data-local-action="export" data-local-id="${tree.id}">${icon("export")}Export &amp; Share</button>
      <details class="row-menu">
        <summary class="icon-button" aria-label="More actions for ${escapeHtml(tree.title)}">${icon("menu")}</summary>
        <div>
          <button class="row-menu-mobile-action" type="button" data-local-action="open" data-local-id="${tree.id}">${icon("folder")}Open</button>
          <button class="row-menu-mobile-action" type="button" data-local-action="export" data-local-id="${tree.id}">${icon("export")}Export &amp; Share</button>
          <button type="button" data-local-action="rename" data-local-id="${tree.id}">Rename</button>
          <button class="danger-text" type="button" data-local-action="delete" data-local-id="${tree.id}">${icon("trash")}Delete</button>
        </div>
      </details>
    </article>
  `;
}

function homePreviewMethodOptions(selectedMethodId: string): string {
  return HOME_PREVIEW_METHOD_GROUPS.map(
    (group) => `
      <optgroup label="${escapeHtml(group.label)}">
        ${group.methodIds
          .map((methodId) => {
            const method = getVisualizationMethod(methodId);
            return `<option value="${method.id}" ${method.id === selectedMethodId ? "selected" : ""}>${escapeHtml(method.shortName)}</option>`;
          })
          .join("")}
      </optgroup>`,
  ).join("");
}

function analysisMetric(value: string, label: string): string {
  return `<div class="analysis-metric"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`;
}

function sourceProfileEntries(entries: Record<string, number>): string {
  const values = Object.entries(entries)
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, count]) => `${name} × ${formatNumber(count)}`);
  return values.length ? values.join(", ") : "None";
}

function validationFinding(finding: CanonicalDocument["analysis"]["findings"][number]): string {
  return `<article class="finding ${finding.severity}">${icon(finding.severity === "error" ? "warning" : "info")}<div><strong>${escapeHtml(finding.title)}</strong><p>${escapeHtml(finding.message)}</p>${finding.corrective_action ? `<span>${escapeHtml(finding.corrective_action)}</span>` : ""}</div></article>`;
}

function blockingAnalysisBanner(findings: CanonicalDocument["analysis"]["findings"]): string {
  const count = findings.filter((finding) => finding.blocks_interactive).length;
  return `<section class="blocking-banner">${icon("warning")}<div><strong>Interactive Mode is paused</strong><p>${count} blocking relationship ${count === 1 ? "error needs" : "errors need"} correction in the genealogy program that created this GEDCOM. GeneaQuilt will not guess which parent link to remove.</p></div></section>`;
}

function focusPickerCopy(methodId: string): { title: string; prompt: string } {
  switch (methodId) {
    case "pedigree":
      return {
        title: "Whose ancestors should this show?",
        prompt: "Choose the person who belongs at the beginning of the pedigree.",
      };
    case "hourglass":
      return {
        title: "Who belongs in the center?",
        prompt: "Choose the person whose ancestors and descendants should form the hourglass.",
      };
    case "dual-tree":
      return {
        title: "Choose the descendant end",
        prompt:
          "Choose the later person whose recorded ancestors should form one side of the dual tree.",
      };
    case "area-adaptive":
      return {
        title: "Where should the descendant tree begin?",
        prompt: "Choose the root person for this descendants-only, page-fitting tree.",
      };
    default:
      return {
        title: "Choose a focal person",
        prompt:
          "This method shows a rooted part of the genealogy, so it needs one starting person.",
      };
  }
}

function ancestorCandidates(
  document: CanonicalDocument,
  descendantPersonId: string,
): CanonicalDocument["people"] {
  const parentsByChild = new Map<string, string[]>();
  const knownPeople = new Set(document.people.map((person) => person.id));
  for (const family of document.families) {
    const parents = [family.husband_id, family.wife_id].filter((id): id is string =>
      Boolean(id && knownPeople.has(id)),
    );
    for (const childId of family.child_ids) {
      if (!knownPeople.has(childId)) {
        continue;
      }
      const values = parentsByChild.get(childId) ?? [];
      for (const parentId of parents) {
        if (!values.includes(parentId)) {
          values.push(parentId);
        }
      }
      parentsByChild.set(childId, values);
    }
  }
  const visited = new Set<string>([descendantPersonId]);
  const queue = [descendantPersonId];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const personId = queue[cursor];
    if (!personId) {
      continue;
    }
    for (const parentId of parentsByChild.get(personId) ?? []) {
      if (!visited.has(parentId)) {
        visited.add(parentId);
        queue.push(parentId);
      }
    }
  }
  visited.delete(descendantPersonId);
  return document.people
    .filter((person) => visited.has(person.id))
    .sort(
      (left, right) =>
        left.display_name.localeCompare(right.display_name) || left.id.localeCompare(right.id),
    );
}

function methodChoiceCard(
  method: VisualizationMethodDefinition,
  reasons: string[],
  cautions: string[],
  selectedMethodId: string,
  label: string,
): string {
  return `
    <article class="method-choice ${selectedMethodId === method.id ? "is-selected" : ""}">
      <label class="method-choice-select">
        <span class="method-radio"><input type="radio" name="method" value="${method.id}" ${selectedMethodId === method.id ? "checked" : ""}/><span></span></span>
        <span class="method-choice-copy">
          <span class="fit-label">${escapeHtml(label)}</span>
          <h3>${escapeHtml(method.shortName)}</h3>
          <span class="method-choice-reason">${escapeHtml(reasons[0] ?? method.bestUse)}</span>
          ${cautions.length ? `<span class="method-caution">${escapeHtml(cautions[0] ?? "")}</span>` : ""}
        </span>
      </label>
      <div class="method-choice-meta"><span>${method.scope === "whole" ? "Whole-dataset View" : "Focused Projection"}</span><span>${escapeHtml(method.practicalScale.replace("-", " "))} scale</span></div>
      <button class="text-button" type="button" data-method-details="${method.id}">Method details</button>
    </article>
  `;
}

function methodListRow(
  method: VisualizationMethodDefinition,
  selectable: boolean,
  selectedMethodId: string,
  caution: string | null,
): string {
  return `
    <article class="method-row ${selectable ? "" : "is-disabled"}">
      <label><input type="radio" name="method" value="${method.id}" ${selectedMethodId === method.id ? "checked" : ""} ${selectable ? "" : "disabled"}/><span><strong>${escapeHtml(method.shortName)}</strong><small>${escapeHtml(method.bestUse)}</small></span></label>
      <span class="availability ${method.availability}">${method.availability === "available" ? "Available" : "In development"}</span>
      ${caution ? `<span class="row-caution">${escapeHtml(caution)}</span>` : ""}
      <button class="text-button" type="button" data-method-details="${method.id}">Method details</button>
    </article>
  `;
}

function goalOptions(selected: UserGoal): string {
  const goals: Array<[UserGoal, string]> = [
    ["whole-genealogy", "Whole genealogy"],
    ["ancestors", "Ancestors"],
    ["descendants", "Descendants"],
    ["neighborhood", "One person's neighborhood"],
    ["chronology", "Chronology"],
    ["printing", "Printing"],
    ["comparison", "Comparison"],
  ];
  return goals
    .map(
      ([value, label]) =>
        `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`,
    )
    .join("");
}

function saveChoice(saveMode: SaveMode): string {
  return `
    <fieldset class="save-choice card">
      <legend>After opening</legend>
      <label><input type="radio" name="save-mode" value="save" ${saveMode === "save" ? "checked" : ""}/><span><strong>Keep in Local Trees</strong><small>Open it later on this device. You can delete it individually.</small></span></label>
      <label><input type="radio" name="save-mode" value="temporary" ${saveMode === "temporary" ? "checked" : ""}/><span><strong>Open without saving</strong><small>Keep it only for this visit.</small></span></label>
    </fieldset>
  `;
}

function savedTreeNotice(active: ActiveTree): string {
  if (active.kind === "adam") {
    return `<p class="saved-notice">${icon("info")}This creator-owned built-in tree is separate from your Local Trees.</p>`;
  }
  return `<p class="saved-notice">${icon("check")}This tree is kept in Local Trees on this device.</p>`;
}

function activeTreeFromLocalRecord(
  record: LocalTreeRecord,
  session: LocalTreeSession | null = null,
): ActiveTree {
  return {
    kind: "local",
    id: record.id,
    title: record.title,
    document: record.document,
    sourceGedcom: record.sourceGedcom,
    sourceFileName: record.sourceFileName,
    adamManifest: null,
    session,
  };
}

function relationshipSection(title: string, values: string[]): string {
  return `<section class="record-relations"><h3>${escapeHtml(title)}</h3>${values.length ? `<ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>` : `<p>None recorded</p>`}</section>`;
}

function formatDateRange(start: number | null, end: number | null): string {
  if (start == null && end == null) {
    return "";
  }
  return `<p class="record-dates">${start ?? "?"}${end != null && end !== start ? `–${end}` : ""}</p>`;
}

function methodScopeLabel(method: VisualizationMethodDefinition): string {
  switch (method.scope) {
    case "whole":
      return "Whole-dataset View";
    case "focus":
      return "Focused View";
    case "projection":
      return "Rooted Projection";
    case "aggregate":
      return "Aggregate View";
  }
}

function methodExportContract(
  support: NonNullable<ReturnType<typeof getMethodExportSupport>>,
): string {
  const entries: Array<[string, boolean]> = [
    ["PNG image", support.png],
    ["Print", support.print],
    ["Standalone HTML", support.standaloneHtml],
    ["Current-view PDF", support.currentViewPdf],
    ["Complete-diagram PDF", support.completeDiagramPdf],
    ["Tiled Poster PDF", support.tiledPosterPdf],
  ];
  return entries
    .map(
      ([label, available]) =>
        `<span class="${available ? "is-supported" : "is-pending"}">${available ? "Yes" : "Not yet"} · ${escapeHtml(label)}</span>`,
    )
    .join("");
}

function exportCredit(active: ActiveTree): string {
  if (active.adamManifest) {
    return `${active.title} · ${active.adamManifest.creator.credit} · version ${active.adamManifest.version} · geneaquilt-new.pages.dev`;
  }
  return `${active.title} · Created locally with GeneaQuilt · geneaquilt-new.pages.dev`;
}

function visualizationExportMetadata(
  active: ActiveTree,
  methodName: string,
  projection: VisualizationProjectionSummary | null,
): ExportMetadata {
  return {
    title: active.title,
    methodName,
    credit: active.adamManifest?.creator.credit ?? "Local GEDCOM supplied by this device's user",
    version: active.adamManifest?.version ?? null,
    siteAttribution: "GeneaQuilt · geneaquilt-new.pages.dev",
    summary: projection
      ? `${shortProjectionSummary(projection)}. ${projection.rule}`
      : `${active.document.people.length.toLocaleString()} people and ${active.document.families.length.toLocaleString()} Families.`,
  };
}

function shortProjectionSummary(summary: VisualizationProjectionSummary | null): string | null {
  if (!summary) return null;
  return `${summary.visiblePeople.toLocaleString()} of ${summary.totalPeople.toLocaleString()} people · ${summary.visibleFamilies.toLocaleString()} of ${summary.totalFamilies.toLocaleString()} Families · ${summary.label}`;
}

function parsePaperSize(value: FormDataEntryValue | null): PaperSizeId {
  if (value === "letter" || value === "a4" || value === "a3") {
    return value;
  }
  throw new Error("Choose Letter, A4, or A3 paper.");
}

function parsePaperOrientation(value: FormDataEntryValue | null): PaperOrientation {
  if (value === "portrait" || value === "landscape") {
    return value;
  }
  throw new Error("Choose portrait or landscape orientation.");
}

async function addPngCredit(source: Blob, credit: string, summary: string | null): Promise<Blob> {
  const image = await createImageBitmap(source);
  const footerHeight = summary ? 74 : 52;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height + footerHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("The browser could not prepare an attributed PNG.");
  }
  context.fillStyle = "#edf1ec";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);
  context.fillStyle = "#2d312b";
  context.font = "14px Avenir, sans-serif";
  context.textBaseline = "top";
  context.fillText(credit, 20, image.height + 15, Math.max(0, canvas.width - 40));
  if (summary) {
    context.fillStyle = "#5f665f";
    context.font = "12px Avenir, sans-serif";
    context.fillText(summary, 20, image.height + 40, Math.max(0, canvas.width - 40));
  }
  image.close();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("The browser could not encode the attributed PNG."));
      }
    }, "image/png");
  });
}

function downloadText(content: string, filename: string, type: string): void {
  downloadBlob(new Blob([content], { type }), filename);
}

function gedcomExportFilename(
  title: string,
  sourceFileName: string,
  version: EditableGedcomExport["version"],
): string {
  if (version === "v551") {
    return `${fileStem(title)}-gedcom-5.5.1.ged`;
  }
  const preferred = sourceFileName.replace(/\.(ged|gedcom|txt)$/i, "").trim();
  return `${preferred || fileStem(title)}.ged`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function titleFromFilename(filename: string): string {
  return filename.replace(/\.(ged|gedcom|txt)$/i, "").trim() || "Untitled family tree";
}

function fileStem(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "geneaquilt"
  );
}

function formatRelativeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "recently";
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function sessionStatusLabel(status: LocalTreeSessionStatus, temporary: boolean): string {
  switch (status.status) {
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved on this device";
    case "unsaved":
      return temporary ? "Session draft" : "Unsaved";
    case "error":
      return "Save interrupted";
  }
}

function isRelativeKind(value: string | undefined): value is RelativeKind {
  return value === "parent" || value === "spouse" || value === "child" || value === "sibling";
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function optionalNumber(value: number | null): string {
  return value == null ? "Unavailable" : formatNumber(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
