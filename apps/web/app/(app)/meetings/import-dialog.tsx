"use client";

import { Button, Dialog, Input, InfoNote, Select } from "@/components/ui";
import { ASSISTANT_NAME } from "@/lib/brand";
import type { MeetingImportResponse } from "@brainchain/shared";
import * as React from "react";

/** Local, narrower than the shared `Classification` type — this dialog only
 * needs enough to label and order the options. */
type ClassificationOption = { id: string; level: number; name: string };

export function ImportTranscriptDialog({
  open,
  onClose,
  classifications,
  onImported,
  importFn,
}: {
  open: boolean;
  onClose: () => void;
  classifications: ClassificationOption[];
  onImported: (result: MeetingImportResponse) => void;
  importFn: (form: FormData) => Promise<MeetingImportResponse>;
}) {
  const [title, setTitle] = React.useState("");
  const [project, setProject] = React.useState("");
  const [classificationId, setClassificationId] = React.useState(classifications[0]?.id ?? "");
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!classificationId && classifications[0]) setClassificationId(classifications[0].id);
  }, [classificationId, classifications]);

  const canSubmit = !!file && !!title.trim() && !!classificationId && !busy;

  async function submit() {
    if (!canSubmit || !file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("title", title.trim());
    form.append("classification_id", classificationId);
    if (project.trim()) form.append("project", project.trim());
    try {
      const result = await importFn(form);
      onImported(result);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Import meeting transcript">
      <div className="space-y-3">
        <div>
          <label htmlFor="import-title" className="mb-1 block text-xs font-medium text-ink-2">
            Title
          </label>
          <Input
            id="import-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Weekly program review"
          />
        </div>
        <div>
          <label htmlFor="import-project" className="mb-1 block text-xs font-medium text-ink-2">
            Project (optional)
          </label>
          <Input
            id="import-project"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            placeholder="e.g. Phoenix"
          />
        </div>
        <div>
          <label htmlFor="import-classification" className="mb-1 block text-xs font-medium text-ink-2">
            Classification
          </label>
          <Select
            id="import-classification"
            value={classificationId}
            onChange={(e) => setClassificationId(e.target.value)}
            className="w-full"
          >
            {classifications.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor="import-file" className="mb-1 block text-xs font-medium text-ink-2">
            Transcript file
          </label>
          <input
            id="import-file"
            type="file"
            accept=".vtt,.txt"
            aria-label="Transcript file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-xs text-ink-2 file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-panel file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink"
          />
        </div>
        <InfoNote tone="privacy">
          Zoom/Meet <code>.vtt</code> exports or &ldquo;Speaker: text&rdquo; <code>.txt</code> files.
          What {ASSISTANT_NAME} captures stays <strong>proposed</strong> until a reviewer approves it.
        </InfoNote>
        {error && (
          <p role="alert" className="text-xs text-crit">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button onClick={submit} disabled={!canSubmit}>
            {busy ? "Importing…" : "Import"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
